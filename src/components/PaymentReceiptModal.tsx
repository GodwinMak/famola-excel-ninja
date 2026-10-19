import React from 'react';
import { PaymentRecord } from '../types';
import { formatCurrency } from '../utils/storage';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { X, Printer, CreditCard, CheckCircle2 } from 'lucide-react';

interface PaymentReceiptModalProps {
  payment: PaymentRecord | null;
  onClose: () => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  payment,
  onClose,
}) => {
  if (!payment) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportAllocationsExcel = () => {
    if (!payment.allocations) return;
    const headers = ['#', 'Invoice Number', 'PO Reference', 'Invoice Total (TZS)', 'Previously Paid (TZS)', 'Allocated in this Payment (TZS)'];
    const rows = payment.allocations.map((alloc, idx) => [
      idx + 1,
      alloc.invoiceNumber,
      alloc.poNumber,
      formatCurrency(alloc.invoiceTotal),
      formatCurrency(alloc.alreadyPaid),
      formatCurrency(alloc.allocatedAmount),
    ]);
    exportTableToExcel(
      `Payment_${payment.paymentNumber}_Allocations`,
      headers,
      rows,
      `payment_${payment.paymentNumber.toLowerCase()}_allocations`
    );
  };

  const handleExportAllocationsPdf = () => {
    if (!payment.allocations) return;
    const headers = ['#', 'Invoice Number', 'PO Reference', 'Total (TZS)', 'Prev Paid (TZS)', 'Allocated (TZS)'];
    const rows = payment.allocations.map((alloc, idx) => [
      idx + 1,
      alloc.invoiceNumber,
      alloc.poNumber,
      formatCurrency(alloc.invoiceTotal),
      formatCurrency(alloc.alreadyPaid),
      formatCurrency(alloc.allocatedAmount),
    ]);
    exportTableToPdf(
      `Payment #${payment.paymentNumber} - Allocations Breakdown`,
      headers,
      rows,
      {
        filenamePrefix: `payment_${payment.paymentNumber.toLowerCase()}_allocations`,
        subtitle: `Customer: ${payment.customerName} • Total Received: TZS ${formatCurrency(payment.amountPaid)}`,
        currencyNote: 'Currency: TZS',
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 my-8">
        {/* Modal Top Control Bar */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Official Payment Receipt</span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
              {payment.paymentNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div id="printable-payment-receipt" className="p-4 sm:p-8 md:p-12 text-slate-800 bg-white space-y-6 sm:space-y-8 print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-6 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded bg-emerald-700 text-white font-black text-lg flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">ENTERPRISE LOGISTICS</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Finance & Accounts Department<br />
                Plot 44, Commercial Industrial Sector<br />
                TIN: 104-889-231 • accounts@enterprisegroup.com
              </p>
            </div>

            <div className="text-left sm:text-right">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-emerald-900 uppercase tracking-tight">PAYMENT RECEIPT</h1>
              <div className="mt-2 space-y-1 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Receipt No: </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{payment.paymentNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Payment Date: </span>
                  <span className="font-bold text-slate-800">{payment.paymentDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Reference / TXN: </span>
                  <span className="font-mono font-semibold text-emerald-700">{payment.referenceNumber}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Received From & Payment Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Received From (Customer / Client)
              </span>
              <div className="font-bold text-base text-slate-900">{payment.customerName}</div>
              <div className="text-slate-600 mt-1">
                <span className="font-medium">Primary Reference PO: </span>
                <span className="font-mono font-semibold text-slate-800">{payment.poNumber}</span>
              </div>
            </div>

            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Payment Channel & Remittance Details
              </span>
              <div className="space-y-1 text-slate-700">
                <div><span className="text-slate-500">Payment Method:</span> <span className="font-bold text-slate-900">{payment.paymentMethod}</span></div>
                {payment.depositAccount && <div><span className="text-slate-500">Deposited To:</span> <span className="font-semibold text-slate-900">{payment.depositAccount}</span></div>}
                <div><span className="text-slate-500">Status:</span> <span className="font-bold text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Cleared & Allocated</span></div>
              </div>
            </div>
          </div>

          {/* Invoices Breakdown Table if available */}
          {payment.allocations && payment.allocations.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Invoices Allocation Breakdown
                </h4>
                <div className="print:hidden">
                  <TableExportToolbar
                    totalCount={payment.allocations.length}
                    onExportExcel={handleExportAllocationsExcel}
                    onExportPdf={handleExportAllocationsPdf}
                    size="sm"
                  />
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-auto max-h-[280px] scrollbar-thin">
                  <table className="w-full text-left text-xs min-w-[540px] border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="py-2.5 px-3 w-10 sticky top-0 bg-slate-900">#</th>
                      <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Invoice Number</th>
                      <th className="py-2.5 px-3 sticky top-0 bg-slate-900">PO Reference</th>
                      <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Invoice Total (TZS)</th>
                      <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Previously Paid (TZS)</th>
                      <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Allocated in this Payment (TZS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payment.allocations.map((alloc, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{alloc.invoiceNumber}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{alloc.poNumber}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">TZS {formatCurrency(alloc.invoiceTotal)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500">TZS {formatCurrency(alloc.alreadyPaid)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/40">TZS {formatCurrency(alloc.allocatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-700">Single Invoice Remittance: </span>
              <span className="font-mono text-slate-900 font-bold">{payment.invoiceNumber}</span> (PO: {payment.poNumber})
            </div>
          )}

          {/* Amount Box */}
          <div className="bg-emerald-50 border-2 border-emerald-500/40 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                Total Amount Received & Cleared
              </span>
              <span className="text-xs text-emerald-700">Official funds credited to company account</span>
            </div>
            <div className="text-3xl font-black text-emerald-950 font-mono">
              TZS {formatCurrency(payment.amountPaid)}
            </div>
          </div>

          {payment.notes && (
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-bold text-slate-700 block">Notes:</span>
              <p>{payment.notes}</p>
            </div>
          )}

          {/* Signature */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs">
            <div>
              <div className="text-slate-400 text-[11px] italic">
                Thank you for your prompt payment and business partnership.
              </div>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-12"></div>
              <div className="mt-2 font-bold text-slate-800">Authorized Finance Officer:</div>
              <div className="text-slate-500">Accounts & Treasury Department</div>
              <div className="text-slate-400 text-[10px] mt-0.5">Date & Stamp: ______________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
