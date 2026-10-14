import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';
import { UserRole } from './User';

export interface InvitationAttributes {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string | null;
  token: string;
  tokenExpiresAt: Date;
  status: 'Active' | 'Pending' | 'Revoked';
  invitedBy?: string | null;
  lastUsedAt?: Date | null;
  screenPermissions?: Record<string, string> | null;
  createdAt?: Date;
}

type InvitationCreationAttributes = Optional<InvitationAttributes, 'createdAt'>;

export class Invitation extends Model<InvitationAttributes, InvitationCreationAttributes> implements InvitationAttributes {
  declare id: string;
  declare email: string;
  declare name: string;
  declare role: UserRole;
  declare department: string | null;
  declare token: string;
  declare tokenExpiresAt: Date;
  declare status: 'Active' | 'Pending' | 'Revoked';
  declare invitedBy: string | null;
  declare lastUsedAt: Date | null;
  declare screenPermissions: Record<string, string> | null;
  declare readonly createdAt: Date;
}

Invitation.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    email: { type: DataTypes.STRING(191), allowNull: false },
    name: { type: DataTypes.STRING(191), allowNull: false },
    role: {
      type: DataTypes.ENUM('Admin', 'Finance Officer', 'Logistics Manager', 'Billing Clerk', 'Auditor'),
      allowNull: false,
    },
    department: { type: DataTypes.STRING(128), allowNull: true },
    token: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    tokenExpiresAt: { type: DataTypes.DATE, allowNull: false, field: 'token_expires_at' },
    status: {
      type: DataTypes.ENUM('Active', 'Pending', 'Revoked'),
      allowNull: false,
      defaultValue: 'Pending',
    },
    invitedBy: { type: DataTypes.STRING(191), allowNull: true, field: 'invited_by' },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_used_at' },
    screenPermissions: { type: DataTypes.JSON, allowNull: true, field: 'screen_permissions' },
  },
  {
    sequelize,
    modelName: 'Invitation',
    tableName: 'invitations',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);
