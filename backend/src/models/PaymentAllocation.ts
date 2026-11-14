import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface PaymentAllocationAttributes {
  id: string;
  paymentId: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  poNumber?: string | null;
  customerName?: string | null;
  invoiceTotal: number;
  alreadyPaid: number;
  pendingBalance: number;
  allocatedAmount: number;
  hasIssue: boolean;
  issueComment?: string | null;
}

type PaymentAllocationCreationAttributes = Optional<PaymentAllocationAttributes, 'id' | 'hasIssue'>;

export class PaymentAllocation
  extends Model<PaymentAllocationAttributes, PaymentAllocationCreationAttributes>
  implements PaymentAllocationAttributes
{
  declare id: string;
  declare paymentId: string;
  declare invoiceId: string | null;
  declare invoiceNumber: string | null;
  declare poNumber: string | null;
  declare customerName: string | null;
  declare invoiceTotal: number;
  declare alreadyPaid: number;
  declare pendingBalance: number;
  declare allocatedAmount: number;
  declare hasIssue: boolean;
  declare issueComment: string | null;
}

PaymentAllocation.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    paymentId: { type: DataTypes.STRING(64), allowNull: false, field: 'payment_id' },
    invoiceId: { type: DataTypes.STRING(64), allowNull: true, field: 'invoice_id' },
    invoiceNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'invoice_number' },
    poNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'po_number' },
    customerName: { type: DataTypes.STRING(191), allowNull: true, field: 'customer_name' },
    invoiceTotal: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'invoice_total' },
    alreadyPaid: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'already_paid' },
    pendingBalance: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'pending_balance' },
    allocatedAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'allocated_amount' },
    hasIssue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'has_issue' },
    issueComment: { type: DataTypes.TEXT, allowNull: true, field: 'issue_comment' },
  },
  {
    sequelize,
    modelName: 'PaymentAllocation',
    tableName: 'payment_allocations',
    underscored: true,
    timestamps: false,
  }
);
