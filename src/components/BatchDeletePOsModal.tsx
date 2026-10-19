import React from 'react';
import { Trash2, X, AlertTriangle, ShieldAlert, Layers, CheckSquare } from 'lucide-react';
import { PurchaseOrderGroup } from '../types';
import { formatCurrency } from '../utils/storage';

interface BatchDeletePOsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedPoGroups: PurchaseOrderGroup[];
  isDeleting?: boolean;
}

export const BatchDeletePOsModal: React.FC<BatchDeletePOsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedPoGroups,
  isDeleting = false,
}) => {
  if (!isOpen) return null;

  const totalLines = selectedPoGroups.reduce((acc, po) => acc + (po.lines?.length || 0), 0);
  const totalValue = selectedPoGroups.reduce((acc, po) => acc + (po.totalValueAfterVat || 0), 0);
  const poCount = selectedPoGroups.length;

  return (
    <div
      id="batch-delete-pos-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="batch-delete-pos-modal-dialog"
        className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-red-600 via-rose-700 to-red-800 p-5 text-white flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Batch Delete Purchase Orders</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/30 border border-white/20 tracking-wider">
                  {poCount} POs SELECTED
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-0.5">
                Authorized Administrator batch permanent removal confirmation
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
          {/* Critical Warning */}
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Irreversible Action: Multi-Record Permanent Delete</p>
              <p className="text-red-700 leading-relaxed">
                You are about to permanently purge <strong>{poCount} Purchase Orders</strong> and all <strong>{totalLines.toLocaleString()} associated line items</strong> from the system database. This cannot be undone.
              </p>
            </div>
          </div>

          {/* Batch Summary Metric Badges */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Purchase Orders</span>
              <span className="text-lg font-bold text-slate-900 font-mono">{poCount}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Line Items</span>
              <span className="text-lg font-bold text-blue-700 font-mono">{totalLines.toLocaleString()}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Combined Value</span>
              <span className="text-sm font-bold text-emerald-700 font-mono block mt-1">
                TZS {formatCurrency(totalValue)}
              </span>
            </div>
          </div>

          {/* Selected PO Tags / List Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Selected Purchase Orders to Delete:
              </span>
              <span className="text-[11px] text-slate-500">
                Showing all {poCount}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-1.5 scrollbar-thin">
              {selectedPoGroups.map((po) => (
                <span
                  key={po.poNumber}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-800 shadow-2xs flex items-center gap-1.5"
                >
                  <span className="font-bold text-blue-700">{po.poNumber}</span>
                  {po.customerName && (
                    <span className="text-slate-400 text-[10px]">({po.customerName})</span>
                  )}
                  <span className="text-slate-500 text-[10px]">{po.lines.length} lines</span>
                </span>
              ))}
            </div>
          </div>

          {/* Impact Warning */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
            <span className="font-bold block mb-1">System Notice & Tracking Updates:</span>
            <p className="text-blue-800 text-[11px] leading-relaxed">
              These Purchase Orders will be permanently erased from MySQL and memory stores. Existing invoices or delivery notes linked to these POs will retain their document integrity with disconnected references.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel & Keep Selection
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
              <span>Permanently Delete {poCount} Selected POs</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
