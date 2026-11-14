import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Trash2,
  X,
  ChevronDown,
  Layers,
  Check,
  Hash,
  ArrowRight
} from 'lucide-react';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { canDeleteData } from '../utils/authService';
import { naturalCompare } from '../utils/naturalSort';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { getEffectiveInvoiceTotals } from './InvoiceHistory';

interface PaymentsManagerProps {
  payments?: PaymentRecord[];
  invoices?: InvoiceRecord[];
  poGroups?: PurchaseOrderGroup[];
  onSavePayment: (payment: PaymentRecord, updatedInvoices: InvoiceRecord[]) => void;
  onDeletePayment?: (paymentId: string) => void;
  currentUser?: AppUser;
}

// ---------------------------------------------------------------------------
// Bulk Payment Row Model
// ---------------------------------------------------------------------------
export interface BulkPaymentRow {
  rowId: string;
  isAdvance?: boolean;       // User ticked Advance (invoice not yet in system)
  customerName: string;
  customerSearchText: string;
  isCustomerDropdownOpen: boolean;
  invoiceId: string;
  invoiceNumber: string;
  invoiceSearchText: string;
  isInvoiceDropdownOpen: boolean;
  poNumber: string;
  invoiceAmount: number;     // Gross invoice amount to settle
  withholdTax: number;       // WHT
  vatWithholding: number;    // VAT Withholding
  netAmount: number;         // invoiceAmount - withholdTax - vatWithholding
  pendingAmount: number;     // Remaining unpaid balance on invoice before this payment
  originalAmount: number;    // Original gross invoice total
}

