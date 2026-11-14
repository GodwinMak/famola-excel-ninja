import React, { useMemo, useState } from 'react';
import { MatchingItem, InvoiceRecord, DeliveryNoteRecord } from '../types';
import { formatCurrency } from '../utils/storage';
import { 
  FileText, 
  Truck, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Boxes, 
  BookOpen,
  MapPin,
  Clock
} from 'lucide-react';

interface POLineReconciliationAuditViewProps {
  item: MatchingItem;
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  compact?: boolean;
}

/**
 * Extracts prefix, numeric part, and digit length from an invoice or delivery note number.
 * e.g. "KBH0528" -> { prefix: "KBH", num: 528, digitsLen: 4 }
 */
function parseSeriesNumber(val: string): { prefix: string; num: number; digitsLen: number } | null {
  if (!val) return null;
  const str = String(val).trim();
  const m = str.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const prefix = m[1];
  const digits = m[2];
  const num = parseInt(digits, 10);
  if (isNaN(num)) return null;
  return { prefix, num, digitsLen: digits.length };
}

function formatLeaf(prefix: string, num: number, digitsLen: number): string {
  return `${prefix}${String(num).padStart(digitsLen, '0')}`;
}

export const POLineReconciliationAuditView: React.FC<POLineReconciliationAuditViewProps> = ({
  item,
  invoices = [],
  deliveryNotes = [],
  compact = false
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const auditData = useMemo(() => {
    const poClean = (item.poNumber || '').trim().toLowerCase();
    const descClean = (item.itemDescription || '').trim().toLowerCase();
    const lineId = (item.poLineId || '').trim();

    // 1. Gather all matching Invoice lines for this PO Line
    const invoiceLines: {
      itemDescription: string;
      invoiceNumber: string;
      invoiceDate: string;
      customerName: string;
      destination: string;
      bookInfo: string;
      bookIndex?: number;
      leafIndex?: number;
      quantity: number;
      unitPrice: number;
      valueBeforeVat: number;
      vatRate: number;
      vatAmount: number;
      valueAfterVat: number;
      comment: string;
      status: string;
    }[] = [];

    (invoices || []).forEach((inv) => {
      if (!inv || inv.isCancelled || inv.status === 'CANCELLED') return;
      const invPoClean = (inv.poNumber || '').trim().toLowerCase();
      if (invPoClean !== poClean) return;

      const parsedSeries = parseSeriesNumber(inv.invoiceNumber);
      let bookInfo = '';
      let bookIndex: number | undefined;
      let leafIndex: number | undefined;
      if (parsedSeries) {
        bookIndex = Math.floor((parsedSeries.num - 1) / 50) + 1;
        leafIndex = ((parsedSeries.num - 1) % 50) + 1;
        const startLeaf = (bookIndex - 1) * 50 + 1;
        const endLeaf = bookIndex * 50;
        bookInfo = `Book #${bookIndex} (Leaf #${leafIndex}, ${formatLeaf(parsedSeries.prefix, startLeaf, parsedSeries.digitsLen)}–${formatLeaf(parsedSeries.prefix, endLeaf, parsedSeries.digitsLen)})`;
      }

      (inv.lines || []).forEach((l) => {
        if (!l) return;
        const matchById = lineId && l.poLineId && l.poLineId === lineId;
        const lineDesc = (l.itemDescription || '').trim().toLowerCase();
        const matchByDesc = !matchById && lineDesc && (lineDesc === descClean || descClean.includes(lineDesc) || lineDesc.includes(descClean));

        if (matchById || matchByDesc) {
          const qty = Number(l.invoicedQuantity || l.quantityInvoiced || 0);
          const price = Number(l.unitPrice || item.poUnitPrice || 0);
          const valBefore = Number(l.valueBeforeVat || l.totalBeforeVat || (qty * price));
          const vatR = Number(l.vatRate || 0.18);
          const vatAmt = Number(l.vatAmount || (valBefore * vatR));
          const valAfter = Number(l.valueAfterVat || l.totalAfterVat || (valBefore + vatAmt));

          invoiceLines.push({
            itemDescription: l.itemDescription || item.itemDescription,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate || 'N/A',
            customerName: inv.customerName,
            destination: inv.destination || item.destination || 'N/A',
            bookInfo,
            bookIndex,
            leafIndex,
            quantity: qty,
            unitPrice: price,
            valueBeforeVat: valBefore,
            vatRate: vatR,
            vatAmount: vatAmt,
            valueAfterVat: valAfter,
            comment: l.comment || inv.comment || 'Okay',
            status: inv.status || 'ACTIVE',
          });
        }
      });
    });

    // 2. Gather all matching Delivery Note lines for this PO Line
    const deliveryLines: {
      itemDescription: string;
      deliveryNoteNumber: string;
      deliveryDate: string;
      customerName: string;
      destination: string;
      bookInfo: string;
      bookIndex?: number;
      leafIndex?: number;
      quantity: number;
      unitPrice: number;
      valueBeforeVat: number;
      vatRate: number;
      vatAmount: number;
      totalDeliveredValue: number;
      carrier: string;
      vehicleNumber: string;
      driverName: string;
      receivedBy: string;
      comment: string;
      status: string;
    }[] = [];

    (deliveryNotes || []).forEach((dn) => {
      if (!dn || dn.isCancelled || dn.status === 'CANCELLED') return;
      const dnPoClean = (dn.poNumber || '').trim().toLowerCase();
      if (dnPoClean !== poClean) return;

      const parsedSeries = parseSeriesNumber(dn.deliveryNoteNumber);
      let bookInfo = '';
      let bookIndex: number | undefined;
      let leafIndex: number | undefined;
      if (parsedSeries) {
        bookIndex = Math.floor((parsedSeries.num - 1) / 50) + 1;
        leafIndex = ((parsedSeries.num - 1) % 50) + 1;
        const startLeaf = (bookIndex - 1) * 50 + 1;
        const endLeaf = bookIndex * 50;
        bookInfo = `Book #${bookIndex} (Leaf #${leafIndex}, ${formatLeaf(parsedSeries.prefix, startLeaf, parsedSeries.digitsLen)}–${formatLeaf(parsedSeries.prefix, endLeaf, parsedSeries.digitsLen)})`;
      }

      (dn.lines || []).forEach((l) => {
        if (!l) return;
        const matchById = lineId && l.poLineId && l.poLineId === lineId;
        const lineDesc = (l.itemDescription || '').trim().toLowerCase();
        const matchByDesc = !matchById && lineDesc && (lineDesc === descClean || descClean.includes(lineDesc) || lineDesc.includes(descClean));

        if (matchById || matchByDesc) {
          const qty = Number(l.deliveredQuantity || 0);
          const price = Number(l.unitPrice || item.poUnitPrice || 0);
          const valBefore = Number(l.valueBeforeVat || l.totalBeforeVat || (qty * price));
          const vatR = Number(l.vatRate || 0.18);
          const vatAmt = Number(l.vatAmount || (valBefore * vatR));
          const valDelivered = Number(l.totalDeliveredValue || l.valueAfterVat || (valBefore + vatAmt));

          deliveryLines.push({
            itemDescription: l.itemDescription || item.itemDescription,
            deliveryNoteNumber: dn.deliveryNoteNumber,
            deliveryDate: dn.deliveryDate || 'N/A',
            customerName: dn.customerName,
            destination: dn.destination || item.destination || 'N/A',
            bookInfo,
            bookIndex,
            leafIndex,
            quantity: qty,
            unitPrice: price,
            valueBeforeVat: valBefore,
            vatRate: vatR,
            vatAmount: vatAmt,
            totalDeliveredValue: valDelivered,
            carrier: dn.carrier || 'N/A',
            vehicleNumber: dn.vehicleNumber || 'N/A',
            driverName: dn.driverName || 'N/A',
            receivedBy: dn.receivedBy || 'N/A',
            comment: l.comment || dn.comment || 'Okay',
            status: dn.status || 'ACTIVE',
          });
        }
      });
    });

    const totalInvoicedQty = invoiceLines.reduce((s, i) => s + i.quantity, 0);
    const totalInvoicedBeforeVat = invoiceLines.reduce((s, i) => s + i.valueBeforeVat, 0);
    const totalInvoicedVat = invoiceLines.reduce((s, i) => s + i.vatAmount, 0);
    const totalInvoicedVal = invoiceLines.reduce((s, i) => s + i.valueAfterVat, 0);

    const totalDeliveredQty = deliveryLines.reduce((s, d) => s + d.quantity, 0);
    const totalDeliveredBeforeVat = deliveryLines.reduce((s, d) => s + d.valueBeforeVat, 0);
    const totalDeliveredVat = deliveryLines.reduce((s, d) => s + d.vatAmount, 0);
    const totalDeliveredVal = deliveryLines.reduce((s, d) => s + d.totalDeliveredValue, 0);

    const remainingToInvoiceQty = Math.max(0, item.poQuantity - totalInvoicedQty);
    const remainingToDeliverQty = Math.max(0, item.poQuantity - totalDeliveredQty);

    const poValueBeforeVat = item.valueBeforeVat || (item.poTotalValue / 1.18);
    const poVatAmount = item.vatAmount || (item.poTotalValue - poValueBeforeVat);

    // Matching variances
    const varPoVsInvQty = item.poQuantity - totalInvoicedQty;
    const varPoVsInvVal = item.poTotalValue - totalInvoicedVal;

    const varPoVsDelQty = item.poQuantity - totalDeliveredQty;
    const varPoVsDelVal = item.poTotalValue - totalDeliveredVal;

    const varDelVsInvQty = totalDeliveredQty - totalInvoicedQty;
    const varDelVsInvVal = totalDeliveredVal - totalInvoicedVal;

    return {
      invoiceLines,
      deliveryLines,
      totalInvoicedQty,
      totalInvoicedBeforeVat,
      totalInvoicedVat,
      totalInvoicedVal,
      totalDeliveredQty,
      totalDeliveredBeforeVat,
      totalDeliveredVat,
      totalDeliveredVal,
      remainingToInvoiceQty,
      remainingToDeliverQty,
      poValueBeforeVat,
      poVatAmount,
      varPoVsInvQty,
      varPoVsInvVal,
      varPoVsDelQty,
      varPoVsDelVal,
      varDelVsInvQty,
      varDelVsInvVal,
    };
  }, [item, invoices, deliveryNotes]);

  return (
    <div className={`space-y-4 font-sans text-xs ${compact ? 'p-3.5 bg-slate-50/90 rounded-xl border border-slate-300 shadow-sm' : ''}`}>
      {/* =========================================================================
          TOP MASTER HEADER: PO • CUSTOMER • CONTRACT
          ========================================================================= */}
      <div className="bg-slate-900 text-white rounded-lg p-3.5 shadow-xs border border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Purchase Order</span>
            <span className="font-mono font-black text-white text-base tracking-wide">{item.poNumber}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Customer / Client</span>
            <span className="font-bold text-white text-sm sm:text-base truncate block" title={item.customerName}>{item.customerName}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Contract / Destination</span>
            <span className="font-semibold text-slate-200 text-xs block">
              {item.contract || 'General Contract'} • {item.destination || 'Main Store'}
            </span>
          </div>
          <div className="text-left sm:text-right bg-slate-800/80 p-2 rounded-md border border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 block">Target PO Line Baseline</span>
            <span className="font-mono font-black text-white text-sm sm:text-base">
              {item.poQuantity.toLocaleString()} {item.unitOfMeasure}
            </span>
            <span className="font-mono font-bold text-emerald-400 text-xs block">
              TZS {formatCurrency(item.poTotalValue)}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ALIGNED 3-WAY RECONCILIATION SUMMARY (PO vs INVOICED vs DELIVERED)
          Shows exact matching variance in both QTY and TOTAL AMOUNT
          ========================================================================= */}
      <div className="bg-white rounded-lg border-2 border-slate-300 shadow-xs overflow-hidden">
        <div className="bg-slate-800 text-white px-3.5 py-2 flex items-center justify-between border-b border-slate-700">
          <span className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Boxes className="w-4 h-4 text-sky-400" />
            <span>3-Way Column Alignment &amp; Matching Variance (PO vs Invoiced vs Delivered)</span>
          </span>
          <span className="text-[11px] font-mono text-slate-300">
            Unit: {item.unitOfMeasure} • Currency: TZS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-2 px-3 text-center">#</th>
                <th className="py-2 px-3">Reconciliation Stream</th>
                <th className="py-2 px-3">Reference / Code</th>
                <th className="py-2 px-3">Doc Date</th>
                <th className="py-2 px-3 text-right">Quantity</th>
                <th className="py-2 px-3 text-right">Unit Price</th>
                <th className="py-2 px-3 text-right">Total Excl. VAT</th>
                <th className="py-2 px-3 text-right">VAT Amount</th>
                <th className="py-2 px-3 text-right">Total Amount (TZS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {/* Row 1: PO Baseline */}
              <tr className="bg-blue-50/40 hover:bg-blue-50/70 transition-colors">
                <td className="py-2 px-3 text-center font-bold text-slate-700">1</td>
                <td className="py-2 px-3 font-black text-slate-900">
                  <span className="inline-flex items-center gap-1 text-blue-900 font-bold">
                    <BookOpen className="w-3.5 h-3.5 text-blue-700" /> PO Ordered Item
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold text-blue-800">{item.poNumber}</td>
                <td className="py-2 px-3 text-slate-700 font-mono">{item.poDate || 'PO Date'}</td>
                <td className="py-2 px-3 text-right font-mono font-black text-slate-950 text-sm">
                  {item.poQuantity.toLocaleString()} {item.unitOfMeasure}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(item.poUnitPrice)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(auditData.poValueBeforeVat)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                  TZS {formatCurrency(auditData.poVatAmount)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-blue-950 text-sm bg-blue-100/40">
                  TZS {formatCurrency(item.poTotalValue)}
                </td>
              </tr>

              {/* Row 2: Invoices Issued */}
              <tr className="bg-sky-50/30 hover:bg-sky-50/60 transition-colors">
                <td className="py-2 px-3 text-center font-bold text-slate-700">2</td>
                <td className="py-2 px-3 font-black text-slate-900">
                  <span className="inline-flex items-center gap-1 text-sky-900 font-bold">
                    <FileText className="w-3.5 h-3.5 text-sky-700" /> Invoices Billed
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold text-sky-900">
                  {auditData.invoiceLines.length} Invoice(s)
                </td>
                <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">
                  {auditData.invoiceLines[0]?.invoiceDate || 'N/A'}
                </td>
                <td className={`py-2 px-3 text-right font-mono font-black text-sm ${
                  auditData.totalInvoicedQty > item.poQuantity ? 'text-red-700 font-black' : 'text-slate-950'
                }`}>
                  {auditData.totalInvoicedQty.toLocaleString()} {item.unitOfMeasure}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(item.poUnitPrice)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(auditData.totalInvoicedBeforeVat)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                  TZS {formatCurrency(auditData.totalInvoicedVat)}
                </td>
                <td className={`py-2 px-3 text-right font-mono font-black text-sm bg-sky-100/40 ${
                  auditData.totalInvoicedVal > item.poTotalValue ? 'text-red-700' : 'text-slate-950'
                }`}>
                  TZS {formatCurrency(auditData.totalInvoicedVal)}
                </td>
              </tr>

              {/* Row 3: Goods Delivered */}
              <tr className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors">
                <td className="py-2 px-3 text-center font-bold text-slate-700">3</td>
                <td className="py-2 px-3 font-black text-slate-900">
                  <span className="inline-flex items-center gap-1 text-slate-900 font-bold">
                    <Truck className="w-3.5 h-3.5 text-slate-700" /> Goods Delivered
                  </span>
                </td>
                <td className="py-2 px-3 font-mono font-bold text-slate-800">
                  {auditData.deliveryLines.length} DN(s)
                </td>
                <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">
                  {auditData.deliveryLines[0]?.deliveryDate || 'N/A'}
                </td>
                <td className={`py-2 px-3 text-right font-mono font-black text-sm ${
                  auditData.totalDeliveredQty > item.poQuantity ? 'text-amber-800 font-black' : 'text-slate-950'
                }`}>
                  {auditData.totalDeliveredQty.toLocaleString()} {item.unitOfMeasure}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(item.poUnitPrice)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                  TZS {formatCurrency(auditData.totalDeliveredBeforeVat)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                  TZS {formatCurrency(auditData.totalDeliveredVat)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-black text-slate-950 text-sm bg-slate-200/40">
                  TZS {formatCurrency(auditData.totalDeliveredVal)}
                </td>
              </tr>
            </tbody>

            {/* Matching Variance Summary Rows */}
            <tfoot className="border-t-2 border-slate-400 bg-slate-100 font-mono text-xs divide-y divide-slate-200">
              {/* Variance: PO vs Invoiced */}
              <tr className="bg-amber-50/50">
                <td className="py-2 px-3 text-center font-bold text-amber-900">Δ</td>
                <td colSpan={3} className="py-2 px-3 font-black text-slate-900">
                  PO vs Invoiced Variance:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varPoVsInvQty < 0 
                    ? 'text-red-700 bg-red-100/60' 
                    : auditData.varPoVsInvQty === 0 
                    ? 'text-emerald-800' 
                    : 'text-amber-900'
                }`}>
                  {auditData.varPoVsInvQty === 0 ? (
                    '0 (Matched)'
                  ) : auditData.varPoVsInvQty < 0 ? (
                    `${auditData.varPoVsInvQty.toLocaleString()} ${item.unitOfMeasure} (Over-Inv)`
                  ) : (
                    `+${auditData.varPoVsInvQty.toLocaleString()} ${item.unitOfMeasure} (Pending)`
                  )}
                </td>
                <td colSpan={3} className="py-2 px-3 text-right text-slate-600 font-sans text-[11px]">
                  Total Invoiced Variance:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varPoVsInvVal < 0 
                    ? 'text-red-700 bg-red-100/60' 
                    : auditData.varPoVsInvVal === 0 
                    ? 'text-emerald-800' 
                    : 'text-amber-900'
                }`}>
                  {auditData.varPoVsInvVal === 0 ? (
                    'TZS 0 (Matched)'
                  ) : auditData.varPoVsInvVal < 0 ? (
                    `-TZS ${formatCurrency(Math.abs(auditData.varPoVsInvVal))}`
                  ) : (
                    `+TZS ${formatCurrency(auditData.varPoVsInvVal)}`
                  )}
                </td>
              </tr>

              {/* Variance: PO vs Delivered */}
              <tr className="bg-slate-50">
                <td className="py-2 px-3 text-center font-bold text-slate-700">Δ</td>
                <td colSpan={3} className="py-2 px-3 font-black text-slate-900">
                  PO vs Delivered Variance:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varPoVsDelQty < 0 
                    ? 'text-amber-800 bg-amber-100/60' 
                    : auditData.varPoVsDelQty === 0 
                    ? 'text-emerald-800' 
                    : 'text-slate-800'
                }`}>
                  {auditData.varPoVsDelQty === 0 ? (
                    '0 (Matched)'
                  ) : auditData.varPoVsDelQty < 0 ? (
                    `${auditData.varPoVsDelQty.toLocaleString()} ${item.unitOfMeasure} (Over-Del)`
                  ) : (
                    `+${auditData.varPoVsDelQty.toLocaleString()} ${item.unitOfMeasure} (Pending)`
                  )}
                </td>
                <td colSpan={3} className="py-2 px-3 text-right text-slate-600 font-sans text-[11px]">
                  Total Delivered Variance:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varPoVsDelVal < 0 
                    ? 'text-amber-800' 
                    : auditData.varPoVsDelVal === 0 
                    ? 'text-emerald-800' 
                    : 'text-slate-800'
                }`}>
                  {auditData.varPoVsDelVal === 0 ? (
                    'TZS 0 (Matched)'
                  ) : auditData.varPoVsDelVal < 0 ? (
                    `-TZS ${formatCurrency(Math.abs(auditData.varPoVsDelVal))}`
                  ) : (
                    `+TZS ${formatCurrency(auditData.varPoVsDelVal)}`
                  )}
                </td>
              </tr>

              {/* Variance: Delivered vs Invoiced */}
              <tr className="bg-indigo-50/50">
                <td className="py-2 px-3 text-center font-bold text-indigo-900">Δ</td>
                <td colSpan={3} className="py-2 px-3 font-black text-slate-900">
                  Goods Delivered vs Invoiced Variance:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varDelVsInvQty === 0 
                    ? 'text-emerald-800' 
                    : auditData.varDelVsInvQty > 0 
                    ? 'text-blue-900' 
                    : 'text-red-700'
                }`}>
                  {auditData.varDelVsInvQty === 0 ? (
                    '0 (Delivered = Invoiced)'
                  ) : auditData.varDelVsInvQty > 0 ? (
                    `+${auditData.varDelVsInvQty.toLocaleString()} ${item.unitOfMeasure} (Deliv > Inv)`
                  ) : (
                    `${auditData.varDelVsInvQty.toLocaleString()} ${item.unitOfMeasure} (Inv > Deliv)`
                  )}
                </td>
                <td colSpan={3} className="py-2 px-3 text-right text-slate-600 font-sans text-[11px]">
                  Net Unbilled Goods Value:
                </td>
                <td className={`py-2 px-3 text-right font-black ${
                  auditData.varDelVsInvVal === 0 
                    ? 'text-emerald-800' 
                    : auditData.varDelVsInvVal > 0 
                    ? 'text-blue-900' 
                    : 'text-red-700'
                }`}>
                  {auditData.varDelVsInvVal === 0 ? (
                    'TZS 0'
                  ) : auditData.varDelVsInvVal > 0 ? (
                    `+TZS ${formatCurrency(auditData.varDelVsInvVal)}`
                  ) : (
                    `-TZS ${formatCurrency(Math.abs(auditData.varDelVsInvVal))}`
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: INVOICE TABLE (EXACT ATTACHED PDF LAYOUT)
          Aligned vertically with same colgroup and table-fixed
          ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-sky-800" />
            <span className="uppercase tracking-wider">Invoice Details</span>
          </h3>
          <span className="text-[11px] text-slate-700 font-bold font-mono bg-sky-100 text-sky-950 px-2 py-0.5 rounded border border-sky-300">
            {auditData.invoiceLines.length} Invoiced Leave(s)
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border-2 border-sky-400 bg-white shadow-2xs">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead className="bg-[#bfe5fd] text-slate-950 font-black border-b-2 border-sky-400">
              <tr>
                <th className="py-2.5 px-3 text-center text-slate-900 font-mono font-black">&gt;</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Item Description</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Invoice No.</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Invoice Date</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Invoiced QTY</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Unit Price</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Total Before VAT</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">VAT Amount</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Total Invoiced (TZS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {auditData.invoiceLines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-600 font-medium italic bg-sky-50/20">
                    No invoice leaves issued yet for this PO line.
                  </td>
                </tr>
              ) : (
                auditData.invoiceLines.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-sky-50/60 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-900 font-mono text-[11px] font-black">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-950 truncate" title={inv.itemDescription}>
                      {inv.itemDescription}
                    </td>
                    <td className="py-2 px-3 font-mono font-black text-blue-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{inv.invoiceNumber}</span>
                        {inv.bookInfo && (
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.2 rounded font-mono" title={inv.bookInfo}>
                            {inv.bookInfo.split(' (')[0]}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(inv.invoiceNumber)}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer ml-0.5"
                          title="Copy Invoice Number"
                        >
                          {copiedCode === inv.invoiceNumber ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-800 font-mono whitespace-nowrap font-medium">
                      {inv.invoiceDate}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-950 whitespace-nowrap">
                      {inv.quantity.toLocaleString()} {item.unitOfMeasure}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap font-bold">
                      TZS {formatCurrency(inv.unitPrice)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap font-bold">
                      TZS {formatCurrency(inv.valueBeforeVat)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap font-medium">
                      TZS {formatCurrency(inv.vatAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-950 whitespace-nowrap bg-sky-50/50">
                      TZS {formatCurrency(inv.valueAfterVat)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Double-underline accounting Total Row */}
            <tfoot className="border-t-2 border-slate-400 border-b-4 border-double border-slate-950 font-black font-mono bg-slate-100 text-slate-950">
              <tr>
                <td className="py-2 px-3"></td>
                <td colSpan={3} className="py-2 px-3 font-black text-slate-950 text-xs uppercase tracking-wide">
                  Total Invoiced:
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  {auditData.totalInvoicedQty.toLocaleString()} {item.unitOfMeasure}
                </td>
                <td className="py-2 px-3"></td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  TZS {formatCurrency(auditData.totalInvoicedBeforeVat)}
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  TZS {formatCurrency(auditData.totalInvoicedVat)}
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap bg-sky-100/60">
                  TZS {formatCurrency(auditData.totalInvoicedVal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Status & Variance Line directly beneath Invoice Table */}
        <div className="flex flex-wrap items-center justify-between px-2 py-1.5 mt-1 text-xs">
          <span className="text-slate-600 font-medium">
            PO Ordered Limit: <strong className="text-slate-900">{item.poQuantity.toLocaleString()} {item.unitOfMeasure}</strong> (TZS {formatCurrency(item.poTotalValue)})
          </span>
          {auditData.totalInvoicedQty > item.poQuantity ? (
            <div className="text-rose-700 font-bold flex items-center gap-2">
              <span className="uppercase tracking-wider font-black text-red-700">Over Invoiced</span>
              <span className="font-mono bg-rose-100 text-rose-950 px-2.5 py-0.5 rounded border border-rose-400 font-black">
                {-(auditData.totalInvoicedQty - item.poQuantity)} {item.unitOfMeasure} Overbilled (-TZS {formatCurrency(Math.abs(auditData.totalInvoicedVal - item.poTotalValue))})
              </span>
            </div>
          ) : auditData.totalInvoicedQty === item.poQuantity && auditData.totalInvoicedQty > 0 ? (
            <div className="text-emerald-900 font-bold flex items-center gap-1.5 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Status: Fully Invoiced (Matched 100%)</span>
            </div>
          ) : (
            <div className="text-amber-950 font-bold flex items-center gap-1.5 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-400">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              <span>Status: Partially Invoiced ({item.poQuantity - auditData.totalInvoicedQty} {item.unitOfMeasure} remaining • TZS {formatCurrency(Math.max(0, item.poTotalValue - auditData.totalInvoicedVal))})</span>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: DELIVERY TABLE (EXACT ATTACHED PDF LAYOUT)
          Aligned vertically with same colgroup and table-fixed
          ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-slate-800" />
            <span className="uppercase tracking-wider">Delivery Details</span>
          </h3>
          <span className="text-[11px] text-slate-700 font-bold font-mono bg-slate-200 text-slate-950 px-2 py-0.5 rounded border border-slate-300">
            {auditData.deliveryLines.length} Delivered Leave(s)
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border-2 border-slate-400 bg-white shadow-2xs">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead className="bg-[#e2e8f0] text-slate-950 font-black border-b-2 border-slate-400">
              <tr>
                <th className="py-2.5 px-3 text-center text-slate-900 font-mono font-black">&gt;</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Item Description</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Delivery No.</th>
                <th className="py-2.5 px-3 font-black text-slate-950">Delivery Date</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Delivered QTY</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Unit Price</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Total Before VAT</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">VAT Amount</th>
                <th className="py-2.5 px-3 text-right font-black text-slate-950">Total Delivered (TZS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {auditData.deliveryLines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-600 font-medium italic bg-slate-50/50">
                    No delivery note leaves recorded yet for this PO line.
                  </td>
                </tr>
              ) : (
                auditData.deliveryLines.map((dn, idx) => (
                  <tr key={idx} className="hover:bg-slate-100/70 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-900 font-mono text-[11px] font-black">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-950 truncate" title={dn.itemDescription}>
                      {dn.itemDescription}
                    </td>
                    <td className="py-2 px-3 font-mono font-black text-slate-950 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{dn.deliveryNoteNumber}</span>
                        {dn.bookInfo && (
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.2 rounded font-mono" title={dn.bookInfo}>
                            {dn.bookInfo.split(' (')[0]}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(dn.deliveryNoteNumber)}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer ml-0.5"
                          title="Copy Delivery Note Number"
                        >
                          {copiedCode === dn.deliveryNoteNumber ? (
                            <Check className="w-3.5 h-3.5 text-indigo-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-800 font-mono whitespace-nowrap font-medium">
                      {dn.deliveryDate}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-950 whitespace-nowrap">
                      {dn.quantity.toLocaleString()} {item.unitOfMeasure}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap font-bold">
                      TZS {formatCurrency(dn.unitPrice)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap font-bold">
                      TZS {formatCurrency(dn.valueBeforeVat)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap font-medium">
                      TZS {formatCurrency(dn.vatAmount)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-slate-950 whitespace-nowrap bg-slate-100/50">
                      TZS {formatCurrency(dn.totalDeliveredValue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Double-underline accounting Total Row */}
            <tfoot className="border-t-2 border-slate-400 border-b-4 border-double border-slate-950 font-black font-mono bg-slate-100 text-slate-950">
              <tr>
                <td className="py-2 px-3"></td>
                <td colSpan={3} className="py-2 px-3 font-black text-slate-950 text-xs uppercase tracking-wide">
                  Total Delivered:
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  {auditData.totalDeliveredQty.toLocaleString()} {item.unitOfMeasure}
                </td>
                <td className="py-2 px-3"></td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  TZS {formatCurrency(auditData.totalDeliveredBeforeVat)}
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap">
                  TZS {formatCurrency(auditData.totalDeliveredVat)}
                </td>
                <td className="py-2 px-3 text-right font-black text-slate-950 text-xs whitespace-nowrap bg-slate-200/60">
                  TZS {formatCurrency(auditData.totalDeliveredVal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Status & Variance Line directly beneath Delivery Table */}
        <div className="flex flex-wrap items-center justify-between px-2 py-1.5 mt-1 text-xs">
          <span className="text-slate-600 font-medium">
            PO Ordered Limit: <strong className="text-slate-900">{item.poQuantity.toLocaleString()} {item.unitOfMeasure}</strong> (TZS {formatCurrency(item.poTotalValue)})
          </span>
          {auditData.totalDeliveredQty > item.poQuantity ? (
            <div className="text-rose-700 font-bold flex items-center gap-2">
              <span className="uppercase tracking-wider font-black text-red-700">Status: Over delivery</span>
              <span className="font-mono bg-rose-100 text-rose-950 px-2.5 py-0.5 rounded border border-rose-400 font-black">
                {auditData.totalDeliveredQty - item.poQuantity} {item.unitOfMeasure} (Over-delivered • TZS {formatCurrency(auditData.totalDeliveredVal - item.poTotalValue)})
              </span>
            </div>
          ) : auditData.totalDeliveredQty === item.poQuantity && auditData.totalDeliveredQty > 0 ? (
            <div className="text-emerald-900 font-bold flex items-center gap-1.5 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>Status: Fully Delivered (Matched 100%)</span>
            </div>
          ) : (
            <div className="text-amber-950 font-bold flex items-center gap-1.5 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-400">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              <span>Status: Partially Delivered ({item.poQuantity - auditData.totalDeliveredQty} {item.unitOfMeasure} pending dispatch • TZS {formatCurrency(Math.max(0, item.poTotalValue - auditData.totalDeliveredVal))})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
