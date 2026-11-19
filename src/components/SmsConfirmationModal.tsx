import React, { useState, useEffect } from 'react';
import { MessageSquare, Trash2, X, ShieldAlert, KeyRound, CheckCircle2, RefreshCw } from 'lucide-react';

export interface SmsConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName: string;
  quantity?: number | string;
  unitPrice?: number | string;
  totalAmount?: number | string;
  referenceNumber: string;
  customerName?: string;
  warningNote?: string;
  isDeleting?: boolean;
}

export const SmsConfirmationModal: React.FC<SmsConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Line Deletion from Database',
  itemName,
  quantity,
  unitPrice,
  totalAmount,
  referenceNumber,
  customerName,
  warningNote,
  isDeleting = false,
}) => {
  const [smsOtp, setSmsOtp] = useState('');
  const [inputOtp, setInputOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  // Generate a realistic 6-digit SMS verification code on modal open
  useEffect(() => {
    if (isOpen) {
      const generated = Math.floor(100000 + Math.random() * 900000).toString();
      setSmsOtp(generated);
      setInputOtp(generated); // Pre-filled for effortless 1-click confirmation while showing the SMS notification
      setOtpError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyAndConfirm = () => {
    if (inputOtp.trim() !== smsOtp) {
      setOtpError('Invalid SMS confirmation code. Please check the code in the SMS alert above.');
      return;
    }
    setOtpError(null);
    onConfirm();
  };

  const formattedUnitPrice = unitPrice !== undefined && !isNaN(Number(unitPrice))
    ? Number(unitPrice).toLocaleString()
    : String(unitPrice || '0');

  const formattedTotalAmount = totalAmount !== undefined && !isNaN(Number(totalAmount))
    ? Number(totalAmount).toLocaleString()
    : String(totalAmount || '0');

  return (
    <div 
      id="sms-confirmation-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div 
        id="sms-confirmation-modal-dialog"
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Database Line Deletion SMS Alert</h3>
              <p className="text-[11px] text-rose-100">Administrator Security Confirmation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">{title}</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                You are about to permanently delete this item line from the persistent database.
              </p>
            </div>
          </div>

          {/* SMS Style Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 relative">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-b border-slate-200 pb-1.5">
              <span className="flex items-center gap-1.5 text-slate-700">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>CONFIRMATION SMS (ADMIN DISPATCH)</span>
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">Dispatched</span>
            </div>

            <div className="text-xs text-slate-800 leading-relaxed space-y-1.5">
              <p className="font-semibold text-slate-900">
                [Famola FBI Security Alert] Confirm deletion of item line:
              </p>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-500 font-medium">Item Description: </span>
                  <span className="font-bold text-slate-900">{itemName}</span>
                </div>
                {quantity !== undefined && (
                  <div>
                    <span className="text-slate-500 font-medium">Quantity: </span>
                    <span className="font-bold text-slate-800">{quantity}</span>
                  </div>
                )}
                {unitPrice !== undefined && (
                  <div>
                    <span className="text-slate-500 font-medium">Unit Price: </span>
                    <span className="font-bold text-slate-800">TZS {formattedUnitPrice}</span>
                  </div>
                )}
                {totalAmount !== undefined && (
                  <div>
                    <span className="text-slate-500 font-medium">Line Total: </span>
                    <span className="font-bold text-emerald-700">TZS {formattedTotalAmount}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 font-medium">Document Ref: </span>
                  <span className="font-mono font-bold text-blue-700">#{referenceNumber}</span>
                  {customerName && (
                    <span className="text-slate-500"> ({customerName})</span>
                  )}
                </div>
              </div>

              {/* SMS Code snippet */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px] text-amber-900 font-medium">
                    SMS Confirmation Code:
                  </span>
                </div>
                <span className="font-mono font-extrabold text-sm tracking-wider text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300">
                  {smsOtp}
                </span>
              </div>

              <p className="text-[11px] text-red-600 font-medium pt-1">
                {warningNote || '⚠️ This will recalculate the invoice subtotal, VAT, and total value, and adjust purchase order tracking automatically in the database.'}
              </p>
            </div>
          </div>

          {/* OTP Input Verification Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Enter 6-Digit SMS Verification Code:</span>
              <button
                type="button"
                onClick={() => setInputOtp(smsOtp)}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
              >
                Auto-fill Code
              </button>
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                value={inputOtp}
                onChange={(e) => {
                  setInputOtp(e.target.value.replace(/\D/g, ''));
                  setOtpError(null);
                }}
                placeholder="Enter 6-digit code"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
              {inputOtp === smsOtp && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5" />
              )}
            </div>
            {otpError && (
              <p className="text-[11px] text-red-600 font-medium">{otpError}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleVerifyAndConfirm}
            disabled={isDeleting || !inputOtp}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? 'Deleting...' : 'Verify SMS & Delete Line'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
