import { Router } from 'express';
import { CustomerSeriesBook } from '../models/CustomerSeriesBook';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

router.get('/', requireScreen('settings', 'view'), async (_req, res) => {
  const rows = await CustomerSeriesBook.findAll();
  res.json({ success: true, data: rows });
});

router.put('/:customerName', requireScreen('settings', 'edit'), async (req, res) => {
  const customerName = decodeURIComponent(req.params.customerName);
  const body = req.body || {};

  const [row] = await CustomerSeriesBook.findOrCreate({
    where: { customerName },
    defaults: {
      id: body.id || `book-${Date.now()}`,
      customerName,
      invoicePrefix: body.invoicePrefix || customerName.slice(0, 3).toUpperCase(),
      invoiceStartNumber: body.invoiceStartNumber ?? 1,
      invoiceEndNumber: body.invoiceEndNumber ?? 999999,
      invoiceCurrentNumber: body.invoiceCurrentNumber ?? 1,
      deliveryPrefix: body.deliveryPrefix || customerName.slice(0, 3).toUpperCase(),
      deliveryStartNumber: body.deliveryStartNumber ?? 1,
      deliveryEndNumber: body.deliveryEndNumber ?? 999999,
      deliveryCurrentNumber: body.deliveryCurrentNumber ?? 1,
      padding: body.padding ?? 3,
      description: body.description,
    },
  });

  await row.update({
    invoicePrefix: body.invoicePrefix ?? row.invoicePrefix,
    invoiceStartNumber: body.invoiceStartNumber ?? row.invoiceStartNumber,
    invoiceEndNumber: body.invoiceEndNumber ?? row.invoiceEndNumber,
    invoiceCurrentNumber: body.invoiceCurrentNumber ?? row.invoiceCurrentNumber,
    deliveryPrefix: body.deliveryPrefix ?? row.deliveryPrefix,
    deliveryStartNumber: body.deliveryStartNumber ?? row.deliveryStartNumber,
    deliveryEndNumber: body.deliveryEndNumber ?? row.deliveryEndNumber,
    deliveryCurrentNumber: body.deliveryCurrentNumber ?? row.deliveryCurrentNumber,
    padding: body.padding ?? row.padding,
    description: body.description ?? row.description,
  });

  broadcast({ type: 'sync_notification', entity: 'customer_series_books' });
  res.json({ success: true, data: row });
});

router.delete('/:customerName', requireScreen('settings', 'edit'), async (req, res) => {
  const customerName = decodeURIComponent(req.params.customerName);
  await CustomerSeriesBook.destroy({ where: { customerName } });
  broadcast({ type: 'sync_notification', entity: 'customer_series_books' });
  res.json({ success: true });
});

export default router;
