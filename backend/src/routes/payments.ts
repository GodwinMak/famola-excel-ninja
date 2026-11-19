import { Router } from 'express';
import { sequelize } from '../config/db';
import { Payment } from '../models/Payment';
import { PaymentAllocation } from '../models/PaymentAllocation';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

function serialize(p: Payment) {
  const json = p.toJSON() as any;
  return { ...json, allocations: json.allocations || [] };
}

function allocationFields(a: any) {
  return {
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
  };
}

router.get('/', requireScreen('payments', 'view'), async (_req, res) => {
  const rows = await Payment.findAll({ include: [{ model: PaymentAllocation, as: 'allocations' }], order: [['createdAt', 'DESC']] });
  res.json({ success: true, data: rows.map(serialize) });
});

router.get('/:id', requireScreen('payments', 'view'), async (req, res) => {
  const row = await Payment.findByPk(req.params.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
  if (!row) return res.status(404).json({ success: false, error: 'Payment not found' });
  res.json({ success: true, data: serialize(row) });
});

router.post('/', requireScreen('payments', 'edit'), async (req, res) => {
  const body = req.body || {};
  const id = body.id || `pay-${Date.now()}`;

  const created = await sequelize.transaction(async (t) => {
    const payment = await Payment.create(
      {
        id,
        paymentNumber: body.paymentNumber,
        paymentDate: body.paymentDate,
        invoiceId: body.invoiceId,
        invoiceNumber: body.invoiceNumber,
        poNumber: body.poNumber,
        customerName: body.customerName,
        amountPaid: body.amountPaid || 0,
        paymentMethod: body.paymentMethod,
        referenceNumber: body.referenceNumber,
        depositAccount: body.depositAccount,
        notes: body.notes,
        hasIssue: !!body.hasIssue,
        issueComment: body.issueComment,
        issueId: body.issueId,
        issueStatus: body.issueStatus,
      },
      { transaction: t }
    );

    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    for (const alloc of allocations) {
      // eslint-disable-next-line no-await-in-loop
      await PaymentAllocation.create({ paymentId: payment.id, ...allocationFields(alloc) }, { transaction: t });
    }
    return payment;
  });

  const full = await Payment.findByPk(created.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
  broadcast({ type: 'sync_notification', entity: 'payments' });
  res.status(201).json({ success: true, data: serialize(full!) });
});

router.put('/:id', requireScreen('payments', 'edit'), async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);
  if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

  const body = req.body || {};
  await sequelize.transaction(async (t) => {
    await payment.update(
      {
        paymentNumber: body.paymentNumber ?? payment.paymentNumber,
        paymentDate: body.paymentDate ?? payment.paymentDate,
        invoiceId: body.invoiceId ?? payment.invoiceId,
        invoiceNumber: body.invoiceNumber ?? payment.invoiceNumber,
        poNumber: body.poNumber ?? payment.poNumber,
        customerName: body.customerName ?? payment.customerName,
        amountPaid: body.amountPaid ?? payment.amountPaid,
        paymentMethod: body.paymentMethod ?? payment.paymentMethod,
        referenceNumber: body.referenceNumber ?? payment.referenceNumber,
        depositAccount: body.depositAccount ?? payment.depositAccount,
        notes: body.notes ?? payment.notes,
        hasIssue: body.hasIssue ?? payment.hasIssue,
        issueComment: body.issueComment ?? payment.issueComment,
        issueId: body.issueId ?? payment.issueId,
        issueStatus: body.issueStatus ?? payment.issueStatus,
      },
      { transaction: t }
    );

    if (Array.isArray(body.allocations)) {
      await PaymentAllocation.destroy({ where: { paymentId: payment.id }, transaction: t });
      for (const alloc of body.allocations) {
        // eslint-disable-next-line no-await-in-loop
        await PaymentAllocation.create({ paymentId: payment.id, ...allocationFields(alloc) }, { transaction: t });
      }
    }
  });

  const full = await Payment.findByPk(payment.id, { include: [{ model: PaymentAllocation, as: 'allocations' }] });
  broadcast({ type: 'sync_notification', entity: 'payments' });
  res.json({ success: true, data: serialize(full!) });
});

router.delete('/:id', requireScreen('payments', 'edit'), async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);
  if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
  await payment.destroy();
  broadcast({ type: 'sync_notification', entity: 'payments' });
  res.json({ success: true });
});

export default router;
