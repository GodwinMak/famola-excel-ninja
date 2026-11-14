import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface InvoiceAttributes {
  id: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  poNumber?: string | null;
  customerName: string;
  destination?: string | null;
  contract?: string | null;
  poDate?: string | null;
  subtotalBeforeVat: number;
  totalVat: number;
  totalAfterVat: number;
  paidAmount: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  notes?: string | null;
  comment?: string | null;
  status: 'ACTIVE' | 'CANCELLED' | 'OFR';
  isCancelled: boolean;
  isFlagged: boolean;
  cancelReason?: string | null;
  isOfr: boolean;
  ofrDetail?: string | null;
  hasIssue: boolean;
  issueComment?: string | null;
  issueId?: string | null;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  lastModifiedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type InvoiceCreationAttributes = Optional<
  InvoiceAttributes,
  'createdAt' | 'updatedAt' | 'isCancelled' | 'isFlagged' | 'isOfr' | 'hasIssue' | 'status' | 'paymentStatus'
>;

export class Invoice extends Model<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  declare id: string;
  declare invoiceNumber: string;
  declare invoiceDate: string | null;
  declare poNumber: string | null;
  declare customerName: string;
  declare destination: string | null;
  declare contract: string | null;
  declare poDate: string | null;
  declare subtotalBeforeVat: number;
  declare totalVat: number;
  declare totalAfterVat: number;
  declare paidAmount: number;
  declare paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  declare notes: string | null;
  declare comment: string | null;
  declare status: 'ACTIVE' | 'CANCELLED' | 'OFR';
  declare isCancelled: boolean;
  declare isFlagged: boolean;
  declare cancelReason: string | null;
  declare isOfr: boolean;
  declare ofrDetail: string | null;
  declare hasIssue: boolean;
  declare issueComment: string | null;
  declare issueId: string | null;
  declare issueStatus: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  declare lastModifiedBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Invoice.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    invoiceNumber: { type: DataTypes.STRING(128), allowNull: false, unique: true, field: 'invoice_number' },
    invoiceDate: { type: DataTypes.STRING(32), allowNull: true, field: 'invoice_date' },
    poNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'po_number' },
    customerName: { type: DataTypes.STRING(191), allowNull: false, field: 'customer_name' },
    destination: { type: DataTypes.STRING(191), allowNull: true },
    contract: { type: DataTypes.STRING(128), allowNull: true },
    poDate: { type: DataTypes.STRING(32), allowNull: true, field: 'po_date' },
    subtotalBeforeVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'subtotal_before_vat' },
    totalVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'total_vat' },
    totalAfterVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'total_after_vat' },
    paidAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'paid_amount' },
    paymentStatus: {
      type: DataTypes.ENUM('PAID', 'PARTIAL', 'UNPAID'),
      allowNull: false,
      defaultValue: 'UNPAID',
      field: 'payment_status',
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CANCELLED', 'OFR'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isCancelled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_cancelled' },
    isFlagged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_flagged' },
    cancelReason: { type: DataTypes.TEXT, allowNull: true, field: 'cancel_reason' },
    isOfr: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_ofr' },
    ofrDetail: { type: DataTypes.TEXT, allowNull: true, field: 'ofr_detail' },
    hasIssue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'has_issue' },
    issueComment: { type: DataTypes.TEXT, allowNull: true, field: 'issue_comment' },
    issueId: { type: DataTypes.STRING(64), allowNull: true, field: 'issue_id' },
    issueStatus: {
      type: DataTypes.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
      allowNull: true,
      field: 'issue_status',
    },
    lastModifiedBy: { type: DataTypes.STRING(191), allowNull: true, field: 'last_modified_by' },
  },
  {
    sequelize,
    modelName: 'Invoice',
    tableName: 'invoices',
    underscored: true,
    timestamps: true,
  }
);
