export interface POLineItem {
  id: string;
  customerName: string; // Customer Name
  destination: string;
  poNumber: string;
  contract: string;
  itemDescription: string;
  date: string; // LPO Date
  unitOfMeasure: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  valueBeforeVat: number;
  vatRate: number; // e.g. 0.18 for 18% or standard VAT
  vatAmount: number;
  valueAfterVat: number;
  remarks?: string; // Delivery Notes / General Remarks (Optional)
  // Tracking fields calculated dynamically
  invoicedQuantity?: number;
  remainingQuantity?: number;
  deliveredQuantity?: number;
  undeliveredQuantity?: number;
  status?: 'UNINVOICED' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED';
}

export interface PurchaseOrderGroup {
  poNumber: string;
  customerName: string; // Customer Name
  destination: string;
  contract: string;
  date: string;
  totalLines: number;
  totalQuantity: number;
  totalValueBeforeVat: number;
  totalVat: number;
  totalValueAfterVat: number;
  invoicedQuantity: number;
  remainingQuantity: number;
  invoicedValueAfterVat: number;
  remainingValueAfterVat: number;
  deliveredQuantity: number;
  deliveredValueAfterVat: number;
  status: 'PENDING' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED';
  lines: POLineItem[];
}

export interface InvoiceLineItem {
  poLineId: string;
  id?: string;
  itemDescription: string;
  description?: string;
  unitOfMeasure: string;
  poQuantity: number;
  alreadyInvoicedQuantity: number;
  availableQuantity: number;
  invoicedQuantity: number; // edited by user
  quantityInvoiced?: number;
  quantityDelivered?: number;
  unitCost: number;
  unitPrice: number;
  valueBeforeVat: number;
  totalBeforeVat?: number;
  vatRate: number;
  vatAmount: number;
  valueAfterVat: number;
  totalAfterVat?: number;
  lineTotal?: number;
  isSelected: boolean;
  comment?: string; // Line-level comment (default "Okay")
  hasIssue?: boolean;
  issueComment?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  customerName: string;
  destination: string;
  contract: string;
  poDate: string;
  lines: InvoiceLineItem[];
  subtotalBeforeVat: number;
  totalVat: number;
  totalAfterVat: number;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  notes?: string;
  comment?: string; // Invoice-level comment (default "Okay", or "Cancelled", "No PO reference")
  status?: 'ACTIVE' | 'CANCELLED' | 'OFR';
  isCancelled?: boolean;
  isFlagged?: boolean;
  cancelReason?: string;
  isOfr?: boolean;
  ofrDetail?: string;
  hasIssue?: boolean;
  issueComment?: string;
  issueId?: string;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  attachments?: DocumentAttachment[];
  createdAt: string;
  updatedAt?: string;
  lastModifiedBy?: string;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  url: string; // Server static url (/api/attachments/...) or base64 data url
  size?: number; // File size in bytes
  type?: string; // MIME type e.g. image/jpeg, image/png
  uploadedAt: string;
  uploadedBy?: string;
  caption?: string; // User note describing the picture e.g. "Signed by storekeeper"
}

export interface DeliveryNoteLineItem {
  id?: string;
  poLineId: string;
  itemDescription: string;
  unitOfMeasure: string;
  poQuantity: number;
  alreadyDeliveredQuantity: number;
  availableQuantity: number;
  deliveredQuantity: number;
  unitCost?: number;
  unitPrice: number;
  valueBeforeVat: number;
  totalBeforeVat?: number;
  vatRate: number;
  vatAmount: number;
  valueAfterVat: number;
  totalDeliveredValue?: number;
  isSelected?: boolean;
  comment?: string;
  hasIssue?: boolean;
  issueComment?: string;
}

