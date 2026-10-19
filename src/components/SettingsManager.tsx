import React, { useState, useEffect } from 'react';
import { 
  AppUser, 
  SeriesSettings, 
  POLineItem, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord,
  EmailAccessInvitation,
  SystemBackupPackage,
  ScreenId,
  ScreenAccessLevel,
  ScreenPermissions,
  DocumentIssueRecord
} from '../types';
import { 
  loadStoredUsers, 
  saveStoredUsers, 
  loadStoredSeriesConfig, 
  saveStoredSeriesConfig,
  formatSeriesNumber,
  getUserScreenPermission,
  getDefaultScreenPermissionsForRole,
  generateFourDigitPin,
  generateUniquePin,
  getUserPassword,
  setUserPassword,
  ensureUsersHaveUniquePasswords,
  loadStoredIssues,
  saveIssues
} from '../utils/storage';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { naturalCompare } from '../utils/naturalSort';
import { 
  loadStoredInvitations, 
  saveStoredInvitations, 
  generateEmailAccessLink, 
  getEmailInvitationText,
  getCurrentSessionUser,
  setCurrentSessionUser,
  canLoadDatabase,
  canExportDatabase,
  isAdminUser,
  toggleUserHoldStatus,
  regenerateUserPin,
  resetUserPassword,
  updateUserScreenPermission,
  getUserLoginInvitationText
} from '../utils/authService';
import { authHeaders, API_BASE } from '../utils/authToken';
import { 
  exportMasterExcelWorkbook, 
  exportFullSystemBackup, 
  validateBackupFile, 
  restoreSystemFromBackup 
} from '../utils/backupExportService';
import { 
  Users, 
  Settings, 
  Hash, 
  Upload, 
  Download, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  FileSpreadsheet, 
  Database, 
  Save, 
  UserCheck, 
  KeyRound, 
  Layers, 
  FileCheck2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Lock,
  LogIn,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Sliders,
  ExternalLink,
  Mail,
  Copy,
  Check,
  Clock,
  Archive,
  Cloud,
  CloudLightning,
  Eye,
  EyeOff,
  LogOut,
  Info,
  Globe,
  Share2,
  Maximize,
  Monitor,
  Smartphone
} from 'lucide-react';
import { getPublicAppBaseUrl, openInStandaloneWindow, toggleAppFullscreen } from '../utils/appInfoService';
import { TableExportToolbar } from './TableExportToolbar';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';

export const SYSTEM_SCREENS: { id: ScreenId; label: string; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Real-time metrics, pipeline analytics, executive summary' },
  { id: 'po_master', label: 'PO Master Data', description: 'Comprehensive PO line items and status registry' },
  { id: 'create_invoice', label: 'Record Invoice', description: 'Manual and PO-linked invoice data entry' },
  { id: 'invoices_db', label: 'Invoices Database', description: 'Tax invoices registry, print, voiding' },
  { id: 'issue_tracking', label: 'Issue Resolution Hub', description: 'Discrepancy investigation and resolution audit' },
  { id: 'delivery_notes', label: 'Delivery Notes (DN)', description: 'Goods received notes and logistics tracking' },
  { id: 'delivery_details', label: 'Delivery Details', description: 'Delivery notes database, registry, and audit' },
  { id: 'matching_report', label: '3-Way Matching Report', description: 'PO vs Delivery vs Invoiced variance audit' },
  { id: 'payments', label: 'Payments & Remittances', description: 'Payment vouchers, allocations, unallocated balances' },
  { id: 'ledger', label: 'PO Tracking Ledger', description: 'Cumulative deliveries, billed balances per line' },
  { id: 'settings', label: 'Settings & Access', description: 'Series numbers, database backups, user permissions' },
];

