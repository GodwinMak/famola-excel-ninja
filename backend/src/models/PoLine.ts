import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface PoLineAttributes {
  id: string;
  customerName: string;
  destination?: string | null;
  poNumber: string;
  contract?: string | null;
  itemDescription: string;
  poDate?: string | null;
  unitOfMeasure?: string | null;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  valueBeforeVat: number;
  vatRate: number;
  vatAmount: number;
  valueAfterVat: number;
  remarks?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type PoLineCreationAttributes = Optional<PoLineAttributes, 'createdAt' | 'updatedAt'>;

export class PoLine extends Model<PoLineAttributes, PoLineCreationAttributes> implements PoLineAttributes {
  declare id: string;
  declare customerName: string;
  declare destination: string | null;
  declare poNumber: string;
  declare contract: string | null;
  declare itemDescription: string;
  declare poDate: string | null;
  declare unitOfMeasure: string | null;
  declare quantity: number;
  declare unitCost: number;
  declare unitPrice: number;
  declare valueBeforeVat: number;
  declare vatRate: number;
  declare vatAmount: number;
  declare valueAfterVat: number;
  declare remarks: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PoLine.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    customerName: { type: DataTypes.STRING(191), allowNull: false, field: 'customer_name' },
    destination: { type: DataTypes.STRING(191), allowNull: true },
    poNumber: { type: DataTypes.STRING(128), allowNull: false, field: 'po_number' },
    contract: { type: DataTypes.STRING(128), allowNull: true },
    itemDescription: { type: DataTypes.TEXT, allowNull: false, field: 'item_description' },
    poDate: { type: DataTypes.STRING(32), allowNull: true, field: 'po_date' },
    unitOfMeasure: { type: DataTypes.STRING(64), allowNull: true, field: 'unit_of_measure' },
    quantity: { type: DataTypes.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
    unitCost: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'unit_cost' },
    unitPrice: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'unit_price' },
    valueBeforeVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'value_before_vat' },
    vatRate: { type: DataTypes.DECIMAL(6, 4), allowNull: false, defaultValue: 0.18, field: 'vat_rate' },
    vatAmount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'vat_amount' },
    valueAfterVat: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0, field: 'value_after_vat' },
    remarks: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'PoLine',
    tableName: 'po_lines',
    underscored: true,
    timestamps: true,
  }
);
