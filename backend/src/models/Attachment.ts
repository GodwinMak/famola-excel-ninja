import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface AttachmentAttributes {
  id: string;
  name: string;
  url: string;
  size?: number | null;
  mimeType?: string | null;
  uploadedAt?: Date;
  uploadedBy?: string | null;
  caption?: string | null;
  ownerType?: 'INVOICE' | 'DELIVERY_NOTE' | 'ISSUE_COMMENT' | null;
  ownerId?: string | null;
}

type AttachmentCreationAttributes = Optional<AttachmentAttributes, 'uploadedAt'>;

export class Attachment extends Model<AttachmentAttributes, AttachmentCreationAttributes> implements AttachmentAttributes {
  declare id: string;
  declare name: string;
  declare url: string;
  declare size: number | null;
  declare mimeType: string | null;
  declare readonly uploadedAt: Date;
  declare uploadedBy: string | null;
  declare caption: string | null;
  declare ownerType: 'INVOICE' | 'DELIVERY_NOTE' | 'ISSUE_COMMENT' | null;
  declare ownerId: string | null;
}

Attachment.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    url: { type: DataTypes.STRING(512), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: true },
    mimeType: { type: DataTypes.STRING(128), allowNull: true, field: 'mime_type' },
    uploadedBy: { type: DataTypes.STRING(191), allowNull: true, field: 'uploaded_by' },
    caption: { type: DataTypes.TEXT, allowNull: true },
    ownerType: { type: DataTypes.ENUM('INVOICE', 'DELIVERY_NOTE', 'ISSUE_COMMENT'), allowNull: true, field: 'owner_type' },
    ownerId: { type: DataTypes.STRING(64), allowNull: true, field: 'owner_id' },
  },
  {
    sequelize,
    modelName: 'Attachment',
    tableName: 'attachments',
    underscored: true,
    timestamps: true,
    createdAt: 'uploadedAt',
    updatedAt: false,
  }
);
