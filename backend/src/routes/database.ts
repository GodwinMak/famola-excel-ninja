import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/db';
import { PoLine, PoLineAttributes } from '../models/PoLine';
import { Invoice, InvoiceAttributes } from '../models/Invoice';
import { InvoiceLine } from '../models/InvoiceLine';
import { DeliveryNote, DeliveryNoteAttributes } from '../models/DeliveryNote';
import { DeliveryNoteLine } from '../models/DeliveryNoteLine';
import { Payment, PaymentAttributes } from '../models/Payment';
import { PaymentAllocation } from '../models/PaymentAllocation';
import { DocumentIssue, DocumentIssueAttributes } from '../models/DocumentIssue';
import { IssueLineItem } from '../models/IssueLineItem';
import { IssueComment } from '../models/IssueComment';
import { User } from '../models/User';
import { SeriesConfig } from '../models/SeriesConfig';
import { CustomerSeriesBook } from '../models/CustomerSeriesBook';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { addSseClient, removeSseClient, broadcast } from '../services/sseHub';
import { hashSecret } from '../services/authService';

const router = Router();

async function loadFullDatabase() {
  const [poLines, invoices, deliveryNotes, payments, issues, users, seriesConfigRows, customerBooks] = await Promise.all([
    PoLine.findAll(),
    Invoice.findAll({ include: [{ model: InvoiceLine, as: 'lines' }] }),
    DeliveryNote.findAll({ include: [{ model: DeliveryNoteLine, as: 'lines' }] }),
    Payment.findAll({ include: [{ model: PaymentAllocation, as: 'allocations' }] }),
    DocumentIssue.findAll({ include: [{ model: IssueLineItem, as: 'lineIssues' }, { model: IssueComment, as: 'comments' }] }),
    User.findAll(),
    SeriesConfig.findAll(),
    CustomerSeriesBook.findAll(),
  ]);

  const invoiceSeries = seriesConfigRows.find((r) => r.seriesType === 'invoice');
  const deliverySeries = seriesConfigRows.find((r) => r.seriesType === 'delivery');

  const latestTimestamps = [
    ...invoices.map((i) => i.updatedAt),
    ...deliveryNotes.map((d) => d.updatedAt),
    ...poLines.map((p) => p.updatedAt),
    ...issues.map((i) => i.updatedAt),
  ].filter(Boolean) as Date[];
  const updatedAt = latestTimestamps.length
    ? new Date(Math.max(...latestTimestamps.map((d) => d.getTime()))).toISOString()
    : new Date().toISOString();

  return {
    poLines,
    invoices,
    deliveryNotes,
    payments,
    issues,
    users: users.map((u) => ({ ...u.toJSON(), passwordHash: undefined, pinHash: undefined })),
    seriesConfig: { invoiceSeries, deliverySeries },
    customerBooks,
    updatedAt,
  };
}

function countsOf(db: Awaited<ReturnType<typeof loadFullDatabase>>) {
  const poNumbersSet = new Set(db.poLines.map((p) => p.poNumber).filter(Boolean));
  return {
    totalPoLines: db.poLines.length,
    totalPoGroups: poNumbersSet.size,
    totalInvoices: db.invoices.length,
    totalDeliveryNotes: db.deliveryNotes.length,
    totalPayments: db.payments.length,
    totalIssues: db.issues.length,
    totalUsers: db.users.length,
  };
}

// Not gated by requireAuth: native browser EventSource cannot send an Authorization
// header, and this stream only ever carries non-sensitive counts/notifications —
// clients still need a valid JWT to read the real data via the other routes below.
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  loadFullDatabase().then((db) => {
    res.write(`data: ${JSON.stringify({ type: 'init', counts: countsOf(db), updatedAt: db.updatedAt, timestamp: Date.now() })}\n\n`);
  });

  addSseClient(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
      removeSseClient(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(res);
  });
});

router.get('/status', requireAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const db = await loadFullDatabase();
  const since = req.query.since ? String(req.query.since) : '';
  res.json({ success: true, changed: !since || since !== db.updatedAt, updatedAt: db.updatedAt, counts: countsOf(db) });
});

router.get('/', requireAuth, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const db = await loadFullDatabase();
  res.json({ success: true, data: db, counts: countsOf(db), updatedAt: db.updatedAt });
});

