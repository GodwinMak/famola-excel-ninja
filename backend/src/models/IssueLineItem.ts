import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface IssueLineItemAttributes {
  id?: number;
  issueId: string;
  lineId?: string | null;
  itemDescription?: string | null;
  unitOfMeasure?: string | null;
  poQuantity?: number | null;
  billedOrDeliveredQuantity?: number | null;
  quantityInvoiced?: number | null;
  quantityDelivered?: number | null;
  discrepancyQuantity?: number | null;
  unitPrice?: number | null;
  valueAfterVat?: number | null;
  totalValue?: number | null;
  issueComment: string;
  issueReason?: string | null;
  workComment?: string | null;
  reviewerComment?: string | null;
  status?: 'PENDING' | 'RESOLVED' | null;
}

type IssueLineItemCreationAttributes = Optional<IssueLineItemAttributes, 'id'>;

export class IssueLineItem
  extends Model<IssueLineItemAttributes, IssueLineItemCreationAttributes>
  implements IssueLineItemAttributes
{
  declare id: number;
  declare issueId: string;
  declare lineId: string | null;
  declare itemDescription: string | null;
  declare unitOfMeasure: string | null;
  declare poQuantity: number | null;
  declare billedOrDeliveredQuantity: number | null;
  declare quantityInvoiced: number | null;
  declare quantityDelivered: number | null;
  declare discrepancyQuantity: number | null;
  declare unitPrice: number | null;
  declare valueAfterVat: number | null;
  declare totalValue: number | null;
  declare issueComment: string;
  declare issueReason: string | null;
  declare workComment: string | null;
  declare reviewerComment: string | null;
  declare status: 'PENDING' | 'RESOLVED' | null;
}

IssueLineItem.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    issueId: { type: DataTypes.STRING(64), allowNull: false, field: 'issue_id' },
    lineId: { type: DataTypes.STRING(64), allowNull: true, field: 'line_id' },
    itemDescription: { type: DataTypes.TEXT, allowNull: true, field: 'item_description' },
    unitOfMeasure: { type: DataTypes.STRING(64), allowNull: true, field: 'unit_of_measure' },
    poQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: true, field: 'po_quantity' },
    billedOrDeliveredQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: true, field: 'billed_or_delivered_quantity' },
    quantityInvoiced: { type: DataTypes.DECIMAL(16, 3), allowNull: true, field: 'quantity_invoiced' },
    quantityDelivered: { type: DataTypes.DECIMAL(16, 3), allowNull: true, field: 'quantity_delivered' },
    discrepancyQuantity: { type: DataTypes.DECIMAL(16, 3), allowNull: true, field: 'discrepancy_quantity' },
    unitPrice: { type: DataTypes.DECIMAL(16, 2), allowNull: true, field: 'unit_price' },
    valueAfterVat: { type: DataTypes.DECIMAL(16, 2), allowNull: true, field: 'value_after_vat' },
    totalValue: { type: DataTypes.DECIMAL(16, 2), allowNull: true, field: 'total_value' },
    issueComment: { type: DataTypes.TEXT, allowNull: false, field: 'issue_comment' },
    issueReason: { type: DataTypes.STRING(255), allowNull: true, field: 'issue_reason' },
    workComment: { type: DataTypes.TEXT, allowNull: true, field: 'work_comment' },
    reviewerComment: { type: DataTypes.TEXT, allowNull: true, field: 'reviewer_comment' },
    status: { type: DataTypes.ENUM('PENDING', 'RESOLVED'), allowNull: true, defaultValue: 'PENDING' },
  },
  {
    sequelize,
    modelName: 'IssueLineItem',
    tableName: 'issue_line_items',
    underscored: true,
    timestamps: false,
  }
);
