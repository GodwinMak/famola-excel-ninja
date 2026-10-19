import React, { useState, useMemo } from 'react';
import { 
  DocumentIssueRecord, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  AppUser,
  LineItemIssue,
  IssueDiscussionComment,
  DocumentAttachment
} from '../types';
import { ImageAttachmentManager } from './ImageAttachmentManager';
import { formatCurrency } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TablePagination } from './TablePagination';
import { 
  exportDetailedCustomerIssuesExcel, 
  exportDetailedCustomerIssuesPdf,
  getCleanIssueTitle,
  getIssueReasonAndComment
} from '../utils/detailedIssuesReportExport';
import { SmsConfirmationModal } from './SmsConfirmationModal';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { isAdminUser } from '../utils/authService';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight, 
  Edit3, 
  MessageSquare, 
  Plus, 
  FileText, 
  Truck, 
  CreditCard, 
  Eye, 
  Check, 
  RotateCcw, 
  Trash2, 
  ArrowUpRight, 
  User, 
  Calendar, 
  Building2, 
  FileSpreadsheet, 
  ShieldCheck,
  Send,
  AlertCircle,
  HelpCircle,
  Image as ImageIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Download
} from 'lucide-react';

interface IssueResolutionHubProps {
  issues: DocumentIssueRecord[];
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  onUpdateIssue: (issue: DocumentIssueRecord) => void;
  onResolveIssue: (issueId: string, resolvedBy: string, resolutionNotes: string) => void;
  onResolveMultipleIssues?: (issueIds: string[], resolvedBy: string, resolutionNotes: string) => void;
  onDeleteIssue?: (issueId: string) => void;
  onReloadInvoice: (invoice: InvoiceRecord) => void;
  onReloadDeliveryNote?: (deliveryNote: DeliveryNoteRecord) => void;
  onOpenFlagModal: (preselected?: { type: 'INVOICE' | 'DELIVERY' | 'PAYMENT'; invoice?: InvoiceRecord; deliveryNote?: DeliveryNoteRecord; payment?: PaymentRecord }) => void;
  currentUser?: AppUser;
  onSaveInvoice?: (invoice: InvoiceRecord) => void;
  onSaveDeliveryNote?: (deliveryNote: DeliveryNoteRecord) => void;
}

