import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export interface IssueCommentAttributes {
  id: string;
  issueId: string;
  authorName: string;
  authorRole?: string | null;
  comment: string;
  type: 'WORK_NOTE' | 'REVIEWER_NOTE' | 'RESOLUTION_NOTE';
  createdAt?: Date;
}

type IssueCommentCreationAttributes = Optional<IssueCommentAttributes, 'id' | 'createdAt'>;

export class IssueComment extends Model<IssueCommentAttributes, IssueCommentCreationAttributes> implements IssueCommentAttributes {
  declare id: string;
  declare issueId: string;
  declare authorName: string;
  declare authorRole: string | null;
  declare comment: string;
  declare type: 'WORK_NOTE' | 'REVIEWER_NOTE' | 'RESOLUTION_NOTE';
  declare readonly createdAt: Date;
}

IssueComment.init(
  {
    id: { type: DataTypes.STRING(64), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    issueId: { type: DataTypes.STRING(64), allowNull: false, field: 'issue_id' },
    authorName: { type: DataTypes.STRING(191), allowNull: false, field: 'author_name' },
    authorRole: { type: DataTypes.STRING(128), allowNull: true, field: 'author_role' },
    comment: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.ENUM('WORK_NOTE', 'REVIEWER_NOTE', 'RESOLUTION_NOTE'), allowNull: false },
  },
  {
    sequelize,
    modelName: 'IssueComment',
    tableName: 'issue_comments',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  }
);
