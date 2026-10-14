import { 
  POLineItem, 
  PurchaseOrderGroup, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  MatchingItem, 
  DashboardMetrics,
  SeriesSettings,
  CustomerSeriesBook,
  AppUser,
  DocumentIssueRecord,
  ScreenId,
  ScreenAccessLevel,
  ScreenPermissions
} from '../types';
import { 
  INITIAL_PO_DATA, 
  INITIAL_INVOICES, 
  INITIAL_DELIVERY_NOTES, 
  INITIAL_PAYMENTS,
  INITIAL_DOCUMENT_ISSUES
} from './sampleData';
import {
  idbGet,
  idbSet,
  STORES,
  safeLocalStorageSet,
} from './idbStorage';

// In-memory cache to guarantee synchronous access and zero data loss on localStorage quota limit
let memoryPOs: POLineItem[] | null = null;
let memoryInvoices: InvoiceRecord[] | null = null;
let memoryDNs: DeliveryNoteRecord[] | null = null;
let memoryPayments: PaymentRecord[] | null = null;
let memoryIssues: DocumentIssueRecord[] | null = null;

const PO_STORAGE_KEY = 'po_tracker_master_po_v1';
const INVOICE_STORAGE_KEY = 'po_tracker_invoices_v1';
const DN_STORAGE_KEY = 'po_tracker_delivery_notes_v1';
const PAYMENT_STORAGE_KEY = 'po_tracker_payments_v1';
const ISSUES_STORAGE_KEY = 'po_tracker_document_issues_v1';
const SERIES_STORAGE_KEY = 'po_tracker_series_config_v1';
const CUSTOMER_SERIES_STORAGE_KEY = 'po_tracker_customer_series_books_v1';
const USERS_STORAGE_KEY = 'po_tracker_users_v1';

export const DEFAULT_CUSTOMER_BOOKS: CustomerSeriesBook[] = [
  {
    id: 'book-cru',
    customerName: 'CRU Mining Ltd',
    invoicePrefix: 'CRU',
    invoiceStartNumber: 1,
    invoiceEndNumber: 200,
    invoiceCurrentNumber: 1,
    deliveryPrefix: 'CRU',
    deliveryStartNumber: 1,
    deliveryEndNumber: 200,
    deliveryCurrentNumber: 1,
    padding: 3,
    description: 'Series book CRU001 - CRU200 for CRU Mining Ltd',
    updatedAt: '2026-03-01',
  },
  {
    id: 'book-grb',
    customerName: 'GRB Logistics',
    invoicePrefix: 'GRB',
    invoiceStartNumber: 1,
    invoiceEndNumber: 100,
    invoiceCurrentNumber: 1,
    deliveryPrefix: 'GRB',
    deliveryStartNumber: 1,
    deliveryEndNumber: 100,
    deliveryCurrentNumber: 1,
    padding: 3,
    description: 'Series book GRB001 - GRB100 for GRB Logistics',
    updatedAt: '2026-03-01',
  },
  {
    id: 'book-acacia',
    customerName: 'Acacia Mining PLC',
    invoicePrefix: 'ACA',
    invoiceStartNumber: 1,
    invoiceEndNumber: 200,
    invoiceCurrentNumber: 1,
    deliveryPrefix: 'ACA',
    deliveryStartNumber: 1,
    deliveryEndNumber: 200,
    deliveryCurrentNumber: 1,
    padding: 3,
    description: 'Series book ACA001 - ACA200 for Acacia Mining PLC',
    updatedAt: '2026-03-01',
  }
];

export const DEFAULT_SERIES_CONFIG: SeriesSettings = {
  invoiceSeries: {
    prefix: 'INV-',
    startNumber: 1,
    endNumber: 600,
    currentNumber: 1,
    padding: 3,
    autoIncrement: true,
  },
  deliverySeries: {
    prefix: 'DN-',
    startNumber: 1,
    endNumber: 600,
    currentNumber: 1,
    padding: 3,
    autoIncrement: true,
  },
};

export const generateFourDigitPin = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Generates a 4-digit PIN that is guaranteed not to be in use by any other user
 */
export const generateUniquePin = (existingUsers?: AppUser[], excludeUserId?: string): string => {
  const used = new Set(
    (existingUsers || [])
      .filter((u) => !excludeUserId || u.id !== excludeUserId)
      .map((u) => (u.password || u.pinCode || '').trim())
      .filter(Boolean)
  );

  let attempts = 0;
  while (attempts < 10000) {
    const candidate = Math.floor(1000 + Math.random() * 9000).toString();
    if (!used.has(candidate)) {
      return candidate;
    }
    attempts += 1;
  }
  return Math.floor(10000 + Math.random() * 90000).toString();
};

export const getUserPassword = (user?: AppUser | null): string => {
  if (!user) return '1234';
  return (user.password || user.pinCode || '1234').trim();
};

export const setUserPassword = (user: AppUser, newPassword: string): AppUser => {
  const clean = newPassword.trim();
  return {
    ...user,
    password: clean,
    pinCode: clean,
  };
};

/**
 * Audits a user list and guarantees each user has a strictly different password
 */
export const ensureUsersHaveUniquePasswords = (users: AppUser[]): { users: AppUser[]; modified: boolean } => {
  const seen = new Set<string>();
  let modified = false;

  const updated = users.map((u) => {
    let psw = (u.password || u.pinCode || '').trim();
    if (!psw || seen.has(psw)) {
      // Collision detected or missing! Assign a new unique password
      const newPin = generateUniquePin(users, u.id);
      modified = true;
      psw = newPin;
      return {
        ...u,
        password: psw,
        pinCode: psw,
      };
    }
    seen.add(psw);
    // Ensure both password and pinCode are in sync
    if (u.password !== psw || u.pinCode !== psw) {
      modified = true;
      return {
        ...u,
        password: psw,
        pinCode: psw,
      };
    }
    return u;
  });

  return { users: updated, modified };
};

export const getDefaultScreenPermissionsForRole = (role: AppUser['role']): ScreenPermissions => {
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
};

export const getUserScreenPermission = (user?: AppUser | null, screenId?: ScreenId): ScreenAccessLevel => {
  if (!user || !screenId) return 'none';
  if (user.role === 'Admin') return 'edit';
  if (user.screenPermissions && user.screenPermissions[screenId]) {
    return user.screenPermissions[screenId]!;
  }
  // If delivery_details is not explicitly set in custom permissions, fallback to delivery_notes
  if (screenId === 'delivery_details' && user.screenPermissions?.delivery_notes) {
    return user.screenPermissions.delivery_notes;
  }
  return getDefaultScreenPermissionsForRole(user.role)[screenId] || 'none';
};

export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'Excel',
    username: 'Excel',
    name: 'Excel',
    email: 'excelninjatz@gmail.com',
    role: 'Admin',
    department: 'Executive Management',
    status: 'Active',
    createdAt: '2026-01-10',
    pinCode: '1234',
    password: '1234',
    screenPermissions: getDefaultScreenPermissionsForRole('Admin'),
  },
  {
    id: 'usr-admin-ninja',
    username: 'Excel Ninja Admin',
    name: 'Excel Ninja Admin',
    email: 'excelninjatz@gmail.com',
    role: 'Admin',
    department: 'Executive Management',
    status: 'Active',
    createdAt: '2026-01-10',
    pinCode: '8392',
    password: '8392',
    screenPermissions: getDefaultScreenPermissionsForRole('Admin'),
  },
  {
    id: 'usr-1',
    username: 'Famola Admin',
    name: 'Famola Admin',
    email: 'admin@enterprisegroup.com',
    role: 'Admin',
    department: 'Executive Management',
    status: 'Active',
    createdAt: '2026-01-15',
    pinCode: '5821',
    password: '5821',
    screenPermissions: getDefaultScreenPermissionsForRole('Admin'),
  },
];

