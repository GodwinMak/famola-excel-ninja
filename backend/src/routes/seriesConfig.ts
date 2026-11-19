import { Router } from 'express';
import { SeriesConfig } from '../models/SeriesConfig';
import { CustomerSeriesBook } from '../models/CustomerSeriesBook';
import { Invoice } from '../models/Invoice';
import { DeliveryNote } from '../models/DeliveryNote';
import { sequelize } from '../config/db';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

router.get('/', requireScreen('settings', 'view'), async (_req, res) => {
  const rows = await SeriesConfig.findAll();
  const invoiceSeries = rows.find((r) => r.seriesType === 'invoice');
  const deliverySeries = rows.find((r) => r.seriesType === 'delivery');
  res.json({ success: true, data: { invoiceSeries, deliverySeries } });
});

router.put('/:type', requireScreen('settings', 'edit'), async (req, res) => {
  const type = req.params.type as 'invoice' | 'delivery';
  if (type !== 'invoice' && type !== 'delivery') {
    return res.status(400).json({ success: false, error: 'type must be invoice or delivery' });
  }

  const [row] = await SeriesConfig.findOrCreate({
    where: { seriesType: type },
    defaults: { seriesType: type, prefix: type === 'invoice' ? 'INV-' : 'DN-', startNumber: 1, endNumber: 999999, currentNumber: 1, padding: 3, autoIncrement: true },
  });

  const body = req.body || {};
  await row.update({
    prefix: body.prefix ?? row.prefix,
    startNumber: body.startNumber ?? row.startNumber,
    endNumber: body.endNumber ?? row.endNumber,
    currentNumber: body.currentNumber ?? row.currentNumber,
    padding: body.padding ?? row.padding,
    autoIncrement: body.autoIncrement ?? row.autoIncrement,
  });

  broadcast({ type: 'sync_notification', entity: 'series_config' });
  res.json({ success: true, data: row });
});

function formatNumber(prefix: string, current: number, padding: number): string {
  const padded = padding > 0 ? String(current).padStart(padding, '0') : String(current);
  return `${prefix || ''}${padded}`;
}

function defaultCustomerPrefix(customerName: string): string {
  const cleaned = customerName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : (cleaned || 'CUS').padEnd(3, 'X');
}

// Atomically allocates the next free number for a series (global or per-customer book)
// and advances the counter in the same locked transaction, so two concurrent callers
// (different browsers/users) can never be handed the same number. Gated by the same
// screen permission as actually creating the invoice/delivery note it's for, not by
// 'settings' — regular Finance Officers/Logistics Managers need to call this too.
router.post(
  '/:type/advance',
  (req, res, next) => {
    const type = req.params.type;
    if (type !== 'invoice' && type !== 'delivery') {
      return res.status(400).json({ success: false, error: 'type must be invoice or delivery' });
    }
    const screenId = type === 'invoice' ? 'create_invoice' : 'delivery_notes';
    return requireScreen(screenId, 'edit')(req, res, next);
  },
  async (req, res) => {
    const type = req.params.type as 'invoice' | 'delivery';
    const rawCustomerName = typeof req.body?.customerName === 'string' ? req.body.customerName.trim() : '';
    const isCustomer = Boolean(rawCustomerName) && rawCustomerName.toUpperCase() !== 'ALL';

    try {
      const result = await sequelize.transaction(async (t) => {
        let prefix: string;
        let current: number;
        let start: number;
        let end: number;
        let padding: number;
        let bookRow: CustomerSeriesBook | null = null;
        let seriesRow: SeriesConfig | null = null;

        if (isCustomer) {
          bookRow = await CustomerSeriesBook.findOne({
            where: { customerName: rawCustomerName },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!bookRow) {
            const defaultPrefix = defaultCustomerPrefix(rawCustomerName);
            try {
              bookRow = await CustomerSeriesBook.create(
                {
                  id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  customerName: rawCustomerName,
                  invoicePrefix: defaultPrefix,
                  invoiceStartNumber: 1,
                  invoiceEndNumber: 200,
                  invoiceCurrentNumber: 1,
                  deliveryPrefix: defaultPrefix,
                  deliveryStartNumber: 1,
                  deliveryEndNumber: 200,
                  deliveryCurrentNumber: 1,
                  padding: 3,
                },
                { transaction: t }
              );
            } catch (createErr) {
              // Another concurrent request for the same new customer won the
              // race to create the book first (unique customer_name index) —
              // re-fetch (now locked) instead of failing the whole allocation.
              bookRow = await CustomerSeriesBook.findOne({
                where: { customerName: rawCustomerName },
                transaction: t,
                lock: t.LOCK.UPDATE,
              });
              if (!bookRow) throw createErr;
            }
          }
          prefix = type === 'invoice' ? bookRow.invoicePrefix : bookRow.deliveryPrefix;
          current = type === 'invoice' ? bookRow.invoiceCurrentNumber : bookRow.deliveryCurrentNumber;
          start = type === 'invoice' ? bookRow.invoiceStartNumber : bookRow.deliveryStartNumber;
          end = type === 'invoice' ? bookRow.invoiceEndNumber : bookRow.deliveryEndNumber;
          padding = bookRow.padding;
        } else {
          seriesRow = await SeriesConfig.findOne({
            where: { seriesType: type },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!seriesRow) {
            try {
              seriesRow = await SeriesConfig.create(
                {
                  seriesType: type,
                  prefix: type === 'invoice' ? 'INV-' : 'DN-',
                  startNumber: 1,
                  endNumber: 999999,
                  currentNumber: 1,
                  padding: 3,
                  autoIncrement: true,
                },
                { transaction: t }
              );
            } catch (createErr) {
              seriesRow = await SeriesConfig.findOne({
                where: { seriesType: type },
                transaction: t,
                lock: t.LOCK.UPDATE,
              });
              if (!seriesRow) throw createErr;
            }
          }
          prefix = seriesRow.prefix;
          current = seriesRow.currentNumber;
          start = seriesRow.startNumber;
          end = seriesRow.endNumber;
          padding = seriesRow.padding;
        }

        // Skip past any number already used in the real table (covers legacy/manual
        // numbers saved outside the sequence) using authoritative DB data, not a
        // client-supplied array.
        const existingRows =
          type === 'invoice'
            ? await Invoice.findAll({ attributes: ['invoiceNumber'], transaction: t })
            : await DeliveryNote.findAll({ attributes: ['deliveryNoteNumber'], transaction: t });
        const existingSet = new Set(
          existingRows.map((r: any) =>
            String(type === 'invoice' ? r.invoiceNumber : r.deliveryNoteNumber).trim().toLowerCase()
          )
        );

        let num = current;
        let candidate = formatNumber(prefix, num, padding);
        let attempts = 0;
        while (existingSet.has(candidate.toLowerCase()) && attempts < 5000) {
          num = num < end ? num + 1 : start;
          attempts += 1;
          candidate = formatNumber(prefix, num, padding);
        }

        const nextCurrent = num < end ? num + 1 : start;
        if (isCustomer && bookRow) {
          if (type === 'invoice') bookRow.invoiceCurrentNumber = nextCurrent;
          else bookRow.deliveryCurrentNumber = nextCurrent;
          await bookRow.save({ transaction: t });
        } else if (seriesRow) {
          seriesRow.currentNumber = nextCurrent;
          await seriesRow.save({ transaction: t });
        }

        return { number: candidate, raw: num };
      });

      broadcast({ type: 'sync_notification', entity: isCustomer ? 'customer_series_books' : 'series_config' });
      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Series number allocation failed:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to allocate series number' });
    }
  }
);

export default router;
