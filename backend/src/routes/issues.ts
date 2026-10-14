import { Router } from 'express';
import { sequelize } from '../config/db';
import { DocumentIssue } from '../models/DocumentIssue';
import { IssueLineItem } from '../models/IssueLineItem';
import { IssueComment } from '../models/IssueComment';
import { requireAuth } from '../middleware/auth';
import { requireScreen } from '../middleware/rbac';
import { broadcast } from '../services/sseHub';

const router = Router();
router.use(requireAuth);

const includes = [
  { model: IssueLineItem, as: 'lineIssues' },
  { model: IssueComment, as: 'comments' },
];

function serialize(issue: DocumentIssue) {
  const json = issue.toJSON() as any;
  return { ...json, lineIssues: json.lineIssues || [], comments: json.comments || [] };
}

function lineIssueFields(l: any) {
  return {
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
  };
}

router.get('/', requireScreen('issue_tracking', 'view'), async (_req, res) => {
  const rows = await DocumentIssue.findAll({ include: includes, order: [['flaggedAt', 'DESC']] });
  res.json({ success: true, data: rows.map(serialize) });
});

router.get('/:id', requireScreen('issue_tracking', 'view'), async (req, res) => {
  const row = await DocumentIssue.findByPk(req.params.id, { include: includes });
  if (!row) return res.status(404).json({ success: false, error: 'Issue not found' });
  res.json({ success: true, data: serialize(row) });
});

router.post('/', requireScreen('issue_tracking', 'edit'), async (req, res) => {
  const body = req.body || {};
  const id = body.id || `issue-${Date.now()}`;

  const created = await sequelize.transaction(async (t) => {
    const issue = await DocumentIssue.create(
      {
        id,
        entityType: body.entityType,
        entityId: body.entityId,
        referenceNumber: body.referenceNumber,
        poNumber: body.poNumber,
        customerName: body.customerName,
        destination: body.destination,
        contract: body.contract,
        totalValue: body.totalValue || 0,
        disputedAmount: body.disputedAmount || 0,
        issueTitle: body.issueTitle,
        primaryIssue: body.primaryIssue,
        issueType: body.issueType,
        severity: body.severity,
        status: body.status || 'PENDING',
        flaggedBy: body.flaggedBy,
        headerComment: body.headerComment,
        reviewComment: body.reviewComment,
        resolvedBy: body.resolvedBy,
        resolvedAt: body.resolvedAt,
        resolutionNotes: body.resolutionNotes,
      },
      { transaction: t }
    );

    for (const line of Array.isArray(body.lineIssues) ? body.lineIssues : []) {
      // eslint-disable-next-line no-await-in-loop
      await IssueLineItem.create({ issueId: issue.id, ...lineIssueFields(line) }, { transaction: t });
    }
    for (const c of Array.isArray(body.comments) ? body.comments : []) {
      // eslint-disable-next-line no-await-in-loop
      await IssueComment.create(
        { issueId: issue.id, authorName: c.authorName, authorRole: c.authorRole, comment: c.comment, type: c.type },
        { transaction: t }
      );
    }
    return issue;
  });

  const full = await DocumentIssue.findByPk(created.id, { include: includes });
  broadcast({ type: 'sync_notification', entity: 'issues' });
  res.status(201).json({ success: true, data: serialize(full!) });
});

router.put('/:id', requireScreen('issue_tracking', 'edit'), async (req, res) => {
  const issue = await DocumentIssue.findByPk(req.params.id);
  if (!issue) return res.status(404).json({ success: false, error: 'Issue not found' });

  const body = req.body || {};
  await sequelize.transaction(async (t) => {
    await issue.update(
      {
        entityType: body.entityType ?? issue.entityType,
        entityId: body.entityId ?? issue.entityId,
        referenceNumber: body.referenceNumber ?? issue.referenceNumber,
        poNumber: body.poNumber ?? issue.poNumber,
        customerName: body.customerName ?? issue.customerName,
        destination: body.destination ?? issue.destination,
        contract: body.contract ?? issue.contract,
        totalValue: body.totalValue ?? issue.totalValue,
        disputedAmount: body.disputedAmount ?? issue.disputedAmount,
        issueTitle: body.issueTitle ?? issue.issueTitle,
        primaryIssue: body.primaryIssue ?? issue.primaryIssue,
        issueType: body.issueType ?? issue.issueType,
        severity: body.severity ?? issue.severity,
        status: body.status ?? issue.status,
        headerComment: body.headerComment ?? issue.headerComment,
        reviewComment: body.reviewComment ?? issue.reviewComment,
        resolvedBy: body.resolvedBy ?? issue.resolvedBy,
        resolvedAt: body.resolvedAt ?? issue.resolvedAt,
        resolutionNotes: body.resolutionNotes ?? issue.resolutionNotes,
      },
      { transaction: t }
    );

    if (Array.isArray(body.lineIssues)) {
      await IssueLineItem.destroy({ where: { issueId: issue.id }, transaction: t });
      for (const line of body.lineIssues) {
        // eslint-disable-next-line no-await-in-loop
        await IssueLineItem.create({ issueId: issue.id, ...lineIssueFields(line) }, { transaction: t });
      }
    }

    if (Array.isArray(body.newComments)) {
      for (const c of body.newComments) {
        // eslint-disable-next-line no-await-in-loop
        await IssueComment.create(
          { issueId: issue.id, authorName: c.authorName, authorRole: c.authorRole, comment: c.comment, type: c.type },
          { transaction: t }
        );
      }
    }
  });

  const full = await DocumentIssue.findByPk(issue.id, { include: includes });
  broadcast({ type: 'sync_notification', entity: 'issues' });
  res.json({ success: true, data: serialize(full!) });
});

router.delete('/:id', requireScreen('issue_tracking', 'edit'), async (req, res) => {
  const issue = await DocumentIssue.findByPk(req.params.id);
  if (!issue) return res.status(404).json({ success: false, error: 'Issue not found' });
  await issue.destroy();
  broadcast({ type: 'sync_notification', entity: 'issues' });
  res.json({ success: true });
});

export default router;
