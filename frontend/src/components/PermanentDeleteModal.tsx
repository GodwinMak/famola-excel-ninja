import React from 'react';
import { Trash2, X, ShieldAlert, AlertTriangle, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../utils/storage';

export interface PermanentDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  transactionType: 'INVOICE' | 'DELIVERY_NOTE' | 'PAYMENT' | 'PURCHASE_ORDER' | 'LINE_ITEM' | 'ISSUE';
  referenceNumber: string;
  customerName?: string;
  poNumber?: string;
  totalAmount?: number;
  itemName?: string;
  quantity?: number;
  details?: string;
  isDeleting?: boolean;
}

export const PermanentDeleteModal: React.FC<PermanentDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transactionType,
  referenceNumber,
  customerName,
  poNumber,
  totalAmount,
  itemName,
  quantity,
  details,
  isDeleting = false,
}) => {
  if (!isOpen) return null;

  const getTypeLabel = () => {
    switch (transactionType) {
      case 'INVOICE':
        return 'Tax Invoice Record';
      case 'DELIVERY_NOTE':
        return 'Delivery Note (DN) Record';
      case 'PAYMENT':
        return 'Payment Remittance Record';
      case 'PURCHASE_ORDER':
        return 'Purchase Order (PO)';
      case 'LINE_ITEM':
        return 'Item Line from Database';
      case 'ISSUE':
        return 'Issue Discrepancy Record';
      default:
        return 'Transaction Record';
    }
  };

  const getConsequenceExplanation = () => {
    switch (transactionType) {
      case 'INVOICE':
        return 'Billed quantities will be permanently removed and restored to available PO balance. Any associated discrepancy records will be purged.';
      case 'DELIVERY_NOTE':
        return 'Delivered quantities will be permanently removed and restored to available dispatch balance. Any matched invoice links will be released.';
      case 'PAYMENT':
        return 'Payment allocations will be reversed across all linked invoices, restoring unpaid customer balances. Payment ledger entries will be permanently purged.';
      case 'PURCHASE_ORDER':
        return 'The Purchase Order and all associated item lines will be permanently removed from the master registry.';
      case 'LINE_ITEM':
        return 'This individual line item will be permanently purged from the database, recalculating document totals.';
      case 'ISSUE':
        return 'This issue log and all associated resolution comments will be permanently erased from the resolution registry.';
    }
  };

  return (
    <div
      id="permanent-delete-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="permanent-delete-modal-dialog"
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-red-600 via-rose-700 to-red-800 p-5 text-white flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Permanent Transaction Deletion</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/30 border border-white/20 tracking-wider">
                  ADM ONLY
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-0.5">
                Authorized Administrator hard delete confirmation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">This action cannot be undone!</p>
              <p className="text-red-700 leading-relaxed">
                You are about to permanently purge this transaction from the database. It will be removed from local storage and the MySQL master database.
              </p>
            </div>
          </div>

          {/* Transaction Metadata Card */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-500 font-medium">Transaction Type</span>
              <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {getTypeLabel()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Reference Number</span>
              <span className="font-mono font-bold text-blue-700 text-sm">
                {referenceNumber}
              </span>
            </div>

            {customerName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer</span>
                <span className="font-semibold text-slate-900">{customerName}</span>
              </div>
            )}

            {poNumber && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">PO Reference</span>
                <span className="font-mono font-semibold text-slate-700">{poNumber}</span>
              </div>
            )}

            {itemName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Item Description</span>
                <span className="font-medium text-slate-800 truncate max-w-[240px]" title={itemName}>
                  {itemName}
                </span>
              </div>
            )}

            {quantity !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Quantity</span>
                <span className="font-mono font-bold text-slate-800">{quantity}</span>
              </div>
            )}

            {totalAmount !== undefined && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Total Transaction Value</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  TZS {formatCurrency(totalAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Impact notice */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
            <span className="font-bold block mb-1">System Impact & Data Balances:</span>
            <p className="text-blue-800 text-[11px] leading-relaxed">
              {details || getConsequenceExplanation()}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel & Keep Transaction
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs shadow-sm shadow-red-500/30 inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Permanently Delete Transaction</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