export const loadStoredSeriesConfig = (): SeriesSettings => {
  try {
    const raw = localStorage.getItem(SERIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.invoiceSeries && parsed.deliverySeries) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load Series Config', e);
  }
  saveStoredSeriesConfig(DEFAULT_SERIES_CONFIG);
  return DEFAULT_SERIES_CONFIG;
};

export const saveStoredSeriesConfig = (config: SeriesSettings) => {
  safeLocalStorageSet(SERIES_STORAGE_KEY, JSON.stringify(config));
};

export const formatSeriesNumber = (prefix: string, currentNumber: number, padding: number): string => {
  const padded = padding > 0 ? String(currentNumber).padStart(padding, '0') : String(currentNumber);
  return `${prefix || ''}${padded}`;
};

export const advanceSeriesNumber = (type: 'invoice' | 'delivery'): string => {
  const config = loadStoredSeriesConfig();
  const series = type === 'invoice' ? config.invoiceSeries : config.deliverySeries;
  
  const formatted = formatSeriesNumber(series.prefix, series.currentNumber, series.padding);
  
  if (series.currentNumber < series.endNumber) {
    series.currentNumber += 1;
  } else {
    // Wrap around or stop at end
    series.currentNumber = series.startNumber;
  }

  saveStoredSeriesConfig(config);
  return formatted;
};

export const loadStoredCustomerSeriesBooks = (): CustomerSeriesBook[] => {
  try {
    const raw = localStorage.getItem(CUSTOMER_SERIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load Customer Series Books', e);
  }
  saveStoredCustomerSeriesBooks(DEFAULT_CUSTOMER_BOOKS);
  return DEFAULT_CUSTOMER_BOOKS;
};

export const saveStoredCustomerSeriesBooks = (books: CustomerSeriesBook[]) => {
  safeLocalStorageSet(CUSTOMER_SERIES_STORAGE_KEY, JSON.stringify(books));
};

export const getCustomerSeriesBook = (customerName: string): CustomerSeriesBook => {
  const books = loadStoredCustomerSeriesBooks();
  const trimmed = (customerName || '').trim();
  const matched = books.find(
    (b) => b.customerName.toLowerCase() === trimmed.toLowerCase()
  );
  if (matched) return matched;

  // Auto-generate a series book if customer is not yet configured
  const cleaned = trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const prefix = cleaned.length >= 3 ? cleaned.slice(0, 3) : (cleaned || 'CUS').padEnd(3, 'X');
  
  const newBook: CustomerSeriesBook = {
    id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    customerName: trimmed || 'General Customer',
    invoicePrefix: prefix,
    invoiceStartNumber: 1,
    invoiceEndNumber: 200,
    invoiceCurrentNumber: 1,
    deliveryPrefix: prefix,
    deliveryStartNumber: 1,
    deliveryEndNumber: 200,
    deliveryCurrentNumber: 1,
    padding: 3,
    description: `Series book ${prefix}001 - ${prefix}200 for ${trimmed || 'General Customer'}`,
    updatedAt: new Date().toISOString().split('T')[0],
  };

  const updatedBooks = [...books, newBook];
  saveStoredCustomerSeriesBooks(updatedBooks);
  return newBook;
};

export const saveOrUpdateCustomerSeriesBook = (book: CustomerSeriesBook) => {
  const books = loadStoredCustomerSeriesBooks();
  const index = books.findIndex(
    (b) => b.id === book.id || b.customerName.toLowerCase() === book.customerName.toLowerCase()
  );
  let updated: CustomerSeriesBook[];
  if (index >= 0) {
    updated = [...books];
    updated[index] = { ...book, updatedAt: new Date().toISOString().split('T')[0] };
  } else {
    updated = [...books, { ...book, updatedAt: new Date().toISOString().split('T')[0] }];
  }
  saveStoredCustomerSeriesBooks(updated);
};

export const deleteCustomerSeriesBook = (customerNameOrId: string): CustomerSeriesBook[] => {
  const books = loadStoredCustomerSeriesBooks();
  const target = (customerNameOrId || '').trim().toLowerCase();
  const updated = books.filter(
    (b) => b.id !== customerNameOrId && b.customerName.trim().toLowerCase() !== target
  );
  saveStoredCustomerSeriesBooks(updated);
  return updated;
};

export const peekCustomerSeriesNumber = (customerName: string, type: 'invoice' | 'delivery'): string => {
  if (!customerName || customerName === 'ALL') {
    const config = loadStoredSeriesConfig();
    const series = type === 'invoice' ? config.invoiceSeries : config.deliverySeries;
    return formatSeriesNumber(series.prefix, series.currentNumber, series.padding);
  }
  const book = getCustomerSeriesBook(customerName);
  if (type === 'invoice') {
    return formatSeriesNumber(book.invoicePrefix, book.invoiceCurrentNumber, book.padding);
  } else {
    return formatSeriesNumber(book.deliveryPrefix, book.deliveryCurrentNumber, book.padding);
  }
};

export const advanceCustomerSeriesNumber = (customerName: string, type: 'invoice' | 'delivery'): string => {
  if (!customerName || customerName === 'ALL') {
    return advanceSeriesNumber(type);
  }
  const book = getCustomerSeriesBook(customerName);
  let formatted = '';
  if (type === 'invoice') {
    formatted = formatSeriesNumber(book.invoicePrefix, book.invoiceCurrentNumber, book.padding);
    if (book.invoiceCurrentNumber < book.invoiceEndNumber) {
      book.invoiceCurrentNumber += 1;
    } else {
      book.invoiceCurrentNumber = book.invoiceStartNumber;
    }
  } else {
    formatted = formatSeriesNumber(book.deliveryPrefix, book.deliveryCurrentNumber, book.padding);
    if (book.deliveryCurrentNumber < book.deliveryEndNumber) {
      book.deliveryCurrentNumber += 1;
    } else {
      book.deliveryCurrentNumber = book.deliveryStartNumber;
    }
  }
  saveOrUpdateCustomerSeriesBook(book);
  return formatted;
};

export const getNextAvailableCustomerInvoiceNumber = (
  customerName: string,
  existingInvoices: { invoiceNumber?: string }[] = []
): string => {
  const existingSet = new Set(
    (existingInvoices || [])
      .map((inv) => (inv.invoiceNumber ? inv.invoiceNumber.trim().toLowerCase() : ''))
      .filter(Boolean)
  );

  if (!customerName || customerName === 'ALL') {
    const config = loadStoredSeriesConfig();
    let num = config.invoiceSeries.currentNumber;
    let candidate = formatSeriesNumber(config.invoiceSeries.prefix, num, config.invoiceSeries.padding);
    let attempts = 0;
    while (existingSet.has(candidate.toLowerCase()) && attempts < 2000) {
      num += 1;
      attempts += 1;
      candidate = formatSeriesNumber(config.invoiceSeries.prefix, num, config.invoiceSeries.padding);
    }
    return candidate;
  }

  const book = getCustomerSeriesBook(customerName);
  let num = book.invoiceCurrentNumber;
  let candidate = formatSeriesNumber(book.invoicePrefix, num, book.padding);
  let attempts = 0;

  while (existingSet.has(candidate.toLowerCase()) && attempts < 2000) {
    num += 1;
    attempts += 1;
    candidate = formatSeriesNumber(book.invoicePrefix, num, book.padding);
  }

  if (num !== book.invoiceCurrentNumber) {
    book.invoiceCurrentNumber = num;
    saveOrUpdateCustomerSeriesBook(book);
  }

  return candidate;
};

export const getNextAvailableCustomerDeliveryNumber = (
  customerName: string,
  existingDNs: { deliveryNoteNumber?: string }[] = []
): string => {
  const existingSet = new Set(
    (existingDNs || [])
      .map((dn) => (dn.deliveryNoteNumber ? dn.deliveryNoteNumber.trim().toLowerCase() : ''))
      .filter(Boolean)
  );

  if (!customerName || customerName === 'ALL') {
    const config = loadStoredSeriesConfig();
    let num = config.deliverySeries.currentNumber;
    let candidate = formatSeriesNumber(config.deliverySeries.prefix, num, config.deliverySeries.padding);
    let attempts = 0;
    while (existingSet.has(candidate.toLowerCase()) && attempts < 2000) {
      num += 1;
      attempts += 1;
      candidate = formatSeriesNumber(config.deliverySeries.prefix, num, config.deliverySeries.padding);
    }
    return candidate;
  }

  const book = getCustomerSeriesBook(customerName);
  let num = book.deliveryCurrentNumber;
  let candidate = formatSeriesNumber(book.deliveryPrefix, num, book.padding);
  let attempts = 0;

  while (existingSet.has(candidate.toLowerCase()) && attempts < 2000) {
    num += 1;
    attempts += 1;
    candidate = formatSeriesNumber(book.deliveryPrefix, num, book.padding);
  }

  if (num !== book.deliveryCurrentNumber) {
    book.deliveryCurrentNumber = num;
    saveOrUpdateCustomerSeriesBook(book);
  }

  return candidate;
};

export const loadStoredUsers = (): AppUser[] => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let changed = false;
        let normalized: AppUser[] = parsed.map((u: any) => {
          const isExcel = u.id?.toLowerCase() === 'excel' || u.name?.toLowerCase() === 'excel' || u.username?.toLowerCase() === 'excel';
          const defaultPin = isExcel ? '1234' : (u.password || u.pinCode || generateFourDigitPin());
          const permissions = u.screenPermissions || getDefaultScreenPermissionsForRole(u.role);
          const status = u.status === 'On Hold' ? 'On Hold' : (u.status === 'Inactive' ? 'Inactive' : 'Active');
          const username = u.username || (isExcel ? 'Excel' : u.name);
          const password = (u.password || u.pinCode || defaultPin).trim();
          if (!u.pinCode || !u.password || !u.screenPermissions || !u.username) changed = true;
          return {
            ...u,
            username,
            status,
            pinCode: password,
            password: password,
            screenPermissions: permissions,
          };
        });

        // Ensure user Excel is present
        const hasExcel = normalized.some(
          (u) => u.id.toLowerCase() === 'excel' || u.username?.toLowerCase() === 'excel' || u.name.toLowerCase() === 'excel'
        );
        if (!hasExcel) {
          const excelUser: AppUser = {
            id: 'Excel',
            username: 'Excel',
            name: 'Excel',
            email: 'excelninjatz@gmail.com',
            role: 'Admin',
            department: 'Executive Management',
            status: 'Active',
            createdAt: '2026-01-10',
            pinCode: '1234',
            password: '1234',
            screenPermissions: getDefaultScreenPermissionsForRole('Admin'),
          };
          normalized = [excelUser, ...normalized];
          changed = true;
        }

        // Guarantee each user has a DIFFERENT password
        const uniquenessResult = ensureUsersHaveUniquePasswords(normalized);
        if (uniquenessResult.modified) {
          normalized = uniquenessResult.users;
          changed = true;
        }

        if (changed) {
          saveStoredUsers(normalized);
        }
        return normalized;
      }
    }
  } catch (e) {
    console.error('Failed to load Users', e);
  }
  saveStoredUsers(DEFAULT_USERS);
  return DEFAULT_USERS;
};

