import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  PurchaseOrderGroup, 
  DocumentIssueRecord 
} from '../types';
import { formatCurrency } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { 
  X, 
  Sparkles, 
  Download, 
  Printer, 
  RefreshCw, 
  FileText, 
  Truck, 
  CreditCard, 
  Building2, 
  BookOpen, 
  AlertTriangle, 
  CheckCircle2, 
  GitCompare, 
  TrendingUp, 
  BarChart3, 
  Check, 
  Layers, 
  ShieldCheck, 
  ChevronRight,
  Filter,
  Eye,
  Info
} from 'lucide-react';
import { authHeaders, API_BASE } from '../utils/authToken';
import { exportManagementReportToPdf } from '../utils/managementReportPdfExport';

interface AIManagementReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  poGroups: PurchaseOrderGroup[];
  issues: DocumentIssueRecord[];
  initialModule?: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
}

export const AIManagementReportModal: React.FC<AIManagementReportModalProps> = ({
  isOpen,
  onClose,
  invoices,
  deliveryNotes,
  payments,
  poGroups,
  issues,
  initialModule = 'INVOICE',
}) => {
  const [activeModule, setActiveModule] = useState<'INVOICE' | 'DELIVERY' | 'PAYMENT'>(initialModule);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiReportData, setAiReportData] = useState<any>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Sync initial module if prop changes
  useEffect(() => {
    if (initialModule) {
      setActiveModule(initialModule);
    }
  }, [initialModule]);

  // Extract unique customers
  const customerList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.customerName && set.add(i.customerName.trim()));
    deliveryNotes.forEach((d) => d.customerName && set.add(d.customerName.trim()));
    payments.forEach((p) => p.customerName && set.add(p.customerName.trim()));
    poGroups.forEach((g) => g.customerName && set.add(g.customerName.trim()));
    return Array.from(set).sort(naturalCompare);
  }, [invoices, deliveryNotes, payments, poGroups]);

  // =========================================================================
  // 1. CALCULATE CUSTOMER 50-LEAFLET BOOK SERIES & MISSING NUMBER AUDIT
  // =========================================================================
  const customerBooksSummary = useMemo(() => {
    const records = activeModule === 'INVOICE' 
      ? invoices 
      : activeModule === 'DELIVERY' 
      ? deliveryNotes 
      : [];

    const numKey = activeModule === 'INVOICE' ? 'invoiceNumber' : 'deliveryNoteNumber';

    return customerList.map((custName) => {
      const custRecords = records.filter(
        (r) => (r.customerName || '').trim() === custName
      );

      // Extract numbers
      const parsedNumbers: number[] = [];
      let commonPrefix = activeModule === 'INVOICE' ? 'INV' : 'DN';

      custRecords.forEach((r) => {
        const str = String((r as any)[numKey] || '').trim();
        const m = str.match(/^(.*?)(\d+)$/);
        if (m) {
          commonPrefix = m[1] || commonPrefix;
          const num = parseInt(m[2], 10);
          if (!isNaN(num)) parsedNumbers.push(num);
        }
      });

      if (parsedNumbers.length === 0) {
        return {
          customerName: custName,
          totalBooks: 0,
          shortRange: '—',
          usedCount: 0,
          missingCount: 0,
          completionPercentage: 100,
          missingRangesSummary: 'No sequence registered',
          status: 'No Active Books',
        };
      }

      const minNum = Math.min(...parsedNumbers);
      const maxNum = Math.max(...parsedNumbers);

      const startBookIdx = Math.floor((minNum - 1) / 50) + 1;
      const endBookIdx = Math.floor((maxNum - 1) / 50) + 1;
      const totalBooks = Math.max(1, endBookIdx - startBookIdx + 1);

      const recordedSet = new Set<number>(parsedNumbers);
      let missingTotal = 0;
      const missingList: number[] = [];

      for (let b = startBookIdx; b <= endBookIdx; b++) {
        const rangeStart = (b - 1) * 50 + 1;
        const rangeEnd = b * 50;
        for (let n = rangeStart; n <= rangeEnd; n++) {
          if (!recordedSet.has(n)) {
            missingTotal++;
            missingList.push(n);
          }
        }
      }

      const capacity = totalBooks * 50;
      const usedCount = recordedSet.size;
      const completionPercentage = capacity > 0 ? Math.round((usedCount / capacity) * 100) : 0;

      // Group consecutive missing numbers
      let missingRangesSummary = 'None (All 50 Recorded)';
      if (missingList.length > 0) {
        const ranges: string[] = [];
        let start = missingList[0];
        let prev = missingList[0];

        for (let i = 1; i < missingList.length; i++) {
          const cur = missingList[i];
          if (cur === prev + 1) {
            prev = cur;
          } else {
            ranges.push(start === prev ? `${commonPrefix}${start}` : `${commonPrefix}${start}–${commonPrefix}${prev}`);
            start = cur;
            prev = cur;
          }
        }
        ranges.push(start === prev ? `${commonPrefix}${start}` : `${commonPrefix}${start}–${commonPrefix}${prev}`);
        missingRangesSummary = ranges.slice(0, 3).join(', ') + (ranges.length > 3 ? ` (+${ranges.length - 3} more)` : '');
      }

      const startRangeStr = String((startBookIdx - 1) * 50 + 1).padStart(3, '0');
      const endRangeStr = String(endBookIdx * 50).padStart(3, '0');

      return {
        customerName: custName,
        totalBooks,
        shortRange: `${startRangeStr}–${endRangeStr}`,
        usedCount,
        missingCount: missingTotal,
        completionPercentage,
        missingRangesSummary,
        status: missingTotal === 0 ? 'Complete (50/50)' : `${missingTotal} Gaps`,
      };
    }).filter((c) => c.totalBooks > 0 || selectedCustomer === 'ALL' || c.customerName === selectedCustomer);
  }, [customerList, invoices, deliveryNotes, activeModule, selectedCustomer]);

  // =========================================================================
  // 2. CALCULATE PO VS MODULE RECONCILIATION BY CUSTOMER
  // =========================================================================
  const customerReconciliation = useMemo(() => {
    return customerList.map((custName) => {
      const custPOs = poGroups.filter((p) => (p.customerName || '').trim() === custName);
      const totalPoValue = custPOs.reduce((sum, p) => sum + (p.totalValueAfterVat || 0), 0);

      let actualValue = 0;
      if (activeModule === 'INVOICE') {
        const custInvoices = invoices.filter((i) => (i.customerName || '').trim() === custName);
        actualValue = custInvoices.reduce((sum, i) => sum + (i.totalAfterVat || 0), 0);
      } else if (activeModule === 'DELIVERY') {
        const custDNs = deliveryNotes.filter((d) => (d.customerName || '').trim() === custName);
        actualValue = custDNs.reduce((sum, d) => sum + (d.totalDeliveredValue || 0), 0);
      } else {
        const custPays = payments.filter((p) => (p.customerName || '').trim() === custName);
        actualValue = custPays.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      }

      const variance = totalPoValue - actualValue;
      const fulfillmentRate = totalPoValue > 0 ? Math.round((actualValue / totalPoValue) * 100) : actualValue > 0 ? 100 : 0;

      let status = 'Balanced';
      if (actualValue === 0 && totalPoValue > 0) status = 'Pending Execution';
      else if (actualValue > totalPoValue && totalPoValue > 0) status = 'Over-Executed';
      else if (variance > 0) status = 'Backlog / Partial';
      else if (actualValue === totalPoValue && totalPoValue > 0) status = 'Fully Reconciled';

      return {
        customerName: custName,
        poCount: custPOs.length,
        totalPoValue,
        actualValue,
        variance,
        fulfillmentRate,
        status,
      };
    }).filter((r) => r.totalPoValue > 0 || r.actualValue > 0);
  }, [customerList, poGroups, invoices, deliveryNotes, payments, activeModule]);

  // =========================================================================
  // 3. CALCULATE CUSTOMER ISSUES SUMMARY & STATUS
  // =========================================================================
  const customerIssuesSummary = useMemo(() => {
    return customerList.map((custName) => {
      const custIssues = issues.filter(
        (iss) => (iss.customerName || '').trim() === custName && 
        (activeModule === 'INVOICE' ? iss.entityType === 'INVOICE' : activeModule === 'DELIVERY' ? iss.entityType === 'DELIVERY' : iss.entityType === 'PAYMENT' || !iss.entityType)
      );

      const totalIssues = custIssues.length;
      const pendingCount = custIssues.filter((i) => i.status === 'PENDING').length;
      const underReviewCount = custIssues.filter((i) => i.status === 'UNDER_REVIEW').length;
      const resolvedCount = custIssues.filter((i) => i.status === 'RESOLVED').length;

      const notes = custIssues
        .map((i) => i.issueDescription || (i.lineItemIssues?.[0]?.issueComment) || '')
        .filter(Boolean)
        .slice(0, 2)
        .join('; ');

      return {
        customerName: custName,
        totalIssues,
        pendingCount,
        underReviewCount,
        resolvedCount,
        keyIssuesNotes: notes || 'No active exceptions logged',
      };
    }).filter((iss) => iss.totalIssues > 0);
  }, [customerList, issues, activeModule]);

  // =========================================================================
  // 4. FINANCIAL VALUE BY CUSTOMER (FOR CHARTS & TABLES)
  // =========================================================================
  const customerFinancials = useMemo(() => {
    let rawList: { customerName: string; totalValue: number }[] = [];

    if (activeModule === 'INVOICE') {
      const map = new Map<string, number>();
      invoices.forEach((i) => {
        const c = (i.customerName || 'General Customer').trim();
        map.set(c, (map.get(c) || 0) + (i.totalAfterVat || 0));
      });
      map.forEach((val, cust) => rawList.push({ customerName: cust, totalValue: val }));
    } else if (activeModule === 'DELIVERY') {
      const map = new Map<string, number>();
      deliveryNotes.forEach((d) => {
        const c = (d.customerName || 'General Customer').trim();
        map.set(c, (map.get(c) || 0) + (d.totalDeliveredValue || 0));
      });
      map.forEach((val, cust) => rawList.push({ customerName: cust, totalValue: val }));
    } else {
      const map = new Map<string, number>();
      payments.forEach((p) => {
        const c = (p.customerName || 'General Customer').trim();
        map.set(c, (map.get(c) || 0) + (p.amountPaid || 0));
      });
      map.forEach((val, cust) => rawList.push({ customerName: cust, totalValue: val }));
    }

    rawList.sort((a, b) => b.totalValue - a.totalValue);
    const grandTotal = rawList.reduce((sum, item) => sum + item.totalValue, 0);

    return rawList.map((item) => ({
      customerName: item.customerName,
      totalValue: item.totalValue,
      percentage: grandTotal > 0 ? (item.totalValue / grandTotal) * 100 : 0,
    }));
  }, [invoices, deliveryNotes, payments, activeModule]);

  // =========================================================================
  // 5. GLOBAL METRICS
  // =========================================================================
  const globalMetrics = useMemo(() => {
    const filteredBooks = selectedCustomer === 'ALL'
      ? customerBooksSummary
      : customerBooksSummary.filter((b) => b.customerName === selectedCustomer);

    const totalCustomers = filteredBooks.length;
    const totalBooks = filteredBooks.reduce((sum, b) => sum + b.totalBooks, 0);
    const totalCapacity = totalBooks * 50;
    const totalRecorded = filteredBooks.reduce((sum, b) => sum + b.usedCount, 0);
    const totalMissing = filteredBooks.reduce((sum, b) => sum + b.missingCount, 0);
    const completionRate = totalCapacity > 0 ? Math.round((totalRecorded / totalCapacity) * 100) : 0;

    const filteredReconc = selectedCustomer === 'ALL'
      ? customerReconciliation
      : customerReconciliation.filter((r) => r.customerName === selectedCustomer);

    const totalPoCommitted = filteredReconc.reduce((sum, r) => sum + r.totalPoValue, 0);
    const totalFinancialValue = filteredReconc.reduce((sum, r) => sum + r.actualValue, 0);
    const variance = totalPoCommitted - totalFinancialValue;

    const filteredIssues = selectedCustomer === 'ALL'
      ? customerIssuesSummary
      : customerIssuesSummary.filter((i) => i.customerName === selectedCustomer);

    const totalIssues = filteredIssues.reduce((sum, i) => sum + i.totalIssues, 0);
    const openIssues = filteredIssues.reduce((sum, i) => sum + i.pendingCount + i.underReviewCount, 0);
    const resolvedIssues = filteredIssues.reduce((sum, i) => sum + i.resolvedCount, 0);

    return {
      totalCustomers,
      totalBooks,
      totalCapacity,
      totalRecorded,
      totalMissing,
      completionRate,
      totalFinancialValue,
      totalPoCommitted,
      variance,
      totalIssues,
      openIssues,
      resolvedIssues,
    };
  }, [customerBooksSummary, customerReconciliation, customerIssuesSummary, selectedCustomer]);

  // =========================================================================
  // 6. FETCH AI GENERATED MANAGEMENT NARRATIVE
  // =========================================================================
  const generateAIManagementReport = useCallback(async () => {
    setIsLoadingAI(true);
    try {
      const payload = {
        moduleType: activeModule,
        customerNameFilter: selectedCustomer,
        overallMetrics: globalMetrics,
        customerBooks: customerBooksSummary.slice(0, 15),
        customerReconciliations: customerReconciliation.slice(0, 15),
        customerIssues: customerIssuesSummary.slice(0, 10),
        topFinancials: customerFinancials.slice(0, 10),
      };

      const res = await fetch(`${API_BASE}/api/ai/management-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const json = await res.json();
      if (json.data) {
        setAiReportData(json.data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch AI management report, using client fallback:', err);
      // Client-side fallback if server fails
      const isInv = activeModule === 'INVOICE';
      const isDel = activeModule === 'DELIVERY';
      const label = isInv ? 'Invoicing' : isDel ? 'Goods Delivery' : 'Settlement & Remittances';
      const valStr = formatCurrency(globalMetrics.totalFinancialValue);
      const poStr = formatCurrency(globalMetrics.totalPoCommitted);

      setAiReportData({
        reportTitle: `Executive Management Audit & Performance Report: ${label}`,
        executiveNarrative: `This management report presents the comprehensive performance review for ${label} operations across ${globalMetrics.totalCustomers} customer accounts. Total executed value equals TZS ${valStr} in comparison with committed Purchase Orders of TZS ${poStr}.\n\nThe 50-leaflet tracker audit encompasses ${globalMetrics.totalBooks} physical books with a total sequence capacity of ${globalMetrics.totalCapacity} leaves. Currently, ${globalMetrics.totalRecorded} physical leaves have been recorded and verified (${globalMetrics.completionRate}% completion), while ${globalMetrics.totalMissing} leaves represent missing sequence gaps requiring administrative audit.\n\nOperational dispute tracking identifies ${globalMetrics.totalIssues} documented exceptions, with ${globalMetrics.openIssues} active items pending resolution. Priority focus is directed toward top billing customers to maintain audit compliance.`,
        operationalHighlights: [
          `Total executed ${label.toLowerCase()} volume: TZS ${valStr} across ${globalMetrics.totalCustomers} accounts.`,
          `Physical 50-leaflet sequence completion stands at ${globalMetrics.completionRate}% across ${globalMetrics.totalBooks} books.`,
          `${globalMetrics.totalMissing} missing sequence leaves flagged across customer books for register verification.`,
          `${globalMetrics.openIssues} active dispute exceptions undergoing departmental reconciliation.`
        ],
        sequenceAuditInsights: `Sequence continuity across 50-leaflet books ensures reliable record retention. Accounts maintaining 50/50 completion reflect high register hygiene, while accounts with missing sequence numbers require audit cross-referencing against physical carbon copies.`,
        reconciliationAssessment: `Comparing committed Purchase Orders against executed figures confirms contract fulfillment status. Backlog accounts with substantial uninvoiced or undelivered balances require expedited order dispatch.`,
        issuesAndRisksSummary: `${globalMetrics.totalIssues} total operational exceptions recorded. Active pending cases center on quantity variance, pricing adjustments, and unlinked PO lines.`,
        strategicRecommendations: [
          `Enforce mandatory weekly physical book leaf audits for customers with missing sequence gaps.`,
          `Accelerate billing and delivery matching for orders exceeding 30 days in backlog status.`,
          `Review and clear the ${globalMetrics.openIssues} pending exceptions before financial period close.`,
          `Generate quarterly PDF audit reports for management compliance and audit trail archiving.`
        ]
      });
    } finally {
      setIsLoadingAI(false);
    }
  }, [activeModule, selectedCustomer, globalMetrics, customerBooksSummary, customerReconciliation, customerIssuesSummary, customerFinancials]);

  // Initial load and reload when module or customer changes
  useEffect(() => {
    if (isOpen) {
      generateAIManagementReport();
    }
  }, [isOpen, activeModule, selectedCustomer]);

  // =========================================================================
  // 7. EXPORT TO PDF HANDLER
  // =========================================================================
  const handleExportPDF = () => {
    if (!aiReportData) return;

    exportManagementReportToPdf({
      reportTitle: aiReportData.reportTitle || `Management Report: ${activeModule}`,
      moduleType: activeModule,
      dateStr: new Date().toLocaleString(),
      customerFilter: selectedCustomer === 'ALL' ? 'All Customers' : selectedCustomer,
      aiNarrative: {
        executiveNarrative: aiReportData.executiveNarrative || '',
        operationalHighlights: aiReportData.operationalHighlights || [],
        sequenceAuditInsights: aiReportData.sequenceAuditInsights || '',
        reconciliationAssessment: aiReportData.reconciliationAssessment || '',
        issuesAndRisksSummary: aiReportData.issuesAndRisksSummary || '',
        strategicRecommendations: aiReportData.strategicRecommendations || [],
      },
      overallMetrics: globalMetrics,
      customerBooks: customerBooksSummary,
      customerReconciliations: customerReconciliation,
      customerIssues: customerIssuesSummary,
      topFinancials: customerFinancials.slice(0, 10),
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const isInvoice = activeModule === 'INVOICE';
  const isDelivery = activeModule === 'DELIVERY';
  const isPayment = activeModule === 'PAYMENT';
  const moduleLabel = isInvoice ? 'Invoice' : isDelivery ? 'Delivery' : 'Payment';
  const valueLabel = isInvoice ? 'Invoiced (TZS)' : isDelivery ? 'Delivered (TZS)' : 'Settled (TZS)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col my-auto">
        
        {/* =========================================================================
            MODAL HEADER: MODULE SELECTION TABS & EXPORT ACTIONS
            ========================================================================= */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center shadow-inner">
                <Sparkles className="w-4 h-4 text-purple-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    AI Management Report & Executive Audit Summary
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                    Gemini Intelligence
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Automated executive report for <strong>{moduleLabel}s</strong>: 50-leaflet book series audit, customer issues status, performance narrative, financial charts, and PO reconciliation.
                </p>
              </div>
            </div>

            {/* THREE PRIMARY TABS: INVOICE, DELIVERY, PAYMENT */}
            <div className="flex items-center gap-2 mt-3.5">
              <button
                type="button"
                onClick={() => setActiveModule('INVOICE')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isInvoice
                    ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-blue-300" />
                <span>Invoice Report</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('DELIVERY')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isDelivery
                    ? 'bg-purple-600 text-white shadow-xs ring-1 ring-purple-400'
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-purple-300" />
                <span>Delivery Report</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule('PAYMENT')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPayment
                    ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400'
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-300" />
                <span>Payment Report</span>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateAIManagementReport}
              disabled={isLoadingAI}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Regenerate executive narrative and insights"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAI ? 'animate-spin' : ''}`} />
              <span>{isLoadingAI ? 'Analyzing...' : 'Regenerate AI'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Download executive-formatted PDF report"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export to PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
              title="Print formatted management report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            SUB-HEADER: CUSTOMER FILTER & SCOPE INFO
            ========================================================================= */}
        <div className="p-3 sm:px-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-700">Filter Scope:</span>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Customers ({customerList.length})</option>
              {customerList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Report Currency: <strong>TZS</strong> • Active Customers: <strong>{globalMetrics.totalCustomers}</strong> • Generated: <strong>{new Date().toLocaleDateString()}</strong>
          </div>
        </div>

        {/* =========================================================================
            MODAL BODY: COMPREHENSIVE EXECUTIVE AUDIT SECTIONS
            ========================================================================= */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5 text-slate-800">
          
          {/* 1. EXECUTIVE KPI SUMMARY RIBBON */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">Total Books Done</span>
              <span className="text-lg font-black text-slate-900 mt-0.5 block">
                {globalMetrics.totalBooks} <span className="text-xs font-normal text-slate-500">Books</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{globalMetrics.totalCapacity} leaves cap.</span>
            </div>

            <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-semibold text-emerald-800 uppercase block">Leaves Recorded</span>
              <span className="text-lg font-black text-emerald-700 mt-0.5 block">
                {globalMetrics.totalRecorded} <span className="text-xs font-normal text-emerald-600">Leaves</span>
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold">{globalMetrics.completionRate}% Verified</span>
            </div>

            <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200">
              <span className="text-[10px] font-semibold text-rose-800 uppercase block">Missing Leaves</span>
              <span className="text-lg font-black text-rose-700 mt-0.5 block">
                {globalMetrics.totalMissing} <span className="text-xs font-normal text-rose-600">Gaps</span>
              </span>
              <span className="text-[10px] text-rose-700 font-mono">Requires audit</span>
            </div>

            <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
              <span className="text-[10px] font-semibold text-blue-800 uppercase block">Total {unitLabel(activeModule)}</span>
              <span className="text-base sm:text-lg font-black text-blue-900 mt-0.5 block truncate" title={`TZS ${formatCurrency(globalMetrics.totalFinancialValue)}`}>
                TZS {formatCurrency(globalMetrics.totalFinancialValue)}
              </span>
              <span className="text-[10px] text-blue-700 font-semibold">{activeModule} Volume</span>
            </div>

            <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200">
              <span className="text-[10px] font-semibold text-indigo-800 uppercase block">PO Commitment</span>
              <span className="text-base sm:text-lg font-black text-indigo-900 mt-0.5 block truncate" title={`TZS ${formatCurrency(globalMetrics.totalPoCommitted)}`}>
                TZS {formatCurrency(globalMetrics.totalPoCommitted)}
              </span>
              <span className="text-[10px] text-indigo-700 font-mono">
                Var: TZS {formatCurrency(globalMetrics.variance)}
              </span>
            </div>

            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
              <span className="text-[10px] font-semibold text-amber-800 uppercase block">Document Issues</span>
              <span className="text-lg font-black text-amber-800 mt-0.5 block">
                {globalMetrics.openIssues} <span className="text-xs font-normal text-amber-700">Open</span>
              </span>
              <span className="text-[10px] text-amber-700 font-semibold">of {globalMetrics.totalIssues} total logged</span>
            </div>
          </div>

          {/* 2. AI EXECUTIVE NARRATIVE ON PERFORMANCE OF WORK DONE */}
          <div className="bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 p-4 sm:p-5 rounded-xl border border-indigo-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {aiReportData?.reportTitle || `Executive Management Performance Narrative: ${moduleLabel}`}
                </h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                AI Performance Analysis
              </span>
            </div>

            {isLoadingAI ? (
              <div className="py-8 text-center text-indigo-600 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                <p className="text-xs font-semibold">Generating AI Management Narrative & Reconciliation Assessment...</p>
              </div>
            ) : (
              <div className="space-y-3 text-xs leading-relaxed text-slate-700">
                {/* Executive Paragraphs */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                  <span className="text-[11px] font-bold text-indigo-950 uppercase block tracking-wider">
                    Executive Briefing & Work Performance:
                  </span>
                  {(aiReportData?.executiveNarrative || '').split('\n\n').map((p: string, idx: number) => (
                    <p key={idx} className="text-slate-700 leading-relaxed font-sans">{p}</p>
                  ))}
                </div>

                {/* Two Column Section: Sequence Health & PO Reconciliation Assessment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>50-Leaflet Sequence Audit Insights:</span>
                    </span>
                    <p className="text-slate-600 leading-normal text-[11px]">
                      {aiReportData?.sequenceAuditInsights}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                      <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>PO Reconciliation Assessment:</span>
                    </span>
                    <p className="text-slate-600 leading-normal text-[11px]">
                      {aiReportData?.reconciliationAssessment}
                    </p>
                  </div>
                </div>

                {/* Highlights and Recommendations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {aiReportData?.operationalHighlights && (
                    <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                      <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1 mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Key Operational Highlights:</span>
                      </span>
                      <ul className="space-y-1 text-[11px] text-emerald-950">
                        {aiReportData.operationalHighlights.map((hl: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="font-bold text-emerald-600">•</span>
                            <span>{hl}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiReportData?.strategicRecommendations && (
                    <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                      <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1 mb-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>Management Recommendations:</span>
                      </span>
                      <ul className="space-y-1 text-[11px] text-blue-950">
                        {aiReportData.strategicRecommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="font-bold text-blue-600">{idx + 1}.</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. CHARTS & GRAPHS SECTION (VALUE BILLED/DELIVERED BY CUSTOMER & BOOK AUDIT) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Chart 1: Value Billed / Delivered by Customer */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <span>Value of {moduleLabel} {unitLabel(activeModule)} by Customer (Top 6)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Currency: TZS</span>
              </div>

              <div className="space-y-2.5 pt-1">
                {customerFinancials.slice(0, 6).map((fin, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{fin.customerName}</span>
                      <span className="font-mono font-bold text-indigo-700">
                        TZS {formatCurrency(fin.totalValue)}
                        <span className="text-[10px] font-normal text-slate-400 ml-1.5">({fin.percentage.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(4, fin.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Customer 50-Leaflet Book Completion & Missing Leaves Breakdown */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>50-Leaflet Book Completion & Missing Leaves by Customer</span>
                </span>
                <span className="text-[10px] text-slate-500">Green = Recorded, Red = Missing</span>
              </div>

              <div className="space-y-2.5 pt-1">
                {customerBooksSummary.slice(0, 6).map((b, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">
                        {b.customerName} ({b.totalBooks} Books)
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-emerald-700 font-semibold">{b.usedCount} rec</span>
                        <span className="text-slate-300">/</span>
                        <span className={`font-bold ${b.missingCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {b.missingCount} gaps
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${b.completionPercentage}%` }}
                      />
                      <div
                        className="h-full bg-rose-400"
                        style={{ width: `${100 - b.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. TABLE 1: CUSTOMER BOOK SERIES (50-LEAFLET TRACKER) & MISSING NUMBER AUDIT */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Customer Book Series (50-Leaflet Tracker) & Missing Number Audit</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Summary of physical 50-leaflet books done per customer, leaves recorded, and missing leaf sequence ranges.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {customerBooksSummary.length} Customers Audited
              </span>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3 text-center">Books Done</th>
                    <th className="py-2.5 px-3 text-right font-mono text-emerald-300">Leaves Recorded</th>
                    <th className="py-2.5 px-3 text-right font-mono text-rose-300">Missing Leaves</th>
                    <th className="py-2.5 px-3">Completion %</th>
                    <th className="py-2.5 px-3 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {customerBooksSummary.map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{b.customerName}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center font-bold">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[11px]">
                          {b.totalBooks} Books
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                        {b.usedCount}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {b.missingCount > 0 ? (
                          <span className="text-rose-600 font-extrabold">{b.missingCount}</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${b.missingCount === 0 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${b.completionPercentage}%` }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-[11px] text-slate-700">
                            {b.completionPercentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {b.missingCount === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Complete (50/50)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>{b.missingCount} Missing</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. TABLE 2: PO VS INVOICE/DELIVERY/PAYMENT CUSTOMER RECONCILIATION */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>PO vs {moduleLabel} Customer Reconciliation Report (High-Level Management)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Compares Purchase Order contract values against actual recorded {valueLabel.toLowerCase()} and tracks variance.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {customerReconciliation.length} Reconciled Accounts
              </span>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3 text-center">PO Orders</th>
                    <th className="py-2.5 px-3 text-right font-mono">PO Value Committed (TZS)</th>
                    <th className="py-2.5 px-3 text-right font-mono text-blue-300">Actual {valueLabel}</th>
                    <th className="py-2.5 px-3 text-right font-mono">Variance (TZS)</th>
                    <th className="py-2.5 px-3 text-center">Fulfillment %</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {customerReconciliation.map((rec, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {rec.customerName}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {rec.poCount} POs
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                        {formatCurrency(rec.totalPoValue)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-blue-900">
                        {formatCurrency(rec.actualValue)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        <span className={rec.variance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                          {formatCurrency(rec.variance)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold">
                        {rec.fulfillmentRate}%
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.status === 'Fully Reconciled' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : rec.status === 'Over-Executed'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 6. TABLE 3: SUMMARY OF ISSUES RAISED PER CUSTOMER & ISSUES STATUS */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Summary of Issues Raised per Customer & Issue Status</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Detailed audit of customer disputes, price discrepancies, and pending vs resolved exceptions.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {customerIssuesSummary.length} Accounts with Exceptions
              </span>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              {customerIssuesSummary.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No active exceptions or issues logged for {moduleLabel.toLowerCase()}s.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3 text-center">Total Issues</th>
                      <th className="py-2.5 px-3 text-center text-rose-300">Pending / Open</th>
                      <th className="py-2.5 px-3 text-center text-amber-300">Under Review</th>
                      <th className="py-2.5 px-3 text-center text-emerald-300">Resolved</th>
                      <th className="py-2.5 px-3 text-center">Resolution %</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {customerIssuesSummary.map((iss, idx) => {
                      const resPct = iss.totalIssues > 0 ? Math.round((iss.resolvedCount / iss.totalIssues) * 100) : 0;
                      const isComplete = iss.pendingCount === 0 && iss.underReviewCount === 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                            {iss.customerName}
                          </td>
                          <td className="py-2 px-3 text-center font-bold">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px]">
                              {iss.totalIssues}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {iss.pendingCount > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px]">
                                {iss.pendingCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {iss.underReviewCount > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                                {iss.underReviewCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            {iss.resolvedCount > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                                {iss.resolvedCount}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className="font-mono font-bold text-[11px] text-slate-700">
                              {resPct}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {isComplete ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                All Resolved
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Pending Action
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            MODAL FOOTER
            ========================================================================= */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 font-semibold">
            Executive Report ready for distribution • Exported as structured PDF report with tabular audit breakdown.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF (.pdf)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function unitLabel(moduleType: 'INVOICE' | 'DELIVERY' | 'PAYMENT') {
  if (moduleType === 'INVOICE') return 'Invoiced Value';
  if (moduleType === 'DELIVERY') return 'Delivered Value';
  return 'Settled Collections';
}
