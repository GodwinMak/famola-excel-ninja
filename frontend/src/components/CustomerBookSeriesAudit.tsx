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
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
  X,
  Eye,
  Filter,
  SlidersHorizontal,
  FolderOpen
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
  shortRange: string; // e.g. "001–050"
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
  // Table View is DEFAULT mode per user requirement
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  // Table sub-view: Grouped by Customer (DEFAULT per requirement 4) vs Flat Books
  const [tableGroupingMode, setTableGroupingMode] = useState<'CUSTOMER' | 'FLAT_BOOKS'>('CUSTOMER');

  // Two tabs: Invoice Books vs Delivery Books per user requirement
  const [activeTab, setActiveTab] = useState<'INVOICE' | 'DELIVERY'>('INVOICE');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WITH_MISSING' | 'COMPLETE'>('ALL');
  
  // Inline expansion state for Customer rows in Table View
  const [expandedCustomerRows, setExpandedCustomerRows] = useState<Record<string, boolean>>({});

  // Inline expansion state for individual Book rows
  const [expandedBookRows, setExpandedBookRows] = useState<Record<string, boolean>>({});

  // Drilldown Modals (Customer Drilldown Modal is the DEFAULT modal option per requirement 4)
  const [drillDownModalCustomer, setDrillDownModalCustomer] = useState<CustomerSeriesSummary | null>(null);
  const [drillDownModalBook, setDrillDownModalBook] = useState<CustomerBookInfo | null>(null);
  
  // Cards view customer expansion state
  const [expandedCardCustomers, setExpandedCardCustomers] = useState<Record<string, boolean>>({});
  
  // Toggle states for visual matrix / expanded missing list
  const [showAllMissingBooks, setShowAllMissingBooks] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Pagination
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(15);
  const [flatTablePage, setFlatTablePage] = useState(1);
  const [flatTablePageSize, setFlatTablePageSize] = useState(25);
  const [cardsPage, setCardsPage] = useState(1);
  const [cardsPageSize, setCardsPageSize] = useState(10);

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

        const shortRange = `${String(rangeStart).padStart(3, '0')}–${String(rangeEnd).padStart(3, '0')}`;
        const formattedRange = `${formatLeaf(commonPrefix, rangeStart, commonDigitsLen)} – ${formatLeaf(commonPrefix, rangeEnd, commonDigitsLen)}`;

        books.push({
          id: `${custName}-${category}-B${b}`,
          bookIndex: b,
          category,
          customerName: custName,
          prefix: commonPrefix,
          digitsLen: commonDigitsLen,
          rangeStart,
          rangeEnd,
          formattedRange,
          shortRange,
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
    let totalInvoicesRecorded = 0;
    let totalDeliveriesRecorded = 0;
    let totalInvoiceMissing = 0;
    let totalDeliveryMissing = 0;
    let totalCompleteInvoiceBooks = 0;
    let totalCompleteDeliveryBooks = 0;

    seriesSummary.forEach((s) => {
      totalInvoiceBooks += s.totalInvoiceBooks;
      totalDeliveryBooks += s.totalDeliveryBooks;
      totalInvoicesRecorded += s.totalInvoicesRecorded;
      totalDeliveriesRecorded += s.totalDeliveriesRecorded;
      totalInvoiceMissing += s.totalInvoiceMissing;
      totalDeliveryMissing += s.totalDeliveryMissing;

      s.invoiceBooks.forEach((b) => {
        if (b.isComplete) totalCompleteInvoiceBooks++;
      });
      s.deliveryBooks.forEach((b) => {
        if (b.isComplete) totalCompleteDeliveryBooks++;
      });
    });

    return {
      totalCustomers: seriesSummary.length,
      totalInvoiceBooks,
      totalDeliveryBooks,
      totalInvoicesRecorded,
      totalDeliveriesRecorded,
      totalInvoiceMissing,
      totalDeliveryMissing,
      totalCompleteInvoiceBooks,
      totalCompleteDeliveryBooks,
    };
  }, [seriesSummary]);

  // Filtered customer list for the ACTIVE TAB (INVOICE or DELIVERY)
  const filteredCustomerSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return seriesSummary
      .map((s) => {
        const books = activeTab === 'INVOICE' ? s.invoiceBooks : s.deliveryBooks;
        const totalBooks = books.length;
        const totalRecorded = books.reduce((sum, b) => sum + b.usedCount, 0);
        const totalMissing = books.reduce((sum, b) => sum + b.missingCount, 0);
        const completeBooksCount = books.filter((b) => b.isComplete).length;
        const capacity = totalBooks * 50;
        const completionRate = capacity > 0 ? Math.round((totalRecorded / capacity) * 100) : 0;

        return {
          ...s,
          activeBooks: books,
          activeTotalBooks: totalBooks,
          activeTotalRecorded: totalRecorded,
          activeTotalMissing: totalMissing,
          activeCompleteBooks: completeBooksCount,
          activeCompletionRate: completionRate,
        };
      })
      .filter((s) => {
        // Only include customers with books in the active tab
        if (s.activeTotalBooks === 0) return false;

        // Customer dropdown filter
        if (selectedCustomer !== 'ALL' && s.customerName !== selectedCustomer) {
          return false;
        }

        // Status filter
        if (statusFilter === 'WITH_MISSING' && s.activeTotalMissing === 0) {
          return false;
        }
        if (statusFilter === 'COMPLETE' && s.activeTotalMissing > 0) {
          return false;
        }

        // Search query
        if (q) {
          const matchCust = s.customerName.toLowerCase().includes(q);
          const matchBooks = s.activeBooks.some(
            (b) =>
              b.formattedRange.toLowerCase().includes(q) ||
              b.shortRange.toLowerCase().includes(q) ||
              `book ${b.bookIndex}`.toLowerCase().includes(q) ||
              b.missingFormatted.some((m) => m.toLowerCase().includes(q)) ||
              b.recordedItems.some((r: any) =>
                ((r.invoiceNumber || r.deliveryNoteNumber || '') + ' ' + (r.poNumber || '')).toLowerCase().includes(q)
              )
          );
          if (!matchCust && !matchBooks) return false;
        }

        return true;
      })
      .sort((a, b) => naturalCompare(a.customerName, b.customerName));
  }, [seriesSummary, activeTab, selectedCustomer, statusFilter, searchQuery]);

  // Paginated customers for Customer Grouped Table
  const paginatedCustomers = useMemo(() => {
    const start = (customerPage - 1) * customerPageSize;
    return filteredCustomerSummaries.slice(start, start + customerPageSize);
  }, [filteredCustomerSummaries, customerPage, customerPageSize]);

  // Flattened active books for Flat Books Table mode
  const activeTabAllBooks = useMemo(() => {
    const list: CustomerBookInfo[] = [];
    filteredCustomerSummaries.forEach((s) => {
      s.activeBooks.forEach((b) => list.push(b));
    });
    return list.sort((a, b) => {
      const cmpCust = naturalCompare(a.customerName, b.customerName);
      if (cmpCust !== 0) return cmpCust;
      return a.bookIndex - b.bookIndex;
    });
  }, [filteredCustomerSummaries]);

  // Paginated flat books
  const paginatedFlatBooks = useMemo(() => {
    const start = (flatTablePage - 1) * flatTablePageSize;
    return activeTabAllBooks.slice(start, start + flatTablePageSize);
  }, [activeTabAllBooks, flatTablePage, flatTablePageSize]);

  // Paginated cards
  const paginatedCards = useMemo(() => {
    const start = (cardsPage - 1) * cardsPageSize;
    return filteredCustomerSummaries.slice(start, start + cardsPageSize);
  }, [filteredCustomerSummaries, cardsPage, cardsPageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCustomerPage(1);
    setFlatTablePage(1);
    setCardsPage(1);
  }, [selectedCustomer, activeTab, statusFilter, searchQuery]);

  // Toggles
  const toggleCustomerRow = (custName: string) => {
    setExpandedCustomerRows((prev) => ({
      ...prev,
      [custName]: !prev[custName],
    }));
  };

  const toggleBookRow = (bookId: string) => {
    setExpandedBookRows((prev) => ({
      ...prev,
      [bookId]: !prev[bookId],
    }));
  };

  const toggleCardCustomer = (custName: string) => {
    setExpandedCardCustomers((prev) => ({
      ...prev,
      [custName]: !prev[custName],
    }));
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
      'Total Books For Customer',
      'Book Order',
      'Book Sequence Range',
      'Series Code Range',
      'Total Capacity',
      'Leaves Recorded',
      'Missing Leaves Count',
      'Completion %',
      'Status',
      'Missing Numbers from Range',
    ];

    const rows: (string | number)[][] = [];

    seriesSummary.forEach((s) => {
      const books = activeTab === 'INVOICE' ? s.invoiceBooks : s.deliveryBooks;
      books.forEach((b) => {
        rows.push([
          s.customerName,
          activeTab === 'INVOICE' ? 'Invoice' : 'Delivery Note',
          books.length,
          `Book #${b.bookIndex}`,
          b.shortRange,
          b.formattedRange,
          50,
          b.usedCount,
          b.missingCount,
          `${b.completionPercentage}%`,
          b.isComplete ? 'Complete (50/50)' : 'Has Missing Numbers',
          b.missingRanges.map((r) => r.formattedRange).join('; ') || 'None',
        ]);
      });
    });

    exportTableToExcel(
      `${activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'}_Books_50_Leaflet_Audit`,
      headers,
      rows,
      `${activeTab.toLowerCase()}_books_series_audit`
    );
  };

  return (
    <div id="customer-book-series-audit" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* =========================================================================
          SECTION HEADER & TOP SUMMARY BANNER
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
                50 Leaflets / Book
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl">
              Physical 50-leaflet books grouped by Customer (e.g. ARUSHA | 001–050 | 49 Recorded | 1 Missing). View number of books per customer and drill down into recorded documents and missing leaves.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Table (DEFAULT) vs Cards */}
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/90 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Table Mode: Grouped by customer with number of books & drill-down (Default)"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table View (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Cards / Accordion Mode"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards View</span>
              </button>
            </div>

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

        {/* =========================================================================
            PRIMARY TWO TABS: INVOICE BOOKS VS DELIVERY BOOKS (CRITICAL USER REQUIREMENT)
            ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-800">
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700">
            {/* Tab 1: Invoice Books */}
            <button
              type="button"
              onClick={() => setActiveTab('INVOICE')}
              className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'INVOICE'
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <FileText className="w-4 h-4 text-blue-300" />
              <span>Invoice Books</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/80 text-blue-200 border border-blue-400/30">
                {globalKpis.totalInvoiceBooks} Books
              </span>
              {globalKpis.totalInvoiceMissing > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white">
                  {globalKpis.totalInvoiceMissing} missing
                </span>
              )}
            </button>

            {/* Tab 2: Delivery Books */}
            <button
              type="button"
              onClick={() => setActiveTab('DELIVERY')}
              className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'DELIVERY'
                  ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Truck className="w-4 h-4 text-purple-300" />
              <span>Delivery Books</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/80 text-purple-200 border border-purple-400/30">
                {globalKpis.totalDeliveryBooks} Books
              </span>
              {globalKpis.totalDeliveryMissing > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white">
                  {globalKpis.totalDeliveryMissing} missing
                </span>
              )}
            </button>
          </div>

          <span className="text-xs text-slate-400 hidden sm:inline-block">
            Showing physical 50-leaf series for <strong className="text-white">{activeTab === 'INVOICE' ? 'Invoices' : 'Delivery Notes'}</strong>
          </span>
        </div>

        {/* Dynamic Category Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-slate-400 block">Total {activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'} Books</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-white">
                {activeTab === 'INVOICE' ? globalKpis.totalInvoiceBooks : globalKpis.totalDeliveryBooks}
              </span>
              <span className="text-[10px] text-slate-400">books (50s)</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Recorded Leaves
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-emerald-300">
                {activeTab === 'INVOICE' ? globalKpis.totalInvoicesRecorded : globalKpis.totalDeliveriesRecorded}
              </span>
              <span className="text-[10px] text-slate-400">leaves used</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              Missing Leaves
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-rose-300">
                {activeTab === 'INVOICE' ? globalKpis.totalInvoiceMissing : globalKpis.totalDeliveryMissing}
              </span>
              <span className="text-[10px] text-rose-200/80">unrecorded in range</span>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[11px] font-medium text-blue-300 flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-blue-400" />
              Complete Books
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-blue-200">
                {activeTab === 'INVOICE' ? globalKpis.totalCompleteInvoiceBooks : globalKpis.totalCompleteDeliveryBooks}
              </span>
              <span className="text-[10px] text-slate-400">
                of {activeTab === 'INVOICE' ? globalKpis.totalInvoiceBooks : globalKpis.totalDeliveryBooks} (50/50)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CONTROLS: SEARCH, CUSTOMER DROPDOWN, STATUS FILTER & TABLE GROUPING
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
              placeholder="Search customer, book #, or range (e.g. ARUSHA, 001-050)..."
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
                {s.customerName} ({activeTab === 'INVOICE' ? s.totalInvoiceBooks : s.totalDeliveryBooks} {activeTab === 'INVOICE' ? 'Inv' : 'DN'} Books)
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('WITH_MISSING')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'WITH_MISSING'
                  ? 'bg-rose-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              With Missing
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'COMPLETE'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Complete
            </button>
          </div>
        </div>

        {/* View Mode Sub-Toggle for Table View: Grouped by Customer (Default) vs Flat List */}
        {viewMode === 'table' && (
          <div className="flex items-center gap-2 self-start md:self-center">
            <span className="text-[11px] font-semibold text-slate-500 hidden lg:inline-block">Table Mode:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => setTableGroupingMode('CUSTOMER')}
                className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  tableGroupingMode === 'CUSTOMER'
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Group table by Customer with number of books & drill-down (Default)"
              >
                <Building2 className="w-3 h-3" />
                <span>Group by Customer (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => setTableGroupingMode('FLAT_BOOKS')}
                className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  tableGroupingMode === 'FLAT_BOOKS'
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Display all books in a single flat sequence table"
              >
                <Layers className="w-3 h-3" />
                <span>All Books (Flat)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          TABLE VIEW: DEFAULT MODE
          Requirement 4: On the same table group by customer and show number of books for each customer.
          Then the drill option will open books for selected customer with other details (default modal)
          ========================================================================= */}
      {viewMode === 'table' && tableGroupingMode === 'CUSTOMER' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-600">
            <span className="font-semibold flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Customers Table: Showing <strong>{filteredCustomerSummaries.length}</strong> Customers with {activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'} Books</span>
            </span>
            <span className="text-[11px] text-slate-500">
              Click <strong>Drill Books (Modal)</strong> or expand row inline to view books (e.g. ARUSHA | 001–050 | 49 Recorded | 1 Missing)
            </span>
          </div>

          {filteredCustomerSummaries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-600">No customers found matching your filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try resetting the customer or status filter to see all records.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 shadow-xs">
                      <tr>
                        <th className="py-3 px-3.5 w-12 text-center">#</th>
                        <th className="py-3 px-3.5">Customer Name</th>
                        <th className="py-3 px-3.5 text-center">Number of Books</th>
                        <th className="py-3 px-3.5 text-right font-mono text-emerald-300">Leaves Recorded</th>
                        <th className="py-3 px-3.5 text-right font-mono text-rose-300">Missing Leaves</th>
                        <th className="py-3 px-3.5">Completion Rate</th>
                        <th className="py-3 px-3.5 text-center">Audit Status</th>
                        <th className="py-3 px-3.5 text-center w-56">Drill / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedCustomers.map((cust, idx) => {
                        const globalIdx = (customerPage - 1) * customerPageSize + idx + 1;
                        const isExpanded = !!expandedCustomerRows[cust.customerName];
                        const books = cust.activeBooks;
                        const hasMissing = cust.activeTotalMissing > 0;

                        return (
                          <React.Fragment key={cust.customerName}>
                            <tr
                              className={`transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-indigo-50/60'
                                  : hasMissing
                                  ? 'hover:bg-amber-50/40'
                                  : 'hover:bg-slate-50'
                              }`}
                              onClick={() => toggleCustomerRow(cust.customerName)}
                            >
                              {/* Serial # */}
                              <td className="py-3 px-3.5 text-center font-mono text-slate-400 text-[11px]">
                                {globalIdx}
                              </td>

                              {/* Customer Name */}
                              <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                                    <Building2 className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-xs sm:text-sm font-bold text-slate-900">{cust.customerName}</span>
                                </div>
                              </td>

                              {/* Number of Books */}
                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold border ${
                                  activeTab === 'INVOICE'
                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                    : 'bg-purple-50 text-purple-800 border-purple-200'
                                }`}>
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>{cust.activeTotalBooks} Book{cust.activeTotalBooks === 1 ? '' : 's'}</span>
                                  <span className="text-[10px] opacity-75 font-mono">({cust.activeTotalBooks * 50} leaves)</span>
                                </span>
                              </td>

                              {/* Leaves RECORDED */}
                              <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs">
                                  {cust.activeTotalRecorded}
                                </span>
                              </td>

                              {/* Missing Leaves */}
                              <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                                {hasMissing ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-extrabold text-xs">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    <span>{cust.activeTotalMissing}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>0 Missing</span>
                                  </span>
                                )}
                              </td>

                              {/* Completion Rate */}
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        cust.activeTotalMissing === 0 ? 'bg-emerald-500' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${cust.activeCompletionRate}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-bold text-[11px] text-slate-700">
                                    {cust.activeCompletionRate}%
                                  </span>
                                </div>
                              </td>

                              {/* Audit Status */}
                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                {hasMissing ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    <span>Gaps Detected</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>All Complete (50/50)</span>
                                  </span>
                                )}
                              </td>

                              {/* Drill / Action: Default Modal button & Inline Expand */}
                              <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {/* DEFAULT MODAL DRILL BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => setDrillDownModalCustomer(cust)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                                    title={`Open drill-down modal for ${cust.customerName} books`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Drill Books (Modal)</span>
                                  </button>

                                  {/* INLINE EXPAND BUTTON */}
                                  <button
                                    type="button"
                                    onClick={() => toggleCustomerRow(cust.customerName)}
                                    className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                                    title={isExpanded ? 'Collapse books table' : 'Expand books table inline'}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-indigo-600" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-slate-500" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* INLINE DRILL-DOWN SUBTABLE FOR CUSTOMER'S BOOKS */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b-2 border-indigo-200">
                                <td colSpan={8} className="p-4">
                                  <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-xs">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
                                      <div className="flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-indigo-600" />
                                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                          {cust.customerName} — {activeTab === 'INVOICE' ? 'Invoice' : 'Delivery Note'} Books Series
                                        </h4>
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          {books.length} Books
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setDrillDownModalCustomer(cust)}
                                          className="text-xs text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>Open in Fullscreen Modal</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Subtable: Customer | Book Order | Leaflet Range | Leaves Recorded | Missing Leaves | Actions */}
                                    {renderCustomerBooksTable(cust.customerName, books)}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Customer Table Pagination */}
              <TablePagination
                currentPage={customerPage}
                totalItems={filteredCustomerSummaries.length}
                pageSize={customerPageSize}
                onPageChange={setCustomerPage}
                onPageSizeChange={setCustomerPageSize}
                pageSizeOptions={[10, 15, 25, 50]}
                itemLabel="Customers"
              />
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          FLAT BOOKS TABLE VIEW (ALTERNATIVE SUB-MODE)
          Displays all books directly
          ========================================================================= */}
      {viewMode === 'table' && tableGroupingMode === 'FLAT_BOOKS' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-600">
            <span className="font-semibold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>All Books Flat Sequence: Showing <strong>{activeTabAllBooks.length}</strong> {activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'} Books</span>
            </span>
          </div>

          {activeTabAllBooks.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-600">No books found matching your filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10 shadow-xs">
                      <tr>
                        <th className="py-3 px-3.5 w-12 text-center">#</th>
                        <th className="py-3 px-3.5">Customer Name</th>
                        <th className="py-3 px-3.5">Book Order</th>
                        <th className="py-3 px-3.5 font-mono">Leaflet Range (1-50)</th>
                        <th className="py-3 px-3.5 text-right font-mono text-emerald-300">Leaves Recorded</th>
                        <th className="py-3 px-3.5 text-right font-mono text-rose-300">Missing Leaves</th>
                        <th className="py-3 px-3.5">Completion %</th>
                        <th className="py-3 px-3.5 text-center w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedFlatBooks.map((book, idx) => {
                        const globalIdx = (flatTablePage - 1) * flatTablePageSize + idx + 1;
                        const isExpanded = !!expandedBookRows[book.id];
                        const isInvoice = book.category === 'INVOICE';

                        return (
                          <React.Fragment key={book.id}>
                            <tr
                              className={`transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-50/50'
                                  : book.isComplete
                                  ? 'hover:bg-slate-50'
                                  : 'bg-amber-50/15 hover:bg-amber-50/40'
                              }`}
                              onClick={() => toggleBookRow(book.id)}
                            >
                              <td className="py-2.5 px-3.5 text-center font-mono text-slate-400 text-[11px]">
                                {globalIdx}
                              </td>
                              <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span>{book.customerName}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                                  isInvoice ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                  Book #{book.bookIndex}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="font-mono font-bold text-slate-900 text-xs">
                                  {book.shortRange}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {book.formattedRange}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {book.usedCount}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                                {book.missingCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-extrabold">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    <span>{book.missingCount}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>0</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 sm:w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        book.isComplete ? 'bg-emerald-500' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${book.completionPercentage}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-semibold text-[11px] text-slate-700">
                                    {book.completionPercentage}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleBookRow(book.id);
                                    }}
                                    className="px-2 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                                  >
                                    <span>Drill</span>
                                    {isExpanded ? (
                                      <ChevronDown className="w-3 h-3" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDrillDownModalBook(book);
                                    }}
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200"
                                    title="Open book drilldown modal"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b-2 border-indigo-200">
                                <td colSpan={9} className="p-4">
                                  {renderBookDrillDownDetails(book)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <TablePagination
                currentPage={flatTablePage}
                totalItems={activeTabAllBooks.length}
                pageSize={flatTablePageSize}
                onPageChange={setFlatTablePage}
                onPageSizeChange={setFlatTablePageSize}
                pageSizeOptions={[10, 25, 50, 100]}
                itemLabel={`${activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'} Books`}
              />
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          CARDS VIEW (ALTERNATIVE VIEW MODE)
          ========================================================================= */}
      {viewMode === 'cards' && (
        <div className="p-4 space-y-4">
          {filteredCustomerSummaries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-600">No customer book series matched your filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing the search query or changing the filter.</p>
            </div>
          ) : (
            paginatedCards.map((cust) => {
              const isCustExpanded = !!expandedCardCustomers[cust.customerName];
              const books = cust.activeBooks;

              return (
                <div
                  key={cust.customerName}
                  className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden transition-all"
                >
                  {/* Customer Accordion Header */}
                  <div
                    onClick={() => toggleCardCustomer(cust.customerName)}
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
                            {books.length} {activeTab === 'INVOICE' ? 'Invoice' : 'Delivery'} Book{books.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Summary Badges on Customer Card */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                        {activeTab === 'INVOICE' ? <FileText className="w-3.5 h-3.5 text-blue-500" /> : <Truck className="w-3.5 h-3.5 text-purple-500" />}
                        <span>
                          {cust.activeTotalRecorded} leaves recorded
                        </span>
                      </span>

                      {cust.activeTotalMissing > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          <span>{cust.activeTotalMissing} Missing</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>All Complete</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrillDownModalCustomer(cust);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1 transition-colors shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Drill Modal</span>
                      </button>
                    </div>
                  </div>

                  {/* Customer Books Body */}
                  {isCustExpanded && (
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3">
                        {books.map((book) => renderBookCard(book))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {filteredCustomerSummaries.length > 0 && (
            <TablePagination
              currentPage={cardsPage}
              totalItems={filteredCustomerSummaries.length}
              pageSize={cardsPageSize}
              onPageChange={setCardsPage}
              onPageSizeChange={setCardsPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              itemLabel="Customers"
            />
          )}
        </div>
      )}

      {/* =========================================================================
          CUSTOMER DRILL-DOWN MODAL (CRITICAL REQUIREMENT 4: "default modal")
          Opens for the selected customer, displaying all books for that customer,
          leaves recorded and missing, with full book drill-down options.
          ========================================================================= */}
      {drillDownModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center font-bold text-sm shadow-inner">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {drillDownModalCustomer.customerName}
                    </h3>
                    <span className="text-slate-400 font-normal">•</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      activeTab === 'INVOICE'
                        ? 'bg-blue-500/20 text-blue-200 border-blue-400/30'
                        : 'bg-purple-500/20 text-purple-200 border-purple-400/30'
                    }`}>
                      {activeTab === 'INVOICE' ? 'Invoice Books' : 'Delivery Note Books'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {drillDownModalCustomer.activeTotalBooks || (activeTab === 'INVOICE' ? drillDownModalCustomer.totalInvoiceBooks : drillDownModalCustomer.totalDeliveryBooks)} Books
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Physical 50-leaflet books audit for {drillDownModalCustomer.customerName}. Grouped by book order with leaves recorded and missing leaves.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrillDownModalCustomer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal KPI Header Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-medium text-slate-500 block">Total Books</span>
                <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">
                  {activeTab === 'INVOICE' ? drillDownModalCustomer.totalInvoiceBooks : drillDownModalCustomer.totalDeliveryBooks} Books
                </span>
                <span className="text-[10px] text-slate-400">
                  {((activeTab === 'INVOICE' ? drillDownModalCustomer.totalInvoiceBooks : drillDownModalCustomer.totalDeliveryBooks) * 50)} Leaflets
                </span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-medium text-emerald-600 block">Leaves Recorded</span>
                <span className="text-lg font-extrabold text-emerald-700 mt-0.5 block">
                  {activeTab === 'INVOICE' ? drillDownModalCustomer.totalInvoicesRecorded : drillDownModalCustomer.totalDeliveriesRecorded}
                </span>
                <span className="text-[10px] text-slate-400">used leaflets</span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-medium text-rose-600 block">Missing Leaves</span>
                <span className="text-lg font-extrabold text-rose-700 mt-0.5 block">
                  {activeTab === 'INVOICE' ? drillDownModalCustomer.totalInvoiceMissing : drillDownModalCustomer.totalDeliveryMissing}
                </span>
                <span className="text-[10px] text-slate-400">gaps in range</span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-medium text-blue-600 block">Overall Completion</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${
                          activeTab === 'INVOICE'
                            ? Math.round(
                                (drillDownModalCustomer.totalInvoicesRecorded /
                                  Math.max(1, drillDownModalCustomer.totalInvoiceBooks * 50)) *
                                  100
                              )
                            : Math.round(
                                (drillDownModalCustomer.totalDeliveriesRecorded /
                                  Math.max(1, drillDownModalCustomer.totalDeliveryBooks * 50)) *
                                  100
                              )
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-800">
                    {activeTab === 'INVOICE'
                      ? Math.round(
                          (drillDownModalCustomer.totalInvoicesRecorded /
                            Math.max(1, drillDownModalCustomer.totalInvoiceBooks * 50)) *
                            100
                        )
                      : Math.round(
                          (drillDownModalCustomer.totalDeliveriesRecorded /
                            Math.max(1, drillDownModalCustomer.totalDeliveryBooks * 50)) *
                            100
                        )}%
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Body: Customer's Books Table */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-bold">
                  Book Order Series for {drillDownModalCustomer.customerName}:
                </span>
                <span className="text-[11px] text-slate-500">
                  Click on any book's <strong>Drill Down</strong> to inspect recorded documents, missing numbers, and 50-leaflet matrix.
                </span>
              </div>

              {renderCustomerBooksTable(
                drillDownModalCustomer.customerName,
                activeTab === 'INVOICE' ? drillDownModalCustomer.invoiceBooks : drillDownModalCustomer.deliveryBooks
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing all 50-leaflet series books for {drillDownModalCustomer.customerName}
              </span>
              <button
                type="button"
                onClick={() => setDrillDownModalCustomer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          INDIVIDUAL BOOK DRILL-DOWN MODAL
          ========================================================================= */}
      {drillDownModalBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                  drillDownModalBook.category === 'INVOICE' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                }`}>
                  B{drillDownModalBook.bookIndex}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{drillDownModalBook.customerName}</span>
                    <span className="text-slate-400 font-normal">•</span>
                    <span>Book #{drillDownModalBook.bookIndex}</span>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-blue-200 border border-slate-700">
                      {drillDownModalBook.shortRange} ({drillDownModalBook.formattedRange})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Physical 50-leaflet {drillDownModalBook.category === 'INVOICE' ? 'invoice' : 'delivery note'} series audit breakdown
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrillDownModalBook(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {renderBookDrillDownDetails(drillDownModalBook)}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Leaflets #{drillDownModalBook.rangeStart} to #{drillDownModalBook.rangeEnd}
              </span>
              <button
                type="button"
                onClick={() => setDrillDownModalBook(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /**
   * Render Customer Books Table:
   * e.g. Customer Name | Book Order | Leaflet Range | Leaves RECORDED | Missing Leaves
   * eg: ARUSHA | 001-050 | 49 | 1
   * With drill-down option for each book to show recorded documents and missing leaves.
   */
  function renderCustomerBooksTable(custName: string, books: CustomerBookInfo[]) {
    if (!books || books.length === 0) {
      return (
        <div className="p-6 text-center text-slate-400 text-xs">
          No books found for this customer in the selected category.
        </div>
      );
    }

    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Book Order</th>
                <th className="py-2.5 px-3 font-mono">Leaflet Range (1-50)</th>
                <th className="py-2.5 px-3 text-right font-mono text-emerald-300">Leaves Recorded</th>
                <th className="py-2.5 px-3 text-right font-mono text-rose-300">Missing Leaves</th>
                <th className="py-2.5 px-3">Completion %</th>
                <th className="py-2.5 px-3 text-center w-28">Book Drill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {books.map((b) => {
                const isBookExpanded = !!expandedBookRows[b.id];
                const isInvoice = b.category === 'INVOICE';

                return (
                  <React.Fragment key={b.id}>
                    <tr
                      className={`transition-colors cursor-pointer ${
                        isBookExpanded
                          ? 'bg-blue-50/60'
                          : b.isComplete
                          ? 'hover:bg-slate-50'
                          : 'bg-amber-50/20 hover:bg-amber-50/50'
                      }`}
                      onClick={() => toggleBookRow(b.id)}
                    >
                      {/* Customer */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {custName}
                      </td>

                      {/* Book Order */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold ${
                          isInvoice ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          Book #{b.bookIndex}
                        </span>
                      </td>

                      {/* Leaflet Range: 001-050 */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {b.shortRange}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {b.formattedRange}
                        </div>
                      </td>

                      {/* Leaves RECORDED (e.g. 49) */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {b.usedCount}
                        </span>
                      </td>

                      {/* Missing Leaves (e.g. 1) */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        {b.missingCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-extrabold">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>{b.missingCount}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>0</span>
                          </span>
                        )}
                      </td>

                      {/* Completion % */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 sm:w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                b.isComplete ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${b.completionPercentage}%` }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-[11px] text-slate-700">
                            {b.completionPercentage}%
                          </span>
                        </div>
                      </td>

                      {/* Action / Drill Book */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleBookRow(b.id)}
                            className="px-2 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                            title="Toggle inline drill-down breakdown for this book"
                          >
                            <span>Drill</span>
                            {isBookExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrillDownModalBook(b)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                            title="Open full-screen book drill-down modal"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* INLINE BOOK DRILL-DOWN CONTAINER */}
                    {isBookExpanded && (
                      <tr className="bg-slate-50/90 border-b-2 border-indigo-200">
                        <td colSpan={8} className="p-4">
                          {renderBookDrillDownDetails(b)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /**
   * Render Comprehensive Drill Down Details for a Book (Used in Inline Table & Modal)
   */
  function renderBookDrillDownDetails(book: CustomerBookInfo) {
    const isInvoice = book.category === 'INVOICE';
    const isAllMissingShown = showAllMissingBooks[book.id];

    return (
      <div className="space-y-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        {/* Book Header KPI Mini-Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-900">
              {book.customerName} — Book #{book.bookIndex} ({book.shortRange})
            </span>
            <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
              {book.formattedRange}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <strong>{book.usedCount}</strong> / 50 Leaves Recorded
            </span>
            <span className="text-slate-300">|</span>
            {book.missingCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <strong>{book.missingCount}</strong> Missing Leaves
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <Check className="w-3.5 h-3.5" />
                Complete (50/50)
              </span>
            )}
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700">
              Completion: <strong>{book.completionPercentage}%</strong>
            </span>
          </div>
        </div>

        {/* 1. MISSING LEAVES SECTION */}
        {book.missingCount > 0 ? (
          <div className="p-3.5 rounded-lg bg-rose-50/90 border border-rose-200 text-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-rose-900">
                    Missing {isInvoice ? 'Invoice' : 'Delivery'} Numbers in Book #{book.bookIndex} ({book.missingCount} missing leaves):
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyMissing(book.id, book.missingFormatted)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="Copy all missing numbers as comma-separated list"
                >
                  {copiedKey === book.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Missing Numbers List</span>
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
                  className="text-xs text-rose-700 underline font-semibold hover:text-rose-900 cursor-pointer"
                >
                  {isAllMissingShown ? 'Show Grouped Ranges' : `View All ${book.missingCount} Codes`}
                </button>
              </div>
            </div>

            {/* Missing Ranges Pills */}
            {!isAllMissingShown ? (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {book.missingRanges.map((rg, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-900 bg-white px-2.5 py-1 rounded-md border border-rose-200 shadow-2xs"
                  >
                    <span>{rg.formattedRange}</span>
                    <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-semibold">
                      ({rg.count} missing)
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2.5 p-2.5 bg-white rounded-lg border border-rose-200 max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {book.missingFormatted.map((code, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-xs font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-100"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Complete Book: All 50 physical leaflets in this book ({book.formattedRange}) have been successfully recorded in the database.</span>
          </div>
        )}

        {/* 2. RECORDED DOCUMENTS TABLE */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              {isInvoice ? <FileText className="w-3.5 h-3.5 text-blue-600" /> : <Truck className="w-3.5 h-3.5 text-purple-600" />}
              <span>Recorded {isInvoice ? 'Invoices' : 'Delivery Notes'} in Book #{book.bookIndex} ({book.recordedItems.length} records)</span>
            </span>
            <span className="text-[11px] font-normal text-slate-500">
              Total Value: TZS {formatCurrency(
                book.recordedItems.reduce((sum: number, r: any) => sum + (Number(r.totalAfterVat || r.totalDeliveredValue || 0)), 0)
              )}
            </span>
          </div>

          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            {book.recordedItems.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No documents currently recorded in this book sequence.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3"># Document Number</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">PO Number</th>
                    <th className="py-2 px-3 text-right">Total Value (TZS)</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    {onNavigate && <th className="py-2 px-3 text-center w-20">Action</th>}
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
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
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
            )}
          </div>
        </div>

        {/* 3. INTERACTIVE 50-LEAFLET GRID MATRIX */}
        <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-indigo-600" />
              <span>50-Leaflet Visual Matrix (Slots 1 to 50)</span>
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
      </div>
    );
  }

  /**
   * Render Individual Book Card (Used in Cards View)
   */
  function renderBookCard(book: CustomerBookInfo) {
    const isBookExpanded = expandedBookRows[book.id];
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
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900">
                  {book.shortRange}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ({book.formattedRange})
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
                <span>{book.missingCount} Missing Leaves</span>
              </span>
            )}

            {/* Drill Down / Expand Toggle */}
            <button
              type="button"
              onClick={() => toggleBookRow(book.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>{isBookExpanded ? 'Hide Drill Down' : `Drill Down (${book.usedCount} rec • ${book.missingCount} miss)`}</span>
              {isBookExpanded ? (
                <ChevronDown className="w-3 h-3 text-slate-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Expanded Drill Down Container */}
        {isBookExpanded && (
          <div className="p-3.5 pt-0">
            {renderBookDrillDownDetails(book)}
          </div>
        )}
      </div>
    );
  }
};