router.get('/invoices', requireAuth, async (_req, res) => {
  const rows = await Invoice.findAll({ include: [{ model: InvoiceLine, as: 'lines' }] });
  res.json({ success: true, data: rows });
});

router.get('/delivery-notes', requireAuth, async (_req, res) => {
  const rows = await DeliveryNote.findAll({ include: [{ model: DeliveryNoteLine, as: 'lines' }] });
  res.json({ success: true, data: rows });
});

router.get('/payments', requireAuth, async (_req, res) => {
  const rows = await Payment.findAll({ include: [{ model: PaymentAllocation, as: 'allocations' }] });
  res.json({ success: true, data: rows });
});

router.get('/issues', requireAuth, async (_req, res) => {
  const rows = await DocumentIssue.findAll({ include: [{ model: IssueLineItem, as: 'lineIssues' }, { model: IssueComment, as: 'comments' }] });
  res.json({ success: true, data: rows });
});

// Transitional bulk endpoint: the frontend's business-logic layer computes whole
// updated arrays client-side (VAT/tracking calculations, issue auto-flagging, etc.)
// and hands them here to persist in one shot, mirroring the old JSON-file "save
// everything" contract so that layer didn't need a line-by-line rewrite. `replace`
// mirrors the old semantics too: when true, the given array becomes the ENTIRE
// table for that entity (anything absent is deleted); when false/omitted, items
// are only upserted. Real per-entity REST routes above remain the properly-scoped
// path forward for new code.
const PO_LINE_UPDATE_FIELDS: (keyof PoLineAttributes)[] = [
  'customerName',
  'destination',
  'poNumber',
  'contract',
  'itemDescription',
  'poDate',
  'unitOfMeasure',
  'quantity',
  'unitCost',
  'unitPrice',
  'valueBeforeVat',
  'vatRate',
  'vatAmount',
  'valueAfterVat',
  'remarks',
];

// Last line of defense against a mis-parsed value (e.g. a VAT registration
// number picked up instead of an actual VAT amount) overflowing a
// DECIMAL(16,2) column and throwing a MySQL error that aborts the WHOLE
// bulk-sync transaction — one bad row in a 7,000-row upload shouldn't be
// able to lose the other 6,999. The frontend parser now guards against this
// at the source too, but bulk-sync also gets hit by manual edits and other
// import paths, so it's clamped again here.
const MAX_SANE_DECIMAL = 999999999999.99;
function clampDecimal(val: any, fallback = 0): number {
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_SANE_DECIMAL) return fallback;
  return n;
}

