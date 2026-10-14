import { Router } from 'express';
import { sequelize } from '../config/db';
import { DeliveryNote } from '../models/DeliveryNote';
import { DeliveryNoteLine } from '../models/DeliveryNoteLine';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

function serialize(dn: DeliveryNote) {
  const json = dn.toJSON() as any;
  return { ...json, lines: json.lines || [] };
}

function lineFields(line: any) {
  return {
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
  };
}

router.get('/', requireScreen('delivery_notes', 'view'), async (_req, res) => {
  const rows = await DeliveryNote.findAll({ include: [{ model: DeliveryNoteLine, as: 'lines' }], order: [['createdAt', 'DESC']] });
  res.json({ success: true, data: rows.map(serialize) });
});

router.get('/:id', requireScreen('delivery_notes', 'view'), async (req, res) => {
  const row = await DeliveryNote.findByPk(req.params.id, { include: [{ model: DeliveryNoteLine, as: 'lines' }] });
  if (!row) return res.status(404).json({ success: false, error: 'Delivery note not found' });
  res.json({ success: true, data: serialize(row) });
});

router.post('/', requireScreen('delivery_notes', 'edit'), async (req, res) => {
  const body = req.body || {};
  const id = body.id || `dn-${Date.now()}`;

  const created = await sequelize.transaction(async (t) => {
    const dn = await DeliveryNote.create(
      {
        id,
        deliveryNoteNumber: body.deliveryNoteNumber,
        deliveryDate: body.deliveryDate,
        poNumber: body.poNumber,
        customerName: body.customerName,
        destination: body.destination,
        contract: body.contract,
        poDate: body.poDate,
        carrier: body.carrier,
        vehicleNumber: body.vehicleNumber,
        driverName: body.driverName,
        receivedBy: body.receivedBy,
        subtotalBeforeVat: body.subtotalBeforeVat || 0,
        totalVat: body.totalVat || 0,
        totalDeliveredQuantity: body.totalDeliveredQuantity || 0,
        totalDeliveredValue: body.totalDeliveredValue || 0,
        notes: body.notes,
        comment: body.comment,
        status: body.status || 'ACTIVE',
        isCancelled: !!body.isCancelled,
        cancelReason: body.cancelReason,
        isOfr: !!body.isOfr,
        ofrDetail: body.ofrDetail,
        isCallOfOrder: !!body.isCallOfOrder,
        callOfOrderDetail: body.callOfOrderDetail,
        matchedInvoiceNumber: body.matchedInvoiceNumber,
        isFullyInvoiced: !!body.isFullyInvoiced,
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
      await DeliveryNoteLine.create({ deliveryNoteId: dn.id, ...lineFields(line) }, { transaction: t });
    }
    return dn;
  });

  const full = await DeliveryNote.findByPk(created.id, { include: [{ model: DeliveryNoteLine, as: 'lines' }] });
  broadcast({ type: 'sync_notification', entity: 'delivery_notes' });
  res.status(201).json({ success: true, data: serialize(full!) });
});

router.put('/:id', requireScreen('delivery_notes', 'edit'), async (req, res) => {
  const dn = await DeliveryNote.findByPk(req.params.id);
  if (!dn) return res.status(404).json({ success: false, error: 'Delivery note not found' });

  const body = req.body || {};
  await sequelize.transaction(async (t) => {
    await dn.update(
      {
        deliveryNoteNumber: body.deliveryNoteNumber ?? dn.deliveryNoteNumber,
        deliveryDate: body.deliveryDate ?? dn.deliveryDate,
        poNumber: body.poNumber ?? dn.poNumber,
        customerName: body.customerName ?? dn.customerName,
        destination: body.destination ?? dn.destination,
        contract: body.contract ?? dn.contract,
        poDate: body.poDate ?? dn.poDate,
        carrier: body.carrier ?? dn.carrier,
        vehicleNumber: body.vehicleNumber ?? dn.vehicleNumber,
        driverName: body.driverName ?? dn.driverName,
        receivedBy: body.receivedBy ?? dn.receivedBy,
        subtotalBeforeVat: body.subtotalBeforeVat ?? dn.subtotalBeforeVat,
        totalVat: body.totalVat ?? dn.totalVat,
        totalDeliveredQuantity: body.totalDeliveredQuantity ?? dn.totalDeliveredQuantity,
        totalDeliveredValue: body.totalDeliveredValue ?? dn.totalDeliveredValue,
        notes: body.notes ?? dn.notes,
        comment: body.comment ?? dn.comment,
        status: body.status ?? dn.status,
        isCancelled: body.isCancelled ?? dn.isCancelled,
        cancelReason: body.cancelReason ?? dn.cancelReason,
        isOfr: body.isOfr ?? dn.isOfr,
        ofrDetail: body.ofrDetail ?? dn.ofrDetail,
        isCallOfOrder: body.isCallOfOrder ?? dn.isCallOfOrder,
        callOfOrderDetail: body.callOfOrderDetail ?? dn.callOfOrderDetail,
        matchedInvoiceNumber: body.matchedInvoiceNumber ?? dn.matchedInvoiceNumber,
        isFullyInvoiced: body.isFullyInvoiced ?? dn.isFullyInvoiced,
        hasIssue: body.hasIssue ?? dn.hasIssue,
        issueComment: body.issueComment ?? dn.issueComment,
        issueId: body.issueId ?? dn.issueId,
        issueStatus: body.issueStatus ?? dn.issueStatus,
        lastModifiedBy: body.lastModifiedBy ?? dn.lastModifiedBy,
      },
      { transaction: t }
    );

    if (Array.isArray(body.lines)) {
      await DeliveryNoteLine.destroy({ where: { deliveryNoteId: dn.id }, transaction: t });
      for (const line of body.lines) {
        // eslint-disable-next-line no-await-in-loop
        await DeliveryNoteLine.create({ deliveryNoteId: dn.id, ...lineFields(line) }, { transaction: t });
      }
    }
  });

  const full = await DeliveryNote.findByPk(dn.id, { include: [{ model: DeliveryNoteLine, as: 'lines' }] });
  broadcast({ type: 'sync_notification', entity: 'delivery_notes' });
  res.json({ success: true, data: serialize(full!) });
});

router.delete('/:id', requireScreen('delivery_notes', 'edit'), async (req, res) => {
  const dn = await DeliveryNote.findByPk(req.params.id);
  if (!dn) return res.status(404).json({ success: false, error: 'Delivery note not found' });
  await dn.destroy();
  broadcast({ type: 'sync_notification', entity: 'delivery_notes' });
  res.json({ success: true });
});

export default router;
