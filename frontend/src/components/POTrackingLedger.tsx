import React, { useState, useMemo } from 'react';
import { PurchaseOrderGroup, InvoiceRecord, POLineItem, DeliveryNoteRecord } from '../types';
import { formatCurrency, groupPOsByNumber } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TablePagination } from './TablePagination';
import { 
  Scale, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Receipt, 
  FileText, 
  ArrowRight
} from 'lucide-react';

interface POTrackingLedgerProps {
  poGroups?: PurchaseOrderGroup[];
  poLines?: POLineItem[];
  invoices?: InvoiceRecord[];
  deliveryNotes?: DeliveryNoteRecord[];
  onSelectPOForInvoice?: (poNumber: string) => void;
  onCreateInvoice?: (poNumber: string) => void;
  onNavigateToInvoice?: () => void;
  onViewInvoicePrint?: (invoice: InvoiceRecord) => void;
}

export const POTrackingLedger: React.FC<POTrackingLedgerProps> = ({
  poGroups,
  poLines = [],
  invoices = [],
  deliveryNotes = [],
  onSelectPOForInvoice,
  onCreateInvoice,
  onNavigateToInvoice,
  onViewInvoicePrint,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);

  // Derive groups if poGroups is not provided directly
  const computedGroups = useMemo(() => {
    if (poGroups && poGroups.length > 0) return poGroups;
    return groupPOsByNumber(poLines || []);
  }, [poGroups, poLines]);

  const handleCreateInvoice = (poNum: string) => {
    if (onSelectPOForInvoice) onSelectPOForInvoice(poNum);
    if (onCreateInvoice) onCreateInvoice(poNum);
    if (onNavigateToInvoice) onNavigateToInvoice();
  };

  const toggleExpand = (poNumber: string) => {
    setExpandedPOs((prev) => {
      const next = new Set(prev);
      if (next.has(poNumber)) next.delete(poNumber);
      else next.add(poNumber);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedPOs(new Set(computedGroups.map((p) => p.poNumber)));
  };

  const collapseAll = () => {
    setExpandedPOs(new Set());
  };

  // Index invoices by PO number ONCE (single pass) rather than re-filtering and
  // re-sorting the entire invoices array for every PO group on every render —
  // with thousands of POs and thousands of invoices that per-group rescan was an
  // O(POs × invoices) cost paid again on every navigation to this screen (measured
  // at over a second by itself on a 2,500-PO / 4,400-invoice dataset).
  const invoicesByPoNumber = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    (invoices || []).forEach((inv) => {
      if (!inv || !inv.poNumber) return;
      const key = inv.poNumber.trim().toLowerCase();
      const list = map.get(key);
      if (list) list.push(inv);
      else map.set(key, [inv]);
    });
    map.forEach((list) => list.sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber)));
    return map;
  }, [invoices]);

  const getInvoicesForPO = (poNumber: string) => {
    return invoicesByPoNumber.get((poNumber || '').trim().toLowerCase()) || [];
  };

  // Filtered groups sorted naturally in ascending order
  const filteredGroups = useMemo(() => {
    const list = (computedGroups || []).filter((grp) => {
      if (!grp) return false;
      const matchesSearch =
        searchTerm === '' ||
        (grp.poNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (grp.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (grp.destination || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (grp.contract || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'PENDING' && grp.status === 'PENDING') ||
        (filterStatus === 'PARTIAL' && grp.status === 'PARTIALLY_INVOICED') ||
        (filterStatus === 'FULLY_INVOICED' && grp.status === 'FULLY_INVOICED');

      return matchesSearch && matchesStatus;
    });

    return list.sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
  }, [computedGroups, searchTerm, filterStatus]);

  // Rendering every PO as an accordion row (each with its own line-item table markup)
  // is what made this screen slow to navigate to once PO volume grew into the
  // thousands — paginating the rendered rows keeps the DOM small regardless of
  // total PO count.
  const paginatedGroups = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return filteredGroups.slice(start, start + ledgerPageSize);
  }, [filteredGroups, ledgerPage, ledgerPageSize]);

  // Overall Reconciliation Summary
  const grandSummary = useMemo(() => {
    let totalPoVal = 0;
    let totalInvoicedVal = 0;
    let totalRemainingVal = 0;

    (computedGroups || []).forEach((g) => {
      if (!g) return;
      totalPoVal += g.totalValueAfterVat || 0;
      totalInvoicedVal += g.invoicedValueAfterVat || 0;
      totalRemainingVal += g.remainingValueAfterVat || 0;
    });

    return {
      totalPoVal: Math.round(totalPoVal * 100) / 100,
      totalInvoicedVal: Math.round(totalInvoicedVal * 100) / 100,
      totalRemainingVal: Math.round(totalRemainingVal * 100) / 100,
      rate: totalPoVal > 0 ? Math.round((totalInvoicedVal / totalPoVal) * 1000) / 10 : 0,
    };
  }, [computedGroups]);

  const handleExportLedgerExcel = () => {
    const headers = [
      '#',
      'PO Number',
      'Customer Name',
      'PO Date',
      'Destination',
      'Line Items Count',
      'Total Value (TZS)',
      'Invoiced Value (TZS)',
      'Remaining Value (TZS)',
      'Billed Percentage (%)',
      'Ledger Status',
    ];
    const rows = filteredGroups.map((grp, idx) => {
      const pct = grp.totalValueAfterVat > 0
        ? Math.round((grp.invoicedValueAfterVat / grp.totalValueAfterVat) * 100)
        : 0;
      return [
        idx + 1,
        grp.poNumber,
        grp.customerName,
        grp.poDate,
        grp.destination || '',
        grp.lines.length,
        `TZS ${formatCurrency(grp.totalValueAfterVat)}`,
        `TZS ${formatCurrency(grp.invoicedValueAfterVat)}`,
        `TZS ${formatCurrency(grp.remainingValueAfterVat)}`,
        `${pct}%`,
        grp.status,
      ];
    });
    exportTableToExcel('PO_Invoicing_Ledger', headers, rows, 'PO_Ledger');
  };

  const handleExportLedgerPdf = () => {
    const headers = [
      '#',
      'PO #',
      'Customer',
      'Date',
      'Destination',
      'Total (TZS)',
      'Invoiced (TZS)',
      'Remaining (TZS)',
      'Status',
    ];
    const rows = filteredGroups.map((grp, idx) => [
      idx + 1,
      grp.poNumber,
      grp.customerName,
      grp.poDate,
      grp.destination || '',
      `TZS ${formatCurrency(grp.totalValueAfterVat)}`,
      `TZS ${formatCurrency(grp.invoicedValueAfterVat)}`,
      `TZS ${formatCurrency(grp.remainingValueAfterVat)}`,
      grp.status,
    ]);
    exportTableToPdf('PO Invoicing & Billing Ledger Report', headers, rows, {
      filenamePrefix: 'PO_Invoicing_Ledger_Report',
      subtitle: `Filtered Dataset • Total POs: ${filteredGroups.length} • Currency: TZS`,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            PO Invoicing Ledger & Reconciliation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit line-by-line consumption, multi-invoice partial billing history, and remaining balances for each Purchase Order.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Grand Reconciliation Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px] uppercase">Total Master PO Volume</span>
            <div className="text-xl font-bold mt-0.5">TZS {formatCurrency(grandSummary.totalPoVal)}</div>
            <span className="text-slate-400">{poGroups.length} Purchase Orders</span>
          </div>

          <div>
            <span className="text-emerald-400 block text-[11px] uppercase">Total Billed Invoices</span>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">TZS {formatCurrency(grandSummary.totalInvoicedVal)}</div>
            <span className="text-slate-400">{invoices.length} Invoices Recorded</span>
          </div>

          <div>
            <span className="text-amber-400 block text-[11px] uppercase">Outstanding Remaining</span>
            <div className="text-xl font-bold text-amber-400 mt-0.5">TZS {formatCurrency(grandSummary.totalRemainingVal)}</div>
            <span className="text-slate-400">Available to invoice</span>
          </div>

          <div>
            <span className="text-blue-400 block text-[11px] uppercase">Overall Fulfilled</span>
            <div className="text-xl font-bold text-blue-400 mt-0.5">{grandSummary.rate}%</div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${grandSummary.rate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search PO ledger by PO number, customer, destination..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setLedgerPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setLedgerPage(1);
          }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto"
        >
          <option value="ALL">All PO Statuses</option>
          <option value="PENDING">Pending (0% Invoiced)</option>
          <option value="PARTIAL">Partially Invoiced</option>
          <option value="FULLY_INVOICED">Fully Invoiced (Closed)</option>
        </select>

        <TableExportToolbar
          totalCount={filteredGroups.length}
          onExportExcel={handleExportLedgerExcel}
          onExportPdf={handleExportLedgerPdf}
        />
      </div>

      {/* Ledger PO Accordions */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200">
            No Purchase Orders found matching your criteria.
          </div>
        ) : (
          paginatedGroups.map((grp) => {
            const isExpanded = expandedPOs.has(grp.poNumber);
            const poInvoices = getInvoicesForPO(grp.poNumber);
            const percent = grp.totalValueAfterVat > 0
              ? Math.round((grp.invoicedValueAfterVat / grp.totalValueAfterVat) * 100)
              : 0;

            return (
              <div
                key={grp.poNumber}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all"
              >
                {/* Accordion PO Bar */}
                <div
                  onClick={() => toggleExpand(grp.poNumber)}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-slate-400">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-blue-600" /> : <ChevronRight className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 font-mono text-base">{grp.poNumber}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                          {grp.contract}
                        </span>
                        {grp.status === 'FULLY_INVOICED' && (
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Fully Invoiced
                          </span>
                        )}
                        {grp.status === 'PARTIALLY_INVOICED' && (
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Partially Invoiced ({percent}%)
                          </span>
                        )}
                        {grp.status === 'PENDING' && (
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending Invoicing
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 mt-1">
                        <span className="font-bold text-slate-800">{grp.customerName}</span> • {grp.destination} • Date: {grp.date}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 pl-8 md:pl-0">
                    <div className="text-left md:text-right">
                      <div className="text-xs text-slate-400">Total PO Value (Incl. VAT)</div>
                      <div className="text-base font-bold text-slate-900">TZS {formatCurrency(grp.totalValueAfterVat)}</div>
                    </div>

                    <div className="text-left md:text-right">
                      <div className="text-xs text-emerald-600 font-semibold">Invoiced: TZS {formatCurrency(grp.invoicedValueAfterVat)}</div>
                      <div className="text-xs text-amber-600 font-bold">Remaining: TZS {formatCurrency(grp.remainingValueAfterVat)}</div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateInvoice(grp.poNumber);
                      }}
                      disabled={grp.status === 'FULLY_INVOICED'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-xs transition-colors ${
                        grp.status === 'FULLY_INVOICED'
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Invoice
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="bg-slate-50/70 border-t border-slate-200 p-4 sm:p-6 space-y-6">
                    {/* Line Items Breakdown */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Line Items Tracking Breakdown ({grp.lines.length} items)
                        </h3>
                        <TableExportToolbar
                          totalCount={grp.lines.length}
                          onExportExcel={() => {
                            const headers = ['Item Description', 'UOM', 'PO Qty', 'Invoiced Qty', 'Remaining Qty', 'Unit Price (TZS)', 'Total (TZS)', 'Status'];
                            const rows = grp.lines.map(l => [
                              l.itemDescription,
                              l.unitOfMeasure,
                              l.quantity,
                              l.invoicedQuantity || 0,
                              l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity,
                              formatCurrency(l.unitPrice),
                              formatCurrency(l.valueAfterVat),
                              l.status || 'UNINVOICED',
                            ]);
                            exportTableToExcel(`PO_${grp.poNumber}_Lines`, headers, rows, `po_${grp.poNumber.toLowerCase()}_lines`);
                          }}
                          onExportPdf={() => {
                            const headers = ['Item Description', 'UOM', 'PO Qty', 'Invoiced Qty', 'Remaining Qty', 'Unit Price (TZS)', 'Total (TZS)', 'Status'];
                            const rows = grp.lines.map(l => [
                              l.itemDescription,
                              l.unitOfMeasure,
                              l.quantity,
                              l.invoicedQuantity || 0,
                              l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity,
                              formatCurrency(l.unitPrice),
                              formatCurrency(l.valueAfterVat),
                              l.status || 'UNINVOICED',
                            ]);
                            exportTableToPdf(`PO #${grp.poNumber} - Line Items Breakdown`, headers, rows, {
                              filenamePrefix: `po_${grp.poNumber.toLowerCase()}_lines`,
                              subtitle: `Customer: ${grp.customerName} • Destination: ${grp.destination || 'N/A'}`,
                              currencyNote: 'Currency: TZS',
                            });
                          }}
                          size="sm"
                        />
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-auto max-h-[380px] scrollbar-thin shadow-xs">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-900 text-white font-semibold uppercase text-[10px] sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Item Description</th>
                              <th className="py-2.5 px-2 text-center sticky top-0 bg-slate-900">UOM</th>
                              <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">PO Qty</th>
                              <th className="py-2.5 px-3 text-right text-emerald-300 sticky top-0 bg-slate-900">Invoiced Qty</th>
                              <th className="py-2.5 px-3 text-right text-amber-300 sticky top-0 bg-slate-900">Remaining Qty</th>
                              <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Unit Price (TZS)</th>
                              <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Total (TZS)</th>
                              <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Line Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {grp.lines.map((l) => (
                              <tr key={l.id} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-medium text-slate-900">{l.itemDescription}</td>
                                <td className="py-2 px-2 text-center font-mono text-slate-500">{l.unitOfMeasure}</td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-800">{l.quantity}</td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-700">{l.invoicedQuantity || 0}</td>
                                <td className="py-2 px-3 text-right font-bold text-amber-700">
                                  {l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600">TZS {formatCurrency(l.unitPrice)}</td>
                                <td className="py-2 px-3 text-right font-bold text-slate-900">TZS {formatCurrency(l.valueAfterVat)}</td>
                                <td className="py-2 px-3 text-center">
                                  {l.status === 'FULLY_INVOICED' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                      Closed
                                    </span>
                                  )}
                                  {l.status === 'PARTIALLY_INVOICED' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                      Partial
                                    </span>
                                  )}
                                  {(!l.status || l.status === 'UNINVOICED') && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Linked Issued Invoices */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Issued Invoices History against {grp.poNumber} ({poInvoices.length})
                      </h3>

                      {poInvoices.length === 0 ? (
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-xs text-slate-400 text-center">
                          No invoices have been issued yet against this Purchase Order.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {poInvoices.map((inv) => (
                            <div
                              key={inv.id}
                              className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex items-center justify-between"
                            >
                              <div>
                                <div className="font-bold text-sm text-blue-700 font-mono flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5" />
                                  {inv.invoiceNumber}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  Date: {inv.invoiceDate} • {inv.lines.length} Lines Billed
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="font-bold text-sm text-emerald-700">TZS {formatCurrency(inv.totalAfterVat)}</div>
                                  <div className="text-[10px] text-slate-400">Incl. VAT</div>
                                </div>
                                {onViewInvoicePrint && (
                                  <button
                                    onClick={() => onViewInvoicePrint(inv)}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                                    title="View / Print Invoice"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {filteredGroups.length > 0 && (
        <TablePagination
          currentPage={ledgerPage}
          totalItems={filteredGroups.length}
          pageSize={ledgerPageSize}
          onPageChange={setLedgerPage}
          onPageSizeChange={setLedgerPageSize}
          itemLabel="Purchase Orders"
        />
      )}
    </div>
  );
};
