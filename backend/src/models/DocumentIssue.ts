import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export type IssueType =
  | 'Quantity Discrepancy'
  | 'Pricing / Rate Error'
  | 'Missing Delivery Ref'
  | 'VAT / Calculation Error'
  | 'Wrong PO Reference'
  | 'Damaged / Rejected Goods'
  | 'Payment Mismatch'
  | 'Customer Query'
  | 'Other';

export interface DocumentIssueAttributes {
  id: string;
  entityType: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
  entityId?: string | null;
  referenceNumber: string;
  poNumber?: string | null;
  customerName?: string | null;
  destination?: string | null;
  contract?: string | null;
  totalValue?: number | null;
  disputedAmount?: number | null;
  issueTitle: string;
  primaryIssue?: string | null;
  issueType: IssueType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  flaggedBy: string;
  flaggedAt?: Date;
  headerComment?: string | null;
  reviewComment?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNotes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type DocumentIssueCreationAttributes = Optional<DocumentIssueAttributes, 'createdAt' | 'updatedAt' | 'flaggedAt' | 'status'>;

export class DocumentIssue
  extends Model<DocumentIssueAttributes, DocumentIssueCreationAttributes>
  implements DocumentIssueAttributes
{
  declare id: string;
  declare entityType: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
  declare entityId: string | null;
  declare referenceNumber: string;
  declare poNumber: string | null;
  declare customerName: string | null;
  declare destination: string | null;
  declare contract: string | null;
  declare totalValue: number | null;
  declare disputedAmount: number | null;
  declare issueTitle: string;
  declare primaryIssue: string | null;
  declare issueType: IssueType;
  declare severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  declare status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
  declare flaggedBy: string;
  declare flaggedAt: Date;
  declare headerComment: string | null;
  declare reviewComment: string | null;
  declare resolvedBy: string | null;
  declare resolvedAt: Date | null;
  declare resolutionNotes: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

DocumentIssue.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    entityType: { type: DataTypes.ENUM('INVOICE', 'DELIVERY', 'PAYMENT'), allowNull: false, field: 'entity_type' },
    entityId: { type: DataTypes.STRING(64), allowNull: true, field: 'entity_id' },
    referenceNumber: { type: DataTypes.STRING(191), allowNull: false, field: 'reference_number' },
    poNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'po_number' },
    customerName: { type: DataTypes.STRING(191), allowNull: true, field: 'customer_name' },
    destination: { type: DataTypes.STRING(191), allowNull: true },
    contract: { type: DataTypes.STRING(128), allowNull: true },
    totalValue: { type: DataTypes.DECIMAL(16, 2), allowNull: true, defaultValue: 0, field: 'total_value' },
    disputedAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: true, defaultValue: 0, field: 'disputed_amount' },
    issueTitle: { type: DataTypes.STRING(255), allowNull: false, field: 'issue_title' },
    primaryIssue: { type: DataTypes.STRING(255), allowNull: true, field: 'primary_issue' },
    issueType: {
      type: DataTypes.ENUM(
        'Quantity Discrepancy',
        'Pricing / Rate Error',
        'Missing Delivery Ref',
        'VAT / Calculation Error',
        'Wrong PO Reference',
        'Damaged / Rejected Goods',
        'Payment Mismatch',
        'Customer Query',
        'Other'
      ),
      allowNull: false,
      field: 'issue_type',
    },
    severity: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), allowNull: false },
    status: {
      type: DataTypes.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    flaggedBy: { type: DataTypes.STRING(191), allowNull: false, field: 'flagged_by' },
    flaggedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'flagged_at' },
    headerComment: { type: DataTypes.TEXT, allowNull: true, field: 'header_comment' },
    reviewComment: { type: DataTypes.TEXT, allowNull: true, field: 'review_comment' },
    resolvedBy: { type: DataTypes.STRING(191), allowNull: true, field: 'resolved_by' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    resolutionNotes: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_notes' },
  },
  {
    sequelize,
    modelName: 'DocumentIssue',
    tableName: 'document_issues',
    underscored: true,
    timestamps: true,
  }
);
