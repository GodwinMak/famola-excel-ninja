import React, { useState, useMemo } from 'react';
import { InvoiceRecord, AppUser, DocumentIssueRecord } from '../types';
import { formatCurrency } from '../utils/storage';
import { exportInvoicesToExcel } from '../utils/excelParser';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TableColumnHeader } from './TableColumnHeader';
import { useTableSortAndFilter } from '../utils/useTableSortAndFilter';
import { canEditScreen, isAdminUser, canDeleteData, canLoadDatabase, canExportDatabase } from '../utils/authService';
import { naturalCompare } from '../utils/naturalSort';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { 
  Database, 
  Search, 
  Printer, 
  Trash2, 
  Download, 
  Upload,
  Receipt, 
  FileText, 
  Calendar, 
  Building2, 
  ArrowUpRight,
  Plus,
  Minus,
  Edit3,
  Ban,
  MessageSquare,
  ShieldAlert,
  AlertTriangle,
  X,
  Save,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { ImageAttachmentManager } from './ImageAttachmentManager';
import { InvoiceDatabaseImportModal } from './InvoiceDatabaseImportModal';
import { SmsConfirmationModal } from './SmsConfirmationModal';

interface InvoiceHistoryProps {
  invoices?: InvoiceRecord[];
  issues?: DocumentIssueRecord[];
  onViewInvoicePrint?: (invoice: InvoiceRecord) => void;
  onPrintInvoice?: (invoice: InvoiceRecord) => void; // alias fallback
  onDeleteInvoice: (invoiceId: string) => void;
  onNavigateToCreateInvoice?: () => void;
  onCreateNewInvoice?: () => void; // alias fallback
  onReloadInvoice?: (invoice: InvoiceRecord) => void;
  onFlagIssue?: (invoice: InvoiceRecord) => void;
  onViewIssuesTab?: () => void;
  onImportInvoices?: (invoices: InvoiceRecord[], mode: 'append' | 'replace') => void;
  onSaveInvoice?: (invoice: InvoiceRecord) => void;
  currentUser?: AppUser;
}

export const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({
  invoices = [],
  issues = [],
  onViewInvoicePrint,
  onPrintInvoice,
  onDeleteInvoice,
  onNavigateToCreateInvoice,
  onCreateNewInvoice,
  onReloadInvoice,
  onFlagIssue,
  onViewIssuesTab,
  onImportInvoices,
  onSaveInvoice,
  currentUser,
}) => {
  const handlePrint = onViewInvoicePrint || onPrintInvoice || (() => {});
  const handleNewInvoice = onNavigateToCreateInvoice || onCreateNewInvoice || (() => {});
  const isAdmin = isAdminUser(currentUser);
  const canEdit = canEditScreen(currentUser, 'invoices_db');
  const canCreate = canEditScreen(currentUser, 'create_invoice');
  const canLoadDB = canLoadDatabase(currentUser);
  const canExportDB = canExportDatabase(currentUser);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Expandable row state for viewing invoice details (+)
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const toggleExpandInvoice = (invoiceId: string) => {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  // Restricted Edit Invoice Modal state
  const [editModalInvoice, setEditModalInvoice] = useState<InvoiceRecord | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState<string>('');
  const [editInvoiceDate, setEditInvoiceDate] = useState<string>('');
  const [editDeliveryNotes, setEditDeliveryNotes] = useState<string>('');
  const [editFlagStatus, setEditFlagStatus] = useState<'ACTIVE' | 'FLAGGED' | 'CANCELLED' | 'OFR'>('ACTIVE');
  const [editLines, setEditLines] = useState<any[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Admin permanent delete confirmation state for whole invoice
  const [invoicePendingDelete, setInvoicePendingDelete] = useState<InvoiceRecord | null>(null);

  // Admin permanent delete confirmation state for individual invoice line item
  const [linePendingDelete, setLinePendingDelete] = useState<{
    invoice: InvoiceRecord;
    line: any;
    lineIndex: number;
  } | null>(null);

  const handleConfirmDeleteLine = () => {
    if (!linePendingDelete || !onSaveInvoice) return;
    const { invoice, lineIndex } = linePendingDelete;
    const updatedLines = [...(invoice.lines || [])];
    const [deletedItem] = updatedLines.splice(lineIndex, 1);

    const subtotalBeforeVat = updatedLines.reduce(
      (s, l) => s + (l.valueBeforeVat || (l.invoicedQuantity * l.unitPrice)),
      0
    );
    const totalVat = updatedLines.reduce(
      (s, l) => s + (l.vatAmount || (l.valueBeforeVat || (l.invoicedQuantity * l.unitPrice)) * (l.vatRate ?? 0.18)),
      0
    );
    const totalAfterVat = subtotalBeforeVat + totalVat;

    const updatedInvoice: InvoiceRecord = {
      ...invoice,
      lines: updatedLines,
      subtotalBeforeVat,
      totalVat,
      totalAfterVat,
    };

    onSaveInvoice(updatedInvoice);

    // If the edit modal is currently open for this invoice, keep editLines and editModalInvoice in sync
    if (editModalInvoice && editModalInvoice.id === invoice.id) {
      setEditLines((prev) => prev.filter((_, i) => i !== lineIndex));
      setEditModalInvoice(updatedInvoice);
    }

    setLinePendingDelete(null);
  };

  const handleOpenEditModal = (inv: InvoiceRecord) => {
    setEditModalInvoice(inv);
    setEditInvoiceNumber(inv.invoiceNumber);
    setEditInvoiceDate(inv.invoiceDate || (inv as any).date || new Date().toISOString().split('T')[0]);
    setEditDeliveryNotes(inv.notes || (inv.comment && !['okay', 'ok', 'active'].includes(inv.comment.toLowerCase()) ? inv.comment : ''));
    
    let status: 'ACTIVE' | 'FLAGGED' | 'CANCELLED' | 'OFR' = 'ACTIVE';
    if (inv.isCancelled || inv.status === 'CANCELLED') status = 'CANCELLED';
    else if (inv.isOfr || inv.status === 'OFR') status = 'OFR';
    else if (inv.hasIssue || (issues || []).some(i => (i.entityId === inv.id || i.referenceNumber === inv.invoiceNumber) && i.status !== 'RESOLVED')) status = 'FLAGGED';
    setEditFlagStatus(status);

    setEditLines(
      (inv.lines || []).map((line) => ({
        ...line,
        invoicedQuantity: line.invoicedQuantity || 0,
      }))
    );
    setEditError(null);
  };

  const handleEditLineQuantity = (idx: number, rawVal: string) => {
    const val = parseFloat(rawVal);
    const qty = isNaN(val) ? 0 : Math.max(0, val);
    setEditLines((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      const valBefore = Math.round(qty * target.unitPrice * 100) / 100;
      const vRate = target.vatRate ?? 0.18;
      const vatAmt = Math.round(valBefore * vRate * 100) / 100;
      const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;
      updated[idx] = {
        ...target,
        invoicedQuantity: qty,
        valueBeforeVat: valBefore,
        totalBeforeVat: valBefore,
        vatAmount: vatAmt,
        valueAfterVat: valAfter,
        totalAfterVat: valAfter,
      };
      return updated;
    });
  };

  const handleSaveEditModal = () => {
    if (!editModalInvoice) return;
    const cleanNum = editInvoiceNumber.trim();
    if (!cleanNum) {
      setEditError('Invoice Number cannot be empty.');
      return;
    }
    const isDup = invoices.some(
      (i) => i.id !== editModalInvoice.id && i.invoiceNumber.trim().toLowerCase() === cleanNum.toLowerCase()
    );
    if (isDup) {
      setEditError(`Invoice number "${cleanNum}" is already in use by another invoice.`);
      return;
    }

    let subtotal = 0;
    let totalVat = 0;
    let grandTotal = 0;
    editLines.forEach((l) => {
      subtotal += l.valueBeforeVat || 0;
      totalVat += l.vatAmount || 0;
      grandTotal += l.valueAfterVat || 0;
    });

    const isCancelled = editFlagStatus === 'CANCELLED';
    const isOfr = editFlagStatus === 'OFR';
    const isFlagged = editFlagStatus === 'FLAGGED';

    const updatedRecord: InvoiceRecord = {
      ...editModalInvoice,
      invoiceNumber: cleanNum,
      invoiceDate: editInvoiceDate,
      notes: editDeliveryNotes.trim(),
      lines: editLines,
      subtotalBeforeVat: Math.round(subtotal * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalAfterVat: Math.round(grandTotal * 100) / 100,
      status: isCancelled ? 'CANCELLED' : isOfr ? 'OFR' : 'ACTIVE',
      isCancelled: isCancelled,
      cancelReason: isCancelled ? (editDeliveryNotes.trim() || 'Cancelled') : undefined,
      isOfr: isOfr,
      ofrDetail: isOfr ? (editDeliveryNotes.trim() || 'Out of range') : undefined,
      hasIssue: isFlagged,
      issueStatus: isFlagged ? (editModalInvoice.issueStatus || 'PENDING') : undefined,
      comment: isFlagged ? 'Discrepancy' : isCancelled ? 'Cancelled' : (editDeliveryNotes.trim() || 'Okay'),
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
    };

    if (onSaveInvoice) {
      onSaveInvoice(updatedRecord);
    }
    setEditModalInvoice(null);
    setEditError(null);
  };

  // Unique customers from invoices
  const customers = useMemo(() => {
    const list = Array.from(new Set(invoices.map((inv) => inv.customerName))).filter(Boolean);
    return list.sort();
  }, [invoices]);

  // Fast O(1) issue lookup map
  const activeIssuesMap = useMemo(() => {
    const map = new Map<string, DocumentIssueRecord>();
    (issues || []).forEach((i) => {
      if (i.status !== 'RESOLVED') {
        if (i.entityId) map.set(i.entityId, i);
        if (i.referenceNumber) map.set(i.referenceNumber, i);
      }
    });
    return map;
  }, [issues]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = invoices.filter((inv) => {
      const matchesSearch =
        term === '' ||
        inv.invoiceNumber.toLowerCase().includes(term) ||
        inv.poNumber.toLowerCase().includes(term) ||
        inv.customerName.toLowerCase().includes(term) ||
        inv.destination.toLowerCase().includes(term) ||
        inv.contract.toLowerCase().includes(term) ||
        (inv.comment && inv.comment.toLowerCase().includes(term));

      const matchesCustomer = selectedCustomer === 'ALL' || inv.customerName === selectedCustomer;
      const matchesStatus = 
        selectedStatus === 'ALL' ||
        (selectedStatus === 'CANCELLED' && (inv.isCancelled || inv.status === 'CANCELLED')) ||
        (selectedStatus === 'ACTIVE' && !inv.isCancelled && inv.status !== 'CANCELLED');

      return matchesSearch && matchesCustomer && matchesStatus;
    });

    // Arrange (sort) by invoice number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
  }, [invoices, searchTerm, selectedCustomer, selectedStatus]);

  // Column sorting and filtering
  const {
    processedData: sortedAndFilteredInvoices,
    sortConfig: invoiceSort,
    columnFilters: invoiceFilters,
    handleSort: handleInvoiceSort,
    handleFilterChange: handleInvoiceFilterChange,
  } = useTableSortAndFilter<InvoiceRecord>(filteredInvoices, {
    defaultSort: { field: 'invoiceNumber', direction: 'asc' },
    customAccessors: {
      subtotalBeforeVat: (inv: InvoiceRecord) => inv.subtotalBeforeVat || 0,
      totalAfterVat: (inv: InvoiceRecord) => inv.totalAfterVat || 0,
      linesCount: (inv: InvoiceRecord) => inv.lines?.length || 0,
    },
  });

  // Paginated invoices for fast UI responsiveness
  const totalPages = Math.max(1, Math.ceil(sortedAndFilteredInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedAndFilteredInvoices.slice(start, start + pageSize);
  }, [sortedAndFilteredInvoices, safePage, pageSize]);

  // Summary totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    let grandTotal = 0;
    let totalLineItems = 0;
    let cancelledCount = 0;

    filteredInvoices.forEach((inv) => {
      if (inv.isCancelled || inv.status === 'CANCELLED') {
        cancelledCount += 1;
        return;
      }
      subtotal += inv.subtotalBeforeVat || 0;
      vat += inv.totalVat || 0;
      grandTotal += inv.totalAfterVat || 0;
      totalLineItems += inv.lines?.length || 0;
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalLineItems,
      cancelledCount,
    };
  }, [filteredInvoices]);

  const handleDeleteConfirm = (inv: InvoiceRecord) => {
    if (!canDeleteData(currentUser)) {
      alert('Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    setInvoicePendingDelete(inv);
  };

  const handleExportInvoicesExcel = () => {
    // When exporting invoices from toolbar, use the comprehensive multi-sheet Excel generator
    // that outputs both line items and invoice summaries with 100% full values
    exportInvoicesToExcel(filteredInvoices, `Invoices_Database_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportInvoicesPdf = () => {
    const headers = [
      '#',
      'Invoice #',
      'Date',
      'PO #',
      'Customer',
      'Status',
      'Lines',
      'Subtotal (TZS)',
      'Total (TZS)',
      'Paid (TZS)',
      'Paid Status',
    ];
    const rows = filteredInvoices.map((inv, idx) => {
      const invDate = inv.invoiceDate || (inv as any).date || '';
      const subtotal = typeof inv.subtotalBeforeVat === 'number' && inv.subtotalBeforeVat > 0
        ? inv.subtotalBeforeVat
        : typeof (inv as any).subtotal === 'number'
          ? (inv as any).subtotal
          : 0;
      const total = typeof inv.totalAfterVat === 'number' && inv.totalAfterVat > 0
        ? inv.totalAfterVat
        : typeof (inv as any).totalAmount === 'number'
          ? (inv as any).totalAmount
          : subtotal;

      return [
        idx + 1,
        inv.invoiceNumber,
        invDate,
        inv.poNumber,
        inv.customerName,
        inv.status || 'Active',
        inv.lines?.length || 1,
        `TZS ${formatCurrency(subtotal)}`,
        `TZS ${formatCurrency(total)}`,
        `TZS ${formatCurrency(inv.paidAmount || 0)}`,
        inv.paymentStatus || 'Unpaid',
      ];
    });

    exportTableToPdf('Invoiced PO Database Report', headers, rows, {
      filenamePrefix: 'Invoices_Report',
      subtitle: `Filtered Dataset • Total Invoices: ${filteredInvoices.length} • Currency: TZS`,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            Invoiced PO Database
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete historical registry of invoices, serial numbers, customer books, and line item billing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onImportInvoices && canLoadDB && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Admin Only: Load existing invoice database (.xlsx, .csv) with field mapping & extract template"
            >
              <Upload className="w-3.5 h-3.5" />
              Load Existing Database
            </button>
          )}

          {canExportDB && (
            <button
              onClick={() => exportInvoicesToExcel(filteredInvoices)}
              disabled={filteredInvoices.length === 0}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              title="Export Invoices & Itemized Lines to Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              Export Invoices Excel
            </button>
          )}

          {canCreate && (
            <button
              onClick={handleNewInvoice}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Invoices Registered</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{filteredInvoices.length}</div>
          <span className="text-[10px] text-slate-400">
            {totals.cancelledCount > 0 ? `${totals.cancelledCount} Cancelled / Void` : `${totals.totalLineItems} Billed Lines`}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Billed Excl. VAT</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">TZS {formatCurrency(totals.subtotal)}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total VAT Collected</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">TZS {formatCurrency(totals.vat)}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-emerald-50/60 to-white">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase">Total Billed (Incl. VAT)</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">TZS {formatCurrency(totals.grandTotal)}</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice number, PO number, customer, comments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">All Customers ({customers.length})</option>
          {customers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active Invoices</option>
          <option value="CANCELLED">Cancelled / No PO Ref</option>
        </select>

        <TableExportToolbar
          totalCount={filteredInvoices.length}
          onExportExcel={handleExportInvoicesExcel}
          onExportPdf={handleExportInvoicesPdf}
        />
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Invoiced Purchase Orders Table
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              {filteredInvoices.length} invoices
            </span>
          </div>
          <TableExportToolbar
            totalCount={filteredInvoices.length}
            onExportExcel={handleExportInvoicesExcel}
            onExportPdf={handleExportInvoicesPdf}
          />
        </div>
        <div className="overflow-auto max-h-[620px] scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white sticky top-0 z-20 font-semibold uppercase text-[11px] shadow-sm">
              <tr>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">#</th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                  <TableColumnHeader
                    label="Invoice Number"
                    field="invoiceNumber"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.invoiceNumber}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                  <TableColumnHeader
                    label="Invoice Date"
                    field="invoiceDate"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.invoiceDate}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                  <TableColumnHeader
                    label="Linked PO"
                    field="poNumber"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.poNumber}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                  <TableColumnHeader
                    label="Customer Name"
                    field="customerName"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.customerName}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                  <TableColumnHeader
                    label="Status"
                    field="status"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.status}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900 min-w-[140px]">
                  <TableColumnHeader
                    label="Comment"
                    field="comment"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.comment}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-center">
                  <TableColumnHeader
                    label="Lines"
                    field="linesCount"
                    align="center"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.linesCount}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-right">
                  <TableColumnHeader
                    label="Subtotal (TZS)"
                    field="subtotalBeforeVat"
                    align="right"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.subtotalBeforeVat}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-right font-bold">
                  <TableColumnHeader
                    label="Total (TZS)"
                    field="totalAfterVat"
                    align="right"
                    sortConfig={invoiceSort}
                    onSort={handleInvoiceSort}
                    filterValue={invoiceFilters.totalAfterVat}
                    onFilterChange={handleInvoiceFilterChange}
                  />
                </th>
                <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAndFilteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No invoices found matching your search. Click "New Invoice" to create one.
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv, idx) => {
                  const isCancelled = inv.isCancelled || inv.status === 'CANCELLED';
                  const globalIdx = (safePage - 1) * pageSize + idx + 1;

                  return (
                    <React.Fragment key={inv.id}>
                      <tr
                        className={`transition-colors ${
                          isCancelled ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                      <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">{globalIdx}</td>
                      <td className="py-3 px-3 font-bold font-mono text-blue-700 text-sm">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleExpandInvoice(inv.id)}
                            className="w-5 h-5 rounded flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer font-bold text-xs shrink-0"
                            title={expandedInvoiceIds.has(inv.id) ? "Hide line items & details" : "Click (+) to view invoice details, items, quantity, price, and total"}
                          >
                            {expandedInvoiceIds.has(inv.id) ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>
                          <span>{inv.invoiceNumber}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{inv.invoiceDate}</td>
                      <td className="py-3 px-3 font-bold font-mono text-slate-900">
                        {inv.poNumber}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                        {inv.customerName}
                      </td>
                      <td className="py-3 px-3">
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 inline-flex items-center gap-1">
                            <Ban className="w-3 h-3" /> CANCELLED
                          </span>
                        ) : (() => {
                          const activeIssue = activeIssuesMap.get(inv.id) || activeIssuesMap.get(inv.invoiceNumber);
                          if (activeIssue) {
                            return (
                              <button
                                type="button"
                                onClick={() => onViewIssuesTab?.()}
                                className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title={`Flagged Issue: ${activeIssue.issueType}. Click to open Issue Resolution Hub.`}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                {activeIssue.status === 'UNDER_REVIEW' ? 'UNDER REVIEW' : 'ISSUE FLAGGED'}
                              </button>
                            );
                          }
                          return (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              ACTIVE
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        <span className="font-medium text-xs">
                          {inv.comment || (isCancelled ? 'Cancelled - No PO reference' : 'Okay')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {inv.lines?.length || 0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        TZS {formatCurrency(inv.subtotalBeforeVat || 0)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 text-sm">
                        TZS {formatCurrency(inv.totalAfterVat || 0)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Flag Issue button */}
                          {onFlagIssue && !isCancelled && (
                            <button
                              onClick={() => onFlagIssue(inv)}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                              title="Flag / Report Discrepancy on this Invoice"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit Invoice button (Restricted fields: Invoice No, Delivery, Qty Invoiced, Date, Flag Status) */}
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditModal(inv)}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                              title="Edit Invoice (Invoice No, Delivery, Qty Invoiced, Date, Flag Status)"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Edit / Reload in creator workspace shortcut */}
                          {onReloadInvoice && canEdit && (
                            <button
                              onClick={() => onReloadInvoice(inv)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Open in full Invoice Creator workspace to edit"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          )}

                          {!isCancelled && (
                            <button
                              onClick={() => handlePrint(inv)}
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="Print / View Invoice Document"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}

                          {canDeleteData(currentUser) && (
                            <button
                              onClick={() => handleDeleteConfirm(inv)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Permanently Delete Invoice (ADM Only - Restores PO Available Quantity)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED ACCORDION ROW: View invoice line details, items, quantity, price, and total */}
                    {expandedInvoiceIds.has(inv.id) && (
                      <tr className="bg-slate-50 border-y-2 border-blue-200">
                        <td colSpan={11} className="p-4">
                          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                            {/* Summary Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-blue-800 border border-blue-200">
                                  <Receipt className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Invoice: {inv.invoiceNumber}</span>
                                </div>
                                <div className="text-xs text-slate-600">
                                  <span className="text-slate-400 font-medium">Customer:</span>{' '}
                                  <strong className="text-slate-800">{inv.customerName}</strong>
                                </div>
                                <div className="text-xs text-slate-600">
                                  <span className="text-slate-400 font-medium">PO Number:</span>{' '}
                                  <strong className="text-slate-800 font-mono">{inv.poNumber}</strong>
                                </div>
                                <div className="text-xs text-slate-600">
                                  <span className="text-slate-400 font-medium">Date:</span>{' '}
                                  <strong className="text-slate-800">{inv.invoiceDate}</strong>
                                </div>
                                {inv.notes && (
                                  <div className="text-xs bg-amber-50 text-amber-900 px-2.5 py-1 rounded border border-amber-200">
                                    <span className="font-bold">Delivery / Notes:</span> {inv.notes}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenEditModal(inv)}
                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit Invoice
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePrint(inv)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Print / View Full Invoice
                                </button>
                              </div>
                            </div>

                            {/* Line items details table */}
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                                    <tr>
                                      <th className="py-2 px-3 w-10 text-center">#</th>
                                      <th className="py-2 px-3">Item Description</th>
                                      <th className="py-2 px-3">UOM</th>
                                      <th className="py-2 px-3 text-right">Invoiced Qty</th>
                                      <th className="py-2 px-3 text-right">Unit Price (TZS)</th>
                                      <th className="py-2 px-3 text-right">Excl. VAT (TZS)</th>
                                      <th className="py-2 px-3 text-right">VAT (18%) (TZS)</th>
                                      <th className="py-2 px-3 text-right font-bold">Total After VAT (TZS)</th>
                                      <th className="py-2 px-3">Comments / Remarks</th>
                                      {canEdit && <th className="py-2 px-3 text-center w-14">Action</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(inv.lines || []).length === 0 ? (
                                      <tr>
                                        <td colSpan={canEdit ? 10 : 9} className="py-4 text-center text-slate-400">
                                          No item lines recorded for this invoice.
                                        </td>
                                      </tr>
                                    ) : (
                                      inv.lines.map((line, lIdx) => {
                                        const valBefore = line.valueBeforeVat || (line.invoicedQuantity * line.unitPrice);
                                        const vat = line.vatAmount || (valBefore * (line.vatRate ?? 0.18));
                                        const total = line.valueAfterVat || (valBefore + vat);
                                        return (
                                          <tr key={line.id || lIdx} className="hover:bg-slate-50/70">
                                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{lIdx + 1}</td>
                                            <td className="py-2 px-3 font-semibold text-slate-900">{line.itemDescription}</td>
                                            <td className="py-2 px-3 text-slate-600 uppercase text-[11px]">{line.unitOfMeasure || 'UNIT'}</td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{line.invoicedQuantity}</td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-600">TZS {formatCurrency(line.unitPrice)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-700">TZS {formatCurrency(valBefore)}</td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-600">TZS {formatCurrency(vat)}</td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">TZS {formatCurrency(total)}</td>
                                            <td className="py-2 px-3 text-slate-700 text-[11px]">
                                              {line.hasIssue || inv.hasIssue || inv.isFlagged ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-[11px] border border-amber-300">
                                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                                  <span>
                                                    {line.issueComment ||
                                                      inv.issueComment ||
                                                      (line.comment && line.comment.toLowerCase() !== 'okay' ? line.comment : '') ||
                                                      'Discrepancy Flagged'}
                                                  </span>
                                                </span>
                                              ) : (
                                                <span className="text-slate-500">{line.comment || 'Okay'}</span>
                                              )}
                                            </td>
                                            {canEdit && (
                                              <td className="py-2 px-3 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => setLinePendingDelete({ invoice: inv, line, lineIndex: lIdx })}
                                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                                  title="Delete item line permanently from database"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900 text-[11px]">
                                    <tr>
                                      <td colSpan={3} className="py-2 px-3 text-slate-600 uppercase tracking-wider">
                                        Invoice Totals ({inv.lines?.length || 0} line items)
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-blue-700">
                                        {(inv.lines || []).reduce((sum, l) => sum + (l.invoicedQuantity || 0), 0)}
                                      </td>
                                      <td className="py-2 px-3"></td>
                                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                                        TZS {formatCurrency(inv.subtotalBeforeVat || 0)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-slate-600">
                                        TZS {formatCurrency(inv.totalVat || 0)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-emerald-700 text-xs">
                                        TZS {formatCurrency(inv.totalAfterVat || 0)}
                                      </td>
                                      <td className="py-2 px-3"></td>
                                      {canEdit && <td className="py-2 px-3"></td>}
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>

                              {/* Attached Pictures & Document Scans */}
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Attached Pictures & Scans for Invoice #{inv.invoiceNumber}</span>
                                    {(inv.attachments || []).length > 0 && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {(inv.attachments || []).length} attached
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ImageAttachmentManager
                                  attachments={inv.attachments || []}
                                  readOnly={!canEditScreen(currentUser, 'invoices_db')}
                                  currentUser={currentUser}
                                  title=""
                                  description="Attach physical invoice photo, signed proof, or scan (PNG, JPG, WEBP)."
                                  compact={true}
                                  onChange={(updatedAttachments) => {
                                    if (onSaveInvoice) {
                                      const updatedInv = { ...inv, attachments: updatedAttachments };
                                      onSaveInvoice(updatedInv);
                                    }
                                  }}
                                />
                              </div>

                              {/* Active Issue Banner if Flagged */}
                              {inv.hasIssue && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-xs text-amber-900">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <div>
                                      <span className="font-bold">Flagged Issue:</span> {inv.issueComment || 'This invoice has an active issue registered.'}
                                      {inv.issueStatus && (
                                        <span className="ml-2 font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
                                          {inv.issueStatus}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {onViewIssuesTab && (
                                    <button
                                      type="button"
                                      onClick={onViewIssuesTab}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-xs"
                                    >
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                      View Issue & Pictures
                                    </button>
                                  )}
                                </div>
                              )}
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
          </table>
        </div>

        {/* Pagination Bar for instant responsiveness */}
        {filteredInvoices.length > pageSize && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{(safePage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-semibold text-slate-900">
                {Math.min(safePage * pageSize, filteredInvoices.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-900">{filteredInvoices.length}</span> invoices
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span className="text-slate-500 font-medium">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Database Import Modal */}
      {isImportModalOpen && onImportInvoices && (
        <InvoiceDatabaseImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingInvoices={invoices}
          onImportInvoices={(imported, mode) => {
            const normalizedMode = (String(mode).toLowerCase() === 'replace' ? 'replace' : 'append');
            onImportInvoices(imported, normalizedMode);
            setIsImportModalOpen(false);
          }}
          onImport={(imported, mode) => {
            const normalizedMode = (String(mode).toLowerCase() === 'replace' ? 'replace' : 'append');
            onImportInvoices(imported, normalizedMode);
            setIsImportModalOpen(false);
          }}
        />
      )}

      {/* RESTRICTED EDIT INVOICE MODAL (Invoice details screen editor) */}
      {editModalInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    Edit Invoice Details
                    <span className="font-mono text-amber-300 text-xs px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                      {editModalInvoice.invoiceNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Customer: <strong className="text-slate-200">{editModalInvoice.customerName}</strong> | PO:{' '}
                    <strong className="text-slate-200 font-mono">{editModalInvoice.poNumber}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditModalInvoice(null);
                  setEditError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Restricted policy badge */}
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Restricted Edit Access:</strong> You can only edit Invoice No, Delivery / Notes, Invoiced
                Quantities, Date, and Flag Status. Line values and totals are recalculated automatically.
              </span>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Allowed header edit fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {/* 1. Invoice Number */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-blue-600" />
                    Invoice No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    placeholder="e.g. CRU001"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 2. Delivery / Notes */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Delivery / Notes
                  </label>
                  <input
                    type="text"
                    value={editDeliveryNotes}
                    onChange={(e) => setEditDeliveryNotes(e.target.value)}
                    placeholder="Delivery note ref / remarks..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 3. Invoice Date */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editInvoiceDate}
                    onChange={(e) => setEditInvoiceDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Flag Status */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Flag Status
                  </label>
                  <select
                    value={editFlagStatus}
                    onChange={(e) => setEditFlagStatus(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE (Normal / Approved)</option>
                    <option value="FLAGGED">FLAGGED (Discrepancy / Issue)</option>
                    <option value="CANCELLED">CANCELLED (Cancelled / Void)</option>
                    <option value="OFR">OFR (Out of Range)</option>
                  </select>
                </div>
              </div>

              {/* 5. Invoiced Line Quantities (Editable item lines) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Invoiced Line Items ({editLines.length}) — Edit Quantity Invoiced
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Values & VAT automatically recomputed on quantity change
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px] sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center">#</th>
                          <th className="py-2 px-3">Item Description</th>
                          <th className="py-2 px-3">UOM</th>
                          <th className="py-2 px-3 text-right">Unit Price (TZS)</th>
                          <th className="py-2 px-3 text-right w-32">Qty Invoiced</th>
                          <th className="py-2 px-3 text-right">Excl. VAT (TZS)</th>
                          <th className="py-2 px-3 text-right">VAT (18%)</th>
                          <th className="py-2 px-3 text-right font-bold">Total (TZS)</th>
                          {isAdminUser(currentUser) && (
                            <th className="py-2 px-3 text-center w-14">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editLines.map((line, lIdx) => (
                          <tr key={line.id || lIdx} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{lIdx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{line.itemDescription}</td>
                            <td className="py-2 px-3 text-slate-600 uppercase text-[11px]">{line.unitOfMeasure || 'UNIT'}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              TZS {formatCurrency(line.unitPrice)}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.invoicedQuantity}
                                onChange={(e) => handleEditLineQuantity(lIdx, e.target.value)}
                                className="w-24 px-2 py-1 bg-amber-50/60 border border-amber-300 focus:bg-white focus:border-blue-500 rounded text-right font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              TZS {formatCurrency(line.valueBeforeVat || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              TZS {formatCurrency(line.vatAmount || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              TZS {formatCurrency(line.valueAfterVat || 0)}
                            </td>
                            {isAdminUser(currentUser) && (
                              <td className="py-1.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editModalInvoice) {
                                      setLinePendingDelete({
                                        invoice: editModalInvoice,
                                        line,
                                        lineIndex: lIdx,
                                      });
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Permanently delete this line from database"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Recalculated totals bar */}
              {(() => {
                const subtotal = editLines.reduce((s, l) => s + (l.valueBeforeVat || 0), 0);
                const vat = editLines.reduce((s, l) => s + (l.vatAmount || 0), 0);
                const grand = editLines.reduce((s, l) => s + (l.valueAfterVat || 0), 0);
                const totalQty = editLines.reduce((s, l) => s + (l.invoicedQuantity || 0), 0);

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Invoiced Qty</span>
                      <span className="font-mono font-bold text-blue-700 text-sm">{totalQty}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Subtotal (Excl. VAT)</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">TZS {formatCurrency(subtotal)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">VAT (18%)</span>
                      <span className="font-mono font-bold text-slate-700 text-sm">TZS {formatCurrency(vat)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Grand Total (Incl. VAT)</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">TZS {formatCurrency(grand)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalInvoice(null);
                    setEditError(null);
                  }}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                {onReloadInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      const inv = editModalInvoice;
                      setEditModalInvoice(null);
                      setEditError(null);
                      if (inv) onReloadInvoice(inv);
                    }}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Open this invoice directly in the Invoice Creator screen for full editing"
                  >
                    <Edit3 className="w-4 h-4 text-blue-600" />
                    Open in Invoice Creator
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveEditModal}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                Save Invoice Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Confirmation Modal for Admin Deleting Invoice Item Line */}
      <SmsConfirmationModal
        isOpen={!!linePendingDelete}
        onClose={() => setLinePendingDelete(null)}
        onConfirm={handleConfirmDeleteLine}
        title="Permanently Delete Line Item from Database"
        itemName={linePendingDelete?.line?.itemDescription || ''}
        quantity={linePendingDelete?.line?.invoicedQuantity}
        unitPrice={linePendingDelete?.line?.unitPrice}
        totalAmount={linePendingDelete?.line?.valueAfterVat}
        referenceNumber={linePendingDelete?.invoice?.invoiceNumber || ''}
        customerName={linePendingDelete?.invoice?.customerName}
        warningNote="⚠️ This action permanently deletes this line item from the database, updates the invoice totals, and recalculates PO tracking status."
      />

      {/* Permanent Delete Modal for Admin Deleting Invoice Transaction */}
      <PermanentDeleteModal
        isOpen={!!invoicePendingDelete}
        onClose={() => setInvoicePendingDelete(null)}
        onConfirm={() => {
          if (invoicePendingDelete) {
            onDeleteInvoice(invoicePendingDelete.id);
            setInvoicePendingDelete(null);
          }
        }}
        transactionType="INVOICE"
        referenceNumber={invoicePendingDelete?.invoiceNumber || ''}
        customerName={invoicePendingDelete?.customerName}
        poNumber={invoicePendingDelete?.poNumber}
        totalAmount={invoicePendingDelete?.totalAfterVat}
        details="Permanently removes invoice from database. Billed quantities return back to purchase order available balance. Any discrepancies associated with this invoice will be purged."
      />
    </div>
  );
};
