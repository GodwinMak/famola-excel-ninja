import React, { useState, useMemo, useEffect } from 'react';
import { InvoiceRecord, DeliveryNoteRecord } from '../types';
import { 
  BookOpen, 
  FileText, 
  Truck, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Copy, 
  Check, 
  Download, 
  Layers, 
  Building2, 
  Hash, 
  Calendar, 
  ExternalLink,
  Info,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { exportTableToExcel } from '../utils/tableExport';
import { formatCurrency } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { TablePagination } from './TablePagination';

interface CustomerBookSeriesAuditProps {
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  onNavigate?: (tab: any, subFilter?: string) => void;
}

export interface LeafletItem {
  num: number;
  formattedNumber: string;
  isRecorded: boolean;
  record?: InvoiceRecord | DeliveryNoteRecord;
}

export interface BookRangeGroup {
  start: number;
  end: number;
  count: number;
  formattedRange: string;
}

export interface CustomerBookInfo {
  id: string;
  bookIndex: number;
  category: 'INVOICE' | 'DELIVERY';
  customerName: string;
  prefix: string;
  digitsLen: number;
  rangeStart: number;
  rangeEnd: number;
  formattedRange: string;
  totalCapacity: number; // 50
  usedCount: number;
  missingCount: number;
  completionPercentage: number;
  isComplete: boolean;
  hasGaps: boolean;
  missingNumbers: number[];
  missingFormatted: string[];
  missingRanges: BookRangeGroup[];
  recordedItems: (InvoiceRecord | DeliveryNoteRecord)[];
  leaflets: LeafletItem[];
}

export interface CustomerSeriesSummary {
  customerName: string;
  totalInvoiceBooks: number;
  totalDeliveryBooks: number;
  totalBooks: number;
  totalInvoicesRecorded: number;
  totalDeliveriesRecorded: number;
  totalInvoiceMissing: number;
  totalDeliveryMissing: number;
  totalMissing: number;
  invoiceBooks: CustomerBookInfo[];
  deliveryBooks: CustomerBookInfo[];
  overallCompletionRate: number;
}

/**
 * Extracts prefix, numeric part, and digit length from an invoice or delivery note number.
 * e.g. "MRGR0666" -> { prefix: "MRGR", num: 666, digitsLen: 4 }
 */
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

/**
 * Groups consecutive missing integers into readable ranges like "MRGR0651 – MRGR0659 (9 missing)"
 */
function groupConsecutiveNumbers(numbers: number[], prefix: string, digitsLen: number): BookRangeGroup[] {
  if (!numbers || numbers.length === 0) return [];
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: BookRangeGroup[] = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      const count = prev - start + 1;
      const formattedRange =
        count === 1
          ? formatLeaf(prefix, start, digitsLen)
          : `${formatLeaf(prefix, start, digitsLen)} – ${formatLeaf(prefix, prev, digitsLen)}`;
      groups.push({ start, end: prev, count, formattedRange });
      start = cur;
      prev = cur;
    }
  }

  const count = prev - start + 1;
  const formattedRange =
    count === 1
      ? formatLeaf(prefix, start, digitsLen)
      : `${formatLeaf(prefix, start, digitsLen)} – ${formatLeaf(prefix, prev, digitsLen)}`;
  groups.push({ start, end: prev, count, formattedRange });

  return groups;
}