export interface DeliveryNoteRecord {
  id: string;
  deliveryNoteNumber: string;
  deliveryDate: string;
  poNumber: string;
  customerName: string;
  destination: string;
  contract: string;
  poDate?: string;
  carrier?: string;
  vehicleNumber?: string;
  driverName?: string;
  receivedBy?: string;
  lines: DeliveryNoteLineItem[];
  subtotalBeforeVat?: number;
  totalVat?: number;
  totalDeliveredQuantity: number;
  totalDeliveredValue: number;
  notes?: string;
  comment?: string;
  createdAt: string;
  updatedAt?: string;
  lastModifiedBy?: string;
  status?: 'ACTIVE' | 'CANCELLED' | 'OFR' | 'CALL_OF_ORDER';
  isCancelled?: boolean;
  cancelReason?: string;
  isOfr?: boolean;
  ofrDetail?: string;
  isCallOfOrder?: boolean;
  callOfOrderDetail?: string;
  matchedInvoiceNumber?: string;
  isFullyInvoiced?: boolean;
  hasIssue?: boolean;
  issueComment?: string;
  issueId?: string;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  attachments?: DocumentAttachment[];
}

export interface PaymentAllocationItem {
  invoiceId: string;
  invoiceNumber: string;
  poNumber: string;
  customerName: string;
  invoiceTotal: number;
  alreadyPaid: number;
  pendingBalance: number;
  allocatedAmount: number;
  hasIssue?: boolean;
  issueComment?: string;
}

export interface PaymentRecord {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  invoiceId?: string;
  invoiceNumber: string;
  poNumber: string;
  customerName: string;
  amountPaid: number;
  paymentMethod: 'Bank Transfer' | 'Cheque' | 'Cash' | 'EFT' | 'Mobile Money';
  referenceNumber: string;
  depositAccount?: string;
  allocations?: PaymentAllocationItem[];
  notes?: string;
  hasIssue?: boolean;
  issueComment?: string;
  issueId?: string;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  createdAt: string;
}

export interface LineItemIssue {
  lineId: string;
  itemDescription: string;
  unitOfMeasure?: string;
  poQuantity?: number;
  billedOrDeliveredQuantity?: number;
  quantityInvoiced?: number;
  quantityDelivered?: number;
  discrepancyQuantity?: number;
  unitPrice?: number;
  valueAfterVat?: number;
  totalValue?: number;
  issueComment: string; // The specific problem identified on this line
  issueReason?: string;
  workComment?: string;  // Notes added by the assigned user working on it
  reviewerComment?: string; // Reviewer feedback on this line
  status?: 'PENDING' | 'RESOLVED';
}

export interface IssueDiscussionComment {
  id: string;
  authorName: string;
  authorRole: string;
  comment: string;
  createdAt: string;
  type: 'WORK_NOTE' | 'REVIEWER_NOTE' | 'RESOLUTION_NOTE';
  attachments?: DocumentAttachment[];
}

