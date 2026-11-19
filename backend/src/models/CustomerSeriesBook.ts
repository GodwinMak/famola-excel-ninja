import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface CustomerSeriesBookAttributes {
  id: string;
  customerName: string;
  invoicePrefix: string;
  invoiceStartNumber: number;
  invoiceEndNumber: number;
  invoiceCurrentNumber: number;
  deliveryPrefix: string;
  deliveryStartNumber: number;
  deliveryEndNumber: number;
  deliveryCurrentNumber: number;
  padding: number;
  description?: string | null;
  updatedAt?: Date;
}

type CustomerSeriesBookCreationAttributes = Optional<CustomerSeriesBookAttributes, 'updatedAt'>;

export class CustomerSeriesBook
  extends Model<CustomerSeriesBookAttributes, CustomerSeriesBookCreationAttributes>
  implements CustomerSeriesBookAttributes
{
  declare id: string;
  declare customerName: string;
  declare invoicePrefix: string;
  declare invoiceStartNumber: number;
  declare invoiceEndNumber: number;
  declare invoiceCurrentNumber: number;
  declare deliveryPrefix: string;
  declare deliveryStartNumber: number;
  declare deliveryEndNumber: number;
  declare deliveryCurrentNumber: number;
  declare padding: number;
  declare description: string | null;
  declare readonly updatedAt: Date;
}

CustomerSeriesBook.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    customerName: { type: DataTypes.STRING(191), allowNull: false, unique: true, field: 'customer_name' },
    invoicePrefix: { type: DataTypes.STRING(32), allowNull: false, field: 'invoice_prefix' },
    invoiceStartNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'invoice_start_number' },
    invoiceEndNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999999, field: 'invoice_end_number' },
    invoiceCurrentNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'invoice_current_number' },
    deliveryPrefix: { type: DataTypes.STRING(32), allowNull: false, field: 'delivery_prefix' },
    deliveryStartNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'delivery_start_number' },
    deliveryEndNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999999, field: 'delivery_end_number' },
    deliveryCurrentNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'delivery_current_number' },
    padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
    description: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    modelName: 'CustomerSeriesBook',
    tableName: 'customer_series_books',
    underscored: true,
    timestamps: true,
    createdAt: false,
    updatedAt: true,
  }
);
