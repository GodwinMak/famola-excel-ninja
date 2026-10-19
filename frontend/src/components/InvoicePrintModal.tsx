import React from 'react';
import { InvoiceRecord } from '../types';
import { formatCurrency, parseCleanNumber } from '../utils/storage';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { X, Printer, Download, Building2, CheckCircle } from 'lucide-react';

interface InvoicePrintModalProps {
  invoice: InvoiceRecord | null;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  onClose,
}) => {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportLinesExcel = () => {
    const headers = ['#', 'Item Description', 'UOM', 'Invoiced Qty', 'Unit Price (TZS)', 'Amount Excl. VAT (TZS)', 'VAT 18% (TZS)', 'Total Incl. VAT (TZS)'];
    const rows = invoice.lines.map((l, idx) => [
      idx + 1,
      l.itemDescription,
      l.unitOfMeasure,
      l.invoicedQuantity,
      formatCurrency(l.unitPrice),
      formatCurrency(l.valueBeforeVat),
      formatCurrency(l.vatAmount),
      formatCurrency(l.valueAfterVat)
    ]);
    exportTableToExcel(`Tax_Invoice_${invoice.invoiceNumber}_Lines`, headers, rows, `tax_invoice_${invoice.invoiceNumber.toLowerCase()}_lines`);
  };

  const handleExportLinesPdf = () => {
    const headers = ['#', 'Item Description', 'UOM', 'Qty', 'Unit Price (TZS)', 'Excl. VAT (TZS)', 'VAT (TZS)', 'Total (TZS)'];
    const rows = invoice.lines.map((l, idx) => [
      idx + 1,
      l.itemDescription,
      l.unitOfMeasure,
      l.invoicedQuantity,
      formatCurrency(l.unitPrice),
      formatCurrency(l.valueBeforeVat),
      formatCurrency(l.vatAmount),
      formatCurrency(l.valueAfterVat)
    ]);
    exportTableToPdf(`Tax Invoice #${invoice.invoiceNumber}`, headers, rows, {
      filenamePrefix: `tax_invoice_${invoice.invoiceNumber.toLowerCase()}`,
      subtitle: `Customer: ${invoice.customerName} • PO Ref: ${invoice.poNumber} • Date: ${invoice.invoiceDate}`,
      currencyNote: 'Currency: TZS',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 my-8">
        {/* Modal Top Control Bar (Hidden when printing) */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Official Tax Invoice Preview</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
              {invoice.invoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Document
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Paper Area */}
        <div id="printable-invoice" className="p-8 sm:p-12 text-slate-800 bg-white space-y-8 print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded bg-blue-700 text-white font-black text-lg flex items-center justify-center">
                  PO
                </div>
                <span className="text-2xl font-black tracking-tight text-slate-900">ENTERPRISE LOGISTICS</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Plot 44, Commercial Industrial Sector<br />
                TIN: 104-889-231 • VAT Reg: 40019283<br />
                Email: billing@enterprisegroup.com
              </p>
            </div>

            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-extrabold text-blue-900 uppercase tracking-tight">TAX INVOICE</h1>
              <div className="mt-2 space-y-1 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Invoice No: </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{invoice.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Invoice Date: </span>
                  <span className="font-bold text-slate-800">{invoice.invoiceDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Purchase Order No: </span>
                  <span className="font-mono font-bold text-blue-700">{invoice.poNumber}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Billed To & PO Contract Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Billed To (Customer)
              </span>
              <div className="font-bold text-sm text-slate-900">{invoice.customerName}</div>
              <div className="text-slate-600 mt-0.5">
                <span className="font-medium">Destination / Site: </span>
                {invoice.destination}
              </div>
            </div>

            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Contract & Order Reference
              </span>
              <div className="space-y-0.5 text-slate-700">
                <div><span className="text-slate-500">Contract Reference:</span> <span className="font-mono font-semibold text-slate-900">{invoice.contract}</span></div>
                <div><span className="text-slate-500">Original PO Date:</span> <span className="font-medium text-slate-800">{invoice.poDate}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-semibold text-emerald-700">Billed & Reconciled</span></div>
              </div>
            </div>
          </div>

          {/* Invoice Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Invoice Line Items ({invoice.lines.length})
              </span>
              <TableExportToolbar
                totalCount={invoice.lines.length}
                onExportExcel={handleExportLinesExcel}
                onExportPdf={handleExportLinesPdf}
                size="sm"
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-auto max-h-[380px] print:max-h-none scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="py-3 px-3 w-10 sticky top-0 bg-slate-900">#</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900">Item Description</th>
                      <th className="py-3 px-2 text-center sticky top-0 bg-slate-900">UOM</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Invoiced Qty</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Unit Price (TZS)</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Excl. VAT (TZS)</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">VAT 18% (TZS)</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Total (TZS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{line.itemDescription}</td>
                        <td className="py-3 px-2 text-center font-mono text-slate-600">{line.unitOfMeasure}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">{line.invoicedQuantity}</td>
                        {(() => {
                          const qty = parseCleanNumber(line.invoicedQuantity ?? 0);
                          const price = parseCleanNumber(line.unitPrice ?? 0);
                          const vRate =
                            line.vatRate !== undefined && line.vatRate !== null && Number(line.vatRate) > 0 && Number(line.vatRate) <= 1
                              ? Number(line.vatRate)
                              : 0.18;
                          const vb = (qty > 0 && price > 0)
                            ? Math.round(qty * price * 100) / 100
                            : (parseCleanNumber(line.valueBeforeVat) || Math.round(qty * price * 100) / 100);
                          const explicitVat = parseCleanNumber(line.vatAmount);
                          const va = (explicitVat > 0 && explicitVat <= vb * 0.35)
                            ? explicitVat
                            : Math.round(vb * vRate * 100) / 100;
                          const lineTot = Math.round((vb + va) * 100) / 100;
                          return (
                            <>
                              <td className="py-3 px-3 text-right text-slate-700">TZS {formatCurrency(price)}</td>
                              <td className="py-3 px-3 text-right text-slate-800">TZS {formatCurrency(vb)}</td>
                              <td className="py-3 px-3 text-right text-slate-500">TZS {formatCurrency(va)}</td>
                              <td className="py-3 px-3 text-right font-bold text-slate-900">TZS {formatCurrency(lineTot)}</td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Financial Breakdown & Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
            {/* Notes / Bank details */}
            <div className="text-xs space-y-3">
              {invoice.notes && (
                <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200/60 text-amber-900">
                  <span className="font-bold block text-[11px] uppercase">Notes / Instructions:</span>
                  <p className="mt-0.5">{invoice.notes}</p>
                </div>
              )}

              <div className="text-slate-500 space-y-1">
                <span className="font-bold uppercase text-[10px] text-slate-400 block">Payment Remittance:</span>
                <div>Bank: Standard Commercial Bank</div>
                <div>Account Name: Enterprise Logistics Ltd</div>
                <div>Account Number: 0150992384900</div>
                <div>Swift Code: SCBLTZTZ</div>
              </div>
            </div>

            {/* Totals Box */}
            {(() => {
              const lines = invoice.lines || [];
              let calcSub = 0;
              let calcVat = 0;
              for (const l of lines) {
                const qty = Number(l.invoicedQuantity ?? 0);
                const price = Number(l.unitPrice ?? 0);
                const vRate = l.vatRate !== undefined && l.vatRate !== null && Number(l.vatRate) > 0 && Number(l.vatRate) <= 1 ? Number(l.vatRate) : 0.18;
                const vb = (l.valueBeforeVat && Number(l.valueBeforeVat) > 0) ? Number(l.valueBeforeVat) : Math.round(qty * price * 100) / 100;
                const va = (l.vatAmount && Number(l.vatAmount) > 0 && Number(l.vatAmount) <= vb * 0.35) ? Number(l.vatAmount) : Math.round(vb * vRate * 100) / 100;
                calcSub += vb;
                calcVat += va;
              }
              calcSub = Math.round(calcSub * 100) / 100;
              calcVat = Math.round(calcVat * 100) / 100;
              const sub = (invoice.subtotalBeforeVat && invoice.subtotalBeforeVat > 0) ? invoice.subtotalBeforeVat : calcSub;
              const vt = (invoice.totalVat && invoice.totalVat > 0) ? invoice.totalVat : calcVat;
              const tot = (invoice.totalAfterVat && invoice.totalAfterVat > 0) ? invoice.totalAfterVat : Math.round((sub + vt) * 100) / 100;
              return (
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal (Before VAT):</span>
                    <span className="font-bold text-slate-900">TZS {formatCurrency(sub)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Value Added Tax (VAT 18%):</span>
                    <span className="font-bold text-slate-900">TZS {formatCurrency(vt)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-slate-900 pt-3 border-t border-slate-300">
                    <span>Total Amount Due:</span>
                    <span className="text-emerald-700 font-mono text-xl">TZS {formatCurrency(tot)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Authorized Signature Footer */}
          <div className="pt-12 grid grid-cols-2 gap-12 text-xs border-t border-slate-200">
            <div>
              <div className="border-b border-slate-300 h-10 w-48 mb-1"></div>
              <span className="text-slate-500 font-medium">Prepared & Authorized By</span>
            </div>
            <div className="text-right">
              <div className="border-b border-slate-300 h-10 w-48 mb-1 ml-auto"></div>
              <span className="text-slate-500 font-medium">Customer Acknowledgment & Stamp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
