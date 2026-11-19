import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export type UserRole = 'Admin' | 'Finance Officer' | 'Logistics Manager' | 'Billing Clerk' | 'Auditor';
export type UserStatus = 'Active' | 'On Hold' | 'Inactive';

export interface UserAttributes {
  id: string;
  username?: string | null;
  name: string;
  email: string;
  role: UserRole;
  department?: string | null;
  status: UserStatus;
  passwordHash?: string | null;
  pinHash?: string | null;
  screenPermissions?: Record<string, string> | null;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type UserCreationAttributes = Optional<UserAttributes, 'createdAt' | 'updatedAt'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare username: string | null;
  declare name: string;
  declare email: string;
  declare role: UserRole;
  declare department: string | null;
  declare status: UserStatus;
  declare passwordHash: string | null;
  declare pinHash: string | null;
  declare screenPermissions: Record<string, string> | null;
  declare lastLoginAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    username: { type: DataTypes.STRING(128), allowNull: true },
    name: { type: DataTypes.STRING(191), allowNull: false },
    email: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    role: {
      type: DataTypes.ENUM('Admin', 'Finance Officer', 'Logistics Manager', 'Billing Clerk', 'Auditor'),
      allowNull: false,
    },
    department: { type: DataTypes.STRING(128), allowNull: true },
    status: {
      type: DataTypes.ENUM('Active', 'On Hold', 'Inactive'),
      allowNull: false,
      defaultValue: 'Active',
    },
    passwordHash: { type: DataTypes.STRING(191), allowNull: true, field: 'password_hash' },
    pinHash: { type: DataTypes.STRING(191), allowNull: true, field: 'pin_hash' },
    screenPermissions: { type: DataTypes.JSON, allowNull: true, field: 'screen_permissions' },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true,
    timestamps: true,
  }
);