// Excel PO uploads can carry thousands of rows in one shot — a per-row
// upsert loop (one round-trip each) routinely blows past the client's
// bulk-sync timeout on files this size, so this is a single batched
// bulkCreate + ON DUPLICATE KEY UPDATE instead.
async function bulkUpsertPoLines(poLines: any[], t: any) {
  if (!poLines.length) return;
  const rows = poLines.map((p: any) => ({
    id: p.id || `pol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    customerName: p.customerName,
    destination: p.destination,
    poNumber: p.poNumber,
    contract: p.contract,
    itemDescription: p.itemDescription,
    poDate: p.date || p.poDate,
    unitOfMeasure: p.unitOfMeasure,
    quantity: clampDecimal(p.quantity),
    unitCost: clampDecimal(p.unitCost),
    unitPrice: clampDecimal(p.unitPrice),
    valueBeforeVat: clampDecimal(p.valueBeforeVat),
    vatRate: p.vatRate ?? 0.18,
    vatAmount: clampDecimal(p.vatAmount),
    valueAfterVat: clampDecimal(p.valueAfterVat),
    remarks: p.remarks,
  }));
  await PoLine.bulkCreate(rows, {
    updateOnDuplicate: PO_LINE_UPDATE_FIELDS,
    transaction: t,
  });
}

const INVOICE_UPDATE_FIELDS: (keyof InvoiceAttributes)[] = [
  'invoiceNumber',
  'invoiceDate',
  'poNumber',
  'customerName',
  'destination',
  'contract',
  'poDate',
  'subtotalBeforeVat',
  'totalVat',
  'totalAfterVat',
  'paidAmount',
  'paymentStatus',
  'notes',
  'comment',
  'status',
  'isCancelled',
  'isFlagged',
  'cancelReason',
  'isOfr',
  'ofrDetail',
  'hasIssue',
  'issueComment',
  'issueId',
  'issueStatus',
  'lastModifiedBy',
];

const DELIVERY_NOTE_UPDATE_FIELDS: (keyof DeliveryNoteAttributes)[] = [
  'deliveryNoteNumber',
  'deliveryDate',
  'poNumber',
  'customerName',
  'destination',
  'contract',
  'poDate',
  'carrier',
  'vehicleNumber',
  'driverName',
  'receivedBy',
  'subtotalBeforeVat',
  'totalVat',
  'totalDeliveredQuantity',
  'totalDeliveredValue',
  'notes',
  'comment',
  'status',
  'isCancelled',
  'cancelReason',
  'isOfr',
  'ofrDetail',
  'isCallOfOrder',
  'callOfOrderDetail',
  'matchedInvoiceNumber',
  'isFullyInvoiced',
  'hasIssue',
  'issueComment',
  'issueId',
  'issueStatus',
  'lastModifiedBy',
];

const PAYMENT_UPDATE_FIELDS: (keyof PaymentAttributes)[] = [
  'paymentNumber',
  'paymentDate',
  'invoiceId',
  'invoiceNumber',
  'poNumber',
  'customerName',
  'amountPaid',
  'paymentMethod',
  'referenceNumber',
  'depositAccount',
  'notes',
  'hasIssue',
  'issueComment',
  'issueId',
  'issueStatus',
];

const DOCUMENT_ISSUE_UPDATE_FIELDS: (keyof DocumentIssueAttributes)[] = [
  'entityType',
  'entityId',
  'referenceNumber',
  'poNumber',
  'customerName',
  'destination',
  'contract',
  'totalValue',
  'disputedAmount',
  'issueTitle',
  'primaryIssue',
  'issueType',
  'severity',
  'status',
  'flaggedBy',
  'flaggedAt',
  'headerComment',
  'reviewComment',
  'resolvedBy',
  'resolvedAt',
  'resolutionNotes',
];

// Same rationale as bulkUpsertPoLines: invoice/delivery-note/payment/issue
// syncs can carry every record in the table (reconciliation round-trips the
// whole array even when only a handful actually changed), so a per-record
// upsert + per-line destroy/create loop turns one request into thousands of
// sequential round-trips. Batch header rows with bulkCreate, and replace each
// touched parent's child rows with one delete-by-IN plus one bulk insert.
async function bulkUpsertInvoices(invoices: any[], t: any) {
  if (!invoices.length) return;
  const rows = invoices.map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    poNumber: inv.poNumber,
    customerName: inv.customerName,
    destination: inv.destination,
    contract: inv.contract,
    poDate: inv.poDate,
    subtotalBeforeVat: inv.subtotalBeforeVat || 0,
    totalVat: inv.totalVat || 0,
    totalAfterVat: inv.totalAfterVat || 0,
    paidAmount: inv.paidAmount || 0,
    paymentStatus: inv.paymentStatus || 'UNPAID',
    notes: inv.notes,
    comment: inv.comment,
    status: inv.status || 'ACTIVE',
    isCancelled: !!inv.isCancelled,
    isFlagged: !!inv.isFlagged,
    cancelReason: inv.cancelReason,
    isOfr: !!inv.isOfr,
    ofrDetail: inv.ofrDetail,
    hasIssue: !!inv.hasIssue,
    issueComment: inv.issueComment,
    issueId: inv.issueId,
    issueStatus: inv.issueStatus,
    lastModifiedBy: inv.lastModifiedBy,
  }));
  await Invoice.bulkCreate(rows, { updateOnDuplicate: INVOICE_UPDATE_FIELDS, transaction: t });

  const invoicesWithLines = invoices.filter((inv: any) => Array.isArray(inv.lines));
  if (invoicesWithLines.length) {
    await InvoiceLine.destroy({
      where: { invoiceId: { [Op.in]: invoicesWithLines.map((inv: any) => inv.id) } },
      transaction: t,
    });
    const lineRows = invoicesWithLines.flatMap((inv: any) =>
      (inv.lines || []).map((line: any) => ({
        invoiceId: inv.id,
        poLineId: line.poLineId,
        itemDescription: line.itemDescription,
        unitOfMeasure: line.unitOfMeasure,
        poQuantity: line.poQuantity || 0,
        alreadyInvoicedQuantity: line.alreadyInvoicedQuantity || 0,
        availableQuantity: line.availableQuantity || 0,
        invoicedQuantity: line.invoicedQuantity || 0,
        unitCost: line.unitCost || 0,
        unitPrice: line.unitPrice || 0,
        valueBeforeVat: line.valueBeforeVat || 0,
        vatRate: line.vatRate ?? 0.18,
        vatAmount: line.vatAmount || 0,
        valueAfterVat: line.valueAfterVat || 0,
        isSelected: line.isSelected ?? true,
        comment: line.comment || 'Okay',
        hasIssue: !!line.hasIssue,
        issueComment: line.issueComment,
      }))
    );
    if (lineRows.length) await InvoiceLine.bulkCreate(lineRows, { transaction: t });
  }
}

async function bulkUpsertDeliveryNotes(deliveryNotes: any[], t: any) {
  if (!deliveryNotes.length) return;
  const rows = deliveryNotes.map((dn: any) => ({
    id: dn.id,
    deliveryNoteNumber: dn.deliveryNoteNumber,
    deliveryDate: dn.deliveryDate,
    poNumber: dn.poNumber,
    customerName: dn.customerName,
    destination: dn.destination,
    contract: dn.contract,
    poDate: dn.poDate,
    carrier: dn.carrier,
    vehicleNumber: dn.vehicleNumber,
    driverName: dn.driverName,
    receivedBy: dn.receivedBy,
    subtotalBeforeVat: dn.subtotalBeforeVat || 0,
    totalVat: dn.totalVat || 0,
    totalDeliveredQuantity: dn.totalDeliveredQuantity || 0,
    totalDeliveredValue: dn.totalDeliveredValue || 0,
    notes: dn.notes,
    comment: dn.comment,
    status: dn.status || 'ACTIVE',
    isCancelled: !!dn.isCancelled,
    cancelReason: dn.cancelReason,
    isOfr: !!dn.isOfr,
    ofrDetail: dn.ofrDetail,
    isCallOfOrder: !!dn.isCallOfOrder,
    callOfOrderDetail: dn.callOfOrderDetail,
    matchedInvoiceNumber: dn.matchedInvoiceNumber,
    isFullyInvoiced: !!dn.isFullyInvoiced,
    hasIssue: !!dn.hasIssue,
    issueComment: dn.issueComment,
    issueId: dn.issueId,
    issueStatus: dn.issueStatus,
    lastModifiedBy: dn.lastModifiedBy,
  }));
  await DeliveryNote.bulkCreate(rows, { updateOnDuplicate: DELIVERY_NOTE_UPDATE_FIELDS, transaction: t });

  const notesWithLines = deliveryNotes.filter((dn: any) => Array.isArray(dn.lines));
  if (notesWithLines.length) {
    await DeliveryNoteLine.destroy({
      where: { deliveryNoteId: { [Op.in]: notesWithLines.map((dn: any) => dn.id) } },
      transaction: t,
    });
    const lineRows = notesWithLines.flatMap((dn: any) =>
      (dn.lines || []).map((line: any) => ({
        deliveryNoteId: dn.id,
        poLineId: line.poLineId,
        itemDescription: line.itemDescription,
        unitOfMeasure: line.unitOfMeasure,
        poQuantity: line.poQuantity || 0,
        alreadyDeliveredQuantity: line.alreadyDeliveredQuantity || 0,
        availableQuantity: line.availableQuantity || 0,
        deliveredQuantity: line.deliveredQuantity || 0,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice || 0,
        valueBeforeVat: line.valueBeforeVat || 0,
        vatRate: line.vatRate ?? 0.18,
        vatAmount: line.vatAmount || 0,
        valueAfterVat: line.valueAfterVat || 0,
        isSelected: line.isSelected ?? true,
        comment: line.comment,
        hasIssue: !!line.hasIssue,
        issueComment: line.issueComment,
      }))
    );
    if (lineRows.length) await DeliveryNoteLine.bulkCreate(lineRows, { transaction: t });
  }
}

async function bulkUpsertPayments(payments: any[], t: any) {
  if (!payments.length) return;
  const rows = payments.map((p: any) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    paymentDate: p.paymentDate,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoiceNumber,
    poNumber: p.poNumber,
    customerName: p.customerName,
    amountPaid: p.amountPaid || 0,
    paymentMethod: p.paymentMethod,
    referenceNumber: p.referenceNumber,
    depositAccount: p.depositAccount,
    notes: p.notes,
    hasIssue: !!p.hasIssue,
    issueComment: p.issueComment,
    issueId: p.issueId,
    issueStatus: p.issueStatus,
  }));
  await Payment.bulkCreate(rows, { updateOnDuplicate: PAYMENT_UPDATE_FIELDS, transaction: t });

  const paymentsWithAllocations = payments.filter((p: any) => Array.isArray(p.allocations));
  if (paymentsWithAllocations.length) {
    await PaymentAllocation.destroy({
      where: { paymentId: { [Op.in]: paymentsWithAllocations.map((p: any) => p.id) } },
      transaction: t,
    });
    const allocationRows = paymentsWithAllocations.flatMap((p: any) =>
      (p.allocations || []).map((a: any) => ({
        paymentId: p.id,
        invoiceId: a.invoiceId,
        invoiceNumber: a.invoiceNumber,
        poNumber: a.poNumber,
        customerName: a.customerName,
        invoiceTotal: a.invoiceTotal || 0,
        alreadyPaid: a.alreadyPaid || 0,
        pendingBalance: a.pendingBalance || 0,
        allocatedAmount: a.allocatedAmount || 0,
        hasIssue: !!a.hasIssue,
        issueComment: a.issueComment,
      }))
    );
    if (allocationRows.length) await PaymentAllocation.bulkCreate(allocationRows, { transaction: t });
  }
}

async function bulkUpsertIssues(issues: any[], t: any) {
  if (!issues.length) return;
  const rows = issues.map((issue: any) => ({
    id: issue.id,
    entityType: issue.entityType,
    entityId: issue.entityId,
    referenceNumber: issue.referenceNumber,
    poNumber: issue.poNumber,
    customerName: issue.customerName,
    destination: issue.destination,
    contract: issue.contract,
    totalValue: issue.totalValue || 0,
    disputedAmount: issue.disputedAmount || 0,
    issueTitle: issue.issueTitle,
    primaryIssue: issue.primaryIssue,
    issueType: issue.issueType,
    severity: issue.severity,
    status: issue.status || 'PENDING',
    flaggedBy: issue.flaggedBy,
    flaggedAt: issue.flaggedAt,
    headerComment: issue.headerComment,
    reviewComment: issue.reviewComment,
    resolvedBy: issue.resolvedBy,
    resolvedAt: issue.resolvedAt,
    resolutionNotes: issue.resolutionNotes,
  }));
  await DocumentIssue.bulkCreate(rows, { updateOnDuplicate: DOCUMENT_ISSUE_UPDATE_FIELDS, transaction: t });

  const issuesWithLines = issues.filter((issue: any) => Array.isArray(issue.lineIssues));
  if (issuesWithLines.length) {
    await IssueLineItem.destroy({
      where: { issueId: { [Op.in]: issuesWithLines.map((issue: any) => issue.id) } },
      transaction: t,
    });
    const lineRows = issuesWithLines.flatMap((issue: any) =>
      (issue.lineIssues || []).map((l: any) => ({
        issueId: issue.id,
        lineId: l.lineId,
        itemDescription: l.itemDescription,
        unitOfMeasure: l.unitOfMeasure,
        poQuantity: l.poQuantity,
        billedOrDeliveredQuantity: l.billedOrDeliveredQuantity,
        quantityInvoiced: l.quantityInvoiced,
        quantityDelivered: l.quantityDelivered,
        discrepancyQuantity: l.discrepancyQuantity,
        unitPrice: l.unitPrice,
        valueAfterVat: l.valueAfterVat,
        totalValue: l.totalValue,
        issueComment: l.issueComment,
        issueReason: l.issueReason,
        workComment: l.workComment,
        reviewerComment: l.reviewerComment,
        status: l.status || 'PENDING',
      }))
    );
    if (lineRows.length) await IssueLineItem.bulkCreate(lineRows, { transaction: t });
  }

  const issuesWithComments = issues.filter((issue: any) => Array.isArray(issue.comments));
  if (issuesWithComments.length) {
    await IssueComment.destroy({
      where: { issueId: { [Op.in]: issuesWithComments.map((issue: any) => issue.id) } },
      transaction: t,
    });
    const commentRows = issuesWithComments.flatMap((issue: any) =>
      (issue.comments || []).map((c: any) => ({
        issueId: issue.id,
        authorName: c.authorName || c.userName || 'System',
        authorRole: c.authorRole,
        comment: c.comment,
        type: c.type || 'WORK_NOTE',
      }))
    );
    if (commentRows.length) await IssueComment.bulkCreate(commentRows, { transaction: t });
  }
}

router.post('/bulk-sync', requireAuth, async (req, res) => {
  const { poLines, invoices, deliveryNotes, payments, issues, replace } = req.body || {};
  const isReplace = !!replace;

  await sequelize.transaction(async (t) => {
    if (Array.isArray(poLines)) {
      if (isReplace) {
        const ids = poLines.map((p: any) => p.id).filter(Boolean);
        await PoLine.destroy({ where: ids.length ? { id: { [Op.notIn]: ids } } : {}, transaction: t });
      }
      await bulkUpsertPoLines(poLines, t);
    }

    if (Array.isArray(invoices)) {
      if (isReplace) {
        const ids = invoices.map((i: any) => i.id).filter(Boolean);
        await Invoice.destroy({ where: ids.length ? { id: { [Op.notIn]: ids } } : {}, transaction: t });
      }
      await bulkUpsertInvoices(invoices, t);
    }

    if (Array.isArray(deliveryNotes)) {
      if (isReplace) {
        const ids = deliveryNotes.map((d: any) => d.id).filter(Boolean);
        await DeliveryNote.destroy({ where: ids.length ? { id: { [Op.notIn]: ids } } : {}, transaction: t });
      }
      await bulkUpsertDeliveryNotes(deliveryNotes, t);
    }

    if (Array.isArray(payments)) {
      if (isReplace) {
        const ids = payments.map((p: any) => p.id).filter(Boolean);
        await Payment.destroy({ where: ids.length ? { id: { [Op.notIn]: ids } } : {}, transaction: t });
      }
      await bulkUpsertPayments(payments, t);
    }

    if (Array.isArray(issues)) {
      if (isReplace) {
        const ids = issues.map((i: any) => i.id).filter(Boolean);
        await DocumentIssue.destroy({ where: ids.length ? { id: { [Op.notIn]: ids } } : {}, transaction: t });
      }
      await bulkUpsertIssues(issues, t);
    }
  });

  broadcast({ type: 'sync_notification', entity: 'bulk' });
  res.json({ success: true });
});

router.post('/clear-all', requireAuth, requireAdmin, async (_req, res) => {
  await PoLine.destroy({ where: {}, truncate: true });
  // Plain bulk deletes (not TRUNCATE) so the DB-level ON DELETE CASCADE foreign keys
  // on the child line/allocation/comment tables fire correctly.
  await Invoice.destroy({ where: {} });
  await DeliveryNote.destroy({ where: {} });
  await Payment.destroy({ where: {} });
  await DocumentIssue.destroy({ where: {} });
  await User.destroy({ where: { role: { [Op.ne]: 'Admin' } } });

  const adminCount = await User.count({ where: { role: 'Admin' } });
  if (adminCount === 0) {
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'changeme_on_first_login';
    await User.create({
      id: `usr-admin-${Date.now()}`,
      name: process.env.SEED_ADMIN_NAME || 'System Administrator',
      email,
      role: 'Admin',
      department: 'Management',
      status: 'Active',
      passwordHash: await hashSecret(password),
    });
  }

  broadcast({ type: 'sync_notification', entity: 'all' });
  res.json({ success: true });
});

router.post('/clear-pos', requireAuth, requireAdmin, async (_req, res) => {
  await PoLine.destroy({ where: {}, truncate: true });
  broadcast({ type: 'sync_notification', entity: 'po_lines' });
  res.json({ success: true });
});

export default router;
