import React, { useState, useEffect } from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Truck, 
  CreditCard,
  MessageSquare,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import { 
  DocumentIssueRecord, 
  LineItemIssue, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  AppUser,
  DocumentAttachment
} from '../types';
import { formatCurrency } from '../utils/storage';
import { ImageAttachmentManager } from './ImageAttachmentManager';

interface FlagIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveIssue: (issue: DocumentIssueRecord) => void;
  currentUser?: AppUser;
  // Pre-selected entity if flagged from a specific row
  initialEntity?: {
    type: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
    invoice?: InvoiceRecord;
    deliveryNote?: DeliveryNoteRecord;
    payment?: PaymentRecord;
  } | null;
  // Available lists to pick from if opened globally
  invoices?: InvoiceRecord[];
  deliveryNotes?: DeliveryNoteRecord[];
  payments?: PaymentRecord[];
}

export const FlagIssueModal: React.FC<FlagIssueModalProps> = ({
  isOpen,
  onClose,
  onSaveIssue,
  currentUser,
  initialEntity,
  invoices = [],
  deliveryNotes = [],
  payments = [],
}) => {
  const [entityType, setEntityType] = useState<'INVOICE' | 'DELIVERY' | 'PAYMENT'>('INVOICE');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  
  const [issueTitle, setIssueTitle] = useState('');
  const [issueType, setIssueType] = useState<DocumentIssueRecord['issueType']>('Quantity Discrepancy');
  const [severity, setSeverity] = useState<DocumentIssueRecord['severity']>('HIGH');
  const [headerComment, setHeaderComment] = useState('');
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  
  // Line-level issues map: lineId -> { issueComment: string; workComment: string }
  const [lineComments, setLineComments] = useState<Record<string, { issueComment: string; workComment: string; isFlagged: boolean }>>({});

  // Reset and sync with initialEntity
  useEffect(() => {
    if (!isOpen) return;

    if (initialEntity) {
      setEntityType(initialEntity.type);
      if (initialEntity.type === 'INVOICE' && initialEntity.invoice) {
        setSelectedEntityId(initialEntity.invoice.id);
        initLinesForInvoice(initialEntity.invoice);
        setAttachments(initialEntity.invoice.attachments || []);
      } else if (initialEntity.type === 'DELIVERY' && initialEntity.deliveryNote) {
        setSelectedEntityId(initialEntity.deliveryNote.id);
        initLinesForDN(initialEntity.deliveryNote);
        setAttachments(initialEntity.deliveryNote.attachments || []);
      } else if (initialEntity.type === 'PAYMENT' && initialEntity.payment) {
        setSelectedEntityId(initialEntity.payment.id);
        initLinesForPayment(initialEntity.payment);
        setAttachments([]);
      }
    } else {
      // Pick first available
      if (invoices.length > 0) {
        setEntityType('INVOICE');
        setSelectedEntityId(invoices[0].id);
        initLinesForInvoice(invoices[0]);
        setAttachments(invoices[0].attachments || []);
      } else {
        setAttachments([]);
      }
    }

    setIssueTitle('');
    setIssueType('Quantity Discrepancy');
    setSeverity('HIGH');
    setHeaderComment('');
  }, [isOpen, initialEntity, invoices, deliveryNotes, payments]);

  const initLinesForInvoice = (inv: InvoiceRecord) => {
    const map: Record<string, { issueComment: string; workComment: string; isFlagged: boolean }> = {};
    (inv.lines || []).forEach((l) => {
      map[l.poLineId] = {
        issueComment: '',
        workComment: '',
        isFlagged: false,
      };
    });
    setLineComments(map);
  };

  const initLinesForDN = (dn: DeliveryNoteRecord) => {
    const map: Record<string, { issueComment: string; workComment: string; isFlagged: boolean }> = {};
    (dn.lines || []).forEach((l) => {
      map[l.poLineId] = {
        issueComment: '',
        workComment: '',
        isFlagged: false,
      };
    });
    setLineComments(map);
  };

  const initLinesForPayment = (p: PaymentRecord) => {
    const map: Record<string, { issueComment: string; workComment: string; isFlagged: boolean }> = {};
    (p.allocations || []).forEach((a) => {
      map[a.invoiceId] = {
        issueComment: a.issueComment || '',
        workComment: '',
        isFlagged: !!a.hasIssue,
      };
    });
    setLineComments(map);
  };

  const handleEntitySelection = (id: string) => {
    setSelectedEntityId(id);
    if (entityType === 'INVOICE') {
      const inv = invoices.find((i) => i.id === id);
      if (inv) initLinesForInvoice(inv);
    } else if (entityType === 'DELIVERY') {
      const dn = deliveryNotes.find((d) => d.id === id);
      if (dn) initLinesForDN(dn);
    } else if (entityType === 'PAYMENT') {
      const p = payments.find((pm) => pm.id === id);
      if (p) initLinesForPayment(p);
    } else {
      setLineComments({});
    }
  };

  if (!isOpen) return null;

  // Selected item object
  const currentInvoice = entityType === 'INVOICE' ? invoices.find((i) => i.id === selectedEntityId) : null;
  const currentDN = entityType === 'DELIVERY' ? deliveryNotes.find((d) => d.id === selectedEntityId) : null;
  const currentPayment = entityType === 'PAYMENT' ? payments.find((p) => p.id === selectedEntityId) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!headerComment.trim()) {
      alert('Please provide a comment or explanation for the issue.');
      return;
    }

    let refNum = '';
    let poNum = '';
    let cust = '';
    let dest = '';
    let contract = '';
    let totalVal = 0;
    const lineIssues: LineItemIssue[] = [];

    if (entityType === 'INVOICE') {
      if (!currentInvoice) {
        alert('Please select an invoice to flag.');
        return;
      }
      refNum = currentInvoice.invoiceNumber;
      poNum = currentInvoice.poNumber;
      cust = currentInvoice.customerName;
      dest = currentInvoice.destination;
      contract = currentInvoice.contract;
      totalVal = currentInvoice.totalAfterVat;

      (currentInvoice.lines || []).forEach((line) => {
        const flagInfo = lineComments[line.poLineId];
        if (flagInfo && (flagInfo.isFlagged || flagInfo.issueComment.trim())) {
          lineIssues.push({
            lineId: line.poLineId,
            itemDescription: line.itemDescription,
            unitOfMeasure: line.unitOfMeasure,
            poQuantity: line.poQuantity,
            billedOrDeliveredQuantity: line.invoicedQuantity,
            unitPrice: line.unitPrice,
            valueAfterVat: line.valueAfterVat,
            issueComment: flagInfo.issueComment.trim() || 'Discrepancy noted on line item',
            workComment: flagInfo.workComment.trim(),
            status: 'PENDING',
          });
        }
      });
    } else if (entityType === 'DELIVERY') {
      if (!currentDN) {
        alert('Please select a delivery note to flag.');
        return;
      }
      refNum = currentDN.deliveryNoteNumber;
      poNum = currentDN.poNumber;
      cust = currentDN.customerName;
      dest = currentDN.destination;
      contract = currentDN.contract;
      totalVal = currentDN.totalDeliveredValue;

      (currentDN.lines || []).forEach((line) => {
        const flagInfo = lineComments[line.poLineId];
        if (flagInfo && (flagInfo.isFlagged || flagInfo.issueComment.trim())) {
          lineIssues.push({
            lineId: line.poLineId,
            itemDescription: line.itemDescription,
            unitOfMeasure: line.unitOfMeasure,
            poQuantity: line.poQuantity,
            billedOrDeliveredQuantity: line.deliveredQuantity,
            unitPrice: line.unitPrice,
            valueAfterVat: line.valueAfterVat,
            issueComment: flagInfo.issueComment.trim() || 'Discrepancy on delivered line',
            workComment: flagInfo.workComment.trim(),
            status: 'PENDING',
          });
        }
      });
    } else {
      if (!currentPayment) {
        alert('Please select a payment to flag.');
        return;
      }
      refNum = currentPayment.paymentNumber;
      poNum = currentPayment.poNumber || 'MULTI-PO';
      cust = currentPayment.customerName;
      totalVal = currentPayment.amountPaid;

      (currentPayment.allocations || []).forEach((alloc) => {
        const flagInfo = lineComments[alloc.invoiceId];
        if (flagInfo && (flagInfo.isFlagged || flagInfo.issueComment.trim())) {
          lineIssues.push({
            lineId: alloc.invoiceId,
            itemDescription: `Invoice #${alloc.invoiceNumber} (PO: ${alloc.poNumber})`,
            unitOfMeasure: 'UNIT',
            poQuantity: 1,
            billedOrDeliveredQuantity: 1,
            unitPrice: alloc.allocatedAmount,
            valueAfterVat: alloc.allocatedAmount,
            issueComment: flagInfo.issueComment.trim() || 'Discrepancy on payment allocation line',
            workComment: flagInfo.workComment.trim(),
            status: 'PENDING',
          });
        }
      });
    }

    const defaultTitle = issueTitle.trim() || `${issueType} on ${refNum} (${cust})`;
    const authorName = currentUser?.name || 'Authorized User';
    const authorRole = currentUser?.role || 'Billing Clerk';

    const newIssue: DocumentIssueRecord = {
      id: `issue-${entityType.toLowerCase()}-${Date.now()}`,
      entityType,
      entityId: selectedEntityId,
      referenceNumber: refNum,
      poNumber: poNum,
      customerName: cust,
      destination: dest,
      contract,
      totalValue: totalVal,
      issueTitle: defaultTitle,
      issueType,
      severity,
      status: 'PENDING',
      flaggedBy: `${authorName} (${authorRole})`,
      flaggedAt: new Date().toISOString(),
      headerComment: headerComment.trim(),
      lineIssues,
      attachments: attachments,
      comments: [
        {
          id: `comm-init-${Date.now()}`,
          authorName,
          authorRole,
          comment: headerComment.trim(),
          createdAt: new Date().toISOString(),
          type: 'WORK_NOTE',
        }
      ],
    };

    onSaveIssue(newIssue);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 to-rose-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">Mark Document with Issue</h2>
              <p className="text-xs text-amber-100">
                Flag discrepancies, quantity variances, pricing errors, or review requests
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto scrollbar-thin">
          
          {/* Entity Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Document Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setEntityType('INVOICE');
                  if (invoices.length > 0) handleEntitySelection(invoices[0].id);
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  entityType === 'INVOICE'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4" /> Invoice
              </button>

              <button
                type="button"
                onClick={() => {
                  setEntityType('DELIVERY');
                  if (deliveryNotes.length > 0) handleEntitySelection(deliveryNotes[0].id);
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  entityType === 'DELIVERY'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4" /> Delivery Note
              </button>

              <button
                type="button"
                onClick={() => {
                  setEntityType('PAYMENT');
                  if (payments.length > 0) handleEntitySelection(payments[0].id);
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  entityType === 'PAYMENT'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Payment
              </button>
            </div>
          </div>

          {/* Document Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Choose {entityType === 'INVOICE' ? 'Invoice' : entityType === 'DELIVERY' ? 'Delivery Note' : 'Payment'}
            </label>
            <select
              value={selectedEntityId}
              onChange={(e) => handleEntitySelection(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              {entityType === 'INVOICE' &&
                invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — PO: {inv.poNumber} — {inv.customerName} (${formatCurrency(inv.totalAfterVat)})
                  </option>
                ))}

              {entityType === 'DELIVERY' &&
                deliveryNotes.map((dn) => (
                  <option key={dn.id} value={dn.id}>
                    {dn.deliveryNoteNumber} — PO: {dn.poNumber} — {dn.customerName} (${formatCurrency(dn.totalDeliveredValue)})
                  </option>
                ))}

              {entityType === 'PAYMENT' &&
                payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.paymentNumber} — PO: {p.poNumber} — {p.customerName} (${formatCurrency(p.amountPaid)})
                  </option>
                ))}
            </select>
          </div>

          {/* Summary Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-600">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Ref Number</span>
              <span className="font-bold text-slate-900 font-mono">
                {currentInvoice?.invoiceNumber || currentDN?.deliveryNoteNumber || currentPayment?.paymentNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">PO Number</span>
              <span className="font-semibold text-slate-800">
                {currentInvoice?.poNumber || currentDN?.poNumber || currentPayment?.poNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Customer</span>
              <span className="font-semibold text-slate-800 truncate block">
                {currentInvoice?.customerName || currentDN?.customerName || currentPayment?.customerName || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Value</span>
              <span className="font-bold text-emerald-700">
                ${formatCurrency(currentInvoice?.totalAfterVat || currentDN?.totalDeliveredValue || currentPayment?.amountPaid || 0)}
              </span>
            </div>
          </div>

          {/* Issue Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Issue Category
              </label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="Quantity Discrepancy">Quantity Discrepancy / Short Delivery</option>
                <option value="Pricing / Rate Error">Pricing / Rate Error</option>
                <option value="Missing Delivery Ref">Missing Delivery Note Reference</option>
                <option value="VAT / Calculation Error">VAT / Calculation Error</option>
                <option value="Wrong PO Reference">Wrong PO Reference</option>
                <option value="Damaged / Rejected Goods">Damaged / Rejected Goods</option>
                <option value="Payment Mismatch">Payment Mismatch / Short Allocation</option>
                <option value="Customer Query">Customer Query / Clarification</option>
                <option value="Other">Other Operational Discrepancy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Severity Level
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="CRITICAL">Critical (Blocks payment or shipment)</option>
                <option value="HIGH">High (Immediate investigation required)</option>
                <option value="MEDIUM">Medium (Discrepancy to resolve)</option>
                <option value="LOW">Low (Minor remark / query)</option>
              </select>
            </div>
          </div>

          {/* Issue Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Issue Title / Headline (Optional)
            </label>
            <input
              type="text"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="e.g. Quantity variance on 16mm Rebar: Billed 30 tons, gate receipt shows 25 tons"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Header / Main Comment */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Main Issue Comment & Instructions for Reviewer <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={headerComment}
              onChange={(e) => setHeaderComment(e.target.value)}
              placeholder="Describe the discrepancy clearly. E.g., Delivery truck unloaded 25 tons. Driver note says remaining 5 tons in secondary truck. Please review and approve reloading invoice to 25 tons."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-normal text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Picture / Image Evidence Attachments */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
            <ImageAttachmentManager
              attachments={attachments}
              onChange={setAttachments}
              currentUser={currentUser}
              title="Issue Photographic Evidence & Scans"
              description="Attach picture proof of physical damage, incorrect items delivered, handwritten delivery notes, or gate receipts (PNG, JPG, WEBP)."
            />
          </div>

          {/* Line-Item Specific Comments (For Invoices and Delivery Notes) */}
          {(entityType === 'INVOICE' && currentInvoice && currentInvoice.lines && currentInvoice.lines.length > 0) && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Line-Item Comments & Discrepancy Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Flag specific line items that have quantity or price discrepancies.
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {currentInvoice.lines.length} lines available
                </span>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                {currentInvoice.lines.map((line, idx) => {
                  const currentLineState = lineComments[line.poLineId] || { issueComment: '', workComment: '', isFlagged: false };

                  return (
                    <div
                      key={line.poLineId}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        currentLineState.isFlagged
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={currentLineState.isFlagged}
                            onChange={(e) => {
                              setLineComments((prev) => ({
                                ...prev,
                                [line.poLineId]: {
                                  ...currentLineState,
                                  isFlagged: e.target.checked,
                                },
                              }));
                            }}
                            className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-slate-800">
                              Line #{idx + 1}: {line.itemDescription}
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              PO Qty: {line.poQuantity} {line.unitOfMeasure} | Invoiced: {line.invoicedQuantity} | Price: ${line.unitPrice} | Line Total: ${formatCurrency(line.valueAfterVat)}
                            </div>
                          </div>
                        </label>
                      </div>

                      {currentLineState.isFlagged && (
                        <div className="mt-2.5 space-y-2 pl-6">
                          <input
                            type="text"
                            value={currentLineState.issueComment}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLineComments((prev) => ({
                                ...prev,
                                [line.poLineId]: {
                                  ...currentLineState,
                                  issueComment: val,
                                },
                              }));
                            }}
                            placeholder="Specific issue on this line (e.g., Only 25 tons unloaded, 5 tons missing)"
                            className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Line-Item Specific Comments (For Delivery Notes) */}
          {(entityType === 'DELIVERY' && currentDN && currentDN.lines && currentDN.lines.length > 0) && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Delivery Note Line Items Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Flag specific delivered items with damage, shortage, or missing certificates.
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {currentDN.lines.length} lines available
                </span>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                {currentDN.lines.map((line, idx) => {
                  const currentLineState = lineComments[line.poLineId] || { issueComment: '', workComment: '', isFlagged: false };

                  return (
                    <div
                      key={line.poLineId}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        currentLineState.isFlagged
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={currentLineState.isFlagged}
                            onChange={(e) => {
                              setLineComments((prev) => ({
                                ...prev,
                                [line.poLineId]: {
                                  ...currentLineState,
                                  isFlagged: e.target.checked,
                                },
                              }));
                            }}
                            className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-slate-800">
                              Line #{idx + 1}: {line.itemDescription}
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Delivered: {line.deliveredQuantity} {line.unitOfMeasure} | PO Qty: {line.poQuantity} | Total: ${formatCurrency(line.valueAfterVat)}
                            </div>
                          </div>
                        </label>
                      </div>

                      {currentLineState.isFlagged && (
                        <div className="mt-2.5 space-y-2 pl-6">
                          <input
                            type="text"
                            value={currentLineState.issueComment}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLineComments((prev) => ({
                                ...prev,
                                [line.poLineId]: {
                                  ...currentLineState,
                                  issueComment: val,
                                },
                              }));
                            }}
                            placeholder="Line issue description (e.g. 2 cartons torn, missing batch certificate)"
                            className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Line-Item Specific Comments (For Payments / Allocated Invoices) */}
          {(entityType === 'PAYMENT' && currentPayment && currentPayment.allocations && currentPayment.allocations.length > 0) && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Payment Allocated Invoices Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Flag specific invoice lines with payment shortfall, dispute, or rate mismatch.
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {currentPayment.allocations.length} allocations
                </span>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                {currentPayment.allocations.map((alloc, idx) => {
                  const currentLineState = lineComments[alloc.invoiceId] || { issueComment: '', workComment: '', isFlagged: false };

                  return (
                    <div
                      key={alloc.invoiceId}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        currentLineState.isFlagged
                          ? 'bg-rose-50/80 border-rose-300'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={currentLineState.isFlagged}
                            onChange={(e) => {
                              setLineComments((prev) => ({
                                ...prev,
                                [alloc.invoiceId]: {
                                  ...currentLineState,
                                  isFlagged: e.target.checked,
                                },
                              }));
                            }}
                            className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-slate-800">
                              Allocation #{idx + 1}: Invoice {alloc.invoiceNumber}
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              PO: {alloc.poNumber} | Allocated: TZS {formatCurrency(alloc.allocatedAmount)} | Balance: TZS {formatCurrency(alloc.pendingBalance)}
                            </div>
                          </div>
                        </label>
                      </div>

                      {currentLineState.isFlagged && (
                        <div className="mt-2.5 space-y-2 pl-6">
                          <input
                            type="text"
                            value={currentLineState.issueComment}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLineComments((prev) => ({
                                ...prev,
                                [alloc.invoiceId]: {
                                  ...currentLineState,
                                  issueComment: val,
                                },
                              }));
                            }}
                            placeholder="Discrepancy note (e.g. short remittance, client disputed deductions)"
                            className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              Mark Document with Issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
