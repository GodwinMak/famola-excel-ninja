import { AppUser, EmailAccessInvitation, ScreenId, ScreenPermissions } from '../types';
import {
  loadStoredUsers,
  saveStoredUsers,
  generateUniquePin,
  getDefaultScreenPermissionsForRole,
  getUserScreenPermission
} from './storage';
import { getPublicAppBaseUrl } from './appInfoService';
import { getAuthToken, setAuthToken, clearAuthToken, authHeaders, API_BASE } from './authToken';

const INVITATIONS_STORAGE_KEY = 'po_tracker_email_invitations_v1';
const CURRENT_USER_STORAGE_KEY = 'po_tracker_active_session_user_v1';

export const DEFAULT_INVITATIONS: EmailAccessInvitation[] = [
  {
    id: 'inv-ninja',
    email: 'excelninjatz@gmail.com',
    name: 'Excel Ninja Admin',
    role: 'Admin',
    department: 'Executive Management',
    token: 'token_ninja_admin_secure_access_2026',
    accessUrl: '',
    createdAt: '2026-01-10',
    expiresAt: '2027-01-10',
    status: 'Active',
  },
  {
    id: 'inv-1',
    email: 'admin@enterprisegroup.com',
    name: 'Famola Admin',
    role: 'Admin',
    department: 'Executive Management',
    token: 'token_famola_admin_secure_access_2026',
    accessUrl: '',
    createdAt: '2026-01-15',
    expiresAt: '2027-01-15',
    status: 'Active',
    lastUsedAt: '2026-03-01',
  },
];

