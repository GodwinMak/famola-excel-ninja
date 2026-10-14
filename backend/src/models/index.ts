import { sequelize } from '../config/db';
import { User } from './User';
import { Invitation } from './Invitation';
import { PoLine } from './PoLine';
import { Invoice } from './Invoice';
import { InvoiceLine } from './InvoiceLine';
import { DeliveryNote } from './DeliveryNote';
import { DeliveryNoteLine } from './DeliveryNoteLine';
import { Payment } from './Payment';
import { PaymentAllocation } from './PaymentAllocation';
import { DocumentIssue } from './DocumentIssue';
import { IssueLineItem } from './IssueLineItem';
import { IssueComment } from './IssueComment';
import { Attachment } from './Attachment';
import { SeriesConfig } from './SeriesConfig';
import { CustomerSeriesBook } from './CustomerSeriesBook';

Invoice.hasMany(InvoiceLine, { foreignKey: 'invoiceId', as: 'lines', onDelete: 'CASCADE' });
InvoiceLine.belongsTo(Invoice, { foreignKey: 'invoiceId' });

DeliveryNote.hasMany(DeliveryNoteLine, { foreignKey: 'deliveryNoteId', as: 'lines', onDelete: 'CASCADE' });
DeliveryNoteLine.belongsTo(DeliveryNote, { foreignKey: 'deliveryNoteId' });

Payment.hasMany(PaymentAllocation, { foreignKey: 'paymentId', as: 'allocations', onDelete: 'CASCADE' });
PaymentAllocation.belongsTo(Payment, { foreignKey: 'paymentId' });

DocumentIssue.hasMany(IssueLineItem, { foreignKey: 'issueId', as: 'lineIssues', onDelete: 'CASCADE' });
IssueLineItem.belongsTo(DocumentIssue, { foreignKey: 'issueId' });

DocumentIssue.hasMany(IssueComment, { foreignKey: 'issueId', as: 'comments', onDelete: 'CASCADE' });
IssueComment.belongsTo(DocumentIssue, { foreignKey: 'issueId' });

export {
  sequelize,
  User,
  Invitation,
  PoLine,
  Invoice,
  InvoiceLine,
  DeliveryNote,
  DeliveryNoteLine,
  Payment,
  PaymentAllocation,
  DocumentIssue,
  IssueLineItem,
  IssueComment,
  Attachment,
  SeriesConfig,
  CustomerSeriesBook,
};
