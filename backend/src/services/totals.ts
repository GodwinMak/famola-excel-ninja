import { Transaction } from 'sequelize';
import { Invoice } from '../models/Invoice';
import { InvoiceLine } from '../models/InvoiceLine';
import { DeliveryNote } from '../models/DeliveryNote';
import { DeliveryNoteLine } from '../models/DeliveryNoteLine';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Recomputes every line's VAT figures plus the invoice header totals from the
 * stored lines. Returns true when anything was actually changed.
 */
export async function recalculateInvoice(invoiceId: string, transaction?: Transaction): Promise<boolean> {
  const invoice = await Invoice.findByPk(invoiceId, { transaction });
  if (!invoice) return false;
  const lines = await InvoiceLine.findAll({ where: { invoiceId }, transaction });
  let changed = false;
  let subtotal = 0;
  let vat = 0;

  for (const l of lines) {
    const qty = num(l.invoicedQuantity);
    const price = num(l.unitPrice);
    const rate = l.vatRate !== null && l.vatRate !== undefined ? num(l.vatRate) : 0.18;
    let before: number;
    if (qty > 0 && price > 0) before = round2(qty * price);
    else if (num(l.valueBeforeVat) > 0) before = num(l.valueBeforeVat);
    else if (num(l.valueAfterVat) > 0) before = round2(num(l.valueAfterVat) / (1 + rate));
    else before = 0;
    let vatAmt = round2(before * rate);
    const explicitVat = num(l.vatAmount);
    if (explicitVat > 0 && explicitVat <= before * 0.35) vatAmt = explicitVat;
    const after = round2(before + vatAmt);

    if (num(l.valueBeforeVat) !== before || num(l.vatAmount) !== vatAmt || num(l.valueAfterVat) !== after) {
      changed = true;
      await l.update({ valueBeforeVat: before, vatAmount: vatAmt, valueAfterVat: after }, { transaction });
    }
    subtotal += before;
    vat += vatAmt;
  }

  // Header-only invoices (no lines) keep their totals, just back-filling a missing side.
  if (lines.length > 0) {
    subtotal = round2(subtotal);
    vat = round2(vat);
    const total = round2(subtotal + vat);
    if (num(invoice.subtotalBeforeVat) !== subtotal || num(invoice.totalVat) !== vat || num(invoice.totalAfterVat) !== total) {
      changed = true;
      await invoice.update({ subtotalBeforeVat: subtotal, totalVat: vat, totalAfterVat: total }, { transaction });
    }
  } else {
    let sub = num(invoice.subtotalBeforeVat);
    let vt = num(invoice.totalVat);
    let tot = num(invoice.totalAfterVat);
    if (tot > 0 && sub <= 0) {
      sub = round2(tot / 1.18);
      vt = round2(tot - sub);
    } else if (sub > 0 && tot <= 0) {
      vt = round2(sub * 0.18);
      tot = round2(sub + vt);
    } else {
      return changed;
    }
    changed = true;
    await invoice.update({ subtotalBeforeVat: sub, totalVat: vt, totalAfterVat: tot }, { transaction });
  }
  return changed;
}

/** Same as recalculateInvoice, for delivery notes (header carries qty + value totals). */
export async function recalculateDeliveryNote(dnId: string, transaction?: Transaction): Promise<boolean> {
  const dn = await DeliveryNote.findByPk(dnId, { transaction });
  if (!dn) return false;
  const lines = await DeliveryNoteLine.findAll({ where: { deliveryNoteId: dnId }, transaction });
  let changed = false;
  let totalQty = 0;
  let totalVal = 0;
  let totalBefore = 0;

  for (const l of lines) {
    const qty = num(l.deliveredQuantity);
    const price = num(l.unitPrice);
    const rate = l.vatRate !== null && l.vatRate !== undefined ? num(l.vatRate) : 0.18;
    const before = round2(qty * price);
    const vatAmt = round2(before * rate);
    const after = round2(before + vatAmt);
    if (num(l.valueBeforeVat) !== before || num(l.vatAmount) !== vatAmt || num(l.valueAfterVat) !== after) {
      changed = true;
      await l.update({ valueBeforeVat: before, vatAmount: vatAmt, valueAfterVat: after }, { transaction });
    }
    totalQty += qty;
    totalBefore += before;
    totalVal += after;
  }

  totalVal = round2(totalVal);
  totalBefore = round2(totalBefore);
  if (num(dn.totalDeliveredQuantity) !== totalQty || num(dn.totalDeliveredValue) !== totalVal || num(dn.subtotalBeforeVat) !== totalBefore) {
    changed = true;
    await dn.update(
      { totalDeliveredQuantity: totalQty, totalDeliveredValue: totalVal, subtotalBeforeVat: totalBefore },
      { transaction }
    );
  }
  return changed;
}
