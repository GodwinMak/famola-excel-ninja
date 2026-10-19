import React from 'react';
import { DeliveryNoteRecord } from '../types';
import { formatCurrency } from '../utils/storage';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { X, Printer, Truck, CheckCircle, Package } from 'lucide-react';

interface DeliveryNotePrintModalProps {
  deliveryNote: DeliveryNoteRecord | null;
  onClose: () => void;
}

export const DeliveryNotePrintModal: React.FC<DeliveryNotePrintModalProps> = ({
  deliveryNote,
  onClose,
}) => {
  if (!deliveryNote) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportDeliveryLinesExcel = () => {
    const headers = ['#', 'Item Description', 'UOM', 'PO Total Qty', 'Delivered Qty', 'Unit Price (TZS)', 'Delivered Value (TZS)'];
    const rows = deliveryNote.lines.map((l, idx) => [
      idx + 1,
      l.itemDescription,
      l.unitOfMeasure,
      l.poQuantity,
      l.deliveredQuantity,
      formatCurrency(l.unitPrice),
      formatCurrency(l.valueAfterVat),
    ]);
    exportTableToExcel(
      `DeliveryNote_${deliveryNote.deliveryNoteNumber}_Items`,
      headers,
      rows,
      `delivery_note_${deliveryNote.deliveryNoteNumber.toLowerCase()}_items`
    );
  };

  const handleExportDeliveryLinesPdf = () => {
    const headers = ['#', 'Item Description', 'UOM', 'PO Qty', 'Delivered Qty', 'Unit Price (TZS)', 'Value (TZS)'];
    const rows = deliveryNote.lines.map((l, idx) => [
      idx + 1,
      l.itemDescription,
      l.unitOfMeasure,
      l.poQuantity,
      l.deliveredQuantity,
      formatCurrency(l.unitPrice),
      formatCurrency(l.valueAfterVat),
    ]);
    exportTableToPdf(
      `Delivery Note #${deliveryNote.deliveryNoteNumber} - Items Manifest`,
      headers,
      rows,
      {
        filenamePrefix: `delivery_note_${deliveryNote.deliveryNoteNumber.toLowerCase()}_items`,
        subtitle: `Consignee: ${deliveryNote.customerName} • PO: ${deliveryNote.poNumber}`,
        currencyNote: 'Currency: TZS',
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 my-8">
        {/* Modal Top Control Bar (Hidden when printing) */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Official Delivery Note Preview</span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
              {deliveryNote.deliveryNoteNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Delivery Note
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Delivery Note Paper Area */}
        <div id="printable-delivery-note" className="p-8 sm:p-12 text-slate-800 bg-white space-y-8 print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded bg-indigo-700 text-white font-black text-lg flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <span className="text-2xl font-black tracking-tight text-slate-900">ENTERPRISE LOGISTICS</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Central Logistics & Supply Depot<br />
                Plot 44, Commercial Industrial Sector<br />
                Dispatch Tel: +255 22 219 9000 • Email: dispatch@enterprisegroup.com
              </p>
            </div>

            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-extrabold text-indigo-950 uppercase tracking-tight">DELIVERY NOTE</h1>
              <div className="mt-2 space-y-1 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">DN Number: </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">{deliveryNote.deliveryNoteNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Delivery Date: </span>
                  <span className="font-bold text-slate-800">{deliveryNote.deliveryDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Purchase Order No: </span>
                  <span className="font-mono font-bold text-indigo-700">{deliveryNote.poNumber}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Consignee & Dispatch Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Consignee / Customer (Deliver To)
              </span>
              <div className="font-bold text-sm text-slate-900">{deliveryNote.customerName}</div>
              <div className="text-slate-600 mt-0.5">
                <span className="font-medium">Destination Site / Depot: </span>
                {deliveryNote.destination}
              </div>
            </div>

            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                Logistics & Transport Carrier Details
              </span>
              <div className="space-y-0.5 text-slate-700">
                <div><span className="text-slate-500">Carrier / Transporter:</span> <span className="font-semibold text-slate-900">{deliveryNote.carrier || 'Internal Fleet'}</span></div>
                {deliveryNote.vehicleNumber && <div><span className="text-slate-500">Vehicle / Reg No:</span> <span className="font-mono font-semibold text-slate-900">{deliveryNote.vehicleNumber}</span></div>}
                {deliveryNote.driverName && <div><span className="text-slate-500">Driver / Dispatcher:</span> <span className="font-semibold text-slate-900">{deliveryNote.driverName}</span></div>}
                <div><span className="text-slate-500">Contract Reference:</span> <span className="font-mono font-semibold text-slate-900">{deliveryNote.contract}</span></div>
              </div>
            </div>
          </div>

          {/* Delivery Note Line Items Table */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Dispatched Line Items Manifest
              </h4>
              <TableExportToolbar
                totalCount={deliveryNote.lines.length}
                onExportExcel={handleExportDeliveryLinesExcel}
                onExportPdf={handleExportDeliveryLinesPdf}
                size="sm"
              />
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-auto max-h-[300px] scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="py-3 px-3 w-10 sticky top-0 bg-slate-900">#</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900">Item Description</th>
                      <th className="py-3 px-2 text-center sticky top-0 bg-slate-900">UOM</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">PO Total Qty</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Delivered Qty</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Unit Price (TZS)</th>
                      <th className="py-3 px-3 text-right sticky top-0 bg-slate-900">Delivered Value (TZS)</th>
                    </tr>
                  </thead>
              <tbody className="divide-y divide-slate-200">
                {deliveryNote.lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{line.itemDescription}</td>
                    <td className="py-3 px-2 text-center font-mono text-slate-600">{line.unitOfMeasure}</td>
                    <td className="py-3 px-3 text-right text-slate-500">{line.poQuantity}</td>
                    <td className="py-3 px-3 text-right font-bold text-indigo-700 bg-indigo-50/40">{line.deliveredQuantity}</td>
                    <td className="py-3 px-3 text-right text-slate-700">TZS {formatCurrency(line.unitPrice)}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">TZS {formatCurrency(line.valueAfterVat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

          {/* Summary & Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
            {/* Notes / Special Instructions */}
            <div className="text-xs space-y-3">
              {deliveryNote.notes && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800">
                  <span className="font-bold block text-[11px] uppercase text-slate-600">Special Delivery Notes:</span>
                  <p className="mt-0.5">{deliveryNote.notes}</p>
                </div>
              )}
              <div className="text-slate-500 text-[11px] italic">
                Goods received in good condition, correct specification, and confirmed count. Any damages or shortages must be reported within 24 hours of delivery.
              </div>
            </div>

            {/* Total summary */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Items Delivered:</span>
                <span className="font-bold text-slate-900">{deliveryNote.totalDeliveredQuantity} units</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Line Items:</span>
                <span className="font-bold text-slate-900">{deliveryNote.lines.length} items</span>
              </div>
              <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-bold text-indigo-900">
                <span>Total Delivered Value:</span>
                <span className="font-mono text-base">TZS {formatCurrency(deliveryNote.totalDeliveredValue)}</span>
              </div>
            </div>
          </div>

          {/* Dual Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs">
            <div>
              <div className="border-b border-slate-400 pb-12"></div>
              <div className="mt-2 font-bold text-slate-800">Dispatched By:</div>
              <div className="text-slate-500">Warehouse & Logistics Dispatch Officer</div>
              <div className="text-slate-400 text-[10px] mt-0.5">Date & Stamp: ______________________</div>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-12"></div>
              <div className="mt-2 font-bold text-slate-800">Received & Confirmed By:</div>
              <div className="text-slate-500">{deliveryNote.receivedBy || 'Authorized Site Receiver / Consignee'}</div>
              <div className="text-slate-400 text-[10px] mt-0.5">Date & Signature: ______________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