export const loadStoredInvitations = (): EmailAccessInvitation[] => {
  try {
    const raw = localStorage.getItem(INVITATIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load Invitations', e);
  }
  saveStoredInvitations(DEFAULT_INVITATIONS);
  return DEFAULT_INVITATIONS;
};

export const saveStoredInvitations = (invitations: EmailAccessInvitation[]) => {
  try {
    localStorage.setItem(INVITATIONS_STORAGE_KEY, JSON.stringify(invitations));
  } catch (e) {
    console.error('Failed to save Invitations', e);
  }
};

/**
 * Pushes the full local user roster to the backend so credential/permission
 * changes made in the Settings UI actually take effect against the real,
 * backend-enforced login (see backend routes/users.ts POST /sync). Fire-and-forget:
 * the local roster is still the UI's own source of truth for this admin screen.
 */
const syncUsersToBackend = (users: AppUser[]) => {
  fetch(`${API_BASE}/api/users/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ users }),
  }).catch((e) => console.warn('User roster backend sync note:', e));
};

/**
 * Generates a local invitation record + a shareable summary for an admin to
 * copy/paste to a new user, and registers the account (with its password/PIN)
 * both locally and on the backend so the credentials actually work for login.
 */
export const generateEmailAccessLink = (
  email: string,
  name: string,
  role: AppUser['role'],
  department: string = 'Operations',
  invitedBy: string = 'Famola Admin',
  assignedPermissions?: ScreenPermissions
): { invitation: EmailAccessInvitation; accessLink: string } => {
  const cleanEmail = email.trim().toLowerCase();
  const token = `famola_${Date.now().toString(36)}`;

  const origin = getPublicAppBaseUrl();
  const pathname = window.location.pathname;
  const accessLink = `${origin}${pathname}`;

  const now = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(now.getDate() + 90);

  const defaultPerms = getDefaultScreenPermissionsForRole(role);
  const effectivePermissions: ScreenPermissions = {
    ...defaultPerms,
    ...(assignedPermissions || {}),
    ...(role === 'Admin' ? {} : { settings: 'none' }),
  };

  const invitation: EmailAccessInvitation = {
    id: `inv-${Date.now()}`,
    email: cleanEmail,
    name: name.trim(),
    role,
    department: department.trim(),
    token,
    accessUrl: accessLink,
    createdAt: now.toISOString().slice(0, 10),
    expiresAt: expiryDate.toISOString().slice(0, 10),
    status: 'Active',
    invitedBy,
    screenPermissions: effectivePermissions,
  };

  const stored = loadStoredInvitations();
  const filtered = stored.filter((i) => i.email !== cleanEmail);
  const updated = [invitation, ...filtered];
  saveStoredInvitations(updated);

  const users = loadStoredUsers();
  const existingUserIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  if (existingUserIndex >= 0) {
    users[existingUserIndex].name = name;
    users[existingUserIndex].role = role;
    users[existingUserIndex].department = department;
    users[existingUserIndex].status = 'Active';
    users[existingUserIndex].screenPermissions = effectivePermissions;
    saveStoredUsers(users);
    syncUsersToBackend(users);
  } else {
    const newPin = generateUniquePin(users);
    const newUser: AppUser = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      role,
      department,
      status: 'Active',
      createdAt: now.toISOString().slice(0, 10),
      pinCode: newPin,
      password: newPin,
      screenPermissions: effectivePermissions,
    };
    const updatedUsers = [newUser, ...users];
    saveStoredUsers(updatedUsers);
    syncUsersToBackend(updatedUsers);
  }

  return { invitation, accessLink };
};

/**
 * JWT session management. The token is the real security boundary (verified
 * server-side on every request); the cached user object below is a display
 * convenience only.
 */
export const isSessionAuthenticated = (): boolean => Boolean(getAuthToken());

export const setSessionAuthenticated = (user: AppUser) => {
  setCurrentSessionUser(user);
};

export const lockCurrentSession = () => {
  clearAuthToken();
  clearSessionUser();
};

export const getCurrentSessionUser = (): AppUser => {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to get session user', e);
  }
  const fallback = loadStoredUsers()[0] || {
    id: 'usr-1',
    name: 'Famola Admin',
    email: 'admin@enterprisegroup.com',
    role: 'Admin',
    department: 'Executive Management',
    status: 'Active',
    createdAt: '2026-01-15',
  };
  return fallback;
};

export const setCurrentSessionUser = (user: AppUser) => {
  try {
    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save session user', e);
  }
};

export const clearSessionUser = () => {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
};

/**
 * Backend-authenticated login. Replaces the old client-only credential check:
 * the password/PIN is verified server-side against a bcrypt hash, and a JWT
 * is issued and cached for subsequent API calls.
 */
export const loginWithPassword = async (
  userId: string,
  password: string
): Promise<{ success: boolean; user?: AppUser; message: string }> => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, message: json.error || 'Sign-in failed.' };
    }
    setAuthToken(json.token);
    setSessionAuthenticated(json.user);
    return { success: true, user: json.user, message: `Welcome back, ${json.user.name}! You are signed in as ${json.user.role}.` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error while signing in.' };
  }
};

export const loginWithPin = async (
  pin: string,
  userId?: string
): Promise<{ success: boolean; user?: AppUser; message: string }> => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, userId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, message: json.error || 'Incorrect PIN.' };
    }
    setAuthToken(json.token);
    setSessionAuthenticated(json.user);
    return { success: true, user: json.user, message: `Authenticated successfully as ${json.user.name} (${json.user.role})` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error while signing in.' };
  }
};

/**
 * Rehydrates the current user from the backend using the cached JWT (called on
 * app boot). Clears the token if it's missing/expired/invalid.
 */
export const fetchCurrentUser = async (): Promise<AppUser | null> => {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
    if (!res.ok) {
      clearAuthToken();
      return null;
    }
    const json = await res.json();
    if (json.success && json.user) {
      setCurrentSessionUser(json.user);
      return json.user;
    }
    clearAuthToken();
    return null;
  } catch {
    return null;
  }
};

/**
 * Role-Based Access Control (RBAC) helpers. Enforced for real server-side in
 * backend middleware/rbac.ts; these are UX-gating conveniences (hide nav items,
 * disable buttons) that mirror the same logic.
 */
export const isAdminUser = (user?: AppUser | null): boolean => {
  if (!user) return false;
  const r = (user.role || '').trim().toLowerCase();
  return r === 'admin' || r === 'adm' || r === 'administrator' || r === 'system admin';
};

export const canDeleteData = (user?: AppUser | null): boolean => {
  return isAdminUser(user);
};

export const isUserOnHold = (user?: AppUser | null): boolean => {
  if (!user) return false;
  return user.status === 'On Hold';
};

export const canLoadDatabase = (user?: AppUser | null): boolean => {
  return isAdminUser(user);
};

export const canExportDatabase = (user?: AppUser | null): boolean => {
  return true;
};

export const canAccessDatabaseOperations = (user?: AppUser | null): boolean => {
  return isAdminUser(user);
};

export const canAccessSettings = (user?: AppUser | null): boolean => {
  return isAdminUser(user);
};

export const canViewScreen = (user?: AppUser | null, screenId?: ScreenId): boolean => {
  if (!screenId) return false;
  if (!user) return false;
  if (user.status === 'On Hold' || user.status === 'Inactive') return false;
  if (screenId === 'database' || screenId === 'settings') {
    return isAdminUser(user);
  }
  if (isAdminUser(user)) {
    if (user.screenPermissions && user.screenPermissions[screenId] !== undefined) {
      return user.screenPermissions[screenId] !== 'none';
    }
    return true;
  }
  const level = getUserScreenPermission(user, screenId);
  return level === 'view' || level === 'edit';
};

export const getAllowedScreensForUser = (user?: AppUser | null): ScreenId[] => {
  if (!user || user.status === 'On Hold' || user.status === 'Inactive') return [];
  const allScreens: ScreenId[] = [
    'dashboard',
    'issue_tracking',
    'matching_report',
    'po_master',
    'create_invoice',
    'invoices_db',
    'delivery_notes',
    'delivery_details',
    'payments',
    'ledger',
    ...(isAdminUser(user) ? (['settings', 'database'] as ScreenId[]) : []),
  ];
  return allScreens.filter((screenId) => canViewScreen(user, screenId));
};

export const canEditScreen = (user?: AppUser | null, screenId?: ScreenId): boolean => {
  if (!user || !screenId) return false;
  if (user.status === 'On Hold' || user.status === 'Inactive') return false;
  if (isAdminUser(user)) return true;
  const level = getUserScreenPermission(user, screenId);
  return level === 'edit';
};

export const canRecordInvoice = (user?: AppUser | null): boolean => {
  return canEditScreen(user, 'create_invoice');
};

export const canRecordDelivery = (user?: AppUser | null): boolean => {
  return canEditScreen(user, 'delivery_notes') || canEditScreen(user, 'delivery_details');
};

export const canRecordPayment = (user?: AppUser | null): boolean => {
  return canEditScreen(user, 'payments');
};

export const canUploadPOData = (user?: AppUser | null): boolean => {
  return canLoadDatabase(user);
};

export const toggleUserHoldStatus = (userId: string): AppUser | null => {
  const users = loadStoredUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  const currentStatus = users[index].status;
  const newStatus: AppUser['status'] = currentStatus === 'On Hold' ? 'Active' : 'On Hold';
  users[index].status = newStatus;

  saveStoredUsers(users);
  syncUsersToBackend(users);

  const sessionUser = getCurrentSessionUser();
  if (sessionUser?.id === userId) {
    setCurrentSessionUser(users[index]);
  }

  return users[index];
};

export const regenerateUserPin = (userId: string): { user: AppUser; newPin: string } | null => {
  const users = loadStoredUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  const newPin = generateUniquePin(users, userId);
  users[index].pinCode = newPin;
  users[index].password = newPin;
  saveStoredUsers(users);
  syncUsersToBackend(users);

  const sessionUser = getCurrentSessionUser();
  if (sessionUser?.id === userId) {
    setCurrentSessionUser(users[index]);
  }

  return { user: users[index], newPin };
};

export const resetUserPassword = (
  userId: string,
  customPassword?: string
): { user: AppUser; newPassword: string; error?: string } | null => {
  const users = loadStoredUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  const targetUser = users[index];
  let finalPassword = (customPassword || '').trim();

  if (!finalPassword) {
    finalPassword = generateUniquePin(users, userId);
  } else {
    const duplicate = users.find(
      (u) => u.id !== userId && (u.password || u.pinCode || '').trim().toLowerCase() === finalPassword.toLowerCase()
    );
    if (duplicate) {
      return {
        user: targetUser,
        newPassword: finalPassword,
        error: `Password is already in use by ${duplicate.name} (${duplicate.role}). Each user must have a different password.`,
      };
    }
  }

  users[index].password = finalPassword;
  users[index].pinCode = finalPassword;
  saveStoredUsers(users);
  syncUsersToBackend(users);

  const sessionUser = getCurrentSessionUser();
  if (sessionUser?.id === userId) {
    setCurrentSessionUser(users[index]);
  }

  return { user: users[index], newPassword: finalPassword };
};

export const updateUserScreenPermission = (
  userId: string,
  screenId: ScreenId,
  level: 'none' | 'view' | 'edit'
): AppUser | null => {
  const users = loadStoredUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  if (!users[index].screenPermissions) {
    users[index].screenPermissions = getDefaultScreenPermissionsForRole(users[index].role);
  }
  users[index].screenPermissions![screenId] = level;
  saveStoredUsers(users);
  syncUsersToBackend(users);

  const sessionUser = getCurrentSessionUser();
  if (sessionUser?.id === userId) {
    setCurrentSessionUser(users[index]);
  }

  return users[index];
};

export const generateShareableLoginLink = (user: AppUser): string => {
  const origin = getPublicAppBaseUrl();
  const pathname = window.location.pathname;
  return `${origin}${pathname}`;
};

const formatUserPermissionSummary = (user: AppUser): string => {
  const perms = user.screenPermissions || getDefaultScreenPermissionsForRole(user.role);
  const viewOnly: string[] = [];
  const actionAllowed: string[] = [];

  const screenNames: Record<ScreenId, string> = {
    dashboard: 'Dashboard',
    po_master: 'PO Master Data',
    create_invoice: 'Record Invoice',
    invoices_db: 'Invoices Database',
    issue_tracking: 'Issue Resolution Hub',
    delivery_notes: 'Delivery Notes (DN)',
    delivery_details: 'Delivery Details (Database)',
    matching_report: '3-Way Matching Report',
    payments: 'Payments & Remittances',
    ledger: 'PO Tracking Ledger',
    settings: 'System Settings',
    database: 'Master Database',
  };

  Object.entries(perms).forEach(([screenId, level]) => {
    if (screenId === 'settings' || screenId === 'database') return;
    const name = screenNames[screenId as ScreenId] || screenId;
    if (level === 'edit') {
      actionAllowed.push(name);
    } else if (level === 'view') {
      viewOnly.push(name);
    }
  });

  return [
    `- Assigned Actions (Can Edit / Take Action): ${actionAllowed.length > 0 ? actionAllowed.join(', ') : 'None'}`,
    `- Viewable Screens (Read-Only Access): ${viewOnly.length > 0 ? viewOnly.join(', ') : 'None'}`,
    `- System Settings & Database: Strictly Restricted (Administrator Only)`,
  ].join('\n');
};

export const getUserLoginInvitationText = (user: AppUser): string => {
  const loginUrl = generateShareableLoginLink(user);
  const accessSummary = formatUserPermissionSummary(user);
  const psw = (user.password || user.pinCode || '').trim();
  return `Subject: Access Link & Password for FAMOLA PO & Invoicing System (TZS)

Dear ${user.name},

You have been granted access to the FAMOLA Enterprise PO, Invoicing & Delivery Management System.

Your Login Details:
- User ID: ${user.id}
- Name: ${user.name}
- Department: ${user.department}
- Role: ${user.role}
- Status: ${user.status}
- Password / PIN: ${psw}

Assigned Permissions:
${accessSummary}

App Link:
${loginUrl}

Instructions:
1. Open the link above in your web browser.
2. Enter your User ID (${user.id}) and assigned password (${psw}) on the sign-in screen.
3. You will only see your assigned screens and can perform assigned actions.

Best regards,
FAMOLA System Administrator
`;
};

/**
 * Generates an email body template ready to copy and paste to user
 */
export const getEmailInvitationText = (invitation: EmailAccessInvitation): string => {
  const users = loadStoredUsers();
  const user = users.find((u) => u.email.toLowerCase() === invitation.email.toLowerCase());
  const pin = user?.pinCode || '';
  const loginUrl = user ? generateShareableLoginLink(user) : invitation.accessUrl;
  const accessSummary = user
    ? formatUserPermissionSummary(user)
    : '- Assigned Actions: Based on assigned role\n- System Settings: Restricted to Administrator';

  return `Subject: Secure Access & 4-Digit PIN to FAMOLA Excel Ninja (TZS)

Dear ${invitation.name},

You have been granted access to the FAMOLA Excel Ninja Enterprise Purchase Order, Invoicing, and Delivery Management System.

Role: ${invitation.role}
Department: ${invitation.department}
Authorized Email: ${invitation.email}
4-Digit Password (PIN): ${pin}

Assigned Permissions:
${accessSummary}

Open the app here and sign in with your User ID and PIN:
${loginUrl}

Best regards,
FAMOLA Administrator
`;
};