export interface DocumentIssueRecord {
  id: string;
  entityType: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
  entityId: string;
  referenceNumber: string; // e.g. "INV-2026-001", "CRU005", "DN-2026-001", "PAY-2026-001"
  poNumber: string;
  customerName: string;
  destination?: string;
  contract?: string;
  totalValue?: number;
  disputedAmount?: number;
  issueTitle: string;
  primaryIssue?: string;
  issueType: 
    | 'Quantity Discrepancy' 
    | 'Pricing / Rate Error' 
    | 'Missing Delivery Ref' 
    | 'VAT / Calculation Error' 
    | 'Wrong PO Reference' 
    | 'Damaged / Rejected Goods' 
    | 'Payment Mismatch' 
    | 'Customer Query' 
    | 'Call of Order'
    | 'Other';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  flaggedBy: string;
  flaggedAt: string;
  headerComment: string; // Document-level issue comment
  lineIssues: LineItemIssue[];
  comments: IssueDiscussionComment[];
  attachments?: DocumentAttachment[];
  // Reviewer resolution
  reviewComment?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface NumberSeriesConfig {
  prefix: string;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  padding: number;
  autoIncrement: boolean;
}

export interface CustomerSeriesBook {
  id: string;
  customerName: string;
  invoicePrefix: string;       // e.g. "CRU", "GRB"
  invoiceStartNumber: number;  // e.g. 1
  invoiceEndNumber: number;    // e.g. 200
  invoiceCurrentNumber: number;// e.g. 1
  deliveryPrefix: string;      // e.g. "CRU-DN" or "CRU"
  deliveryStartNumber: number; // e.g. 1
  deliveryEndNumber: number;   // e.g. 200
  deliveryCurrentNumber: number;// e.g. 1
  padding: number;             // e.g. 3 (CRU001)
  description?: string;
  updatedAt?: string;
}

export interface SeriesSettings {
  invoiceSeries: NumberSeriesConfig;
  deliverySeries: NumberSeriesConfig;
  customerBooks?: CustomerSeriesBook[];
}

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

export interface AppUser {
  id: string;
  username?: string;
  name: string;
  email: string;
  role: 'Admin' | 'Finance Officer' | 'Logistics Manager' | 'Billing Clerk' | 'Auditor';
  department: string;
  status: 'Active' | 'On Hold' | 'Inactive';
  createdAt: string;
  lastLoginAt?: string;
  accessToken?: string;
  pinCode?: string; // 4-digit PIN generated by Admin
  password?: string; // Unique password / PIN for this user
  screenPermissions?: ScreenPermissions;
}

export interface EmailAccessInvitation {
  id: string;
  email: string;
  name: string;
  role: AppUser['role'];
  department: string;
  token: string;
  accessUrl: string;
  createdAt: string;
  expiresAt: string;
  status: 'Active' | 'Pending' | 'Revoked';
  invitedBy?: string;
  lastUsedAt?: string;
  screenPermissions?: ScreenPermissions;
}

export interface SystemBackupPackage {
  backupFormat: 'FAMOLA_NINJA_FULL_SYSTEM_BACKUP';
  backupVersion: string;
  exportedAt: string;
  exportedBy: string;
  checksum: string;
  data: {
    poLines: POLineItem[];
    invoices: InvoiceRecord[];
    deliveryNotes: DeliveryNoteRecord[];
    payments: PaymentRecord[];
    seriesConfig: SeriesSettings;
    users: AppUser[];
    issues?: DocumentIssueRecord[];
    emailInvitations: EmailAccessInvitation[];
  };
  systemMetadata: {
    appName: string;
    version: string;
    description: string;
    workflowArchitecture: string;
    businessRules: {
      standardVatRate: number;
      invoiceRange: string;
      deliveryNoteRange: string;
      threeWayReconciliationRule: string;
      partialInvoicingPolicy: string;
      autoAllocationMethod: string;
    };
  };
}

export interface MatchingItem {
  poLineId: string;
  poNumber: string;
  customerName: string;
  contract: string;
  destination: string;
  poDate: string;
  itemDescription: string;
  unitOfMeasure: string;
  poQuantity: number;
  poUnitPrice: number;
  poTotalValue: number;
  deliveredQuantity: number;
  deliveredValue: number;
  invoicedQuantity: number;
  invoicedValue: number;
  unmatchedQty: number; // PO Qty - Invoiced Qty
  undeliveredQty: number; // PO Qty - Delivered Qty
  receivedVsInvoicedVarianceQty: number; // Delivered Qty - Invoiced Qty
  status: 'FULLY_MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED_PENDING';
  deliveryNoteNumbers: string[];
  invoiceNumbers: string[];
}

export interface DashboardMetrics {
  totalPOs: number;
  totalPoValue: number;
  totalInvoicedValue: number;
  totalRemainingValue: number;
  totalInvoicesCount: number;
  totalDeliveryNotesCount: number;
  totalDeliveredValue: number;
  totalPaymentsReceived: number;
  totalOutstandingPayments: number;
  fullyInvoicedPOs: number;
  partiallyInvoicedPOs: number;
  pendingPOs: number;
  fulfillmentRate: number;
  totalUndeliveredItemsCount: number;
  totalUnmatchedItemsCount: number;
}