export const saveStoredUsers = (users: AppUser[]) => {
  safeLocalStorageSet(USERS_STORAGE_KEY, JSON.stringify(users));
};

export const hydrateFromIndexedDB = async (): Promise<{
  poLines?: POLineItem[];
  invoices?: InvoiceRecord[];
  deliveryNotes?: DeliveryNoteRecord[];
  payments?: PaymentRecord[];
  issues?: DocumentIssueRecord[];
}> => {
  try {
    const [pos, invs, dns, pays, iss] = await Promise.all([
      idbGet<POLineItem[]>(STORES.PO_LINES),
      idbGet<InvoiceRecord[]>(STORES.INVOICES),
      idbGet<DeliveryNoteRecord[]>(STORES.DELIVERY_NOTES),
      idbGet<PaymentRecord[]>(STORES.PAYMENTS),
      idbGet<DocumentIssueRecord[]>(STORES.ISSUES),
    ]);

    if (Array.isArray(pos) && pos.length > 0) {
      memoryPOs = pos.filter((p) => p && !p.id?.includes('sample'));
    }
    if (Array.isArray(invs) && invs.length > 0) {
      memoryInvoices = invs.filter((inv) => inv && !inv.id?.includes('sample'));
    }
    if (Array.isArray(dns) && dns.length > 0) {
      memoryDNs = dns.filter((dn) => dn && !dn.id?.includes('sample'));
    }
    if (Array.isArray(pays) && pays.length > 0) {
      memoryPayments = pays.filter((pay) => pay && !pay.id?.includes('sample'));
    }
    if (Array.isArray(iss) && iss.length > 0) {
      memoryIssues = iss.filter((issue) => issue && !issue.id?.includes('sample'));
    }

    return {
      poLines: memoryPOs || undefined,
      invoices: memoryInvoices || undefined,
      deliveryNotes: memoryDNs || undefined,
      payments: memoryPayments || undefined,
      issues: memoryIssues || undefined,
    };
  } catch (err) {
    console.warn('[Storage] Background IndexedDB hydration notice:', err);
    return {};
  }
};

// Start background hydration as early as possible
if (typeof window !== 'undefined') {
  hydrateFromIndexedDB().catch(() => {});
}

export const loadStoredPOs = (): POLineItem[] => {
  if (memoryPOs && memoryPOs.length > 0) {
    return memoryPOs;
  }
  try {
    const raw = localStorage.getItem(PO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((p) => p && !p.id?.includes('sample'));
        memoryPOs = clean;
        return clean;
      }
    }
  } catch {
    // Ignore parse/storage errors
  }
  return memoryPOs || [];
};

export const savePOs = (pos: POLineItem[]) => {
  memoryPOs = pos;
  // Always asynchronously persist the full dataset to IndexedDB (virtually unlimited quota)
  idbSet(STORES.PO_LINES, pos).catch(() => {});
  // Safely persist to localStorage with quota overflow protection
  safeLocalStorageSet(PO_STORAGE_KEY, JSON.stringify(pos));
};

export const loadStoredInvoices = (): InvoiceRecord[] => {
  if (memoryInvoices && memoryInvoices.length > 0) {
    return memoryInvoices;
  }
  try {
    const raw = localStorage.getItem(INVOICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((inv) => inv && !inv.id?.includes('sample'));
        memoryInvoices = clean;
        return clean;
      }
    }
  } catch {
    // Ignore parse/storage errors
  }
  return memoryInvoices || [];
};