interface SettingsManagerProps {
  poLines: POLineItem[];
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  onUploadExcelPO: (file: File) => void;
  onDownloadTemplate: () => void;
  onResetData: () => void;
  onClearData: () => void;
  onClearPOs?: () => void;
  onSeriesConfigChanged?: () => void;
  onDataRestored?: (restored: {
    poLines: POLineItem[];
    invoices: InvoiceRecord[];
    deliveryNotes: DeliveryNoteRecord[];
    payments: PaymentRecord[];
    issues?: DocumentIssueRecord[];
  }) => void;
  onSheetsSynced?: () => void;
  onUserRoleSwitched?: (user: AppUser) => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  poLines,
  invoices,
  deliveryNotes,
  payments,
  onUploadExcelPO,
  onDownloadTemplate,
  onResetData,
  onClearData,
  onClearPOs,
  onSeriesConfigChanged,
  onDataRestored,
  onSheetsSynced,
  onUserRoleSwitched,
}) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'series' | 'access'>(() =>
    isAdminUser(getCurrentSessionUser()) ? 'backup' : 'series'
  );
  
  // Users & Access State
  const [users, setUsers] = useState<AppUser[]>(() => loadStoredUsers());
  const [invitations, setInvitations] = useState<EmailAccessInvitation[]>(() => loadStoredInvitations());
  const [currentUser, setCurrentUser] = useState<AppUser>(() => getCurrentSessionUser());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<AppUser['role']>('Finance Officer');
  const [inviteDept, setInviteDept] = useState('Finance & Operations');
  const [invitePermissions, setInvitePermissions] = useState<ScreenPermissions>(() => {
    const base = getDefaultScreenPermissionsForRole('Finance Officer');
    return { ...base, settings: 'none' };
  });
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [newlyGeneratedLink, setNewlyGeneratedLink] = useState<{ invitation: EmailAccessInvitation; link: string } | null>(null);
  const [userPendingDelete, setUserPendingDelete] = useState<AppUser | null>(null);
  const [invitationPendingDelete, setInvitationPendingDelete] = useState<EmailAccessInvitation | null>(null);
  const [isClearPOsModalOpen, setIsClearPOsModalOpen] = useState(false);

  // 4-Digit PIN, Hold & Screen Permissions state
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<AppUser | null>(null);
  const [copiedPinUserId, setCopiedPinUserId] = useState<string | null>(null);
  const [copiedUserInviteId, setCopiedUserInviteId] = useState<string | null>(null);
  const [copiedPublicWebLink, setCopiedPublicWebLink] = useState(false);
  const [userActionNotice, setUserActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCopyPublicWebLink = () => {
    const publicUrl = getPublicAppBaseUrl() + window.location.pathname;
    navigator.clipboard.writeText(publicUrl);
    setCopiedPublicWebLink(true);
    setTimeout(() => setCopiedPublicWebLink(false), 3000);
  };

  // Password Visibility & Reset Modal State
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  const [revealedPasswordUserIds, setRevealedPasswordUserIds] = useState<Record<string, boolean>>({});
  const [resetModalUser, setResetModalUser] = useState<AppUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPasswordInModal, setShowNewPasswordInModal] = useState(true);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);

  const toggleUserPasswordReveal = (userId: string) => {
    setRevealedPasswordUserIds((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleOpenResetModal = (user: AppUser) => {
    setResetModalUser(user);
    const suggestedPin = generateUniquePin(users, user.id);
    setNewPasswordInput(suggestedPin);
    setShowNewPasswordInModal(true);
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };

  const handleCloseResetModal = () => {
    setResetModalUser(null);
    setNewPasswordInput('');
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };

  const handleGenerateUniquePinForModal = () => {
    if (!resetModalUser) return;
    const pin = generateUniquePin(users, resetModalUser.id);
    setNewPasswordInput(pin);
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };

  const handleGenerateAlphanumericForModal = () => {
    if (!resetModalUser) return;
    let candidate = '';
    const used = new Set(
      users
        .filter((u) => u.id !== resetModalUser.id)
        .map((u) => (u.password || u.pinCode || '').trim().toLowerCase())
    );
    let attempts = 0;
    while (attempts < 100) {
      const num = Math.floor(1000 + Math.random() * 9000);
      candidate = `Famola#${num}`;
      if (!used.has(candidate.toLowerCase())) break;
      attempts++;
    }
    setNewPasswordInput(candidate);
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };

  const handleConfirmResetPassword = () => {
    if (!resetModalUser) return;
    const clean = newPasswordInput.trim();
    if (!clean) {
      setResetPasswordError('Please enter or generate a new password.');
      return;
    }

    const res = resetUserPassword(resetModalUser.id, clean);
    if (!res) {
      setResetPasswordError('Failed to reset user password. User not found.');
      return;
    }
    if (res.error) {
      setResetPasswordError(res.error);
      return;
    }

    const updatedUsers = loadStoredUsers();
    setUsers(updatedUsers);
    setResetPasswordSuccess(`Password successfully updated to "${res.newPassword}" for ${resetModalUser.name}`);
    setUserActionNotice({
      type: 'success',
      text: `Password reset successfully for ${resetModalUser.name} (${resetModalUser.role})`,
    });
    setTimeout(() => setUserActionNotice(null), 4000);
  };

  const isAdmin = isAdminUser(currentUser);
  const canLoadDB = canLoadDatabase(currentUser);
  const canExportDB = canExportDatabase(currentUser);

  // Number Series State
  const [seriesConfig, setSeriesConfig] = useState<SeriesSettings>(() => loadStoredSeriesConfig());
  const [seriesSaveSuccess, setSeriesSaveSuccess] = useState(false);

  // Backup & Restore State
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupValidation, setBackupValidation] = useState<{
    valid: boolean;
    packageData?: SystemBackupPackage;
    summary?: any;
    error?: string;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<'REPLACE' | 'MERGE'>('REPLACE');
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupNotification, setBackupNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // PO Excel Dropzone state
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // ==========================================
  // EMAIL LINK ACCESS & USERS HANDLERS
  // ==========================================
  const handleInviteRoleChange = (newRole: AppUser['role']) => {
    setInviteRole(newRole);
    const base = getDefaultScreenPermissionsForRole(newRole);
    setInvitePermissions({
      ...base,
      settings: newRole === 'Admin' ? 'edit' : 'none',
    });
  };

  const handleGenerateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) {
      alert('Please provide name and email address.');
      return;
    }

    const safePerms: ScreenPermissions = {
      ...invitePermissions,
      ...(inviteRole === 'Admin' ? {} : { settings: 'none' }),
    };

    const result = generateEmailAccessLink(
      inviteEmail,
      inviteName,
      inviteRole,
      inviteDept,
      currentUser.name,
      safePerms
    );

    setNewlyGeneratedLink(result);
    const updatedUsers = loadStoredUsers();
    setInvitations(loadStoredInvitations());
    setUsers(updatedUsers);
    setInviteEmail('');
    setInviteName('');
    setIsInviteOpen(false);
    setUserActionNotice({
      type: 'success',
      text: `Access link generated for ${inviteName}. Assigned screen access and action permissions saved (Settings restricted).`,
    });
    setTimeout(() => setUserActionNotice(null), 5000);
  };

  const handleCopyLink = (inv: EmailAccessInvitation) => {
    const url = inv.accessUrl || `${window.location.origin}${window.location.pathname}?access_token=${inv.token}&access_email=${encodeURIComponent(inv.email)}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(inv.id);
    setTimeout(() => setCopiedLinkId(null), 3000);
  };

  const handleCopyEmailTemplate = (inv: EmailAccessInvitation) => {
    const text = getEmailInvitationText(inv);
    navigator.clipboard.writeText(text);
    setCopiedTemplateId(inv.id);
    setTimeout(() => setCopiedTemplateId(null), 3000);
  };

  const handleToggleInvitationStatus = (id: string) => {
    const updated = invitations.map((inv) => {
      if (inv.id === id) {
        return {
          ...inv,
          status: (inv.status === 'Active' ? 'Revoked' : 'Active') as 'Active' | 'Revoked',
        };
      }
      return inv;
    });
    setInvitations(updated);
    saveStoredInvitations(updated);
  };

  const handleDeleteInvitation = (id: string) => {
    const inv = invitations.find((i) => i.id === id);
    if (inv) {
      setInvitationPendingDelete(inv);
    }
  };

  const handleSwitchSessionUser = (user: AppUser) => {
    setCurrentSessionUser(user);
    setCurrentUser(user);
    if (onUserRoleSwitched) {
      onUserRoleSwitched(user);
    }
  };

  const handleToggleHold = (userId: string) => {
    const updated = toggleUserHoldStatus(userId);
    setUsers(updated);
    setUserActionNotice({ type: 'success', text: 'User account status updated successfully.' });
    setTimeout(() => setUserActionNotice(null), 3500);
  };

  const handleRegeneratePin = (userId: string) => {
    const res = regenerateUserPin(userId);
    if (!res) return;
    const updatedUsers = loadStoredUsers();
    setUsers(updatedUsers);
    setUserActionNotice({ type: 'success', text: `New unique password generated for ${res.user.name}: ${res.newPin}` });
    setTimeout(() => setUserActionNotice(null), 4000);
  };

  const handleCopyUserPin = (user: AppUser) => {
    const psw = (user.password || user.pinCode || '1234').trim();
    navigator.clipboard.writeText(psw);
    setCopiedPinUserId(user.id);
    setTimeout(() => setCopiedPinUserId(null), 3000);
  };

  const handleCopyUserInvite = (user: AppUser) => {
    const inviteText = getUserLoginInvitationText(user);
    navigator.clipboard.writeText(inviteText);
    setCopiedUserInviteId(user.id);
    setTimeout(() => setCopiedUserInviteId(null), 3000);
  };

  const handleExportUsersExcel = () => {
    const headers = ['Name', 'Email', 'Role', 'Department', 'Status', 'Password / PIN'];
    const rows = users.map(u => [
      u.name,
      u.email,
      u.role,
      u.department,
      u.status,
      getUserPassword(u)
    ]);
    exportTableToExcel('User_Accounts_Registry', headers, rows, 'user_accounts_registry');
  };

  const handleExportUsersPdf = () => {
    const headers = ['Name', 'Email', 'Role', 'Department', 'Status', 'Password / PIN'];
    const rows = users.map(u => [
      u.name,
      u.email,
      u.role,
      u.department,
      u.status,
      getUserPassword(u)
    ]);
    exportTableToPdf('User Accounts & Access Registry', headers, rows, {
      filenamePrefix: 'user_accounts_registry',
      subtitle: `${users.length} registered system users`,
    });
  };

  const handleExportInvitationsExcel = () => {
    const headers = ['Name', 'Authorized Email', 'Role', 'Department', 'Link Status', 'Created At'];
    const rows = invitations.map(inv => [
      inv.name,
      inv.email,
      inv.role,
      inv.department,
      inv.status,
      new Date(inv.createdAt).toLocaleDateString()
    ]);
    exportTableToExcel('Access_Invitations_Registry', headers, rows, 'access_invitations_registry');
  };

  const handleExportInvitationsPdf = () => {
    const headers = ['Name', 'Authorized Email', 'Role', 'Department', 'Link Status', 'Created At'];
    const rows = invitations.map(inv => [
      inv.name,
      inv.email,
      inv.role,
      inv.department,
      inv.status,
      new Date(inv.createdAt).toLocaleDateString()
    ]);
    exportTableToPdf('Authorized Magic Links & Access Invitations', headers, rows, {
      filenamePrefix: 'access_invitations_registry',
      subtitle: `${invitations.length} authorized team links`,
    });
  };

  const handleScreenPermissionChange = (userId: string, screenId: ScreenId, level: ScreenAccessLevel) => {
    const updatedUser = updateUserScreenPermission(userId, screenId, level);
    if (updatedUser) {
      const allUsers = loadStoredUsers();
      setUsers(allUsers);
      if (selectedUserForPermissions && selectedUserForPermissions.id === userId) {
        setSelectedUserForPermissions(updatedUser);
      }
    }
  };

  // ==========================================
  // BACKUP & RESTORE HANDLERS
  // ==========================================
  const handleBackupFileSelect = async (file: File) => {
    setBackupFile(file);
    const validation = await validateBackupFile(file);
    setBackupValidation(validation);
  };

  const handleExecuteRestore = () => {
    if (!backupValidation?.packageData) return;
    setIsRestoring(true);
    try {
      const restored = restoreSystemFromBackup(backupValidation.packageData, restoreMode);
      
      setUsers(loadStoredUsers());
      setInvitations(loadStoredInvitations());
      setSeriesConfig(loadStoredSeriesConfig());

      if (restored.issues && restored.issues.length > 0) {
        saveIssues(restored.issues);
      }
      if (onDataRestored) {
        onDataRestored({
          poLines: restored.poLines,
          invoices: restored.invoices,
          deliveryNotes: restored.deliveryNotes,
          payments: restored.payments,
          issues: restored.issues || [],
        });
      }

      setBackupNotification({
        type: 'success',
        text: `System state fully restored! Restored ${restored.poLines.length} PO Lines, ${restored.invoices.length} Invoices, ${restored.deliveryNotes.length} Delivery Notes, ${restored.payments.length} Payments, and ${(restored.issues || []).length} Document Issues.`,
      });

      setBackupFile(null);
      setBackupValidation(null);
    } catch (e: any) {
      setBackupNotification({
        type: 'error',
        text: `Restore failed: ${e.message}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const pushSeriesConfigToBackend = (config: SeriesSettings, type?: 'invoice' | 'delivery') => {
    const types: ('invoice' | 'delivery')[] = type ? [type] : ['invoice', 'delivery'];
    for (const t of types) {
      const series = t === 'invoice' ? config.invoiceSeries : config.deliverySeries;
      fetch(`${API_BASE}/api/series-config/${t}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(series),
      }).catch((e) => console.warn('Series config backend sync note:', e));
    }
  };

  // Series settings save
  const handleSaveSeries = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredSeriesConfig(seriesConfig);
    pushSeriesConfigToBackend(seriesConfig);
    setSeriesSaveSuccess(true);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
    setTimeout(() => setSeriesSaveSuccess(false), 3000);
  };

  const handleSetQuickRange = (type: 'invoice' | 'delivery', start: number, end: number, prefix: string) => {
    const updated: SeriesSettings = {
      ...seriesConfig,
      [type === 'invoice' ? 'invoiceSeries' : 'deliverySeries']: {
        ...seriesConfig[type === 'invoice' ? 'invoiceSeries' : 'deliverySeries'],
        prefix,
        startNumber: start,
        endNumber: end,
        currentNumber: start,
        padding: 3,
        autoIncrement: true,
      },
    };
    setSeriesConfig(updated);
    saveStoredSeriesConfig(updated);
    pushSeriesConfigToBackend(updated, type);
    setSeriesSaveSuccess(true);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
    setTimeout(() => setSeriesSaveSuccess(false), 3000);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm space-y-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Administrator Access Required</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Only System Administrators have access to System Settings, MySQL Database configuration, and Data Management.
        </p>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 text-left space-y-1">
          <p><span className="font-semibold text-slate-900">Current User:</span> {currentUser.name}</p>
          <p><span className="font-semibold text-slate-900">Current Role:</span> {currentUser.role}</p>
          <p><span className="font-semibold text-slate-900">Permission Status:</span> Restricted (User Interface View Only)</p>
        </div>
        <p className="text-xs text-slate-400">
          Please contact your administrator if you believe this is an error or require administrative credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner with Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">System Settings & Data Control</h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  v2.4.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                MySQL Master Database, Full System Disaster Backups, Email Magic Link RBAC, and 1-600 Number Series.
              </p>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700">
            {isAdmin && (
              <button
                onClick={() => setActiveTab('backup')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'backup'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Archive className="w-3.5 h-3.5 text-indigo-400" />
                Backup & Disaster Recovery
              </button>
            )}
            <button
              onClick={() => setActiveTab('access')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'access'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-amber-400" />
              Email Link Access ({invitations.length})
            </button>
            <button
              onClick={() => setActiveTab('series')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'series'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3.5 h-3.5 text-cyan-400" />
              Number Series (1-600)
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB: BACKUP & DISASTER RECOVERY
          ========================================================================= */}
      {activeTab === 'backup' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          {backupNotification && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                backupNotification.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border border-red-300 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {backupNotification.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{backupNotification.text}</span>
              </div>
              <button
                onClick={() => setBackupNotification(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                &times;
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EXPORT MASTER BACKUP CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Export Full System State & Disaster Backup</h2>
                    <p className="text-xs text-slate-500">
                      Save complete data, number series, RBAC users, and system flows to prevent any data loss
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                    <h4 className="font-bold text-slate-900">Included in this Comprehensive Backup:</h4>
                    <ul className="space-y-1 list-disc list-inside text-slate-600">
                      <li>Complete PO Master Lines ({poLines.length} items)</li>
                      <li>Invoices and Line Item Breakdowns ({invoices.length} invoices)</li>
                      <li>Delivery Notes and Dispatches ({deliveryNotes.length} notes)</li>
                      <li>Payments & Remittance Allocations ({payments.length} payments)</li>
                      <li>Number Series Configs (1-600 ranges & current sequence)</li>
                      <li>Team Member Accounts & Active Email Access Tokens</li>
                      <li>System Business Flow Schemas & 3-Way Audit Rules</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() =>
                    exportFullSystemBackup({
                      poLines,
                      invoices,
                      deliveryNotes,
                      payments,
                      issues: loadStoredIssues(),
                      seriesConfig,
                      users,
                      emailInvitations: invitations,
                    })
                  }
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  Export Full System Backup (.ninjabackup)
                </button>

                <button
                  type="button"
                  onClick={() => exportMasterExcelWorkbook(poLines, invoices, deliveryNotes, payments, users, loadStoredIssues())}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export All (Excel Multi-Sheet)
                </button>
              </div>
            </div>

            {/* RELOAD & RESTORE BACKUP CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Reload & Restore System Backup</h2>
                    <p className="text-xs text-slate-500">
                      Upload any .ninjabackup or backup .json file to restore complete system state
                    </p>
                  </div>
                </div>

                {/* File Dropzone */}
                <div
                  className="mt-4 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-6 text-center bg-slate-50 cursor-pointer"
                  onClick={() => document.getElementById('backup-file-input')?.click()}
                >
                  <input
                    id="backup-file-input"
                    type="file"
                    accept=".ninjabackup, .json"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleBackupFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  <Archive className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">
                    {backupFile ? backupFile.name : 'Select or Drop Backup File (.ninjabackup / .json)'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Automatic schema verification and integrity checking</p>
                </div>

                {/* Validation Summary */}
                {backupValidation && (
                  <div className="mt-4 p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                    {backupValidation.valid ? (
                      <>
                        <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Backup Verified: Ready to Restore</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1">
                          <div>PO Lines: <span className="font-bold">{backupValidation.summary?.poCount}</span></div>
                          <div>Invoices: <span className="font-bold">{backupValidation.summary?.invCount}</span></div>
                          <div>Delivery Notes: <span className="font-bold">{backupValidation.summary?.dnCount}</span></div>
                          <div>Payments: <span className="font-bold">{backupValidation.summary?.payCount}</span></div>
                          <div>Exported Date: <span className="font-bold">{backupValidation.summary?.exportedAt}</span></div>
                          <div>Version: <span className="font-bold">{backupValidation.summary?.version}</span></div>
                        </div>

                        {/* Mode choice */}
                        <div className="pt-2 border-t border-blue-200/60 flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-slate-800 font-semibold cursor-pointer">
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'REPLACE'}
                              onChange={() => setRestoreMode('REPLACE')}
                            />
                            Full System Replacement
                          </label>
                          <label className="flex items-center gap-1.5 text-slate-800 font-semibold cursor-pointer">
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'MERGE'}
                              onChange={() => setRestoreMode('MERGE')}
                            />
                            Merge & Append
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-red-800 font-bold">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span>{backupValidation.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Restore Action */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={!backupValidation?.valid || isRestoring || !canLoadDB}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  title={!canLoadDB ? 'Only Administrators can restore database state' : undefined}
                >
                  <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                  {isRestoring ? 'Restoring System State...' : 'Commit & Restore Everything Now'}
                </button>
              </div>
            </div>
          </div>

          {/* Reset / Clear Workspace Controls */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Workspace Management</h4>
              <p className="text-xs text-slate-500">Wipe all current records to start fresh with real live data (Admin Only)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onClearPOs && (
                <button
                  type="button"
                  id="settings-clear-all-pos-btn"
                  onClick={() => setIsClearPOsModalOpen(true)}
                  disabled={!canLoadDB}
                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-200 text-amber-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={!canLoadDB ? 'Admin permission required to clear POs' : 'Clear all PO lines and groups'}
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                  Clear All POs
                </button>
              )}
              <button
                type="button"
                onClick={onClearData}
                disabled={!canLoadDB}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed border border-red-200 text-red-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title={!canLoadDB ? 'Admin permission required to clear data' : undefined}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                Clear All Data (Fresh Start)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: EMAIL LINK ACCESS & TEAM MANAGEMENT
          ========================================================================= */}
      {activeTab === 'access' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Public Web Share & 4-Digit PIN Access Banner */}
          <div className="bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-700/60 rounded-2xl p-5 text-white shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    Independent Public Web Application
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Standalone Ready
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200/90 mt-0.5">
                    Users can open this as a 100% independent web application on any device, completely outside AI Studio, with full screen utilization.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openInStandaloneWindow()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Open Independent Full-Screen App in New Tab"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Standalone (Full Screen)
                </button>
                <button
                  type="button"
                  onClick={handleCopyPublicWebLink}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {copiedPublicWebLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      Copy Standalone Public Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Direct Link Display */}
            <div className="bg-slate-950/80 border border-blue-500/30 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs font-mono text-blue-200 w-full overflow-hidden">
                <span className="text-slate-400 font-sans shrink-0 font-medium">Public URL:</span>
                <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-700 text-slate-200 truncate select-all w-full">
                  {getPublicAppBaseUrl() + window.location.pathname}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyPublicWebLink}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 shrink-0 cursor-pointer font-medium"
              >
                {copiedPublicWebLink ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Explanation: Why did users get errors? */}
            <div className="bg-blue-950/50 border border-blue-600/30 rounded-xl p-3.5 text-xs space-y-2">
              <div className="font-semibold text-blue-200 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Why users had errors when pasting the developer link:</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                When you test in AI Studio, your browser uses an internal preview domain (<code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">ais-dev-...</code>) that requires your personal Google Cloud sign-in. Anyone else visiting that URL receives an <strong>Access Denied (403 Forbidden)</strong> error.
              </p>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                <strong>Solution:</strong> Send them the <strong>Standalone Public Link</strong> above (<code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">ais-pre-...</code>). It opens immediately on any device, completely outside AI Studio, without any Google account requirement.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-blue-500/30 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono text-slate-300 truncate max-w-full">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Admin 4-Digit Password: <strong className="text-white tracking-wider bg-slate-800 px-2 py-0.5 rounded border border-slate-700">1234</strong></span>
                <span className="text-slate-400 hidden lg:inline">&bull; Team PINs: <strong>2345</strong>, <strong>3456</strong>, <strong>4567</strong></span>
              </div>
              <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                <span>Permanent Database Connected & Visible to All Users</span>
              </div>
            </div>
          </div>

          {/* Active Session Indicator */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-sm">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{currentUser.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-300 border border-blue-400/30">
                    Current Active Session ({currentUser.role})
                  </span>
                </div>
                <p className="text-xs text-slate-400">{currentUser.email} &bull; {currentUser.department}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate Email Access Link
            </button>
          </div>

          {/* Newly Generated Access Link Banner */}
          {newlyGeneratedLink && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 text-emerald-950 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="font-bold text-sm">
                    Magic Access Link Generated for {newlyGeneratedLink.invitation.name} ({newlyGeneratedLink.invitation.email})!
                  </h3>
                </div>
                <button
                  onClick={() => setNewlyGeneratedLink(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyGeneratedLink.link}
                  className="flex-1 text-xs font-mono px-3 py-2 bg-white border border-emerald-300 rounded-lg text-slate-800"
                />
                <button
                  onClick={() => handleCopyLink(newlyGeneratedLink.invitation)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedLinkId === newlyGeneratedLink.invitation.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Link
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleCopyEmailTemplate(newlyGeneratedLink.invitation)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedTemplateId === newlyGeneratedLink.invitation.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied Email!
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" /> Copy Invitation Email
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Invitation Drawer Form */}
          {isInviteOpen && (
            <form onSubmit={handleGenerateInvitation} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Issue New User Email Access Link</h3>
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">User Full Name</label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. j.doe@company.com"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Assigned Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => handleInviteRoleChange(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Admin">Admin (Full Control)</option>
                    <option value="Finance Officer">Finance Officer (Invoices & Payments)</option>
                    <option value="Logistics Manager">Logistics Manager (Delivery Notes)</option>
                    <option value="Billing Clerk">Billing Clerk (Invoice Record)</option>
                    <option value="Auditor">Auditor (Read Only & Reports)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Department</label>
                  <input
                    type="text"
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    placeholder="e.g. Finance & Accounting"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Granular Screen Access & Action Assignment Matrix */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      Assign Screen Access & Permitted Actions
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Specify which screens this user can view and which actions they can execute. System Settings remain strictly restricted to Administrators.
                    </p>
                  </div>
                  <div className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    Preset: <strong className="text-slate-800">{inviteRole}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-slate-50/50 scrollbar-thin">
                  {SYSTEM_SCREENS.map((screen) => {
                    const isSettings = screen.id === 'settings';
                    const isUserAdminRole = inviteRole === 'Admin';
                    const level = isSettings && !isUserAdminRole ? 'none' : (invitePermissions[screen.id] || 'none');

                    return (
                      <div
                        key={screen.id}
                        className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-2 transition-all ${
                          isSettings && !isUserAdminRole
                            ? 'bg-slate-100/70 border-slate-200 opacity-80'
                            : level === 'edit'
                            ? 'bg-emerald-50/80 border-emerald-200'
                            : level === 'view'
                            ? 'bg-blue-50/80 border-blue-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                              {isSettings && <Lock className="w-3 h-3 text-amber-600" />}
                              {screen.label}
                            </span>
                            {isSettings && !isUserAdminRole ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <span>🔒 Admin Only (Restricted)</span>
                              </span>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                level === 'edit'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : level === 'view'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {level === 'edit' ? 'Can Take Action' : level === 'view' ? 'Can View Screen' : 'No Access'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1">
                            {isSettings && !isUserAdminRole
                              ? 'Database config, series, backups & user roles are limited to Admin only.'
                              : screen.description}
                          </p>
                        </div>

                        {/* Permission Selector */}
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-200 self-end">
                          <button
                            type="button"
                            disabled={isSettings && !isUserAdminRole}
                            onClick={() => {
                              if (isSettings && !isUserAdminRole) return;
                              setInvitePermissions((prev) => ({ ...prev, [screen.id]: 'none' }));
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              level === 'none'
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            } ${isSettings && !isUserAdminRole ? 'opacity-40 cursor-not-allowed' : ''}`}
                            title="No access to this screen"
                          >
                            None
                          </button>
                          <button
                            type="button"
                            disabled={isSettings && !isUserAdminRole}
                            onClick={() => {
                              if (isSettings && !isUserAdminRole) return;
                              setInvitePermissions((prev) => ({ ...prev, [screen.id]: 'view' }));
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              level === 'view'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            } ${isSettings && !isUserAdminRole ? 'opacity-40 cursor-not-allowed' : ''}`}
                            title="Can view screen data only (Read-only)"
                          >
                            Can View
                          </button>
                          <button
                            type="button"
                            disabled={isSettings && !isUserAdminRole}
                            onClick={() => {
                              if (isSettings && !isUserAdminRole) return;
                              setInvitePermissions((prev) => ({ ...prev, [screen.id]: 'edit' }));
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              level === 'edit'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            } ${isSettings && !isUserAdminRole ? 'opacity-40 cursor-not-allowed' : ''}`}
                            title="Can take actions and record data on this screen"
                          >
                            Take Action
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Generate & Save Magic Link
                </button>
              </div>
            </form>
          )}

          {/* User Action Feedback Toast */}
          {userActionNotice && (
            <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border animate-in fade-in ${
              userActionNotice.type === 'success' 
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
                : 'bg-red-50 text-red-900 border-red-300'
            }`}>
              {userActionNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{userActionNotice.text}</span>
            </div>
          )}

          {/* SECTION 1: Team Accounts, 4-Digit PIN Security & Screen Permissions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  User Accounts, 4-Digit PIN Passwords & Access Control
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage team credentials, 4-digit security PINs, account hold status, and 10-screen permission matrix.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TableExportToolbar
                  totalCount={users.length}
                  onExportExcel={handleExportUsersExcel}
                  onExportPdf={handleExportUsersPdf}
                  size="sm"
                />
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  {users.length} Registered Users
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-auto max-h-[420px] scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[760px] border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">User</th>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">Role & Dept</th>
                      <th className="py-3 px-4 text-center sticky top-0 bg-slate-900">Status</th>
                      <th className="py-3 px-4 text-center sticky top-0 bg-slate-900">
                        <div className="flex items-center justify-center gap-2">
                          <span>Password / PIN</span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setShowAllPasswords(!showAllPasswords)}
                              className="px-2 py-0.5 rounded text-[10px] normal-case font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                              title={showAllPasswords ? "Hide all passwords" : "Show all passwords"}
                            >
                              {showAllPasswords ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3 text-blue-400" />}
                              <span>{showAllPasswords ? 'Hide All' : 'Show All'}</span>
                            </button>
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-4 text-center sticky top-0 bg-slate-900">Screen Access</th>
                      <th className="py-3 px-4 text-right sticky top-0 bg-slate-900">Account Actions</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...users].sort((a, b) => naturalCompare(a.name, b.name)).map((u) => {
                    const isSelf = u.email.toLowerCase() === currentUser.email.toLowerCase();
                    const isUserAdmin = u.role === 'Admin';
                    const isHold = u.status === 'On Hold';
                    const psw = (u.password || u.pinCode || '1234').trim();
                    const isRevealed = showAllPasswords || Boolean(revealedPasswordUserIds[u.id]);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {u.name}
                            {isSelf && (
                              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">You</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isUserAdmin 
                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {u.role}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-0.5">{u.department}</div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          {isHold ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <PauseCircle className="w-3 h-3" />
                              On Hold
                            </span>
                          ) : u.status === 'Active' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            <KeyRound className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className={`font-mono font-bold text-xs min-w-[50px] text-center ${!isRevealed ? 'tracking-widest select-none text-slate-500' : 'tracking-wider text-slate-900'}`}>
                              {isRevealed ? psw : '••••'}
                            </span>
                            
                            {/* Toggle Eye for this user */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => toggleUserPasswordReveal(u.id)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                                title={isRevealed ? "Hide password" : "View password"}
                              >
                                {isRevealed ? (
                                  <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            {/* Copy Password */}
                            <button
                              type="button"
                              onClick={() => handleCopyUserPin(u)}
                              className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Copy password to clipboard"
                            >
                              {copiedPinUserId === u.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Admin Quick Regenerate & Reset Modal button */}
                            {isAdmin && (
                              <div className="flex items-center gap-1 border-l border-slate-300 pl-1 ml-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleRegeneratePin(u.id)}
                                  className="p-1 hover:bg-slate-200 rounded text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                                  title="Quickly regenerate a fresh unique 4-digit PIN"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenResetModal(u)}
                                  className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer shadow-xs"
                                  title="Reset or customize password"
                                >
                                  Reset
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedUserForPermissions(u)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Configure granular permissions across 10 screens"
                          >
                            <Sliders className="w-3.5 h-3.5 text-blue-600" />
                            <span>{isUserAdmin ? 'Full Access (Admin)' : 'Configure Matrix'}</span>
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenResetModal(u)}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title="Reset or customize password"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                              Reset Psw
                            </button>
                          )}

                          {isAdmin && !isSelf && (
                            <button
                              type="button"
                              onClick={() => handleToggleHold(u.id)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                isHold
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                              }`}
                              title={isHold ? 'Reactivate user account' : 'Put user account on hold'}
                            >
                              {isHold ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                              {isHold ? 'Activate' : 'Put On Hold'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopyUserInvite(u)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Copy user invitation with PIN and direct link"
                          >
                            {copiedUserInviteId === u.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Mail className="w-3.5 h-3.5" />
                            )}
                            Invite & PIN
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleSwitchSessionUser(u)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Switch session to this user"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Switch
                            </button>
                          )}

                          {isAdmin && !isSelf && (
                            <button
                              type="button"
                              onClick={() => setUserPendingDelete(u)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                              title="Delete user permanently"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

          {/* Reset Password Modal (Admin Credentials Management) */}
          {resetModalUser && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 overflow-hidden">
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">
                        Reset User Password
                      </h3>
                      <p className="text-xs text-slate-400">
                        Admin Credential Management • FAMOLA Enterprise
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseResetModal}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {/* User Information Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{resetModalUser.name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{resetModalUser.email}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                          {resetModalUser.role}
                        </span>
                        <span className="text-xs text-slate-500">{resetModalUser.department}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 font-medium">Current Password</div>
                      <div className="font-mono font-bold text-sm text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200 mt-1 inline-block">
                        {getUserPassword(resetModalUser)}
                      </div>
                    </div>
                  </div>

                  {/* Success Alert */}
                  {resetPasswordSuccess && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold">{resetPasswordSuccess}</div>
                        <div className="text-slate-600 mt-1">
                          The new password is saved and active. You can copy the credentials or invitation text below to share with {resetModalUser.name}.
                        </div>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleCopyUserInvite(resetModalUser)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Copy Full Invitation
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(newPasswordInput.trim());
                              setUserActionNotice({ type: 'success', text: 'New password copied to clipboard!' });
                            }}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Password Only
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error Alert */}
                  {resetPasswordError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{resetPasswordError}</span>
                    </div>
                  )}

                  {/* New Password Input Field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      New Password / PIN for {resetModalUser.name}
                    </label>
                    <div className="relative flex items-center">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                      <input
                        type={showNewPasswordInModal ? 'text' : 'password'}
                        value={newPasswordInput}
                        onChange={(e) => {
                          setNewPasswordInput(e.target.value);
                          setResetPasswordError(null);
                          setResetPasswordSuccess(null);
                        }}
                        placeholder="Enter unique password or PIN"
                        className="w-full pl-9 pr-12 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
                      />
                      <div className="absolute right-2 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowNewPasswordInModal(!showNewPasswordInModal)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title={showNewPasswordInModal ? "Mask password" : "Show password"}
                        >
                          {showNewPasswordInModal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Live Uniqueness & Collision Detection */}
                    <div className="mt-2">
                      {(() => {
                        const clean = newPasswordInput.trim();
                        if (!clean) {
                          return (
                            <p className="text-[11px] text-slate-500">
                              Every user must have a different password. Enter a value or click a generator below.
                            </p>
                          );
                        }
                        const conflict = users.find(
                          (u) => u.id !== resetModalUser.id && (u.password || u.pinCode || '').trim().toLowerCase() === clean.toLowerCase()
                        );
                        if (conflict) {
                          return (
                            <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Conflict: This password is already in use by {conflict.name} ({conflict.role}).
                            </p>
                          );
                        }
                        return (
                          <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Password is unique and available across all users.
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Guaranteed Unique Generators */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Quick Password Generators (Guaranteed Unique)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateUniquePinForModal}
                        className="px-3 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                        <span>Generate 4-Digit PIN</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateAlphanumericForModal}
                        className="px-3 py-2 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>Generate Alphanumeric</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={handleCloseResetModal}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={!newPasswordInput.trim() || users.some((u) => u.id !== resetModalUser.id && (u.password || u.pinCode || '').trim().toLowerCase() === newPasswordInput.trim().toLowerCase())}
                    onClick={handleConfirmResetPassword}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Save & Apply Password</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Screen Permissions Modal / Drawer */}
          {selectedUserForPermissions && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-base text-slate-900">
                        Screen Access Matrix: {selectedUserForPermissions.name}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Role: <strong className="text-slate-700">{selectedUserForPermissions.role}</strong> • {selectedUserForPermissions.department} • PIN: <span className="font-mono font-bold text-blue-600">{selectedUserForPermissions.pinCode || '1234'}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedUserForPermissions(null)}
                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Notice */}
                <div className="px-5 pt-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                    <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Granular Role-Based Screen Access</p>
                      <p className="text-[11px] text-blue-800 mt-0.5">
                        Set permissions to <strong>None</strong>, <strong>Can View</strong>, or <strong>Can Edit</strong> for each screen. Note: Database loading and master backups export remain strictly restricted to Administrators.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modal Body - Screens List */}
                <div className="p-5 overflow-y-auto space-y-3 divide-y divide-slate-100 flex-1">
                  {SYSTEM_SCREENS.map((screen) => {
                    const currentLevel: ScreenAccessLevel = getUserScreenPermission(selectedUserForPermissions, screen.id);
                    const isUserAdmin = selectedUserForPermissions.role === 'Admin';

                    return (
                      <div key={screen.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs text-slate-900">{screen.label}</div>
                          <div className="text-[11px] text-slate-500">{screen.description}</div>
                        </div>

                        {/* Access Level Selector */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            disabled={isUserAdmin}
                            onClick={() => handleScreenPermissionChange(selectedUserForPermissions.id, screen.id, 'none')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'none'
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            } ${isUserAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            None
                          </button>

                          <button
                            type="button"
                            disabled={isUserAdmin}
                            onClick={() => handleScreenPermissionChange(selectedUserForPermissions.id, screen.id, 'view')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'view'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            } ${isUserAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            Can View
                          </button>

                          <button
                            type="button"
                            disabled={isUserAdmin}
                            onClick={() => handleScreenPermissionChange(selectedUserForPermissions.id, screen.id, 'edit')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'edit'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            } ${isUserAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            Can Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Changes are saved in real-time.
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedUserForPermissions(null)}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Done & Close Matrix
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: Email Invitations & Magic Links */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Authorized Magic Links & Direct URL Access</h3>
                <p className="text-xs text-slate-500">Secure tokens that log users directly into their accounts via single-click link</p>
              </div>
              <TableExportToolbar
                totalCount={invitations.length}
                onExportExcel={handleExportInvitationsExcel}
                onExportPdf={handleExportInvitationsPdf}
                size="sm"
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-auto max-h-[350px] scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">User</th>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">Authorized Email</th>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">Role</th>
                      <th className="py-3 px-4 sticky top-0 bg-slate-900">Department</th>
                      <th className="py-3 px-4 text-center sticky top-0 bg-slate-900">Link Status</th>
                      <th className="py-3 px-4 text-right sticky top-0 bg-slate-900">Access Link Actions</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-slate-200">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {inv.name}
                        {inv.email === currentUser.email && (
                          <span className="ml-1.5 text-[10px] text-blue-600 font-bold">(You)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{inv.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{inv.department}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleInvitationStatus(inv.id)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                            inv.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {inv.status}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Copy direct access URL"
                        >
                          {copiedLinkId === inv.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Link
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyEmailTemplate(inv)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="Copy ready-to-send invitation email"
                        >
                          {copiedTemplateId === inv.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                          Email Text
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              const u = users.find((x) => x.email.toLowerCase() === inv.email.toLowerCase()) || {
                                id: inv.id,
                                name: inv.name,
                                email: inv.email,
                                role: inv.role,
                                department: inv.department,
                                status: 'Active',
                                createdAt: inv.createdAt,
                              };
                              handleSwitchSessionUser(u);
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title="Log in as this user immediately"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Switch User
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteInvitation(inv.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          title="Delete invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* =========================================================================
          TAB 4: NUMBER SERIES CONFIGURATION (1-600)
          ========================================================================= */}
      {activeTab === 'series' && (
        <div className="space-y-6 animate-in fade-in">
          {seriesSaveSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs font-semibold text-emerald-900 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Number series settings updated successfully! All next invoices and delivery notes will follow this sequence.</span>
            </div>
          )}

          <form onSubmit={handleSaveSeries} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* INVOICE NUMBER SERIES CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      INV
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">Invoice Number Series</h3>
                      <p className="text-xs text-slate-500">Auto-increment sequence for official tax invoices</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                    Next: {formatSeriesNumber(seriesConfig.invoiceSeries.prefix, seriesConfig.invoiceSeries.currentNumber, seriesConfig.invoiceSeries.padding)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Prefix</label>
                    <input
                      type="text"
                      value={seriesConfig.invoiceSeries.prefix}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          invoiceSeries: { ...seriesConfig.invoiceSeries, prefix: e.target.value },
                        })
                      }
                      placeholder="e.g. INV-"
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Series Start #</label>
                    <input
                      type="number"
                      min="1"
                      value={seriesConfig.invoiceSeries.startNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          invoiceSeries: { ...seriesConfig.invoiceSeries, startNumber: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Series End #</label>
                    <input
                      type="number"
                      min="1"
                      value={seriesConfig.invoiceSeries.endNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          invoiceSeries: { ...seriesConfig.invoiceSeries, endNumber: parseInt(e.target.value) || 600 },
                        })
                      }
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Current Active #</label>
                    <input
                      type="number"
                      min={seriesConfig.invoiceSeries.startNumber}
                      max={seriesConfig.invoiceSeries.endNumber}
                      value={seriesConfig.invoiceSeries.currentNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          invoiceSeries: { ...seriesConfig.invoiceSeries, currentNumber: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-full text-xs font-mono font-bold text-blue-700 px-3 py-2 border border-blue-300 bg-blue-50/30 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Padding Digits</label>
                    <select
                      value={seriesConfig.invoiceSeries.padding}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          invoiceSeries: { ...seriesConfig.invoiceSeries, padding: parseInt(e.target.value) || 0 },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="0">No padding (e.g. 1)</option>
                      <option value="2">2 digits (e.g. 01)</option>
                      <option value="3">3 digits (e.g. 001)</option>
                      <option value="4">4 digits (e.g. 0001)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 w-full">
                      Remaining: <span className="font-bold text-slate-900">{Math.max(0, seriesConfig.invoiceSeries.endNumber - seriesConfig.invoiceSeries.currentNumber + 1)}</span>
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleSetQuickRange('invoice', 1, 600, 'INV-')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
                  >
                    INV-001 to 600
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickRange('invoice', 1, 600, `INV-${new Date().getFullYear()}-`)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
                  >
                    INV-{new Date().getFullYear()}-001
                  </button>
                </div>
              </div>
            </div>

            {/* DELIVERY NOTE NUMBER SERIES CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                      DN
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">Delivery Note Number Series</h3>
                      <p className="text-xs text-slate-500">Auto-increment sequence for dispatch delivery notes</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                    Next: {formatSeriesNumber(seriesConfig.deliverySeries.prefix, seriesConfig.deliverySeries.currentNumber, seriesConfig.deliverySeries.padding)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Prefix</label>
                    <input
                      type="text"
                      value={seriesConfig.deliverySeries.prefix}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          deliverySeries: { ...seriesConfig.deliverySeries, prefix: e.target.value },
                        })
                      }
                      placeholder="e.g. DN-"
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Series Start #</label>
                    <input
                      type="number"
                      min="1"
                      value={seriesConfig.deliverySeries.startNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          deliverySeries: { ...seriesConfig.deliverySeries, startNumber: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Series End #</label>
                    <input
                      type="number"
                      min="1"
                      value={seriesConfig.deliverySeries.endNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          deliverySeries: { ...seriesConfig.deliverySeries, endNumber: parseInt(e.target.value) || 600 },
                        })
                      }
                      className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Current Active #</label>
                    <input
                      type="number"
                      min={seriesConfig.deliverySeries.startNumber}
                      max={seriesConfig.deliverySeries.endNumber}
                      value={seriesConfig.deliverySeries.currentNumber}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          deliverySeries: { ...seriesConfig.deliverySeries, currentNumber: parseInt(e.target.value) || 1 },
                        })
                      }
                      className="w-full text-xs font-mono font-bold text-indigo-700 px-3 py-2 border border-indigo-300 bg-indigo-50/30 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Padding Digits</label>
                    <select
                      value={seriesConfig.deliverySeries.padding}
                      onChange={(e) =>
                        setSeriesConfig({
                          ...seriesConfig,
                          deliverySeries: { ...seriesConfig.deliverySeries, padding: parseInt(e.target.value) || 0 },
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="0">No padding (e.g. 1)</option>
                      <option value="2">2 digits (e.g. 01)</option>
                      <option value="3">3 digits (e.g. 001)</option>
                      <option value="4">4 digits (e.g. 0001)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 w-full">
                      Remaining: <span className="font-bold text-slate-900">{Math.max(0, seriesConfig.deliverySeries.endNumber - seriesConfig.deliverySeries.currentNumber + 1)}</span>
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleSetQuickRange('delivery', 1, 600, 'DN-')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
                  >
                    DN-001 to 600
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuickRange('delivery', 1, 600, `DN-${new Date().getFullYear()}-`)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono transition-colors cursor-pointer"
                  >
                    DN-{new Date().getFullYear()}-001
                  </button>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="lg:col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                Save Series Configuration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Permanent Delete Modal for Admin Deleting User Account */}
      <PermanentDeleteModal
        isOpen={!!userPendingDelete}
        onClose={() => setUserPendingDelete(null)}
        onConfirm={() => {
          if (userPendingDelete) {
            const u = userPendingDelete;
            const filtered = users.filter((x) => x.id !== u.id);
            setUsers(filtered);
            saveStoredUsers(filtered);
            fetch(`${API_BASE}/api/users/${encodeURIComponent(u.id)}`, {
              method: 'DELETE',
              headers: authHeaders(),
            }).catch((e) => console.warn('Backend user removal note:', e));
            setUserPendingDelete(null);
            setUserActionNotice({ type: 'success', text: `User "${u.name}" permanently deleted.` });
          }
        }}
        transactionType="USER"
        referenceNumber={userPendingDelete?.email || userPendingDelete?.id || ''}
        customerName={userPendingDelete?.name}
        details={`Permanently removes user account for "${userPendingDelete?.name}" (${userPendingDelete?.role || 'Staff'}) from the database and revokes system credentials.`}
      />

      {/* Permanent Delete Modal for Revoking Email Invitation */}
      <PermanentDeleteModal
        isOpen={!!invitationPendingDelete}
        onClose={() => setInvitationPendingDelete(null)}
        onConfirm={() => {
          if (invitationPendingDelete) {
            const updated = invitations.filter((inv) => inv.id !== invitationPendingDelete.id);
            setInvitations(updated);
            saveStoredInvitations(updated);
            setInvitationPendingDelete(null);
            setUserActionNotice({ type: 'success', text: `Access invitation for "${invitationPendingDelete.email}" permanently removed.` });
          }
        }}
        transactionType="INVITATION"
        referenceNumber={invitationPendingDelete?.email || ''}
        customerName={invitationPendingDelete?.recipientName}
        details={`Permanently revokes and removes pending access link for ${invitationPendingDelete?.email}.`}
      />

      {/* Clear All POs Modal */}
      {isClearPOsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-800 p-5 text-white flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
                  <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Clear All Purchase Orders</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Administrator PO Database Reset</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Are you sure you want to permanently clear all loaded Purchase Orders? Invoices, delivery notes, and payments will be retained.
              </p>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClearPOsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onClearPOs) onClearPOs();
                    setIsClearPOsModalOpen(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirm Clear All POs</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
