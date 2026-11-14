import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface SeriesConfigAttributes {
  seriesType: 'invoice' | 'delivery';
  prefix: string;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  padding: number;
  autoIncrement: boolean;
  updatedAt?: Date;
}

type SeriesConfigCreationAttributes = Optional<SeriesConfigAttributes, 'updatedAt'>;

export class SeriesConfig extends Model<SeriesConfigAttributes, SeriesConfigCreationAttributes> implements SeriesConfigAttributes {
  declare seriesType: 'invoice' | 'delivery';
  declare prefix: string;
  declare startNumber: number;
  declare endNumber: number;
  declare currentNumber: number;
  declare padding: number;
  declare autoIncrement: boolean;
  declare readonly updatedAt: Date;
}

SeriesConfig.init(
  {
    seriesType: { type: DataTypes.ENUM('invoice', 'delivery'), primaryKey: true, field: 'series_type' },
    prefix: { type: DataTypes.STRING(32), allowNull: false },
    startNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'start_number' },
    endNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999999, field: 'end_number' },
    currentNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'current_number' },
    padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    autoIncrement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'auto_increment' },
  },
  {
    sequelize,
    modelName: 'SeriesConfig',
    tableName: 'series_config',
    underscored: true,
    timestamps: true,
    createdAt: false,
    updatedAt: true,
  }
);
