import { Router } from 'express';
import { PoLine } from '../models/PoLine';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

router.get('/', requireScreen('po_master', 'view'), async (_req, res) => {
  const rows = await PoLine.findAll({ order: [['createdAt', 'ASC']] });
  res.json({ success: true, data: rows });
});

router.post('/', requireScreen('po_master', 'edit'), async (req, res) => {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [req.body];
  const created = await PoLine.bulkCreate(
    lines.map((l: any, idx: number) => ({
      id: l.id || `pol-${Date.now()}-${idx}`,
      customerName: l.customerName,
      destination: l.destination,
      poNumber: l.poNumber,
      contract: l.contract,
      itemDescription: l.itemDescription,
      poDate: l.date || l.poDate,
      unitOfMeasure: l.unitOfMeasure,
      quantity: l.quantity || 0,
      unitCost: l.unitCost || 0,
      unitPrice: l.unitPrice || 0,
      valueBeforeVat: l.valueBeforeVat || 0,
      vatRate: l.vatRate ?? 0.18,
      vatAmount: l.vatAmount || 0,
      valueAfterVat: l.valueAfterVat || 0,
      remarks: l.remarks,
    })),
    { updateOnDuplicate: ['customerName', 'destination', 'poNumber', 'contract', 'itemDescription', 'poDate', 'unitOfMeasure', 'quantity', 'unitCost', 'unitPrice', 'valueBeforeVat', 'vatRate', 'vatAmount', 'valueAfterVat', 'remarks'] }
  );
  broadcast({ type: 'sync_notification', entity: 'po_lines' });
  res.status(201).json({ success: true, data: created });
});

router.delete('/', requireScreen('po_master', 'edit'), async (req, res) => {
  // ?poNumber=... removes just that PO; with no filter the whole PO master is cleared.
  const poNumber = typeof req.query.poNumber === 'string' ? req.query.poNumber.trim() : '';
  if (poNumber) {
    await PoLine.destroy({ where: { poNumber } });
  } else {
    await PoLine.destroy({ where: {}, truncate: true });
  }
  broadcast({ type: 'sync_notification', entity: 'po_lines' });
  res.json({ success: true });
});

router.delete('/:id', requireScreen('po_master', 'edit'), async (req, res) => {
  await PoLine.destroy({ where: { id: req.params.id } });
  broadcast({ type: 'sync_notification', entity: 'po_lines' });
  res.json({ success: true });
});

export default router;
