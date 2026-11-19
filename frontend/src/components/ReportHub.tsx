import React, { useState, useMemo, useEffect } from 'react';
import {
  InvoiceRecord,
  DeliveryNoteRecord,
  PaymentRecord,
  POLineItem,
  PurchaseOrderGroup,
  AppUser,
  AppEntity,
  SYSTEM_ENTITIES
} from '../types';
import { getEntityTheme } from '../utils/entityTheme';
import {
  BookOpen,
  FileText,
  Truck,
  CreditCard,
  Scale,
  Search,
  Filter,
  Calendar,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  RotateCcw,
  Ban,
  Building2,
  FileSpreadsheet,
  Layers,
  ArrowUpDown,
  DollarSign,
  Receipt,
  X,
  ExternalLink,
  Clock,
  History,
  TrendingDown,
  Check,
  Wallet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatCurrency } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TablePagination } from './TablePagination';
import { isAdminUser } from '../utils/authService';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import {
  loadStoredIgnoredBooks,
  addIgnoredCustomerBook,
  removeIgnoredCustomerBook
} from '../utils/storage';

interface ReportHubProps {
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  poLines?: POLineItem[];
  poGroups?: PurchaseOrderGroup[];
  currentUser?: AppUser;
  currentEntity?: AppEntity;
  onNavigate?: (tab: any, subFilter?: string) => void;
  onSelectPOForInvoice?: (poNumber: string) => void;
  onViewInvoicePrint?: (invoice: InvoiceRecord) => void;
}

// ---------------------------------------------------------------------------
// Leaflet & Book Interfaces for 50-Leaf Series Audit
// ---------------------------------------------------------------------------
export interface LeafletItem {
  num: number;
  formattedNumber: string;
  isRecorded: boolean;
  record?: InvoiceRecord;
}

export interface CustomerBookInfo {
  id: string; // e.g. "KILIMANJARO-INVOICE-B11"
  bookIndex: number;
  customerName: string;
  prefix: string;
  digitsLen: number;
  rangeStart: number;
  rangeEnd: number;
  formattedRange: string;
  shortRange: string; // e.g. "501–550"
  totalCapacity: number; // 50
  usedCount: number;
  missingCount: number;
  completionPercentage: number;
  isComplete: boolean;
  hasGaps: boolean;
  isIgnored: boolean;
  recordedInvoices: InvoiceRecord[];
  leaflets: LeafletItem[];
}

export interface CustomerSeriesSummary {
  customerName: string;
  totalBooks: number;
  activeBooksCount: number;
  ignoredBooksCount: number;
  totalInvoicesRecorded: number;
  totalMissingLeaflets: number;
  overallCompletionRate: number;
  books: CustomerBookInfo[];
}

// ---------------------------------------------------------------------------
// Helper parsing function for 50-leaf series
// ---------------------------------------------------------------------------
function parseSeriesNumber(val: string): { prefix: string; num: number; digitsLen: number } | null {
  if (!val) return null;
  const str = String(val).trim();
  const m = str.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const prefix = m[1];
  const digits = m[2];
  const num = parseInt(digits, 10);
  if (isNaN(num)) return null;
  return { prefix, num, digitsLen: digits.length };
}

function formatLeaf(prefix: string, num: number, digitsLen: number): string {
  return `${prefix}${String(num).padStart(digitsLen, '0')}`;
}

// ---------------------------------------------------------------------------
// Customer Statement Transaction Item (Dr first, then Cr)
// ---------------------------------------------------------------------------
export interface CustomerLedgerRow {
  id: string;
  date: string;
  transactionType: 'INVOICE' | 'PAYMENT';
  documentNumber: string; // Invoice No or Payment Voucher No
  referenceInfo: string;  // Related Delivery Notes or Payment Reference
  poNumber: string;
  contract: string;
  debitPayment: number;   // Dr: Payment Amount (reduces receivable)
  creditInvoice: number;  // Cr: Invoice Amount (increases receivable)
  runningBalance: number;
  rawInvoice?: InvoiceRecord;
  rawPayment?: PaymentRecord;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Tab 3: Customer Outstanding & Invoices Breakdown
// ---------------------------------------------------------------------------
export interface CustomerInvoiceItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  contract: string;
  destination: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  linkedDeliveryNotes: string;
  rawInvoice: InvoiceRecord;
}

export interface CustomerOutstandingSummary {
  customerName: string;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number; // totalInvoiced - totalPaid
  invoicesCount: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  lastInvoiceDate: string;
  lastPaymentDate: string;
  invoices: CustomerInvoiceItem[];
}

// ---------------------------------------------------------------------------
// Tab 4: Customer Aging Report Structures
// ---------------------------------------------------------------------------
export interface AgedInvoiceItem {
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  contract: string;
  destination: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  ageDays: number;
  ageMonths: number;
  bucketKey: '0_6m' | '6m_1y' | '1y_2y' | '2y_3y' | '3y_4y' | 'over_4y';
  bucketLabel: string;
  rawInvoice: InvoiceRecord;
}

export interface CustomerAgingSummary {
  customerName: string;
  totalOutstanding: number;
  b0_6m: number;
  b6m_1y: number;
  b1y_2y: number;
  b2y_3y: number;
  b3y_4y: number;
  bOver4y: number;
  unpaidInvoicesCount: number;
  agedInvoices: AgedInvoiceItem[];
}

