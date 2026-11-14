import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/db';
import '../models/index';
import { Invoice } from '../models/Invoice';
import { InvoiceLine } from '../models/InvoiceLine';
import { DeliveryNote } from '../models/DeliveryNote';
import { DeliveryNoteLine } from '../models/DeliveryNoteLine';
import { DocumentIssue } from '../models/DocumentIssue';
import { IssueLineItem } from '../models/IssueLineItem';
import { IssueComment } from '../models/IssueComment';

const CHUNK = 500;

async function chunkedBulkCreate(model: any, rows: any[], label: string, transaction: any) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    await model.bulkCreate(slice, { transaction, validate: true });
    console.log(`  ${label}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
}

function toDate(v: any): Date {
  if (!v) return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function main() {
  const filePath = process.argv[2] || path.join(__dirname, '../../data/famola_database.json');
  console.log(`Reading ${filePath} ...`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  await sequelize.authenticate();

  const existingInvoices = await Invoice.count();
  const existingDNs = await DeliveryNote.count();
  const existingIssues = await DocumentIssue.count();
  if (existingInvoices > 0 || existingDNs > 0 || existingIssues > 0) {
    console.error(
      `Refusing to import: target tables are not empty (invoices=${existingInvoices}, delivery_notes=${existingDNs}, document_issues=${existingIssues}). ` +
        `Re-running this would create duplicates. Truncate first if you really want to re-import.`
    );
    process.exit(1);
  }

  const invoices: any[] = data.invoices || [];
  const deliveryNotes: any[] = data.deliveryNotes || [];
  const issues: any[] = data.issues || [];

  const invoiceRows = invoices.map((inv) => ({
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
    issueId: inv.issueId || null,
    issueStatus: inv.issueStatus || null,
    lastModifiedBy: inv.lastModifiedBy,
    createdAt: toDate(inv.createdAt),
    updatedAt: toDate(inv.updatedAt || inv.createdAt),
  }));

  const invoiceLineRows: any[] = [];
  for (const inv of invoices) {
    for (const line of inv.lines || []) {
      invoiceLineRows.push({
        id: line.id || undefined,
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
      });
    }
  }

  const dnRows = deliveryNotes.map((dn) => ({
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
    matchedInvoiceNumber: dn.matchedInvoiceNumber || null,
    isFullyInvoiced: !!dn.isFullyInvoiced,
    hasIssue: !!dn.hasIssue,
    issueComment: dn.issueComment,
    issueId: dn.issueId || null,
    issueStatus: dn.issueStatus || null,
    lastModifiedBy: dn.lastModifiedBy,
    createdAt: toDate(dn.createdAt),
    updatedAt: toDate(dn.updatedAt || dn.createdAt),
  }));

  const dnLineRows: any[] = [];
  for (const dn of deliveryNotes) {
    for (const line of dn.lines || []) {
      dnLineRows.push({
        id: line.id || undefined,
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
      });
    }
  }

  const issueRows = issues.map((issue) => ({
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
    flaggedAt: toDate(issue.flaggedAt),
    headerComment: issue.headerComment,
    reviewComment: issue.reviewComment,
    resolvedBy: issue.resolvedBy,
    resolvedAt: issue.resolvedAt ? toDate(issue.resolvedAt) : null,
    resolutionNotes: issue.resolutionNotes,
    createdAt: toDate(issue.flaggedAt),
    updatedAt: toDate(issue.flaggedAt),
  }));

  const issueLineRows: any[] = [];
  const issueCommentRows: any[] = [];
  for (const issue of issues) {
    for (const l of issue.lineIssues || []) {
      issueLineRows.push({
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
        issueComment: l.issueComment || 'Discrepancy',
        issueReason: l.issueReason,
        workComment: l.workComment,
        reviewerComment: l.reviewerComment,
        status: l.status || 'PENDING',
      });
    }
    for (const c of issue.comments || []) {
      issueCommentRows.push({
        issueId: issue.id,
        authorName: c.authorName || c.userName || 'System',
        authorRole: c.authorRole,
        comment: c.comment,
        type: c.type || 'WORK_NOTE',
        createdAt: toDate(c.createdAt),
      });
    }
  }

  console.log(
    `Parsed: ${invoiceRows.length} invoices (${invoiceLineRows.length} lines), ` +
      `${dnRows.length} delivery notes (${dnLineRows.length} lines), ` +
      `${issueRows.length} issues (${issueLineRows.length} line-issues, ${issueCommentRows.length} comments)`
  );

  await sequelize.transaction(async (t) => {
    console.log('Importing invoices...');
    await chunkedBulkCreate(Invoice, invoiceRows, 'invoices', t);
    console.log('Importing invoice lines...');
    await chunkedBulkCreate(InvoiceLine, invoiceLineRows, 'invoice_lines', t);
    console.log('Importing delivery notes...');
    await chunkedBulkCreate(DeliveryNote, dnRows, 'delivery_notes', t);
    console.log('Importing delivery note lines...');
    await chunkedBulkCreate(DeliveryNoteLine, dnLineRows, 'delivery_note_lines', t);
    console.log('Importing issues...');
    await chunkedBulkCreate(DocumentIssue, issueRows, 'document_issues', t);
    console.log('Importing issue line items...');
    await chunkedBulkCreate(IssueLineItem, issueLineRows, 'issue_line_items', t);
    console.log('Importing issue comments...');
    await chunkedBulkCreate(IssueComment, issueCommentRows, 'issue_comments', t);
  });

  console.log('Import complete.');
  await sequelize.close();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