export const CustomerBookSeriesAudit: React.FC<CustomerBookSeriesAuditProps> = ({
  invoices,
  deliveryNotes,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'INVOICE' | 'DELIVERY'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WITH_MISSING' | 'COMPLETE'>('ALL');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [expandedBooks, setExpandedBooks] = useState<Record<string, boolean>>({});
  const [showMatrixBooks, setShowMatrixBooks] = useState<Record<string, boolean>>({});
  const [showAllMissingBooks, setShowAllMissingBooks] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersPageSize, setCustomersPageSize] = useState(10);

  // Parse and build the Customer 50-Leaf Book series data
  const seriesSummary = useMemo(() => {
    // 1. Gather all customers
    const customerSet = new Set<string>();
    invoices.forEach((inv) => {
      const c = (inv.customerName || 'General Customer').trim();
      if (c) customerSet.add(c);
    });
    deliveryNotes.forEach((dn) => {
      const c = (dn.customerName || 'General Customer').trim();
      if (c) customerSet.add(c);
    });

    const customers = Array.from(customerSet).sort(naturalCompare);

    // 2. Helper to process category records for a customer
    const buildCategoryBooks = (
      custName: string,
      records: (InvoiceRecord | DeliveryNoteRecord)[],
      category: 'INVOICE' | 'DELIVERY',
      numberKey: 'invoiceNumber' | 'deliveryNoteNumber'
    ): CustomerBookInfo[] => {
      const parsedRecords: {
        prefix: string;
        num: number;
        digitsLen: number;
        record: InvoiceRecord | DeliveryNoteRecord;
      }[] = [];

      records.forEach((rec) => {
        const numStr = (rec as any)[numberKey];
        const parsed = parseSeriesNumber(numStr);
        if (parsed) {
          parsedRecords.push({ ...parsed, record: rec });
        }
      });

      if (parsedRecords.length === 0) return [];

      // Determine customer's common prefix and digit length (fallback to most frequent)
      const prefixCounts: Record<string, number> = {};
      const lenCounts: Record<number, number> = {};
      parsedRecords.forEach((p) => {
        prefixCounts[p.prefix] = (prefixCounts[p.prefix] || 0) + 1;
        lenCounts[p.digitsLen] = (lenCounts[p.digitsLen] || 0) + 1;
      });

      const commonPrefix = Object.keys(prefixCounts).reduce((a, b) =>
        prefixCounts[a] > prefixCounts[b] ? a : b
      );
      const commonDigitsLen = Number(
        Object.keys(lenCounts).reduce((a, b) =>
          lenCounts[Number(a)] > lenCounts[Number(b)] ? a : b
        )
      ) || 3;

      const minNum = Math.min(...parsedRecords.map((p) => p.num));
      const maxNum = Math.max(...parsedRecords.map((p) => p.num));

      const startBookIdx = Math.floor((minNum - 1) / 50) + 1;
      const endBookIdx = Math.floor((maxNum - 1) / 50) + 1;

      const books: CustomerBookInfo[] = [];

      for (let b = startBookIdx; b <= endBookIdx; b++) {
        const rangeStart = (b - 1) * 50 + 1;
        const rangeEnd = b * 50;

        const inBookRecords = parsedRecords
          .filter((p) => p.num >= rangeStart && p.num <= rangeEnd)
          .sort((a, b) => a.num - b.num);

        // Only include books that either have records or are within the active sequence
        if (inBookRecords.length === 0 && (b < startBookIdx || b > endBookIdx)) {
          continue;
        }

        const recordedMap = new Map<number, InvoiceRecord | DeliveryNoteRecord>();
        inBookRecords.forEach((p) => {
          if (!recordedMap.has(p.num)) {
            recordedMap.set(p.num, p.record);
          }
        });

        const missingNumbers: number[] = [];
        const leaflets: LeafletItem[] = [];

        for (let n = rangeStart; n <= rangeEnd; n++) {
          const isRec = recordedMap.has(n);
          const leafCode = formatLeaf(commonPrefix, n, commonDigitsLen);
          leaflets.push({
            num: n,
            formattedNumber: leafCode,
            isRecorded: isRec,
            record: recordedMap.get(n),
          });
          if (!isRec) {
            missingNumbers.push(n);
          }
        }

        const missingFormatted = missingNumbers.map((n) =>
          formatLeaf(commonPrefix, n, commonDigitsLen)
        );
        const missingRanges = groupConsecutiveNumbers(
          missingNumbers,
          commonPrefix,
          commonDigitsLen
        );

        const usedCount = recordedMap.size;
        const missingCount = missingNumbers.length;
        const completionPercentage = Math.round((usedCount / 50) * 100);
        const isComplete = missingCount === 0;
        const hasGaps = usedCount > 0 && missingCount > 0;

        books.push({
          id: `${custName}-${category}-B${b}`,
          bookIndex: b,
          category,
          customerName: custName,
          prefix: commonPrefix,
          digitsLen: commonDigitsLen,
          rangeStart,
          rangeEnd,
          formattedRange: `${formatLeaf(commonPrefix, rangeStart, commonDigitsLen)} – ${formatLeaf(commonPrefix, rangeEnd, commonDigitsLen)}`,
          totalCapacity: 50,
          usedCount,
          missingCount,
          completionPercentage,
          isComplete,
          hasGaps,
          missingNumbers,
          missingFormatted,
          missingRanges,
          recordedItems: inBookRecords.map((p) => p.record),
          leaflets,
        });
      }

      return books;
    };

    const summaries: CustomerSeriesSummary[] = [];

    customers.forEach((custName) => {
      const custInvoices = invoices.filter(
        (inv) => (inv.customerName || 'General Customer').trim() === custName
      );
      const custDeliveries = deliveryNotes.filter(
        (dn) => (dn.customerName || 'General Customer').trim() === custName
      );

      const invoiceBooks = buildCategoryBooks(
        custName,
        custInvoices,
        'INVOICE',
        'invoiceNumber'
      );
      const deliveryBooks = buildCategoryBooks(
        custName,
        custDeliveries,
        'DELIVERY',
        'deliveryNoteNumber'
      );

      const totalInvoiceBooks = invoiceBooks.length;
      const totalDeliveryBooks = deliveryBooks.length;
      const totalBooks = totalInvoiceBooks + totalDeliveryBooks;

      const totalInvoicesRecorded = custInvoices.length;
      const totalDeliveriesRecorded = custDeliveries.length;

      const totalInvoiceMissing = invoiceBooks.reduce((sum, b) => sum + b.missingCount, 0);
      const totalDeliveryMissing = deliveryBooks.reduce((sum, b) => sum + b.missingCount, 0);
      const totalMissing = totalInvoiceMissing + totalDeliveryMissing;

      const totalCapacity = totalBooks * 50;
      const totalUsed = invoiceBooks.reduce((s, b) => s + b.usedCount, 0) +
        deliveryBooks.reduce((s, b) => s + b.usedCount, 0);
      const overallCompletionRate =
        totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

      if (totalBooks > 0) {
        summaries.push({
          customerName: custName,
          totalInvoiceBooks,
          totalDeliveryBooks,
          totalBooks,
          totalInvoicesRecorded,
          totalDeliveriesRecorded,
          totalInvoiceMissing,
          totalDeliveryMissing,
          totalMissing,
          invoiceBooks,
          deliveryBooks,
          overallCompletionRate,
        });
      }
    });

    return summaries;
  }, [invoices, deliveryNotes]);

  // Overall KPI aggregates
  const globalKpis = useMemo(() => {
    let totalInvoiceBooks = 0;
    let totalDeliveryBooks = 0;
    let totalCompleteBooks = 0;
    let totalBooksWithGaps = 0;
    let totalMissingNumbers = 0;

    seriesSummary.forEach((s) => {
      totalInvoiceBooks += s.totalInvoiceBooks;
      totalDeliveryBooks += s.totalDeliveryBooks;
      s.invoiceBooks.forEach((b) => {
        if (b.isComplete) totalCompleteBooks++;
        else totalBooksWithGaps++;
        totalMissingNumbers += b.missingCount;
      });
      s.deliveryBooks.forEach((b) => {
        if (b.isComplete) totalCompleteBooks++;
        else totalBooksWithGaps++;
        totalMissingNumbers += b.missingCount;
      });
    });

    const totalBooks = totalInvoiceBooks + totalDeliveryBooks;

    return {
      totalCustomers: seriesSummary.length,
      totalInvoiceBooks,
      totalDeliveryBooks,
      totalBooks,
      totalCompleteBooks,
      totalBooksWithGaps,
      totalMissingNumbers,
    };
  }, [seriesSummary]);

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return seriesSummary
      .filter((s) => {
        if (selectedCustomer !== 'ALL' && s.customerName !== selectedCustomer) {
          return false;
        }
        if (q) {
          const matchCust = s.customerName.toLowerCase().includes(q);
          const matchInv = s.invoiceBooks.some(
            (b) =>
              b.formattedRange.toLowerCase().includes(q) ||
              `book ${b.bookIndex}`.toLowerCase().includes(q) ||
              b.missingFormatted.some((m) => m.toLowerCase().includes(q)) ||
              b.recordedItems.some((r: any) =>
                (r.invoiceNumber || '').toLowerCase().includes(q)
              )
          );
          const matchDn = s.deliveryBooks.some(
            (b) =>
              b.formattedRange.toLowerCase().includes(q) ||
              `book ${b.bookIndex}`.toLowerCase().includes(q) ||
              b.missingFormatted.some((m) => m.toLowerCase().includes(q)) ||
              b.recordedItems.some((r: any) =>
                (r.deliveryNoteNumber || '').toLowerCase().includes(q)
              )
          );
          if (!matchCust && !matchInv && !matchDn) return false;
        }
        return true;
      })
      .map((s) => {
        // Filter books inside customer according to category and status
        let invBooks = s.invoiceBooks;
        let dnBooks = s.deliveryBooks;

        if (categoryFilter === 'INVOICE') dnBooks = [];
        if (categoryFilter === 'DELIVERY') invBooks = [];

        if (statusFilter === 'WITH_MISSING') {
          invBooks = invBooks.filter((b) => b.missingCount > 0);
          dnBooks = dnBooks.filter((b) => b.missingCount > 0);
        } else if (statusFilter === 'COMPLETE') {
          invBooks = invBooks.filter((b) => b.isComplete);
          dnBooks = dnBooks.filter((b) => b.isComplete);
        }

        return {
          ...s,
          invoiceBooks: invBooks,
          deliveryBooks: dnBooks,
        };
      })
      .filter((s) => s.invoiceBooks.length > 0 || s.deliveryBooks.length > 0);
  }, [seriesSummary, selectedCustomer, categoryFilter, statusFilter, searchQuery]);

  // Paginated slice for the customer list — this widget sits at the top of the
  // Dashboard, so rendering every customer's card unbounded pushed the actually-
  // paginated reconciliation table below it far down the page.
  const paginatedSummaries = useMemo(() => {
    const start = (customersPage - 1) * customersPageSize;
    return filteredSummaries.slice(start, start + customersPageSize);
  }, [filteredSummaries, customersPage, customersPageSize]);

  useEffect(() => {
    setCustomersPage(1);
  }, [selectedCustomer, categoryFilter, statusFilter, searchQuery]);

  // Toggle Customer expansion
  const toggleCustomer = (custName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [custName]: !prev[custName],
    }));
  };

  // Toggle Book expansion
  const toggleBook = (bookId: string) => {
    setExpandedBooks((prev) => ({
      ...prev,
      [bookId]: !prev[bookId],
    }));
  };

  // Expand/Collapse All
  const handleToggleExpandAll = () => {
    const allExpanded = Object.keys(expandedCustomers).length === filteredSummaries.length &&
      filteredSummaries.every((s) => expandedCustomers[s.customerName]);

    if (allExpanded) {
      setExpandedCustomers({});
      setExpandedBooks({});
    } else {
      const nextCust: Record<string, boolean> = {};
      const nextBooks: Record<string, boolean> = {};
      filteredSummaries.forEach((s) => {
        nextCust[s.customerName] = true;
        s.invoiceBooks.forEach((b) => (nextBooks[b.id] = true));
        s.deliveryBooks.forEach((b) => (nextBooks[b.id] = true));
      });
      setExpandedCustomers(nextCust);
      setExpandedBooks(nextBooks);
    }
  };

  // Copy missing numbers to clipboard
  const handleCopyMissing = (bookId: string, codes: string[]) => {
    if (codes.length === 0) return;
    const text = codes.join(', ');
    navigator.clipboard.writeText(text);
    setCopiedKey(bookId);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Export Audit to Excel
  const handleExportAuditExcel = () => {
    const headers = [
      'Customer Name',
      'Category',
      'Book Number',
      'Leaflet Range (1-50)',
      'Total Capacity',
      'Used Leaves (Recorded)',
      'Missing Leaves Count',
      'Completion %',
      'Status',
      'Missing Numbers from Range',
    ];

    const rows: (string | number)[][] = [];

    seriesSummary.forEach((s) => {
      s.invoiceBooks.forEach((b) => {
        rows.push([
          s.customerName,
          'Invoice',
          `Book ${b.bookIndex}`,
          b.formattedRange,
          50,
          b.usedCount,
          b.missingCount,
          `${b.completionPercentage}%`,
          b.isComplete ? 'Complete' : 'Has Missing Numbers',
          b.missingRanges.map((r) => r.formattedRange).join('; ') || 'None',
        ]);
      });
      s.deliveryBooks.forEach((b) => {
        rows.push([
          s.customerName,
          'Delivery Note',
          `Book ${b.bookIndex}`,
          b.formattedRange,
          50,
          b.usedCount,
          b.missingCount,
          `${b.completionPercentage}%`,
          b.isComplete ? 'Complete' : 'Has Missing Numbers',
          b.missingRanges.map((r) => r.formattedRange).join('; ') || 'None',
        ]);
      });
    });

    exportTableToExcel(
      'Customer 50-Leaflet Book Series & Missing Numbers Audit',
      headers,
      rows,
      'customer_books_audit_50_series'
    );
  };

  return (
    <div id="customer-book-series-audit" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* =========================================================================
          SECTION HEADER & TOP SUMMARY
          ========================================================================= */}
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 flex items-center justify-center shadow-inner">
                <BookOpen className="w-4 h-4 text-blue-300" />
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Customer Book Series (50-Leaflet Tracker) & Missing Number Audit
              </h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 hidden sm:inline-block">
                50 Leaflets/Book
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl">
              Track physical 50-leaflet books per customer (1–50, 51–100, 101–150...). Audit book counts per customer for Invoices and Deliveries, and immediately trace which leaflet numbers are missing from each active series.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleToggleExpandAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Expand / Collapse All</span>
            </button>
            <button
              onClick={handleExportAuditExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Download complete books and missing numbers audit to Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit (Excel)</span>
            </button>
          </div>
        </div>

        {/* Top 5 Metric Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-800">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-slate-400 block">Tracked Customers</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-white">{globalKpis.totalCustomers}</span>
              <span className="text-[10px] text-slate-400">with books</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-blue-300 flex items-center gap-1">
              <FileText className="w-3 h-3 text-blue-400" />
              Invoice Books
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-blue-200">{globalKpis.totalInvoiceBooks}</span>
              <span className="text-[10px] text-slate-400">books (50s)</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-purple-300 flex items-center gap-1">
              <Truck className="w-3 h-3 text-purple-400" />
              Delivery Books
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-purple-200">{globalKpis.totalDeliveryBooks}</span>
              <span className="text-[10px] text-slate-400">books (50s)</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              Missing Leaflets
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-rose-300">{globalKpis.totalMissingNumbers}</span>
              <span className="text-[10px] text-rose-200/80">unrecorded</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Complete Books
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-emerald-300">{globalKpis.totalCompleteBooks}</span>
              <span className="text-[10px] text-slate-400">of {globalKpis.totalBooks} (50/50)</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CONTROLS: SEARCH, CATEGORY, STATUS, & CUSTOMER FILTER
          ========================================================================= */}
      <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Bar */}
          <div className="relative min-w-[220px] sm:min-w-[280px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, book #, or number (e.g. 666)..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Customer Dropdown */}
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">All Customers ({seriesSummary.length})</option>
            {seriesSummary.map((s) => (
              <option key={s.customerName} value={s.customerName}>
                {s.customerName} ({s.totalBooks} books • {s.totalMissing} missing)
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Categories
            </button>
            <button
              onClick={() => setCategoryFilter('INVOICE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                categoryFilter === 'INVOICE'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3 h-3" />
              Invoices
            </button>
            <button
              onClick={() => setCategoryFilter('DELIVERY')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                categoryFilter === 'DELIVERY'
                  ? 'bg-purple-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3 h-3" />
              Deliveries
            </button>
          </div>

          {/* Status Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Books
            </button>
            <button
              onClick={() => setStatusFilter('WITH_MISSING')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'WITH_MISSING'
                  ? 'bg-rose-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              With Missing Leaves
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'COMPLETE'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Complete (50/50)
            </button>
          </div>
        </div>

        <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap self-end md:self-center">
          Showing {filteredSummaries.length} Customer{filteredSummaries.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* =========================================================================
          CUSTOMER GROUPS ACCORDION LIST
          ========================================================================= */}
      <div className="p-4 space-y-4">
        {filteredSummaries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-sm text-slate-600">No customer book series matched your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing the search query or changing the category filter.</p>
          </div>
        ) : (
          paginatedSummaries.map((cust) => {
            // Collapsed by default: with real production data this can be dozens of
            // customers x multiple 50-leaf books each, and force-expanding every one
            // of them on mount renders tens of thousands of DOM nodes up front and
            // freezes the page for many seconds. Matches isBookExpanded/isMatrixShown
            // below, which are already collapsed-by-default for the same reason.
            const isCustExpanded = !!expandedCustomers[cust.customerName];
            const allBooksInCust = [...cust.invoiceBooks, ...cust.deliveryBooks];

            return (
              <div
                key={cust.customerName}
                className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden transition-all"
              >
                {/* Customer Accordion Header */}
                <div
                  onClick={() => toggleCustomer(cust.customerName)}
                  className="p-4 bg-slate-50/70 hover:bg-slate-100/80 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                      aria-label="Toggle customer"
                    >
                      {isCustExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-slate-900 text-sm sm:text-base">
                          {cust.customerName}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          {allBooksInCust.length} Book{allBooksInCust.length === 1 ? '' : 's'} Total
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Pills on Customer Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Invoice Books Count */}
                    {cust.totalInvoiceBooks > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                        <span>
                          {cust.totalInvoiceBooks} Invoice Book{cust.totalInvoiceBooks === 1 ? '' : 's'}
                        </span>
                        <span className="text-blue-500/80 text-[10px]">
                          ({cust.totalInvoicesRecorded} leaves used)
                        </span>
                      </span>
                    )}

                    {/* Delivery Books Count */}
                    {cust.totalDeliveryBooks > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                        <Truck className="w-3.5 h-3.5 text-purple-500" />
                        <span>
                          {cust.totalDeliveryBooks} Delivery Book{cust.totalDeliveryBooks === 1 ? '' : 's'}
                        </span>
                        <span className="text-purple-500/80 text-[10px]">
                          ({cust.totalDeliveriesRecorded} leaves used)
                        </span>
                      </span>
                    )}

                    {/* Missing status badge */}
                    {cust.totalMissing > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                        <span>{cust.totalMissing} Missing Leaflet{cust.totalMissing === 1 ? '' : 's'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>All Active Books Complete (50/50)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer Books Body */}
                {isCustExpanded && (
                  <div className="p-4 space-y-4">
                    {/* INVOICE BOOKS SECTION */}
                    {cust.invoiceBooks.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            <span>Invoice Series Books ({cust.invoiceBooks.length} books • 50 leaves each)</span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {cust.totalInvoicesRecorded} leaves recorded • {cust.totalInvoiceMissing} missing
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {cust.invoiceBooks.map((book) => renderBookCard(book))}
                        </div>
                      </div>
                    )}

                    {/* DELIVERY BOOKS SECTION */}
                    {cust.deliveryBooks.length > 0 && (
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                            <Truck className="w-3.5 h-3.5 text-purple-600" />
                            <span>Delivery Note Series Books ({cust.deliveryBooks.length} books • 50 leaves each)</span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {cust.totalDeliveriesRecorded} leaves recorded • {cust.totalDeliveryMissing} missing
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {cust.deliveryBooks.map((book) => renderBookCard(book))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {filteredSummaries.length > 0 && (
        <TablePagination
          currentPage={customersPage}
          totalItems={filteredSummaries.length}
          pageSize={customersPageSize}
          onPageChange={setCustomersPage}
          onPageSizeChange={setCustomersPageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          itemLabel="Customers"
        />
      )}
    </div>
  );

  /**
   * Render Individual Book Card
   */
  function renderBookCard(book: CustomerBookInfo) {
    const isBookExpanded = expandedBooks[book.id];
    const isMatrixShown = showMatrixBooks[book.id];
    const isAllMissingShown = showAllMissingBooks[book.id];
    const isInvoice = book.category === 'INVOICE';

    return (
      <div
        key={book.id}
        className={`rounded-xl border transition-all ${
          book.isComplete
            ? 'border-emerald-200 bg-emerald-50/20'
            : book.missingCount > 0
            ? 'border-amber-200/90 bg-amber-50/20'
            : 'border-slate-200 bg-white'
        }`}
      >
        {/* Book Header Bar */}
        <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs ${
                isInvoice
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-purple-100 text-purple-800 border border-purple-200'
              }`}
            >
              B{book.bookIndex}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                  Book #{book.bookIndex}
                </span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                  {book.formattedRange}
                </span>
                <span className="text-[11px] text-slate-500">
                  (Leaves #{book.rangeStart} – #{book.rangeEnd})
                </span>
              </div>

              {/* Progress Mini Bar */}
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-28 sm:w-36 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      book.isComplete ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${book.completionPercentage}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-600">
                  {book.usedCount} of 50 leaves ({book.completionPercentage}%)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Pill */}
            {book.isComplete ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Book Complete (50/50)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>{book.missingCount} Missing from Range</span>
              </span>
            )}

            {/* Toggle 50-Leaf Grid View */}
            <button
              type="button"
              onClick={() =>
                setShowMatrixBooks((prev) => ({ ...prev, [book.id]: !prev[book.id] }))
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                isMatrixShown
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Show interactive 50-leaflet slot matrix"
            >
              <Hash className="w-3 h-3" />
              <span>50-Leaf Grid</span>
            </button>

            {/* Toggle Recorded Table View */}
            <button
              type="button"
              onClick={() => toggleBook(book.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>{isBookExpanded ? 'Hide Records' : `View Records (${book.usedCount})`}</span>
              {isBookExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* =========================================================================
            MISSING NUMBERS HIGHLIGHT BOX (CRITICAL USER REQUIREMENT)
            ========================================================================= */}
        {book.missingCount > 0 && (
          <div className="mx-3.5 mb-3 p-3 rounded-lg bg-rose-50/90 border border-rose-200 text-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-rose-900">
                    Missing {isInvoice ? 'Invoice' : 'Delivery'} Numbers from Range ({book.missingCount} missing leaves):
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyMissing(book.id, book.missingFormatted)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold transition-colors cursor-pointer"
                  title="Copy all missing numbers as comma-separated list"
                >
                  {copiedKey === book.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Missing List</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setShowAllMissingBooks((prev) => ({
                      ...prev,
                      [book.id]: !prev[book.id],
                    }))
                  }
                  className="text-[11px] text-rose-700 underline font-semibold hover:text-rose-900 cursor-pointer"
                >
                  {isAllMissingShown ? 'Show Grouped Ranges' : `View All ${book.missingCount} Codes`}
                </button>
              </div>
            </div>

            {/* Missing Ranges Pills */}
            {!isAllMissingShown ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {book.missingRanges.map((rg, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-rose-900 bg-white px-2 py-0.5 rounded border border-rose-200/80 shadow-2xs"
                  >
                    <span>{rg.formattedRange}</span>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-1 rounded">
                      ({rg.count})
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2.5 p-2 bg-white rounded border border-rose-200 max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {book.missingFormatted.map((code, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-[11px] font-semibold text-rose-800 bg-rose-50/80 px-1.5 py-0.5 rounded border border-rose-100"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            INTERACTIVE 50-LEAFLET GRID MATRIX
            ========================================================================= */}
        {isMatrixShown && (
          <div className="mx-3.5 mb-3 p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-indigo-600" />
                50-Leaflet Visual Matrix (Book #{book.bookIndex}: {book.formattedRange})
              </span>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                  Recorded ({book.usedCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-400 inline-block" />
                  Missing ({book.missingCount})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {book.leaflets.map((leaf) => (
                <div
                  key={leaf.num}
                  title={
                    leaf.isRecorded
                      ? `Recorded: ${leaf.formattedNumber}`
                      : `MISSING: ${leaf.formattedNumber}`
                  }
                  className={`p-1 text-center rounded border text-[10px] font-mono transition-all ${
                    leaf.isRecorded
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-800 border-rose-300 border-dashed font-semibold hover:bg-rose-100'
                  }`}
                >
                  <div className="text-[9px] opacity-70">#{leaf.num}</div>
                  <div className="truncate font-semibold">{leaf.formattedNumber}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            RECORDED ITEMS TABLE (EXPANDABLE)
            ========================================================================= */}
        {isBookExpanded && (
          <div className="mx-3.5 mb-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Recorded {isInvoice ? 'Invoices' : 'Delivery Notes'} in Book #{book.bookIndex}</span>
              <span className="text-[11px] font-normal text-slate-500">
                {book.recordedItems.length} records found
              </span>
            </div>

            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3"># Number</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">PO Number</th>
                    <th className="py-2 px-3 text-right">Value (TZS)</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    {onNavigate && <th className="py-2 px-3 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {book.recordedItems.map((rec: any, idx) => {
                    const numberVal = rec.invoiceNumber || rec.deliveryNoteNumber;
                    const dateVal = rec.invoiceDate || rec.deliveryDate;
                    const valueVal = rec.totalAfterVat || rec.totalDeliveredValue || 0;
                    const statusVal = rec.status || rec.comment || 'Okay';
                    const hasFlag = rec.hasIssue || rec.isCancelled || rec.isOfr;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-900">{numberVal}</td>
                        <td className="py-2 px-3 text-slate-600 font-sans">{dateVal || '—'}</td>
                        <td className="py-2 px-3 text-slate-700">{rec.poNumber || 'N/A'}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800">
                          {formatCurrency(valueVal)}
                        </td>
                        <td className="py-2 px-3 text-center font-sans">
                          {hasFlag ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              {rec.isCancelled ? 'Cancelled' : rec.isOfr ? 'OFR' : 'Flagged'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {statusVal}
                            </span>
                          )}
                        </td>
                        {onNavigate && (
                          <td className="py-2 px-3 text-center font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate(
                                  isInvoice ? 'invoices_db' : 'delivery_notes',
                                  numberVal
                                )
                              }
                              className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-0.5 cursor-pointer text-[11px]"
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }
};
