import React, { useState, useMemo } from 'react';
import { 
  PaymentRecord, 
  InvoiceRecord, 
  PaymentAllocationItem, 
  PurchaseOrderGroup,
  AppUser
} from '../types';
import { formatCurrency } from '../utils/storage';
import * as XLSX from 'xlsx';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TableColumnHeader } from './TableColumnHeader';
import { TablePagination } from './TablePagination';
import { useTableSortAndFilter } from '../utils/useTableSortAndFilter';
import { 
  CreditCard, 
  Building2, 
  Search, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  DollarSign, 
  Printer, 
  Download, 
  PlusCircle, 
  Sparkles, 
  FileText,
  Save,
  RotateCcw,
  Wallet,
  TrendingUp,
  Receipt,
  Tag,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { canDeleteData } from '../utils/authService';
import { naturalCompare } from '../utils/naturalSort';
import { PermanentDeleteModal } from './PermanentDeleteModal';

interface PaymentsManagerProps {
  payments?: PaymentRecord[];
  invoices?: InvoiceRecord[];
  poGroups?: PurchaseOrderGroup[];
  onSavePayment: (payment: PaymentRecord, updatedInvoices: InvoiceRecord[]) => void;
  onDeletePayment?: (paymentId: string) => void;
  currentUser?: AppUser;
}

export const PaymentsManager: React.FC<PaymentsManagerProps> = ({
  payments = [],
  invoices = [],
  poGroups = [],
  onSavePayment,
  onDeletePayment,
  currentUser,
}) => {
  const [viewMode, setViewMode] = useState<'record' | 'ledger'>('record');

  // Customer selection
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  // Payment inputs
  const [totalAmountPaid, setTotalAmountPaid] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState<string>(`TXN-${Date.now().toString().slice(-6)}`);
  const [depositAccount, setDepositAccount] = useState<string>('CRDB Corporate Account - 0150244900');
  const [notes, setNotes] = useState<string>('');

  // Allocation mapping: invoiceId -> allocated amount
  const [allocations, setAllocations] = useState<{ [invoiceId: string]: number }>({});
  
  // Payment Issue Tracking State
  const [hasPaymentIssue, setHasPaymentIssue] = useState<boolean>(false);
  const [paymentIssueComment, setPaymentIssueComment] = useState<string>('');
  const [paymentIssueSeverity, setPaymentIssueSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [paymentIssueType, setPaymentIssueType] = useState<
    'Payment Mismatch' | 'Customer Query' | 'Wrong PO Reference' | 'VAT / Calculation Error' | 'Other'
  >('Payment Mismatch');
  const [lineIssues, setLineIssues] = useState<{ [invoiceId: string]: { hasIssue: boolean; issueComment: string } }>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPayment, setSuccessPayment] = useState<PaymentRecord | null>(null);

  // Printing modal
  const [printingPayment, setPrintingPayment] = useState<PaymentRecord | null>(null);

  // Ledger search
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // Overall Financial Stats for Top Metric Cards
  const stats = useMemo(() => {
    const safePayments = payments || [];
    const safeInvoices = invoices || [];
    const totalCollected = safePayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const totalInvoiced = safeInvoices.reduce((sum, inv) => sum + (inv.totalAfterVat || 0), 0);
    const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);
    const fullyPaidInvoicesCount = safeInvoices.filter(
      (inv) => (inv.paidAmount || 0) >= (inv.totalAfterVat || 0) && (inv.totalAfterVat || 0) > 0
    ).length;
    const collectionRate = totalInvoiced > 0 ? Math.min(100, Math.round((totalCollected / totalInvoiced) * 100)) : 0;

    return {
      totalCollected,
      totalInvoiced,
      totalOutstanding,
      fullyPaidInvoicesCount,
      pendingInvoicesCount: Math.max(0, safeInvoices.length - fullyPaidInvoicesCount),
      collectionRate,
      paymentsCount: safePayments.length,
    };
  }, [payments, invoices]);

  // Unique customers who have invoices
  const customerList = useMemo(() => {
    const set = new Set<string>();
    (invoices || []).forEach((inv) => {
      if (inv.customerName) set.add(inv.customerName);
    });
    return Array.from(set).sort();
  }, [invoices]);

  // Selected customer financial snapshot
  const selectedCustomerStats = useMemo(() => {
    if (!selectedCustomer) return null;
    const custInvoices = (invoices || []).filter((inv) => inv.customerName === selectedCustomer);
    const totalInv = custInvoices.reduce((sum, inv) => sum + (inv.totalAfterVat || 0), 0);
    const totalPaid = custInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const balance = Math.max(0, totalInv - totalPaid);
    const openInvoices = custInvoices.filter((inv) => (inv.totalAfterVat || 0) - (inv.paidAmount || 0) > 0.01);

    return {
      totalInvoices: custInvoices.length,
      openCount: openInvoices.length,
      totalBilled: totalInv,
      totalPreviouslyPaid: totalPaid,
      outstandingBalance: balance,
    };
  }, [invoices, selectedCustomer]);

  // Invoices for selected customer
  const customerPendingInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return (invoices || [])
      .filter((inv) => inv.customerName === selectedCustomer)
      .sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
  }, [invoices, selectedCustomer]);

  // Paginated slice for the allocation step — customers with a long invoice
  // history (100+) otherwise render every row (each with its own input,
  // checkbox, and conditional issue field) at once. Allocations are keyed by
  // invoice id in the `allocations` state object, so switching pages never
  // loses an amount entered on a different page.
  const [allocationPage, setAllocationPage] = useState(1);
  const [allocationPageSize, setAllocationPageSize] = useState(25);
  const paginatedPendingInvoices = useMemo(() => {
    const start = (allocationPage - 1) * allocationPageSize;
    return customerPendingInvoices.slice(start, start + allocationPageSize);
  }, [customerPendingInvoices, allocationPage, allocationPageSize]);

  // Handle selecting a customer
  const handleSelectCustomer = (customer: string) => {
    setAllocationPage(1);
    setSelectedCustomer(customer);
    setAllocations({});
    setErrorMessage(null);
    setSuccessPayment(null);
  };

  // Auto-allocate entered totalAmountPaid across pending invoices (oldest to newest)
  const handleAutoAllocate = () => {
    const rawTotal = parseFloat(totalAmountPaid);
    if (isNaN(rawTotal) || rawTotal <= 0) {
      setErrorMessage('Please enter a valid Total Amount Paid before auto-allocating.');
      return;
    }

    setErrorMessage(null);
    let remainingToAllocate = rawTotal;
    const newAllocations: { [invoiceId: string]: number } = {};

    // Sort invoices by date (oldest first)
    const sorted = [...customerPendingInvoices].sort((a, b) => {
      return (a.invoiceDate || '').localeCompare(b.invoiceDate || '');
    });

    for (const inv of sorted) {
      const alreadyPaid = inv.paidAmount || 0;
      const unpaidBalance = Math.max(0, inv.totalAfterVat - alreadyPaid);

      if (unpaidBalance > 0 && remainingToAllocate > 0) {
        const canGive = Math.min(remainingToAllocate, unpaidBalance);
        newAllocations[inv.id] = Math.round(canGive * 100) / 100;
        remainingToAllocate -= canGive;
      } else {
        newAllocations[inv.id] = 0;
      }
    }

    setAllocations(newAllocations);
  };

  // Manual allocation input change for an invoice
  const handleAllocationChange = (invId: string, valueStr: string, maxBalance: number) => {
    const val = parseFloat(valueStr);
    const amount = isNaN(val) ? 0 : Math.max(0, val);

    if (amount > maxBalance) {
      setErrorMessage(`Allocation (TZS ${amount.toLocaleString()}) exceeds remaining unpaid balance (TZS ${maxBalance.toLocaleString()}) for this invoice.`);
    } else {
      setErrorMessage(null);
    }

    setAllocations((prev) => ({
      ...prev,
      [invId]: amount,
    }));
  };

  // Allocate 100% of a specific invoice balance
  const handleAllocateFullForInvoice = (invId: string, fullBalance: number) => {
    setAllocations((prev) => ({
      ...prev,
      [invId]: fullBalance,
    }));
  };

  // Clear allocations
  const handleClearAllocations = () => {
    setAllocations({});
  };

  // Toggle main payment issue (cascade to invoice lines)
  const handleToggleMainPaymentIssue = (checked: boolean) => {
    setHasPaymentIssue(checked);
    if (checked) {
      const nextIssues: { [invoiceId: string]: { hasIssue: boolean; issueComment: string } } = {};
      customerPendingInvoices.forEach((inv) => {
        const existing = lineIssues[inv.id];
        nextIssues[inv.id] = {
          hasIssue: true,
          issueComment: existing?.issueComment || 'Payment remittance / settlement discrepancy',
        };
      });
      setLineIssues(nextIssues);
      if (!paymentIssueComment) {
        setPaymentIssueComment('Payment remittance discrepancy flagged during recording');
      }
    } else {
      setLineIssues({});
    }
  };

  // Toggle single line payment issue (allows manual uncheck for lines with no issue)
  const handleToggleLinePaymentIssue = (invoiceId: string, checked: boolean) => {
    setLineIssues((prev) => {
      const existing = prev[invoiceId];
      const updated = {
        ...prev,
        [invoiceId]: {
          hasIssue: checked,
          issueComment: checked ? (existing?.issueComment || 'Discrepancy on invoice payment line') : (existing?.issueComment || ''),
        },
      };
      const anyChecked = (Object.values(updated) as Array<{ hasIssue: boolean; issueComment: string }>).some((v) => v.hasIssue);
      if (anyChecked && !hasPaymentIssue) {
        setHasPaymentIssue(true);
      }
      return updated;
    });
  };

  // Modify line issue comment
  const handleLinePaymentIssueCommentChange = (invoiceId: string, comment: string) => {
    setLineIssues((prev) => ({
      ...prev,
      [invoiceId]: {
        hasIssue: prev[invoiceId]?.hasIssue ?? true,
        issueComment: comment,
      },
    }));
  };

  // Total allocated calculation
  const totalAllocatedAmount = useMemo(() => {
    return Object.values(allocations).reduce((sum: number, val: number) => sum + (val || 0), 0);
  }, [allocations]);

  const rawEnteredTotal = parseFloat(totalAmountPaid) || 0;
  const unallocatedDifference = Math.round((rawEnteredTotal - totalAllocatedAmount) * 100) / 100;

  const hasAnyLineIssue = useMemo(() => {
    return (Object.values(lineIssues) as Array<{ hasIssue: boolean; issueComment: string }>).some((v) => v.hasIssue);
  }, [lineIssues]);
  const isFlaggedAsIssue = hasPaymentIssue || hasAnyLineIssue;

  // Save payment
  const handleSavePayment = (andPrint: boolean = false) => {
    setErrorMessage(null);

    if (!selectedCustomer) {
      setErrorMessage('Please select a Customer first.');
      return;
    }

    const isFlagged = isFlaggedAsIssue;

    // Zero payment amount or zero allocation is allowed ONLY when flagged as an issue for later Admin correction
    if (!isFlagged && rawEnteredTotal <= 0) {
      setErrorMessage('Please enter a valid Total Amount Paid (or flag as Issue if recording a discrepancy).');
      return;
    }

    if (!isFlagged && totalAllocatedAmount <= 0) {
      setErrorMessage('Please allocate the payment amount to at least one invoice (or flag as Issue if recording a discrepancy).');
      return;
    }

    if (!isFlagged && Math.abs(unallocatedDifference) > 0.01) {
      if (
        !window.confirm(
          `Total allocated (TZS ${formatCurrency(totalAllocatedAmount)}) does not match total amount paid (TZS ${formatCurrency(rawEnteredTotal)}). Difference: TZS ${formatCurrency(unallocatedDifference)}. Do you still want to proceed?`
        )
      ) {
        return;
      }
    }

    // Build allocation records & calculate updated invoice statuses
    const allocationItems: PaymentAllocationItem[] = [];
    const updatedInvoicesMap = new Map<string, InvoiceRecord>();

    customerPendingInvoices.forEach((inv) => {
      const allocated = allocations[inv.id] || 0;
      const lineIssue = lineIssues[inv.id];
      const lineHasIssue = !!lineIssue?.hasIssue;
      const lineComment = lineIssue?.issueComment?.trim() || (lineHasIssue ? 'Discrepancy on payment allocation line' : undefined);

      // Include allocation if allocated > 0 OR if flagged as issue (specific line issue or overall payment discrepancy)
      if (allocated > 0 || (isFlagged && (lineHasIssue || hasPaymentIssue))) {
        const prevPaid = inv.paidAmount || 0;
        const newPaidTotal = Math.round((prevPaid + allocated) * 100) / 100;
        const totalDue = inv.totalAfterVat || 0;
        const isSettled = newPaidTotal >= totalDue - 0.01;

        allocationItems.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          poNumber: inv.poNumber,
          customerName: inv.customerName,
          invoiceTotal: totalDue,
          alreadyPaid: prevPaid,
          pendingBalance: Math.max(0, totalDue - prevPaid),
          allocatedAmount: allocated,
          hasIssue: lineHasIssue,
          issueComment: lineComment,
        });

        if (allocated > 0) {
          updatedInvoicesMap.set(inv.id, {
            ...inv,
            paidAmount: newPaidTotal,
            paymentStatus: isSettled ? 'PAID' : 'PARTIALLY_PAID',
          });
        }
      }
    });

    // If flagged with 0 allocations and no lines matched, link to primary pending invoice if available
    if (isFlagged && allocationItems.length === 0 && customerPendingInvoices.length > 0) {
      const targetInv = customerPendingInvoices[0];
      allocationItems.push({
        invoiceId: targetInv.id,
        invoiceNumber: targetInv.invoiceNumber,
        poNumber: targetInv.poNumber,
        customerName: targetInv.customerName,
        invoiceTotal: targetInv.totalAfterVat || 0,
        alreadyPaid: targetInv.paidAmount || 0,
        pendingBalance: Math.max(0, (targetInv.totalAfterVat || 0) - (targetInv.paidAmount || 0)),
        allocatedAmount: 0,
        hasIssue: true,
        issueComment: paymentIssueComment.trim() || 'Flagged payment discrepancy with zero initial allocation',
      });
    }

    const allUpdatedInvoices = invoices.map((inv) => {
      if (updatedInvoicesMap.has(inv.id)) {
        return updatedInvoicesMap.get(inv.id)!;
      }
      return inv;
    });

    const primaryInvoiceNumber = allocationItems[0]?.invoiceNumber || (customerPendingInvoices[0]?.invoiceNumber || 'MULTI-INVOICE');
    const primaryPO = allocationItems[0]?.poNumber || 'MULTI-PO';
    
    const finalIssueComment = paymentIssueComment.trim() || (isFlagged ? 'Payment discrepancy flagged during recording' : undefined);

    const newPaymentRecord: PaymentRecord = {
      id: `pay-${Date.now()}`,
      paymentNumber: `REC-${new Date().getFullYear()}-${(payments.length + 1).toString().padStart(4, '0')}`,
      customerName: selectedCustomer,
      invoiceNumber: primaryInvoiceNumber,
      poNumber: primaryPO,
      amountPaid: rawEnteredTotal,
      paymentDate,
      paymentMethod: paymentMethod as any,
      referenceNumber,
      depositAccount,
      notes,
      allocations: allocationItems,
      hasIssue: isFlagged,
      issueComment: finalIssueComment,
      issueStatus: isFlagged ? 'PENDING' : undefined,
      createdAt: new Date().toISOString(),
    };

    onSavePayment(newPaymentRecord, allUpdatedInvoices);
    setSuccessPayment(newPaymentRecord);

    if (andPrint) {
      setPrintingPayment(newPaymentRecord);
    }

    setTotalAmountPaid('');
    setAllocations({});
    setNotes('');
    setHasPaymentIssue(false);
    setPaymentIssueComment('');
    setLineIssues({});
    setReferenceNumber(`TXN-${Date.now().toString().slice(-6)}`);
  };

  const handleStartNextPayment = () => {
    setSuccessPayment(null);
    setTotalAmountPaid('');
    setAllocations({});
    setNotes('');
    setHasPaymentIssue(false);
    setPaymentIssueComment('');
    setLineIssues({});
    setReferenceNumber(`TXN-${Date.now().toString().slice(-6)}`);
  };

  // Export payments ledger to Excel and PDF
  const handleExportPaymentsExcel = () => {
    const headers = [
      '#',
      'Receipt / Payment #',
      'Payment Date',
      'Customer',
      'PO Reference',
      'Amount Paid (TZS)',
      'Payment Method',
      'Ref / Check #',
      'Deposit Account',
      'Notes',
    ];
    const rows = filteredPaymentsLedger.map((p, idx) => [
      idx + 1,
      p.paymentNumber,
      p.paymentDate,
      p.customerName,
      p.poNumber,
      `TZS ${formatCurrency(p.amountPaid)}`,
      p.paymentMethod,
      p.referenceNumber,
      p.depositAccount || '',
      p.notes || '',
    ]);
    exportTableToExcel('Payments_Ledger_Registry', headers, rows, 'Payments_Ledger');
  };

  const handleExportPaymentsPdf = () => {
    const headers = [
      '#',
      'Receipt #',
      'Date',
      'Customer',
      'PO #',
      'Amount Paid',
      'Method',
      'Ref #',
    ];
    const rows = filteredPaymentsLedger.map((p, idx) => [
      idx + 1,
      p.paymentNumber,
      p.paymentDate,
      p.customerName,
      p.poNumber,
      `TZS ${formatCurrency(p.amountPaid)}`,
      p.paymentMethod,
      p.referenceNumber,
    ]);
    exportTableToPdf('Payments & Remittances Ledger Report', headers, rows, {
      filenamePrefix: 'Payments_Ledger_Report',
      subtitle: `Filtered Dataset • Total Receipts: ${filteredPaymentsLedger.length} • Currency: TZS`,
      orientation: 'landscape',
    });
  };

  const handleExportPendingInvoicesExcel = () => {
    const headers = ['Invoice #', 'Invoice Date', 'PO Reference', 'Total (TZS)', 'Previous Paid (TZS)', 'Remaining Balance (TZS)'];
    const rows = customerPendingInvoices.map((inv) => {
      const prevPaid = inv.paidAmount || 0;
      const unpaidBalance = Math.max(0, inv.totalAfterVat - prevPaid);
      return [
        inv.invoiceNumber,
        inv.invoiceDate,
        inv.poNumber,
        formatCurrency(inv.totalAfterVat),
        formatCurrency(prevPaid),
        formatCurrency(unpaidBalance)
      ];
    });
    exportTableToExcel(
      `${selectedCustomer || 'Customer'}_Pending_Invoices`,
      headers,
      rows,
      `pending_invoices_${(selectedCustomer || 'customer').replace(/\s+/g, '_').toLowerCase()}`
    );
  };

  const handleExportPendingInvoicesPdf = () => {
    const headers = ['Invoice #', 'Date', 'PO Ref', 'Total (TZS)', 'Prev Paid (TZS)', 'Balance (TZS)'];
    const rows = customerPendingInvoices.map((inv) => {
      const prevPaid = inv.paidAmount || 0;
      const unpaidBalance = Math.max(0, inv.totalAfterVat - prevPaid);
      return [
        inv.invoiceNumber,
        inv.invoiceDate,
        inv.poNumber,
        formatCurrency(inv.totalAfterVat),
        formatCurrency(prevPaid),
        formatCurrency(unpaidBalance)
      ];
    });
    exportTableToPdf(
      `Pending Invoices - ${selectedCustomer || 'Customer'}`,
      headers,
      rows,
      {
        filenamePrefix: `pending_invoices_${(selectedCustomer || 'customer').replace(/\s+/g, '_').toLowerCase()}`,
        currencyNote: 'Currency: TZS'
      }
    );
  };

  // Admin permanent delete confirmation state for Payment Transaction
  const [paymentPendingDelete, setPaymentPendingDelete] = useState<PaymentRecord | null>(null);

  const filteredPaymentsLedger = useMemo(() => {
    const list = (payments || []).filter((p) => {
      const q = ledgerSearch.toLowerCase();
      return (
        p.paymentNumber.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.poNumber.toLowerCase().includes(q) ||
        p.referenceNumber.toLowerCase().includes(q)
      );
    });

    // Arrange (sort) by payment / receipt number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.paymentNumber, b.paymentNumber));
  }, [payments, ledgerSearch]);

  // Table Sorting and Column Filtering for Payments Ledger
  const {
    processedData: sortedAndFilteredPaymentsLedger,
    sortConfig: paymentSort,
    columnFilters: paymentFilters,
    handleSort: handlePaymentSort,
    handleFilterChange: handlePaymentFilterChange,
  } = useTableSortAndFilter<PaymentRecord>(filteredPaymentsLedger, {
    defaultSort: { field: 'paymentNumber', direction: 'asc' },
    customAccessors: {
      amountPaid: (p: PaymentRecord) => p.amountPaid,
    },
  });

  // Paginated slice for the ledger table — rendering the full unsliced array
  // freezes the page once payment volume grows into the thousands.
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(50);
  const paginatedPaymentsLedger = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsPageSize;
    return sortedAndFilteredPaymentsLedger.slice(start, start + paymentsPageSize);
  }, [sortedAndFilteredPaymentsLedger, paymentsPage, paymentsPageSize]);

  return (
    <div className="space-y-6 pb-12 w-full mx-auto px-1 sm:px-2">
      {/* Top Banner & Mode Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold shrink-0">
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Customer Payments & Remittances</h1>
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Treasury
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Record bank deposits, track collections, and allocate remittances across open invoices.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto w-full md:w-auto">
          <button
            onClick={() => setViewMode(viewMode === 'record' ? 'ledger' : 'record')}
            className="w-full md:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-100 border border-slate-700 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs min-h-[44px]"
          >
            {viewMode === 'record' ? (
              <>
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>View Payments Ledger ({payments.length})</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <span>Record New Payment</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* TOP RESPONSIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Collections */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Collections</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-emerald-700 truncate" title={`TZS ${formatCurrency(stats.totalCollected)}`}>
              TZS {formatCurrency(stats.totalCollected)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>{stats.paymentsCount} payments received</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Invoiced Receivables */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoiced</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-slate-900 truncate" title={`TZS ${formatCurrency(stats.totalInvoiced)}`}>
              TZS {formatCurrency(stats.totalInvoiced)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <span>{invoices.length} total invoices issued</span>
            </div>
          </div>
        </div>

        {/* Card 3: Outstanding Receivables */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Outstanding Balance</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-amber-700 truncate" title={`TZS ${formatCurrency(stats.totalOutstanding)}`}>
              TZS {formatCurrency(stats.totalOutstanding)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-800/80 mt-1">
              <span>{stats.pendingInvoicesCount} invoices with open balance</span>
            </div>
          </div>
        </div>

        {/* Card 4: Collection Rate */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Recovery Rate</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-indigo-700">
              {stats.collectionRate}%
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${stats.collectionRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successPayment && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-emerald-900">
                  Payment Receipt {successPayment.paymentNumber} Recorded!
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Credited <span className="font-bold">TZS {formatCurrency(successPayment.amountPaid)}</span> from <span className="font-bold">{successPayment.customerName}</span>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPrintingPayment(successPayment)}
                className="px-3.5 py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Official Receipt
              </button>
              <button
                onClick={() => setViewMode('ledger')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <FileText className="w-3.5 h-3.5" />
                View Ledger
              </button>
              <button
                onClick={handleStartNextPayment}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Next Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 1: RECORD PAYMENT & ALLOCATION */}
      {viewMode === 'record' && (
        <div className="space-y-6">
          {/* Step 1 & 2: Top Payment Header & Customer Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Step 1: Payment Voucher & Remittance Details
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">Fields with * are mandatory</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Amount Paid */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  Total Amount Paid (TZS) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={totalAmountPaid}
                  onChange={(e) => setTotalAmountPaid(e.target.value)}
                  placeholder="e.g. 50000.00"
                  className="w-full text-sm sm:text-base font-mono font-bold text-emerald-800 px-3.5 py-2.5 sm:py-3 bg-emerald-50/40 border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>

              {/* Select Customer */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  Select Customer / Client <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full text-xs font-semibold px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">-- Choose Customer --</option>
                  {customerList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full text-xs font-medium px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-slate-500" />
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full text-xs font-semibold px-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="Bank Transfer">Bank Wire / TT</option>
                  <option value="Cheque / Draft">Corporate Cheque</option>
                  <option value="Mobile Money">Mobile Money (M-Pesa / Tigo)</option>
                  <option value="Cash Deposit">Direct Cash Deposit</option>
                  <option value="Letter of Credit">Letter of Credit (LC)</option>
                </select>
              </div>
            </div>

            {/* Additional Reference Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Bank Reference / Cheque # / Transaction ID
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. CRDB-TXN-884920"
                  className="w-full text-xs font-mono px-3.5 py-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Deposited Bank Account / Ledger
                </label>
                <input
                  type="text"
                  value={depositAccount}
                  onChange={(e) => setDepositAccount(e.target.value)}
                  placeholder="e.g. CRDB Corporate Account - 0150244900"
                  className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Selected Customer Financial Snapshot Strip */}
            {selectedCustomerStats && (
              <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                  <span className="font-bold text-blue-900">{selectedCustomer}</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-blue-800">{selectedCustomerStats.openCount} open invoices</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px]">Total Billed: </span>
                    <span className="font-bold text-slate-800">TZS {formatCurrency(selectedCustomerStats.totalBilled)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">Unpaid Balance: </span>
                    <span className="font-bold text-amber-700">TZS {formatCurrency(selectedCustomerStats.outstandingBalance)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Transaction Issue Flagging Section */}
            <div className={`mt-3 p-4 rounded-xl border transition-colors ${
              hasPaymentIssue ? 'bg-rose-50/80 border-rose-200' : 'bg-slate-50/60 border-slate-200'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    id="payment-has-issue-checkbox"
                    type="checkbox"
                    checked={hasPaymentIssue}
                    onChange={(e) => handleToggleMainPaymentIssue(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="payment-has-issue-checkbox" className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                      <AlertTriangle className={`w-3.5 h-3.5 ${hasPaymentIssue ? 'text-rose-600' : 'text-slate-400'}`} />
                      <span>Flag this Payment as having an Issue / Discrepancy</span>
                      {hasPaymentIssue && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700 rounded-full border border-rose-300">
                          Issue Active
                        </span>
                      )}
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Checking this marks all customer invoice lines as having an issue by default. You can manually uncheck any line with no issue below.
                    </p>
                  </div>
                </div>

                {hasPaymentIssue && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] font-medium text-rose-700 bg-white/80 px-2.5 py-1 rounded border border-rose-200">
                      {(Object.values(lineIssues) as Array<{ hasIssue: boolean; issueComment: string }>).filter((v) => v.hasIssue).length} of {customerPendingInvoices.length} lines flagged
                    </span>
                  </div>
                )}
              </div>

              {/* Expanded Details when flagged */}
              {hasPaymentIssue && (
                <div className="mt-3 pt-3 border-t border-rose-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-rose-900 block mb-1">
                      Payment Discrepancy Type
                    </label>
                    <select
                      value={paymentIssueType}
                      onChange={(e) => setPaymentIssueType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    >
                      <option value="Payment Mismatch">Amount / Short Remittance</option>
                      <option value="Customer Query">Customer Disputed Deductions</option>
                      <option value="Wrong PO Reference">Wrong PO / Remittance Advice</option>
                      <option value="VAT / Calculation Error">Tax / WHT Withholding Discrepancy</option>
                      <option value="Other">Other Discrepancy</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-rose-900 block mb-1">
                      Severity Level
                    </label>
                    <select
                      value={paymentIssueSeverity}
                      onChange={(e) => setPaymentIssueSeverity(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High (Urgent)</option>
                      <option value="CRITICAL">Critical (Settlement Dispute)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-rose-900 block mb-1">
                      Payment Issue Comment <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paymentIssueComment}
                      onChange={(e) => setPaymentIssueComment(e.target.value)}
                      placeholder="e.g. Bank slip shows TZS 20,000 WHT deduction unverified..."
                      className="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-medium text-slate-800 placeholder-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 shadow-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 3: Customer Invoices Allocation Area */}
          {!selectedCustomer ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-800">Select a Customer to Allocate Invoices</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Choose a customer from the dropdown above to display their open invoice book, remaining balances, and auto-distribute received funds.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">
                      Step 2: Allocate Funds to Invoices
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      {customerPendingInvoices.length} invoices found
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold font-mono">
                      Allocated: TZS {formatCurrency(totalAllocatedAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allocate payments directly into individual invoice rows or use Auto-Allocate to distribute oldest-first.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <TableExportToolbar
                    totalCount={customerPendingInvoices.length}
                    onExportExcel={handleExportPendingInvoicesExcel}
                    onExportPdf={handleExportPendingInvoicesPdf}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={handleAutoAllocate}
                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
                    title="Automatically distribute entered amount from oldest to newest invoice"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Auto-Allocate
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllocations}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              </div>

              {/* DUAL DEVICE VIEW: Mobile Cards for screens < 768px */}
              <div className="block md:hidden space-y-3">
                {customerPendingInvoices.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No invoices recorded for {selectedCustomer}.
                  </div>
                ) : (
                  paginatedPendingInvoices.map((inv) => {
                    const prevPaid = inv.paidAmount || 0;
                    const unpaidBalance = Math.max(0, inv.totalAfterVat - prevPaid);
                    const allocated = allocations[inv.id] || 0;
                    const finalBalance = Math.max(0, unpaidBalance - allocated);
                    const isFullySettled = finalBalance <= 0.01 && allocated > 0;

                    return (
                      <div
                        key={inv.id}
                        className={`p-4 rounded-xl border transition-all ${
                          allocated > 0
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200/60">
                          <div>
                            <span className="font-mono font-bold text-sm text-slate-900 block">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Date: {inv.invoiceDate} • PO: {inv.poNumber}
                            </span>
                          </div>
                          <div>
                            {isFullySettled ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Full Paid
                              </span>
                            ) : allocated > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                Partial
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                                Open
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Balances grid */}
                        <div className="grid grid-cols-2 gap-2 my-2.5 text-xs">
                          <div>
                            <span className="text-[10px] uppercase text-slate-500 block">Invoice Total</span>
                            <span className="font-mono font-bold text-slate-800">TZS {formatCurrency(inv.totalAfterVat)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-500 block">Unpaid Balance</span>
                            <span className="font-mono font-bold text-amber-700">TZS {formatCurrency(unpaidBalance)}</span>
                          </div>
                        </div>

                        {/* Input & Full button */}
                        <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                              Allocate (TZS)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={unpaidBalance}
                              step="any"
                              value={allocated || ''}
                              onChange={(e) => handleAllocationChange(inv.id, e.target.value, unpaidBalance)}
                              placeholder="0.00"
                              className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAllocateFullForInvoice(inv.id, unpaidBalance)}
                            className="mt-4 px-3 py-2 text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg cursor-pointer shrink-0"
                            title="Allocate entire unpaid balance"
                          >
                            + Full
                          </button>
                        </div>

                        {/* Mobile Line Issue Flag */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-col gap-1.5">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!lineIssues[inv.id]?.hasIssue}
                              onChange={(e) => handleToggleLinePaymentIssue(inv.id, e.target.checked)}
                              className="w-4 h-4 rounded text-rose-600 focus:ring-0 cursor-pointer accent-rose-600"
                            />
                            <span className="text-[11px] font-bold text-rose-700">Flag Discrepancy on this Invoice</span>
                          </label>
                          {lineIssues[inv.id]?.hasIssue && (
                            <input
                              type="text"
                              value={lineIssues[inv.id]?.issueComment || ''}
                              onChange={(e) => handleLinePaymentIssueCommentChange(inv.id, e.target.value)}
                              placeholder="Discrepancy note (e.g. rate dispute)..."
                              className="w-full text-xs px-2.5 py-1.5 rounded border border-rose-300 bg-rose-50/70 text-rose-900 font-medium placeholder-rose-300 focus:bg-white focus:border-rose-500 focus:outline-none"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* DUAL DEVICE VIEW: Desktop Data Table for screens >= 768px */}
              <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[460px] scrollbar-thin">
                  <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                    <thead className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-xs">
                      <tr>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Invoice #</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Date</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900">PO Ref</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-right">Invoice Total</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-right">Prev Paid</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-right text-amber-300">Remaining Balance</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-right bg-emerald-950/90">Allocate (TZS)</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-center">Issue?</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Payment Issue Note</th>
                        <th className="py-1.5 px-2 sticky top-0 bg-slate-900 text-center">Status After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {customerPendingInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-6 text-center text-slate-500">
                            No invoices found for this customer.
                          </td>
                        </tr>
                      ) : (
                        paginatedPendingInvoices.map((inv) => {
                          const prevPaid = inv.paidAmount || 0;
                          const unpaidBalance = Math.max(0, inv.totalAfterVat - prevPaid);
                          const allocated = allocations[inv.id] || 0;
                          const finalBalance = Math.max(0, unpaidBalance - allocated);
                          const isFullySettled = finalBalance <= 0.01 && allocated > 0;
                          const hasIssue = !!lineIssues[inv.id]?.hasIssue;

                          return (
                            <tr
                              key={inv.id}
                              className={`transition-colors ${
                                hasIssue
                                  ? 'bg-rose-50/40'
                                  : allocated > 0
                                  ? 'bg-emerald-50/50'
                                  : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <td className="py-1.5 px-2 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                              <td className="py-1.5 px-2 text-slate-600">{inv.invoiceDate}</td>
                              <td className="py-1.5 px-2 font-mono text-slate-700">{inv.poNumber}</td>
                              <td className="py-1.5 px-2 text-right font-semibold text-slate-800">
                                TZS {formatCurrency(inv.totalAfterVat)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-slate-500">
                                TZS {formatCurrency(prevPaid)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-bold text-amber-700">
                                TZS {formatCurrency(unpaidBalance)}
                              </td>
                              <td className="py-1 px-2 text-right bg-emerald-50/40">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={unpaidBalance}
                                    step="any"
                                    value={allocated || ''}
                                    onChange={(e) => handleAllocationChange(inv.id, e.target.value, unpaidBalance)}
                                    placeholder="0.00"
                                    className="w-28 text-right font-mono font-bold text-xs px-2 py-0.5 border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-500 bg-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAllocateFullForInvoice(inv.id, unpaidBalance)}
                                    className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded cursor-pointer transition-colors"
                                    title="Pay full remaining balance"
                                  >
                                    Full
                                  </button>
                                </div>
                              </td>
                              {/* Issue Checkbox */}
                              <td className="py-1.5 px-2 text-center">
                                <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={hasIssue}
                                    onChange={(e) => handleToggleLinePaymentIssue(inv.id, e.target.checked)}
                                    className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-0 cursor-pointer accent-rose-600"
                                  />
                                  <span className={`text-[10px] font-bold uppercase ${hasIssue ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {hasIssue ? 'Issue' : 'Ok'}
                                  </span>
                                </label>
                              </td>
                              {/* Issue Note */}
                              <td className="py-1.5 px-2">
                                {hasIssue ? (
                                  <input
                                    type="text"
                                    value={lineIssues[inv.id]?.issueComment || ''}
                                    onChange={(e) => handleLinePaymentIssueCommentChange(inv.id, e.target.value)}
                                    placeholder="Discrepancy note..."
                                    className="w-full px-1.5 py-0.5 text-xs rounded border border-rose-300 bg-rose-50 text-rose-900 font-medium placeholder-rose-300 focus:bg-white focus:border-rose-500 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">No line issue</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                {isFullySettled ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Full Paid
                                  </span>
                                ) : allocated > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    Partial
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                    Unchanged
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {customerPendingInvoices.length > 0 && (
                <TablePagination
                  currentPage={allocationPage}
                  totalItems={customerPendingInvoices.length}
                  pageSize={allocationPageSize}
                  onPageChange={setAllocationPage}
                  onPageSizeChange={setAllocationPageSize}
                  itemLabel="Invoices"
                />
              )}

              {/* Allocation Summary & Submission */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 pt-4 border-t border-slate-200">
                <div className="lg:col-span-2 space-y-2">
                  <label className="block text-xs font-bold uppercase text-slate-700">
                    Payment Notes & Bank Remittance Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Received via CRDB corporate wire transfer. Reference acknowledged by accounts department."
                    className="w-full text-xs p-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3 text-xs shadow-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Amount Entered:</span>
                    <span className="font-mono font-bold text-slate-900">TZS {formatCurrency(rawEnteredTotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Allocated:</span>
                    <span className="font-mono font-bold text-emerald-700">TZS {formatCurrency(totalAllocatedAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-2.5 text-slate-800">
                    <span>Unallocated Difference:</span>
                    <span className={`font-mono ${unallocatedDifference !== 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      TZS {formatCurrency(unallocatedDifference)}
                    </span>
                  </div>

                  {isFlaggedAsIssue && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Issue flag active: Zero payment amount or zero allocation permitted for later Admin correction.</span>
                    </div>
                  )}

                  <div className="pt-2 flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSavePayment(false)}
                      disabled={!isFlaggedAsIssue && totalAllocatedAmount <= 0}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
                    >
                      <Save className="w-4 h-4" />
                      Save Payment Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePayment(true)}
                      disabled={!isFlaggedAsIssue && totalAllocatedAmount <= 0}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 min-h-[42px]"
                    >
                      <Printer className="w-4 h-4" />
                      Save & Print Receipt
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: PAYMENTS LEDGER */}
      {viewMode === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Payments & Remittances Ledger</h3>
                <p className="text-xs text-slate-500">Historical customer payments, bank deposits, and receipts</p>
              </div>

              <TableExportToolbar
                totalCount={filteredPaymentsLedger.length}
                onExportExcel={handleExportPaymentsExcel}
                onExportPdf={handleExportPaymentsPdf}
              />
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={(e) => {
                  setLedgerSearch(e.target.value);
                  setPaymentsPage(1);
                }}
                placeholder="Search by Receipt #, Customer, PO, or Transaction Ref..."
                className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* DUAL DEVICE VIEW: Mobile Cards for screens < 768px */}
            <div className="block md:hidden space-y-3">
              {filteredPaymentsLedger.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No payment records found.
                </div>
              ) : (
                paginatedPaymentsLedger.map((pay) => (
                  <div key={pay.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono font-bold text-emerald-700 text-sm block">
                          {pay.paymentNumber}
                        </span>
                        <span className="font-bold text-slate-900 text-xs block mt-0.5">
                          {pay.customerName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {pay.paymentDate} • {pay.paymentMethod}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPrintingPayment(pay)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-emerald-200 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                        {canDeleteData(currentUser) && onDeletePayment && (
                          <button
                            type="button"
                            onClick={() => setPaymentPendingDelete(pay)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg border border-red-200 transition-colors cursor-pointer"
                            title="Permanently Delete Payment (ADM Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">PO: {pay.poNumber}</span>
                      <span className="font-mono font-bold text-emerald-800 text-sm">
                        TZS {formatCurrency(pay.amountPaid)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* DUAL DEVICE VIEW: Desktop Table for screens >= 768px */}
            <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-[620px] scrollbar-thin">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-xs">
                    <tr>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="Receipt #"
                          field="paymentNumber"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.paymentNumber}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="Payment Date"
                          field="paymentDate"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.paymentDate}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="Customer"
                          field="customerName"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.customerName}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="PO Ref"
                          field="poNumber"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.poNumber}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="Method"
                          field="paymentMethod"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.paymentMethod}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900">
                        <TableColumnHeader
                          label="Ref / Check #"
                          field="referenceNumber"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.referenceNumber}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900 text-right">
                        <TableColumnHeader
                          label="Amount Paid"
                          field="amountPaid"
                          align="right"
                          sortConfig={paymentSort}
                          onSort={handlePaymentSort}
                          filterValue={paymentFilters.amountPaid}
                          onFilterChange={handlePaymentFilterChange}
                        />
                      </th>
                      <th className="py-1.5 px-2.5 sticky top-0 bg-slate-900 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedAndFilteredPaymentsLedger.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No payments found in ledger.
                        </td>
                      </tr>
                    ) : (
                      paginatedPaymentsLedger.map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-1.5 px-2.5 font-mono font-bold text-emerald-700">{pay.paymentNumber}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{pay.paymentDate}</td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-900">{pay.customerName}</td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-700">{pay.poNumber}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{pay.paymentMethod}</td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-600">{pay.referenceNumber}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-800">
                            TZS {formatCurrency(pay.amountPaid)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setPrintingPayment(pay)}
                                className="p-1 text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                title="Print Official Payment Receipt"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {canDeleteData(currentUser) && onDeletePayment && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentPendingDelete(pay)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                  title="Permanently Delete Payment (ADM Only)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={paymentsPage}
                totalItems={sortedAndFilteredPaymentsLedger.length}
                pageSize={paymentsPageSize}
                onPageChange={setPaymentsPage}
                onPageSizeChange={setPaymentsPageSize}
                itemLabel="Payments"
              />
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <PaymentReceiptModal
        payment={printingPayment}
        onClose={() => setPrintingPayment(null)}
      />

      {/* Permanent Delete Modal for Admin Deleting Payment Transaction */}
      <PermanentDeleteModal
        isOpen={!!paymentPendingDelete}
        onClose={() => setPaymentPendingDelete(null)}
        onConfirm={() => {
          if (paymentPendingDelete && onDeletePayment) {
            onDeletePayment(paymentPendingDelete.id);
            setPaymentPendingDelete(null);
          }
        }}
        transactionType="PAYMENT"
        referenceNumber={paymentPendingDelete?.paymentNumber || ''}
        customerName={paymentPendingDelete?.customerName}
        poNumber={paymentPendingDelete?.poNumber}
        totalAmount={paymentPendingDelete?.amountPaid}
        details="Permanently removes payment record from database. Invoice payment balances will be restored accordingly."
      />
    </div>
  );
};
