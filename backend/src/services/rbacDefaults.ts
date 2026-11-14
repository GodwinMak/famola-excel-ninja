import { UserRole } from '../models/User';

export type ScreenId =
  | 'dashboard'
  | 'po_master'
  | 'create_invoice'
  | 'invoices_db'
  | 'issue_tracking'
  | 'delivery_notes'
  | 'delivery_details'
  | 'matching_report'
  | 'payments'
  | 'ledger'
  | 'settings'
  | 'database';

export type ScreenAccessLevel = 'none' | 'view' | 'edit';
export type ScreenPermissions = Partial<Record<ScreenId, ScreenAccessLevel>>;

export function getDefaultScreenPermissionsForRole(role: UserRole): ScreenPermissions {
  if (role === 'Admin') {
    return {
      dashboard: 'edit',
      po_master: 'edit',
      create_invoice: 'edit',
      invoices_db: 'edit',
      issue_tracking: 'edit',
      delivery_notes: 'edit',
      delivery_details: 'edit',
      matching_report: 'edit',
      payments: 'edit',
      ledger: 'edit',
      settings: 'edit',
      database: 'edit',
    };
  }

  if (role === 'Finance Officer') {
    return {
      dashboard: 'edit',
      po_master: 'view',
      create_invoice: 'edit',
      invoices_db: 'edit',
      issue_tracking: 'edit',
      delivery_notes: 'view',
      delivery_details: 'view',
      matching_report: 'view',
      payments: 'edit',
      ledger: 'view',
      settings: 'none',
    };
  }

  if (role === 'Logistics Manager') {
    return {
      dashboard: 'view',
      po_master: 'view',
      create_invoice: 'view',
      invoices_db: 'view',
      issue_tracking: 'edit',
      delivery_notes: 'edit',
      delivery_details: 'edit',
      matching_report: 'view',
      payments: 'view',
      ledger: 'view',
      settings: 'none',
    };
  }

  if (role === 'Billing Clerk') {
    return {
      dashboard: 'view',
      po_master: 'view',
      create_invoice: 'edit',
      invoices_db: 'view',
      issue_tracking: 'view',
      delivery_notes: 'view',
      delivery_details: 'view',
      matching_report: 'none',
      payments: 'view',
      ledger: 'view',
      settings: 'none',
    };
  }

  // Auditor / default
  return {
    dashboard: 'view',
    po_master: 'view',
    create_invoice: 'view',
    invoices_db: 'view',
    issue_tracking: 'view',
    delivery_notes: 'view',
    delivery_details: 'view',
    matching_report: 'view',
    payments: 'view',
    ledger: 'view',
    settings: 'none',
  };
}

export function isAdminRole(role?: UserRole | null): boolean {
  return role === 'Admin';
}

export function getEffectiveScreenLevel(
  role: UserRole,
  screenPermissions: ScreenPermissions | null | undefined,
  screenId: ScreenId
): ScreenAccessLevel {
  if (isAdminRole(role)) return 'edit';
  if (screenPermissions && screenPermissions[screenId]) {
    return screenPermissions[screenId] as ScreenAccessLevel;
  }
  if (screenId === 'delivery_details' && screenPermissions?.delivery_notes) {
    return screenPermissions.delivery_notes;
  }
  return getDefaultScreenPermissionsForRole(role)[screenId] || 'none';
}

export function canAccessScreen(
  role: UserRole,
  status: 'Active' | 'On Hold' | 'Inactive',
  screenPermissions: ScreenPermissions | null | undefined,
  screenId: ScreenId,
  level: 'view' | 'edit'
): boolean {
  if (status === 'On Hold' || status === 'Inactive') return false;

  if (screenId === 'database' || screenId === 'settings') {
    return isAdminRole(role);
  }

  const effective = getEffectiveScreenLevel(role, screenPermissions, screenId);
  if (level === 'view') return effective === 'view' || effective === 'edit';
  return effective === 'edit';
}
