import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface InvoiceLineAttributes {
  id: string;
  invoiceId: string;
  poLineId?: string | null;
  itemDescription: string;
  unitOfMeasure?: string | null;
  poQuantity: number;
  alreadyInvoicedQuantity: number;
  availableQuantity: number;
  invoicedQuantity: number;
  unitCost: number;
  unitPrice: number;
  valueBeforeVat: number;
  vatRate: number;
  vatAmount: number;
  valueAfterVat: number;
  isSelected: boolean;
  comment?: string | null;
  hasIssue: boolean;
  issueComment?: string | null;
}

type InvoiceLineCreationAttributes = Optional<InvoiceLineAttributes, 'id' | 'isSelected' | 'hasIssue'>;

export class InvoiceLine extends Model<InvoiceLineAttributes, InvoiceLineCreationAttributes> implements InvoiceLineAttributes {
  declare id: string;
  declare invoiceId: string;
  declare poLineId: string | null;
  declare itemDescription: string;
  declare unitOfMeasure: string | null;
  declare poQuantity: number;
  declare alreadyInvoicedQuantity: number;
  declare availableQuantity: number;
  declare invoicedQuantity: number;
  declare unitCost: number;
  declare unitPrice: number;
  declare valueBeforeVat: number;
  declare vatRate: number;
  declare vatAmount: number;
  declare valueAfterVat: number;
  declare isSelected: boolean;
  declare comment: string | null;
  declare hasIssue: boolean;
  declare issueComment: string | null;
}

InvoiceLine.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    invoiceId: { type: DataTypes.STRING(64), allowNull: false, field: 'invoice_id' },
    poLineId: { type: DataTypes.STRING(64), allowNull: true, field: 'po_line_id' },
    itemDescription: { type: DataTypes.TEXT, allowNull: false, field: 'item_description' },
    unitOfMeasure: { type: DataTypes.STRING(64), allowNull: true, field: 'unit_of_measure' },
    poQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0, field: 'po_quantity' },
    alreadyInvoicedQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0, field: 'already_invoiced_quantity' },
    availableQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0, field: 'available_quantity' },
    invoicedQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0, field: 'invoiced_quantity' },
    unitCost: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'unit_cost' },
    unitPrice: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'unit_price' },
    valueBeforeVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'value_before_vat' },
    vatRate: { type: DataTypes.DECIMAL(6, 4), allowNull: false, defaultValue: 0.18, field: 'vat_rate' },
    vatAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'vat_amount' },
    valueAfterVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'value_after_vat' },
    isSelected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_selected' },
    comment: { type: DataTypes.STRING(255), allowNull: true, defaultValue: 'Okay' },
    hasIssue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'has_issue' },
    issueComment: { type: DataTypes.TEXT, allowNull: true, field: 'issue_comment' },
  },
  {
    sequelize,
    modelName: 'InvoiceLine',
    tableName: 'invoice_lines',
    underscored: true,
    timestamps: false,
  }
);