// ---------------------------------------------------------------------------
// Formatted Currency Input (Thousand separator & 2 decimal points)
// ---------------------------------------------------------------------------
interface FormattedNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState<string>(() => {
    if (value !== 0) {
      return formatCurrency(value);
    }
    return '';
  });

  useEffect(() => {
    if (!isFocused) {
      if (value !== 0) {
        setText(formatCurrency(value));
      } else {
        setText('');
      }
    }
  }, [value, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (value !== 0) {
      setText(value.toString());
    } else {
      setText('');
    }
    e.target.select();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setText(rawVal);
    if (rawVal.trim() === '-' || rawVal.trim() === '') {
      onChange(0);
      return;
    }
    const cleaned = rawVal.replace(/,/g, '');
    const num = parseFloat(cleaned);
    onChange(isNaN(num) ? 0 : Math.round(num * 100) / 100);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const cleaned = text.replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num !== 0) {
      const rounded = Math.round(num * 100) / 100;
      setText(formatCurrency(rounded));
      onChange(rounded);
    } else {
      setText('');
      onChange(0);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={isFocused ? text : (value !== 0 ? formatCurrency(value) : text)}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};

function createEmptyRow(defaultCustomer: string = '', isAdvance: boolean = false): BulkPaymentRow {
  return {
    rowId: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    isAdvance,
    customerName: defaultCustomer,
    customerSearchText: defaultCustomer,
    isCustomerDropdownOpen: false,
    invoiceId: '',
    invoiceNumber: '',
    invoiceSearchText: '',
    isInvoiceDropdownOpen: false,
    poNumber: isAdvance ? 'ADVANCE' : '',
    invoiceAmount: 0,
    withholdTax: 0,
    vatWithholding: 0,
    netAmount: 0,
    pendingAmount: 0,
    originalAmount: 0,
  };
}

// ---------------------------------------------------------------------------
// Allocate / Edit Advance Payment Modal
// ---------------------------------------------------------------------------
interface AllocateAdvanceModalProps {
  record: any;
  invoices: InvoiceRecord[];
  allCustomers: string[];
  onConfirmAllocation: (
    record: any,
    targetInvoice: InvoiceRecord,
    allocatedAmt: number,
    updatedCustomerName?: string,
    updatedManualInv?: string
  ) => void;
  onUpdateInfoOnly: (
    record: any,
    newCustomerName: string,
    newManualInv: string
  ) => void;
  onClose: () => void;
}

export const AllocateAdvanceModal: React.FC<AllocateAdvanceModalProps> = ({
  record,
  invoices,
  allCustomers,
  onConfirmAllocation,
  onUpdateInfoOnly,
  onClose,
}) => {
  const [customerName, setCustomerName] = useState<string>(record.customerName || '');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState<string>(
    record.originalManualInvoiceNumber || record.invoiceNumber || ''
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [allocatedAmount, setAllocatedAmount] = useState<number>(record.invoiceAmount || 0);
  const [invoiceSearch, setInvoiceSearch] = useState<string>('');

  // Find all pending (unsettled) invoices for this customer
  const pendingInvoices = useMemo(() => {
    const cName = customerName.trim().toLowerCase();
    return (invoices || [])
      .filter((inv) => {
        if (inv.status === 'CANCELLED') return false;
        const matchCust = (inv.customerName || '').trim().toLowerCase() === cName;
        if (!matchCust) return false;
        const total = getEffectiveInvoiceTotals(inv).total;
        const paid = inv.paidAmount || 0;
        const bal = Math.max(0, Math.round((total - paid) * 100) / 100);
        return bal > 0.01;
      })
      .sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
  }, [invoices, customerName]);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return pendingInvoices;
    const q = invoiceSearch.toLowerCase().trim();
    return pendingInvoices.filter(
      (i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.poNumber || '').toLowerCase().includes(q) ||
        (i.destination || '').toLowerCase().includes(q)
    );
  }, [pendingInvoices, invoiceSearch]);

  const selectedInvoice = useMemo(() => {
    return pendingInvoices.find((i) => i.id === selectedInvoiceId);
  }, [pendingInvoices, selectedInvoiceId]);

  const invTotal = selectedInvoice ? getEffectiveInvoiceTotals(selectedInvoice).total : 0;
  const invPaid = selectedInvoice ? selectedInvoice.paidAmount || 0 : 0;
  const invBal = Math.max(0, Math.round((invTotal - invPaid) * 100) / 100);
  const newBal = Math.max(0, Math.round((invBal - allocatedAmount) * 100) / 100);
  const isFullySettled = newBal <= 0.01;

  const handleSelectInvoice = (inv: InvoiceRecord) => {
    setSelectedInvoiceId(inv.id);
    const total = getEffectiveInvoiceTotals(inv).total;
    const paid = inv.paidAmount || 0;
    const bal = Math.max(0, Math.round((total - paid) * 100) / 100);
    // Default allocated amount to min of advance invoice amount and invoice pending balance
    setAllocatedAmount(Math.min(record.invoiceAmount, bal));
  };

  const handleConfirm = () => {
    if (!selectedInvoice) return;
    onConfirmAllocation(
      record,
      selectedInvoice,
      allocatedAmount,
      customerName,
      manualInvoiceNumber
    );
  };

  const handleSaveInfoOnly = () => {
    onUpdateInfoOnly(record, customerName, manualInvoiceNumber);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Edit &amp; Allocate Advance Payment
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {record.advanceStatus === 'ALLOCATED' ? 'Allocated' : 'Pending Allocation'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Voucher: <span className="font-mono font-bold text-amber-300">{record.paymentNumber}</span> • Ref:{' '}
                <span className="font-mono text-slate-200">{record.referenceNumber}</span> • Date: {record.paymentDate}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Payment Snapshot Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Advance Gross Settled
              </span>
              <span className="font-mono font-black text-slate-900 text-sm block mt-0.5">
                TZS {formatCurrency(record.invoiceAmount)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                WHT Deducted (2%)
              </span>
              <span className="font-mono font-bold text-amber-800 text-sm block mt-0.5">
                TZS {formatCurrency(record.withholdingTax)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                VAT WHT (2%)
              </span>
              <span className="font-mono font-bold text-blue-800 text-sm block mt-0.5">
                TZS {formatCurrency(record.vatWithholdingTax)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                Net Cash Received
              </span>
              <span className="font-mono font-black text-emerald-800 text-sm block mt-0.5">
                TZS {formatCurrency(record.netAmount)}
              </span>
            </div>
          </div>

          {/* Section 1: Edit Customer & Manual Invoice Details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Building2 className="w-4 h-4 text-slate-600" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                1. Customer &amp; Manual Advance Reference
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Customer Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter Customer Name..."
                    className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                  {allCustomers.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 overflow-x-auto text-[10px] text-slate-500">
                      <span>Quick picks:</span>
                      {allCustomers.slice(0, 3).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCustomerName(c)}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer font-medium"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Manual Invoice Number Recorded
                </label>
                <input
                  type="text"
                  value={manualInvoiceNumber}
                  onChange={(e) => setManualInvoiceNumber(e.target.value)}
                  placeholder="e.g. ADV-INV-9901"
                  className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Allocate to Official System Invoice */}
          <div className="bg-amber-50/40 rounded-2xl border border-amber-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-700" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-amber-900">
                  2. Select Official System Invoice to Allocate To
                </h4>
              </div>
              <span className="text-[11px] font-bold text-amber-800">
                {pendingInvoices.length} outstanding invoice(s) for {customerName || 'customer'}
              </span>
            </div>

            <p className="text-[11px] text-slate-600">
              When the official invoice is registered in the Invoice Registry, select it below to link this advance payment,
              settle the balance, and move it to a standard payment record.
            </p>

            {/* Invoice Search inside customer */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Filter by invoice #, PO #, destination..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* List of Pending Invoices */}
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
              {filteredInvoices.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  <p className="font-bold text-slate-700">No pending invoices found for "{customerName}"</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Once an invoice is created for this customer, it will appear here for allocation.
                  </p>
                </div>
              ) : (
                filteredInvoices.map((inv) => {
                  const total = getEffectiveInvoiceTotals(inv).total;
                  const paid = inv.paidAmount || 0;
                  const bal = Math.max(0, Math.round((total - paid) * 100) / 100);
                  const isSelected = selectedInvoiceId === inv.id;

                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => handleSelectInvoice(inv)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-amber-100/70 border-l-4 border-amber-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-blue-900 text-xs">
                            {inv.invoiceNumber}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            PO: {inv.poNumber || '—'}
                          </span>
                          <span className="text-[10px] text-slate-400">{inv.invoiceDate}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-md">
                          Total: TZS {formatCurrency(total)} • Already Paid: TZS {formatCurrency(paid)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-500 block">Outstanding</span>
                        <span className="font-mono font-black text-amber-800 text-xs block">
                          TZS {formatCurrency(bal)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Invoice Allocation Preview */}
            {selectedInvoice && (
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-300 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-xs text-emerald-950">
                      Target Invoice Selected: {selectedInvoice.invoiceNumber}
                    </span>
                  </div>
                  {isFullySettled ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900">
                      Will be Fully Settled (100%)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                      Partially Settled
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-emerald-200/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Total Due:</span>
                    <strong className="font-mono text-slate-900">TZS {formatCurrency(invTotal)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Current Balance:</span>
                    <strong className="font-mono text-amber-800">TZS {formatCurrency(invBal)}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-700 block font-bold">This Allocation:</span>
                    <strong className="font-mono text-emerald-800 font-black">
                      TZS {formatCurrency(allocatedAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">New Balance:</span>
                    <strong className="font-mono text-slate-900">TZS {formatCurrency(newBal)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveInfoOnly}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              title="Update customer name and manual invoice # only without linking to an invoice"
            >
              Save Details Only
            </button>

            <button
              type="button"
              disabled={!selectedInvoice}
              onClick={handleConfirm}
              className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition-all shadow-sm ${
                selectedInvoice
                  ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>Confirm Allocation &amp; Link Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PaymentsManager: React.FC<PaymentsManagerProps> = ({
  payments = [],
  invoices = [],
  poGroups = [],
  onSavePayment,
  onDeletePayment,
  currentUser,
}) => {
  const [viewMode, setViewMode] = useState<'record' | 'ledger' | 'advance'>('record');

  // =========================================================================
  // BATCH PAYMENT HEADER FIELDS (User Request: ID, Batch No, Ref, Total, Date)
  // =========================================================================
  const [paymentId, setPaymentId] = useState<string>(() => {
    const yr = new Date().getFullYear();
    const seq = String(payments.length + 1).padStart(4, '0');
    return `PV-${yr}-${seq}`;
  });

  const [batchNo, setBatchNo] = useState<string>(() => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `BATCH-${dateStr}-01`;
  });

  const [paymentReference, setPaymentReference] = useState<string>(() => {
    return `TXN-${Date.now().toString().slice(-6)}`;
  });

  const [totalBatchAmount, setTotalBatchAmount] = useState<string>('');
  const [isTotalManuallyEdited, setIsTotalManuallyEdited] = useState<boolean>(false);
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Multi-Select Invoice Picker Modal State
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState<boolean>(false);
  const [multiSelectCustomerFilter, setMultiSelectCustomerFilter] = useState<string>('ALL');
  const [multiSelectSearchQuery, setMultiSelectSearchQuery] = useState<string>('');
  const [selectedBatchInvoiceIds, setSelectedBatchInvoiceIds] = useState<string[]>([]);

  // Additional payment attributes
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [depositAccount, setDepositAccount] = useState<string>('CRDB Corporate Account - 0150244900');
  const [batchNotes, setBatchNotes] = useState<string>('');

  // =========================================================================
  // BULK ALLOCATION ROWS STATE
  // =========================================================================
  const [paymentRows, setPaymentRows] = useState<BulkPaymentRow[]>(() => [createEmptyRow()]);

  // Payment Issue Tracking State
  const [hasPaymentIssue, setHasPaymentIssue] = useState<boolean>(false);
  const [paymentIssueComment, setPaymentIssueComment] = useState<string>('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPayment, setSuccessPayment] = useState<PaymentRecord | null>(null);
  const [printingPayment, setPrintingPayment] = useState<PaymentRecord | null>(null);

  // Ledger Search
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // =========================================================================
  // OUTSTANDING / PENDING INVOICES CACHE
  // CRITICAL REQUIREMENT:
  // "show only outstanding invoice on selection"
  // "if the invocie is full paid ( do not show in the list to select for paymet)"
  // =========================================================================
  const pendingInvoicesList = useMemo(() => {
    return (invoices || [])
      .filter((inv) => {
        if (inv.status === 'CANCELLED') return false;
        const total = getEffectiveInvoiceTotals(inv).total;
        const paid = inv.paidAmount || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        // Exclude fully paid invoices (only show pending invoices where balance > 0)
        return balance > 0.01;
      })
      .map((inv) => {
        const total = getEffectiveInvoiceTotals(inv).total;
        const paid = inv.paidAmount || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: (inv.customerName || 'General Customer').trim(),
          poNumber: inv.poNumber || '—',
          invoiceDate: inv.invoiceDate || '—',
          originalAmount: total,
          paidAmount: paid,
          pendingAmount: balance,
          rawInvoice: inv,
        };
      })
      .sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
  }, [invoices]);

  // Unique list of customers who currently have outstanding invoices
  const customerListWithOutstanding = useMemo(() => {
    const custMap = new Map<string, { count: number; totalPending: number }>();
    pendingInvoicesList.forEach((inv) => {
      const c = inv.customerName;
      const ex = custMap.get(c) || { count: 0, totalPending: 0 };
      custMap.set(c, {
        count: ex.count + 1,
        totalPending: Math.round((ex.totalPending + inv.pendingAmount) * 100) / 100,
      });
    });

    return Array.from(custMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => naturalCompare(a.name, b.name));
  }, [pendingInvoicesList]);

  // All known customers across all entities and documents (for Advance payment selection)
  const allKnownCustomers = useMemo(() => {
    const set = new Set<string>();
    (invoices || []).forEach((i) => i.customerName && set.add(i.customerName.trim()));
    (payments || []).forEach((p) => p.customerName && set.add(p.customerName.trim()));
    (poGroups || []).forEach((g) => g.customerName && set.add(g.customerName.trim()));
    return Array.from(set).sort(naturalCompare);
  }, [invoices, payments, poGroups]);

  // =========================================================================
  // ADVANCE PAYMENT RECORDS (Tab 3)
  // =========================================================================
  const allAdvanceRecords = useMemo(() => {
    interface AdvView {
      paymentId: string;
      paymentNumber: string;
      batchNumber?: string;
      paymentDate: string;
      referenceNumber: string;
      paymentMethod: string;
      depositAccount?: string;
      allocationIndex: number;
      allocation: PaymentAllocationItem;
      customerName: string;
      invoiceNumber: string;
      originalManualInvoiceNumber: string;
      invoiceAmount: number;
      withholdingTax: number;
      vatWithholdingTax: number;
      netAmount: number;
      advanceStatus: 'PENDING_ALLOCATION' | 'ALLOCATED';
      allocatedAt?: string;
      allocatedBy?: string;
      rawPayment: PaymentRecord;
    }

    const list: AdvView[] = [];
    (payments || []).forEach((p) => {
      (p.allocations || []).forEach((a, idx) => {
        if (a.isAdvance || a.advanceStatus) {
          list.push({
            paymentId: p.id,
            paymentNumber: p.paymentNumber,
            batchNumber: p.batchNumber,
            paymentDate: p.paymentDate,
            referenceNumber: p.referenceNumber,
            paymentMethod: p.paymentMethod,
            depositAccount: p.depositAccount,
            allocationIndex: idx,
            allocation: a,
            customerName: a.customerName || p.customerName,
            invoiceNumber: a.invoiceNumber,
            originalManualInvoiceNumber: a.originalManualInvoiceNumber || a.invoiceNumber,
            invoiceAmount: a.allocatedAmount,
            withholdingTax: a.withholdingTax || 0,
            vatWithholdingTax: a.vatWithholdingTax || 0,
            netAmount: a.netAmount || (a.allocatedAmount - (a.withholdingTax || 0) - (a.vatWithholdingTax || 0)),
            advanceStatus: a.advanceStatus || (a.isAdvance ? 'PENDING_ALLOCATION' : 'ALLOCATED'),
            allocatedAt: a.allocatedAt,
            allocatedBy: a.allocatedBy,
            rawPayment: p,
          });
        }
      });
    });
    return list.sort((a, b) => naturalCompare(b.paymentDate, a.paymentDate));
  }, [payments]);

  const pendingAdvanceCount = useMemo(() => {
    return allAdvanceRecords.filter((r) => r.advanceStatus === 'PENDING_ALLOCATION').length;
  }, [allAdvanceRecords]);

  // Selected Advance Record for Editing / Allocation Modal
  const [selectedAdvanceRecordForEdit, setSelectedAdvanceRecordForEdit] = useState<any | null>(null);
  const [advanceTableSearch, setAdvanceTableSearch] = useState<string>('');
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState<'ALL' | 'PENDING' | 'ALLOCATED'>('ALL');

  // Overall Financial Stats for Top Metric Cards
  const stats = useMemo(() => {
    const safePayments = payments || [];
    const safeInvoices = invoices || [];
    const totalCollected = safePayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const totalInvoiced = safeInvoices.reduce((sum, inv) => sum + getEffectiveInvoiceTotals(inv).total, 0);
    const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);
    const fullyPaidInvoicesCount = safeInvoices.filter((inv) => {
      const invTot = getEffectiveInvoiceTotals(inv).total;
      return (inv.paidAmount || 0) >= invTot && invTot > 0;
    }).length;
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

  // =========================================================================
  // ROW CALCULATIONS & TOTALS
  // =========================================================================
  const rowTotals = useMemo(() => {
    let gross = 0;
    let wht = 0;
    let vatWht = 0;
    let net = 0;
    let validLinesCount = 0;

    paymentRows.forEach((r) => {
      // Allow both positive and negative (-ve) payment amounts, with or without a specific invoice allocated
      const isValid = r.invoiceAmount !== 0;

      if (isValid) {
        gross += r.invoiceAmount;
        wht += r.withholdTax;
        vatWht += r.vatWithholding;
        net += r.netAmount;
        validLinesCount += 1;
      }
    });

    const parsedBatchTotal = parseFloat(String(totalBatchAmount).replace(/,/g, '')) || 0;
    const variance = Math.round((parsedBatchTotal - net) * 100) / 100;

    return {
      totalGross: Math.round(gross * 100) / 100,
      totalWht: Math.round(wht * 100) / 100,
      totalVatWht: Math.round(vatWht * 100) / 100,
      totalNet: Math.round(net * 100) / 100,
      parsedBatchTotal,
      variance,
      isBalanced: parsedBatchTotal !== 0 && Math.abs(variance) < 0.01,
      validLinesCount,
    };
  }, [paymentRows, totalBatchAmount]);

  // Auto-calculate Header Total Amount from net allocations unless manually overridden
  useEffect(() => {
    if (!isTotalManuallyEdited) {
      setTotalBatchAmount(rowTotals.totalNet !== 0 ? String(rowTotals.totalNet) : '');
    }
  }, [rowTotals.totalNet, isTotalManuallyEdited]);

  // =========================================================================
  // ROW MUTATION HANDLERS
  // =========================================================================

  // Update a field on a specific row
  const updateRow = (rowId: string, updates: Partial<BulkPaymentRow>) => {
    setPaymentRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const merged = { ...r, ...updates };

        // For advance row: originalAmount and pendingAmount automatically match invoiceAmount
        if (merged.isAdvance) {
          if (updates.invoiceAmount !== undefined) {
            merged.originalAmount = merged.invoiceAmount;
            merged.pendingAmount = merged.invoiceAmount;
          }
        }

        // If invoiceAmount changed and taxes were not explicitly provided, maintain default 2% for positive amounts, 0 for negative deductions
        if (updates.invoiceAmount !== undefined && updates.withholdTax === undefined && updates.vatWithholding === undefined) {
          const newGross = Number(merged.invoiceAmount) || 0;
          if (newGross > 0) {
            const grossExVat = newGross / 1.18;
            // Always keep default 2% for both WHT and VAT Withholding on positive invoice amounts
            merged.withholdTax = Math.round(grossExVat * 0.02 * 100) / 100;
            merged.vatWithholding = Math.round((grossExVat * 0.18) * 0.02 * 100) / 100;
          } else {
            merged.withholdTax = 0;
            merged.vatWithholding = 0;
          }
        }

        // Auto-recalculate Net Amount: invoiceAmount - withholdTax - vatWithholding (allow negative netAmount for -ve payment deductions)
        const gross = Number(merged.invoiceAmount) || 0;
        const w = Number(merged.withholdTax) || 0;
        const vw = Number(merged.vatWithholding) || 0;
        merged.netAmount = Math.round((gross - w - vw) * 100) / 100;

        return merged;
      })
    );
  };

  // Select customer for a row
  const handleSelectCustomerForRow = (rowId: string, customerName: string) => {
    setPaymentRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        // If customer changed, reset the invoice selection on this row
        const isSame = r.customerName === customerName;
        return {
          ...r,
          customerName,
          customerSearchText: customerName,
          isCustomerDropdownOpen: false,
          invoiceId: isSame ? r.invoiceId : '',
          invoiceNumber: isSame ? r.invoiceNumber : '',
          invoiceSearchText: isSame ? r.invoiceSearchText : '',
          isInvoiceDropdownOpen: false,
          poNumber: isSame ? r.poNumber : '',
          invoiceAmount: isSame ? r.invoiceAmount : 0,
          withholdTax: isSame ? r.withholdTax : 0,
          vatWithholding: isSame ? r.vatWithholding : 0,
          netAmount: isSame ? r.netAmount : 0,
          pendingAmount: isSame ? r.pendingAmount : 0,
          originalAmount: isSame ? r.originalAmount : 0,
        };
      })
    );
  };

  // Select invoice for a row
  // CRITICAL REQUIREMENT:
  // "when invoice number selected return customer name"
  // "when record invoice no open the second line to recon the second traansction with default the same customer name on previous line"
  const handleSelectInvoiceForRow = (rowId: string, invoiceItem: typeof pendingInvoicesList[0]) => {
    let nextRowsState: BulkPaymentRow[] = [];

    setPaymentRows((prev) => {
      const rowIndex = prev.findIndex((r) => r.rowId === rowId);
      if (rowIndex === -1) return prev;

      const currentRow = prev[rowIndex];
      const invPending = invoiceItem.pendingAmount;
      const invOriginal = invoiceItem.originalAmount;

      const updatedRow: BulkPaymentRow = {
        ...currentRow,
        // Auto-populate customer name from invoice
        customerName: invoiceItem.customerName,
        customerSearchText: invoiceItem.customerName,
        isCustomerDropdownOpen: false,
        // Invoice details
        invoiceId: invoiceItem.id,
        invoiceNumber: invoiceItem.invoiceNumber,
        invoiceSearchText: invoiceItem.invoiceNumber,
        isInvoiceDropdownOpen: false,
        poNumber: invoiceItem.poNumber,
        // Amounts: Always keep default 2% for both WHT and VAT Withholding on selection
        originalAmount: invOriginal,
        pendingAmount: invPending,
        invoiceAmount: invPending, // default gross invoice amount to pending balance
        withholdTax: Math.round((invPending / 1.18) * 0.02 * 100) / 100, // default 2% WHT on gross before VAT
        vatWithholding: Math.round(((invPending / 1.18) * 0.18) * 0.02 * 100) / 100, // default 2% of VAT
        netAmount: Math.max(
          0,
          Math.round(
            (invPending -
              Math.round((invPending / 1.18) * 0.02 * 100) / 100 -
              Math.round(((invPending / 1.18) * 0.18) * 0.02 * 100) / 100) *
              100
          ) / 100
        ),
      };

      const newRows = [...prev];
      newRows[rowIndex] = updatedRow;

      // CRITICAL: If this is the last line in the table, automatically open the next line
      // with default the same customer name on previous line!
      if (rowIndex === prev.length - 1) {
        newRows.push(createEmptyRow(invoiceItem.customerName));
      }

      nextRowsState = newRows;
      return newRows;
    });
  };

  // Quick WHT Helper: Gross amount before VAT = (invoiceAmount / 1.18), multiplied by selected % (0%, 2% default, or 5%)
  const handleApplyQuickWHT = (rowId: string, percentage: number = 0.02) => {
    const row = paymentRows.find((r) => r.rowId === rowId);
    if (!row) return;
    const baseAmt = row.invoiceAmount !== 0 ? row.invoiceAmount : row.originalAmount;
    if (baseAmt === 0 && percentage > 0) return;
    if (percentage === 0) {
      updateRow(rowId, { withholdTax: 0 });
      return;
    }
    // Gross amount before VAT: invoice / 1.18
    const grossBeforeVat = baseAmt / 1.18;
    const whtVal = Math.round(grossBeforeVat * percentage * 100) / 100;
    updateRow(rowId, { withholdTax: whtVal });
  };

  // Quick VAT WHT Helper: VAT amount = (invoiceAmount / 1.18) * 0.18, then default 2% of VAT
  const handleApplyQuickVatWHT = (rowId: string, percentage: number = 0.02) => {
    const row = paymentRows.find((r) => r.rowId === rowId);
    if (!row) return;
    const baseAmt = row.invoiceAmount !== 0 ? row.invoiceAmount : row.originalAmount;
    if (baseAmt === 0 && percentage > 0) return;
    if (percentage === 0) {
      updateRow(rowId, { vatWithholding: 0 });
      return;
    }
    // VAT amount of invoice = (invoice / 1.18) * 0.18
    const vatAmount = (baseAmt / 1.18) * 0.18;
    const vatWhtVal = Math.round(vatAmount * percentage * 100) / 100;
    updateRow(rowId, { vatWithholding: vatWhtVal });
  };

  // Add line manually
  const handleAddLine = () => {
    const lastRow = paymentRows[paymentRows.length - 1];
    const defaultCust = lastRow ? lastRow.customerName : '';
    setPaymentRows((prev) => [...prev, createEmptyRow(defaultCust)]);
  };

  // Remove line
  const handleRemoveLine = (rowId: string) => {
    setPaymentRows((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRow()];
      }
      return prev.filter((r) => r.rowId !== rowId);
    });
  };

  // Clear all lines
  const handleClearAllLines = () => {
    setPaymentRows([createEmptyRow()]);
    setIsTotalManuallyEdited(false);
    setTotalBatchAmount('');
    setErrorMessage(null);
  };

  // Add multiple selected invoices from the Multi-Select Picker Modal
  const handleAddMultipleSelectedInvoices = () => {
    if (selectedBatchInvoiceIds.length === 0) {
      setIsMultiSelectOpen(false);
      return;
    }

    const selectedItems = pendingInvoicesList.filter((item) =>
      selectedBatchInvoiceIds.includes(item.id)
    );

    if (selectedItems.length === 0) {
      setIsMultiSelectOpen(false);
      return;
    }

    setPaymentRows((prev) => {
      // Keep existing populated rows (either valid regular rows or advance rows with data)
      const existingPopulated = prev.filter((r) =>
        r.isAdvance
          ? Boolean(r.customerName.trim() || r.invoiceNumber.trim() || r.invoiceAmount !== 0)
          : Boolean(r.invoiceId || r.invoiceNumber.trim() || r.invoiceAmount !== 0)
      );

      const existingInvoiceIds = new Set(existingPopulated.map((r) => r.invoiceId).filter(Boolean));
      const newRowsFromSelection: BulkPaymentRow[] = [];

      selectedItems.forEach((invoiceItem) => {
        if (existingInvoiceIds.has(invoiceItem.id)) return;
        const invPending = invoiceItem.pendingAmount;
        const invOriginal = invoiceItem.originalAmount;
        const wht = Math.round((invPending / 1.18) * 0.02 * 100) / 100;
        const vatWht = Math.round(((invPending / 1.18) * 0.18) * 0.02 * 100) / 100;
        const net = Math.max(0, Math.round((invPending - wht - vatWht) * 100) / 100);

        newRowsFromSelection.push({
          rowId: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          isAdvance: false,
          customerName: invoiceItem.customerName,
          customerSearchText: invoiceItem.customerName,
          isCustomerDropdownOpen: false,
          invoiceId: invoiceItem.id,
          invoiceNumber: invoiceItem.invoiceNumber,
          invoiceSearchText: invoiceItem.invoiceNumber,
          isInvoiceDropdownOpen: false,
          poNumber: invoiceItem.poNumber,
          originalAmount: invOriginal,
          pendingAmount: invPending,
          invoiceAmount: invPending,
          withholdTax: wht,
          vatWithholding: vatWht,
          netAmount: net,
        });
      });

      const combined = [...existingPopulated, ...newRowsFromSelection];
      const lastCustomer =
        combined.length > 0 ? combined[combined.length - 1].customerName : '';
      return [...combined, createEmptyRow(lastCustomer)];
    });

    // Reset manual override so header total auto-calculates to the new batch sum
    setIsTotalManuallyEdited(false);
    setSelectedBatchInvoiceIds([]);
    setIsMultiSelectOpen(false);
    setErrorMessage(null);
  };

  // Save Bulk Payment
  const handleSaveBulkPayment = (andPrint: boolean = false) => {
    setErrorMessage(null);

    const validRows = paymentRows.filter((r) => r.invoiceAmount !== 0);
    const headerTotal = parseFloat(String(totalBatchAmount).replace(/,/g, '')) || 0;

    if (validRows.length === 0 && headerTotal === 0) {
      setErrorMessage('Please enter at least one payment line (positive or negative amount) or a Total Amount.');
      return;
    }

    if (!paymentReference.trim()) {
      setErrorMessage('Please enter a Payment Reference (e.g. Bank Slip, Cheque #, or EFT Ref).');
      return;
    }

    // Prepare updated invoices and allocation records
    const updatedInvoicesMap = new Map<string, InvoiceRecord>();
    const allocationItems: PaymentAllocationItem[] = [];

    // Distinct customer names in this batch
    const distinctCustomers: string[] = Array.from(
      new Set<string>(
        validRows
          .map((r) => (r.customerName || r.customerSearchText || '').trim())
          .filter(Boolean)
      )
    );
    const primaryCustomer: string =
      distinctCustomers.length === 1
        ? distinctCustomers[0]
        : distinctCustomers.length > 1
        ? `Multiple (${distinctCustomers.length} Customers)`
        : 'General Customer';

    validRows.forEach((r) => {
      const targetInv = !r.isAdvance && (r.invoiceId || r.invoiceNumber.trim())
        ? invoices.find(
            (inv) =>
              (r.invoiceId && inv.id === r.invoiceId) ||
              (r.invoiceNumber.trim() && inv.invoiceNumber.toLowerCase() === r.invoiceNumber.trim().toLowerCase())
          )
        : undefined;

      // 1. Advance Payment Row OR Unallocated / Negative (-ve) Payment Row without a matched system invoice
      if (r.isAdvance || !targetInv) {
        const advAllocId = `adv-alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const resolvedInvNo =
          r.invoiceNumber.trim() ||
          r.invoiceSearchText.trim() ||
          (r.invoiceAmount < 0 ? 'OVERPAYMENT-DEDUCTION' : 'UNALLOCATED-PAYMENT');
        const resolvedCust =
          (r.customerName || r.customerSearchText || '').trim() || primaryCustomer;

        allocationItems.push({
          invoiceId: advAllocId,
          invoiceNumber: resolvedInvNo,
          poNumber: r.poNumber || (r.invoiceAmount < 0 ? 'DEDUCTION' : 'ADVANCE'),
          customerName: resolvedCust,
          invoiceTotal: r.invoiceAmount,
          alreadyPaid: 0,
          pendingBalance: 0,
          allocatedAmount: r.invoiceAmount,
          withholdingTax: r.withholdTax,
          vatWithholdingTax: r.vatWithholding,
          netAmount: r.netAmount,
          originalAmount: r.invoiceAmount,
          isAdvance: true,
          advanceStatus: 'PENDING_ALLOCATION',
          originalManualInvoiceNumber: resolvedInvNo,
          hasIssue: true,
          issueComment:
            r.invoiceAmount < 0
              ? `Negative (-ve) payment deduction of TZS ${formatCurrency(r.invoiceAmount)} (overpayment adjustment / unallocated)`
              : `Unallocated / Advance payment of TZS ${formatCurrency(r.invoiceAmount)} pending invoice allocation`,
        });
        return;
      }

      // 2. Standard Invoice Row: Settle existing system invoice
      const prevPaid = targetInv.paidAmount || 0;
      const newPaidTotal = Math.round((prevPaid + r.invoiceAmount) * 100) / 100;
      const totalDue = getEffectiveInvoiceTotals(targetInv).total;
      const isSettled = newPaidTotal >= totalDue - 0.01;

      allocationItems.push({
        invoiceId: targetInv.id,
        invoiceNumber: targetInv.invoiceNumber,
        poNumber: targetInv.poNumber || '—',
        customerName: targetInv.customerName,
        invoiceTotal: totalDue,
        alreadyPaid: prevPaid,
        pendingBalance: Math.max(0, totalDue - prevPaid),
        allocatedAmount: r.invoiceAmount,
        withholdingTax: r.withholdTax,
        vatWithholdingTax: r.vatWithholding,
        netAmount: r.netAmount,
        originalAmount: r.originalAmount,
        isAdvance: false,
      });

      updatedInvoicesMap.set(targetInv.id, {
        ...targetInv,
        paidAmount: newPaidTotal,
        paymentStatus: isSettled ? 'PAID' : newPaidTotal > 0 ? 'PARTIAL' : 'UNPAID',
      });
    });

    // If Header Total Amount was manually entered and differs from the sum of rows (variance !== 0),
    // automatically record the unallocated difference as an Advance / Unallocated allocation item
    // so the full payment voucher figure is recorded and tracked on Advance Issue!
    if (isTotalManuallyEdited && headerTotal !== 0 && Math.abs(rowTotals.variance) >= 0.01) {
      const diff = rowTotals.variance;
      const unallocId = `adv-unalloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const unallocRef = diff < 0 ? 'OVERPAYMENT-DEDUCTION' : 'UNALLOCATED-VOUCHER-BAL';
      allocationItems.push({
        invoiceId: unallocId,
        invoiceNumber: unallocRef,
        poNumber: diff < 0 ? 'DEDUCTION' : 'ADVANCE',
        customerName: primaryCustomer,
        invoiceTotal: diff,
        alreadyPaid: 0,
        pendingBalance: 0,
        allocatedAmount: diff,
        withholdingTax: 0,
        vatWithholdingTax: 0,
        netAmount: diff,
        originalAmount: diff,
        isAdvance: true,
        advanceStatus: 'PENDING_ALLOCATION',
        originalManualInvoiceNumber: unallocRef,
        hasIssue: true,
        issueComment:
          diff < 0
            ? `Unallocated negative (-ve) voucher deduction of TZS ${formatCurrency(diff)}`
            : `Unallocated payment voucher balance of TZS ${formatCurrency(diff)} pending invoice allocation`,
      });
    }

    const allUpdatedInvoices = invoices.map((inv) => {
      if (updatedInvoicesMap.has(inv.id)) {
        return updatedInvoicesMap.get(inv.id)!;
      }
      return inv;
    });

    const effectivePaidAmount =
      isTotalManuallyEdited && headerTotal !== 0 ? headerTotal : rowTotals.totalNet;
    const primaryInvoiceNumber: string =
      allocationItems.length === 1
        ? allocationItems[0].invoiceNumber
        : `Multiple (${allocationItems.length} Lines)`;
    const primaryPO: string = allocationItems[0]?.poNumber || 'MULTI-PO';
    const hasAnyUnallocatedOrAdvance = allocationItems.some(
      (a) => a.isAdvance || a.advanceStatus === 'PENDING_ALLOCATION'
    );

    const newPaymentRecord: PaymentRecord = {
      id: paymentId.trim() || `PV-${Date.now()}`,
      paymentNumber: paymentId.trim() || `PV-${Date.now()}`,
      batchNumber: batchNo.trim(),
      customerName: primaryCustomer,
      invoiceNumber: primaryInvoiceNumber,
      poNumber: primaryPO,
      amountPaid: effectivePaidAmount,
      grossAmount:
        isTotalManuallyEdited && headerTotal !== 0 && Math.abs(rowTotals.variance) >= 0.01
          ? Math.round((rowTotals.totalGross + rowTotals.variance) * 100) / 100
          : rowTotals.totalGross,
      totalWithholdingTax: rowTotals.totalWht,
      totalVatWithholding: rowTotals.totalVatWht,
      paymentDate: payDate,
      paymentMethod: paymentMethod as any,
      referenceNumber: paymentReference.trim(),
      depositAccount,
      notes: batchNotes.trim(),
      allocations: allocationItems,
      isAdvance: hasAnyUnallocatedOrAdvance,
      hasIssue: hasPaymentIssue || hasAnyUnallocatedOrAdvance,
      issueComment:
        paymentIssueComment.trim() ||
        (hasAnyUnallocatedOrAdvance
          ? 'Unallocated / Advance or Negative (-ve) Deduction payment pending reconciliation'
          : undefined),
      issueStatus: hasPaymentIssue || hasAnyUnallocatedOrAdvance ? 'PENDING' : undefined,
      createdAt: new Date().toISOString(),
    };

    onSavePayment(newPaymentRecord, allUpdatedInvoices);
    setSuccessPayment(newPaymentRecord);

    if (andPrint) {
      setPrintingPayment(newPaymentRecord);
    }

    // Reset form for next batch
    const nextSeq = String(payments.length + 2).padStart(4, '0');
    setPaymentId(`PV-${new Date().getFullYear()}-${nextSeq}`);
    setBatchNo(`BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(10 + Math.random() * 90)}`);
    setPaymentReference(`TXN-${Date.now().toString().slice(-6)}`);
    setTotalBatchAmount('');
    setIsTotalManuallyEdited(false);
    setBatchNotes('');
    setHasPaymentIssue(false);
    setPaymentIssueComment('');
    setPaymentRows([createEmptyRow()]);
  };

  // =========================================================================
  // ADVANCE PAYMENT ALLOCATION & EDIT ACTIONS
  // "mean the transaction will be move from advance to normal payment after be edited and allocated to the correct invoice."
  // =========================================================================
  const handleConfirmAdvanceAllocation = (
    record: any,
    targetInvoice: InvoiceRecord,
    allocatedAmt: number,
    updatedCustomerName?: string,
    updatedManualInv?: string
  ) => {
    const targetPayment = payments.find((p) => p.id === record.paymentId);
    if (!targetPayment) return;

    const totalDue = getEffectiveInvoiceTotals(targetInvoice).total;
    const prevPaid = targetInvoice.paidAmount || 0;
    const newPaid = Math.round((prevPaid + allocatedAmt) * 100) / 100;
    const isSettled = newPaid >= totalDue - 0.01;
    const newBal = Math.max(0, Math.round((totalDue - newPaid) * 100) / 100);

    const updatedAllocations = (targetPayment.allocations || []).map((alloc, idx) => {
      if (idx !== record.allocationIndex) return alloc;
      return {
        ...alloc,
        invoiceId: targetInvoice.id,
        invoiceNumber: targetInvoice.invoiceNumber,
        poNumber: targetInvoice.poNumber || alloc.poNumber,
        customerName: updatedCustomerName?.trim() || targetInvoice.customerName,
        invoiceTotal: totalDue,
        alreadyPaid: prevPaid,
        pendingBalance: newBal,
        allocatedAmount: allocatedAmt,
        isAdvance: false, // Moved from advance to normal payment allocation!
        advanceStatus: 'ALLOCATED' as const,
        originalManualInvoiceNumber: updatedManualInv?.trim() || alloc.originalManualInvoiceNumber || alloc.invoiceNumber,
        allocatedAt: new Date().toISOString(),
        allocatedBy: currentUser?.name || 'Authorized Accountant',
      };
    });

    const stillHasAdvance = updatedAllocations.some((a) => a.isAdvance);
    const updatedPayment: PaymentRecord = {
      ...targetPayment,
      customerName: updatedCustomerName?.trim() || targetInvoice.customerName,
      allocations: updatedAllocations,
      isAdvance: stillHasAdvance,
    };

    const updatedTargetInvoice: InvoiceRecord = {
      ...targetInvoice,
      paidAmount: newPaid,
      paymentStatus: isSettled ? 'PAID' : 'PARTIAL',
    };

    const allUpdatedInvoices = invoices.map((inv) => {
      if (inv.id === targetInvoice.id) {
        return updatedTargetInvoice;
      }
      return inv;
    });

    onSavePayment(updatedPayment, allUpdatedInvoices);
    setSelectedAdvanceRecordForEdit(null);
  };

  const handleUpdateAdvanceInfoOnly = (
    record: any,
    newCustomerName: string,
    newManualInv: string
  ) => {
    const targetPayment = payments.find((p) => p.id === record.paymentId);
    if (!targetPayment) return;

    const updatedAllocations = (targetPayment.allocations || []).map((alloc, idx) => {
      if (idx !== record.allocationIndex) return alloc;
      return {
        ...alloc,
        customerName: newCustomerName.trim() || alloc.customerName,
        invoiceNumber: newManualInv.trim() || alloc.invoiceNumber,
        originalManualInvoiceNumber: newManualInv.trim() || alloc.originalManualInvoiceNumber,
      };
    });

    const updatedPayment: PaymentRecord = {
      ...targetPayment,
      customerName: newCustomerName.trim() || targetPayment.customerName,
      allocations: updatedAllocations,
    };

    onSavePayment(updatedPayment, invoices);
    setSelectedAdvanceRecordForEdit(null);
  };

  const handleStartNextPayment = () => {
    setSuccessPayment(null);
    setPaymentRows([createEmptyRow()]);
    setTotalBatchAmount('');
    setIsTotalManuallyEdited(false);
    setBatchNotes('');
    setErrorMessage(null);
  };

  // =========================================================================
  // LEDGER / HISTORY VIEW LOGIC
  // =========================================================================
  const filteredPaymentsLedger = useMemo(() => {
    const list = (payments || []).filter((p) => {
      const q = ledgerSearch.toLowerCase();
      return (
        p.paymentNumber.toLowerCase().includes(q) ||
        (p.batchNumber && p.batchNumber.toLowerCase().includes(q)) ||
        p.customerName.toLowerCase().includes(q) ||
        p.poNumber.toLowerCase().includes(q) ||
        p.referenceNumber.toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => naturalCompare(b.paymentDate, a.paymentDate));
  }, [payments, ledgerSearch]);

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

  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(25);
  const paginatedPaymentsLedger = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsPageSize;
    return sortedAndFilteredPaymentsLedger.slice(start, start + paymentsPageSize);
  }, [sortedAndFilteredPaymentsLedger, paymentsPage, paymentsPageSize]);

  const [paymentPendingDelete, setPaymentPendingDelete] = useState<PaymentRecord | null>(null);

  // Export Ledger
  const handleExportPaymentsExcel = () => {
    const headers = [
      '#',
      'Voucher / ID',
      'Batch No',
      'Payment Date',
      'Customer',
      'Reference #',
      'Gross Amount (TZS)',
      'WHT (TZS)',
      'VAT WHT (TZS)',
      'Net Amount Paid (TZS)',
      'Invoices Settled',
      'Payment Method',
      'Deposit Account',
    ];

    const rows = filteredPaymentsLedger.map((p, idx) => [
      idx + 1,
      p.paymentNumber,
      p.batchNumber || '—',
      p.paymentDate,
      p.customerName,
      p.referenceNumber,
      p.grossAmount || p.amountPaid,
      p.totalWithholdingTax || 0,
      p.totalVatWithholding || 0,
      p.amountPaid,
      p.allocations ? p.allocations.length : 1,
      p.paymentMethod,
      p.depositAccount || '—',
    ]);

    exportTableToExcel('Payments_Bulk_Ledger_Registry', headers, rows, 'Payments_Ledger');
  };

  return (
    <div className="space-y-4 pb-12 w-full mx-auto px-1 sm:px-2">
      {/* Sub-navigation Tabs (Create Payment | Payment Details | Advance Records) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('record')}
            className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'record'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Payment</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('ledger')}
            className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'ledger'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Payment Details ({payments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('advance')}
            className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer relative ${
              viewMode === 'advance'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Advance Records</span>
            {pendingAdvanceCount > 0 ? (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                {pendingAdvanceCount}
              </span>
            ) : (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {allAdvanceRecords.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Collections</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-emerald-700 truncate">
              TZS {formatCurrency(stats.totalCollected)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>{stats.paymentsCount} payments recorded</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoiced</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-slate-900 truncate">
              TZS {formatCurrency(stats.totalInvoiced)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <span>{invoices.length} total invoices issued</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Outstanding Balance</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-lg sm:text-2xl font-bold font-mono text-amber-700 truncate">
              TZS {formatCurrency(stats.totalOutstanding)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-800/80 mt-1">
              <span>{pendingInvoicesList.length} outstanding invoices eligible</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
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
                  Bulk Payment Voucher {successPayment.paymentNumber} Recorded!
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Batch: <span className="font-mono font-bold">{successPayment.batchNumber}</span> • Net Credited:{' '}
                  <span className="font-bold font-mono">TZS {formatCurrency(successPayment.amountPaid)}</span> across{' '}
                  <span className="font-bold">{successPayment.allocations?.length || 0} invoices</span>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintingPayment(successPayment)}
                className="px-3.5 py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Official Receipt
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ledger')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <FileText className="w-3.5 h-3.5" />
                View Ledger
              </button>
              <button
                type="button"
                onClick={handleStartNextPayment}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px]"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Next Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 1: BULK PAYMENT RECORDING */}
      {viewMode === 'record' && (
        <div className="space-y-6">
          {/* =========================================================================
              STEP 1: BATCH HEADER INPUTS (ID, Batch No, Ref, Total Amount, Pay Date)
              ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Bulk Payment Header Parameters
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Fields with * are required</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* 1. ID */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-500" />
                  ID / Voucher # <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  placeholder="e.g. PV-2026-0001"
                  className="w-full text-xs font-mono font-bold text-slate-900 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 2. Batch No */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-blue-500" />
                  Batch No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  placeholder="e.g. BATCH-202611-01"
                  className="w-full text-xs font-mono font-bold text-blue-900 px-3 py-2 bg-blue-50/40 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 3. Payment Reference */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-slate-500" />
                  Payment Reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. CRDB-TXN-884920"
                  className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* 4. Total Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold uppercase text-slate-600 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-600" />
                    Total Amount (TZS) <span className="text-red-500">*</span>
                  </label>
                  {isTotalManuallyEdited ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTotalManuallyEdited(false);
                        setTotalBatchAmount(rowTotals.totalNet !== 0 ? String(rowTotals.totalNet) : '');
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                      title="Reset to auto-calculated net total from selected invoices"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Auto-sync</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Auto-calculated
                    </span>
                  )}
                </div>
                <FormattedNumberInput
                  value={parseFloat(String(totalBatchAmount).replace(/,/g, '')) || 0}
                  onChange={(val) => {
                    setIsTotalManuallyEdited(true);
                    setTotalBatchAmount(val !== 0 ? String(val) : '');
                  }}
                  placeholder="0.00"
                  className="w-full text-xs font-mono font-black text-emerald-800 px-3 py-2 bg-emerald-50/50 border border-emerald-400 rounded-xl focus:ring-2 focus:ring-emerald-500 text-right"
                />
              </div>

              {/* 5. Pay Date */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  Pay Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Optional Channel & Notes Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                >
                  <option value="Bank Transfer">Bank Wire / TT</option>
                  <option value="Cheque">Corporate Cheque</option>
                  <option value="EFT">Electronic Funds Transfer (EFT)</option>
                  <option value="Mobile Money">Mobile Money (M-Pesa / Tigo)</option>
                  <option value="Cash">Cash Deposit</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Deposit Account
                </label>
                <input
                  type="text"
                  value={depositAccount}
                  onChange={(e) => setDepositAccount(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Batch Remarks / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="e.g. Bulk settlement for November deliveries"
                  className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* =========================================================================
              STEP 2: BULK INVOICES ALLOCATION TABLE
              Exact requested columns:
              Customer Name | Invoice No | Invoice Amount | Withhold Tax | VAT Withholding |
              Net Amount (Invoice Amount - WHT - VAT WHT) | Invoice Pending Amount | Invoice Original Amount
              ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
            {/* Table Header Bar */}
            <div className="p-4 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                  Bulk Invoices Allocation Grid ({paymentRows.length} Lines)
                </span>
                <span className="text-[11px] text-slate-500">
                  Type invoice # to auto-fill customer, or pick customer first.
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    // Pre-check any invoices already in the grid
                    const existingIds = paymentRows
                      .filter((r) => !r.isAdvance && r.invoiceId)
                      .map((r) => r.invoiceId);
                    setSelectedBatchInvoiceIds(existingIds);
                    setIsMultiSelectOpen(true);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Select Multiple Invoices ({pendingInvoicesList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddLine}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAllLines}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* MAIN BULK TABLE */}
            <div className="overflow-x-auto min-h-[320px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-20 shadow-xs border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-2 w-8 text-center font-mono">#</th>
                    <th className="py-3 px-2 w-14 text-center">
                      <div className="text-amber-400 font-black">ADV?</div>
                      <div className="text-[8px] text-slate-400 font-normal lowercase">(advance)</div>
                    </th>
                    <th className="py-3 px-3 min-w-[200px]">Customer Name</th>
                    <th className="py-3 px-3 min-w-[200px]">Invoice No</th>
                    <th className="py-3 px-3 text-right font-mono min-w-[150px]">Invoice Amount</th>
                    <th className="py-3 px-3 text-right font-mono min-w-[240px]">
                      <div>Withhold Tax</div>
                      <div className="text-[9px] text-slate-400 font-normal lowercase tracking-normal">(rate % &amp; amount on same line)</div>
                    </th>
                    <th className="py-3 px-3 text-right font-mono min-w-[250px]">
                      <div>VAT Withholding</div>
                      <div className="text-[9px] text-slate-400 font-normal lowercase tracking-normal">(2% of vat &amp; amount on same line)</div>
                    </th>
                    <th className="py-3 px-3 text-right font-mono min-w-[140px] bg-slate-950 text-emerald-300">
                      Net Amount
                    </th>
                    <th className="py-3 px-3 text-right font-mono min-w-[130px] text-amber-300">
                      Invoice Pending Amount
                    </th>
                    <th className="py-3 px-3 text-right font-mono min-w-[130px] text-slate-300">
                      Invoice Original Amount
                    </th>
                    <th className="py-3 px-2 w-10 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paymentRows.map((row, idx) => {
                    // Filter customer candidates for this row
                    const filteredCustomers = customerListWithOutstanding.filter((c) =>
                      c.name.toLowerCase().includes((row.customerSearchText || '').toLowerCase().trim())
                    );

                    // Filter invoice candidates for standard rows:
                    const filteredInvoices = pendingInvoicesList.filter((inv) => {
                      if (row.customerName && inv.customerName.toLowerCase() !== row.customerName.toLowerCase()) {
                        return false;
                      }
                      if (row.invoiceSearchText) {
                        const q = row.invoiceSearchText.toLowerCase().trim();
                        const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
                        const matchPo = inv.poNumber.toLowerCase().includes(q);
                        const matchCust = inv.customerName.toLowerCase().includes(q);
                        return matchNum || matchPo || matchCust;
                      }
                      return true;
                    });

                    return (
                      <tr
                        key={row.rowId}
                        className={`transition-colors ${
                          row.isAdvance ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* # */}
                        <td className="py-2.5 px-2 text-center font-mono text-slate-400 font-bold text-[11px]">
                          {idx + 1}
                        </td>

                        {/* ADVANCE CHECKBOX (User Request) */}
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <input
                              type="checkbox"
                              checked={!!row.isAdvance}
                              onChange={(e) => {
                                const isAdv = e.target.checked;
                                updateRow(row.rowId, {
                                  isAdvance: isAdv,
                                  poNumber: isAdv ? 'ADVANCE' : '',
                                  invoiceId: isAdv ? '' : row.invoiceId,
                                  pendingAmount: isAdv ? row.invoiceAmount : row.pendingAmount,
                                  originalAmount: isAdv ? row.invoiceAmount : row.originalAmount,
                                });
                              }}
                              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                              title="Tick if invoice is paid in advance and not yet in invoice database"
                            />
                            {row.isAdvance && (
                              <span className="text-[8px] font-black uppercase text-amber-700 font-mono mt-0.5">
                                ADV
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 1. Customer Name (Filter by typing or type new customer if advance) */}
                        <td className="py-2.5 px-3 relative">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.customerSearchText}
                              onChange={(e) => {
                                if (row.isAdvance) {
                                  updateRow(row.rowId, {
                                    customerName: e.target.value,
                                    customerSearchText: e.target.value,
                                    isCustomerDropdownOpen: true,
                                  });
                                } else {
                                  updateRow(row.rowId, {
                                    customerSearchText: e.target.value,
                                    isCustomerDropdownOpen: true,
                                  });
                                }
                              }}
                              onFocus={() => updateRow(row.rowId, { isCustomerDropdownOpen: true })}
                              placeholder={row.isAdvance ? 'Type customer name...' : 'Type to filter customer...'}
                              className={`w-full text-xs font-semibold px-2.5 py-1.5 border rounded-lg focus:bg-white focus:ring-1 ${
                                row.isAdvance
                                  ? 'bg-amber-50/40 border-amber-300 focus:ring-amber-500'
                                  : 'bg-slate-50 border-slate-300 focus:ring-blue-500'
                              }`}
                            />
                            {row.customerName && (
                              <button
                                type="button"
                                onClick={() => handleSelectCustomerForRow(row.rowId, '')}
                                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Customer Search Dropdown */}
                          {row.isCustomerDropdownOpen && (
                            <div className="absolute left-3 top-11 z-30 w-72 bg-white rounded-xl shadow-xl border border-slate-200 max-h-56 overflow-y-auto">
                              <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500 flex justify-between items-center">
                                <span>
                                  {row.isAdvance
                                    ? `Known Customers (${allKnownCustomers.length})`
                                    : `Select Customer (${filteredCustomers.length})`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateRow(row.rowId, { isCustomerDropdownOpen: false })}
                                  className="text-slate-400 hover:text-slate-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {row.isAdvance ? (
                                allKnownCustomers
                                  .filter((c) =>
                                    c.toLowerCase().includes((row.customerSearchText || '').toLowerCase().trim())
                                  )
                                  .map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => {
                                        updateRow(row.rowId, {
                                          customerName: c,
                                          customerSearchText: c,
                                          isCustomerDropdownOpen: false,
                                        });
                                      }}
                                      className="w-full text-left p-2.5 hover:bg-amber-50 border-b border-slate-50 text-xs font-bold text-slate-900 cursor-pointer"
                                    >
                                      {c}
                                    </button>
                                  ))
                              ) : filteredCustomers.length === 0 ? (
                                <div className="p-3 text-[11px] text-slate-400 text-center">
                                  No customer found with pending invoices
                                </div>
                              ) : (
                                filteredCustomers.map((c) => (
                                  <button
                                    key={c.name}
                                    type="button"
                                    onClick={() => handleSelectCustomerForRow(row.rowId, c.name)}
                                    className="w-full text-left p-2.5 hover:bg-blue-50 border-b border-slate-50 text-xs flex justify-between items-center cursor-pointer"
                                  >
                                    <div>
                                      <div className="font-bold text-slate-900">{c.name}</div>
                                      <div className="text-[10px] text-slate-500">
                                        {c.count} pending invoice(s)
                                      </div>
                                    </div>
                                    <span className="font-mono text-[11px] font-bold text-amber-700">
                                      TZS {formatCurrency(c.totalPending)}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </td>

                        {/* 2. Invoice No */}
                        <td className="py-2.5 px-3 relative">
                          {row.isAdvance ? (
                            /* Advance: Enter manual invoice number directly */
                            <div className="relative">
                              <input
                                type="text"
                                value={row.invoiceNumber}
                                onChange={(e) => {
                                  updateRow(row.rowId, {
                                    invoiceNumber: e.target.value,
                                    invoiceSearchText: e.target.value,
                                  });
                                }}
                                onBlur={() => {
                                  // Open next line with same customer on blur of last line
                                  if (idx === paymentRows.length - 1 && row.invoiceNumber.trim()) {
                                    setPaymentRows((prev) => [...prev, createEmptyRow(row.customerName, true)]);
                                  }
                                }}
                                placeholder="Type manual advance invoice #..."
                                className="w-full text-xs font-mono font-bold px-2.5 py-1.5 bg-amber-50/60 border border-amber-300 rounded-lg text-amber-950 focus:bg-white focus:ring-1 focus:ring-amber-500"
                              />
                              {row.invoiceNumber && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRow(row.rowId, {
                                      invoiceNumber: '',
                                      invoiceSearchText: '',
                                    })
                                  }
                                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            /* Standard: Filter & Select from Pending Invoices */
                            <div className="relative">
                              <input
                                type="text"
                                value={row.invoiceSearchText}
                                onChange={(e) => {
                                  updateRow(row.rowId, {
                                    invoiceSearchText: e.target.value,
                                    isInvoiceDropdownOpen: true,
                                  });
                                }}
                                onFocus={() => updateRow(row.rowId, { isInvoiceDropdownOpen: true })}
                                placeholder={row.customerName ? `Search ${row.customerName} inv...` : 'Type invoice #...'}
                                className="w-full text-xs font-mono font-bold px-2.5 py-1.5 bg-blue-50/30 border border-blue-300 rounded-lg text-blue-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                              {row.invoiceNumber && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRow(row.rowId, {
                                      invoiceId: '',
                                      invoiceNumber: '',
                                      invoiceSearchText: '',
                                      invoiceAmount: 0,
                                      withholdTax: 0,
                                      vatWithholding: 0,
                                      netAmount: 0,
                                      pendingAmount: 0,
                                      originalAmount: 0,
                                    })
                                  }
                                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Invoice Search Dropdown for Standard Rows */}
                          {!row.isAdvance && row.isInvoiceDropdownOpen && (
                            <div className="absolute left-3 top-11 z-30 w-80 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto">
                              <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500 flex justify-between items-center">
                                <span>
                                  Pending Invoices ({filteredInvoices.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateRow(row.rowId, { isInvoiceDropdownOpen: false })}
                                  className="text-slate-400 hover:text-slate-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {filteredInvoices.length === 0 ? (
                                <div className="p-3 text-[11px] text-slate-400 text-center">
                                  {row.customerName
                                    ? `No pending invoices found for ${row.customerName}`
                                    : 'No pending invoices found'}
                                </div>
                              ) : (
                                filteredInvoices.map((inv) => (
                                  <button
                                    key={inv.id}
                                    type="button"
                                    onClick={() => handleSelectInvoiceForRow(row.rowId, inv)}
                                    className="w-full text-left p-2.5 hover:bg-emerald-50 border-b border-slate-50 text-xs cursor-pointer"
                                  >
                                    <div className="flex justify-between items-start">
                                      <span className="font-mono font-black text-blue-700">
                                        {inv.invoiceNumber}
                                      </span>
                                      <span className="font-mono font-bold text-amber-700 text-[11px]">
                                        Bal: TZS {formatCurrency(inv.pendingAmount)}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 flex justify-between items-center mt-0.5">
                                      <span className="truncate max-w-[160px] font-medium">{inv.customerName}</span>
                                      <span className="text-[10px] text-slate-400">
                                        PO: {inv.poNumber} • Orig: TZS {formatCurrency(inv.originalAmount)}
                                      </span>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </td>

                        {/* 3. Invoice Amount (Gross settled) with thousand separator and 2 decimal points */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <FormattedNumberInput
                            value={row.invoiceAmount}
                            onChange={(val) => updateRow(row.rowId, { invoiceAmount: val })}
                            placeholder="0.00"
                            className="w-32 sm:w-36 text-right text-xs font-mono font-bold px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>

                        {/* 4. Withhold Tax (WHT): % dropdown + Formatted amount on the SAME line (no wrapping) */}
                        <td className="py-2.5 px-3 text-right">
                          {(() => {
                            const grossBeforeVat = row.invoiceAmount > 0
                              ? row.invoiceAmount / 1.18
                              : (row.originalAmount > 0 ? row.originalAmount / 1.18 : 0);
                            const calcWht2Pct = Math.round(grossBeforeVat * 0.02 * 100) / 100;
                            const calcWht5Pct = Math.round(grossBeforeVat * 0.05 * 100) / 100;

                            let activeWhtSelection = '0';
                            if (row.withholdTax > 0) {
                              if (grossBeforeVat > 0 && Math.abs(row.withholdTax - calcWht2Pct) < 0.05) {
                                activeWhtSelection = '0.02';
                              } else if (grossBeforeVat > 0 && Math.abs(row.withholdTax - calcWht5Pct) < 0.05) {
                                activeWhtSelection = '0.05';
                              } else {
                                activeWhtSelection = 'manual';
                              }
                            }

                            return (
                              <div className="flex flex-col items-end">
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  <select
                                    value={activeWhtSelection}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '0') handleApplyQuickWHT(row.rowId, 0);
                                      else if (val === '0.02') handleApplyQuickWHT(row.rowId, 0.02);
                                      else if (val === '0.05') handleApplyQuickWHT(row.rowId, 0.05);
                                    }}
                                    className="text-[11px] font-bold px-2 py-1.5 bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-lg cursor-pointer focus:ring-1 focus:ring-blue-500 shrink-0"
                                    title="Select WHT rate on gross before VAT (0%, 2% default, or 5%)"
                                  >
                                    <option value="0.02">2% (Def)</option>
                                    <option value="0">0%</option>
                                    <option value="0.05">5%</option>
                                    {activeWhtSelection === 'manual' && <option value="manual">Manual</option>}
                                  </select>

                                  <FormattedNumberInput
                                    value={row.withholdTax}
                                    onChange={(val) => updateRow(row.rowId, { withholdTax: val })}
                                    placeholder="0.00"
                                    className="w-28 sm:w-32 text-right text-xs font-mono font-bold px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 shrink-0"
                                  />
                                </div>
                                {row.invoiceAmount > 0 && (
                                  <div className="text-[10px] text-slate-500 text-right font-mono truncate mt-0.5" title="Gross amount before VAT">
                                    Ex-VAT: {formatCurrency(Math.round((row.invoiceAmount / 1.18) * 100) / 100)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* 5. VAT Withholding: % dropdown + Formatted amount on the SAME line (no wrapping) */}
                        <td className="py-2.5 px-3 text-right">
                          {(() => {
                            const vatAmount = row.invoiceAmount > 0
                              ? (row.invoiceAmount / 1.18) * 0.18
                              : (row.originalAmount > 0 ? (row.originalAmount / 1.18) * 0.18 : 0);
                            const calcVat2Pct = Math.round(vatAmount * 0.02 * 100) / 100;

                            let activeVatWhtSelection = '0';
                            if (row.vatWithholding > 0) {
                              if (vatAmount > 0 && Math.abs(row.vatWithholding - calcVat2Pct) < 0.05) {
                                activeVatWhtSelection = '0.02';
                              } else {
                                activeVatWhtSelection = 'manual';
                              }
                            }

                            return (
                              <div className="flex flex-col items-end">
                                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                  <select
                                    value={activeVatWhtSelection}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '0') handleApplyQuickVatWHT(row.rowId, 0);
                                      else if (val === '0.02') handleApplyQuickVatWHT(row.rowId, 0.02);
                                    }}
                                    className="text-[11px] font-bold px-2 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-lg cursor-pointer focus:ring-1 focus:ring-purple-500 shrink-0"
                                    title="Select VAT Withholding rate (2% of VAT component)"
                                  >
                                    <option value="0.02">2% of VAT (Def)</option>
                                    <option value="0">0%</option>
                                    {activeVatWhtSelection === 'manual' && <option value="manual">Manual</option>}
                                  </select>

                                  <FormattedNumberInput
                                    value={row.vatWithholding}
                                    onChange={(val) => updateRow(row.rowId, { vatWithholding: val })}
                                    placeholder="0.00"
                                    className="w-28 sm:w-32 text-right text-xs font-mono font-bold px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-purple-500 shrink-0"
                                  />
                                </div>
                                {row.invoiceAmount > 0 && (
                                  <div className="text-[10px] text-purple-700/80 text-right font-mono truncate mt-0.5" title="VAT component (18%)">
                                    VAT (18%): {formatCurrency(Math.round(((row.invoiceAmount / 1.18) * 0.18) * 100) / 100)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* 6. Net Amount (Formula: invoiceAmount - WHT - VAT WHT) */}
                        <td className="py-2.5 px-3 text-right font-mono font-black text-xs text-emerald-800 bg-emerald-50/30 whitespace-nowrap">
                          TZS {formatCurrency(row.netAmount)}
                        </td>

                        {/* 7. Invoice Pending Amount (Last Two Column 1) */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-xs text-amber-800 whitespace-nowrap">
                          {row.pendingAmount > 0 ? `TZS ${formatCurrency(row.pendingAmount)}` : '—'}
                        </td>

                        {/* 8. Invoice Original Amount (Last Two Column 2) */}
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600 whitespace-nowrap">
                          {row.originalAmount > 0 ? `TZS ${formatCurrency(row.originalAmount)}` : '—'}
                        </td>

                        {/* 9. Action (Remove Line) */}
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(row.rowId)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title="Remove this line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* TABLE FOOTER SUMMARY */}
                <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-800">
                  <tr>
                    <td colSpan={4} className="py-3 px-3 uppercase tracking-wider text-right font-bold">
                      Batch Summary ({rowTotals.validLinesCount} Invoices Allocated):
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-white">
                      TZS {formatCurrency(rowTotals.totalGross)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-300">
                      TZS {formatCurrency(rowTotals.totalWht)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-blue-300">
                      TZS {formatCurrency(rowTotals.totalVatWht)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-300 bg-slate-950 text-sm">
                      TZS {formatCurrency(rowTotals.totalNet)}
                    </td>
                    <td colSpan={3} className="py-3 px-3 text-slate-400 text-center font-normal">
                      Net = Gross − WHT − VAT WHT
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Reconciliation Variance & Action Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xs">
                  <span className="text-slate-500 font-medium">Batch Header Total: </span>
                  <strong className="font-mono text-slate-900 font-black">
                    TZS {formatCurrency(rowTotals.parsedBatchTotal)}
                  </strong>
                </div>

                <div className="text-xs">
                  <span className="text-slate-500 font-medium">Allocated Net: </span>
                  <strong className="font-mono text-emerald-800 font-black">
                    TZS {formatCurrency(rowTotals.totalNet)}
                  </strong>
                </div>

                {/* Variance Badge */}
                {rowTotals.parsedBatchTotal > 0 && (
                  <div>
                    {rowTotals.isBalanced ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        100% Balanced &amp; Reconciled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        Variance: TZS {formatCurrency(rowTotals.variance)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => handleSaveBulkPayment(false)}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                >
                  <Save className="w-4 h-4 text-emerald-200" />
                  <span>Save Bulk Payment</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveBulkPayment(true)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  <span>Save &amp; Print Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: PAYMENTS LEDGER / REGISTRY */}
      {viewMode === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={(e) => {
                  setLedgerSearch(e.target.value);
                  setPaymentsPage(1);
                }}
                placeholder="Search by Voucher #, Batch #, Customer, Ref..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleExportPaymentsExcel}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Ledger Excel</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('record')}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <span>New Payment</span>
              </button>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3 text-center font-mono w-10">#</th>
                    <th className="py-3 px-3 font-mono">Voucher ID</th>
                    <th className="py-3 px-3 font-mono">Batch No</th>
                    <th className="py-3 px-3 text-center">Pay Date</th>
                    <th className="py-3 px-3">Customer / Remitter</th>
                    <th className="py-3 px-3 font-mono">Payment Ref</th>
                    <th className="py-3 px-3 text-right font-mono">Gross Amount</th>
                    <th className="py-3 px-3 text-right font-mono text-amber-300">WHT / Taxes</th>
                    <th className="py-3 px-3 text-right font-mono text-emerald-300">Net Received</th>
                    <th className="py-3 px-3 text-center">Invoices</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPaymentsLedger.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-xs text-slate-500">
                        <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-bold text-slate-800">No Payments Recorded Yet</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedPaymentsLedger.map((p, pIdx) => {
                      const totalTaxes = (p.totalWithholdingTax || 0) + (p.totalVatWithholding || 0);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3 text-center font-mono text-slate-400">
                            {(paymentsPage - 1) * paymentsPageSize + pIdx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {p.paymentNumber}
                          </td>
                          <td className="py-3 px-3 font-mono text-blue-800">
                            {p.batchNumber ? (
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                                {p.batchNumber}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600 whitespace-nowrap">
                            {p.paymentDate}
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {p.customerName}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700">
                            {p.referenceNumber}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-800">
                            TZS {formatCurrency(p.grossAmount || p.amountPaid)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-800">
                            {totalTaxes > 0 ? `TZS ${formatCurrency(totalTaxes)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">
                            TZS {formatCurrency(p.amountPaid)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {p.allocations ? `${p.allocations.length} Invoices` : '1 Invoice'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPrintingPayment(p)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                                title="Print Receipt"
                              >
                                <Printer className="w-3 h-3 text-slate-600" />
                                <span>Receipt</span>
                              </button>

                              {onDeletePayment && canDeleteData(currentUser) && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentPendingDelete(p)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  title="Delete Payment Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredPaymentsLedger.length > 0 && (
              <TablePagination
                currentPage={paymentsPage}
                totalItems={filteredPaymentsLedger.length}
                pageSize={paymentsPageSize}
                onPageChange={setPaymentsPage}
                onPageSizeChange={setPaymentsPageSize}
                itemLabel="Payments"
              />
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 3: ADVANCE PAYMENT RECORDS (New Tab requested by user) */}
      {viewMode === 'advance' && (
        <div className="space-y-5">
          {/* Top KPI Cards for Advance Payments */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Advance Receipts
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-xl sm:text-2xl font-bold font-mono text-amber-900 truncate">
                  TZS {formatCurrency(allAdvanceRecords.reduce((s, r) => s + r.invoiceAmount, 0))}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                  <span>{allAdvanceRecords.length} advance line(s) recorded</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Pending Invoice Allocation
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-xl sm:text-2xl font-bold font-mono text-amber-700 truncate">
                  TZS {formatCurrency(
                    allAdvanceRecords
                      .filter((r) => r.advanceStatus === 'PENDING_ALLOCATION')
                      .reduce((s, r) => s + r.invoiceAmount, 0)
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-800 font-semibold mt-1">
                  <span>{pendingAdvanceCount} awaiting invoice recording</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Successfully Allocated
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 truncate">
                  TZS {formatCurrency(
                    allAdvanceRecords
                      .filter((r) => r.advanceStatus === 'ALLOCATED')
                      .reduce((s, r) => s + r.invoiceAmount, 0)
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-800 font-semibold mt-1">
                  <span>{allAdvanceRecords.length - pendingAdvanceCount} settled with system invoices</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={advanceTableSearch}
                onChange={(e) => setAdvanceTableSearch(e.target.value)}
                placeholder="Search Advance by Voucher, Customer, Manual Inv #..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setAdvanceStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    advanceStatusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({allAdvanceRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdvanceStatusFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    advanceStatusFilter === 'PENDING'
                      ? 'bg-amber-100 text-amber-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pending Allocation ({pendingAdvanceCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAdvanceStatusFilter('ALLOCATED')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    advanceStatusFilter === 'ALLOCATED'
                      ? 'bg-emerald-100 text-emerald-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Allocated ({allAdvanceRecords.length - pendingAdvanceCount})
                </button>
              </div>

              {/* Export Excel Button */}
              <button
                type="button"
                onClick={() => {
                  const headers = [
                    '#',
                    'Voucher ID',
                    'Batch No',
                    'Pay Date',
                    'Customer Name',
                    'Manual Invoice # (Advance)',
                    'Invoice Amount (TZS)',
                    'WHT (TZS)',
                    'VAT WHT (TZS)',
                    'Net Received (TZS)',
                    'Status',
                    'Allocated System Invoice',
                    'Payment Ref',
                  ];
                  const rows = allAdvanceRecords
                    .filter((r) => {
                      if (advanceStatusFilter === 'PENDING' && r.advanceStatus !== 'PENDING_ALLOCATION') return false;
                      if (advanceStatusFilter === 'ALLOCATED' && r.advanceStatus !== 'ALLOCATED') return false;
                      if (advanceTableSearch) {
                        const q = advanceTableSearch.toLowerCase();
                        return (
                          r.paymentNumber.toLowerCase().includes(q) ||
                          (r.batchNumber || '').toLowerCase().includes(q) ||
                          r.customerName.toLowerCase().includes(q) ||
                          (r.originalManualInvoiceNumber || '').toLowerCase().includes(q) ||
                          (r.invoiceNumber || '').toLowerCase().includes(q) ||
                          (r.referenceNumber || '').toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((r, idx) => [
                      idx + 1,
                      r.paymentNumber,
                      r.batchNumber || '—',
                      r.paymentDate,
                      r.customerName,
                      r.originalManualInvoiceNumber,
                      r.invoiceAmount,
                      r.withholdingTax,
                      r.vatWithholdingTax,
                      r.netAmount,
                      r.advanceStatus === 'ALLOCATED' ? 'Allocated' : 'Pending Allocation',
                      r.advanceStatus === 'ALLOCATED' ? r.invoiceNumber : 'Unallocated',
                      r.referenceNumber,
                    ]);
                  exportTableToExcel('Advance_Payment_Records', headers, rows, 'Advance_Records');
                }}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Advance Records Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white text-[10px] uppercase font-black sticky top-0 z-10 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3 text-center font-mono w-10">#</th>
                    <th className="py-3 px-3 font-mono">Voucher ID</th>
                    <th className="py-3 px-3 font-mono">Batch No</th>
                    <th className="py-3 px-3 text-center">Pay Date</th>
                    <th className="py-3 px-3">Customer Name</th>
                    <th className="py-3 px-3 font-mono text-amber-300">Manual Invoice # (Adv)</th>
                    <th className="py-3 px-3 text-right font-mono">Invoice Amount</th>
                    <th className="py-3 px-3 text-right font-mono text-amber-300">WHT / Taxes</th>
                    <th className="py-3 px-3 text-right font-mono text-emerald-300">Net Received</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filtered = allAdvanceRecords.filter((r) => {
                      if (advanceStatusFilter === 'PENDING' && r.advanceStatus !== 'PENDING_ALLOCATION') return false;
                      if (advanceStatusFilter === 'ALLOCATED' && r.advanceStatus !== 'ALLOCATED') return false;
                      if (advanceTableSearch) {
                        const q = advanceTableSearch.toLowerCase();
                        return (
                          r.paymentNumber.toLowerCase().includes(q) ||
                          (r.batchNumber || '').toLowerCase().includes(q) ||
                          r.customerName.toLowerCase().includes(q) ||
                          (r.originalManualInvoiceNumber || '').toLowerCase().includes(q) ||
                          (r.invoiceNumber || '').toLowerCase().includes(q) ||
                          (r.referenceNumber || '').toLowerCase().includes(q)
                        );
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-xs text-slate-500">
                            <Sparkles className="w-8 h-8 text-amber-300 mx-auto mb-2" />
                            <p className="font-bold text-slate-800">No Advance Payment Lines Found</p>
                            <p className="text-slate-400 mt-1">
                              Tick the "Advance" checkbox when recording a bulk payment to register advance payments here.
                            </p>
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((r, rIdx) => {
                      const isPending = r.advanceStatus === 'PENDING_ALLOCATION';
                      const totalTaxes = r.withholdingTax + r.vatWithholdingTax;

                      return (
                        <tr
                          key={`${r.paymentId}-${r.allocationIndex}`}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isPending ? 'bg-amber-50/15' : 'bg-white'
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400 font-bold">
                            {rIdx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {r.paymentNumber}
                          </td>
                          <td className="py-3 px-3 font-mono text-blue-800">
                            {r.batchNumber ? (
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                                {r.batchNumber}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-600 whitespace-nowrap">
                            {r.paymentDate}
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {r.customerName}
                          </td>
                          <td className="py-3 px-3 font-mono font-black text-amber-900">
                            <span className="px-2 py-0.5 rounded bg-amber-100/70 text-amber-900 border border-amber-300">
                              {r.originalManualInvoiceNumber}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            TZS {formatCurrency(r.invoiceAmount)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-800">
                            {totalTaxes > 0 ? `TZS ${formatCurrency(totalTaxes)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">
                            TZS {formatCurrency(r.netAmount)}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-700" />
                                Pending Allocation
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                Allocated: {r.invoiceNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedAdvanceRecordForEdit(r)}
                              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1 shadow-2xs transition-colors"
                              title="Edit details or allocate to an official system invoice"
                            >
                              <span>Edit / Allocate</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT & ALLOCATE ADVANCE PAYMENT MODAL (User Request) */}
      {selectedAdvanceRecordForEdit && (
        <AllocateAdvanceModal
          record={selectedAdvanceRecordForEdit}
          invoices={invoices}
          allCustomers={allKnownCustomers}
          onConfirmAllocation={handleConfirmAdvanceAllocation}
          onUpdateInfoOnly={handleUpdateAdvanceInfoOnly}
          onClose={() => setSelectedAdvanceRecordForEdit(null)}
        />
      )}

      {/* Official Payment Receipt Modal */}
      {printingPayment && (
        <PaymentReceiptModal
          payment={printingPayment}
          onClose={() => setPrintingPayment(null)}
        />
      )}

      {/* Multi-Select Invoice Picker Modal for Batch Payments */}
      {isMultiSelectOpen && (() => {
        const filteredModalInvoices = pendingInvoicesList.filter((inv) => {
          const matchesCustomer =
            multiSelectCustomerFilter === 'ALL' || inv.customerName === multiSelectCustomerFilter;
          const q = multiSelectSearchQuery.trim().toLowerCase();
          const matchesQuery =
            !q ||
            inv.invoiceNumber.toLowerCase().includes(q) ||
            inv.customerName.toLowerCase().includes(q) ||
            inv.poNumber.toLowerCase().includes(q);
          return matchesCustomer && matchesQuery;
        });

        const allFilteredIds = filteredModalInvoices.map((inv) => inv.id);
        const areAllFilteredSelected =
          allFilteredIds.length > 0 &&
          allFilteredIds.every((id) => selectedBatchInvoiceIds.includes(id));

        const toggleSelectAllFiltered = () => {
          if (areAllFilteredSelected) {
            setSelectedBatchInvoiceIds((prev) =>
              prev.filter((id) => !allFilteredIds.includes(id))
            );
          } else {
            setSelectedBatchInvoiceIds((prev) =>
              Array.from(new Set([...prev, ...allFilteredIds]))
            );
          }
        };

        const toggleSingleInvoice = (id: string) => {
          setSelectedBatchInvoiceIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
          );
        };

        const selectedInvoicesSummary = pendingInvoicesList
          .filter((inv) => selectedBatchInvoiceIds.includes(inv.id))
          .reduce(
            (acc, inv) => {
              const gross = inv.pendingAmount;
              const wht = Math.round((gross / 1.18) * 0.02 * 100) / 100;
              const vatWht = Math.round(((gross / 1.18) * 0.18) * 0.02 * 100) / 100;
              const net = Math.max(0, Math.round((gross - wht - vatWht) * 100) / 100);
              return {
                count: acc.count + 1,
                gross: Math.round((acc.gross + gross) * 100) / 100,
                net: Math.round((acc.net + net) * 100) / 100,
              };
            },
            { count: 0, gross: 0, net: 0 }
          );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide">
                      Select Multiple Invoices for Batch Payment
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Choose outstanding invoices to populate into your batch payment &amp; auto-calculate the total amount
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMultiSelectOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter Bar */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Filter by Customer
                  </label>
                  <select
                    value={multiSelectCustomerFilter}
                    onChange={(e) => setMultiSelectCustomerFilter(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="ALL">
                      All Customers with Pending Balance ({pendingInvoicesList.length} Invoices)
                    </option>
                    {customerListWithOutstanding.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.count} inv — TZS {formatCurrency(c.totalPending)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Search Invoice # or PO #
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={multiSelectSearchQuery}
                      onChange={(e) => setMultiSelectSearchQuery(e.target.value)}
                      placeholder="Search by invoice number, customer, or PO..."
                      className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 flex sm:justify-end pt-4">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="w-full sm:w-auto px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {areAllFilteredSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Invoice List Table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={areAllFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">PO Number</th>
                      <th className="py-2.5 px-3 text-center">Date</th>
                      <th className="py-2.5 px-3 text-right font-mono">Original Total</th>
                      <th className="py-2.5 px-3 text-right font-mono">Pending Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredModalInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          No outstanding invoices match your filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredModalInvoices.map((inv) => {
                        const isChecked = selectedBatchInvoiceIds.includes(inv.id);
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => toggleSingleInvoice(inv.id)}
                            className={`cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-blue-50/80 hover:bg-blue-100/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td
                              className="py-2.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSingleInvoice(inv.id)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-blue-900">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              {inv.customerName}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {inv.poNumber}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                              {inv.invoiceDate}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              TZS {formatCurrency(inv.originalAmount)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                              TZS {formatCurrency(inv.pendingAmount)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer with Live Auto-Calculated Totals */}
              <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Selected Invoices
                    </div>
                    <div className="text-sm font-black text-white">
                      {selectedInvoicesSummary.count} Invoice{selectedInvoicesSummary.count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Total Gross Balance
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-300">
                      TZS {formatCurrency(selectedInvoicesSummary.gross)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Est. Net Batch Total (After 2% WHT &amp; VAT WHT)
                    </div>
                    <div className="text-sm font-mono font-black text-emerald-400">
                      TZS {formatCurrency(selectedInvoicesSummary.net)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMultiSelectOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={selectedInvoicesSummary.count === 0}
                    onClick={handleAddMultipleSelectedInvoices}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg cursor-pointer transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      Add {selectedInvoicesSummary.count} Invoice{selectedInvoicesSummary.count === 1 ? '' : 's'} to Batch
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Permanent Delete Confirmation Modal */}
      {paymentPendingDelete && (
        <PermanentDeleteModal
          isOpen={!!paymentPendingDelete}
          title={`Delete Payment Receipt #${paymentPendingDelete.paymentNumber}`}
          recordType="Payment Transaction"
          recordIdentifier={paymentPendingDelete.paymentNumber}
          recordDetails={[
            { label: 'Customer', value: paymentPendingDelete.customerName },
            { label: 'Amount Paid', value: `TZS ${formatCurrency(paymentPendingDelete.amountPaid)}` },
            { label: 'Payment Date', value: paymentPendingDelete.paymentDate },
            { label: 'Reference #', value: paymentPendingDelete.referenceNumber },
          ]}
          onConfirm={() => {
            if (onDeletePayment && paymentPendingDelete) {
              onDeletePayment(paymentPendingDelete.id);
            }
            setPaymentPendingDelete(null);
          }}
          onClose={() => setPaymentPendingDelete(null)}
        />
      )}
    </div>
  );
};