export const saveInvoices = (invoices: InvoiceRecord[]) => {
  memoryInvoices = invoices;
  idbSet(STORES.INVOICES, invoices).catch(() => {});
  safeLocalStorageSet(INVOICE_STORAGE_KEY, JSON.stringify(invoices));
};

export const loadStoredDeliveryNotes = (): DeliveryNoteRecord[] => {
  if (memoryDNs && memoryDNs.length > 0) {
    return memoryDNs;
  }
  try {
    const raw = localStorage.getItem(DN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((dn) => dn && !dn.id?.includes('sample'));
        memoryDNs = clean;
        return clean;
      }
    }
  } catch {
    // Ignore parse/storage errors
  }
  return memoryDNs || [];
};

export const saveDeliveryNotes = (dns: DeliveryNoteRecord[]) => {
  memoryDNs = dns;
  idbSet(STORES.DELIVERY_NOTES, dns).catch(() => {});
  safeLocalStorageSet(DN_STORAGE_KEY, JSON.stringify(dns));
};

export const loadStoredPayments = (): PaymentRecord[] => {
  if (memoryPayments && memoryPayments.length > 0) {
    return memoryPayments;
  }
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((pay) => pay && !pay.id?.includes('sample'));
        memoryPayments = clean;
        return clean;
      }
    }
  } catch {
    // Ignore parse/storage errors
  }
  return memoryPayments || [];
};

export const savePayments = (payments: PaymentRecord[]) => {
  memoryPayments = payments;
  idbSet(STORES.PAYMENTS, payments).catch(() => {});
  safeLocalStorageSet(PAYMENT_STORAGE_KEY, JSON.stringify(payments));
};

export const loadStoredIssues = (): DocumentIssueRecord[] => {
  if (memoryIssues && memoryIssues.length > 0) {
    return memoryIssues;
  }
  try {
    const raw = localStorage.getItem(ISSUES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((issue) => issue && !issue.id?.includes('sample'));
        memoryIssues = clean;
        return clean;
      }
    }
  } catch {
    // Ignore parse/storage errors
  }
  return memoryIssues || [];
};

export const saveIssues = (issues: DocumentIssueRecord[]) => {
  memoryIssues = issues;
  idbSet(STORES.ISSUES, issues).catch(() => {});
  safeLocalStorageSet(ISSUES_STORAGE_KEY, JSON.stringify(issues));
};

export const addOrUpdateIssue = (issue: DocumentIssueRecord): DocumentIssueRecord[] => {
  const current = loadStoredIssues();
  const index = current.findIndex((i) => issue.id && i.id === issue.id);
  let updated: DocumentIssueRecord[];
  if (index >= 0) {
    const existing = current[index];
    updated = [...current];
    updated[index] = {
      ...existing,
      ...issue,
      // Keep original flaggedAt
      flaggedAt: existing.flaggedAt || issue.flaggedAt,
      // Retain active status unless explicitly changed
      status: issue.status || existing.status || 'PENDING',
      comments: Array.isArray(issue.comments) && issue.comments.length > 0 ? issue.comments : existing.comments,
    };
  } else {
    updated = [issue, ...current];
  }
  saveIssues(updated);
  return updated;
};

export const resolveDocumentIssue = (
  issueId: string,
  resolvedBy: string,
  resolutionNotes: string
): DocumentIssueRecord[] => {
  const current = loadStoredIssues();
  const updated = current.map((item) => {
    if (item.id === issueId) {
      return {
        ...item,
        status: 'RESOLVED' as const,
        resolvedBy,
        resolvedAt: new Date().toISOString(),
        resolutionNotes,
        lineIssues: item.lineIssues.map((l) => ({ ...l, status: 'RESOLVED' as const })),
        comments: [
          ...item.comments,
          {
            id: `comm-res-${Date.now()}`,
            authorName: resolvedBy,
            authorRole: 'Reviewer / Admin',
            comment: `Issue marked as resolved: ${resolutionNotes}`,
            createdAt: new Date().toISOString(),
            type: 'RESOLUTION_NOTE' as const,
          }
        ]
      };
    }
    return item;
  });
  saveIssues(updated);
  return updated;
};

const DELETED_IDS_STORAGE_KEY = 'po_tracker_deleted_records_v1';

export const loadStoredDeletedIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_IDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load deleted records index', e);
  }
  return [];
};

