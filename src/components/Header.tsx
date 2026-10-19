import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  ReceiptText,
  Database,
  Scale,
  PlusCircle,
  FileCheck2,
  Truck,
  GitCompare,
  CreditCard,
  Settings,
  Download,
  AlertTriangle,
  Lock,
  LogOut,
  Maximize,
  Minimize,
  ExternalLink
} from 'lucide-react';
import { AppUser } from '../types';
import { canViewScreen, canEditScreen, isAdminUser, canExportDatabase } from '../utils/authService';
import { getPublicAppBaseUrl, isRunningInIframe, openInStandaloneWindow, toggleAppFullscreen } from '../utils/appInfoService';

export type ActiveTab = 
  | 'dashboard' 
  | 'po_master' 
  | 'create_invoice' 
  | 'invoices_db' 
  | 'issue_tracking'
  | 'delivery_notes' 
  | 'delivery_details'
  | 'matching_report' 
  | 'payments' 
  | 'settings' 
  | 'ledger'
  | 'database';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  totalPOsCount: number;
  totalPOLinesCount?: number;
  totalInvoicesCount: number;
  totalDNsCount?: number;
  totalPaymentsCount?: number;
  pendingIssuesCount?: number;
  onOpenNewInvoice: () => void;
  onOpenMasterExport?: () => void;
  onOpenPinLogin?: () => void;
  onOpenDatabaseInspector?: () => void;
  currentUser?: AppUser;
  isDbConnected?: boolean;
  isSyncingDb?: boolean;
  lastDbSync?: string;
  onManualSync?: () => void;
  onLockSession?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalPOsCount,
  totalPOLinesCount = 0,
  totalInvoicesCount,
  totalDNsCount = 0,
  totalPaymentsCount = 0,
  pendingIssuesCount = 0,
  onOpenNewInvoice,
  onOpenMasterExport,
  onOpenPinLogin,
  onOpenDatabaseInspector,
  currentUser,
  isDbConnected = true,
  isSyncingDb = false,
  lastDbSync = 'Live',
  onManualSync,
  onLockSession,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const inIframe = isRunningInIframe();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const isAdmin = isAdminUser(currentUser);
  const canExport = canExportDatabase(currentUser);

  const allNavItems: { id: ActiveTab; label: string; icon: React.ElementType; badge?: number | string; badgeTooltip?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'issue_tracking', label: 'Issues', icon: AlertTriangle, badge: pendingIssuesCount, badgeTooltip: `${pendingIssuesCount} Pending Issues` },
    { id: 'matching_report', label: 'Matching', icon: GitCompare },
    {
      id: 'po_master',
      label: 'PO',
      icon: FileSpreadsheet,
      badge: totalPOsCount > 0
        ? (totalPOLinesCount && totalPOLinesCount > totalPOsCount
            ? `${totalPOsCount} (${totalPOLinesCount.toLocaleString()})`
            : totalPOsCount)
        : undefined,
      badgeTooltip: `${totalPOsCount} Purchase Orders (${(totalPOLinesCount || totalPOsCount).toLocaleString()} total line items)`,
    },
    { id: 'create_invoice', label: 'Invoice', icon: ReceiptText },
    { id: 'invoices_db', label: 'Invoiced Details', icon: Database, badge: totalInvoicesCount, badgeTooltip: `${totalInvoicesCount} Invoices Issued` },
    { id: 'delivery_notes', label: 'Delivery', icon: Truck },
    { id: 'delivery_details', label: 'Delivery Details', icon: Database, badge: totalDNsCount, badgeTooltip: `${totalDNsCount} Delivery Notes` },
    { id: 'payments', label: 'Payments', icon: CreditCard, badge: totalPaymentsCount, badgeTooltip: `${totalPaymentsCount} Payments Recorded` },
    { id: 'ledger', label: 'Ledger', icon: Scale },
    ...(isAdmin ? [{ id: 'settings' as ActiveTab, label: 'Settings', icon: Settings }] : []),
  ];

  const navItems = allNavItems.filter((item) => canViewScreen(currentUser, item.id));

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-md w-full">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15 sm:h-16 gap-2">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => setActiveTab('dashboard')}>
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-base sm:text-lg text-white tracking-tight">Famola FBI po invoice reconcilaition</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Enterprise
                </span>
                
                {/* Primary Database Status - Admin Only */}
                {isAdmin && (
                  <div className="text-[10px] font-semibold rounded-full bg-slate-800/90 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 inline-flex items-center gap-1.5 shadow-xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <Database className="w-3 h-3 text-emerald-400" />
                    <span className="font-semibold">MySQL Master DB</span>
                    <span className="hidden md:inline text-[9px] text-emerald-300 font-medium bg-emerald-900/80 px-1.5 py-0.2 rounded border border-emerald-500/30">
                      Live
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 hidden xl:block">
                {isAdmin
                  ? 'PO Tracker, MySQL Master Database, 3-Way Reconciliation & Full Audit'
                  : 'PO Tracker, 3-Way Reconciliation & Full Audit'}
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onOpenMasterExport && (
              <button
                type="button"
                id="header-master-export-btn"
                onClick={onOpenMasterExport}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Master Database Export (Excel, JSON, Recovery)"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden lg:inline">Export All</span>
              </button>
            )}

            {canEditScreen(currentUser, 'create_invoice') && (
              <button
                onClick={onOpenNewInvoice}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Invoice</span>
              </button>
            )}

            {currentUser && (
              isAdmin ? (
                <button
                  type="button"
                  onClick={onOpenPinLogin}
                  className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-lg text-xs text-slate-300 transition-colors cursor-pointer"
                  title={`Signed in as ${currentUser.name} (${currentUser.role}) • Admin: Click to switch user`}
                >
                  <div className={`w-5 h-5 rounded-full text-white font-bold flex items-center justify-center text-[10px] ${
                    currentUser.status === 'On Hold' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}>
                    {currentUser.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-200 max-w-[85px] truncate leading-tight">{currentUser.name}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">({currentUser.role.split(' ')[0]})</span>
                  </div>
                  {currentUser.status === 'On Hold' && (
                    <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-bold">
                      HOLD
                    </span>
                  )}
                </button>
              ) : (
                <div
                  className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 py-1 bg-slate-800/80 border border-slate-700/70 rounded-lg text-xs text-slate-300 select-none cursor-default"
                  title={`Signed in as ${currentUser.name} (${currentUser.role}) • User account locked`}
                >
                  <div className={`w-5 h-5 rounded-full text-white font-bold flex items-center justify-center text-[10px] ${
                    currentUser.status === 'On Hold' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}>
                    {currentUser.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-200 max-w-[85px] truncate leading-tight">{currentUser.name}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">({currentUser.role.split(' ')[0]})</span>
                  </div>
                  {currentUser.status === 'On Hold' && (
                    <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-bold">
                      HOLD
                    </span>
                  )}
                </div>
              )
            )}

            {currentUser && onLockSession && (
              <button
                type="button"
                onClick={onLockSession}
                className="p-1.5 sm:px-2.5 sm:py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title={isAdmin ? "Sign out of current account" : "Lock session (PIN / password required to unlock)"}
              >
                {isAdmin ? (
                  <>
                    <LogOut className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden lg:inline">Sign Out</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden lg:inline">Lock Screen</span>
                  </>
                )}
              </button>
            )}

            {/* Standalone Full-Screen Mode Toggle */}
            <button
              type="button"
              onClick={toggleAppFullscreen}
              className="p-1.5 sm:px-2 sm:py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Full Screen' : 'Toggle Full Screen Mode'}
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Maximize className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="hidden xl:inline">{isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}</span>
            </button>

            {/* Open in Standalone Tab (outside of AI Studio iframe) */}
            {inIframe && (
              <button
                type="button"
                onClick={() => openInStandaloneWindow()}
                className="p-1.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border border-blue-400/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs animate-pulse"
                title="Open Independent Full-Screen App in New Browser Tab (No AI Studio frame)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open Standalone App</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 sm:space-x-1.5 border-t border-slate-800/80 pt-1 overflow-x-auto pb-1 scrollbar-none items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-t-lg text-xs font-semibold tracking-tight transition-all whitespace-nowrap border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-slate-800/60 shadow-inner'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== 0 && item.badge !== '0' && (
                  <span
                    title={item.badgeTooltip}
                    className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold transition-all ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
