import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export type PaymentMethod = 'Bank Transfer' | 'Cheque' | 'Cash' | 'EFT' | 'Mobile Money';

export interface PaymentAttributes {
  id: string;
  paymentNumber: string;
  paymentDate?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  poNumber?: string | null;
  customerName: string;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  depositAccount?: string | null;
  notes?: string | null;
  hasIssue: boolean;
  issueComment?: string | null;
  issueId?: string | null;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  createdAt?: Date;
}

type PaymentCreationAttributes = Optional<PaymentAttributes, 'createdAt' | 'hasIssue'>;

export class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  declare id: string;
  declare paymentNumber: string;
  declare paymentDate: string | null;
  declare invoiceId: string | null;
  declare invoiceNumber: string | null;
  declare poNumber: string | null;
  declare customerName: string;
  declare amountPaid: number;
  declare paymentMethod: PaymentMethod;
  declare referenceNumber: string | null;
  declare depositAccount: string | null;
  declare notes: string | null;
  declare hasIssue: boolean;
  declare issueComment: string | null;
  declare issueId: string | null;
  declare issueStatus: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  declare readonly createdAt: Date;
}

Payment.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    paymentNumber: { type: DataTypes.STRING(128), allowNull: false, unique: true, field: 'payment_number' },
    paymentDate: { type: DataTypes.STRING(32), allowNull: true, field: 'payment_date' },
    invoiceId: { type: DataTypes.STRING(64), allowNull: true, field: 'invoice_id' },
    invoiceNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'invoice_number' },
    poNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'po_number' },
    customerName: { type: DataTypes.STRING(191), allowNull: false, field: 'customer_name' },
    amountPaid: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'amount_paid' },
    paymentMethod: {
      type: DataTypes.ENUM('Bank Transfer', 'Cheque', 'Cash', 'EFT', 'Mobile Money'),
      allowNull: false,
      field: 'payment_method',
    },
    referenceNumber: { type: DataTypes.STRING(191), allowNull: true, field: 'reference_number' },
    depositAccount: { type: DataTypes.STRING(191), allowNull: true, field: 'deposit_account' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    hasIssue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'has_issue' },
    issueComment: { type: DataTypes.TEXT, allowNull: true, field: 'issue_comment' },
    issueId: { type: DataTypes.STRING(64), allowNull: true, field: 'issue_id' },
    issueStatus: {
      type: DataTypes.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
      allowNull: true,
      field: 'issue_status',
    },
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);