export const trackDeletedRecords = (ids: (string | undefined | null)[]) => {
  try {
    const current = new Set<string>(loadStoredDeletedIds());
    ids.forEach((id) => {
      if (id && typeof id === 'string') {
        const clean = id.trim().toLowerCase();
        if (clean) current.add(clean);
      }
    });
    // Keep max 1000 most recent entries to prevent indefinite storage growth
    const list = Array.from(current);
    const trimmed = list.length > 1000 ? list.slice(list.length - 1000) : list;
    safeLocalStorageSet(DELETED_IDS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
};

export const untrackDeletedRecords = (ids: (string | undefined | null)[]) => {
  try {
    const current = new Set<string>(loadStoredDeletedIds());
    let modified = false;
    ids.forEach((id) => {
      if (id && typeof id === 'string') {
        const clean = id.trim().toLowerCase();
        if (clean && current.has(clean)) {
          current.delete(clean);
          modified = true;
        }
      }
    });
    if (modified) {
      safeLocalStorageSet(DELETED_IDS_STORAGE_KEY, JSON.stringify(Array.from(current)));
    }
  } catch {
    // ignore
  }
};

export const clearStoredPOs = (): POLineItem[] => {
  savePOs([]);
  return [];
};

export const resetToSampleData = () => {
  savePOs(INITIAL_PO_DATA);
  saveInvoices(INITIAL_INVOICES);
  saveDeliveryNotes(INITIAL_DELIVERY_NOTES);
  savePayments(INITIAL_PAYMENTS);
  saveIssues(INITIAL_DOCUMENT_ISSUES);
  return { 
    pos: INITIAL_PO_DATA, 
    invoices: INITIAL_INVOICES,
    deliveryNotes: INITIAL_DELIVERY_NOTES,
    payments: INITIAL_PAYMENTS,
    issues: INITIAL_DOCUMENT_ISSUES,
  };
};

export const clearAllData = () => {
  savePOs([]);
  saveInvoices([]);
  saveDeliveryNotes([]);
  savePayments([]);
  saveIssues([]);
  saveStoredUsers(DEFAULT_USERS);
  return { 
    pos: [], 
    invoices: [], 
    deliveryNotes: [], 
    payments: [], 
    issues: [], 
    users: DEFAULT_USERS 
  };
};

// Reconcile and calculate line tracking against all recorded invoices and delivery notes
export const enrichPOLinesWithTracking = (
  rawLines: POLineItem[] = [],
  invoices: InvoiceRecord[] = [],
  deliveryNotes: DeliveryNoteRecord[] = []
): POLineItem[] => {
  // Map of total invoiced qty by (poNumber + poLineId) or (poNumber + itemDescription)
  const invoicedQtyByLineId = new Map<string, number>();
  const invoicedQtyByDesc = new Map<string, number>();

  (invoices || []).forEach((inv) => {
    if (!inv || inv.isCancelled || inv.status === 'CANCELLED') return;
    const invPoClean = (inv.poNumber || '').trim().toLowerCase();
    if (!invPoClean) return;

    (inv.lines || []).forEach((line) => {
      if (!line) return;
      const qty = Number(line.invoicedQuantity) || 0;
      if (qty <= 0) return;

      if (line.poLineId) {
        const idKey = `${invPoClean}___${line.poLineId}`;
        const currentIdQty = invoicedQtyByLineId.get(idKey) || 0;
        invoicedQtyByLineId.set(idKey, currentIdQty + qty);
      }

      if (line.itemDescription) {
        const descKey = `${invPoClean}___${line.itemDescription.trim().toLowerCase()}`;
        const currentDescQty = invoicedQtyByDesc.get(descKey) || 0;
        invoicedQtyByDesc.set(descKey, currentDescQty + qty);
      }
    });
  });

  // Map of total delivered qty by (poNumber + poLineId) or (poNumber + itemDescription)
  const deliveredQtyByLineId = new Map<string, number>();
  const deliveredQtyByDesc = new Map<string, number>();

  (deliveryNotes || []).forEach((dn) => {
    if (!dn || dn.isCancelled || dn.status === 'CANCELLED') return;
    const dnPoClean = (dn.poNumber || '').trim().toLowerCase();
    if (!dnPoClean) return;

    (dn.lines || []).forEach((line) => {
      if (!line) return;
      const qty = Number(line.deliveredQuantity) || 0;
      if (qty <= 0) return;

      if (line.poLineId) {
        const idKey = `${dnPoClean}___${line.poLineId}`;
        const currentIdQty = deliveredQtyByLineId.get(idKey) || 0;
        deliveredQtyByLineId.set(idKey, currentIdQty + qty);
      }

      if (line.itemDescription) {
        const descKey = `${dnPoClean}___${line.itemDescription.trim().toLowerCase()}`;
        const currentDescQty = deliveredQtyByDesc.get(descKey) || 0;
        deliveredQtyByDesc.set(descKey, currentDescQty + qty);
      }
    });
  });

  return (rawLines || []).map((line) => {
    const poClean = (line.poNumber || '').trim().toLowerCase();
    const idKey = `${poClean}___${line.id}`;
    let invoicedQuantity = invoicedQtyByLineId.get(idKey);
    if (invoicedQuantity === undefined) {
      const descKey = `${poClean}___${(line.itemDescription || '').trim().toLowerCase()}`;
      invoicedQuantity = invoicedQtyByDesc.get(descKey) || 0;
    }

    let deliveredQuantity = deliveredQtyByLineId.get(idKey);
    if (deliveredQuantity === undefined) {
      const descKey = `${poClean}___${(line.itemDescription || '').trim().toLowerCase()}`;
      deliveredQuantity = deliveredQtyByDesc.get(descKey) || 0;
    }

    const remainingQuantity = Math.max(0, line.quantity - invoicedQuantity);
    const undeliveredQuantity = Math.max(0, line.quantity - deliveredQuantity);

    let status: 'UNINVOICED' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED' = 'UNINVOICED';
    if (invoicedQuantity >= line.quantity && line.quantity > 0) {
      status = 'FULLY_INVOICED';
    } else if (invoicedQuantity > 0) {
      status = 'PARTIALLY_INVOICED';
    }

    return {
      ...line,
      invoicedQuantity,
      remainingQuantity,
      deliveredQuantity,
      undeliveredQuantity,
      status,
    };
  });
};

export interface ReconciliationResult {
  updatedPoLines: POLineItem[];
  updatedInvoices: InvoiceRecord[];
  updatedDeliveryNotes: DeliveryNoteRecord[];
  updatedIssues: DocumentIssueRecord[];
  reconciledCounts: {
    invoicesUpdated: number;
    deliveryNotesUpdated: number;
    issuesUpdated: number;
    linesLinked: number;
  };
}

/**
 * Reconciles and updates Invoices, Delivery Notes, and Issues against new/active PO line data.
 * Links lines, synchronizes header fields, resolves missing-PO issues, and recalculates available balances.
 */
export const reconcileRelationshipsWithNewPOs = (
  rawPoLines: POLineItem[] = [],
  invoices: InvoiceRecord[] = [],
  deliveryNotes: DeliveryNoteRecord[] = [],
  issues: DocumentIssueRecord[] = []
): ReconciliationResult => {
  let invoicesUpdated = 0;
  let deliveryNotesUpdated = 0;
  let issuesUpdated = 0;
  let linesLinked = 0;

  // 1. Group PO lines by normalized PO number
  const poLinesByNumber = new Map<string, POLineItem[]>();
  const poLineById = new Map<string, POLineItem>();
  const poLineByDescKey = new Map<string, POLineItem>();

  (rawPoLines || []).forEach((po) => {
    if (!po || !po.poNumber) return;
    const poNorm = po.poNumber.trim().toLowerCase();
    const list = poLinesByNumber.get(poNorm) || [];
    list.push(po);
    poLinesByNumber.set(poNorm, list);

    if (po.id) {
      poLineById.set(po.id.toLowerCase().trim(), po);
    }
    if (po.itemDescription) {
      const descKey = `${poNorm}___${po.itemDescription.trim().toLowerCase()}`;
      if (!poLineByDescKey.has(descKey)) {
        poLineByDescKey.set(descKey, po);
      }
    }
  });

  // 2. Reconcile Invoices
  const updatedInvoices = (invoices || []).map((inv) => {
    if (!inv) return inv;
    const invPoNorm = (inv.poNumber || '').trim().toLowerCase();
    const matchedPoLines = invPoNorm ? poLinesByNumber.get(invPoNorm) : undefined;
    const samplePo = matchedPoLines && matchedPoLines.length > 0 ? matchedPoLines[0] : null;

    let invModified = false;
    let newCustomer = inv.customerName;
    let newDest = inv.destination;
    let newContract = inv.contract;
    let newPoDate = inv.poDate;

    if (samplePo) {
      if ((!inv.customerName || inv.customerName === 'Unknown' || inv.customerName === 'General Customer') && samplePo.customerName) {
        newCustomer = samplePo.customerName;
        invModified = true;
      }
      if (!inv.destination && samplePo.destination) {
        newDest = samplePo.destination;
        invModified = true;
      }
      if (!inv.contract && samplePo.contract) {
        newContract = samplePo.contract;
        invModified = true;
      }
      if (!inv.poDate && samplePo.date) {
        newPoDate = samplePo.date;
        invModified = true;
      }
    }

    const updatedLines = (inv.lines || []).map((line) => {
      if (!line) return line;
      let lineModified = false;
      let targetPoLine: POLineItem | undefined;

      if (line.poLineId) {
        targetPoLine = poLineById.get(line.poLineId.toLowerCase().trim());
      }
      if (!targetPoLine && invPoNorm && line.itemDescription) {
        const descKey = `${invPoNorm}___${line.itemDescription.trim().toLowerCase()}`;
        targetPoLine = poLineByDescKey.get(descKey);
      }

      if (targetPoLine) {
        let newPoLineId = line.poLineId;
        let newPoQty = line.poQuantity;
        let newUnitCost = line.unitCost;
        let newUnitPrice = line.unitPrice;
        let newUom = line.unitOfMeasure;
        let newVatRate = line.vatRate;

        if (!line.poLineId || line.poLineId !== targetPoLine.id) {
          newPoLineId = targetPoLine.id;
          lineModified = true;
          linesLinked++;
        }
        if (!line.poQuantity || line.poQuantity !== targetPoLine.quantity) {
          newPoQty = targetPoLine.quantity;
          lineModified = true;
        }
        if ((!line.unitPrice || line.unitPrice <= 0) && targetPoLine.unitPrice > 0) {
          newUnitPrice = targetPoLine.unitPrice;
          lineModified = true;
        }
        if ((!line.unitCost || line.unitCost <= 0) && targetPoLine.unitCost > 0) {
          newUnitCost = targetPoLine.unitCost;
          lineModified = true;
        }
        if ((!line.unitOfMeasure || line.unitOfMeasure === 'UNIT') && targetPoLine.unitOfMeasure) {
          newUom = targetPoLine.unitOfMeasure;
          lineModified = true;
        }
        if (line.vatRate === undefined && targetPoLine.vatRate !== undefined) {
          newVatRate = targetPoLine.vatRate;
          lineModified = true;
        }

        if (lineModified) {
          invModified = true;
          return {
            ...line,
            poLineId: newPoLineId,
            poQuantity: newPoQty,
            unitCost: newUnitCost,
            unitPrice: newUnitPrice,
            unitOfMeasure: newUom,
            vatRate: newVatRate,
          };
        }
      }
      return line;
    });

    if (invModified) {
      invoicesUpdated++;
      return {
        ...inv,
        customerName: newCustomer,
        destination: newDest,
        contract: newContract,
        poDate: newPoDate,
        lines: updatedLines,
      };
    }
    return inv;
  });

  // Map of invoices by normalized PO number to cross-link delivery notes
  const invoicesByPoNorm = new Map<string, InvoiceRecord[]>();
  updatedInvoices.forEach((i) => {
    if (!i.poNumber || i.isCancelled || i.status === 'CANCELLED') return;
    const k = i.poNumber.trim().toLowerCase();
    const l = invoicesByPoNorm.get(k) || [];
    l.push(i);
    invoicesByPoNorm.set(k, l);
  });

  // 3. Reconcile Delivery Notes
  const updatedDeliveryNotes = (deliveryNotes || []).map((dn) => {
    if (!dn) return dn;
    const dnPoNorm = (dn.poNumber || '').trim().toLowerCase();
    const matchedPoLines = dnPoNorm ? poLinesByNumber.get(dnPoNorm) : undefined;
    const samplePo = matchedPoLines && matchedPoLines.length > 0 ? matchedPoLines[0] : null;

    let dnModified = false;
    let newCustomer = dn.customerName;
    let newDest = dn.destination;
    let newContract = dn.contract;
    let newPoDate = dn.poDate;
    let newMatchedInv = dn.matchedInvoiceNumber;
    let newIsFullyInvoiced = dn.isFullyInvoiced;

    if (samplePo) {
      if ((!dn.customerName || dn.customerName === 'Unknown' || dn.customerName === 'General Customer') && samplePo.customerName) {
        newCustomer = samplePo.customerName;
        dnModified = true;
      }
      if (!dn.destination && samplePo.destination) {
        newDest = samplePo.destination;
        dnModified = true;
      }
      if (!dn.contract && samplePo.contract) {
        newContract = samplePo.contract;
        dnModified = true;
      }
      if (!dn.poDate && samplePo.date) {
        newPoDate = samplePo.date;
        dnModified = true;
      }
    }

    // Cross-link with corresponding invoices for this PO
    const matchingInvs = dnPoNorm ? invoicesByPoNorm.get(dnPoNorm) : undefined;
    if (matchingInvs && matchingInvs.length > 0) {
      if (!dn.matchedInvoiceNumber) {
        newMatchedInv = matchingInvs[0].invoiceNumber;
        dnModified = true;
      }
      const totalInvoicedForPo = matchingInvs.reduce(
        (sum, inv) => sum + (inv.lines || []).reduce((s, l) => s + (Number(l.invoicedQuantity) || 0), 0),
        0
      );
      if (dn.totalDeliveredQuantity > 0 && totalInvoicedForPo >= dn.totalDeliveredQuantity && !dn.isFullyInvoiced) {
        newIsFullyInvoiced = true;
        dnModified = true;
      }
    }

    const updatedLines = (dn.lines || []).map((line) => {
      if (!line) return line;
      let lineModified = false;
      let targetPoLine: POLineItem | undefined;

      if (line.poLineId) {
        targetPoLine = poLineById.get(line.poLineId.toLowerCase().trim());
      }
      if (!targetPoLine && dnPoNorm && line.itemDescription) {
        const descKey = `${dnPoNorm}___${line.itemDescription.trim().toLowerCase()}`;
        targetPoLine = poLineByDescKey.get(descKey);
      }

      if (targetPoLine) {
        let newPoLineId = line.poLineId;
        let newPoQty = line.poQuantity;
        let newUnitCost = line.unitCost;
        let newUnitPrice = line.unitPrice;
        let newUom = line.unitOfMeasure;

        if (!line.poLineId || line.poLineId !== targetPoLine.id) {
          newPoLineId = targetPoLine.id;
          lineModified = true;
          linesLinked++;
        }
        if (!line.poQuantity || line.poQuantity !== targetPoLine.quantity) {
          newPoQty = targetPoLine.quantity;
          lineModified = true;
        }
        if ((!line.unitPrice || line.unitPrice <= 0) && targetPoLine.unitPrice > 0) {
          newUnitPrice = targetPoLine.unitPrice;
          lineModified = true;
        }
        if ((!line.unitCost || line.unitCost <= 0) && targetPoLine.unitCost > 0) {
          newUnitCost = targetPoLine.unitCost;
          lineModified = true;
        }
        if ((!line.unitOfMeasure || line.unitOfMeasure === 'UNIT') && targetPoLine.unitOfMeasure) {
          newUom = targetPoLine.unitOfMeasure;
          lineModified = true;
        }

        if (lineModified) {
          dnModified = true;
          return {
            ...line,
            poLineId: newPoLineId,
            poQuantity: newPoQty,
            unitCost: newUnitCost,
            unitPrice: newUnitPrice,
            unitOfMeasure: newUom,
          };
        }
      }
      return line;
    });

    if (dnModified) {
      deliveryNotesUpdated++;
      return {
        ...dn,
        customerName: newCustomer,
        destination: newDest,
        contract: newContract,
        poDate: newPoDate,
        matchedInvoiceNumber: newMatchedInv,
        isFullyInvoiced: newIsFullyInvoiced,
        lines: updatedLines,
      };
    }
    return dn;
  });

  // Map of invoices & delivery notes by reference number and ID for issue reconciliation
  const docPoMap = new Map<string, { poNumber: string; customerName: string; destination: string; contract: string }>();
  updatedInvoices.forEach((i) => {
    if (i.poNumber) {
      const data = { poNumber: i.poNumber, customerName: i.customerName || '', destination: i.destination || '', contract: i.contract || '' };
      if (i.id) docPoMap.set(i.id.toLowerCase().trim(), data);
      if (i.invoiceNumber) docPoMap.set(i.invoiceNumber.toLowerCase().trim(), data);
    }
  });
  updatedDeliveryNotes.forEach((d) => {
    if (d.poNumber) {
      const data = { poNumber: d.poNumber, customerName: d.customerName || '', destination: d.destination || '', contract: d.contract || '' };
      if (d.id) docPoMap.set(d.id.toLowerCase().trim(), data);
      if (d.deliveryNoteNumber) docPoMap.set(d.deliveryNoteNumber.toLowerCase().trim(), data);
    }
  });

  // 4. Reconcile Issues
  const updatedIssues = (issues || []).map((iss) => {
    if (!iss) return iss;
    let issModified = false;
    let newPoNumber = iss.poNumber;
    let newCustomer = iss.customerName;
    let newDest = iss.destination;
    let newContract = iss.contract;
    let newStatus = iss.status;
    let newResolvedBy = iss.resolvedBy;
    let newResolvedAt = iss.resolvedAt;
    let newResNotes = iss.resolutionNotes;

    const refClean = (iss.referenceNumber || '').toLowerCase().trim();
    const entIdClean = (iss.entityId || '').toLowerCase().trim();
    const docData = docPoMap.get(refClean) || docPoMap.get(entIdClean);

    if (docData && (!iss.poNumber || iss.poNumber === '')) {
      newPoNumber = docData.poNumber;
      if (!newCustomer) newCustomer = docData.customerName;
      if (!newDest) newDest = docData.destination;
      if (!newContract) newContract = docData.contract;
      issModified = true;
    }

    // Auto-resolve issues flagged purely for missing PO once a valid PO is linked
    const titleLower = (iss.issueTitle || '').toLowerCase();
    const typeLower = (iss.issueType || '').toLowerCase();
    const isMissingPoIssue = titleLower.includes('missing po') || titleLower.includes('no po') || typeLower.includes('unmatched');

    if (isMissingPoIssue && newPoNumber && iss.status === 'PENDING') {
      newStatus = 'RESOLVED';
      newResolvedBy = 'System Reconcile';
      newResolvedAt = new Date().toISOString();
      newResNotes = `Auto-resolved: Linked to Purchase Order "${newPoNumber}".`;
      issModified = true;
    }

    if (issModified) {
      issuesUpdated++;
      return {
        ...iss,
        poNumber: newPoNumber,
        customerName: newCustomer,
        destination: newDest,
        contract: newContract,
        status: newStatus,
        resolvedBy: newResolvedBy,
        resolvedAt: newResolvedAt,
        resolutionNotes: newResNotes,
      };
    }
    return iss;
  });

  // 5. Enrich PO lines with accurate tracking based on reconciled Invoices and Delivery Notes
  const updatedPoLines = enrichPOLinesWithTracking(rawPoLines, updatedInvoices, updatedDeliveryNotes);

  return {
    updatedPoLines,
    updatedInvoices,
    updatedDeliveryNotes,
    updatedIssues,
    reconciledCounts: {
      invoicesUpdated,
      deliveryNotesUpdated,
      issuesUpdated,
      linesLinked,
    },
  };
};

// Group PO lines from pre-enriched lines without double computation
export const groupPOsByEnrichedLines = (
  enrichedLines: POLineItem[] = []
): PurchaseOrderGroup[] => {
  const groupsMap = new Map<string, PurchaseOrderGroup>();

  (enrichedLines || []).forEach((line) => {
    if (!line || !line.poNumber) return;
    const key = line.poNumber.trim();
    let grp = groupsMap.get(key);
    if (!grp) {
      grp = {
        poNumber: line.poNumber,
        customerName: line.customerName,
        destination: line.destination,
        contract: line.contract,
        date: line.date,
        totalLines: 0,
        totalQuantity: 0,
        totalValueBeforeVat: 0,
        totalVat: 0,
        totalValueAfterVat: 0,
        invoicedQuantity: 0,
        remainingQuantity: 0,
        invoicedValueAfterVat: 0,
        remainingValueAfterVat: 0,
        deliveredQuantity: 0,
        deliveredValueAfterVat: 0,
        status: 'PENDING',
        lines: [],
      };
      groupsMap.set(key, grp);
    }

    grp.lines.push(line);
    grp.totalLines += 1;
    grp.totalQuantity += line.quantity;
    grp.totalValueBeforeVat += line.valueBeforeVat;
    grp.totalVat += line.vatAmount;
    grp.totalValueAfterVat += line.valueAfterVat;
    grp.invoicedQuantity += line.invoicedQuantity || 0;
    grp.remainingQuantity += line.remainingQuantity !== undefined ? line.remainingQuantity : line.quantity;
    grp.deliveredQuantity += line.deliveredQuantity || 0;

    // Calculate proportional invoiced value after VAT for this line
    const unitPriceWithVat = line.quantity > 0 ? line.valueAfterVat / line.quantity : 0;
    const lineInvoicedVal = (line.invoicedQuantity || 0) * unitPriceWithVat;
    grp.invoicedValueAfterVat += lineInvoicedVal;

    const lineDeliveredVal = (line.deliveredQuantity || 0) * unitPriceWithVat;
    grp.deliveredValueAfterVat += lineDeliveredVal;
  });

  // Finalize remaining values and status
  return Array.from(groupsMap.values()).map((grp) => {
    grp.totalValueBeforeVat = Math.round(grp.totalValueBeforeVat * 100) / 100;
    grp.totalVat = Math.round(grp.totalVat * 100) / 100;
    grp.totalValueAfterVat = Math.round(grp.totalValueAfterVat * 100) / 100;
    grp.invoicedValueAfterVat = Math.round(grp.invoicedValueAfterVat * 100) / 100;
    grp.deliveredValueAfterVat = Math.round(grp.deliveredValueAfterVat * 100) / 100;
    grp.remainingValueAfterVat = Math.max(0, Math.round((grp.totalValueAfterVat - grp.invoicedValueAfterVat) * 100) / 100);

    if (grp.totalQuantity > 0 && grp.invoicedQuantity >= grp.totalQuantity) {
      grp.status = 'FULLY_INVOICED';
    } else if (grp.invoicedQuantity > 0) {
      grp.status = 'PARTIALLY_INVOICED';
    } else {
      grp.status = 'PENDING';
    }

    return grp;
  });
};

// Group PO lines into structured PO Groups
export const groupPOsByNumber = (
  lines: POLineItem[] = [],
  invoices: InvoiceRecord[] = [],
  deliveryNotes: DeliveryNoteRecord[] = []
): PurchaseOrderGroup[] => {
  const enrichedLines = enrichPOLinesWithTracking(lines, invoices, deliveryNotes);
  return groupPOsByEnrichedLines(enrichedLines);
};

// Comprehensive PO Items vs Delivery (Received) vs Invoiced matching generator (High-performance Map indexed)
export const generateMatchingReport = (
  rawLines: POLineItem[] = [],
  deliveryNotes: DeliveryNoteRecord[] = [],
  invoices: InvoiceRecord[] = []
): MatchingItem[] => {
  const enriched = enrichPOLinesWithTracking(rawLines, invoices, deliveryNotes);

  // Pre-index delivery notes by (poClean + "___" + lineId) and (poClean + "___" + descClean)
  const dnNumsByLineKey = new Map<string, Set<string>>();
  (deliveryNotes || []).forEach((dn) => {
    if (!dn || dn.isCancelled || dn.status === 'CANCELLED') return;
    const dnPoClean = (dn.poNumber || '').trim().toLowerCase();
    if (!dnPoClean || !dn.deliveryNoteNumber) return;
    (dn.lines || []).forEach((l) => {
      if (!l) return;
      if (l.poLineId) {
        const k = `${dnPoClean}___${l.poLineId}`;
        let set = dnNumsByLineKey.get(k);
        if (!set) {
          set = new Set();
          dnNumsByLineKey.set(k, set);
        }
        set.add(dn.deliveryNoteNumber);
      }
      if (l.itemDescription) {
        const k = `${dnPoClean}___${l.itemDescription.trim().toLowerCase()}`;
        let set = dnNumsByLineKey.get(k);
        if (!set) {
          set = new Set();
          dnNumsByLineKey.set(k, set);
        }
        set.add(dn.deliveryNoteNumber);
      }
    });
  });

  // Pre-index invoices by (poClean + "___" + lineId) and (poClean + "___" + descClean)
  const invNumsByLineKey = new Map<string, Set<string>>();
  (invoices || []).forEach((inv) => {
    if (!inv || inv.isCancelled || inv.status === 'CANCELLED') return;
    const invPoClean = (inv.poNumber || '').trim().toLowerCase();
    if (!invPoClean || !inv.invoiceNumber) return;
    (inv.lines || []).forEach((l) => {
      if (!l) return;
      if (l.poLineId) {
        const k = `${invPoClean}___${l.poLineId}`;
        let set = invNumsByLineKey.get(k);
        if (!set) {
          set = new Set();
          invNumsByLineKey.set(k, set);
        }
        set.add(inv.invoiceNumber);
      }
      if (l.itemDescription) {
        const k = `${invPoClean}___${l.itemDescription.trim().toLowerCase()}`;
        let set = invNumsByLineKey.get(k);
        if (!set) {
          set = new Set();
          invNumsByLineKey.set(k, set);
        }
        set.add(inv.invoiceNumber);
      }
    });
  });

  return (enriched || []).map((line) => {
    const poQty = line.quantity || 0;
    const invQty = line.invoicedQuantity || 0;
    const delQty = line.deliveredQuantity || 0;

    const unitPriceWithVat = poQty > 0 ? (line.valueAfterVat || 0) / poQty : (line.unitPrice || 0) * (1 + (line.vatRate || 0.18));
    const poTotalVal = line.valueAfterVat || 0;
    const invoicedVal = Math.round(invQty * unitPriceWithVat * 100) / 100;
    const deliveredVal = Math.round(delQty * unitPriceWithVat * 100) / 100;

    const unmatchedQty = Math.max(0, poQty - invQty);
    const undeliveredQty = Math.max(0, poQty - delQty);
    const receivedVsInvoicedVarianceQty = delQty - invQty;

    let status: 'FULLY_MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED_PENDING' = 'UNMATCHED_PENDING';
    if (invQty >= poQty && poQty > 0) {
      status = 'FULLY_MATCHED';
    } else if (invQty > 0) {
      status = 'PARTIALLY_MATCHED';
    }

    // High performance O(1) indexed lookup for linked DNs and Invoices
    const poNumClean = (line.poNumber || '').trim().toLowerCase();
    const idKey = `${poNumClean}___${line.id}`;
    const descKey = `${poNumClean}___${(line.itemDescription || '').trim().toLowerCase()}`;

    const dnSet1 = dnNumsByLineKey.get(idKey);
    const dnSet2 = dnNumsByLineKey.get(descKey);
    const deliveryNoteNumbers: string[] = [];
    if (dnSet1) dnSet1.forEach((dn) => deliveryNoteNumbers.push(dn));
    if (dnSet2) dnSet2.forEach((dn) => { if (!deliveryNoteNumbers.includes(dn)) deliveryNoteNumbers.push(dn); });

    const invSet1 = invNumsByLineKey.get(idKey);
    const invSet2 = invNumsByLineKey.get(descKey);
    const invoiceNumbers: string[] = [];
    if (invSet1) invSet1.forEach((inv) => invoiceNumbers.push(inv));
    if (invSet2) invSet2.forEach((inv) => { if (!invoiceNumbers.includes(inv)) invoiceNumbers.push(inv); });

    return {
      poLineId: line.id,
      poNumber: line.poNumber,
      customerName: line.customerName,
      contract: line.contract,
      destination: line.destination,
      poDate: line.date,
      itemDescription: line.itemDescription,
      unitOfMeasure: line.unitOfMeasure,
      poQuantity: poQty,
      poUnitPrice: line.unitPrice,
      poTotalValue: poTotalVal,
      deliveredQuantity: delQty,
      deliveredValue: deliveredVal,
      invoicedQuantity: invQty,
      invoicedValue: invoicedVal,
      unmatchedQty,
      undeliveredQty,
      receivedVsInvoicedVarianceQty,
      status,
      deliveryNoteNumbers,
      invoiceNumbers,
    };
  });
};

export const calculateDashboardMetrics = (
  poGroups: PurchaseOrderGroup[] = [],
  invoices: InvoiceRecord[] = [],
  deliveryNotes: DeliveryNoteRecord[] = [],
  payments: PaymentRecord[] = []
): DashboardMetrics => {
  const totalPOs = (poGroups || []).length;
  let totalPoValue = 0;
  let totalInvoicedValue = 0;
  let fullyInvoicedPOs = 0;
  let partiallyInvoicedPOs = 0;
  let pendingPOs = 0;
  let totalUndeliveredItemsCount = 0;
  let totalUnmatchedItemsCount = 0;

  (poGroups || []).forEach((grp) => {
    if (!grp) return;
    totalPoValue += grp.totalValueAfterVat || 0;
    totalInvoicedValue += grp.invoicedValueAfterVat || 0;
    if (grp.status === 'FULLY_INVOICED') fullyInvoicedPOs++;
    else if (grp.status === 'PARTIALLY_INVOICED') partiallyInvoicedPOs++;
    else pendingPOs++;

    (grp.lines || []).forEach((line) => {
      if (!line) return;
      if ((line.undeliveredQuantity || line.quantity) > 0) {
        totalUndeliveredItemsCount++;
      }
      if ((line.remainingQuantity || line.quantity) > 0) {
        totalUnmatchedItemsCount++;
      }
    });
  });

  // Delivery Notes metrics
  let totalDeliveredValue = 0;
  (deliveryNotes || []).forEach((dn) => {
    if (dn) {
      totalDeliveredValue += dn.totalDeliveredValue || 0;
    }
  });

  // Payments metrics
  let totalPaymentsReceived = 0;
  (payments || []).forEach((p) => {
    if (p) {
      totalPaymentsReceived += p.amountPaid || 0;
    }
  });

  totalPoValue = Math.round(totalPoValue * 100) / 100;
  totalInvoicedValue = Math.round(totalInvoicedValue * 100) / 100;
  totalDeliveredValue = Math.round(totalDeliveredValue * 100) / 100;
  totalPaymentsReceived = Math.round(totalPaymentsReceived * 100) / 100;

  const totalRemainingValue = Math.max(0, Math.round((totalPoValue - totalInvoicedValue) * 100) / 100);
  const totalOutstandingPayments = Math.max(0, Math.round((totalInvoicedValue - totalPaymentsReceived) * 100) / 100);
  const fulfillmentRate = totalPoValue > 0 ? Math.round((totalInvoicedValue / totalPoValue) * 1000) / 10 : 0;

  return {
    totalPOs,
    totalPoValue,
    totalInvoicedValue,
    totalRemainingValue,
    totalInvoicesCount: (invoices || []).length,
    totalDeliveryNotesCount: (deliveryNotes || []).length,
    totalDeliveredValue,
    totalPaymentsReceived,
    totalOutstandingPayments,
    fullyInvoicedPOs,
    partiallyInvoicedPOs,
    pendingPOs,
    fulfillmentRate,
    totalUndeliveredItemsCount,
    totalUnmatchedItemsCount,
  };
};

export const CURRENCY_CODE = 'TZS';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

export const formatMoney = (amount: number): string => {
  return `TZS ${formatCurrency(amount)}`;
};

export const clearAllLocalDatabaseData = () => {
  try {
    localStorage.removeItem(PO_STORAGE_KEY);
    localStorage.removeItem(INVOICE_STORAGE_KEY);
    localStorage.removeItem(DN_STORAGE_KEY);
    localStorage.removeItem(PAYMENT_STORAGE_KEY);
    localStorage.removeItem(ISSUES_STORAGE_KEY);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
  } catch (e) {
    console.error('Failed to clear local database data', e);
  }
};