export const IssueResolutionHub: React.FC<IssueResolutionHubProps> = ({
  issues = [],
  invoices = [],
  deliveryNotes = [],
  payments = [],
  onUpdateIssue,
  onResolveIssue,
  onResolveMultipleIssues,
  onDeleteIssue,
  onReloadInvoice,
  onReloadDeliveryNote,
  onOpenFlagModal,
  currentUser,
  onSaveInvoice,
  onSaveDeliveryNote,
}) => {
  const [activeEntityType, setActiveEntityType] = useState<'ALL' | 'INVOICE' | 'DELIVERY' | 'PAYMENT'>('ALL');
  
  // Filters
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [selectedPo, setSelectedPo] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED'>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [issuesPage, setIssuesPage] = useState(1);
  const [issuesPageSize, setIssuesPageSize] = useState(25);

  // Table Sorting state - Default to document / series book ascending order (e.g. DDM001, DDM002...)
  type SortField = 'sn' | 'issueId' | 'ref' | 'po' | 'qty' | 'description' | 'customer' | 'status' | 'severity' | 'amount' | 'date';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('ref');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Expanded row IDs (single-line with option to expand invoice line)
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());

  // Active work comment inputs per issue: issueId -> commentText
  const [workComments, setWorkComments] = useState<Record<string, string>>({});
  
  // Line-level work comment edits: `${issueId}-${lineId}` -> commentText
  const [lineWorkComments, setLineWorkComments] = useState<Record<string, string>>({});
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // Quick Resolve Modal State
  const [resolvingIssue, setResolvingIssue] = useState<DocumentIssueRecord | null>(null);
  const [resolutionText, setResolutionText] = useState('');

  // Admin delete line item confirmation state
  const [linePendingDelete, setLinePendingDelete] = useState<{
    issue: DocumentIssueRecord;
    line: LineItemIssue;
    lineIndex: number;
  } | null>(null);

  // Admin delete entire issue confirmation state
  const [issuePendingDelete, setIssuePendingDelete] = useState<DocumentIssueRecord | null>(null);

  // Batch selection and resolution state
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());
  const [isBulkResolveModalOpen, setIsBulkResolveModalOpen] = useState(false);
  const [bulkResolutionText, setBulkResolutionText] = useState('');
  const [isResolveAllPendingModalOpen, setIsResolveAllPendingModalOpen] = useState(false);

  const isSysAdmin = isAdminUser(currentUser) || currentUser?.role === 'Admin' || !currentUser;
  const isAdmin = isSysAdmin || currentUser?.role === 'Auditor';
  const authorName = currentUser?.name || 'Famola Admin';
  const authorRole = currentUser?.role || 'Executive Management';

  const handleConfirmDeleteLine = () => {
    if (!linePendingDelete) return;
    const { issue, line, lineIndex } = linePendingDelete;

    // 1. Remove line from issue
    const updatedLineIssues = (issue.lineIssues || []).filter((l, i) => {
      if (line.lineId && l.lineId) return l.lineId !== line.lineId;
      return i !== lineIndex;
    });

    const updatedIssue: DocumentIssueRecord = {
      ...issue,
      lineIssues: updatedLineIssues,
      totalValue: Math.max(0, (issue.totalValue || 0) - (line.valueAfterVat || 0)),
      disputedAmount: Math.max(0, (issue.disputedAmount || 0) - (line.valueAfterVat || 0)),
      comments: [
        ...issue.comments,
        {
          id: `comm-del-${Date.now()}`,
          authorName,
          authorRole,
          comment: `Permanently deleted line item "${line.itemDescription}" (Qty: ${line.billedOrDeliveredQuantity || 0}) from database after SMS confirmation.`,
          createdAt: new Date().toISOString(),
          type: 'WORK_NOTE',
        }
      ]
    };
    onUpdateIssue(updatedIssue);

    // 2. If it's an invoice, remove from invoice lines and recalculate
    if (issue.entityType === 'INVOICE' && onSaveInvoice) {
      const inv = invoices.find((i) => i.id === issue.entityId || i.invoiceNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase());
      if (inv) {
        let lineRemoved = false;
        const remainingLines = (inv.lines || []).filter((l) => {
          if (line.lineId && (l.poLineId === line.lineId || l.id === line.lineId)) {
            lineRemoved = true;
            return false;
          }
          if (!lineRemoved && l.itemDescription === line.itemDescription && Math.abs(l.invoicedQuantity - (line.billedOrDeliveredQuantity || 0)) < 0.001) {
            lineRemoved = true;
            return false;
          }
          return true;
        });

        let subtotal = 0;
        let vat = 0;
        remainingLines.forEach((l) => {
          const lineVal = l.totalBeforeVat || l.valueBeforeVat || (l.invoicedQuantity * (l.unitPrice || 0));
          const lineVat = l.vatAmount || (lineVal * (l.vatRate ?? 0.18));
          subtotal += lineVal;
          vat += lineVat;
        });

        const updatedInv: InvoiceRecord = {
          ...inv,
          lines: remainingLines,
          subtotalBeforeVat: Math.round(subtotal * 100) / 100,
          totalVat: Math.round(vat * 100) / 100,
          totalAfterVat: Math.round((subtotal + vat) * 100) / 100,
        };
        onSaveInvoice(updatedInv);
      }
    }

    // 3. If it's a delivery note, remove from delivery note lines and recalculate
    if (issue.entityType === 'DELIVERY' && onSaveDeliveryNote) {
      const dn = deliveryNotes.find(
        (d) =>
          d.id === issue.entityId ||
          d.deliveryNoteNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()
      );
      if (dn) {
        let lineRemoved = false;
        const remainingLines = (dn.lines || []).filter((l) => {
          if (line.lineId && (l.poLineId === line.lineId || (l as any).id === line.lineId)) {
            lineRemoved = true;
            return false;
          }
          if (
            !lineRemoved &&
            l.itemDescription === line.itemDescription &&
            Math.abs(l.deliveredQuantity - (line.billedOrDeliveredQuantity || 0)) < 0.001
          ) {
            lineRemoved = true;
            return false;
          }
          return true;
        });

        let totalQty = 0;
        let totalVal = 0;
        remainingLines.forEach((l) => {
          const qty = l.deliveredQuantity || 0;
          const lineVal =
            l.valueAfterVat || (qty * (l.unitPrice || 0) * (1 + (l.vatRate ?? 0.18)));
          totalQty += qty;
          totalVal += lineVal;
        });

        const updatedDn: DeliveryNoteRecord = {
          ...dn,
          lines: remainingLines,
          totalDeliveredQuantity: Math.round(totalQty * 100) / 100,
          totalDeliveredValue: Math.round(totalVal * 100) / 100,
          updatedAt: new Date().toISOString(),
          lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
        };
        onSaveDeliveryNote(updatedDn);
      }
    }

    setLinePendingDelete(null);
  };

  // Toggle single-line row expansion
  const toggleExpand = (issueId: string) => {
    setExpandedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  // Sets of cancelled and OFR invoice and delivery numbers to remove from issue screen
  const cancelledOrOfrInvoiceNumbers = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      if (inv.status === 'CANCELLED' || inv.status === 'OFR' || inv.isCancelled || inv.isOfr) {
        set.add(inv.invoiceNumber.trim().toLowerCase());
      }
    });
    return set;
  }, [invoices]);

  const cancelledOrOfrDeliveryNumbers = useMemo(() => {
    const set = new Set<string>();
    deliveryNotes.forEach((dn) => {
      if (dn.status === 'CANCELLED' || dn.status === 'OFR' || dn.isCancelled || dn.isOfr) {
        set.add(dn.deliveryNoteNumber.trim().toLowerCase());
      }
    });
    return set;
  }, [deliveryNotes]);

  // Filter issues by active entity type, strictly preserving flagged items until marked RESOLVED
  const entityIssues = useMemo(() => {
    return (issues || []).filter((i) => {
      if (activeEntityType !== 'ALL' && i.entityType !== activeEntityType) return false;
      const refLower = (i.referenceNumber || '').trim().toLowerCase();
      if (i.entityType === 'INVOICE' && cancelledOrOfrInvoiceNumbers.has(refLower)) {
        return false;
      }
      if (i.entityType === 'DELIVERY' && cancelledOrOfrDeliveryNumbers.has(refLower)) {
        return false;
      }
      return true;
    });
  }, [issues, activeEntityType, cancelledOrOfrInvoiceNumbers, cancelledOrOfrDeliveryNumbers]);

  // Unique customers for the active entity
  const availableCustomers = useMemo(() => {
    const custs = new Set<string>();
    (entityIssues || []).forEach((i) => {
      if (i.customerName) custs.add(i.customerName);
    });
    return Array.from(custs).sort();
  }, [entityIssues]);

  // Unique POs with issues for the active entity
  const availablePOsWithIssues = useMemo(() => {
    const pos = new Set<string>();
    (entityIssues || []).forEach((i) => {
      if (i.poNumber) pos.add(i.poNumber);
    });
    return Array.from(pos).sort();
  }, [entityIssues]);

  // Filtered issues list - sorted by reference / book number ascending by default (e.g. DDM001, DDM002...)
  const filteredIssues = useMemo(() => {
    const list = (entityIssues || []).filter((item) => {
      // Customer filter
      if (selectedCustomer !== 'ALL' && item.customerName !== selectedCustomer) {
        return false;
      }

      // PO filter
      if (selectedPo !== 'ALL' && item.poNumber !== selectedPo) {
        return false;
      }

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (item.status === 'RESOLVED') return false; // moves out of the issue invoice!
      } else if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      // Severity filter
      if (severityFilter !== 'ALL' && item.severity !== severityFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchRef = item.referenceNumber.toLowerCase().includes(query);
        const matchPo = item.poNumber.toLowerCase().includes(query);
        const matchCust = item.customerName.toLowerCase().includes(query);
        const matchTitle = item.issueTitle.toLowerCase().includes(query);
        const matchComment = item.headerComment.toLowerCase().includes(query);
        const mDN = item.entityType === 'DELIVERY' ? deliveryNotes.find(d => d.id === item.entityId || d.deliveryNoteNumber.trim().toLowerCase() === item.referenceNumber.trim().toLowerCase()) : null;
        const mInv = item.entityType === 'INVOICE' ? invoices.find(i => i.id === item.entityId || i.invoiceNumber.trim().toLowerCase() === item.referenceNumber.trim().toLowerCase()) : null;
        const matchDNComment = mDN ? (mDN.comment?.toLowerCase().includes(query) || mDN.notes?.toLowerCase().includes(query)) : false;
        const matchInvComment = mInv ? (mInv.comment?.toLowerCase().includes(query) || mInv.notes?.toLowerCase().includes(query)) : false;
        const matchLine = item.lineIssues?.some(
          (l) =>
            l.itemDescription.toLowerCase().includes(query) ||
            l.issueComment.toLowerCase().includes(query)
        );
        return matchRef || matchPo || matchCust || matchTitle || matchComment || matchDNComment || matchInvComment || matchLine;
      }

      return true;
    });

    // Default arrange in natural ascending order by series / book number e.g. DDM001, DDM002...
    return list.sort((a, b) => naturalCompare(a.referenceNumber, b.referenceNumber));
  }, [entityIssues, selectedCustomer, selectedPo, statusFilter, severityFilter, searchTerm]);

  // Helper: calculate total discrepancy quantity or line qty for an issue
  const getIssueTotalQty = (issue: DocumentIssueRecord): number => {
    if (issue.lineIssues && issue.lineIssues.length > 0) {
      return issue.lineIssues.reduce((sum, l) => {
        const disc = Math.abs(l.discrepancyQuantity || 0);
        if (disc > 0) return sum + disc;
        return sum + Number(l.billedOrDeliveredQuantity || l.quantityInvoiced || l.quantityDelivered || 0);
      }, 0);
    }
    return 0;
  };

  // Helper: format unique issue tracking number e.g. ISS-001024
  const getIssueTrackingNumber = (issue: DocumentIssueRecord): string => {
    if (issue.id.toUpperCase().startsWith('ISS-')) {
      return issue.id.toUpperCase();
    }
    const clean = issue.id.replace(/[^a-zA-Z0-9]/g, '');
    return `ISS-${clean.slice(-6).toUpperCase()}`;
  };

  // Memoized sorted issues
  const sortedIssues = useMemo(() => {
    const list = [...filteredIssues];

    return list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'sn': {
          comparison = naturalCompare(a.referenceNumber, b.referenceNumber);
          break;
        }
        case 'ref': {
          comparison = naturalCompare(a.referenceNumber, b.referenceNumber);
          break;
        }
        case 'issueId': {
          const idA = getIssueTrackingNumber(a);
          const idB = getIssueTrackingNumber(b);
          comparison = naturalCompare(idA, idB);
          break;
        }
        case 'po': {
          comparison = naturalCompare(a.poNumber, b.poNumber);
          break;
        }
        case 'qty': {
          const qtyA = getIssueTotalQty(a);
          const qtyB = getIssueTotalQty(b);
          comparison = qtyA - qtyB;
          break;
        }
        case 'description': {
          const mDN_A = a.entityType === 'DELIVERY' ? deliveryNotes.find(d => d.id === a.entityId || d.deliveryNoteNumber.trim().toLowerCase() === a.referenceNumber.trim().toLowerCase()) : null;
          const mDN_B = b.entityType === 'DELIVERY' ? deliveryNotes.find(d => d.id === b.entityId || d.deliveryNoteNumber.trim().toLowerCase() === b.referenceNumber.trim().toLowerCase()) : null;
          const mInv_A = a.entityType === 'INVOICE' ? invoices.find(i => i.id === a.entityId || i.invoiceNumber.trim().toLowerCase() === a.referenceNumber.trim().toLowerCase()) : null;
          const mInv_B = b.entityType === 'INVOICE' ? invoices.find(i => i.id === b.entityId || i.invoiceNumber.trim().toLowerCase() === b.referenceNumber.trim().toLowerCase()) : null;

          const infoA = getIssueReasonAndComment(a, mDN_A, mInv_A);
          const infoB = getIssueReasonAndComment(b, mDN_B, mInv_B);

          const descA = `${infoA.flaggedReason} ${infoA.comment}`;
          const descB = `${infoB.flaggedReason} ${infoB.comment}`;
          comparison = descA.localeCompare(descB);
          break;
        }
        case 'customer': {
          comparison = naturalCompare(a.customerName, b.customerName);
          break;
        }
        case 'status': {
          const order: Record<string, number> = { PENDING: 1, UNDER_REVIEW: 2, RESOLVED: 3 };
          comparison = (order[a.status] || 0) - (order[b.status] || 0);
          break;
        }
        case 'severity': {
          const order: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          comparison = (order[a.severity] || 0) - (order[b.severity] || 0);
          break;
        }
        case 'amount': {
          const amtA = a.disputedAmount || a.totalValue || 0;
          const amtB = b.disputedAmount || b.totalValue || 0;
          comparison = amtA - amtB;
          break;
        }
        case 'date': {
          const dateA = new Date(a.flaggedAt || 0).getTime();
          const dateB = new Date(b.flaggedAt || 0).getTime();
          comparison = dateA - dateB;
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredIssues, sortField, sortDirection]);

  // Paginated slice for the issues table — rendering every issue at once will
  // freeze the page once issue volume grows into the thousands.
  const paginatedIssues = useMemo(() => {
    const start = (issuesPage - 1) * issuesPageSize;
    return sortedIssues.slice(start, start + issuesPageSize);
  }, [sortedIssues, issuesPage, issuesPageSize]);

  // Metrics calculations for the active entity
  const metrics = useMemo(() => {
    const safeIssues = entityIssues || [];
    const totalRaised = safeIssues.length;
    const pending = safeIssues.filter((i) => i.status === 'PENDING').length;
    const underReview = safeIssues.filter((i) => i.status === 'UNDER_REVIEW').length;
    const resolved = safeIssues.filter((i) => i.status === 'RESOLVED').length;
    const disputedValue = safeIssues
      .filter((i) => i.status !== 'RESOLVED')
      .reduce((acc, i) => acc + (i.totalValue || 0), 0);

    return { totalRaised, pending, underReview, resolved, disputedValue };
  }, [entityIssues]);

  // Global counts for the top tabs
  const tabCounts = useMemo(() => {
    const safeList = issues || [];
    return {
      allActive: safeList.filter((i) => i.status !== 'RESOLVED').length,
      invoiceActive: safeList.filter((i) => i.entityType === 'INVOICE' && i.status !== 'RESOLVED').length,
      deliveryActive: safeList.filter((i) => i.entityType === 'DELIVERY' && i.status !== 'RESOLVED').length,
      paymentActive: safeList.filter((i) => i.entityType === 'PAYMENT' && i.status !== 'RESOLVED').length,
    };
  }, [issues]);

  const pendingFilteredIssues = useMemo(() => {
    return sortedIssues.filter((i) => i.status !== 'RESOLVED');
  }, [sortedIssues]);

  // Worker adds a work comment or submits for review
  const handleAddWorkComment = (issue: DocumentIssueRecord, submitForReview = false) => {
    const text = (workComments[issue.id] || '').trim();
    if (!text) {
      alert('Please enter your comment or review note.');
      return;
    }

    const newComment: IssueDiscussionComment = {
      id: `comm-${Date.now()}`,
      authorName,
      authorRole,
      comment: text,
      createdAt: new Date().toISOString(),
      type: submitForReview ? 'REVIEWER_NOTE' : 'WORK_NOTE',
    };

    const nextStatus = submitForReview ? 'UNDER_REVIEW' : issue.status;

    const updatedIssue: DocumentIssueRecord = {
      ...issue,
      status: nextStatus,
      comments: [...issue.comments, newComment],
    };

    onUpdateIssue(updatedIssue);
    setWorkComments((prev) => ({ ...prev, [issue.id]: '' }));
  };

  // Save line-level work comment
  const handleSaveLineWorkComment = (issue: DocumentIssueRecord, lineId: string, fallbackLines?: LineItemIssue[]) => {
    const key = `${issue.id}-${lineId}`;
    const comment = (lineWorkComments[key] || '').trim();

    const baseLines = (issue.lineIssues && issue.lineIssues.length > 0)
      ? issue.lineIssues
      : (fallbackLines || []);

    const updatedLines = baseLines.map((line) => {
      if (line.lineId === lineId) {
        return {
          ...line,
          workComment: comment,
        };
      }
      return line;
    });

    const newComment: IssueDiscussionComment = {
      id: `comm-line-${Date.now()}`,
      authorName,
      authorRole,
      comment: `Updated line note on [${lineId}]: "${comment}"`,
      createdAt: new Date().toISOString(),
      type: 'WORK_NOTE',
    };

    const updatedIssue: DocumentIssueRecord = {
      ...issue,
      lineIssues: updatedLines,
      comments: [...issue.comments, newComment],
    };

    onUpdateIssue(updatedIssue);
    setEditingLineId(null);
  };

  // Trigger reload of invoice to correct it
  const handleLoadAndCorrect = (issue: DocumentIssueRecord) => {
    if (issue.entityType !== 'INVOICE') return;
    const inv = invoices.find(
      (i) =>
        i.id === issue.entityId ||
        i.invoiceNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()
    );
    if (!inv) {
      alert(`Could not find invoice ${issue.referenceNumber} in database.`);
      return;
    }
    // Reload into invoice creator
    onReloadInvoice(inv);
  };

  // Trigger reload of delivery note to correct it
  const handleLoadAndCorrectDelivery = (issue: DocumentIssueRecord) => {
    if (issue.entityType !== 'DELIVERY') return;
    const dn = deliveryNotes.find(
      (d) =>
        d.id === issue.entityId ||
        d.deliveryNoteNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()
    );
    if (!dn) {
      alert(`Could not find delivery note ${issue.referenceNumber} in database.`);
      return;
    }
    if (onReloadDeliveryNote) {
      onReloadDeliveryNote(dn);
    }
  };

  // Execute issue resolution (Admin only)
  const handleConfirmResolve = () => {
    if (!isSysAdmin) {
      alert('Access Denied: Only Administrators are authorized to mark issues as resolved.');
      return;
    }
    if (!resolvingIssue) return;
    const note = resolutionText.trim() || 'Issue verified, invoice/document corrected, and resolved.';
    onResolveIssue(resolvingIssue.id, `${authorName} (${authorRole})`, note);
    setResolvingIssue(null);
    setResolutionText('');
  };

  // Quick 1-click resolve
  const handleQuickResolve = (issue: DocumentIssueRecord) => {
    if (!isSysAdmin) {
      alert('Access Denied: Only Administrators are authorized to mark issues as resolved.');
      return;
    }
    const note = 'Discrepancy verified, document reconciled, and resolved.';
    onResolveIssue(issue.id, `${authorName} (${authorRole})`, note);
  };

  // Batch resolve multiple selected issues
  const handleBatchResolve = (issueIds: string[], customNote?: string) => {
    if (!isSysAdmin) {
      alert('Access Denied: Only Administrators are authorized to mark issues as resolved.');
      return;
    }
    if (!issueIds || issueIds.length === 0) return;
    const note = (customNote && customNote.trim()) || 'Batch audited, verified, and resolved by Administrator.';
    if (onResolveMultipleIssues) {
      onResolveMultipleIssues(issueIds, `${authorName} (${authorRole})`, note);
    } else {
      issueIds.forEach((id) => onResolveIssue(id, `${authorName} (${authorRole})`, note));
    }
    setSelectedIssueIds(new Set());
    setIsBulkResolveModalOpen(false);
    setIsResolveAllPendingModalOpen(false);
  };

  // Toggle single issue selection
  const toggleSelectIssue = (id: string) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle all pending in current filtered view
  const toggleSelectAllFiltered = (pendingIds: string[]) => {
    if (selectedIssueIds.size === pendingIds.length && pendingIds.length > 0) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(pendingIds));
    }
  };

  // Re-open an issue (Admin only)
  const handleReopenIssue = (issue: DocumentIssueRecord) => {
    if (!isSysAdmin) {
      alert('Access Denied: Only Administrators are authorized to re-open resolved issues.');
      return;
    }
    const updated: DocumentIssueRecord = {
      ...issue,
      status: 'PENDING',
      resolvedBy: undefined,
      resolvedAt: undefined,
      resolutionNotes: undefined,
      comments: [
        ...issue.comments,
        {
          id: `comm-reopen-${Date.now()}`,
          authorName,
          authorRole,
          comment: 'Issue re-opened for further investigation.',
          createdAt: new Date().toISOString(),
          type: 'WORK_NOTE',
        }
      ]
    };
    onUpdateIssue(updated);
  };

  const handleExportIssuesExcel = () => {
    const headers = [
      '#',
      'Entity Type',
      'Ref #',
      'PO Number',
      'Customer',
      'Status',
      'Severity',
      'Category',
      'Disputed Value (TZS)',
      'Flagged By',
      'Flagged Date',
      'Primary Issue',
    ];
    const rows = filteredIssues.map((issue, idx) => {
      const mDN = issue.entityType === 'DELIVERY' ? deliveryNotes.find(d => d.id === issue.entityId || d.deliveryNoteNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()) : null;
      const mInv = issue.entityType === 'INVOICE' ? invoices.find(i => i.id === issue.entityId || i.invoiceNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()) : null;
      const { flaggedReason, comment } = getIssueReasonAndComment(issue, mDN, mInv);
      const desc = comment ? `${flaggedReason} - ${comment}` : flaggedReason;
      return [
        idx + 1,
        issue.entityType,
        issue.referenceNumber,
        issue.poNumber || 'N/A',
        issue.customerName || 'N/A',
        issue.status,
        issue.severity,
        issue.issueCategory,
        formatCurrency(issue.disputedAmount || 0),
        issue.flaggedBy,
        new Date(issue.flaggedAt).toLocaleDateString(),
        desc,
      ];
    });
    exportTableToExcel(
      `${activeEntityType}_Issues_Registry`,
      headers,
      rows,
      `${activeEntityType.toLowerCase()}_issues`
    );
  };

  const handleExportIssuesPdf = () => {
    const headers = [
      '#',
      'Type',
      'Ref #',
      'PO #',
      'Customer',
      'Status',
      'Severity',
      'Disputed (TZS)',
      'Issue',
    ];
    const rows = filteredIssues.map((issue, idx) => {
      const mDN = issue.entityType === 'DELIVERY' ? deliveryNotes.find(d => d.id === issue.entityId || d.deliveryNoteNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()) : null;
      const mInv = issue.entityType === 'INVOICE' ? invoices.find(i => i.id === issue.entityId || i.invoiceNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase()) : null;
      const { flaggedReason, comment } = getIssueReasonAndComment(issue, mDN, mInv);
      const desc = comment ? `${flaggedReason} - ${comment}` : flaggedReason;
      return [
        idx + 1,
        issue.entityType,
        issue.referenceNumber,
        issue.poNumber || 'N/A',
        issue.customerName || 'N/A',
        issue.status,
        issue.severity,
        formatCurrency(issue.disputedAmount || 0),
        desc,
      ];
    });
    exportTableToPdf(
      `${activeEntityType} Issues & Discrepancies Report`,
      headers,
      rows,
      {
        filenamePrefix: `${activeEntityType.toLowerCase()}_issues`,
        orientation: 'landscape',
        subtitle: `Total issues in view: ${filteredIssues.length}`,
        currencyNote: 'Currency: TZS',
      }
    );
  };

  // Detailed Customer-Grouped Report with Invoices & Lines + Progress Graph/Charts (Excel)
  const handleExportDetailedReportExcel = () => {
    exportDetailedCustomerIssuesExcel({
      issues: sortedIssues.length > 0 ? sortedIssues : entityIssues,
      invoices,
      deliveryNotes,
      payments,
      activeEntityType,
      activeFilters: {
        customer: selectedCustomer !== 'ALL' ? selectedCustomer : undefined,
        po: selectedPo !== 'ALL' ? selectedPo : undefined,
        status: statusFilter !== 'ACTIVE' && statusFilter !== 'ALL' ? statusFilter : undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        searchTerm: searchTerm.trim() || undefined,
      },
    });
  };

  // Detailed Customer-Grouped Report with Invoices & Lines + Progress Graph/Charts (PDF)
  const handleExportDetailedReportPdf = () => {
    exportDetailedCustomerIssuesPdf({
      issues: sortedIssues.length > 0 ? sortedIssues : entityIssues,
      invoices,
      deliveryNotes,
      payments,
      activeEntityType,
      activeFilters: {
        customer: selectedCustomer !== 'ALL' ? selectedCustomer : undefined,
        po: selectedPo !== 'ALL' ? selectedPo : undefined,
        status: statusFilter !== 'ACTIVE' && statusFilter !== 'ALL' ? statusFilter : undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        searchTerm: searchTerm.trim() || undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Screen Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 rounded-2xl p-6 text-white shadow-xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 text-amber-400 font-bold text-xs uppercase tracking-wider mb-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Operational Quality & Discrepancy Control</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Issue Tracking & Resolution Hub
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            All marked invoices, delivery notes, and payments with discrepancies are pooled here. 
            Investigate line-by-line comments, submit findings for review, reload invoices to correct quantities or prices, 
            and resolve issues to automatically clear them from the pending list.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onOpenFlagModal({ type: activeEntityType })}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Flag / Report Issue
          </button>
        </div>
      </div>

      {/* Entity Switcher Pills (All, Invoice, Delivery, Payment) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => {
            setActiveEntityType('ALL');
            setSelectedCustomer('ALL');
            setSelectedPo('ALL');
            setIssuesPage(1);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeEntityType === 'ALL'
              ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>All Flagged Issues</span>
          {tabCounts.allActive > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeEntityType === 'ALL' ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'
            }`}>
              {tabCounts.allActive}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveEntityType('INVOICE');
            setSelectedCustomer('ALL');
            setSelectedPo('ALL');
            setIssuesPage(1);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeEntityType === 'INVOICE'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoices with Issues</span>
          {tabCounts.invoiceActive > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeEntityType === 'INVOICE' ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {tabCounts.invoiceActive}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveEntityType('DELIVERY');
            setSelectedCustomer('ALL');
            setSelectedPo('ALL');
            setIssuesPage(1);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeEntityType === 'DELIVERY'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Delivery Notes with Issues</span>
          {tabCounts.deliveryActive > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeEntityType === 'DELIVERY' ? 'bg-white text-indigo-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {tabCounts.deliveryActive}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveEntityType('PAYMENT');
            setSelectedCustomer('ALL');
            setSelectedPo('ALL');
            setIssuesPage(1);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeEntityType === 'PAYMENT'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payments with Issues</span>
          {tabCounts.paymentActive > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeEntityType === 'PAYMENT' ? 'bg-white text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {tabCounts.paymentActive}
            </span>
          )}
        </button>
      </div>

      {/* Metrics Cards (Cards to issue, raised, resolved, pending) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        
        {/* Total Issues Raised */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Raised</span>
            <AlertCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{metrics.totalRaised}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            All-time {activeEntityType.toLowerCase()} issues
          </div>
        </div>

        {/* Pending Action */}
        <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900">{metrics.pending}</div>
          <div className="text-[11px] text-amber-700 mt-1">
            Requires initial work comment
          </div>
        </div>

        {/* Under Review */}
        <div className="bg-blue-50/70 rounded-xl border border-blue-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-blue-800 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Under Review</span>
            <Eye className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-900">{metrics.underReview}</div>
          <div className="text-[11px] text-blue-700 mt-1">
            Comments ready for reviewer
          </div>
        </div>

        {/* Resolved */}
        <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{metrics.resolved}</div>
          <div className="text-[11px] text-emerald-700 mt-1">
            Corrected & cleared
          </div>
        </div>

        {/* Disputed / Impacted Value */}
        <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-slate-900 text-white rounded-xl p-4 shadow-xs border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Disputed Value</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-400 font-mono">
            TZS {formatCurrency(metrics.disputedValue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Pending resolution
          </div>
        </div>
      </div>

      {/* Filter and Search Bar (Customer select, PO filter, search) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIssuesPage(1);
              }}
              placeholder={activeEntityType === 'ALL' ? 'Search all issues by Ref #, PO #, comment...' : `Search ${activeEntityType.toLowerCase()} #, PO #, comment...`}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Customer Filter Dropdown */}
          <div>
            <select
              value={selectedCustomer}
              onChange={(e) => {
                setSelectedCustomer(e.target.value);
                setIssuesPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Customers</option>
              {availableCustomers.map((cust) => (
                <option key={cust} value={cust}>
                  {cust}
                </option>
              ))}
            </select>
          </div>

          {/* PO Filter Dropdown */}
          <div>
            <select
              value={selectedPo}
              onChange={(e) => {
                setSelectedPo(e.target.value);
                setIssuesPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All POs with Issues</option>
              {availablePOsWithIssues.map((po) => (
                <option key={po} value={po}>
                  {po}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setIssuesPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ACTIVE">Active Issues Only (Pending + Review)</option>
              <option value="ALL">All Statuses (Including Resolved)</option>
              <option value="PENDING">Pending Only</option>
              <option value="UNDER_REVIEW">Under Review Only</option>
              <option value="RESOLVED">Resolved Only</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setIssuesPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>
          </div>
        </div>

        {/* Quick status indicator, reset filter & export toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div>
              Showing <span className="font-bold text-slate-800">{filteredIssues.length}</span> {activeEntityType === 'ALL' ? 'total' : activeEntityType.toLowerCase()} issues
              {statusFilter === 'ACTIVE' && ' (Resolved items are automatically hidden)'}
            </div>
            {(selectedCustomer !== 'ALL' || selectedPo !== 'ALL' || statusFilter !== 'ACTIVE' || severityFilter !== 'ALL' || searchTerm) && (
              <button
                onClick={() => {
                  setSelectedCustomer('ALL');
                  setSelectedPo('ALL');
                  setStatusFilter('ACTIVE');
                  setSeverityFilter('ALL');
                  setSearchTerm('');
                }}
                className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedIssueIds.size > 0 && isSysAdmin && (
              <button
                type="button"
                onClick={() => setIsBulkResolveModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Resolve all selected issues"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Resolve Selected ({selectedIssueIds.size})</span>
              </button>
            )}
            {pendingFilteredIssues.length > 0 && isSysAdmin && (
              <button
                type="button"
                onClick={() => setIsResolveAllPendingModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Resolve all pending issues in current view"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Resolve All Pending ({pendingFilteredIssues.length})</span>
              </button>
            )}
            <button
              onClick={handleExportDetailedReportExcel}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export Customer-Grouped Excel Report with Invoices, Lines & Issue Resolution Progress Summary"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Customer Grouped Report (Excel)</span>
            </button>
            <button
              onClick={handleExportDetailedReportPdf}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export Detailed PDF Report with Invoices, Invoice Lines & Progress Graph/Charts (Raised, Work on it, Resolved)"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Progress Chart & Lines (PDF)</span>
            </button>
            <TableExportToolbar
              totalCount={sortedIssues.length}
              onExportExcel={handleExportIssuesExcel}
              onExportPdf={handleExportIssuesPdf}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Main Issue Table with Headers, Sorting & Expandable Drilling Option */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {sortedIssues.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-70" />
            <div className="text-sm font-bold text-slate-700">
              No issues found matching current filters!
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All {activeEntityType.toLowerCase()} records in this view are either reconciled or free of active discrepancies.
              {statusFilter === 'ACTIVE' && ' To view resolved issues, change the status filter above to "Resolved Only" or "All Statuses".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-semibold select-none">
                <tr>
                  {/* Select All Checkbox */}
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        pendingFilteredIssues.length > 0 &&
                        pendingFilteredIssues.every((i) => selectedIssueIds.has(i.id))
                      }
                      onChange={() => toggleSelectAllFiltered(pendingFilteredIssues.map((i) => i.id))}
                      disabled={pendingFilteredIssues.length === 0}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                      title="Select all pending issues in view"
                    />
                  </th>

                  {/* 1. S/N */}
                  <th 
                    onClick={() => handleSort('sn')}
                    className="py-3 px-3 w-12 text-center cursor-pointer hover:bg-slate-800 transition-colors"
                    title="Click to sort by serial number"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>#</span>
                      {sortField === 'sn' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 2. Issue Unique Number */}
                  <th 
                    onClick={() => handleSort('issueId')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by unique issue tracking ID"
                  >
                    <div className="flex items-center gap-1">
                      <span>Issue Unique #</span>
                      {sortField === 'issueId' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 3. Invoice No. / Delivery */}
                  <th 
                    onClick={() => handleSort('ref')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by Invoice No. / Delivery Note"
                  >
                    <div className="flex items-center gap-1">
                      <span>Invoice No. / Delivery</span>
                      {sortField === 'ref' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 4. PO Number */}
                  <th 
                    onClick={() => handleSort('po')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by Purchase Order number"
                  >
                    <div className="flex items-center gap-1">
                      <span>PO Number</span>
                      {sortField === 'po' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 5. Qty */}
                  <th 
                    onClick={() => handleSort('qty')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by discrepancy quantity"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Qty</span>
                      {sortField === 'qty' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 6. Description */}
                  <th 
                    onClick={() => handleSort('description')}
                    className="py-3 px-3 min-w-[200px] cursor-pointer hover:bg-slate-800 transition-colors"
                    title="Click to sort by issue description"
                  >
                    <div className="flex items-center gap-1">
                      <span>Description</span>
                      {sortField === 'description' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 7. Customer */}
                  <th 
                    onClick={() => handleSort('customer')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by Customer name"
                  >
                    <div className="flex items-center gap-1">
                      <span>Customer</span>
                      {sortField === 'customer' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 8. Status */}
                  <th 
                    onClick={() => handleSort('status')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by status"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {sortField === 'status' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 9. Severity */}
                  <th 
                    onClick={() => handleSort('severity')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by severity"
                  >
                    <div className="flex items-center gap-1">
                      <span>Severity</span>
                      {sortField === 'severity' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 10. Disputed Value */}
                  <th 
                    onClick={() => handleSort('amount')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                    title="Click to sort by disputed financial value"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Disputed (TZS)</span>
                      {sortField === 'amount' ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400 inline" /> : <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 inline" />
                      )}
                    </div>
                  </th>

                  {/* 11. Actions & Drilling */}
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <span>Actions & Drill</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedIssues.map((issue, idx) => {
                  const isExpanded = expandedIssueIds.has(issue.id);
                  const isResolved = issue.status === 'RESOLVED';
                  const isUnderReview = issue.status === 'UNDER_REVIEW';

                  // Find associated invoice or delivery note if applicable
                  const matchedInvoice = issue.entityType === 'INVOICE'
                    ? invoices.find((i) => i.id === issue.entityId || i.invoiceNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase())
                    : null;

                  const matchedDN = issue.entityType === 'DELIVERY'
                    ? deliveryNotes.find((d) => d.id === issue.entityId || d.deliveryNoteNumber.trim().toLowerCase() === issue.referenceNumber.trim().toLowerCase())
                    : null;

                  const effectiveLineIssues: LineItemIssue[] = (issue.lineIssues && issue.lineIssues.length > 0)
                    ? issue.lineIssues.map((line, lIdx) => {
                        let desc = line.itemDescription;
                        if (!desc || desc.toLowerCase().includes('call of order')) {
                          if (issue.entityType === 'DELIVERY' && matchedDN?.lines && matchedDN.lines[lIdx]?.itemDescription) {
                            desc = matchedDN.lines[lIdx].itemDescription;
                          } else if (issue.entityType === 'INVOICE' && matchedInvoice?.lines && matchedInvoice.lines[lIdx]?.itemDescription) {
                            desc = matchedInvoice.lines[lIdx].itemDescription;
                          } else {
                            desc = 'Line Item';
                          }
                        }
                        let comm = line.issueComment;
                        if (comm && (comm.toLowerCase().includes('call of order') || comm.startsWith('Issue on '))) {
                          if (issue.entityType === 'DELIVERY' && matchedDN?.lines && matchedDN.lines[lIdx]?.comment && !matchedDN.lines[lIdx].comment.toLowerCase().includes('call of order') && matchedDN.lines[lIdx].comment.toLowerCase() !== 'okay') {
                            comm = matchedDN.lines[lIdx].comment;
                          } else if (matchedDN?.comment && matchedDN.comment.toLowerCase() !== 'okay' && !matchedDN.comment.toLowerCase().includes('call of order')) {
                            comm = matchedDN.comment;
                          } else {
                            comm = 'Discrepancy reported';
                          }
                        }
                        return {
                          ...line,
                          itemDescription: desc,
                          issueComment: comm,
                        };
                      })
                    : (issue.entityType === 'DELIVERY' && matchedDN && matchedDN.lines && matchedDN.lines.length > 0)
                      ? matchedDN.lines.map((l, idx) => ({
                          lineId: l.poLineId || (l as any).id || `dn-line-${idx}`,
                          itemDescription: l.itemDescription && !l.itemDescription.toLowerCase().includes('call of order') ? l.itemDescription : (matchedDN.notes || 'Delivered Item'),
                          unitOfMeasure: l.unitOfMeasure || 'UNIT',
                          poQuantity: l.poQuantity || 0,
                          billedOrDeliveredQuantity: l.deliveredQuantity,
                          unitPrice: l.unitPrice,
                          totalValue: l.valueAfterVat || (l.deliveredQuantity * (l.unitPrice || 0) * (1 + (l.vatRate ?? 0.18))),
                          valueAfterVat: l.valueAfterVat || (l.deliveredQuantity * (l.unitPrice || 0) * (1 + (l.vatRate ?? 0.18))),
                          discrepancyType: (issue.issueType as any) || 'Delivery Line Discrepancy',
                          issueComment: (l.issueComment && !l.issueComment.toLowerCase().includes('call of order')) ? l.issueComment : (l.comment && !l.comment.toLowerCase().includes('call of order') && l.comment.toLowerCase() !== 'okay' ? l.comment : (matchedDN.comment && matchedDN.comment.toLowerCase() !== 'okay' && !matchedDN.comment.toLowerCase().includes('call of order') ? matchedDN.comment : 'Discrepancy reported')),
                        }))
                      : (issue.entityType === 'INVOICE' && matchedInvoice && matchedInvoice.lines && matchedInvoice.lines.length > 0)
                        ? matchedInvoice.lines.map((l, idx) => ({
                            lineId: l.poLineId || (l as any).id || `inv-line-${idx}`,
                            itemDescription: l.itemDescription,
                            unitOfMeasure: l.unitOfMeasure || 'UNIT',
                            poQuantity: l.poQuantity || 0,
                            billedOrDeliveredQuantity: l.invoicedQuantity,
                            unitPrice: l.unitPrice,
                            totalValue: l.valueAfterVat || l.totalAfterVat || (l.invoicedQuantity * (l.unitPrice || 0) * (1 + (l.vatRate ?? 0.18))),
                            valueAfterVat: l.valueAfterVat || l.totalAfterVat || (l.invoicedQuantity * (l.unitPrice || 0) * (1 + (l.vatRate ?? 0.18))),
                            discrepancyType: (issue.issueType as any) || 'Invoice Line Discrepancy',
                            issueComment: l.issueComment || l.comment || (l.hasIssue ? 'Discrepancy reported' : 'Okay'),
                          }))
                        : [];

                  const docAttachments = (matchedInvoice?.attachments || matchedDN?.attachments || []);
                  const issueAttachments = (issue.attachments || []);
                  const totalAttachments = docAttachments.length + issueAttachments.length;
                  const totalQty = getIssueTotalQty(issue);
                  const { flaggedReason, comment } = getIssueReasonAndComment(issue, matchedDN, matchedInvoice);

                  return (
                    <React.Fragment key={issue.id}>
                      {/* Single Line Table Row */}
                      <tr
                        className={`transition-colors text-xs ${
                          isExpanded
                            ? 'bg-blue-50/50'
                            : isResolved
                            ? 'bg-slate-50/60 opacity-85 hover:bg-slate-100/70'
                            : isUnderReview
                            ? 'bg-blue-50/20 hover:bg-blue-50/50'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        {/* Checkbox Selection */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIssueIds.has(issue.id)}
                            onChange={() => toggleSelectIssue(issue.id)}
                            disabled={isResolved}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
                            title={isResolved ? 'Issue is already resolved' : 'Select to resolve'}
                          />
                        </td>

                        {/* 1. S/N */}
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                          {(issuesPage - 1) * issuesPageSize + idx + 1}
                        </td>

                        {/* 2. Issue Unique # */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 inline-block shadow-2xs">
                            {getIssueTrackingNumber(issue)}
                          </span>
                        </td>

                        {/* 3. Invoice No. / Delivery */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-900">
                              {issue.referenceNumber}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              issue.entityType === 'INVOICE'
                                ? 'bg-blue-100 text-blue-800'
                                : issue.entityType === 'DELIVERY'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {issue.entityType === 'INVOICE' ? 'INV' : issue.entityType === 'DELIVERY' ? 'DN' : 'PAY'}
                            </span>
                            {totalAttachments > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(issue.id)}
                                className="p-0.5 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                title={`${totalAttachments} photo(s) attached — click to view photographic proof`}
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 4. PO Number */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px]">
                            {issue.poNumber || 'N/A'}
                          </span>
                        </td>

                        {/* 5. Qty */}
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {totalQty > 0 ? totalQty.toLocaleString() : '—'}
                        </td>

                        {/* 6. Description */}
                        <td className="py-3 px-3 min-w-[200px] max-w-xs">
                          <div className="flex flex-col gap-0.5">
                            <div 
                              className="font-semibold text-slate-900 truncate"
                              title={flaggedReason}
                            >
                              {flaggedReason}
                            </div>
                            {comment ? (
                              <div 
                                className="text-[11px] text-slate-600 font-medium truncate" 
                                title={comment}
                              >
                                {comment}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* 7. Customer */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-slate-800 truncate max-w-[150px] block" title={issue.customerName}>
                            {issue.customerName || 'N/A'}
                          </span>
                        </td>

                        {/* 8. Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {issue.status === 'RESOLVED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Resolved
                            </span>
                          ) : issue.status === 'UNDER_REVIEW' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 inline-flex items-center gap-1">
                              <Eye className="w-3 h-3 text-blue-600" /> Work On It
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" /> Raised
                            </span>
                          )}
                        </td>

                        {/* 9. Severity */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            issue.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-800'
                              : issue.severity === 'HIGH'
                              ? 'bg-orange-100 text-orange-800'
                              : issue.severity === 'MEDIUM'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {issue.severity}
                          </span>
                        </td>

                        {/* 10. Disputed Value */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          TZS {formatCurrency(issue.disputedAmount || issue.totalValue || 0)}
                        </td>

                        {/* 11. Actions & Drilling */}
                        <td className="py-3 px-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Drilling expand / collapse toggle */}
                            <button
                              onClick={() => toggleExpand(issue.id)}
                              className={`px-2.5 py-1 font-semibold rounded-lg text-xs inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                              title={isExpanded ? 'Collapse line details' : 'Drill into invoice lines, comments & photos'}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                  <span>Collapse</span>
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                  <span>Drill</span>
                                </>
                              )}
                              {issue.comments?.length > 0 && (
                                <span className={`w-3.5 h-3.5 rounded-full text-[9px] font-extrabold flex items-center justify-center ${
                                  isExpanded ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
                                }`}>
                                  {issue.comments.length}
                                </span>
                              )}
                            </button>

                            {/* Load & Correct button for invoices */}
                            {issue.entityType === 'INVOICE' && !isResolved && (
                              <button
                                onClick={() => handleLoadAndCorrect(issue)}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                title="Load this invoice in Invoice Creator to amend lines and correct discrepancies"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span className="hidden xl:inline">Correct</span>
                              </button>
                            )}

                            {/* Load & Correct button for delivery notes */}
                            {issue.entityType === 'DELIVERY' && !isResolved && onReloadDeliveryNote && (
                              <button
                                onClick={() => handleLoadAndCorrectDelivery(issue)}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                title="Load this delivery note in Delivery Notes Editor to amend lines and correct discrepancies"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span className="hidden xl:inline">Correct</span>
                              </button>
                            )}

                            {/* 1-Click Quick Resolve button (Admin only) */}
                            {!isResolved && (
                              <button
                                type="button"
                                onClick={() => handleQuickResolve(issue)}
                                disabled={!isSysAdmin}
                                className={`px-2 py-1 font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-xs transition-all ${
                                  isSysAdmin
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 shadow-none'
                                }`}
                                title={
                                  isSysAdmin
                                    ? 'Quickly resolve this issue in 1 click'
                                    : 'Access Denied: Only Administrators can mark issues as resolved'
                                }
                              >
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="hidden xl:inline">Quick</span>
                              </button>
                            )}

                            {/* Mark as Resolved button with notes (Admin only) */}
                            {!isResolved ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isSysAdmin) return;
                                  setResolvingIssue(issue);
                                  setResolutionText('');
                                }}
                                disabled={!isSysAdmin}
                                className={`px-2 py-1 font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-xs transition-all ${
                                  isSysAdmin
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 shadow-none'
                                }`}
                                title={
                                  isSysAdmin
                                    ? 'Mark this issue resolved and clear from active list'
                                    : 'Access Denied: Only Administrators can mark issues as resolved'
                                }
                              >
                                <Check className="w-3 h-3" />
                                <span className="hidden xl:inline">Resolve</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isSysAdmin) return;
                                  handleReopenIssue(issue);
                                }}
                                disabled={!isSysAdmin}
                                className={`px-2 py-1 font-semibold rounded-lg text-xs inline-flex items-center gap-1 transition-all ${
                                  isSysAdmin
                                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 shadow-none'
                                }`}
                                title={
                                  isSysAdmin
                                    ? 'Re-open this issue for further investigation'
                                    : 'Access Denied: Only Administrators can re-open issues'
                                }
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span className="hidden xl:inline">Reopen</span>
                              </button>
                            )}

                            {/* Delete button (if admin) */}
                            {isAdmin && onDeleteIssue && (
                              <button
                                onClick={() => setIssuePendingDelete(issue)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                title="Delete issue record permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Drilling Row (Keeps other drilling option the same) */}
                      {isExpanded && (
                        <tr key={`${issue.id}-expanded`} className="bg-slate-50 border-b-2 border-blue-200">
                          <td colSpan={11} className="p-4 sm:p-6 space-y-5">
                      
                      {/* Issue Header Info Bar */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Flagged By & Date</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {issue.flaggedBy} on {new Date(issue.flaggedAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Flagged Reason</span>
                          <span className="font-semibold text-rose-700 mt-0.5 block truncate" title={flaggedReason}>
                            {flaggedReason}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            {issue.entityType === 'DELIVERY' ? 'Delivery Comment' : 'Invoice Comment'}
                          </span>
                          <span className="font-semibold text-slate-800 mt-0.5 block truncate" title={comment || 'No comment provided'}>
                            {comment || '—'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Resolution Status</span>
                          <span className="font-bold text-slate-800 mt-0.5 block">
                            {issue.status === 'RESOLVED' ? (
                              <span className="text-emerald-700">Resolved by {issue.resolvedBy}</span>
                            ) : issue.status === 'UNDER_REVIEW' ? (
                              <span className="text-blue-700">Under Review (Comments pending reviewer)</span>
                            ) : (
                              <span className="text-amber-700">Pending Investigation</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Document Pictures & Photographic Evidence Gallery */}
                      {(totalAttachments > 0 || !isResolved) && (
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
                          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-indigo-600" />
                              <h4 className="text-xs font-bold text-slate-800">
                                Attached Pictures, Scans & Photographic Evidence
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {totalAttachments} total photo{totalAttachments === 1 ? '' : 's'}
                              </span>
                            </div>
                            {!isResolved && (
                              <span className="text-[11px] text-slate-500 hidden sm:inline">
                                Upload photos of physical delivery slips, weight tickets, or damaged goods
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* 1. Original Document Physical Proof (from invoice or delivery note) */}
                            <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2">
                              <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                                  Original {issue.entityType === 'INVOICE' ? 'Invoice' : 'Delivery Note'} (#{issue.referenceNumber}) Scans
                                </span>
                                <span className="text-[10px] font-normal text-slate-400">
                                  {docAttachments.length} image{docAttachments.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              {docAttachments.length > 0 ? (
                                <ImageAttachmentManager
                                  attachments={docAttachments}
                                  readOnly={true}
                                  compact={true}
                                />
                              ) : (
                                <div className="text-center py-4 text-xs text-slate-400 italic bg-white rounded-lg border border-dashed border-slate-200">
                                  No scanned images were attached when {issue.referenceNumber} was created.
                                </div>
                              )}
                            </div>

                            {/* 2. Issue Investigation & Discrepancy Evidence Photos */}
                            <div className="p-3.5 bg-amber-50/40 border border-amber-200/80 rounded-xl space-y-2">
                              <div className="text-[11px] font-bold text-amber-900 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  Issue Investigation Evidence Photos
                                </span>
                                <span className="text-[10px] font-semibold text-amber-700">
                                  {issueAttachments.length} attached
                                </span>
                              </div>
                              <ImageAttachmentManager
                                attachments={issueAttachments}
                                onChange={(updated) => {
                                  onUpdateIssue({
                                    ...issue,
                                    attachments: updated,
                                  });
                                }}
                                readOnly={isResolved}
                                currentUser={currentUser}
                                compact={true}
                                title=""
                                description="Attach photos or scans of discrepancy evidence (PNG, JPG, WEBP)."
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Line Items Table Breakdown (For Invoices and Delivery Notes) */}
                      {effectiveLineIssues && effectiveLineIssues.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                          <div className="bg-slate-800 px-4 py-2.5 text-white flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                              <span className="font-bold text-xs">
                                Line Items & Line-by-Line Discrepancy Breakdown
                              </span>
                              <span className="text-[11px] text-slate-300 font-mono">
                                ({effectiveLineIssues.length} line items)
                              </span>
                            </div>

                            {/* Resolve navigation button to edit screen */}
                            <div className="flex items-center gap-2">
                              {issue.entityType === 'DELIVERY' && onReloadDeliveryNote && !isResolved && (
                                <button
                                  type="button"
                                  onClick={() => handleLoadAndCorrectDelivery(issue)}
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                  title="Navigate directly to Delivery Notes Editor to update quantities, line comments, and resolve discrepancies"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Resolve in Delivery Edit Screen</span>
                                </button>
                              )}

                              {issue.entityType === 'INVOICE' && !isResolved && (
                                <button
                                  type="button"
                                  onClick={() => handleLoadAndCorrect(issue)}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                  title="Navigate directly to Invoice Creator to update quantities, line comments, and resolve discrepancies"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Resolve in Invoice Edit Screen</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="overflow-auto max-h-[380px] scrollbar-thin">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-900 text-white font-semibold sticky top-0 z-10 shadow-sm">
                                <tr>
                                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">#</th>
                                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Item Description</th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">PO Qty</th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                    {issue.entityType === 'DELIVERY' ? 'Delivered Qty' : 'Billed Qty'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Unit Price (TZS)</th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Total Value (TZS)</th>
                                  <th className="py-2.5 px-3 min-w-[200px] sticky top-0 bg-slate-900">Line Discrepancy Comment</th>
                                  <th className="py-2.5 px-3 min-w-[220px] sticky top-0 bg-slate-900">Worker Investigation Note</th>
                                  {isSysAdmin && (
                                    <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Action</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {effectiveLineIssues.map((line, idx) => {
                                  const key = `${issue.id}-${line.lineId}`;
                                  const isEditingThis = editingLineId === key;
                                  const currentDraft = lineWorkComments[key] !== undefined ? lineWorkComments[key] : (line.workComment || '');

                                  return (
                                    <tr key={line.lineId || idx} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                                        {line.itemDescription}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-slate-600">
                                        {line.poQuantity || '—'} {line.unitOfMeasure || ''}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                        {line.billedOrDeliveredQuantity || '—'} {line.unitOfMeasure || ''}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-slate-600 font-mono">
                                        TZS {formatCurrency(line.unitPrice || 0)}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700 font-mono">
                                        TZS {formatCurrency(line.valueAfterVat || line.totalValue || 0)}
                                      </td>
                                      
                                      {/* Line Issue Comment */}
                                      <td className="py-2.5 px-3">
                                        {line.issueComment ? (
                                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                                            {line.issueComment}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 italic text-[11px]">No specific line issue reported</span>
                                        )}
                                      </td>

                                      {/* Worker's Line Note */}
                                      <td className="py-2.5 px-3">
                                        {isEditingThis ? (
                                          <div className="space-y-1.5">
                                            <input
                                              type="text"
                                              value={currentDraft}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setLineWorkComments((prev) => ({ ...prev, [key]: val }));
                                              }}
                                              placeholder="Enter line findings / resolution comment..."
                                              className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => handleSaveLineWorkComment(issue, line.lineId, effectiveLineIssues)}
                                                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                              >
                                                Save
                                              </button>
                                              <button
                                                onClick={() => setEditingLineId(null)}
                                                className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] cursor-pointer"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-700 text-xs">
                                              {line.workComment || (
                                                <span className="text-slate-400 italic text-[11px]">
                                                  No investigation note added yet
                                                </span>
                                              )}
                                            </span>
                                            {!isResolved && (
                                              <button
                                                onClick={() => {
                                                  setEditingLineId(key);
                                                  setLineWorkComments((prev) => ({
                                                    ...prev,
                                                    [key]: line.workComment || '',
                                                  }));
                                                }}
                                                className="text-blue-600 hover:text-blue-800 text-[10px] font-bold shrink-0 cursor-pointer"
                                              >
                                                Edit
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>

                                      {isSysAdmin && (
                                        <td className="py-2.5 px-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => setLinePendingDelete({ issue, line, lineIndex: idx })}
                                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                            title="Permanently delete item line from database"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Work Notes & Reviewer Conversation Collaboration Pane */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        
                        {/* Left: Chronological Discussion / Work Log */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-blue-600" />
                              Audit Trail & Collaboration Log
                            </h4>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {issue.comments?.length || 0} note(s)
                            </span>
                          </div>

                          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                            {issue.comments?.map((c, idx) => (
                              <div
                                key={c.id || idx}
                                className={`p-3 rounded-xl border text-xs space-y-1 ${
                                  c.type === 'RESOLUTION_NOTE'
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : c.type === 'REVIEWER_NOTE'
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-800">
                                    {c.authorName} ({c.authorRole})
                                  </span>
                                  <span className="text-slate-400">
                                    {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(c.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-slate-700 leading-relaxed">{c.comment}</p>
                              </div>
                            ))}
                          </div>

                          {/* Resolution Notice if Resolved */}
                          {isResolved && issue.resolutionNotes && (
                            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs space-y-1">
                              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Final Resolution Details
                              </div>
                              <p className="text-emerald-800">{issue.resolutionNotes}</p>
                              <div className="text-[10px] text-emerald-700">
                                Resolved by {issue.resolvedBy} on {issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleString() : 'N/A'}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Worker / Reviewer Action Box */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3.5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <Edit3 className="w-4 h-4 text-amber-600" />
                                Work on this Issue & Submit for Review
                              </h4>
                              <span className="text-[10px] font-bold uppercase text-slate-400">
                                Active User: {authorName}
                              </span>
                            </div>

                            {!isResolved ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                    Add Investigation Findings / Notes
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={workComments[issue.id] || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setWorkComments((prev) => ({ ...prev, [issue.id]: val }));
                                    }}
                                    placeholder="Enter findings: E.g., Contacted supplier, confirmed delivery was short by 5 tons. Proposed amending invoice to 25 tons..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                {/* Quick Attachment while working on issue */}
                                <div className="pt-2 border-t border-slate-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-1">
                                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                      Attach Picture Evidence While Working
                                    </label>
                                    <span className="text-[10px] text-slate-400">
                                      {(issue.attachments || []).length} attached
                                    </span>
                                  </div>
                                  <ImageAttachmentManager
                                    attachments={issue.attachments || []}
                                    onChange={(updated) => {
                                      onUpdateIssue({
                                        ...issue,
                                        attachments: updated,
                                      });
                                    }}
                                    readOnly={isResolved}
                                    currentUser={currentUser}
                                    compact={true}
                                    title=""
                                    description="Attach photo proof of physical damage, weighbridge slip, or revised signed note."
                                  />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                                  <button
                                    onClick={() => handleAddWorkComment(issue, false)}
                                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                                  >
                                    Save Work Note
                                  </button>

                                  <button
                                    onClick={() => handleAddWorkComment(issue, true)}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Submit for Review
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                                <div className="font-bold text-slate-800">Issue is Closed & Resolved</div>
                                <p>To add more notes or re-investigate, click "Re-open" above.</p>
                              </div>
                            )}
                          </div>

                          {/* Reviewer / Admin Actions Bar */}
                          {!isResolved && (
                            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-amber-50/40 p-3 rounded-xl border border-amber-100">
                              <div>
                                <span className="text-[11px] font-bold text-amber-900 block">
                                  Reviewer & Admin Action
                                </span>
                                <span className="text-[10px] text-amber-700">
                                  {issue.entityType === 'DELIVERY'
                                    ? 'Load delivery note into editor to amend lines and resolve'
                                    : 'Load invoice to modify lines and resolve'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {issue.entityType === 'INVOICE' && (
                                  <button
                                    onClick={() => handleLoadAndCorrect(issue)}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                                    title="Load into Invoice Creator to amend lines"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Load & Correct Invoice
                                  </button>
                                )}

                                {issue.entityType === 'DELIVERY' && onReloadDeliveryNote && (
                                  <button
                                    onClick={() => handleLoadAndCorrectDelivery(issue)}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                                    title="Load into Delivery Notes Editor to amend lines and resolve discrepancy"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    Resolve in Delivery Edit Screen
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isSysAdmin) return;
                                    setResolvingIssue(issue);
                                    setResolutionText('');
                                  }}
                                  disabled={!isSysAdmin}
                                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-all ${
                                    isSysAdmin
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 shadow-none'
                                  }`}
                                  title={
                                    isSysAdmin
                                      ? 'Mark as Resolved'
                                      : 'Access Denied: Only Administrators can mark issues as resolved'
                                  }
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Mark as Resolved</span>
                                  {!isSysAdmin && <span className="text-[10px] font-normal text-slate-400">(Admin Only)</span>}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
  {sortedIssues.length > 0 && (
    <TablePagination
      currentPage={issuesPage}
      totalItems={sortedIssues.length}
      pageSize={issuesPageSize}
      onPageChange={setIssuesPage}
      onPageSizeChange={setIssuesPageSize}
      itemLabel="Issues"
    />
  )}
</div>

      {/* Quick Resolve Modal */}
      {resolvingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-base">
                <CheckCircle2 className="w-6 h-6" />
                Resolve Issue on {resolvingIssue.referenceNumber}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Marking this issue as resolved will record your resolution summary, update line items to resolved, 
              and <strong>move this invoice out of the active issues list</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Resolution Notes & Corrective Actions Taken <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="E.g. Invoice CRU005 loaded into creator; corrected Line 1 quantity to 25 tons to match warehouse gate receipt. Re-saved and cleared with client procurement."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setResolvingIssue(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolve}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirm & Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Confirmation Modal for Admin Deleting Items Line from Database */}
      <SmsConfirmationModal
        isOpen={!!linePendingDelete}
        onClose={() => setLinePendingDelete(null)}
        onConfirm={handleConfirmDeleteLine}
        title="Permanently Delete Item Line from Database"
        itemName={linePendingDelete?.line.itemDescription || ''}
        quantity={linePendingDelete?.line.billedOrDeliveredQuantity}
        unitPrice={linePendingDelete?.line.unitPrice}
        totalAmount={linePendingDelete?.line.valueAfterVat || linePendingDelete?.line.totalValue}
        referenceNumber={linePendingDelete?.issue.referenceNumber}
        customerName={linePendingDelete?.issue.customerName}
        warningNote="⚠️ Permanently removes this item line from this issue and database. Recalculates all balances."
      />

      {/* Permanent Delete Modal for Admin Deleting Issue Record */}
      <PermanentDeleteModal
        isOpen={!!issuePendingDelete}
        onClose={() => setIssuePendingDelete(null)}
        onConfirm={() => {
          if (issuePendingDelete && onDeleteIssue) {
            onDeleteIssue(issuePendingDelete.id);
            setIssuePendingDelete(null);
          }
        }}
        transactionType="ISSUE"
        referenceNumber={issuePendingDelete?.referenceNumber || ''}
        customerName={issuePendingDelete?.customerName}
        poNumber={issuePendingDelete?.poNumber}
        totalAmount={issuePendingDelete?.totalValue}
        details={`Permanently removes issue record "${issuePendingDelete?.issueTitle || issuePendingDelete?.referenceNumber}" and all associated comments and discrepancies from the database.`}
      />

      {/* Batch Resolve Selected Issues Modal */}
      {isBulkResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-emerald-700 font-bold text-base pb-3 border-b border-slate-100">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <span>Resolve Selected Issues ({selectedIssueIds.size} Selected)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You are about to mark <strong>{selectedIssueIds.size} issues</strong> as resolved in bulk. This will update the status of each selected document, mark their discrepancy lines as resolved, and synchronize the database.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                Batch Resolution Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={bulkResolutionText}
                onChange={(e) => setBulkResolutionText(e.target.value)}
                placeholder="E.g. Discrepancies reviewed, verified against supplier delivery notes and purchase orders, and cleared."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkResolveModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleBatchResolve(Array.from(selectedIssueIds), bulkResolutionText)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Batch Resolve ({selectedIssueIds.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve All Pending Issues in View Modal */}
      {isResolveAllPendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-indigo-700 font-bold text-base pb-3 border-b border-slate-100">
              <CheckCircle2 className="w-6 h-6 text-indigo-600" />
              <span>Resolve All Pending Issues ({pendingFilteredIssues.length})</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to resolve all <strong>{pendingFilteredIssues.length} pending issues</strong> currently in this view? All active discrepancy flags will be cleared, linked invoices and delivery notes will be marked as resolved, and audit trails will be preserved.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResolveAllPendingModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const pendingIds = pendingFilteredIssues.map((i) => i.id);
                  handleBatchResolve(pendingIds, 'All pending issues verified and resolved during executive management audit.');
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Resolve All ({pendingFilteredIssues.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
