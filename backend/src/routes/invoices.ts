import { Router } from 'express';
import { sequelize } from '../config/db';
import { Invoice } from '../models/Invoice';
import { InvoiceLine } from '../models/InvoiceLine';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

function serializeInvoice(invoice: Invoice) {
  const json = invoice.toJSON() as any;
  return { ...json, lines: json.lines || [] };
}

router.get('/', requireScreen('invoices_db', 'view'), async (_req, res) => {
  const rows = await Invoice.findAll({ include: [{ model: InvoiceLine, as: 'lines' }], order: [['createdAt', 'DESC']] });
  res.json({ success: true, data: rows.map(serializeInvoice) });
});

router.get('/:id', requireScreen('invoices_db', 'view'), async (req, res) => {
  const row = await Invoice.findByPk(req.params.id, { include: [{ model: InvoiceLine, as: 'lines' }] });
  if (!row) return res.status(404).json({ success: false, error: 'Invoice not found' });
  res.json({ success: true, data: serializeInvoice(row) });
});

router.post('/', requireScreen('create_invoice', 'edit'), async (req, res) => {
  const body = req.body || {};
  const id = body.id || `inv-${Date.now()}`;

  const result = await sequelize.transaction(async (t) => {
    const invoice = await Invoice.create(
      {
        id,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: body.invoiceDate,
        poNumber: body.poNumber,
        customerName: body.customerName,
        destination: body.destination,
        contract: body.contract,
        poDate: body.poDate,
        subtotalBeforeVat: body.subtotalBeforeVat || 0,
        totalVat: body.totalVat || 0,
        totalAfterVat: body.totalAfterVat || 0,
        paidAmount: body.paidAmount || 0,
        paymentStatus: body.paymentStatus || 'UNPAID',
        notes: body.notes,
        comment: body.comment,
        status: body.status || 'ACTIVE',
        isCancelled: !!body.isCancelled,
        isFlagged: !!body.isFlagged,
        cancelReason: body.cancelReason,
        isOfr: !!body.isOfr,
        ofrDetail: body.ofrDetail,
        hasIssue: !!body.hasIssue,
        issueComment: body.issueComment,
        issueId: body.issueId,
        issueStatus: body.issueStatus,
        lastModifiedBy: body.lastModifiedBy,
      },
      { transaction: t }
    );

    const lines = Array.isArray(body.lines) ? body.lines : [];
    for (const line of lines) {
      // eslint-disable-next-line no-await-in-loop
      await InvoiceLine.create(
        {
          invoiceId: invoice.id,
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
        },
        { transaction: t }
      );
    }

    return invoice;
  });

  const full = await Invoice.findByPk(result.id, { include: [{ model: InvoiceLine, as: 'lines' }] });
  broadcast({ type: 'sync_notification', entity: 'invoices' });
  res.status(201).json({ success: true, data: serializeInvoice(full!) });
});

router.put('/:id', requireScreen('invoices_db', 'edit'), async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

  const body = req.body || {};

  await sequelize.transaction(async (t) => {
    await invoice.update(
      {
        invoiceNumber: body.invoiceNumber ?? invoice.invoiceNumber,
        invoiceDate: body.invoiceDate ?? invoice.invoiceDate,
        poNumber: body.poNumber ?? invoice.poNumber,
        customerName: body.customerName ?? invoice.customerName,
        destination: body.destination ?? invoice.destination,
        contract: body.contract ?? invoice.contract,
        poDate: body.poDate ?? invoice.poDate,
        subtotalBeforeVat: body.subtotalBeforeVat ?? invoice.subtotalBeforeVat,
        totalVat: body.totalVat ?? invoice.totalVat,
        totalAfterVat: body.totalAfterVat ?? invoice.totalAfterVat,
        paidAmount: body.paidAmount ?? invoice.paidAmount,
        paymentStatus: body.paymentStatus ?? invoice.paymentStatus,
        notes: body.notes ?? invoice.notes,
        comment: body.comment ?? invoice.comment,
        status: body.status ?? invoice.status,
        isCancelled: body.isCancelled ?? invoice.isCancelled,
        isFlagged: body.isFlagged ?? invoice.isFlagged,
        cancelReason: body.cancelReason ?? invoice.cancelReason,
        isOfr: body.isOfr ?? invoice.isOfr,
        ofrDetail: body.ofrDetail ?? invoice.ofrDetail,
        hasIssue: body.hasIssue ?? invoice.hasIssue,
        issueComment: body.issueComment ?? invoice.issueComment,
        issueId: body.issueId ?? invoice.issueId,
        issueStatus: body.issueStatus ?? invoice.issueStatus,
        lastModifiedBy: body.lastModifiedBy ?? invoice.lastModifiedBy,
      },
      { transaction: t }
    );

    if (Array.isArray(body.lines)) {
      await InvoiceLine.destroy({ where: { invoiceId: invoice.id }, transaction: t });
      for (const line of body.lines) {
        // eslint-disable-next-line no-await-in-loop
        await InvoiceLine.create(
          {
            invoiceId: invoice.id,
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
          },
          { transaction: t }
        );
      }
    }
  });

  const full = await Invoice.findByPk(invoice.id, { include: [{ model: InvoiceLine, as: 'lines' }] });
  broadcast({ type: 'sync_notification', entity: 'invoices' });
  res.json({ success: true, data: serializeInvoice(full!) });
});

router.delete('/:id', requireScreen('invoices_db', 'edit'), async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
  await invoice.destroy();
  broadcast({ type: 'sync_notification', entity: 'invoices' });
  res.json({ success: true });
});

export default router;