export const ReportHub: React.FC<ReportHubProps> = ({
  invoices = [],
  deliveryNotes = [],
  payments = [],
  poLines = [],
  poGroups = [],
  currentUser,
  currentEntity = SYSTEM_ENTITIES[0],
  onNavigate,
  onSelectPOForInvoice,
  onViewInvoicePrint,
}) => {
  const isAdmin = isAdminUser(currentUser);
  const entityTheme = getEntityTheme(currentEntity);

  // Top Module Tab: 5 Modules
  // 1. invoice_books: Customer Invoice Books (50-leaf series audit)
  // 2. customer_statement: Customer Statement / Ledger (Dr then Cr, null hidden)
  // 3. outstanding_summary: Total Outstanding per Customer & Invoices Drill
  // 4. aging_report: Customer Aging Report (6m, 1y, 2y, 3y, 4y+)
  // 5. collections_report: Monthly and Date Range Collections Report
  const [activeReportTab, setActiveReportTab] = useState<
    'invoice_books' | 'customer_statement' | 'outstanding_summary' | 'aging_report' | 'collections_report'
  >('invoice_books');

  // Ignored / Deleted Books state (persisted)
  const [ignoredBookIds, setIgnoredBookIds] = useState<string[]>(() => loadStoredIgnoredBooks());
  const [showIgnoredBooks, setShowIgnoredBooks] = useState<boolean>(true);

  // Delivery Notes lookup map
  const deliveryNotesByInvoiceMap = useMemo(() => {
    const map = new Map<string, string[]>();
    deliveryNotes.forEach((dn) => {
      const dnNum = dn.deliveryNoteNumber;
      if (dn.matchedInvoiceNumber) {
        const k = dn.matchedInvoiceNumber.trim().toLowerCase();
        const list = map.get(k) || [];
        if (!list.includes(dnNum)) list.push(dnNum);
        map.set(k, list);
      }
      if (dn.poNumber) {
        const kPo = `po_${dn.poNumber.trim().toLowerCase()}`;
        const list = map.get(kPo) || [];
        if (!list.includes(dnNum)) list.push(dnNum);
        map.set(kPo, list);
      }
    });
    return map;
  }, [deliveryNotes]);

  // =========================================================================
  // TAB 1: INVOICE BOOK STATUS PER CUSTOMER
  // =========================================================================
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [selectedBookCustomer, setSelectedBookCustomer] = useState<string>('ALL');
  const [bookStatusFilter, setBookStatusFilter] = useState<'ALL' | 'WITH_MISSING' | 'COMPLETE' | 'UNUSED'>('ALL');
  const [expandedCustomerRows, setExpandedCustomerRows] = useState<Record<string, boolean>>({});
  const [drilledBook, setDrilledBook] = useState<CustomerBookInfo | null>(null);
  const [bookPage, setBookPage] = useState(1);
  const [bookPageSize, setBookPageSize] = useState(15);

  // Build the Customer 50-Leaf Book series data
  const customerSeriesSummaries = useMemo<CustomerSeriesSummary[]>(() => {
    const customerMap = new Map<string, InvoiceRecord[]>();
    invoices.forEach((inv) => {
      const c = (inv.customerName || 'General Customer').trim();
      if (!customerMap.has(c)) {
        customerMap.set(c, []);
      }
      customerMap.get(c)!.push(inv);
    });

    const summaries: CustomerSeriesSummary[] = [];

    customerMap.forEach((custInvoices, custName) => {
      const parsedRecords: {
        prefix: string;
        num: number;
        digitsLen: number;
        record: InvoiceRecord;
      }[] = [];

      custInvoices.forEach((inv) => {
        const parsed = parseSeriesNumber(inv.invoiceNumber);
        if (parsed) {
          parsedRecords.push({
            prefix: parsed.prefix,
            num: parsed.num,
            digitsLen: parsed.digitsLen,
            record: inv,
          });
        }
      });

      if (parsedRecords.length === 0) return;

      const prefixCount = new Map<string, number>();
      parsedRecords.forEach((p) => {
        prefixCount.set(p.prefix, (prefixCount.get(p.prefix) || 0) + 1);
      });
      let commonPrefix = parsedRecords[0].prefix;
      let maxPCount = 0;
      prefixCount.forEach((cnt, p) => {
        if (cnt > maxPCount) {
          maxPCount = cnt;
          commonPrefix = p;
        }
      });

      const commonDigitsLen = parsedRecords.find((p) => p.prefix === commonPrefix)?.digitsLen || 4;
      const minNum = Math.min(...parsedRecords.map((p) => p.num));
      const maxNum = Math.max(...parsedRecords.map((p) => p.num));

      const startBookIdx = Math.max(1, Math.floor((minNum - 1) / 50) + 1);
      const endBookIdx = Math.max(startBookIdx, Math.floor((maxNum - 1) / 50) + 1);

      const books: CustomerBookInfo[] = [];

      for (let b = startBookIdx; b <= endBookIdx; b++) {
        const rangeStart = (b - 1) * 50 + 1;
        const rangeEnd = b * 50;
        const bookId = `${custName}-INVOICE-B${b}`;
        const isIgnored = ignoredBookIds.includes(bookId.toLowerCase());

        const inBookRecords = parsedRecords
          .filter((p) => p.num >= rangeStart && p.num <= rangeEnd)
          .sort((a, b2) => a.num - b2.num);

        const recordedMap = new Map<number, InvoiceRecord>();
        inBookRecords.forEach((p) => {
          if (!recordedMap.has(p.num)) {
            recordedMap.set(p.num, p.record);
          }
        });

        const leaflets: LeafletItem[] = [];
        let missingCount = 0;

        for (let n = rangeStart; n <= rangeEnd; n++) {
          const isRec = recordedMap.has(n);
          leaflets.push({
            num: n,
            formattedNumber: formatLeaf(commonPrefix, n, commonDigitsLen),
            isRecorded: isRec,
            record: recordedMap.get(n),
          });
          if (!isRec && !isIgnored) {
            missingCount += 1;
          }
        }

        const usedCount = recordedMap.size;
        const completionPercentage = Math.round((usedCount / 50) * 100);
        const isComplete = !isIgnored && missingCount === 0;
        const hasGaps = !isIgnored && usedCount > 0 && missingCount > 0;

        const shortRange = `${String(rangeStart).padStart(3, '0')}–${String(rangeEnd).padStart(3, '0')}`;
        const formattedRange = `${formatLeaf(commonPrefix, rangeStart, commonDigitsLen)} – ${formatLeaf(commonPrefix, rangeEnd, commonDigitsLen)}`;

        books.push({
          id: bookId,
          bookIndex: b,
          customerName: custName,
          prefix: commonPrefix,
          digitsLen: commonDigitsLen,
          rangeStart,
          rangeEnd,
          formattedRange,
          shortRange,
          totalCapacity: 50,
          usedCount,
          missingCount: isIgnored ? 0 : missingCount,
          completionPercentage,
          isComplete,
          hasGaps,
          isIgnored,
          recordedInvoices: inBookRecords.map((p) => p.record),
          leaflets,
        });
      }

      const totalBooks = books.length;
      const activeBooks = books.filter((b) => !b.isIgnored);
      const activeBooksCount = activeBooks.length;
      const ignoredBooksCount = books.filter((b) => b.isIgnored).length;

      const totalInvoicesRecorded = custInvoices.length;
      const totalMissingLeaflets = activeBooks.reduce((sum, b) => sum + b.missingCount, 0);

      const activeCapacity = activeBooksCount * 50;
      const totalUsedInActive = activeBooks.reduce((sum, b) => sum + b.usedCount, 0);
      const overallCompletionRate = activeCapacity > 0 ? Math.round((totalUsedInActive / activeCapacity) * 100) : 0;

      summaries.push({
        customerName: custName,
        totalBooks,
        activeBooksCount,
        ignoredBooksCount,
        totalInvoicesRecorded,
        totalMissingLeaflets,
        overallCompletionRate,
        books,
      });
    });

    return summaries.sort((a, b) => naturalCompare(a.customerName, b.customerName));
  }, [invoices, ignoredBookIds]);

  // Filtered customer summaries
  const filteredCustomerSummaries = useMemo(() => {
    return customerSeriesSummaries.filter((cust) => {
      if (selectedBookCustomer !== 'ALL' && cust.customerName !== selectedBookCustomer) {
        return false;
      }
      if (bookSearchQuery.trim()) {
        const q = bookSearchQuery.toLowerCase().trim();
        const matchName = cust.customerName.toLowerCase().includes(q);
        const matchBook = cust.books.some(
          (b) =>
            b.shortRange.toLowerCase().includes(q) ||
            b.formattedRange.toLowerCase().includes(q) ||
            `book ${b.bookIndex}`.includes(q)
        );
        if (!matchName && !matchBook) return false;
      }
      if (bookStatusFilter === 'WITH_MISSING') {
        return cust.totalMissingLeaflets > 0;
      }
      if (bookStatusFilter === 'COMPLETE') {
        return cust.totalMissingLeaflets === 0 && cust.totalInvoicesRecorded > 0;
      }
      if (bookStatusFilter === 'UNUSED') {
        return cust.books.some((b) => b.usedCount === 0);
      }
      return true;
    });
  }, [customerSeriesSummaries, selectedBookCustomer, bookSearchQuery, bookStatusFilter]);

  // Overall totals for Tab 1
  const globalBookKpis = useMemo(() => {
    let totalBooks = 0;
    let activeBooks = 0;
    let ignoredBooks = 0;
    let totalInvoicesRecorded = 0;
    let totalMissingLeaflets = 0;

    customerSeriesSummaries.forEach((c) => {
      totalBooks += c.totalBooks;
      activeBooks += c.activeBooksCount;
      ignoredBooks += c.ignoredBooksCount;
      totalInvoicesRecorded += c.totalInvoicesRecorded;
      totalMissingLeaflets += c.totalMissingLeaflets;
    });

    const activeCapacity = activeBooks * 50;
    const overallCompletionRate = activeCapacity > 0 ? Math.round(((activeCapacity - totalMissingLeaflets) / activeCapacity) * 100) : 0;

    return {
      totalBooks,
      activeBooks,
      ignoredBooks,
      totalInvoicesRecorded,
      totalMissingLeaflets,
      overallCompletionRate,
    };
  }, [customerSeriesSummaries]);

  // Paginated customer list
  const paginatedCustomerSummaries = useMemo(() => {
    const start = (bookPage - 1) * bookPageSize;
    return filteredCustomerSummaries.slice(start, start + bookPageSize);
  }, [filteredCustomerSummaries, bookPage, bookPageSize]);

  // Toggle book expansion
  const toggleCustomerRow = (customerName: string) => {
    setExpandedCustomerRows((prev) => ({
      ...prev,
      [customerName]: !prev[customerName],
    }));
  };

  // Toggle Admin ignore/restore book
  const handleToggleIgnoreBook = (book: CustomerBookInfo) => {
    if (!isAdmin) return;
    const bookId = book.id.toLowerCase();
    if (ignoredBookIds.includes(bookId)) {
      const updated = removeIgnoredCustomerBook(bookId);
      setIgnoredBookIds(updated);
    } else {
      const confirmMsg = `Are you sure you want to ignore / delete Book #${book.bookIndex} (${book.shortRange}) for ${book.customerName}?\n\nThis book will be marked as excluded from the active range and will not trigger sequence gap alerts.`;
      if (window.confirm(confirmMsg)) {
        const updated = addIgnoredCustomerBook(bookId);
        setIgnoredBookIds(updated);
      }
    }
  };

  // =========================================================================
  // TAB 2: CUSTOMER LEDGER / STATEMENT (Dr then Cr, null hidden)
  // =========================================================================
  const allCustomerNames = useMemo<string[]>(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.customerName && set.add(i.customerName.trim()));
    payments.forEach((p) => p.customerName && set.add(p.customerName.trim()));
    return Array.from(set).sort(naturalCompare);
  }, [invoices, payments]);

  // Selected customer for Statement
  const [statementCustomer, setStatementCustomer] = useState<string>(() => {
    return allCustomerNames[0] || 'ALL';
  });

  useEffect(() => {
    if ((!statementCustomer || statementCustomer === 'ALL') && allCustomerNames.length > 0) {
      setStatementCustomer(allCustomerNames[0]);
    }
  }, [allCustomerNames, statementCustomer]);

  // Statement Filters
  const [statementDateFilterMode, setStatementDateFilterMode] = useState<
    'ALL' | 'THIS_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'CUSTOM'
  >('ALL');
  const [statementStartDate, setStatementStartDate] = useState<string>('');
  const [statementEndDate, setStatementEndDate] = useState<string>('');
  const [statementTypeFilter, setStatementTypeFilter] = useState<'ALL' | 'INVOICE' | 'PAYMENT'>('ALL');
  const [statementSearchQuery, setStatementSearchQuery] = useState<string>('');
  // User Request: option for user to select view for all Transaction or to see only outstanding (where there is no payment allocated to it)
  const [statementViewMode, setStatementViewMode] = useState<'ALL' | 'OUTSTANDING'>('ALL');

  const handleDatePresetChange = (preset: 'ALL' | 'THIS_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'CUSTOM') => {
    setStatementDateFilterMode(preset);
    const now = new Date();
    if (preset === 'ALL') {
      setStatementStartDate('');
      setStatementEndDate('');
    } else if (preset === 'THIS_MONTH') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      setStatementStartDate(`${year}-${month}-01`);
      setStatementEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'LAST_30') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setStatementStartDate(past.toISOString().split('T')[0]);
      setStatementEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'THIS_YEAR') {
      setStatementStartDate(`${now.getFullYear()}-01-01`);
      setStatementEndDate(now.toISOString().split('T')[0]);
    }
  };

  // Build Chronological Customer Ledger / Statement
  // KEY RULE 1: IF TRANSACTION HAS NULL/ZERO FIGURE, HIDE FROM STATEMENT
  // KEY RULE 2: COLUMNS MUST START WITH Dr THEN Cr
  const { ledgerRows, openingBalance, closingBalance, totalPeriodCredits, totalPeriodDebits } = useMemo(() => {
    if (!statementCustomer) {
      return {
        ledgerRows: [],
        openingBalance: 0,
        closingBalance: 0,
        totalPeriodCredits: 0,
        totalPeriodDebits: 0,
      };
    }

    const custNorm = statementCustomer.trim().toLowerCase();

    interface RawTx {
      id: string;
      date: string;
      type: 'INVOICE' | 'PAYMENT';
      docNumber: string;
      refInfo: string;
      poNumber: string;
      contract: string;
      debit: number;  // Dr: Payment
      credit: number; // Cr: Invoice
      notes?: string;
      rawInvoice?: InvoiceRecord;
      rawPayment?: PaymentRecord;
    }

    const allTx: RawTx[] = [];

    // Invoices (Cr = Receivable Increase)
    invoices.forEach((inv) => {
      if ((inv.customerName || '').trim().toLowerCase() !== custNorm) return;
      if (inv.status === 'CANCELLED') return;

      const invoiceAmount = Number(inv.totalAfterVat ?? inv.totalAmount ?? 0);
      // HIDE IF NULL / ZERO FIGURE
      if (!invoiceAmount || isNaN(invoiceAmount) || invoiceAmount <= 0) return;

      const linkedDns = new Set<string>();
      (inv.lines || []).forEach((l) => {
        (l.deliveryNoteNumbers || []).forEach((dn) => dn && linkedDns.add(dn.trim()));
      });
      const invKey = (inv.invoiceNumber || '').trim().toLowerCase();
      const byInv = deliveryNotesByInvoiceMap.get(invKey) || [];
      byInv.forEach((dn) => linkedDns.add(dn));

      if (linkedDns.size === 0 && inv.poNumber) {
        const byPo = deliveryNotesByInvoiceMap.get(`po_${inv.poNumber.trim().toLowerCase()}`) || [];
        byPo.forEach((dn) => linkedDns.add(dn));
      }

      const dnStr = Array.from(linkedDns).join(', ');
      const refStr = dnStr ? `DN: ${dnStr}` : 'Pending DN';

      allTx.push({
        id: `inv-${inv.id || inv.invoiceNumber}`,
        date: inv.invoiceDate || inv.createdAt || '1970-01-01',
        type: 'INVOICE',
        docNumber: inv.invoiceNumber,
        refInfo: refStr,
        poNumber: inv.poNumber || '—',
        contract: inv.contract || '—',
        debit: 0,
        credit: Math.round(invoiceAmount * 100) / 100,
        notes: inv.comment || inv.notes,
        rawInvoice: inv,
      });
    });

    // Payments (Dr = Receivable Reduction)
    payments.forEach((pay) => {
      if ((pay.customerName || '').trim().toLowerCase() !== custNorm) return;

      const payAmount = Number(pay.amountPaid ?? 0);
      // HIDE IF NULL / ZERO FIGURE
      if (!payAmount || isNaN(payAmount) || payAmount <= 0) return;

      const voucherStr = `PV: ${pay.paymentNumber}`;
      const refDetail = pay.referenceNumber ? `${voucherStr} • Ref: ${pay.referenceNumber}` : voucherStr;

      allTx.push({
        id: `pay-${pay.id || pay.paymentNumber}`,
        date: pay.paymentDate || pay.createdAt || '1970-01-01',
        type: 'PAYMENT',
        docNumber: pay.paymentNumber,
        refInfo: refDetail,
        poNumber: pay.poNumber || (pay.allocations && pay.allocations[0]?.poNumber) || '—',
        contract: '—',
        debit: Math.round(payAmount * 100) / 100,
        credit: 0,
        notes: pay.notes || (pay.allocations ? `Allocated to ${pay.allocations.map((a) => a.invoiceNumber).join(', ')}` : ''),
        rawPayment: pay,
      });
    });

    // Sort chronologically ascending
    allTx.sort((a, b) => {
      if (a.date !== b.date) return naturalCompare(a.date, b.date);
      if (a.type !== b.type) return a.type === 'INVOICE' ? -1 : 1;
      return naturalCompare(a.docNumber, b.docNumber);
    });

    // Opening Balance calculation
    let opening = 0;
    const periodTx: RawTx[] = [];

    allTx.forEach((tx) => {
      const isBeforeStart = statementStartDate && tx.date < statementStartDate;
      if (isBeforeStart) {
        opening += tx.credit - tx.debit;
      } else {
        periodTx.push(tx);
      }
    });

    const searchQ = statementSearchQuery.trim().toLowerCase();
    let running = opening;
    const finalRows: CustomerLedgerRow[] = [];
    let periodCredits = 0;
    let periodDebits = 0;

    periodTx.forEach((tx) => {
      running = Math.round((running + tx.credit - tx.debit) * 100) / 100;

      if (statementEndDate && tx.date > statementEndDate) return;
      if (statementTypeFilter === 'INVOICE' && tx.type !== 'INVOICE') return;
      if (statementTypeFilter === 'PAYMENT' && tx.type !== 'PAYMENT') return;

      if (searchQ) {
        const matchDoc = tx.docNumber.toLowerCase().includes(searchQ);
        const matchRef = tx.refInfo.toLowerCase().includes(searchQ);
        const matchPo = tx.poNumber.toLowerCase().includes(searchQ);
        const matchCont = tx.contract.toLowerCase().includes(searchQ);
        const matchNotes = (tx.notes || '').toLowerCase().includes(searchQ);
        if (!matchDoc && !matchRef && !matchPo && !matchCont && !matchNotes) return;
      }

      periodCredits += tx.credit;
      periodDebits += tx.debit;

      finalRows.push({
        id: tx.id,
        date: tx.date,
        transactionType: tx.type,
        documentNumber: tx.docNumber,
        referenceInfo: tx.refInfo,
        poNumber: tx.poNumber,
        contract: tx.contract,
        debitPayment: tx.debit,
        creditInvoice: tx.credit,
        runningBalance: running,
        rawInvoice: tx.rawInvoice,
        rawPayment: tx.rawPayment,
        notes: tx.notes,
      });
    });

    return {
      ledgerRows: finalRows,
      openingBalance: Math.round(opening * 100) / 100,
      closingBalance: running,
      totalPeriodCredits: Math.round(periodCredits * 100) / 100,
      totalPeriodDebits: Math.round(periodDebits * 100) / 100,
    };
  }, [
    statementCustomer,
    invoices,
    payments,
    deliveryNotesByInvoiceMap,
    statementStartDate,
    statementEndDate,
    statementTypeFilter,
    statementSearchQuery,
  ]);

  // =========================================================================
  // OUTSTANDING INVOICES ONLY (User Request: "to see only outstanding: the transaction where there is no payment allocated to it")
  // =========================================================================
  const outstandingInvoicesForCustomer = useMemo(() => {
    if (!statementCustomer) return [];
    const custNorm = statementCustomer.trim().toLowerCase();

    return (invoices || [])
      .filter((inv) => {
        if ((inv.customerName || '').trim().toLowerCase() !== custNorm) return false;
        if (inv.status === 'CANCELLED') return false;

        const total = Number(inv.totalAfterVat ?? inv.totalAmount ?? 0);
        const paid = Number(inv.paidAmount ?? 0);
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);

        // Filter: must have an outstanding unallocated balance
        if (balance <= 0.01) return false;

        // Date filter
        const invDate = inv.invoiceDate || inv.createdAt || '';
        if (statementStartDate && invDate < statementStartDate) return false;
        if (statementEndDate && invDate > statementEndDate) return false;

        // Search query
        if (statementSearchQuery.trim()) {
          const q = statementSearchQuery.trim().toLowerCase();
          const matchNum = (inv.invoiceNumber || '').toLowerCase().includes(q);
          const matchPo = (inv.poNumber || '').toLowerCase().includes(q);
          const matchCont = (inv.contract || '').toLowerCase().includes(q);
          if (!matchNum && !matchPo && !matchCont) return false;
        }

        return true;
      })
      .map((inv) => {
        const total = Number(inv.totalAfterVat ?? inv.totalAmount ?? 0);
        const paid = Number(inv.paidAmount ?? 0);
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        const isCompletelyUnallocated = paid <= 0.001;

        const linkedDns = new Set<string>();
        (inv.lines || []).forEach((l) => {
          (l.deliveryNoteNumbers || []).forEach((dn) => dn && linkedDns.add(dn.trim()));
        });
        const invKey = (inv.invoiceNumber || '').trim().toLowerCase();
        const byInv = deliveryNotesByInvoiceMap.get(invKey) || [];
        byInv.forEach((dn) => linkedDns.add(dn));

        if (linkedDns.size === 0 && inv.poNumber) {
          const byPo = deliveryNotesByInvoiceMap.get(`po_${inv.poNumber.trim().toLowerCase()}`) || [];
          byPo.forEach((dn) => linkedDns.add(dn));
        }

        const dnStr = Array.from(linkedDns).join(', ');

        return {
          id: inv.id,
          date: inv.invoiceDate || '—',
          invoiceNumber: inv.invoiceNumber,
          poNumber: inv.poNumber || '—',
          contract: inv.contract || '—',
          deliveryNotes: dnStr || 'Pending DN',
          totalAmount: total,
          paidAmount: paid,
          outstandingBalance: balance,
          allocationStatus: isCompletelyUnallocated ? ('UNALLOCATED' as const) : ('PARTIAL' as const),
          rawInvoice: inv,
        };
      })
      .sort((a, b) => naturalCompare(a.date, b.date));
  }, [
    statementCustomer,
    invoices,
    statementStartDate,
    statementEndDate,
    statementSearchQuery,
    deliveryNotesByInvoiceMap,
  ]);

  // Customer Lifetime Stats
  const customerLifetimeStats = useMemo(() => {
    if (!statementCustomer) return { totalInvoiced: 0, totalPaid: 0, netBalanceDue: 0 };
    const custNorm = statementCustomer.trim().toLowerCase();

    let totalInvoiced = 0;
    invoices.forEach((inv) => {
      if ((inv.customerName || '').trim().toLowerCase() === custNorm && inv.status !== 'CANCELLED') {
        const amt = Number(inv.totalAfterVat ?? inv.totalAmount ?? 0);
        if (amt > 0) totalInvoiced += amt;
      }
    });

    let totalPaid = 0;
    payments.forEach((pay) => {
      if ((pay.customerName || '').trim().toLowerCase() === custNorm) {
        const amt = Number(pay.amountPaid ?? 0);
        if (amt > 0) totalPaid += amt;
      }
    });

    return {
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      netBalanceDue: Math.round((totalInvoiced - totalPaid) * 100) / 100,
    };
  }, [statementCustomer, invoices, payments]);

  // Very Formatted Excel Export for Customer Statement
  const handleExportStatementExcel = () => {
    if (!statementCustomer) return;

    try {
      const workbook = XLSX.utils.book_new();

      if (statementViewMode === 'OUTSTANDING') {
        const totOrig = outstandingInvoicesForCustomer.reduce((s, i) => s + i.totalAmount, 0);
        const totPaid = outstandingInvoicesForCustomer.reduce((s, i) => s + i.paidAmount, 0);
        const totBal = outstandingInvoicesForCustomer.reduce((s, i) => s + i.outstandingBalance, 0);

        const headerBlock: (string | number | null)[][] = [
          ['FAMOLA ENTERPRISE / FBI EXCEL NINJA - FINANCIAL SERVICES'],
          ['STATEMENT OF OUTSTANDING INVOICES (UNALLOCATED BALANCES)'],
          [],
          ['Customer Account:', statementCustomer, '', 'Currency:', 'TZS (Tanzanian Shilling)'],
          [
            'Statement Period:',
            `${statementStartDate || 'Inception'} to ${statementEndDate || 'Current'}`,
            '',
            'Report Generated:',
            new Date().toLocaleString(),
          ],
          ['Total Outstanding Invoices:', outstandingInvoicesForCustomer.length, '', 'Total Outstanding Due:', totBal],
          [],
          [
            '#',
            'DATE',
            'INVOICE NO.',
            'DELIVERY NOTES / REFERENCE',
            'PO NUMBER',
            'CONTRACT',
            'INVOICE AMOUNT (Cr) TZS',
            'ALLOCATED PAYMENT (Dr) TZS',
            'OUTSTANDING BALANCE TZS',
            'ALLOCATION STATUS',
          ],
        ];

        const dataRows = outstandingInvoicesForCustomer.map((inv, idx) => [
          idx + 1,
          inv.date,
          inv.invoiceNumber,
          inv.deliveryNotes,
          inv.poNumber,
          inv.contract,
          inv.totalAmount,
          inv.paidAmount > 0 ? inv.paidAmount : null,
          inv.outstandingBalance,
          inv.allocationStatus === 'UNALLOCATED' ? 'Unallocated (No payment allocated)' : 'Partially Allocated',
        ]);

        const closingRow = [
          '—',
          'TOTALS',
          '—',
          '—',
          '—',
          '—',
          totOrig,
          totPaid,
          totBal,
          'Total Outstanding Receivables',
        ];

        const fullSheetData = [...headerBlock, ...dataRows, [], closingRow];
        const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);
        worksheet['!cols'] = [
          { wch: 6 },
          { wch: 14 },
          { wch: 22 },
          { wch: 28 },
          { wch: 18 },
          { wch: 18 },
          { wch: 22 },
          { wch: 22 },
          { wch: 22 },
          { wch: 28 },
        ];
        const sheetName = `Outstanding_${statementCustomer.slice(0, 18).replace(/[^a-zA-Z0-9]/g, '_')}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `Outstanding_Invoices_${statementCustomer.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        return;
      }

      const headerBlock: (string | number | null)[][] = [
        ['FAMOLA ENTERPRISE / FBI EXCEL NINJA - FINANCIAL SERVICES'],
        ['STATEMENT OF ACCOUNT & CUSTOMER RECEIVABLE LEDGER'],
        [],
        ['Customer Account:', statementCustomer, '', 'Currency:', 'TZS (Tanzanian Shilling)'],
        [
          'Statement Period:',
          `${statementStartDate || 'Inception'} to ${statementEndDate || 'Current'}`,
          '',
          'Report Generated:',
          new Date().toLocaleString(),
        ],
        [
          'Lifetime Invoiced (Cr):',
          customerLifetimeStats.totalInvoiced,
          '',
          'Lifetime Paid (Dr):',
          customerLifetimeStats.totalPaid,
        ],
        ['Net Outstanding Balance Due:', customerLifetimeStats.netBalanceDue],
        [],
        // Column headers: Start Dr then Cr
        [
          '#',
          'DATE',
          'TRANSACTION TYPE',
          'INVOICE / PV NO.',
          'DELIVERY NOTES / REFERENCE',
          'PO NUMBER',
          'CONTRACT',
          'Dr (PAYMENT) TZS',
          'Cr (INVOICE) TZS',
          'RUNNING BALANCE TZS',
          'REMARKS',
        ],
        // Opening balance row
        [
          '—',
          statementStartDate || 'Initial',
          'OPENING BALANCE',
          '—',
          'Opening Balance brought forward',
          '—',
          '—',
          null,
          null,
          openingBalance,
          'Opening Balance',
        ],
      ];

      // Data rows
      const dataRows = ledgerRows.map((r, idx) => [
        idx + 1,
        r.date,
        r.transactionType === 'INVOICE' ? 'Invoice' : 'Payment',
        r.documentNumber,
        r.referenceInfo,
        r.poNumber,
        r.contract,
        r.debitPayment > 0 ? r.debitPayment : null,
        r.creditInvoice > 0 ? r.creditInvoice : null,
        r.runningBalance,
        r.notes || '',
      ]);

      // Closing totals row
      const closingRow = [
        '—',
        statementEndDate || 'Current',
        'CLOSING TOTALS',
        '—',
        `Net Outstanding Balance for ${statementCustomer}`,
        '—',
        '—',
        totalPeriodDebits,
        totalPeriodCredits,
        closingBalance,
        'Closing Balance',
      ];

      const fullSheetData = [...headerBlock, ...dataRows, [], closingRow];
      const worksheet = XLSX.utils.aoa_to_sheet(fullSheetData);

      // Explicit column widths
      worksheet['!cols'] = [
        { wch: 6 },  // #
        { wch: 14 }, // Date
        { wch: 18 }, // Type
        { wch: 22 }, // Document No
        { wch: 28 }, // Delivery Notes / Ref
        { wch: 18 }, // PO Number
        { wch: 18 }, // Contract
        { wch: 20 }, // Dr Payment
        { wch: 20 }, // Cr Invoice
        { wch: 22 }, // Running Balance
        { wch: 30 }, // Remarks
      ];

      const sheetName = `Statement_${statementCustomer.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      const cleanFilename = `Statement_${statementCustomer.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, cleanFilename);
    } catch (err) {
      console.error('Failed to export formatted statement to Excel:', err);
    }
  };

  // Export Customer Statement to PDF (Dr then Cr)
  const handleExportStatementPdf = () => {
    if (!statementCustomer) return;

    if (statementViewMode === 'OUTSTANDING') {
      const headers = [
        'Date',
        'Invoice No & Reference',
        'PO #',
        'Contract',
        'Invoice Amount (Cr)',
        'Allocated Paid (Dr)',
        'Outstanding Balance',
        'Status',
      ];

      const rows: (string | number)[][] = [];
      outstandingInvoicesForCustomer.forEach((inv) => {
        rows.push([
          inv.date,
          `${inv.invoiceNumber} (${inv.deliveryNotes})`,
          inv.poNumber,
          inv.contract,
          `TZS ${formatCurrency(inv.totalAmount)}`,
          inv.paidAmount > 0 ? `TZS ${formatCurrency(inv.paidAmount)}` : '—',
          `TZS ${formatCurrency(inv.outstandingBalance)}`,
          inv.allocationStatus === 'UNALLOCATED' ? 'Unallocated' : 'Partial',
        ]);
      });

      const totBal = outstandingInvoicesForCustomer.reduce((s, i) => s + i.outstandingBalance, 0);
      const totOrig = outstandingInvoicesForCustomer.reduce((s, i) => s + i.totalAmount, 0);
      const totPaid = outstandingInvoicesForCustomer.reduce((s, i) => s + i.paidAmount, 0);

      rows.push([
        'TOTALS',
        `${outstandingInvoicesForCustomer.length} Invoices`,
        '—',
        '—',
        `TZS ${formatCurrency(totOrig)}`,
        `TZS ${formatCurrency(totPaid)}`,
        `TZS ${formatCurrency(totBal)}`,
        'Outstanding Total',
      ]);

      exportTableToPdf(
        `Outstanding Invoices Statement: ${statementCustomer}`,
        headers,
        rows,
        {
          filenamePrefix: `Outstanding_${statementCustomer.replace(/\s+/g, '_')}`,
          subtitle: `Invoices with unallocated/pending payments • Total Outstanding Balance: TZS ${formatCurrency(totBal)}`,
          orientation: 'landscape',
        }
      );
      return;
    }

    const headers = [
      'Date',
      'Type',
      'Document / Ref',
      'PO #',
      'Contract',
      'Dr (Payment)',
      'Cr (Invoice)',
      'Balance (TZS)',
    ];

    const rows: (string | number)[][] = [];

    // Opening Balance
    rows.push([
      statementStartDate || 'Start',
      'B/FWD',
      'Opening Balance',
      '—',
      '—',
      '—',
      '—',
      `TZS ${formatCurrency(openingBalance)}`,
    ]);

    ledgerRows.forEach((r) => {
      rows.push([
        r.date,
        r.transactionType === 'INVOICE' ? 'INV' : 'PAY',
        `${r.documentNumber} (${r.referenceInfo})`,
        r.poNumber,
        r.contract,
        r.debitPayment > 0 ? `TZS ${formatCurrency(r.debitPayment)}` : '—',
        r.creditInvoice > 0 ? `TZS ${formatCurrency(r.creditInvoice)}` : '—',
        `TZS ${formatCurrency(r.runningBalance)}`,
      ]);
    });

    // Closing Balance
    rows.push([
      statementEndDate || 'End',
      'TOTAL',
      'Period Movement / Closing Balance',
      '—',
      '—',
      `TZS ${formatCurrency(totalPeriodDebits)}`,
      `TZS ${formatCurrency(totalPeriodCredits)}`,
      `TZS ${formatCurrency(closingBalance)}`,
    ]);

    exportTableToPdf(
      `Customer Statement of Account: ${statementCustomer}`,
      headers,
      rows,
      {
        filenamePrefix: `Statement_${statementCustomer.replace(/\s+/g, '_')}`,
        subtitle: `Period: ${statementStartDate || 'Beginning'} to ${statementEndDate || 'Present'} • Net Outstanding Balance: TZS ${formatCurrency(closingBalance)}`,
        orientation: 'landscape',
      }
    );
  };

  // =========================================================================
  // TAB 3: TOTAL OUTSTANDING PER CUSTOMER & INVOICE DRILLDOWN
  // =========================================================================
  const [outstandingSearchQuery, setOutstandingSearchQuery] = useState('');
  const [outstandingStatusFilter, setOutstandingStatusFilter] = useState<'ALL' | 'WITH_BALANCE' | 'SETTLED'>('ALL');
  const [expandedOutstandingCustomers, setExpandedOutstandingCustomers] = useState<Record<string, boolean>>({});
  const [drilledCustomerModal, setDrilledCustomerModal] = useState<CustomerOutstandingSummary | null>(null);
  const [outstandingPage, setOutstandingPage] = useState(1);
  const [outstandingPageSize, setOutstandingPageSize] = useState(15);

  // Compute Total Outstanding Summary per Customer
  const customerOutstandingSummaries = useMemo<CustomerOutstandingSummary[]>(() => {
    // Group all non-cancelled invoices by customer
    const custMap = new Map<string, InvoiceRecord[]>();
    allCustomerNames.forEach((c) => custMap.set(c, []));

    invoices.forEach((inv) => {
      if (inv.status === 'CANCELLED') return;
      const c = (inv.customerName || 'General Customer').trim();
      if (!custMap.has(c)) custMap.set(c, []);
      custMap.get(c)!.push(inv);
    });

    // Also gather customer payments
    const paymentsByCust = new Map<string, PaymentRecord[]>();
    payments.forEach((p) => {
      const c = (p.customerName || 'General Customer').trim();
      if (!paymentsByCust.has(c)) paymentsByCust.set(c, []);
      paymentsByCust.get(c)!.push(p);
    });

    const summaries: CustomerOutstandingSummary[] = [];

    custMap.forEach((custInvs, custName) => {
      const custPayments = paymentsByCust.get(custName) || [];

      let totalInvoiced = 0;
      let totalPaidFromInvoices = 0;
      let unpaidCount = 0;
      let partialCount = 0;
      let paidCount = 0;

      const invoiceItems: CustomerInvoiceItem[] = [];

      custInvs.forEach((inv) => {
        const totalAmt = Number(inv.totalAfterVat ?? inv.totalAmount ?? 0);
        if (totalAmt <= 0) return;

        const paidAmt = Number(inv.paidAmount ?? 0);
        const due = Math.max(0, Math.round((totalAmt - paidAmt) * 100) / 100);

        totalInvoiced += totalAmt;
        totalPaidFromInvoices += paidAmt;

        let status: 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
        if (due <= 0.01) {
          status = 'PAID';
          paidCount += 1;
        } else if (paidAmt > 0) {
          status = 'PARTIAL';
          partialCount += 1;
        } else {
          status = 'UNPAID';
          unpaidCount += 1;
        }

        // Linked Delivery Notes
        const linkedDns = new Set<string>();
        (inv.lines || []).forEach((l) => {
          (l.deliveryNoteNumbers || []).forEach((dn) => dn && linkedDns.add(dn.trim()));
        });
        const byInv = deliveryNotesByInvoiceMap.get((inv.invoiceNumber || '').trim().toLowerCase()) || [];
        byInv.forEach((dn) => linkedDns.add(dn));

        invoiceItems.push({
          id: inv.id || inv.invoiceNumber,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate || '—',
          poNumber: inv.poNumber || '—',
          contract: inv.contract || '—',
          destination: inv.destination || '—',
          totalAmount: totalAmt,
          paidAmount: paidAmt,
          balanceDue: due,
          paymentStatus: status,
          linkedDeliveryNotes: Array.from(linkedDns).join(', ') || 'Pending DN',
          rawInvoice: inv,
        });
      });

      // Sort customer's invoices by date descending
      invoiceItems.sort((a, b) => naturalCompare(b.invoiceDate, a.invoiceDate));

      // Calculate total paid across customer payments
      const totalDirectPayments = custPayments.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
      const effectivePaid = Math.max(totalPaidFromInvoices, totalDirectPayments);
      const netOutstanding = Math.max(0, Math.round((totalInvoiced - effectivePaid) * 100) / 100);

      const lastInvDate = custInvs.length > 0 ? custInvs.map((i) => i.invoiceDate || '').sort().reverse()[0] : '—';
      const lastPayDate = custPayments.length > 0 ? custPayments.map((p) => p.paymentDate || '').sort().reverse()[0] : '—';

      summaries.push({
        customerName: custName,
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(effectivePaid * 100) / 100,
        totalOutstanding: netOutstanding,
        invoicesCount: invoiceItems.length,
        unpaidCount,
        partialCount,
        paidCount,
        lastInvoiceDate: lastInvDate,
        lastPaymentDate: lastPayDate,
        invoices: invoiceItems,
      });
    });

    // Default sort: highest outstanding balance first
    return summaries.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [invoices, payments, allCustomerNames, deliveryNotesByInvoiceMap]);

  // Filtered Outstanding Summaries
  const filteredOutstandingSummaries = useMemo(() => {
    return customerOutstandingSummaries.filter((cust) => {
      if (outstandingSearchQuery.trim()) {
        const q = outstandingSearchQuery.toLowerCase().trim();
        const matchName = cust.customerName.toLowerCase().includes(q);
        const matchInv = cust.invoices.some(
          (i) => i.invoiceNumber.toLowerCase().includes(q) || i.poNumber.toLowerCase().includes(q)
        );
        if (!matchName && !matchInv) return false;
      }
      if (outstandingStatusFilter === 'WITH_BALANCE') {
        return cust.totalOutstanding > 0;
      }
      if (outstandingStatusFilter === 'SETTLED') {
        return cust.totalOutstanding === 0;
      }
      return true;
    });
  }, [customerOutstandingSummaries, outstandingSearchQuery, outstandingStatusFilter]);

  // Overall Totals for Tab 3
  const globalOutstandingKpis = useMemo(() => {
    let overallInvoiced = 0;
    let overallPaid = 0;
    let overallOutstanding = 0;
    let totalInvoices = 0;
    let customersWithBalance = 0;
    let customersSettled = 0;

    customerOutstandingSummaries.forEach((c) => {
      overallInvoiced += c.totalInvoiced;
      overallPaid += c.totalPaid;
      overallOutstanding += c.totalOutstanding;
      totalInvoices += c.invoicesCount;
      if (c.totalOutstanding > 0) {
        customersWithBalance += 1;
      } else {
        customersSettled += 1;
      }
    });

    return {
      overallInvoiced: Math.round(overallInvoiced * 100) / 100,
      overallPaid: Math.round(overallPaid * 100) / 100,
      overallOutstanding: Math.round(overallOutstanding * 100) / 100,
      totalInvoices,
      customersWithBalance,
      customersSettled,
      totalCustomers: customerOutstandingSummaries.length,
    };
  }, [customerOutstandingSummaries]);

  const paginatedOutstandingSummaries = useMemo(() => {
    const start = (outstandingPage - 1) * outstandingPageSize;
    return filteredOutstandingSummaries.slice(start, start + outstandingPageSize);
  }, [filteredOutstandingSummaries, outstandingPage, outstandingPageSize]);

  const toggleOutstandingCustomerRow = (customerName: string) => {
    setExpandedOutstandingCustomers((prev) => ({
      ...prev,
      [customerName]: !prev[customerName],
    }));
  };

  // Export Outstanding Report to Excel
  const handleExportOutstandingExcel = () => {
    const headers = [
      '#',
      'Customer Name',
      'Total Invoiced (TZS)',
      'Total Paid (TZS)',
      'Total Outstanding (TZS)',
      'Total Invoices',
      'Unpaid / Partial Invoices',
      'Status',
      'Last Invoice Date',
      'Last Payment Date',
    ];

    const rows: (string | number)[][] = [];

    filteredOutstandingSummaries.forEach((cust, idx) => {
      rows.push([
        idx + 1,
        cust.customerName,
        cust.totalInvoiced,
        cust.totalPaid,
        cust.totalOutstanding,
        cust.invoicesCount,
        cust.unpaidCount + cust.partialCount,
        cust.totalOutstanding > 0 ? 'Outstanding Due' : 'Fully Settled',
        cust.lastInvoiceDate,
        cust.lastPaymentDate,
      ]);
    });

    // Add overall footer
    rows.push([
      '—',
      'OVERALL TOTAL',
      globalOutstandingKpis.overallInvoiced,
      globalOutstandingKpis.overallPaid,
      globalOutstandingKpis.overallOutstanding,
      globalOutstandingKpis.totalInvoices,
      '—',
      '—',
      '—',
      '—',
    ]);

    exportTableToExcel('Customer_Outstanding_Receivables_Summary', headers, rows, 'Outstanding_Receivables');
  };

  // =========================================================================
  // TAB 4: CUSTOMER AGING REPORT (6m, 1y, 2y, 3y, 4y+)
  // =========================================================================
  const [agingSearchQuery, setAgingSearchQuery] = useState('');
  const [agingFilterMode, setAgingFilterMode] = useState<'ALL' | 'ONLY_DUE'>('ONLY_DUE');
  const [drilledAgingCustomer, setDrilledAgingCustomer] = useState<CustomerAgingSummary | null>(null);
  const [expandedAgingRows, setExpandedAgingRows] = useState<Record<string, boolean>>({});
  const [agingPage, setAgingPage] = useState(1);
  const [agingPageSize, setAgingPageSize] = useState(15);

  // Compute Aging Summary per Customer
  // Buckets: 0-6m (0-182d), 6m-1y (183-365d), 1-2y (366-730d), 2-3y (731-1095d), 3-4y (1096-1460d), 4y+ (>1460d)
  const customerAgingSummaries = useMemo<CustomerAgingSummary[]>(() => {
    const today = new Date();

    const summaries: CustomerAgingSummary[] = [];

    customerOutstandingSummaries.forEach((cust) => {
      let b0_6m = 0;
      let b6m_1y = 0;
      let b1y_2y = 0;
      let b2y_3y = 0;
      let b3y_4y = 0;
      let bOver4y = 0;

      const agedInvoices: AgedInvoiceItem[] = [];

      cust.invoices.forEach((inv) => {
        if (inv.balanceDue <= 0.01) return; // Fully paid invoices do not age

        const invDate = new Date(inv.invoiceDate !== '—' ? inv.invoiceDate : inv.rawInvoice.createdAt || '1970-01-01');
        const diffMs = Math.max(0, today.getTime() - invDate.getTime());
        const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const ageMonths = Math.round((ageDays / 30.417) * 10) / 10;

        let bucketKey: '0_6m' | '6m_1y' | '1y_2y' | '2y_3y' | '3y_4y' | 'over_4y' = '0_6m';
        let bucketLabel = '0 – 6 Months';

        if (ageDays <= 182) {
          bucketKey = '0_6m';
          bucketLabel = '0 – 6 Months';
          b0_6m += inv.balanceDue;
        } else if (ageDays <= 365) {
          bucketKey = '6m_1y';
          bucketLabel = '6 Months – 1 Year';
          b6m_1y += inv.balanceDue;
        } else if (ageDays <= 730) {
          bucketKey = '1y_2y';
          bucketLabel = '1 – 2 Years';
          b1y_2y += inv.balanceDue;
        } else if (ageDays <= 1095) {
          bucketKey = '2y_3y';
          bucketLabel = '2 – 3 Years';
          b2y_3y += inv.balanceDue;
        } else if (ageDays <= 1460) {
          bucketKey = '3y_4y';
          bucketLabel = '3 – 4 Years';
          b3y_4y += inv.balanceDue;
        } else {
          bucketKey = 'over_4y';
          bucketLabel = '4 Years+';
          bOver4y += inv.balanceDue;
        }

        agedInvoices.push({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          poNumber: inv.poNumber,
          contract: inv.contract,
          destination: inv.destination,
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          balanceDue: inv.balanceDue,
          ageDays,
          ageMonths,
          bucketKey,
          bucketLabel,
          rawInvoice: inv.rawInvoice,
        });
      });

      // Sort aged invoices by oldest first
      agedInvoices.sort((a, b) => b.ageDays - a.ageDays);

      const totalCustOutstanding = Math.round((b0_6m + b6m_1y + b1y_2y + b2y_3y + b3y_4y + bOver4y) * 100) / 100;

      summaries.push({
        customerName: cust.customerName,
        totalOutstanding: totalCustOutstanding,
        b0_6m: Math.round(b0_6m * 100) / 100,
        b6m_1y: Math.round(b6m_1y * 100) / 100,
        b1y_2y: Math.round(b1y_2y * 100) / 100,
        b2y_3y: Math.round(b2y_3y * 100) / 100,
        b3y_4y: Math.round(b3y_4y * 100) / 100,
        bOver4y: Math.round(bOver4y * 100) / 100,
        unpaidInvoicesCount: agedInvoices.length,
        agedInvoices,
      });
    });

    // Default sort: highest total outstanding first
    return summaries.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [customerOutstandingSummaries]);

  // Filtered Aging Summaries
  const filteredAgingSummaries = useMemo(() => {
    return customerAgingSummaries.filter((cust) => {
      if (agingFilterMode === 'ONLY_DUE' && cust.totalOutstanding <= 0.01) {
        return false;
      }
      if (agingSearchQuery.trim()) {
        const q = agingSearchQuery.toLowerCase().trim();
        const matchName = cust.customerName.toLowerCase().includes(q);
        const matchInv = cust.agedInvoices.some(
          (i) => i.invoiceNumber.toLowerCase().includes(q) || i.poNumber.toLowerCase().includes(q)
        );
        if (!matchName && !matchInv) return false;
      }
      return true;
    });
  }, [customerAgingSummaries, agingFilterMode, agingSearchQuery]);

  // Global Aging KPIs
  const globalAgingKpis = useMemo(() => {
    let tot0_6m = 0;
    let tot6m_1y = 0;
    let tot1y_2y = 0;
    let tot2y_3y = 0;
    let tot3y_4y = 0;
    let totOver4y = 0;

    customerAgingSummaries.forEach((c) => {
      tot0_6m += c.b0_6m;
      tot6m_1y += c.b6m_1y;
      tot1y_2y += c.b1y_2y;
      tot2y_3y += c.b2y_3y;
      tot3y_4y += c.b3y_4y;
      totOver4y += c.bOver4y;
    });

    const grandTotal = tot0_6m + tot6m_1y + tot1y_2y + tot2y_3y + tot3y_4y + totOver4y;

    return {
      tot0_6m: Math.round(tot0_6m * 100) / 100,
      tot6m_1y: Math.round(tot6m_1y * 100) / 100,
      tot1y_2y: Math.round(tot1y_2y * 100) / 100,
      tot2y_3y: Math.round(tot2y_3y * 100) / 100,
      tot3y_4y: Math.round(tot3y_4y * 100) / 100,
      totOver4y: Math.round(totOver4y * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      p0_6m: grandTotal > 0 ? Math.round((tot0_6m / grandTotal) * 100) : 0,
      p6m_1y: grandTotal > 0 ? Math.round((tot6m_1y / grandTotal) * 100) : 0,
      p1y_2y: grandTotal > 0 ? Math.round((tot1y_2y / grandTotal) * 100) : 0,
      p2y_3y: grandTotal > 0 ? Math.round((tot2y_3y / grandTotal) * 100) : 0,
      p3y_4y: grandTotal > 0 ? Math.round((tot3y_4y / grandTotal) * 100) : 0,
      pOver4y: grandTotal > 0 ? Math.round((totOver4y / grandTotal) * 100) : 0,
    };
  }, [customerAgingSummaries]);

  const paginatedAgingSummaries = useMemo(() => {
    const start = (agingPage - 1) * agingPageSize;
    return filteredAgingSummaries.slice(start, start + agingPageSize);
  }, [filteredAgingSummaries, agingPage, agingPageSize]);

  const toggleAgingCustomerRow = (customerName: string) => {
    setExpandedAgingRows((prev) => ({
      ...prev,
      [customerName]: !prev[customerName],
    }));
  };

  // Export Customer Aging to Excel
  const handleExportAgingExcel = () => {
    const headers = [
      '#',
      'Customer Name',
      '0 – 6 Months TZS',
      '6M – 1 Year TZS',
      '1 – 2 Years TZS',
      '2 – 3 Years TZS',
      '3 – 4 Years TZS',
      '4 Years+ TZS',
      'Total Outstanding TZS',
      'Unpaid Invoices',
    ];

    const rows: (string | number)[][] = [];

    filteredAgingSummaries.forEach((cust, idx) => {
      rows.push([
        idx + 1,
        cust.customerName,
        cust.b0_6m,
        cust.b6m_1y,
        cust.b1y_2y,
        cust.b2y_3y,
        cust.b3y_4y,
        cust.bOver4y,
        cust.totalOutstanding,
        cust.unpaidInvoicesCount,
      ]);
    });

    // Add overall totals row
    rows.push([
      '—',
      'OVERALL AGING TOTAL',
      globalAgingKpis.tot0_6m,
      globalAgingKpis.tot6m_1y,
      globalAgingKpis.tot1y_2y,
      globalAgingKpis.tot2y_3y,
      globalAgingKpis.tot3y_4y,
      globalAgingKpis.totOver4y,
      globalAgingKpis.grandTotal,
      '—',
    ]);

    exportTableToExcel('Customer_Aging_Report', headers, rows, 'Customer_Aging');
  };

  // Export Customer Aging to PDF
  const handleExportAgingPdf = () => {
    const headers = [
      'Customer',
      '0–6 Mos',
      '6M–1 Yr',
      '1–2 Yrs',
      '2–3 Yrs',
      '3–4 Yrs',
      '4 Yrs+',
      'Total Due',
    ];

    const rows: (string | number)[][] = [];

    filteredAgingSummaries.forEach((cust) => {
      rows.push([
        cust.customerName,
        cust.b0_6m > 0 ? formatCurrency(cust.b0_6m) : '—',
        cust.b6m_1y > 0 ? formatCurrency(cust.b6m_1y) : '—',
        cust.b1y_2y > 0 ? formatCurrency(cust.b1y_2y) : '—',
        cust.b2y_3y > 0 ? formatCurrency(cust.b2y_3y) : '—',
        cust.b3y_4y > 0 ? formatCurrency(cust.b3y_4y) : '—',
        cust.bOver4y > 0 ? formatCurrency(cust.bOver4y) : '—',
        formatCurrency(cust.totalOutstanding),
      ]);
    });

    // Closing row
    rows.push([
      'OVERALL TOTAL',
      formatCurrency(globalAgingKpis.tot0_6m),
      formatCurrency(globalAgingKpis.tot6m_1y),
      formatCurrency(globalAgingKpis.tot1y_2y),
      formatCurrency(globalAgingKpis.tot2y_3y),
      formatCurrency(globalAgingKpis.tot3y_4y),
      formatCurrency(globalAgingKpis.totOver4y),
      formatCurrency(globalAgingKpis.grandTotal),
    ]);

    exportTableToPdf('Customer Accounts Receivable Aging Audit Report', headers, rows, {
      filenamePrefix: 'Customer_Aging_Report',
      subtitle: `Total Outstanding Portfolio: TZS ${formatCurrency(globalAgingKpis.grandTotal)} across ${filteredAgingSummaries.length} Customer Accounts`,
      orientation: 'landscape',
    });
  };

  // =========================================================================
  // TAB 5: COLLECTIONS REPORT (Monthly Breakdown & Date Range Cash Receipts)
  // =========================================================================
  const [collectionDatePreset, setCollectionDatePreset] = useState<
    'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_QUARTER' | 'THIS_YEAR' | 'CUSTOM'
  >('ALL');
  const [collectionStartDate, setCollectionStartDate] = useState<string>('');
  const [collectionEndDate, setCollectionEndDate] = useState<string>('');
  const [collectionCustomerFilter, setCollectionCustomerFilter] = useState<string>('ALL');
  const [collectionSearchQuery, setCollectionSearchQuery] = useState<string>('');
  const [collectionViewMode, setCollectionViewMode] = useState<'monthly' | 'detailed'>('monthly');
  const [drilledCollectionMonth, setDrilledCollectionMonth] = useState<string | null>(null);
  const [expandedPaymentVouchers, setExpandedPaymentVouchers] = useState<Record<string, boolean>>({});
  const [viewingReceiptPayment, setViewingReceiptPayment] = useState<PaymentRecord | null>(null);
  const [collectionPage, setCollectionPage] = useState<number>(1);
  const [collectionPageSize, setCollectionPageSize] = useState<number>(15);

  // Helper to determine if a payment falls inside the selected date filter
  const isPaymentInDateRange = (paymentDate: string): boolean => {
    if (!paymentDate) return true;
    const dateObj = new Date(paymentDate);
    if (isNaN(dateObj.getTime())) return true;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    if (collectionDatePreset === 'ALL') return true;

    if (collectionDatePreset === 'THIS_MONTH') {
      return dateObj.getFullYear() === curYear && dateObj.getMonth() === curMonth;
    }

    if (collectionDatePreset === 'LAST_MONTH') {
      const lastMonthDate = new Date(curYear, curMonth - 1, 1);
      return (
        dateObj.getFullYear() === lastMonthDate.getFullYear() &&
        dateObj.getMonth() === lastMonthDate.getMonth()
      );
    }

    if (collectionDatePreset === 'LAST_30_DAYS') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return dateObj >= thirtyDaysAgo && dateObj <= now;
    }

    if (collectionDatePreset === 'THIS_QUARTER') {
      const curQuarter = Math.floor(curMonth / 3);
      const qStart = new Date(curYear, curQuarter * 3, 1);
      const qEnd = new Date(curYear, (curQuarter + 1) * 3, 0, 23, 59, 59);
      return dateObj >= qStart && dateObj <= qEnd;
    }

    if (collectionDatePreset === 'THIS_YEAR') {
      return dateObj.getFullYear() === curYear;
    }

    if (collectionDatePreset === 'CUSTOM') {
      const start = collectionStartDate ? new Date(collectionStartDate) : null;
      const end = collectionEndDate ? new Date(collectionEndDate + 'T23:59:59') : null;
      if (start && dateObj < start) return false;
      if (end && dateObj > end) return false;
      return true;
    }

    return true;
  };

  // Filtered Payments matching the date range, customer, and search query
  const filteredCollectionsPayments = useMemo(() => {
    return payments
      .filter((p) => {
        const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '');
        if (!isPaymentInDateRange(pDate)) return false;

        if (collectionCustomerFilter !== 'ALL') {
          const matchCust = (p.customerName || '').toLowerCase().includes(collectionCustomerFilter.toLowerCase());
          const matchAllocCust = (p.allocations || []).some((al) =>
            (al.customerName || '').toLowerCase().includes(collectionCustomerFilter.toLowerCase())
          );
          if (!matchCust && !matchAllocCust) return false;
        }

        if (collectionSearchQuery.trim()) {
          const q = collectionSearchQuery.toLowerCase().trim();
          const matchNum = (p.paymentNumber || p.id || '').toLowerCase().includes(q);
          const matchBatch = (p.batchNumber || '').toLowerCase().includes(q);
          const matchRef = (p.referenceNumber || '').toLowerCase().includes(q);
          const matchCust = (p.customerName || '').toLowerCase().includes(q);
          const matchInv =
            (p.invoiceNumber || '').toLowerCase().includes(q) ||
            (p.allocations || []).some((al) => al.invoiceNumber.toLowerCase().includes(q));
          if (!matchNum && !matchBatch && !matchRef && !matchCust && !matchInv) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = a.paymentDate || a.createdAt || '';
        const dateB = b.paymentDate || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
  }, [
    payments,
    collectionDatePreset,
    collectionStartDate,
    collectionEndDate,
    collectionCustomerFilter,
    collectionSearchQuery,
  ]);

  // Distinct Customers with Collections for Filter Dropdown
  const distinctCollectionCustomers = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.customerName) set.add(p.customerName.trim());
      (p.allocations || []).forEach((al) => {
        if (al.customerName) set.add(al.customerName.trim());
      });
    });
    return Array.from(set).filter(Boolean).sort(naturalCompare);
  }, [payments]);

  // Monthly Aggregated Collections
  interface MonthlyCollectionRow {
    monthKey: string;
    monthLabel: string;
    totalGrossSettled: number;
    totalWht: number;
    totalVatWht: number;
    totalNetCollected: number;
    vouchersCount: number;
    invoicesSettledCount: number;
    customersCount: number;
    payments: PaymentRecord[];
  }

  const monthlyCollectionsSummaries = useMemo<MonthlyCollectionRow[]>(() => {
    const map = new Map<string, PaymentRecord[]>();

    filteredCollectionsPayments.forEach((p) => {
      const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '2026-01-01');
      const mKey = pDate.slice(0, 7) || 'Unknown';
      if (!map.has(mKey)) {
        map.set(mKey, []);
      }
      map.get(mKey)!.push(p);
    });

    const rows: MonthlyCollectionRow[] = [];

    map.forEach((pmts, mKey) => {
      let gross = 0;
      let wht = 0;
      let vatWht = 0;
      let net = 0;
      let invCount = 0;
      const custs = new Set<string>();

      pmts.forEach((p) => {
        const pNet = p.amountPaid || 0;
        let pGross = p.grossAmount || 0;
        let pWht = p.totalWithholdingTax || 0;
        let pVatWht = p.totalVatWithholding || 0;

        if (p.allocations && p.allocations.length > 0) {
          invCount += p.allocations.length;
          let allocGross = 0;
          let allocWht = 0;
          let allocVatWht = 0;
          p.allocations.forEach((al) => {
            if (al.customerName) custs.add(al.customerName.trim());
            allocGross += al.allocatedAmount || 0;
            allocWht += al.withholdingTax || 0;
            allocVatWht += al.vatWithholdingTax || 0;
          });
          if (pGross <= 0) pGross = allocGross;
          if (pWht <= 0) pWht = allocWht;
          if (pVatWht <= 0) pVatWht = allocVatWht;
        } else {
          invCount += 1;
        }

        if (p.customerName) custs.add(p.customerName.trim());
        if (pGross <= 0) pGross = pNet + pWht + pVatWht;

        gross += pGross;
        wht += pWht;
        vatWht += pVatWht;
        net += pNet;
      });

      let label = mKey;
      if (mKey.includes('-')) {
        const [yr, mo] = mKey.split('-');
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const mIdx = parseInt(mo, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          label = `${monthNames[mIdx]} ${yr}`;
        }
      }

      rows.push({
        monthKey: mKey,
        monthLabel: label,
        totalGrossSettled: Math.round(gross * 100) / 100,
        totalWht: Math.round(wht * 100) / 100,
        totalVatWht: Math.round(vatWht * 100) / 100,
        totalNetCollected: Math.round(net * 100) / 100,
        vouchersCount: pmts.length,
        invoicesSettledCount: invCount,
        customersCount: custs.size,
        payments: pmts,
      });
    });

    return rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [filteredCollectionsPayments]);

  // Overall Collection KPIs
  const globalCollectionsKpis = useMemo(() => {
    let gross = 0;
    let wht = 0;
    let vatWht = 0;
    let net = 0;
    let invoicesCount = 0;
    const customers = new Set<string>();

    filteredCollectionsPayments.forEach((p) => {
      const pNet = p.amountPaid || 0;
      let pGross = p.grossAmount || 0;
      let pWht = p.totalWithholdingTax || 0;
      let pVatWht = p.totalVatWithholding || 0;

      if (p.allocations && p.allocations.length > 0) {
        invoicesCount += p.allocations.length;
        let allocGross = 0;
        let allocWht = 0;
        let allocVatWht = 0;
        p.allocations.forEach((al) => {
          if (al.customerName) customers.add(al.customerName.trim());
          allocGross += al.allocatedAmount || 0;
          allocWht += al.withholdingTax || 0;
          allocVatWht += al.vatWithholdingTax || 0;
        });
        if (pGross <= 0) pGross = allocGross;
        if (pWht <= 0) pWht = allocWht;
        if (pVatWht <= 0) pVatWht = allocVatWht;
      } else {
        invoicesCount += 1;
      }

      if (p.customerName) customers.add(p.customerName.trim());
      if (pGross <= 0) pGross = pNet + pWht + pVatWht;

      gross += pGross;
      wht += pWht;
      vatWht += pVatWht;
      net += pNet;
    });

    return {
      totalGross: Math.round(gross * 100) / 100,
      totalWht: Math.round(wht * 100) / 100,
      totalVatWht: Math.round(vatWht * 100) / 100,
      totalNet: Math.round(net * 100) / 100,
      totalVouchers: filteredCollectionsPayments.length,
      totalInvoices: invoicesCount,
      distinctCustomers: customers.size,
    };
  }, [filteredCollectionsPayments]);

  // Paginated detailed collection payments
  const paginatedCollectionPayments = useMemo(() => {
    let source = filteredCollectionsPayments;
    if (drilledCollectionMonth) {
      source = source.filter((p) => {
        const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '');
        return pDate.startsWith(drilledCollectionMonth);
      });
    }
    const start = (collectionPage - 1) * collectionPageSize;
    return source.slice(start, start + collectionPageSize);
  }, [filteredCollectionsPayments, drilledCollectionMonth, collectionPage, collectionPageSize]);

  const totalFilteredDetailedCount = useMemo(() => {
    if (drilledCollectionMonth) {
      return filteredCollectionsPayments.filter((p) => {
        const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '');
        return pDate.startsWith(drilledCollectionMonth);
      }).length;
    }
    return filteredCollectionsPayments.length;
  }, [filteredCollectionsPayments, drilledCollectionMonth]);

  // Toggle expanded voucher row
  const toggleExpandVoucher = (voucherId: string) => {
    setExpandedPaymentVouchers((prev) => ({
      ...prev,
      [voucherId]: !prev[voucherId],
    }));
  };

  // Export Monthly Summary to Excel
  const handleExportMonthlyCollectionsExcel = () => {
    const headers = [
      '#',
      'Month & Year',
      'Gross Invoices Settled (TZS)',
      'Withholding Tax (WHT) TZS',
      'VAT Withholding TZS',
      'Net Cash Collected (TZS)',
      'Vouchers Count',
      'Invoices Settled',
      'Distinct Customers',
    ];

    const rows: (string | number)[][] = [];

    monthlyCollectionsSummaries.forEach((m, idx) => {
      rows.push([
        idx + 1,
        m.monthLabel,
        m.totalGrossSettled,
        m.totalWht,
        m.totalVatWht,
        m.totalNetCollected,
        m.vouchersCount,
        m.invoicesSettledCount,
        m.customersCount,
      ]);
    });

    // Overall summary footer
    rows.push([
      '—',
      'OVERALL TOTAL',
      globalCollectionsKpis.totalGross,
      globalCollectionsKpis.totalWht,
      globalCollectionsKpis.totalVatWht,
      globalCollectionsKpis.totalNet,
      globalCollectionsKpis.totalVouchers,
      globalCollectionsKpis.totalInvoices,
      globalCollectionsKpis.distinctCustomers,
    ]);

    exportTableToExcel('Monthly_Collections_Summary_Report', headers, rows, 'Monthly_Collections');
  };

  // Export Detailed Collections Register to Excel
  const handleExportDetailedCollectionsExcel = () => {
    const headers = [
      '#',
      'Payment Date',
      'Voucher / ID',
      'Batch Number',
      'Customer Name',
      'Payment Reference',
      'Method',
      'Gross Debt Settled (TZS)',
      'WHT Deducted (TZS)',
      'VAT WHT Deducted (TZS)',
      'Net Cash Collected (TZS)',
      'Invoices Settled',
    ];

    const rows: (string | number)[][] = [];

    let targetPmts = filteredCollectionsPayments;
    if (drilledCollectionMonth) {
      targetPmts = targetPmts.filter((p) => {
        const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '');
        return pDate.startsWith(drilledCollectionMonth);
      });
    }

    targetPmts.forEach((p, idx) => {
      const pNet = p.amountPaid || 0;
      let pGross = p.grossAmount || 0;
      let pWht = p.totalWithholdingTax || 0;
      let pVatWht = p.totalVatWithholding || 0;

      if (p.allocations && p.allocations.length > 0) {
        let allocGross = 0;
        let allocWht = 0;
        let allocVatWht = 0;
        p.allocations.forEach((al) => {
          allocGross += al.allocatedAmount || 0;
          allocWht += al.withholdingTax || 0;
          allocVatWht += al.vatWithholdingTax || 0;
        });
        if (pGross <= 0) pGross = allocGross;
        if (pWht <= 0) pWht = allocWht;
        if (pVatWht <= 0) pVatWht = allocVatWht;
      }
      if (pGross <= 0) pGross = pNet + pWht + pVatWht;

      const invList = (p.allocations || []).map((al) => al.invoiceNumber).filter(Boolean).join(', ') || p.invoiceNumber || '—';

      rows.push([
        idx + 1,
        p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '—'),
        p.paymentNumber || p.id,
        p.batchNumber || '—',
        p.customerName || 'General Customer',
        p.referenceNumber || '—',
        p.paymentMethod || 'Bank Transfer',
        pGross,
        pWht,
        pVatWht,
        pNet,
        invList,
      ]);
    });

    // Add totals row
    rows.push([
      '—',
      'TOTAL',
      '—',
      '—',
      '—',
      '—',
      '—',
      globalCollectionsKpis.totalGross,
      globalCollectionsKpis.totalWht,
      globalCollectionsKpis.totalVatWht,
      globalCollectionsKpis.totalNet,
      `${globalCollectionsKpis.totalInvoices} Invoices`,
    ]);

    exportTableToExcel('Detailed_Collections_Register', headers, rows, 'Collections_Register');
  };

  // Export Collections to PDF
  const handleExportCollectionsPdf = () => {
    if (collectionViewMode === 'monthly') {
      const headers = [
        'Month & Year',
        'Gross Settled',
        'WHT Deducted',
        'VAT WHT',
        'Net Cash Collected',
        'Vouchers',
        'Invoices',
      ];

      const rows: (string | number)[][] = [];

      monthlyCollectionsSummaries.forEach((m) => {
        rows.push([
          m.monthLabel,
          formatCurrency(m.totalGrossSettled),
          formatCurrency(m.totalWht),
          formatCurrency(m.totalVatWht),
          formatCurrency(m.totalNetCollected),
          m.vouchersCount,
          m.invoicesSettledCount,
        ]);
      });

      rows.push([
        'OVERALL TOTAL',
        formatCurrency(globalCollectionsKpis.totalGross),
        formatCurrency(globalCollectionsKpis.totalWht),
        formatCurrency(globalCollectionsKpis.totalVatWht),
        formatCurrency(globalCollectionsKpis.totalNet),
        globalCollectionsKpis.totalVouchers,
        globalCollectionsKpis.totalInvoices,
      ]);

      exportTableToPdf('Monthly Cash Collections & Deductions Summary Report', headers, rows, {
        filenamePrefix: 'Monthly_Collections_Summary',
        subtitle: `Total Net Collected: TZS ${formatCurrency(globalCollectionsKpis.totalNet)} | Gross Settled: TZS ${formatCurrency(globalCollectionsKpis.totalGross)}`,
        orientation: 'landscape',
      });
    } else {
      const headers = [
        'Date',
        'Voucher #',
        'Customer',
        'Reference',
        'Gross Settled',
        'WHT',
        'VAT WHT',
        'Net Collected',
      ];

      const rows: (string | number)[][] = [];

      let targetPmts = filteredCollectionsPayments;
      if (drilledCollectionMonth) {
        targetPmts = targetPmts.filter((p) => {
          const pDate = p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '');
          return pDate.startsWith(drilledCollectionMonth);
        });
      }

      targetPmts.forEach((p) => {
        const pNet = p.amountPaid || 0;
        let pGross = p.grossAmount || 0;
        let pWht = p.totalWithholdingTax || 0;
        let pVatWht = p.totalVatWithholding || 0;

        if (p.allocations && p.allocations.length > 0) {
          let allocGross = 0;
          let allocWht = 0;
          let allocVatWht = 0;
          p.allocations.forEach((al) => {
            allocGross += al.allocatedAmount || 0;
            allocWht += al.withholdingTax || 0;
            allocVatWht += al.vatWithholdingTax || 0;
          });
          if (pGross <= 0) pGross = allocGross;
          if (pWht <= 0) pWht = allocWht;
          if (pVatWht <= 0) pVatWht = allocVatWht;
        }
        if (pGross <= 0) pGross = pNet + pWht + pVatWht;

        rows.push([
          p.paymentDate || '—',
          p.paymentNumber || p.id,
          p.customerName || 'General Customer',
          p.referenceNumber || '—',
          formatCurrency(pGross),
          formatCurrency(pWht),
          formatCurrency(pVatWht),
          formatCurrency(pNet),
        ]);
      });

      rows.push([
        'OVERALL TOTAL',
        '—',
        '—',
        '—',
        formatCurrency(globalCollectionsKpis.totalGross),
        formatCurrency(globalCollectionsKpis.totalWht),
        formatCurrency(globalCollectionsKpis.totalVatWht),
        formatCurrency(globalCollectionsKpis.totalNet),
      ]);

      exportTableToPdf('Detailed Collections Register Audit Report', headers, rows, {
        filenamePrefix: 'Detailed_Collections_Register',
        subtitle: `Total Receipts: ${filteredCollectionsPayments.length} | Net Cash: TZS ${formatCurrency(globalCollectionsKpis.totalNet)}`,
        orientation: 'landscape',
      });
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner & Module Switcher (5 Tabs) */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-sm ${entityTheme.logoBg} ${entityTheme.logoShadow}`}>
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-xs uppercase ${entityTheme.ribbonBadge}`}>
                  {currentEntity.shortCode}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {currentEntity.name} • Audit &amp; Reports Hub
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                50-leaflet books, chronological ledger (Dr/Cr), customer balances, 4-year aging &amp; monthly collections audit
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher - 5 High-Impact Modules */}
        <div className="flex flex-wrap items-center bg-slate-800/90 p-1.5 rounded-xl border border-slate-700/80 text-xs font-semibold gap-1 self-start xl:self-auto">
          {/* Tab 1: Books */}
          <button
            type="button"
            onClick={() => setActiveReportTab('invoice_books')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 font-bold ${
              activeReportTab === 'invoice_books'
                ? `${entityTheme.primaryCtaBtn} shadow-xs text-white`
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <BookOpen className="w-4 h-4 text-white" />
            <span>Invoice Books</span>
          </button>

          {/* Tab 2: Statement */}
          <button
            type="button"
            onClick={() => setActiveReportTab('customer_statement')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 font-bold ${
              activeReportTab === 'customer_statement'
                ? `${entityTheme.primaryCtaBtn} shadow-xs text-white`
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Scale className="w-4 h-4 text-white" />
            <span>Customer Statement</span>
          </button>

          {/* Tab 3: Outstanding per Customer */}
          <button
            type="button"
            onClick={() => setActiveReportTab('outstanding_summary')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 font-bold ${
              activeReportTab === 'outstanding_summary'
                ? `${entityTheme.primaryCtaBtn} shadow-xs text-white`
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Receipt className="w-4 h-4 text-white" />
            <span>Total Outstanding</span>
          </button>

          {/* Tab 4: Customer Aging */}
          <button
            type="button"
            onClick={() => setActiveReportTab('aging_report')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 font-bold ${
              activeReportTab === 'aging_report'
                ? `${entityTheme.primaryCtaBtn} shadow-xs text-white`
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Clock className="w-4 h-4 text-white" />
            <span>Aging Report (4Y+)</span>
          </button>

          {/* Tab 5: Collections Report */}
          <button
            type="button"
            onClick={() => setActiveReportTab('collections_report')}
            className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 font-bold ${
              activeReportTab === 'collections_report'
                ? `${entityTheme.primaryCtaBtn} shadow-xs text-white`
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <CreditCard className="w-4 h-4 text-white" />
            <span>Collections Report</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: INVOICE BOOK STATUS PER CUSTOMER (50 LEAFLETS)
          ===================================================================== */}
      {activeReportTab === 'invoice_books' && (
        <div className="space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Physical Books
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono block mt-1">
                {globalBookKpis.totalBooks}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({globalBookKpis.activeBooks} active, {globalBookKpis.ignoredBooks} ignored)
                </span>
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">50 leaflets per sequential book</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Recorded Leaves
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-800 font-mono block mt-1">
                {globalBookKpis.totalInvoicesRecorded.toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-700 mt-1 block font-medium">
                Verified invoice leaflets in system
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                Missing Leaflets
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-900 font-mono block mt-1">
                {globalBookKpis.totalMissingLeaflets.toLocaleString()}
              </span>
              <span className="text-[10px] text-amber-700 mt-1 block font-medium">
                Sequence gaps across active books
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
                Overall Sequence Rate
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono block mt-1">
                {globalBookKpis.overallCompletionRate}%
              </span>
              <span className="text-[10px] text-blue-700 mt-1 block font-medium">
                Active books leaf continuity
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer, book #, or range..."
                  value={bookSearchQuery}
                  onChange={(e) => {
                    setBookSearchQuery(e.target.value);
                    setBookPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
              {/* Customer Selector */}
              <select
                value={selectedBookCustomer}
                onChange={(e) => {
                  setSelectedBookCustomer(e.target.value);
                  setBookPage(1);
                }}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-medium cursor-pointer"
              >
                <option value="ALL">All Customers ({customerSeriesSummaries.length})</option>
                {customerSeriesSummaries.map((c) => (
                  <option key={c.customerName} value={c.customerName}>
                    {c.customerName} ({c.totalBooks} books)
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setBookStatusFilter('ALL')}
                  className={`px-2 py-1 rounded font-semibold transition-all cursor-pointer ${
                    bookStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setBookStatusFilter('WITH_MISSING')}
                  className={`px-2 py-1 rounded font-semibold transition-all cursor-pointer ${
                    bookStatusFilter === 'WITH_MISSING' ? 'bg-white text-amber-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  With Gaps
                </button>
                <button
                  type="button"
                  onClick={() => setBookStatusFilter('COMPLETE')}
                  className={`px-2 py-1 rounded font-semibold transition-all cursor-pointer ${
                    bookStatusFilter === 'COMPLETE' ? 'bg-white text-emerald-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Complete
                </button>
              </div>

              {/* Excel & PDF Exports */}
              <button
                type="button"
                onClick={() => {
                  const headers = ['#', 'Customer', 'Book #', 'Range', 'Capacity', 'Used', 'Missing', 'Completion', 'Status'];
                  const rows = filteredCustomerSummaries.flatMap((c) =>
                    c.books.map((b, idx) => [
                      idx + 1,
                      c.customerName,
                      `Book #${b.bookIndex}`,
                      b.shortRange,
                      b.totalCapacity,
                      b.usedCount,
                      b.missingCount,
                      `${b.completionPercentage}%`,
                      b.isIgnored ? 'Ignored' : b.isComplete ? 'Complete' : 'Gaps',
                    ])
                  );
                  exportTableToExcel('Customer_Invoice_Books_Report', headers, rows, 'Invoice_Books');
                }}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* MAIN CUSTOMER INVOICE BOOKS TABLE */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b-2 border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center font-mono w-10">#</th>
                  <th className="py-3 px-3 text-left">Customer Name</th>
                  <th className="py-3 px-3 text-center font-mono">Total Books</th>
                  <th className="py-3 px-3 text-right font-mono">Recorded Leaves</th>
                  <th className="py-3 px-3 text-right font-mono">Missing Leaves</th>
                  <th className="py-3 px-3 text-center">Status / Completion</th>
                  <th className="py-3 px-3 text-center">Books Option</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedCustomerSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold text-slate-800">No Customers Found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedCustomerSummaries.map((cust, cIdx) => {
                    const isExpanded = !!expandedCustomerRows[cust.customerName];

                    return (
                      <React.Fragment key={cust.customerName}>
                        <tr
                          className={`transition-colors hover:bg-blue-50/60 ${
                            isExpanded ? 'bg-indigo-50/40 font-semibold' : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-500 text-xs">
                            {(bookPage - 1) * bookPageSize + cIdx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-950 text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleCustomerRow(cust.customerName)}
                                className="p-1 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-indigo-700 font-bold" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-500 font-bold" />
                                )}
                              </button>
                              <span className="font-bold text-slate-900 text-sm">{cust.customerName}</span>
                              {cust.ignoredBooksCount > 0 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-medium">
                                  {cust.ignoredBooksCount} excluded
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-xs">
                            <span className="bg-slate-100 text-slate-800 font-black px-2.5 py-1 rounded-md border border-slate-300">
                              {cust.totalBooks} books
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-800 text-xs whitespace-nowrap">
                            {cust.totalInvoicesRecorded.toLocaleString()} units
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap">
                            {cust.totalMissingLeaflets === 0 ? (
                              <span className="text-emerald-700 font-black">0 (Complete)</span>
                            ) : (
                              <span className="text-amber-800 font-black">{cust.totalMissingLeaflets.toLocaleString()} missing</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap text-xs">
                            {cust.totalMissingLeaflets === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                100% Complete
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-700" />
                                {cust.overallCompletionRate}% Complete
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleCustomerRow(cust.customerName)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5 border shadow-2xs ${
                                isExpanded
                                  ? 'bg-indigo-700 text-white border-indigo-800'
                                  : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                  <span>Hide Books</span>
                                </>
                              ) : (
                                <>
                                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Books ({cust.books.length})</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Drilled Books Sub-table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/95 border-b-2 border-indigo-200">
                            <td colSpan={7} className="p-3 sm:p-4">
                              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                <div className="p-3 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-blue-700" />
                                    <span className="font-bold text-xs text-slate-900">
                                      Books in Numerical Order for {cust.customerName}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                      (50 leaflets per sequential book)
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    Total: <strong className="text-slate-800">{cust.books.length} books</strong> • Recorded:{' '}
                                    <strong className="text-emerald-700">{cust.totalInvoicesRecorded} leaves</strong>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-900 text-white text-[10px] uppercase font-black border-b border-slate-700">
                                      <tr>
                                        <th className="py-2.5 px-3 text-center font-mono w-16">Book #</th>
                                        <th className="py-2.5 px-3">Range Code</th>
                                        <th className="py-2.5 px-3 text-center font-mono">Range Index</th>
                                        <th className="py-2.5 px-3 text-right font-mono">Capacity</th>
                                        <th className="py-2.5 px-3 text-right font-mono">Recorded</th>
                                        <th className="py-2.5 px-3 text-right font-mono">Missing</th>
                                        <th className="py-2.5 px-3 text-center">Status</th>
                                        <th className="py-2.5 px-3 text-center">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cust.books.map((b) => (
                                        <tr
                                          key={b.id}
                                          className={`hover:bg-slate-50/80 transition-colors ${
                                            b.isIgnored
                                              ? 'bg-slate-100/60 opacity-75'
                                              : b.isComplete
                                              ? 'bg-emerald-50/20'
                                              : b.usedCount === 0
                                              ? 'bg-amber-50/20'
                                              : 'bg-white'
                                          }`}
                                        >
                                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                                            Book #{b.bookIndex}
                                          </td>
                                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                                            {b.formattedRange}
                                          </td>
                                          <td className="py-2.5 px-3 text-center font-mono text-slate-600 font-semibold">
                                            {b.shortRange}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                            {b.totalCapacity}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                                            {b.usedCount}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-xs">
                                            {b.isIgnored ? (
                                              <span className="text-slate-400 italic">Excluded</span>
                                            ) : b.missingCount === 0 ? (
                                              <span className="text-emerald-700 font-black">0</span>
                                            ) : (
                                              <span className="text-amber-800 font-black">{b.missingCount}</span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                            {b.isIgnored ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-700 border border-slate-300">
                                                Ignored / Excluded
                                              </span>
                                            ) : b.isComplete ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                                100% Used
                                              </span>
                                            ) : b.usedCount === 0 ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                                                Unused in Range
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-950 border border-blue-300">
                                                {b.usedCount}/50 Leaves
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                            <div className="flex items-center justify-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => setDrilledBook(b)}
                                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                                                title="View all 50 leaflets in this book"
                                              >
                                                <Eye className="w-3.5 h-3.5 text-blue-700" />
                                                <span>Drill Leaves</span>
                                              </button>

                                              {/* Admin Delete / Ignore Unused Book */}
                                              {isAdmin && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleIgnoreBook(b)}
                                                  className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                                                    b.isIgnored
                                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
                                                  }`}
                                                  title={
                                                    b.isIgnored
                                                      ? 'Restore book back to active sequence'
                                                      : 'Delete / Ignore book in range (e.g. unused book like Kilimanjaro B11)'
                                                  }
                                                >
                                                  {b.isIgnored ? (
                                                    <>
                                                      <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
                                                      <span>Restore</span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Ban className="w-3.5 h-3.5 text-rose-700" />
                                                      <span>Ignore Book</span>
                                                    </>
                                                  )}
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* OVERALL TOTAL FOOTER */}
              {filteredCustomerSummaries.length > 0 && (
                <tfoot className="bg-slate-900 text-white font-black text-xs border-t-4 border-double border-slate-700">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 font-bold uppercase tracking-wider text-right">
                      Overall Total ({filteredCustomerSummaries.length} Customers):
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black text-amber-300">
                      {globalBookKpis.totalBooks} books
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-300">
                      {globalBookKpis.totalInvoicesRecorded.toLocaleString()} units
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-amber-300">
                      {globalBookKpis.totalMissingLeaflets.toLocaleString()} missing
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-mono text-emerald-300 font-bold">
                        {globalBookKpis.overallCompletionRate}% Overall Rate
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-400 font-normal">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {filteredCustomerSummaries.length > 0 && (
            <TablePagination
              currentPage={bookPage}
              totalItems={filteredCustomerSummaries.length}
              pageSize={bookPageSize}
              onPageChange={setBookPage}
              onPageSizeChange={setBookPageSize}
              itemLabel="Customers"
            />
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: CUSTOMER LEDGER / STATEMENT (Dr then Cr, null figures hidden)
          ===================================================================== */}
      {activeReportTab === 'customer_statement' && (
        <div className="space-y-5">
          {/* Customer Selection & Period Overview */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Customer Selector */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">
                      Select Customer Statement
                    </label>
                    <select
                      value={statementCustomer}
                      onChange={(e) => setStatementCustomer(e.target.value)}
                      className="bg-slate-50 border-2 border-blue-400 text-slate-900 text-sm font-black rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[260px]"
                    >
                      {allCustomerNames.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-slate-500 pl-2 hidden sm:block">
                  Statement of Account for <strong className="text-slate-900">{statementCustomer}</strong>
                </div>
              </div>

              {/* Action Buttons: Formatted Excel, PDF & Print */}
              <div className="flex items-center gap-2 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={handleExportStatementExcel}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  title="Export Formatted Customer Statement to Excel"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>Formatted Statement Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportStatementPdf}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  title="Export Customer Statement to PDF"
                >
                  <Download className="w-4 h-4 text-rose-200" />
                  <span>Statement PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  title="Print Customer Statement"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* Lifetime Financial Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/80 rounded-xl border border-slate-200 p-4 gap-4 sm:gap-0">
              <div className="sm:px-4">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Invoiced (Cr)
                </span>
                <span className="text-xl font-black text-slate-950 font-mono block mt-1">
                  TZS {formatCurrency(customerLifetimeStats.totalInvoiced)}
                </span>
                <span className="text-[10px] text-slate-500">
                  Total value billed across valid invoices
                </span>
              </div>

              <div className="sm:px-4 pt-3 sm:pt-0">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                  Total Payments Received (Dr)
                </span>
                <span className="text-xl font-black text-emerald-700 font-mono block mt-1">
                  TZS {formatCurrency(customerLifetimeStats.totalPaid)}
                </span>
                <span className="text-[10px] text-slate-500">
                  Total cash &amp; voucher receipts allocated
                </span>
              </div>

              <div className="sm:px-4 pt-3 sm:pt-0">
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">
                  Net Outstanding Balance Due
                </span>
                <span
                  className={`text-xl font-black font-mono block mt-1 ${
                    customerLifetimeStats.netBalanceDue > 0
                      ? 'text-rose-700'
                      : customerLifetimeStats.netBalanceDue === 0
                      ? 'text-emerald-700'
                      : 'text-blue-700'
                  }`}
                >
                  TZS {formatCurrency(customerLifetimeStats.netBalanceDue)}
                </span>
                <span className="text-[10px] text-slate-500">
                  Current closing receivable position
                </span>
              </div>
            </div>

            {/* Statement Filter Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by invoice #, DN, PO, or voucher..."
                  value={statementSearchQuery}
                  onChange={(e) => setStatementSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end w-full md:w-auto">
                {/* Date Presets */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDatePresetChange('ALL')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      statementDateFilterMode === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Time
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePresetChange('THIS_MONTH')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      statementDateFilterMode === 'THIS_MONTH'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePresetChange('LAST_30')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      statementDateFilterMode === 'LAST_30'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatePresetChange('THIS_YEAR')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      statementDateFilterMode === 'THIS_YEAR'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    This Year
                  </button>
                </div>

                {/* Custom Date Pickers */}
                <div className="flex items-center gap-1 text-xs">
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => {
                      setStatementStartDate(e.target.value);
                      setStatementDateFilterMode('CUSTOM');
                    }}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2 py-1 font-mono font-medium"
                    title="From Date"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => {
                      setStatementEndDate(e.target.value);
                      setStatementDateFilterMode('CUSTOM');
                    }}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2 py-1 font-mono font-medium"
                    title="To Date"
                  />
                </div>
              </div>

              {/* View Mode Toggle (All Transactions vs Outstanding Invoices Only) */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-blue-50/90 p-1 rounded-xl border border-blue-200 text-xs shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setStatementViewMode('ALL')}
                    className={`px-3 py-1.5 rounded-lg font-black transition-all cursor-pointer ${
                      statementViewMode === 'ALL'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-blue-900 hover:bg-blue-100'
                    }`}
                  >
                    All Transactions ({ledgerRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementViewMode('OUTSTANDING')}
                    className={`px-3 py-1.5 rounded-lg font-black transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                      statementViewMode === 'OUTSTANDING'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Outstanding Invoices Only ({outstandingInvoicesForCustomer.length})</span>
                  </button>
                </div>

                {/* Transaction Type Filter (Only active in ALL transactions mode) */}
                {statementViewMode === 'ALL' && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs self-start md:self-auto">
                    <button
                      type="button"
                      onClick={() => setStatementTypeFilter('ALL')}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        statementTypeFilter === 'ALL'
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementTypeFilter('INVOICE')}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        statementTypeFilter === 'INVOICE'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Invoices (Cr)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementTypeFilter('PAYMENT')}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        statementTypeFilter === 'PAYMENT'
                          ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Payments (Dr)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: ALL TRANSACTIONS (Chronological Statement Ledger: Dr then Cr) */}
          {statementViewMode === 'ALL' && (
            <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b-2 border-slate-800">
                  <tr>
                    <th className="py-3 px-3 text-center font-mono w-24">DATE</th>
                    <th className="py-3 px-3 text-center w-28">Transaction type</th>
                    <th className="py-3 px-3 text-left">Invoice No. &amp; Delivery Note / PV No.</th>
                    <th className="py-3 px-3 text-left font-mono">PO NUMBER</th>
                    <th className="py-3 px-3 text-left">CONTRACT</th>
                    {/* START COLUMN Dr THEN Cr */}
                    <th className="py-3 px-3 text-right font-mono bg-slate-900 text-emerald-400">Dr (PAYMENT)</th>
                    <th className="py-3 px-3 text-right font-mono bg-slate-900 text-amber-300">Cr (INVOICE)</th>
                    <th className="py-3 px-3 text-right font-mono bg-slate-950 text-white">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* Opening Balance Row */}
                  <tr className="bg-slate-100/90 font-semibold text-slate-800 border-b border-slate-300">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500 text-xs">
                      {statementStartDate || 'Initial'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-700 border border-slate-300">
                        OPENING
                      </span>
                    </td>
                    <td colSpan={3} className="py-2.5 px-3 font-semibold text-slate-700 italic">
                      Opening Balance brought forward
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 text-xs bg-slate-100">
                      TZS {formatCurrency(openingBalance)}
                    </td>
                  </tr>

                  {ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-slate-500">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-bold text-slate-800">No Transactions Found for {statementCustomer}</p>
                        <p className="text-slate-400 mt-1">Try widening your date filter or clearing the search box.</p>
                      </td>
                    </tr>
                  ) : (
                    ledgerRows.map((row) => {
                      const isInvoice = row.transactionType === 'INVOICE';

                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-blue-50/50 transition-colors ${
                            isInvoice ? 'bg-white' : 'bg-emerald-50/20'
                          }`}
                        >
                          {/* 1. DATE */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
                            {row.date}
                          </td>

                          {/* 2. Transaction type */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isInvoice ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-300">
                                <Receipt className="w-3.5 h-3.5 text-blue-700" />
                                <span>Invoice</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Payment</span>
                              </span>
                            )}
                          </td>

                          {/* 3. Invoice No & Delivery Note / PV No */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-mono font-black text-xs px-2 py-0.5 rounded border ${
                                  isInvoice
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {row.documentNumber}
                              </span>

                              <span className="text-[11px] text-slate-600 font-medium">
                                {row.referenceInfo}
                              </span>
                            </div>

                            {row.notes && (
                              <div className="text-[10px] text-slate-400 mt-0.5 italic truncate max-w-sm">
                                {row.notes}
                              </div>
                            )}
                          </td>

                          {/* 4. PO NUMBER */}
                          <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-slate-800 text-xs">
                            {row.poNumber !== '—' ? (
                              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                                {row.poNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* 5. CONTRACT */}
                          <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-700">
                            {row.contract !== '—' ? (
                              <span className="bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                {row.contract}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* 6. Dr (PAYMENT) - STARTS BEFORE Cr */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-emerald-50/30">
                            {row.debitPayment > 0 ? (
                              <span className="text-emerald-800 font-black">
                                TZS {formatCurrency(row.debitPayment)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>

                          {/* 7. Cr (INVOICE) */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-amber-50/20">
                            {row.creditInvoice > 0 ? (
                              <span className="text-slate-950 font-black">
                                TZS {formatCurrency(row.creditInvoice)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>

                          {/* 8. Running Balance */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-slate-50">
                            <span
                              className={
                                row.runningBalance > 0
                                  ? 'text-rose-700 font-black'
                                  : row.runningBalance === 0
                                  ? 'text-emerald-700 font-black'
                                  : 'text-blue-700 font-black'
                              }
                            >
                              TZS {formatCurrency(row.runningBalance)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* CLOSING STATEMENT TOTALS FOOTER (Dr first, then Cr) */}
                <tfoot className="bg-slate-900 text-white font-black text-xs border-t-4 border-double border-slate-700">
                  <tr>
                    <td colSpan={5} className="py-3.5 px-3 font-bold uppercase tracking-wider text-right">
                      Period Total &amp; Closing Balance ({ledgerRows.length} Transactions):
                    </td>
                    {/* Dr Total First */}
                    <td className="py-3.5 px-3 text-right font-mono font-black text-emerald-300 bg-slate-900">
                      TZS {formatCurrency(totalPeriodDebits)}
                    </td>
                    {/* Cr Total Second */}
                    <td className="py-3.5 px-3 text-right font-mono font-black text-amber-300 bg-slate-900">
                      TZS {formatCurrency(totalPeriodCredits)}
                    </td>
                    {/* Closing Balance */}
                    <td className="py-3.5 px-3 text-right font-mono font-black text-white text-sm bg-slate-950">
                      TZS {formatCurrency(closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* VIEW MODE 2: OUTSTANDING INVOICES ONLY (User Request: "to see only outstanding: the transaction where there is no payment allocated to it") */}
          {statementViewMode === 'OUTSTANDING' && (
            <div className="space-y-3">
              {/* Outstanding Header Badge */}
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-700" />
                  <span className="font-bold text-xs text-amber-950">
                    Outstanding Invoices for {statementCustomer} (No Payment or Partial Payment Allocated)
                  </span>
                </div>
                <div className="text-xs font-mono font-black text-amber-900">
                  Total Outstanding Balance: TZS {formatCurrency(
                    outstandingInvoicesForCustomer.reduce((s, i) => s + i.outstandingBalance, 0)
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b-2 border-slate-800">
                    <tr>
                      <th className="py-3 px-3 text-center font-mono w-24">DATE</th>
                      <th className="py-3 px-3 text-center w-28">Status</th>
                      <th className="py-3 px-3 text-left">Invoice No. &amp; Delivery Note(s)</th>
                      <th className="py-3 px-3 text-left font-mono">PO NUMBER</th>
                      <th className="py-3 px-3 text-left">CONTRACT</th>
                      {/* START COLUMN Dr (ALLOCATED PAYMENT) THEN Cr (INVOICE AMOUNT) */}
                      <th className="py-3 px-3 text-right font-mono bg-slate-900 text-emerald-400">Dr (ALLOCATED PAYMENT)</th>
                      <th className="py-3 px-3 text-right font-mono bg-slate-900 text-amber-300">Cr (INVOICE AMOUNT)</th>
                      <th className="py-3 px-3 text-right font-mono bg-slate-950 text-rose-300 font-black">
                        Outstanding Balance Due
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {outstandingInvoicesForCustomer.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-xs text-slate-500">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                          <p className="font-bold text-slate-800">All Invoices Fully Settled!</p>
                          <p className="text-slate-400 mt-1">
                            There are currently no outstanding unallocated invoices for {statementCustomer}.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      outstandingInvoicesForCustomer.map((inv) => (
                        <tr key={inv.id} className="hover:bg-amber-50/40 transition-colors bg-white">
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
                            {inv.date}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {inv.allocationStatus === 'UNALLOCATED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300">
                                <span>Unallocated</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                <span>Partial Paid</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-xs px-2 py-0.5 rounded border bg-blue-50 text-blue-800 border-blue-200">
                                {inv.invoiceNumber}
                              </span>
                              <span className="text-[11px] text-slate-600 font-medium">
                                DN: {inv.deliveryNotes}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-slate-800 text-xs">
                            {inv.poNumber !== '—' ? (
                              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                                {inv.poNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-700">
                            {inv.contract !== '—' ? (
                              <span className="bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                                {inv.contract}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          {/* Dr (ALLOCATED PAYMENT) */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-emerald-50/30">
                            {inv.paidAmount > 0 ? (
                              <span className="text-emerald-800 font-black">
                                TZS {formatCurrency(inv.paidAmount)}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                          {/* Cr (INVOICE AMOUNT) */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-amber-50/20">
                            <span className="text-slate-950 font-black">
                              TZS {formatCurrency(inv.totalAmount)}
                            </span>
                          </td>
                          {/* OUTSTANDING BALANCE DUE */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-rose-50 text-rose-800">
                            TZS {formatCurrency(inv.outstandingBalance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {/* OUTSTANDING TOTALS FOOTER */}
                  <tfoot className="bg-slate-900 text-white font-black text-xs border-t-4 border-double border-slate-700">
                    <tr>
                      <td colSpan={5} className="py-3.5 px-3 font-bold uppercase tracking-wider text-right">
                        Outstanding Invoices Total ({outstandingInvoicesForCustomer.length} Invoices):
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-black text-emerald-300 bg-slate-900">
                        TZS {formatCurrency(outstandingInvoicesForCustomer.reduce((s, i) => s + i.paidAmount, 0))}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-black text-amber-300 bg-slate-900">
                        TZS {formatCurrency(outstandingInvoicesForCustomer.reduce((s, i) => s + i.totalAmount, 0))}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-black text-rose-300 text-sm bg-slate-950">
                        TZS {formatCurrency(outstandingInvoicesForCustomer.reduce((s, i) => s + i.outstandingBalance, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: TOTAL OUTSTANDING PER CUSTOMER & INVOICES DRILLDOWN
          ===================================================================== */}
      {activeReportTab === 'outstanding_summary' && (
        <div className="space-y-5">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Billed (All Customers)
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-950 font-mono block mt-1">
                TZS {formatCurrency(globalOutstandingKpis.overallInvoiced)}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Across {globalOutstandingKpis.totalInvoices} active invoices
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Total Payments Received
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-800 font-mono block mt-1">
                TZS {formatCurrency(globalOutstandingKpis.overallPaid)}
              </span>
              <span className="text-[10px] text-emerald-700 mt-1 block font-medium">
                Receipts allocated to accounts
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                Overall Outstanding Balance
              </span>
              <span className="text-xl sm:text-2xl font-black text-rose-800 font-mono block mt-1">
                TZS {formatCurrency(globalOutstandingKpis.overallOutstanding)}
              </span>
              <span className="text-[10px] text-rose-700 mt-1 block font-medium">
                Net active receivables due
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
                Customer Portfolio Health
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono block mt-1">
                {globalOutstandingKpis.customersWithBalance}{' '}
                <span className="text-xs font-normal text-slate-500">
                  Due / {globalOutstandingKpis.customersSettled} Settled
                </span>
              </span>
              <span className="text-[10px] text-blue-700 mt-1 block font-medium">
                {globalOutstandingKpis.totalCustomers} total customer accounts
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer, invoice #, PO #..."
                value={outstandingSearchQuery}
                onChange={(e) => {
                  setOutstandingSearchQuery(e.target.value);
                  setOutstandingPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setOutstandingStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    outstandingStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  All ({customerOutstandingSummaries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOutstandingStatusFilter('WITH_BALANCE')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    outstandingStatusFilter === 'WITH_BALANCE'
                      ? 'bg-white text-rose-700 shadow-2xs font-bold'
                      : 'text-slate-600'
                  }`}
                >
                  With Outstanding ({globalOutstandingKpis.customersWithBalance})
                </button>
                <button
                  type="button"
                  onClick={() => setOutstandingStatusFilter('SETTLED')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    outstandingStatusFilter === 'SETTLED'
                      ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                      : 'text-slate-600'
                  }`}
                >
                  Settled ({globalOutstandingKpis.customersSettled})
                </button>
              </div>

              {/* Excel Export */}
              <button
                type="button"
                onClick={handleExportOutstandingExcel}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                <span>Export Balances Excel</span>
              </button>
            </div>
          </div>

          {/* TOTAL OUTSTANDING PER CUSTOMER TABLE */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b-2 border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center font-mono w-10">#</th>
                  <th className="py-3 px-3 text-left">Customer Name</th>
                  <th className="py-3 px-3 text-right font-mono">Total Invoiced (TZS)</th>
                  <th className="py-3 px-3 text-right font-mono text-emerald-400">Total Paid (TZS)</th>
                  <th className="py-3 px-3 text-right font-mono text-amber-300">Total Outstanding (TZS)</th>
                  <th className="py-3 px-3 text-center font-mono">Invoices Count</th>
                  <th className="py-3 px-3 text-center">Payment Status</th>
                  <th className="py-3 px-3 text-center">Drill Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedOutstandingSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-slate-500">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold text-slate-800">No Customers Found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedOutstandingSummaries.map((cust, cIdx) => {
                    const isExpanded = !!expandedOutstandingCustomers[cust.customerName];

                    return (
                      <React.Fragment key={cust.customerName}>
                        <tr
                          className={`transition-colors hover:bg-blue-50/50 ${
                            isExpanded ? 'bg-indigo-50/40 font-semibold' : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-500 text-xs">
                            {(outstandingPage - 1) * outstandingPageSize + cIdx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-900 text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleOutstandingCustomerRow(cust.customerName)}
                                className="p-1 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-indigo-700 font-bold" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-500 font-bold" />
                                )}
                              </button>
                              <span className="font-bold text-slate-900 text-sm">{cust.customerName}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-xs whitespace-nowrap">
                            TZS {formatCurrency(cust.totalInvoiced)}
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-800 text-xs whitespace-nowrap">
                            TZS {formatCurrency(cust.totalPaid)}
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-rose-50/40">
                            <span
                              className={
                                cust.totalOutstanding > 0
                                  ? 'text-rose-700 font-black'
                                  : 'text-emerald-700 font-black'
                              }
                            >
                              TZS {formatCurrency(cust.totalOutstanding)}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-xs">
                            <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded border border-slate-200">
                              {cust.invoicesCount} ({cust.unpaidCount + cust.partialCount} unpaid)
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {cust.totalOutstanding <= 0.01 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                Fully Settled
                              </span>
                            ) : cust.totalPaid > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-950 border border-blue-300">
                                Partial Due
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-950 border border-rose-300">
                                <AlertTriangle className="w-3 h-3 text-rose-700" />
                                Outstanding
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleOutstandingCustomerRow(cust.customerName)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                                  isExpanded
                                    ? 'bg-indigo-700 text-white border-indigo-800'
                                    : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                                }`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    <span>Hide</span>
                                  </>
                                ) : (
                                  <>
                                    <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Invoices ({cust.invoicesCount})</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrilledCustomerModal(cust)}
                                className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                title="Open full invoices modal"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Drilled Invoices Sub-table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/95 border-b-2 border-indigo-200">
                            <td colSpan={8} className="p-3 sm:p-4">
                              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                <div className="p-3 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Receipt className="w-4 h-4 text-blue-700" />
                                    <span className="font-bold text-xs text-slate-900">
                                      All Invoices for {cust.customerName} ({cust.invoices.length})
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600">
                                    Net Due:{' '}
                                    <strong className="text-rose-700 font-mono">
                                      TZS {formatCurrency(cust.totalOutstanding)}
                                    </strong>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-900 text-white text-[10px] uppercase font-black">
                                      <tr>
                                        <th className="py-2.5 px-3">Invoice No.</th>
                                        <th className="py-2.5 px-3">Date</th>
                                        <th className="py-2.5 px-3 font-mono">PO Number</th>
                                        <th className="py-2.5 px-3">Contract</th>
                                        <th className="py-2.5 px-3 text-right font-mono">Invoice Amount</th>
                                        <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Paid</th>
                                        <th className="py-2.5 px-3 text-right font-mono text-amber-300">Balance Due</th>
                                        <th className="py-2.5 px-3 text-center">Status</th>
                                        <th className="py-2.5 px-3 text-center">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cust.invoices.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-slate-50">
                                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                                            {inv.invoiceNumber}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                            {inv.invoiceDate}
                                          </td>
                                          <td className="py-2.5 px-3 font-mono text-slate-800">
                                            {inv.poNumber}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-700">
                                            {inv.contract}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                                            TZS {formatCurrency(inv.totalAmount)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                                            TZS {formatCurrency(inv.paidAmount)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/20">
                                            TZS {formatCurrency(inv.balanceDue)}
                                          </td>
                                          <td className="py-2.5 px-3 text-center">
                                            {inv.paymentStatus === 'PAID' ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                                PAID
                                              </span>
                                            ) : inv.paymentStatus === 'PARTIAL' ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-950 border border-blue-300">
                                                PARTIAL
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-950 border border-rose-300">
                                                UNPAID
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-center">
                                            {onViewInvoicePrint && (
                                              <button
                                                type="button"
                                                onClick={() => onViewInvoicePrint(inv.rawInvoice)}
                                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                                              >
                                                <Printer className="w-3 h-3 text-slate-600" />
                                                <span>Print</span>
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* OVERALL TOTAL FOOTER */}
              {filteredOutstandingSummaries.length > 0 && (
                <tfoot className="bg-slate-900 text-white font-black text-xs border-t-4 border-double border-slate-700">
                  <tr>
                    <td colSpan={2} className="py-3.5 px-3 font-bold uppercase tracking-wider text-right">
                      Overall Total ({filteredOutstandingSummaries.length} Customers):
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-white">
                      TZS {formatCurrency(globalOutstandingKpis.overallInvoiced)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-emerald-300">
                      TZS {formatCurrency(globalOutstandingKpis.overallPaid)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-rose-300 bg-slate-950">
                      TZS {formatCurrency(globalOutstandingKpis.overallOutstanding)}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-amber-300">
                      {globalOutstandingKpis.totalInvoices} Invoices
                    </td>
                    <td colSpan={2} className="py-3.5 px-3 text-center text-slate-400 font-normal">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {filteredOutstandingSummaries.length > 0 && (
            <TablePagination
              currentPage={outstandingPage}
              totalItems={filteredOutstandingSummaries.length}
              pageSize={outstandingPageSize}
              onPageChange={setOutstandingPage}
              onPageSizeChange={setOutstandingPageSize}
              itemLabel="Customers"
            />
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: CUSTOMER AGING REPORT (6m, 1y, 2y, 3y, 4y+)
          ===================================================================== */}
      {activeReportTab === 'aging_report' && (
        <div className="space-y-5">
          {/* Aging Portfolio KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Total Portfolio */}
            <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 shadow-2xs col-span-2 md:col-span-4 lg:col-span-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Due
              </span>
              <span className="text-lg font-black text-amber-300 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.grandTotal)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">All Aging Buckets</span>
            </div>

            {/* 0 - 6 Months */}
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                0 – 6 Months
              </span>
              <span className="text-base font-black text-emerald-800 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.tot0_6m)}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">{globalAgingKpis.p0_6m}% of Total</span>
            </div>

            {/* 6 Months - 1 Year */}
            <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                6M – 1 Year
              </span>
              <span className="text-base font-black text-blue-800 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.tot6m_1y)}
              </span>
              <span className="text-[10px] text-blue-600 block mt-0.5">{globalAgingKpis.p6m_1y}% of Total</span>
            </div>

            {/* 1 - 2 Years */}
            <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                1 – 2 Years
              </span>
              <span className="text-base font-black text-amber-800 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.tot1y_2y)}
              </span>
              <span className="text-[10px] text-amber-600 block mt-0.5">{globalAgingKpis.p1y_2y}% of Total</span>
            </div>

            {/* 2 - 3 Years */}
            <div className="bg-white p-3.5 rounded-xl border border-orange-200 shadow-2xs">
              <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider block">
                2 – 3 Years
              </span>
              <span className="text-base font-black text-orange-800 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.tot2y_3y)}
              </span>
              <span className="text-[10px] text-orange-600 block mt-0.5">{globalAgingKpis.p2y_3y}% of Total</span>
            </div>

            {/* 3 - 4 Years */}
            <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                3 – 4 Years
              </span>
              <span className="text-base font-black text-rose-800 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.tot3y_4y)}
              </span>
              <span className="text-[10px] text-rose-600 block mt-0.5">{globalAgingKpis.p3y_4y}% of Total</span>
            </div>

            {/* 4 Years+ */}
            <div className="bg-white p-3.5 rounded-xl border border-rose-300 bg-rose-50/20 shadow-2xs">
              <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wider block">
                4 Years+
              </span>
              <span className="text-base font-black text-rose-900 font-mono block mt-1">
                TZS {formatCurrency(globalAgingKpis.totOver4y)}
              </span>
              <span className="text-[10px] text-rose-700 block mt-0.5 font-bold">{globalAgingKpis.pOver4y}% Arrears</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search aging customer, invoice #..."
                value={agingSearchQuery}
                onChange={(e) => {
                  setAgingSearchQuery(e.target.value);
                  setAgingPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setAgingFilterMode('ONLY_DUE')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    agingFilterMode === 'ONLY_DUE' ? 'bg-white text-rose-700 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Only Due ({customerAgingSummaries.filter((c) => c.totalOutstanding > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgingFilterMode('ALL')}
                  className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    agingFilterMode === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  All Accounts ({customerAgingSummaries.length})
                </button>
              </div>

              {/* Exports */}
              <button
                type="button"
                onClick={handleExportAgingExcel}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                <span>Aging Excel</span>
              </button>

              <button
                type="button"
                onClick={handleExportAgingPdf}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-rose-200" />
                <span>Aging PDF</span>
              </button>
            </div>
          </div>

          {/* MAIN CUSTOMER AGING TABLE (6m, 1y, 2y, 3y, 4y+) */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b-2 border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center font-mono w-10">#</th>
                  <th className="py-3 px-3 text-left">Customer Name</th>
                  <th className="py-3 px-3 text-right font-mono text-emerald-300">0 – 6 Mos</th>
                  <th className="py-3 px-3 text-right font-mono text-blue-300">6M – 1 Yr</th>
                  <th className="py-3 px-3 text-right font-mono text-amber-300">1 – 2 Yrs</th>
                  <th className="py-3 px-3 text-right font-mono text-orange-300">2 – 3 Yrs</th>
                  <th className="py-3 px-3 text-right font-mono text-rose-300">3 – 4 Yrs</th>
                  <th className="py-3 px-3 text-right font-mono text-rose-400">4 Yrs+</th>
                  <th className="py-3 px-3 text-right font-mono bg-slate-950 text-white">Total Outstanding</th>
                  <th className="py-3 px-3 text-center">Drill Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedAgingSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-xs text-slate-500">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold text-slate-800">No Aged Balances Found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedAgingSummaries.map((cust, cIdx) => {
                    const isExpanded = !!expandedAgingRows[cust.customerName];

                    return (
                      <React.Fragment key={cust.customerName}>
                        <tr
                          className={`transition-colors hover:bg-blue-50/50 ${
                            isExpanded ? 'bg-indigo-50/40 font-semibold' : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-500 text-xs">
                            {(agingPage - 1) * agingPageSize + cIdx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-900 text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleAgingCustomerRow(cust.customerName)}
                                className="p-1 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-indigo-700 font-bold" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-500 font-bold" />
                                )}
                              </button>
                              <span className="font-bold text-slate-900 text-sm">{cust.customerName}</span>
                            </div>
                          </td>

                          {/* 0 - 6 Months */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                            {cust.b0_6m > 0 ? (
                              <span className="text-emerald-800 font-bold">
                                TZS {formatCurrency(cust.b0_6m)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* 6M - 1 Year */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                            {cust.b6m_1y > 0 ? (
                              <span className="text-blue-800 font-bold">
                                TZS {formatCurrency(cust.b6m_1y)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* 1 - 2 Years */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                            {cust.b1y_2y > 0 ? (
                              <span className="text-amber-800 font-bold">
                                TZS {formatCurrency(cust.b1y_2y)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* 2 - 3 Years */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                            {cust.b2y_3y > 0 ? (
                              <span className="text-orange-800 font-bold">
                                TZS {formatCurrency(cust.b2y_3y)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* 3 - 4 Years */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">
                            {cust.b3y_4y > 0 ? (
                              <span className="text-rose-800 font-bold">
                                TZS {formatCurrency(cust.b3y_4y)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* 4 Years+ */}
                          <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap bg-rose-50/30">
                            {cust.bOver4y > 0 ? (
                              <span className="text-rose-950 font-black">
                                TZS {formatCurrency(cust.bOver4y)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Total Outstanding */}
                          <td className="py-3 px-3 text-right font-mono font-black text-xs whitespace-nowrap bg-slate-50">
                            <span
                              className={
                                cust.totalOutstanding > 0
                                  ? 'text-rose-700 font-black'
                                  : 'text-emerald-700 font-black'
                              }
                            >
                              TZS {formatCurrency(cust.totalOutstanding)}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleAgingCustomerRow(cust.customerName)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                                  isExpanded
                                    ? 'bg-indigo-700 text-white border-indigo-800'
                                    : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                                }`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                    <span>Hide</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Invoices ({cust.unpaidInvoicesCount})</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => setDrilledAgingCustomer(cust)}
                                className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                title="Open full aging modal"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Drilled Aged Invoices Sub-table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/95 border-b-2 border-indigo-200">
                            <td colSpan={10} className="p-3 sm:p-4">
                              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                                <div className="p-3 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-blue-700" />
                                    <span className="font-bold text-xs text-slate-900">
                                      Aged Outstanding Invoices for {cust.customerName} ({cust.agedInvoices.length})
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600">
                                    Total Aged Debt:{' '}
                                    <strong className="text-rose-700 font-mono">
                                      TZS {formatCurrency(cust.totalOutstanding)}
                                    </strong>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-900 text-white text-[10px] uppercase font-black">
                                      <tr>
                                        <th className="py-2.5 px-3">Invoice No.</th>
                                        <th className="py-2.5 px-3">Invoice Date</th>
                                        <th className="py-2.5 px-3 font-mono">Age (Days / Mo)</th>
                                        <th className="py-2.5 px-3">Aging Bucket</th>
                                        <th className="py-2.5 px-3 font-mono">PO Number</th>
                                        <th className="py-2.5 px-3 text-right font-mono">Total Billed</th>
                                        <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Paid</th>
                                        <th className="py-2.5 px-3 text-right font-mono text-rose-300">Outstanding Due</th>
                                        <th className="py-2.5 px-3 text-center">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cust.agedInvoices.map((inv) => (
                                        <tr key={inv.invoiceNumber} className="hover:bg-slate-50">
                                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                                            {inv.invoiceNumber}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                            {inv.invoiceDate}
                                          </td>
                                          <td className="py-2.5 px-3 font-mono text-slate-800 font-bold whitespace-nowrap">
                                            {inv.ageDays} days ({inv.ageMonths} mos)
                                          </td>
                                          <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span
                                              className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                                inv.bucketKey === '0_6m'
                                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                  : inv.bucketKey === '6m_1y'
                                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                                  : inv.bucketKey === '1y_2y'
                                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                                  : inv.bucketKey === '2y_3y'
                                                  ? 'bg-orange-50 text-orange-800 border-orange-300'
                                                  : inv.bucketKey === '3y_4y'
                                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                                  : 'bg-rose-100 text-rose-950 border-rose-400'
                                              }`}
                                            >
                                              {inv.bucketLabel}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 font-mono text-slate-700">
                                            {inv.poNumber}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                            TZS {formatCurrency(inv.totalAmount)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                                            TZS {formatCurrency(inv.paidAmount)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/30">
                                            TZS {formatCurrency(inv.balanceDue)}
                                          </td>
                                          <td className="py-2.5 px-3 text-center">
                                            {onViewInvoicePrint && (
                                              <button
                                                type="button"
                                                onClick={() => onViewInvoicePrint(inv.rawInvoice)}
                                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                                              >
                                                <Printer className="w-3 h-3 text-slate-600" />
                                                <span>Print</span>
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* OVERALL AGING TOTALS FOOTER */}
              {filteredAgingSummaries.length > 0 && (
                <tfoot className="bg-slate-900 text-white font-black text-xs border-t-4 border-double border-slate-700">
                  <tr>
                    <td colSpan={2} className="py-3.5 px-3 font-bold uppercase tracking-wider text-right">
                      Overall Aging Portfolio Total:
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-emerald-300">
                      TZS {formatCurrency(globalAgingKpis.tot0_6m)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-blue-300">
                      TZS {formatCurrency(globalAgingKpis.tot6m_1y)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-amber-300">
                      TZS {formatCurrency(globalAgingKpis.tot1y_2y)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-orange-300">
                      TZS {formatCurrency(globalAgingKpis.tot2y_3y)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-rose-300">
                      TZS {formatCurrency(globalAgingKpis.tot3y_4y)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-rose-400">
                      TZS {formatCurrency(globalAgingKpis.totOver4y)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-black text-amber-200 text-sm bg-slate-950">
                      TZS {formatCurrency(globalAgingKpis.grandTotal)}
                    </td>
                    <td className="py-3.5 px-3 text-center text-slate-400 font-normal">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {filteredAgingSummaries.length > 0 && (
            <TablePagination
              currentPage={agingPage}
              totalItems={filteredAgingSummaries.length}
              pageSize={agingPageSize}
              onPageChange={setAgingPage}
              onPageSizeChange={setAgingPageSize}
              itemLabel="Customers"
            />
          )}
        </div>
      )}

      {/* =====================================================================
          DRILLDOWN MODAL 1: 50 LEAFLETS IN BOOK
          ===================================================================== */}
      {drilledBook && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-700" />
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {drilledBook.customerName} • Book #{drilledBook.bookIndex} ({drilledBook.formattedRange})
                  </h3>
                  <p className="text-xs text-slate-500">
                    50-leaflet serial matrix ({drilledBook.shortRange}) • {drilledBook.usedCount} Recorded,{' '}
                    {drilledBook.missingCount} Missing
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrilledBook(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2">
                {drilledBook.leaflets.map((leaf) => (
                  <div
                    key={leaf.num}
                    className={`p-2 rounded-lg border text-center flex flex-col justify-between min-h-[64px] ${
                      leaf.isRecorded
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                        : drilledBook.isIgnored
                        ? 'bg-slate-100 border-slate-300 text-slate-500'
                        : 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 font-mono">#{leaf.num}</span>
                    <span className="font-mono text-xs font-black truncate" title={leaf.formattedNumber}>
                      {leaf.formattedNumber}
                    </span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase mt-1 ${
                        leaf.isRecorded
                          ? 'bg-emerald-200/80 text-emerald-900'
                          : drilledBook.isIgnored
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-rose-200/80 text-rose-900'
                      }`}
                    >
                      {leaf.isRecorded ? 'Issued' : drilledBook.isIgnored ? 'Ignored' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>

              {drilledBook.recordedInvoices.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <h4 className="font-bold text-xs text-slate-900 mb-2">
                    Recorded Invoices in this Book ({drilledBook.recordedInvoices.length}):
                  </h4>
                  <div className="overflow-x-auto max-h-48 border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                        <tr>
                          <th className="py-2 px-3">Invoice No.</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">PO Number</th>
                          <th className="py-2 px-3 text-right">Total TZS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drilledBook.recordedInvoices.map((inv) => (
                          <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-blue-700">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{inv.invoiceDate || '—'}</td>
                            <td className="py-2 px-3 font-mono text-slate-700">{inv.poNumber}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              TZS {formatCurrency(inv.totalAfterVat ?? inv.totalAmount ?? 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                Book #{drilledBook.bookIndex} • Range: {drilledBook.formattedRange}
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleIgnoreBook(drilledBook);
                      setDrilledBook(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      drilledBook.isIgnored
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    {drilledBook.isIgnored ? 'Restore Book to Range' : 'Ignore / Exclude Book from Range'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrilledBook(null)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DRILLDOWN MODAL 2: CUSTOMER OUTSTANDING INVOICES
          ===================================================================== */}
      {drilledCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-700" />
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {drilledCustomerModal.customerName} • Invoices &amp; Balances
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Invoiced: TZS {formatCurrency(drilledCustomerModal.totalInvoiced)} • Total Paid: TZS{' '}
                    {formatCurrency(drilledCustomerModal.totalPaid)} • Net Due: TZS{' '}
                    <strong className="text-rose-700 font-mono">
                      {formatCurrency(drilledCustomerModal.totalOutstanding)}
                    </strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrilledCustomerModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Invoice No.</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 font-mono">PO Number</th>
                    <th className="py-2.5 px-3">Contract</th>
                    <th className="py-2.5 px-3 text-right font-mono">Total Billed</th>
                    <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Paid</th>
                    <th className="py-2.5 px-3 text-right font-mono text-amber-300">Balance Due</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drilledCustomerModal.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.invoiceDate}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{inv.poNumber}</td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.contract}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        TZS {formatCurrency(inv.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        TZS {formatCurrency(inv.paidAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/20">
                        TZS {formatCurrency(inv.balanceDue)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                            inv.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                              : inv.paymentStatus === 'PARTIAL'
                              ? 'bg-blue-100 text-blue-950 border-blue-300'
                              : 'bg-rose-100 text-rose-950 border-rose-300'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {onViewInvoicePrint && (
                          <button
                            type="button"
                            onClick={() => onViewInvoicePrint(inv.rawInvoice)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3 text-slate-600" />
                            <span>Print</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                {drilledCustomerModal.invoices.length} Invoices on Record
              </div>
              <button
                type="button"
                onClick={() => setDrilledCustomerModal(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DRILLDOWN MODAL 3: CUSTOMER AGED INVOICES BREAKDOWN
          ===================================================================== */}
      {drilledAgingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-700" />
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {drilledAgingCustomer.customerName} • Aging Invoice Breakdown
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Aged Overdue: TZS{' '}
                    <strong className="text-rose-700 font-mono">
                      {formatCurrency(drilledAgingCustomer.totalOutstanding)}
                    </strong>{' '}
                    across {drilledAgingCustomer.unpaidInvoicesCount} invoices
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrilledAgingCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Invoice No.</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 font-mono">Age (Days)</th>
                    <th className="py-2.5 px-3">Aging Bracket</th>
                    <th className="py-2.5 px-3 font-mono">PO Number</th>
                    <th className="py-2.5 px-3 text-right font-mono">Invoice Total</th>
                    <th className="py-2.5 px-3 text-right font-mono text-emerald-400">Paid</th>
                    <th className="py-2.5 px-3 text-right font-mono text-amber-300">Balance Due</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drilledAgingCustomer.agedInvoices.map((inv) => (
                    <tr key={inv.invoiceNumber} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.invoiceDate}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-800 font-bold">
                        {inv.ageDays} days ({inv.ageMonths} mos)
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                            inv.bucketKey === '0_6m'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : inv.bucketKey === '6m_1y'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : inv.bucketKey === '1y_2y'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : inv.bucketKey === '2y_3y'
                              ? 'bg-orange-50 text-orange-800 border-orange-300'
                              : inv.bucketKey === '3y_4y'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-rose-100 text-rose-950 border-rose-400'
                          }`}
                        >
                          {inv.bucketLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{inv.poNumber}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        TZS {formatCurrency(inv.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        TZS {formatCurrency(inv.paidAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/20">
                        TZS {formatCurrency(inv.balanceDue)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {onViewInvoicePrint && (
                          <button
                            type="button"
                            onClick={() => onViewInvoicePrint(inv.rawInvoice)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3 text-slate-600" />
                            <span>Print</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                {drilledAgingCustomer.agedInvoices.length} Aged Overdue Invoices
              </div>
              <button
                type="button"
                onClick={() => setDrilledAgingCustomer(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: COLLECTIONS REPORT (MONTHLY BREAKDOWN & DATE RANGE REGISTRY)
          ===================================================================== */}
      {activeReportTab === 'collections_report' && (
        <div className="space-y-5">
          {/* Top KPI Cards for Collections */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Card 1: Net Cash Collected */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Net Cash Collected
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg sm:text-2xl font-black text-emerald-800 font-mono block mt-1.5">
                TZS {formatCurrency(globalCollectionsKpis.totalNet)}
              </span>
              <span className="text-[11px] text-emerald-700/80 font-medium mt-0.5 block">
                Actual bank &amp; cash inflow
              </span>
            </div>

            {/* Card 2: Gross Debt Settled */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Gross Debt Settled
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg sm:text-2xl font-black text-blue-900 font-mono block mt-1.5">
                TZS {formatCurrency(globalCollectionsKpis.totalGross)}
              </span>
              <span className="text-[11px] text-blue-600/80 font-medium mt-0.5 block">
                Invoices value cleared
              </span>
            </div>

            {/* Card 3: WHT Deducted */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Withholding Tax (WHT)
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg sm:text-2xl font-black text-indigo-900 font-mono block mt-1.5">
                TZS {formatCurrency(globalCollectionsKpis.totalWht)}
              </span>
              <span className="text-[11px] text-indigo-600/80 font-medium mt-0.5 block">
                Ex-VAT basis (0%, 2%, 5%)
              </span>
            </div>

            {/* Card 4: VAT Withheld */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  VAT Withholding
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg sm:text-2xl font-black text-purple-900 font-mono block mt-1.5">
                TZS {formatCurrency(globalCollectionsKpis.totalVatWht)}
              </span>
              <span className="text-[11px] text-purple-600/80 font-medium mt-0.5 block">
                TRA 2% of VAT component
              </span>
            </div>

            {/* Card 5: Vouchers & Customers */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Transactions Volume
                </span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg sm:text-2xl font-black text-slate-900 font-mono block mt-1.5">
                {globalCollectionsKpis.totalVouchers} <span className="text-xs font-normal text-slate-500">receipts</span>
              </span>
              <span className="text-[11px] text-slate-600 mt-0.5 block font-medium">
                {globalCollectionsKpis.totalInvoices} Invoices • {globalCollectionsKpis.distinctCustomers} Customers
              </span>
            </div>
          </div>

          {/* Filter & Toolbar Strip */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              {/* Left: View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold gap-1 self-start">
                <button
                  type="button"
                  onClick={() => {
                    setCollectionViewMode('monthly');
                    setDrilledCollectionMonth(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    collectionViewMode === 'monthly'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Monthly Collections Summary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionViewMode('detailed')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    collectionViewMode === 'detailed'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Detailed Collections Register</span>
                </button>
              </div>

              {/* Right: Export Toolbar */}
              <div className="flex items-center gap-2 self-end xl:self-auto">
                <button
                  type="button"
                  onClick={
                    collectionViewMode === 'monthly'
                      ? handleExportMonthlyCollectionsExcel
                      : handleExportDetailedCollectionsExcel
                  }
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  title="Export Collections Report to Microsoft Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCollectionsPdf}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  title="Export Collections Report to PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-rose-700" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* Filter Controls Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              {/* 1. Date Range Preset */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Collection Period
                </label>
                <select
                  value={collectionDatePreset}
                  onChange={(e) => setCollectionDatePreset(e.target.value as any)}
                  className="w-full text-xs font-semibold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                >
                  <option value="ALL">All Time (Lifetime Collections)</option>
                  <option value="THIS_MONTH">This Month</option>
                  <option value="LAST_30_DAYS">Last 30 Days</option>
                  <option value="LAST_MONTH">Previous Month</option>
                  <option value="THIS_QUARTER">This Quarter</option>
                  <option value="THIS_YEAR">This Calendar Year</option>
                  <option value="CUSTOM">Custom Date Range...</option>
                </select>
              </div>

              {/* 2. Custom Date Range Pickers (if CUSTOM) */}
              {collectionDatePreset === 'CUSTOM' ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">From</label>
                    <input
                      type="date"
                      value={collectionStartDate}
                      onChange={(e) => setCollectionStartDate(e.target.value)}
                      className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">To</label>
                    <input
                      type="date"
                      value={collectionEndDate}
                      onChange={(e) => setCollectionEndDate(e.target.value)}
                      className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                /* Customer Dropdown */
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Filter by Customer
                  </label>
                  <select
                    value={collectionCustomerFilter}
                    onChange={(e) => setCollectionCustomerFilter(e.target.value)}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    <option value="ALL">All Customers ({distinctCollectionCustomers.length})</option>
                    {distinctCollectionCustomers.map((cust) => (
                      <option key={cust} value={cust}>
                        {cust}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Customer Dropdown when CUSTOM date is open */}
              {collectionDatePreset === 'CUSTOM' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Filter by Customer
                  </label>
                  <select
                    value={collectionCustomerFilter}
                    onChange={(e) => setCollectionCustomerFilter(e.target.value)}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    <option value="ALL">All Customers ({distinctCollectionCustomers.length})</option>
                    {distinctCollectionCustomers.map((cust) => (
                      <option key={cust} value={cust}>
                        {cust}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search Query */}
              <div className={collectionDatePreset === 'CUSTOM' ? 'col-span-1' : 'col-span-2'}>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Search Filter
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={collectionSearchQuery}
                    onChange={(e) => setCollectionSearchQuery(e.target.value)}
                    placeholder="Search by voucher #, batch #, reference #, or invoice #..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  {collectionSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCollectionSearchQuery('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Drilled Month Active Pill */}
            {drilledCollectionMonth && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 font-semibold">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>
                    Viewing Detailed Register for month: <span className="font-mono font-bold">{drilledCollectionMonth}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrilledCollectionMonth(null)}
                  className="px-2 py-0.5 bg-white border border-blue-300 text-blue-800 rounded text-[11px] font-bold cursor-pointer hover:bg-blue-100"
                >
                  Clear Month Filter
                </button>
              </div>
            )}
          </div>

          {/* VIEW MODE 1: MONTHLY SUMMARY TABLE */}
          {collectionViewMode === 'monthly' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-700" />
                  <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Monthly Collections Aggregation Breakdown ({monthlyCollectionsSummaries.length} Months)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Gross settlement, WHT deductions, and net cash receipts
                </span>
              </div>

              {monthlyCollectionsSummaries.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-600">No collections found for the selected period</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try widening the date range or clearing filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0">
                      <tr>
                        <th className="py-3 px-3 w-10 text-center font-mono">#</th>
                        <th className="py-3 px-4 min-w-[170px]">Month &amp; Year</th>
                        <th className="py-3 px-4 text-right font-mono min-w-[140px] text-blue-300">
                          Gross Settled
                        </th>
                        <th className="py-3 px-4 text-right font-mono min-w-[130px] text-indigo-300">
                          WHT Deducted
                        </th>
                        <th className="py-3 px-4 text-right font-mono min-w-[130px] text-purple-300">
                          VAT WHT
                        </th>
                        <th className="py-3 px-4 text-right font-mono min-w-[150px] bg-slate-950 text-emerald-300 font-black">
                          Net Cash Collected
                        </th>
                        <th className="py-3 px-3 text-center font-mono w-24">Vouchers</th>
                        <th className="py-3 px-3 text-center font-mono w-28">Invoices Settled</th>
                        <th className="py-3 px-3 text-center font-mono w-24">Customers</th>
                        <th className="py-3 px-3 text-center min-w-[130px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {monthlyCollectionsSummaries.map((m, idx) => (
                        <tr key={m.monthKey} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3 text-center font-mono text-slate-400 font-bold text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">{m.monthLabel}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{m.monthKey}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                            TZS {formatCurrency(m.totalGrossSettled)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-indigo-800">
                            {m.totalWht > 0 ? `TZS ${formatCurrency(m.totalWht)}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-purple-800">
                            {m.totalVatWht > 0 ? `TZS ${formatCurrency(m.totalVatWht)}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-emerald-800 bg-emerald-50/40 text-xs sm:text-sm whitespace-nowrap">
                            TZS {formatCurrency(m.totalNetCollected)}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px]">
                              {m.vouchersCount}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-blue-800">
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[11px] border border-blue-200">
                              {m.invoicesSettledCount} inv
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                            {m.customersCount}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setDrilledCollectionMonth(m.monthKey);
                                setCollectionViewMode('detailed');
                              }}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="View detailed transaction register for this month"
                            >
                              <span>View Register</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Overall Summary Footer */}
                    <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-800">
                      <tr>
                        <td className="py-3 px-3 text-center font-mono text-slate-400">—</td>
                        <td className="py-3 px-4 font-bold uppercase tracking-wider text-slate-200">
                          OVERALL TOTAL ({monthlyCollectionsSummaries.length} Months)
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalGross)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalWht)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalVatWht)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-300 bg-slate-950 font-black text-sm">
                          TZS {formatCurrency(globalCollectionsKpis.totalNet)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-200">
                          {globalCollectionsKpis.totalVouchers}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-blue-200">
                          {globalCollectionsKpis.totalInvoices}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-200">
                          {globalCollectionsKpis.distinctCustomers}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-400">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 2: DETAILED COLLECTIONS REGISTER */}
          {collectionViewMode === 'detailed' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
              <div className="p-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                    Detailed Collections Register ({totalFilteredDetailedCount} Payments)
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Click on voucher row or chevron to view allocated invoice lines
                </div>
              </div>

              {paginatedCollectionPayments.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-600">No payment records found for current criteria</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try resetting search filters or changing date preset</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0">
                      <tr>
                        <th className="py-3 px-2 w-8 text-center font-mono">#</th>
                        <th className="py-3 px-3 min-w-[95px]">Date</th>
                        <th className="py-3 px-3 min-w-[130px]">Voucher / ID</th>
                        <th className="py-3 px-3 min-w-[130px]">Batch No</th>
                        <th className="py-3 px-3 min-w-[180px]">Customer</th>
                        <th className="py-3 px-3 min-w-[140px]">Reference / Slip</th>
                        <th className="py-3 px-3 min-w-[130px]">Method</th>
                        <th className="py-3 px-3 text-right font-mono min-w-[130px] text-blue-300">
                          Gross Settled
                        </th>
                        <th className="py-3 px-3 text-right font-mono min-w-[110px] text-indigo-300">
                          WHT
                        </th>
                        <th className="py-3 px-3 text-right font-mono min-w-[110px] text-purple-300">
                          VAT WHT
                        </th>
                        <th className="py-3 px-3 text-right font-mono min-w-[140px] bg-slate-950 text-emerald-300 font-black">
                          Net Collected
                        </th>
                        <th className="py-3 px-3 text-center min-w-[100px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {paginatedCollectionPayments.map((p, idx) => {
                        const isExpanded = !!expandedPaymentVouchers[p.id];
                        const rowNum = (collectionPage - 1) * collectionPageSize + idx + 1;

                        const pNet = p.amountPaid || 0;
                        let pGross = p.grossAmount || 0;
                        let pWht = p.totalWithholdingTax || 0;
                        let pVatWht = p.totalVatWithholding || 0;

                        if (p.allocations && p.allocations.length > 0) {
                          let allocGross = 0;
                          let allocWht = 0;
                          let allocVatWht = 0;
                          p.allocations.forEach((al) => {
                            allocGross += al.allocatedAmount || 0;
                            allocWht += al.withholdingTax || 0;
                            allocVatWht += al.vatWithholdingTax || 0;
                          });
                          if (pGross <= 0) pGross = allocGross;
                          if (pWht <= 0) pWht = allocWht;
                          if (pVatWht <= 0) pVatWht = allocVatWht;
                        }
                        if (pGross <= 0) pGross = pNet + pWht + pVatWht;

                        return (
                          <React.Fragment key={p.id}>
                            <tr
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isExpanded ? 'bg-blue-50/20' : ''
                              }`}
                            >
                              <td className="py-2.5 px-2 text-center font-mono text-slate-400 font-bold text-[11px]">
                                {rowNum}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-medium">
                                {p.paymentDate || (p.createdAt ? p.createdAt.slice(0, 10) : '—')}
                              </td>
                              <td className="py-2.5 px-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandVoucher(p.id)}
                                  className="font-mono font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                  <span>{p.paymentNumber || p.id}</span>
                                </button>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                                {p.batchNumber || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">
                                {p.customerName || 'General Customer'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-700 text-[11px]">
                                {p.referenceNumber || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                <div>{p.paymentMethod || 'Bank Transfer'}</div>
                                {p.depositAccount && (
                                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                    {p.depositAccount}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                TZS {formatCurrency(pGross)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-800">
                                {pWht > 0 ? `TZS ${formatCurrency(pWht)}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-800">
                                {pVatWht > 0 ? `TZS ${formatCurrency(pVatWht)}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/30 whitespace-nowrap">
                                TZS {formatCurrency(pNet)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptPayment(p)}
                                  className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  title="View and print official payment voucher receipt"
                                >
                                  <Printer className="w-3 h-3 text-slate-600" />
                                  <span>Receipt</span>
                                </button>
                              </td>
                            </tr>

                            {/* Nested Invoice Allocations Grid */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-blue-200">
                                <td colSpan={12} className="p-3 pl-8">
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                      <span>
                                        Invoices Settled Under Voucher {p.paymentNumber || p.id} ({p.allocations?.length || 1} lines)
                                      </span>
                                      {p.notes && (
                                        <span className="text-[11px] font-normal text-slate-500 italic">
                                          Note: {p.notes}
                                        </span>
                                      )}
                                    </div>

                                    {p.allocations && p.allocations.length > 0 ? (
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-200">
                                          <tr>
                                            <th className="py-1.5 px-2">Invoice #</th>
                                            <th className="py-1.5 px-2">PO Ref</th>
                                            <th className="py-1.5 px-2">Customer</th>
                                            <th className="py-1.5 px-2 text-right font-mono">Invoice Gross Due</th>
                                            <th className="py-1.5 px-2 text-right font-mono">Gross Settled</th>
                                            <th className="py-1.5 px-2 text-right font-mono text-indigo-700">WHT</th>
                                            <th className="py-1.5 px-2 text-right font-mono text-purple-700">VAT WHT</th>
                                            <th className="py-1.5 px-2 text-right font-mono text-emerald-700 font-black">Net Settled</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {p.allocations.map((al, aIdx) => (
                                            <tr key={`${al.invoiceNumber}-${aIdx}`} className="hover:bg-slate-50/60">
                                              <td className="py-1.5 px-2 font-mono font-bold text-blue-700">
                                                {al.invoiceNumber}
                                              </td>
                                              <td className="py-1.5 px-2 font-mono text-slate-600">
                                                {al.poNumber || '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-slate-800 font-medium">
                                                {al.customerName || p.customerName}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                                                TZS {formatCurrency(al.invoiceTotal || al.originalAmount || 0)}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-800">
                                                TZS {formatCurrency(al.allocatedAmount || 0)}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-bold text-indigo-700">
                                                {al.withholdingTax ? `TZS ${formatCurrency(al.withholdingTax)}` : '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-bold text-purple-700">
                                                {al.vatWithholdingTax ? `TZS ${formatCurrency(al.vatWithholdingTax)}` : '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-black text-emerald-800">
                                                TZS {formatCurrency(al.netAmount || al.allocatedAmount || 0)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <div className="text-xs text-slate-500 py-1">
                                        Single invoice settlement for invoice:{' '}
                                        <span className="font-mono font-bold text-blue-700">
                                          {p.invoiceNumber || '—'}
                                        </span>{' '}
                                        (PO: {p.poNumber || '—'})
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>

                    {/* Table Footer */}
                    <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-800">
                      <tr>
                        <td className="py-3 px-2 text-center font-mono text-slate-400">—</td>
                        <td colSpan={6} className="py-3 px-3 font-bold uppercase tracking-wider text-slate-200">
                          OVERALL PAGE &amp; FILTERED TOTALS
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-blue-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalGross)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-indigo-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalWht)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-purple-300">
                          TZS {formatCurrency(globalCollectionsKpis.totalVatWht)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-300 bg-slate-950 font-black text-sm">
                          TZS {formatCurrency(globalCollectionsKpis.totalNet)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-400">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Pagination Controls */}
              {totalFilteredDetailedCount > collectionPageSize && (
                <div className="p-3 border-t border-slate-200 bg-slate-50">
                  <TablePagination
                    currentPage={collectionPage}
                    totalItems={totalFilteredDetailedCount}
                    pageSize={collectionPageSize}
                    onPageChange={setCollectionPage}
                    onPageSizeChange={(newSize) => {
                      setCollectionPageSize(newSize);
                      setCollectionPage(1);
                    }}
                    pageSizeOptions={[10, 15, 25, 50, 100]}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Official Receipt Modal when clicked */}
      {viewingReceiptPayment && (
        <PaymentReceiptModal
          payment={viewingReceiptPayment}
          onClose={() => setViewingReceiptPayment(null)}
        />
      )}
    </div>
  );
};
