import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface DeliveryNoteAttributes {
  id: string;
  deliveryNoteNumber: string;
  deliveryDate?: string | null;
  poNumber?: string | null;
  customerName: string;
  destination?: string | null;
  contract?: string | null;
  poDate?: string | null;
  carrier?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  receivedBy?: string | null;
  subtotalBeforeVat?: number | null;
  totalVat?: number | null;
  totalDeliveredQuantity: number;
  totalDeliveredValue: number;
  notes?: string | null;
  comment?: string | null;
  status: 'ACTIVE' | 'CANCELLED' | 'OFR' | 'CALL_OF_ORDER';
  isCancelled: boolean;
  cancelReason?: string | null;
  isOfr: boolean;
  ofrDetail?: string | null;
  isCallOfOrder: boolean;
  callOfOrderDetail?: string | null;
  matchedInvoiceNumber?: string | null;
  isFullyInvoiced: boolean;
  hasIssue: boolean;
  issueComment?: string | null;
  issueId?: string | null;
  issueStatus?: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  lastModifiedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type DeliveryNoteCreationAttributes = Optional<
  DeliveryNoteAttributes,
  'createdAt' | 'updatedAt' | 'isCancelled' | 'isOfr' | 'isCallOfOrder' | 'isFullyInvoiced' | 'hasIssue' | 'status'
>;

export class DeliveryNote extends Model<DeliveryNoteAttributes, DeliveryNoteCreationAttributes> implements DeliveryNoteAttributes {
  declare id: string;
  declare deliveryNoteNumber: string;
  declare deliveryDate: string | null;
  declare poNumber: string | null;
  declare customerName: string;
  declare destination: string | null;
  declare contract: string | null;
  declare poDate: string | null;
  declare carrier: string | null;
  declare vehicleNumber: string | null;
  declare driverName: string | null;
  declare receivedBy: string | null;
  declare subtotalBeforeVat: number | null;
  declare totalVat: number | null;
  declare totalDeliveredQuantity: number;
  declare totalDeliveredValue: number;
  declare notes: string | null;
  declare comment: string | null;
  declare status: 'ACTIVE' | 'CANCELLED' | 'OFR' | 'CALL_OF_ORDER';
  declare isCancelled: boolean;
  declare cancelReason: string | null;
  declare isOfr: boolean;
  declare ofrDetail: string | null;
  declare isCallOfOrder: boolean;
  declare callOfOrderDetail: string | null;
  declare matchedInvoiceNumber: string | null;
  declare isFullyInvoiced: boolean;
  declare hasIssue: boolean;
  declare issueComment: string | null;
  declare issueId: string | null;
  declare issueStatus: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | null;
  declare lastModifiedBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

DeliveryNote.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    deliveryNoteNumber: { type: DataTypes.STRING(128), allowNull: false, unique: true, field: 'delivery_note_number' },
    deliveryDate: { type: DataTypes.STRING(32), allowNull: true, field: 'delivery_date' },
    poNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'po_number' },
    customerName: { type: DataTypes.STRING(191), allowNull: false, field: 'customer_name' },
    destination: { type: DataTypes.STRING(191), allowNull: true },
    contract: { type: DataTypes.STRING(128), allowNull: true },
    poDate: { type: DataTypes.STRING(32), allowNull: true, field: 'po_date' },
    carrier: { type: DataTypes.STRING(191), allowNull: true },
    vehicleNumber: { type: DataTypes.STRING(64), allowNull: true, field: 'vehicle_number' },
    driverName: { type: DataTypes.STRING(191), allowNull: true, field: 'driver_name' },
    receivedBy: { type: DataTypes.STRING(191), allowNull: true, field: 'received_by' },
    subtotalBeforeVat: { type: DataTypes.DECIMAL(16, 2), allowNull: true, defaultValue: 0, field: 'subtotal_before_vat' },
    totalVat: { type: DataTypes.DECIMAL(16, 2), allowNull: true, defaultValue: 0, field: 'total_vat' },
    totalDeliveredQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0, field: 'total_delivered_quantity' },
    totalDeliveredValue: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'total_delivered_value' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    comment: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CANCELLED', 'OFR', 'CALL_OF_ORDER'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isCancelled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_cancelled' },
    cancelReason: { type: DataTypes.TEXT, allowNull: true, field: 'cancel_reason' },
    isOfr: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_ofr' },
    ofrDetail: { type: DataTypes.TEXT, allowNull: true, field: 'ofr_detail' },
    isCallOfOrder: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_call_of_order' },
    callOfOrderDetail: { type: DataTypes.TEXT, allowNull: true, field: 'call_of_order_detail' },
    matchedInvoiceNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'matched_invoice_number' },
    isFullyInvoiced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_fully_invoiced' },
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
    modelName: 'DeliveryNote',
    tableName: 'delivery_notes',
    underscored: true,
    timestamps: true,
  }
);
