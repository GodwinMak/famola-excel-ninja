import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  DocumentIssueRecord, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord,
  LineItemIssue
} from '../types';
import { formatCurrency } from './storage';

export interface DetailedReportExportOptions {
  issues: DocumentIssueRecord[];
  invoices: InvoiceRecord[];
  deliveryNotes?: DeliveryNoteRecord[];
  payments?: PaymentRecord[];
  activeEntityType?: string;
  activeFilters?: {
    status?: string;
    severity?: string;
    customer?: string;
    po?: string;
    issueType?: string;
    searchTerm?: string;
  };
}

/**
 * Checks if a string is "Call of Order" or variant
 */
export const isCallOfOrderText = (str?: string): boolean => {
  if (!str) return false;
  const s = str.trim().toLowerCase();
  return s === 'call of order' || s === '[call of order]' || s.includes('call of order');
};

/**
 * Checks if a string is a generic system-generated issue string or placeholder
 */
export const isGenericIssueText = (str?: string): boolean => {
  if (!str) return false;
  const s = str.trim().toLowerCase();
  return (
    s === 'okay' ||
    s === 'ok' ||
    isCallOfOrderText(s) ||
    s.startsWith('issue on invoice') ||
    s.startsWith('issue on delivery') ||
    s.startsWith('issue on ') ||
    s.startsWith('delivery discrepancy on ') ||
    s.startsWith('invoice discrepancy on ') ||
    s.startsWith('discrepancy on ') ||
    s.startsWith('discrepancy flagged during') ||
    s.startsWith('discrepancy flagged on') ||
    s === 'discrepancy / issue flagged'
  );
};

/**
 * Extracts a concise, clean issue title / reason (e.g. "NO PO", "Quantity Discrepancy", "Damaged Goods")
 * avoiding "Call of Order" and generic repetitive strings like "Issue on Invoice DDMA0400 (TANESCO DODOMA)"
 */
export const getCleanIssueTitle = (issue: {
  primaryIssue?: string;
  issueTitle?: string;
  headerComment?: string;
  issueType?: string;
  lineIssues?: Array<{ issueComment?: string; itemDescription?: string }>;
  entityType?: string;
}): string => {
  if (issue.primaryIssue && !isGenericIssueText(issue.primaryIssue)) {
    return issue.primaryIssue.trim();
  }
  const lineNote = issue.lineIssues?.find(
    (l) => l.issueComment && !isGenericIssueText(l.issueComment)
  )?.issueComment;
  if (lineNote) {
    return lineNote.trim();
  }
  if (issue.headerComment && !isGenericIssueText(issue.headerComment)) {
    return issue.headerComment.trim();
  }
  if (issue.issueTitle && !isGenericIssueText(issue.issueTitle)) {
    return issue.issueTitle.trim();
  }
  if (issue.issueType && !isGenericIssueText(issue.issueType)) {
    return issue.issueType.trim();
  }
  return issue.entityType === 'DELIVERY' ? 'Delivery Discrepancy' : 'Quantity Discrepancy';
};

export interface IssueReasonAndComment {
  flaggedReason: string;
  comment: string;
}

/**
 * Returns strictly the Flagged Reason and the Comment from delivery/invoice details.
 * Completely replaces "Call of Order" with the true flagged reason and actual details comment.
 */
export const getIssueReasonAndComment = (
  issue: DocumentIssueRecord,
  matchedDN?: DeliveryNoteRecord | null,
  matchedInvoice?: InvoiceRecord | null
): IssueReasonAndComment => {
  // 1. Determine clean Flagged Reason
  const flaggedReason = getCleanIssueTitle(issue);

  // 2. Extract Comment from Delivery Details or Invoice Details
  let comment = '';

  if (issue.entityType === 'DELIVERY') {
    // Check matched delivery note details first
    if (matchedDN) {
      if (matchedDN.comment && !isGenericIssueText(matchedDN.comment) && matchedDN.comment.trim() !== flaggedReason) {
        comment = matchedDN.comment.trim();
      } else if (matchedDN.notes && !isGenericIssueText(matchedDN.notes) && matchedDN.notes.trim() !== flaggedReason) {
        comment = matchedDN.notes.trim();
      } else if (matchedDN.issueComment && !isGenericIssueText(matchedDN.issueComment) && matchedDN.issueComment.trim() !== flaggedReason) {
        comment = matchedDN.issueComment.trim();
      } else {
        // Line-level comments from delivery note lines
        const lineWithComment = matchedDN.lines?.find(
          (l) => l.comment && !isGenericIssueText(l.comment) && l.comment.trim() !== flaggedReason
        );
        if (lineWithComment?.comment) {
          comment = lineWithComment.comment.trim();
        }
      }
    }

    // Fallback to issue.headerComment or lineIssues comments if not generic
    if (!comment) {
      if (issue.headerComment && !isGenericIssueText(issue.headerComment) && issue.headerComment.trim() !== flaggedReason) {
        comment = issue.headerComment.trim();
      } else {
        const lineIssue = issue.lineIssues?.find(
          (l) => l.issueComment && !isGenericIssueText(l.issueComment) && l.issueComment.trim() !== flaggedReason
        );
        if (lineIssue?.issueComment) {
          comment = lineIssue.issueComment.trim();
        }
      }
    }
  } else if (issue.entityType === 'INVOICE') {
    // Check matched invoice details
    if (matchedInvoice) {
      if (matchedInvoice.comment && !isGenericIssueText(matchedInvoice.comment) && matchedInvoice.comment.trim() !== flaggedReason) {
        comment = matchedInvoice.comment.trim();
      } else if (matchedInvoice.notes && !isGenericIssueText(matchedInvoice.notes) && matchedInvoice.notes.trim() !== flaggedReason) {
        comment = matchedInvoice.notes.trim();
      } else if (matchedInvoice.issueComment && !isGenericIssueText(matchedInvoice.issueComment) && matchedInvoice.issueComment.trim() !== flaggedReason) {
        comment = matchedInvoice.issueComment.trim();
      } else {
        const lineWithComment = matchedInvoice.lines?.find(
          (l) => l.comment && !isGenericIssueText(l.comment) && l.comment.trim() !== flaggedReason
        );
        if (lineWithComment?.comment) {
          comment = lineWithComment.comment.trim();
        }
      }
    }

    if (!comment) {
      if (issue.headerComment && !isGenericIssueText(issue.headerComment) && issue.headerComment.trim() !== flaggedReason) {
        comment = issue.headerComment.trim();
      } else {
        const lineIssue = issue.lineIssues?.find(
          (l) => l.issueComment && !isGenericIssueText(l.issueComment) && l.issueComment.trim() !== flaggedReason
        );
        if (lineIssue?.issueComment) {
          comment = lineIssue.issueComment.trim();
        }
      }
    }
  } else {
    // Payment or other issue types
    if (issue.headerComment && !isGenericIssueText(issue.headerComment) && issue.headerComment.trim() !== flaggedReason) {
      comment = issue.headerComment.trim();
    }
  }

  return { flaggedReason, comment };
};

/**
 * Formats unique issue tracking number e.g. ISS-001024
 */
export const getIssueTrackingNumber = (issue: DocumentIssueRecord): string => {
  if (issue.id.toUpperCase().startsWith('ISS-')) {
    return issue.id.toUpperCase();
  }
  const clean = issue.id.replace(/[^a-zA-Z0-9]/g, '');
  return `ISS-${clean.slice(-6).toUpperCase()}`;
};

/**
 * Calculate total discrepancy quantity or line qty for an issue
 */
export const getIssueTotalQty = (issue: DocumentIssueRecord): number => {
  if (issue.lineIssues && issue.lineIssues.length > 0) {
    return issue.lineIssues.reduce((sum, l) => {
      const disc = Math.abs(l.discrepancyQuantity || 0);
      if (disc > 0) return sum + disc;
      return sum + Number(l.billedOrDeliveredQuantity || l.quantityInvoiced || l.quantityDelivered || 0);
    }, 0);
  }
  return 0;
};

export interface InvoiceIssueGroup {
  invoiceNumber: string;
  poNumber: string;
  invoiceDate?: string;
  subtotal?: number;
  vatAmount?: number;
  totalAmount?: number;
  disputedAmount: number;
  issues: DocumentIssueRecord[];
  lines: Array<{
    itemDescription: string;
    unitOfMeasure: string;
    poQuantity: number | string;
    billedQuantity: number | string;
    deliveredQuantity: number | string;
    discrepancyQuantity: number | string;
    unitPrice: number;
    lineTotal: number;
    discrepancyReason: string;
    workerNote: string;
    status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';
    severity: string;
  }>;
  resolutionStats: {
    total: number;
    resolved: number;
    underReview: number;
    pending: number;
    pctResolved: number;
    pctReview: number;
    pctPending: number;
    primaryStatus: 'RESOLVED' | 'UNDER_REVIEW' | 'PENDING';
  };
  comments: Array<{
    author: string;
    role?: string;
    date?: string;
    comment: string;
  }>;
}

export interface CustomerIssueGroup {
  customerName: string;
  totalIssues: number;
  pendingCount: number;
  underReviewCount: number;
  resolvedCount: number;
  pctResolved: number;
  totalDisputedAmount: number;
  invoices: InvoiceIssueGroup[];
}

/**
 * Builds customer-grouped hierarchical dataset with invoices, line items, and resolution metrics
 */
export const buildCustomerGroupedInvoicesData = (
  issues: DocumentIssueRecord[],
  invoices: InvoiceRecord[]
): CustomerIssueGroup[] => {
  const customerMap = new Map<string, CustomerIssueGroup>();

  const allCustomers = new Set<string>();
  issues.forEach((i) => {
    if (i.customerName && i.customerName.trim()) {
      allCustomers.add(i.customerName.trim());
    }
  });
  invoices.forEach((inv) => {
    if ((inv.isFlagged || inv.hasIssue) && inv.customerName && inv.customerName.trim()) {
      allCustomers.add(inv.customerName.trim());
    }
  });

  allCustomers.forEach((cust) => {
    const custIssues = issues.filter(
      (i) => (i.customerName || '').trim().toLowerCase() === cust.toLowerCase()
    );
    const custInvoices = invoices.filter(
      (inv) => (inv.customerName || '').trim().toLowerCase() === cust.toLowerCase()
    );

    if (custIssues.length === 0 && !custInvoices.some((inv) => inv.isFlagged || inv.hasIssue)) {
      return;
    }

    const invoiceMap = new Map<string, InvoiceIssueGroup>();

    // 1. Process from issues first
    custIssues.forEach((iss) => {
      const invRef = (iss.referenceNumber || iss.poNumber || 'GENERAL').trim();
      const matchedInv = custInvoices.find(
        (inv) =>
          inv.id === iss.entityId ||
          inv.invoiceNumber.trim().toLowerCase() === invRef.toLowerCase()
      );

      if (!invoiceMap.has(invRef)) {
        invoiceMap.set(invRef, {
          invoiceNumber: matchedInv?.invoiceNumber || iss.referenceNumber || 'N/A',
          poNumber: matchedInv?.poNumber || iss.poNumber || 'N/A',
          invoiceDate: matchedInv?.invoiceDate,
          subtotal: matchedInv?.subtotalBeforeVat,
          vatAmount: matchedInv?.totalVat,
          totalAmount: matchedInv?.totalAfterVat,
          disputedAmount: 0,
          issues: [],
          lines: [],
          resolutionStats: {
            total: 0,
            resolved: 0,
            underReview: 0,
            pending: 0,
            pctResolved: 0,
            pctReview: 0,
            pctPending: 0,
            primaryStatus: 'PENDING',
          },
          comments: [],
        });
      }

      const invGroup = invoiceMap.get(invRef)!;
      invGroup.issues.push(iss);
      invGroup.disputedAmount += iss.disputedAmount || 0;

      // Extract line items
      if (iss.lineIssues && iss.lineIssues.length > 0) {
        iss.lineIssues.forEach((line) => {
          const actualLineComment =
            line.issueComment && line.issueComment.toLowerCase() !== 'okay'
              ? line.issueComment
              : getCleanIssueTitle(iss);

          invGroup.lines.push({
            itemDescription: line.itemDescription || 'Line Item',
            unitOfMeasure: line.unitOfMeasure || 'PCS',
            poQuantity: line.poQuantity ?? '-',
            billedQuantity: line.billedOrDeliveredQuantity ?? '-',
            deliveredQuantity: line.quantityDelivered ?? '-',
            discrepancyQuantity: line.discrepancyQuantity ?? '-',
            unitPrice: line.unitPrice || 0,
            lineTotal:
              line.valueAfterVat ||
              Number(line.billedOrDeliveredQuantity || 0) * (line.unitPrice || 0),
            discrepancyReason: actualLineComment,
            workerNote: line.workComment || 'Pending note',
            status: iss.status,
            severity: iss.severity,
          });
        });
      } else if (matchedInv?.lines && matchedInv.lines.length > 0) {
        // Check for specific lines flagged with an issue
        const issueLines = matchedInv.lines.filter(
          (l) => l.hasIssue || (l.issueComment && l.issueComment.trim().toLowerCase() !== 'okay')
        );
        // If specific lines have issues, expand those; otherwise expand all lines of this invoice
        const linesToExpand = issueLines.length > 0 ? issueLines : matchedInv.lines;

        linesToExpand.forEach((line) => {
          const billed = line.invoicedQuantity ?? (line as any).quantityInvoiced ?? (line as any).billedQuantity ?? 0;
          const delivered = line.quantityDelivered ?? (line as any).deliveredQuantity ?? 0;
          const poQty = line.poQuantity ?? 0;
          const disc = line.availableQuantity !== undefined
            ? line.availableQuantity
            : (delivered > 0 && billed !== delivered)
            ? (Number(billed) - Number(delivered))
            : (poQty > 0 && billed !== poQty)
            ? (Number(billed) - Number(poQty))
            : 0;

          const desc = line.itemDescription || (line as any).description || 'Line Item';
          const alreadyExists = invGroup.lines.some(
            (existing) => existing.itemDescription.trim().toLowerCase() === desc.trim().toLowerCase()
          );

          if (!alreadyExists) {
            invGroup.lines.push({
              itemDescription: desc,
              unitOfMeasure: line.unitOfMeasure || 'PCS',
              poQuantity: line.poQuantity ?? '-',
              billedQuantity: billed || '-',
              deliveredQuantity: delivered || '-',
              discrepancyQuantity: disc !== 0 ? disc : '-',
              unitPrice: line.unitPrice || line.unitCost || 0,
              lineTotal: line.valueAfterVat || line.valueBeforeVat || (Number(billed || 0) * (line.unitPrice || line.unitCost || 0)),
              discrepancyReason: line.issueComment || line.comment || getCleanIssueTitle(iss),
              workerNote: line.hasIssue ? 'Flagged discrepancy line' : 'Audited invoice line',
              status: line.hasIssue ? iss.status : (iss.status === 'RESOLVED' ? 'RESOLVED' : iss.status),
              severity: iss.severity,
            });
          }
        });
      }

      // Collect comments
      if (iss.comments && iss.comments.length > 0) {
        iss.comments.forEach((c) => {
          invGroup.comments.push({
            author: (c as any).userName || (c as any).authorName || 'Staff',
            role: (c as any).authorRole || (c as any).userRole,
            date: c.createdAt ? new Date(c.createdAt).toLocaleString() : undefined,
            comment: c.comment || '',
          });
        });
      }
    });

    // 2. Add any flagged customer invoice without explicit issues
    custInvoices.forEach((inv) => {
      const invRef = inv.invoiceNumber.trim();
      if ((inv.isFlagged || inv.hasIssue) && !invoiceMap.has(invRef)) {
        const issueLines = (inv.lines || []).filter(
          (l) => l.hasIssue || (l.issueComment && l.issueComment.trim().toLowerCase() !== 'okay')
        );
        const linesToExpand = issueLines.length > 0 ? issueLines : (inv.lines || []);

        const invLines = linesToExpand.map((l) => {
          const billed = l.invoicedQuantity ?? (l as any).quantityInvoiced ?? (l as any).billedQuantity ?? 0;
          const delivered = l.quantityDelivered ?? (l as any).deliveredQuantity ?? 0;
          const poQty = l.poQuantity ?? 0;
          const disc = l.availableQuantity !== undefined
            ? l.availableQuantity
            : (delivered > 0 && billed !== delivered)
            ? (Number(billed) - Number(delivered))
            : (poQty > 0 && billed !== poQty)
            ? (Number(billed) - Number(poQty))
            : 0;

          return {
            itemDescription: l.itemDescription || (l as any).description || 'Line Item',
            unitOfMeasure: l.unitOfMeasure || 'PCS',
            poQuantity: l.poQuantity ?? '-',
            billedQuantity: billed || '-',
            deliveredQuantity: delivered || '-',
            discrepancyQuantity: disc !== 0 ? disc : '-',
            unitPrice: l.unitPrice || l.unitCost || 0,
            lineTotal: l.valueAfterVat || l.valueBeforeVat || (Number(billed || 0) * (l.unitPrice || l.unitCost || 0)),
            discrepancyReason: l.issueComment || l.comment || inv.issueComment || 'Flagged Invoice Discrepancy',
            workerNote: 'Audit discrepancy flag',
            status: 'PENDING' as const,
            severity: 'HIGH',
          };
        });

        invoiceMap.set(invRef, {
          invoiceNumber: inv.invoiceNumber,
          poNumber: inv.poNumber || 'N/A',
          invoiceDate: inv.invoiceDate,
          subtotal: inv.subtotalBeforeVat,
          vatAmount: inv.totalVat,
          totalAmount: inv.totalAfterVat,
          disputedAmount: inv.totalAfterVat || 0,
          issues: [],
          lines: invLines,
          resolutionStats: {
            total: 1,
            resolved: 0,
            underReview: 0,
            pending: 1,
            pctResolved: 0,
            pctReview: 0,
            pctPending: 100,
            primaryStatus: 'PENDING',
          },
          comments: [],
        });
      }
    });

    // Compute resolution stats for each invoice
    invoiceMap.forEach((invGroup) => {
      const total = invGroup.issues.length > 0 ? invGroup.issues.length : 1;
      const resolved = invGroup.issues.filter((i) => i.status === 'RESOLVED').length;
      const underReview = invGroup.issues.filter((i) => i.status === 'UNDER_REVIEW').length;
      const pending = invGroup.issues.filter((i) => i.status === 'PENDING').length;

      const pctResolved = Math.round((resolved / total) * 100);
      const pctReview = Math.round((underReview / total) * 100);
      const pctPending = Math.round((pending / total) * 100);

      let primaryStatus: 'RESOLVED' | 'UNDER_REVIEW' | 'PENDING' = 'PENDING';
      if (resolved === total && total > 0) {
        primaryStatus = 'RESOLVED';
      } else if (underReview > 0 || resolved > 0) {
        primaryStatus = 'UNDER_REVIEW';
      }

      invGroup.resolutionStats = {
        total,
        resolved,
        underReview,
        pending,
        pctResolved,
        pctReview,
        pctPending,
        primaryStatus,
      };

      if (invGroup.lines.length === 0) {
        invGroup.lines.push({
          itemDescription: invGroup.issues[0]?.primaryIssue || 'Operational Document Discrepancy',
          unitOfMeasure: 'UNIT',
          poQuantity: '-',
          billedQuantity: '-',
          deliveredQuantity: '-',
          discrepancyQuantity: '-',
          unitPrice: 0,
          lineTotal: invGroup.disputedAmount || invGroup.totalAmount || 0,
          discrepancyReason: invGroup.issues[0] ? getCleanIssueTitle(invGroup.issues[0]) : 'Document Issue',
          workerNote: invGroup.issues[0]?.headerComment || 'Issue noted on invoice',
          status: primaryStatus,
          severity: invGroup.issues[0]?.severity || 'MEDIUM',
        });
      }
    });

    const pendingCount = custIssues.filter((i) => i.status === 'PENDING').length;
    const underReviewCount = custIssues.filter((i) => i.status === 'UNDER_REVIEW').length;
    const resolvedCount = custIssues.filter((i) => i.status === 'RESOLVED').length;
    const totalIssues = custIssues.length || 1;
    const pctResolved = Math.round((resolvedCount / totalIssues) * 100);
    const totalDisputedAmount = custIssues.reduce((sum, i) => sum + (i.disputedAmount || 0), 0);

    customerMap.set(cust, {
      customerName: cust,
      totalIssues,
      pendingCount,
      underReviewCount,
      resolvedCount,
      pctResolved,
      totalDisputedAmount,
      invoices: Array.from(invoiceMap.values()),
    });
  });

  return Array.from(customerMap.values()).sort((a, b) => b.totalIssues - a.totalIssues);
};

/**
 * Backward-compatible helper used across the app
 */
export const buildCustomerDetailedIssuesData = (
  issues: DocumentIssueRecord[],
  invoices: InvoiceRecord[]
) => {
  return buildCustomerGroupedInvoicesData(issues, invoices).map((c) => ({
    customerName: c.customerName,
    invoices: invoices.filter(
      (inv) => (inv.customerName || '').trim().toLowerCase() === c.customerName.toLowerCase()
    ),
    issues: issues.filter(
      (iss) => (iss.customerName || '').trim().toLowerCase() === c.customerName.toLowerCase()
    ),
    totalRaised: c.totalIssues,
    pendingCount: c.pendingCount,
    underReviewCount: c.underReviewCount,
    resolvedCount: c.resolvedCount,
    totalDisputedAmount: c.totalDisputedAmount,
  }));
};

/**
 * Computes overall progress statistics for executive KPI cards and charts
 */
export const computeIssuesProgressStats = (issues: DocumentIssueRecord[]) => {
  const total = issues.length;
  const pending = issues.filter((i) => i.status === 'PENDING').length;
  const underReview = issues.filter((i) => i.status === 'UNDER_REVIEW').length;
  const resolved = issues.filter((i) => i.status === 'RESOLVED').length;

  const totalDisputed = issues.reduce((s, i) => s + (i.disputedAmount || 0), 0);
  const pendingDisputed = issues
    .filter((i) => i.status === 'PENDING')
    .reduce((s, i) => s + (i.disputedAmount || 0), 0);
  const reviewDisputed = issues
    .filter((i) => i.status === 'UNDER_REVIEW')
    .reduce((s, i) => s + (i.disputedAmount || 0), 0);
  const resolvedDisputed = issues
    .filter((i) => i.status === 'RESOLVED')
    .reduce((s, i) => s + (i.disputedAmount || 0), 0);

  const pctPending = total > 0 ? Math.round((pending / total) * 100) : 0;
  const pctReview = total > 0 ? Math.round((underReview / total) * 100) : 0;
  const pctResolved = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const typeCounts: Record<string, number> = {};
  issues.forEach((iss) => {
    const cleanTitle = getCleanIssueTitle(iss);
    typeCounts[cleanTitle] = (typeCounts[cleanTitle] || 0) + 1;
  });

  const severityCounts = {
    CRITICAL: issues.filter((i) => i.severity === 'CRITICAL').length,
    HIGH: issues.filter((i) => i.severity === 'HIGH').length,
    MEDIUM: issues.filter((i) => i.severity === 'MEDIUM').length,
    LOW: issues.filter((i) => i.severity === 'LOW').length,
  };

  return {
    total,
    pending,
    underReview,
    resolved,
    pctPending,
    pctReview,
    pctResolved,
    totalDisputed,
    pendingDisputed,
    reviewDisputed,
    resolvedDisputed,
    typeCounts,
    severityCounts,
  };
};

/**
 * Helper to draw a multi-colored segmented resolution progress bar in jsPDF
 */
const drawSegmentedBar = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  resolved: number,
  review: number,
  pending: number,
  total: number
) => {
  doc.setFillColor(226, 232, 240); // slate-200 background track
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  if (total <= 0) return;

  let curX = x;
  // Resolved (Emerald Green)
  const resW = (resolved / total) * width;
  if (resW > 0) {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(curX, y, resW, height, 1.5, 1.5, 'F');
    curX += resW;
  }
  // Review (Vibrant Blue)
  const revW = (review / total) * width;
  if (revW > 0) {
    doc.setFillColor(59, 130, 246);
    doc.rect(curX, y, revW, height, 'F');
    curX += revW;
  }
  // Pending (Warm Amber)
  const pendW = (pending / total) * width;
  if (pendW > 0) {
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(curX, y, pendW, height, 1.5, 1.5, 'F');
  }
};

/**
 * Generates ASCII/Block progress bar representation for Excel spreadsheet
 */
const generateBlockProgressBar = (pct: number, length = 20): string => {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${clamped}%`;
};

/**
 * Exports Detailed Customer Grouped Invoices, Lines & Issues Report to Excel
 */
export const exportDetailedCustomerIssuesExcel = ({
  issues,
  invoices,
  activeFilters,
}: DetailedReportExportOptions) => {
  try {
    const workbook = XLSX.utils.book_new();
    const stats = computeIssuesProgressStats(issues);
    const customerGroups = buildCustomerGroupedInvoicesData(issues, invoices);

    const filterParts: string[] = [];
    if (activeFilters?.status && activeFilters.status !== 'ALL') filterParts.push(`Status: ${activeFilters.status}`);
    if (activeFilters?.severity && activeFilters.severity !== 'ALL') filterParts.push(`Severity: ${activeFilters.severity}`);
    if (activeFilters?.customer && activeFilters.customer !== 'ALL') filterParts.push(`Customer: ${activeFilters.customer}`);
    if (activeFilters?.po && activeFilters.po !== 'ALL') filterParts.push(`PO: ${activeFilters.po}`);
    if (activeFilters?.issueType && activeFilters.issueType !== 'ALL') filterParts.push(`Type: ${activeFilters.issueType}`);
    if (activeFilters?.searchTerm) filterParts.push(`Search: "${activeFilters.searchTerm}"`);
    const filterSummary = filterParts.length > 0 ? filterParts.join(' | ') : 'All Issues (No Filters Applied)';

    // ==========================================
    // Sheet 1: Customer Progress Charts & Issue Status Grouped by Customer
    // ==========================================
    const progressSheetData: any[][] = [
      ['FAMOLA FBI - OPERATIONAL ISSUES RESOLUTION & AUDIT REPORT'],
      [`Generated: ${new Date().toLocaleString()} • Currency: Tanzanian Shillings (TZS)`],
      [`Active Filters: ${filterSummary}`],
      [],
      ['1. EXECUTIVE RESOLUTION KPI SUMMARY'],
      [
        'Total Issues Audited',
        'Raised (Pending Action)',
        'Working On It (In Review)',
        'Resolved & Cleared',
        'Overall Clearance Rate',
        'Total Disputed Exposure (TZS)',
      ],
      [
        stats.total,
        `${stats.pending} (${stats.pctPending}%)`,
        `${stats.underReview} (${stats.pctReview}%)`,
        `${stats.resolved} (${stats.pctResolved}%)`,
        `${stats.pctResolved}%`,
        stats.totalDisputed,
      ],
      [],
      ['2. RESOLUTION CLEARANCE PROGRESS & STAGE BREAKDOWN'],
      [
        'Stage',
        'Issue Count',
        'Share (%)',
        'Progress Bar Visual',
        'Disputed Value (TZS)',
        'Stage Description',
      ],
      [
        '1. Raised (Pending)',
        stats.pending,
        `${stats.pctPending}%`,
        generateBlockProgressBar(stats.pctPending, 25),
        stats.pendingDisputed,
        'Issue open, awaiting worker review',
      ],
      [
        '2. Working On It (In Review)',
        stats.underReview,
        `${stats.pctReview}%`,
        generateBlockProgressBar(stats.pctReview, 25),
        stats.reviewDisputed,
        'Investigation underway, audit notes logged',
      ],
      [
        '3. Resolved & Cleared',
        stats.resolved,
        `${stats.pctResolved}%`,
        generateBlockProgressBar(stats.pctResolved, 25),
        stats.resolvedDisputed,
        'Discrepancy corrected and approved closed',
      ],
      [],
      ['3. ISSUE STATUS GROUPED BY CUSTOMER (SUMMARY & PROGRESS CHARTS)'],
      [
        'Customer Name',
        'Total Issues',
        'Raised / Pending',
        'On Review (Work On It)',
        'Resolved',
        'Clearance %',
        'Progress Bar Graphic',
        'Disputed Amount (TZS)',
        'Resolution Status',
      ],
    ];

    customerGroups.forEach((cust) => {
      progressSheetData.push([
        cust.customerName,
        cust.totalIssues,
        cust.pendingCount,
        cust.underReviewCount,
        cust.resolvedCount,
        `${cust.pctResolved}%`,
        generateBlockProgressBar(cust.pctResolved, 20),
        cust.totalDisputedAmount,
        cust.pctResolved === 100
          ? 'CLEARED'
          : cust.resolvedCount > 0 || cust.underReviewCount > 0
          ? 'IN REVIEW'
          : 'RAISED',
      ]);
    });

    // Summary Total Row
    progressSheetData.push([
      'TOTAL PORTFOLIO',
      stats.total,
      stats.pending,
      stats.underReview,
      stats.resolved,
      `${stats.pctResolved}%`,
      generateBlockProgressBar(stats.pctResolved, 20),
      stats.totalDisputed,
      stats.pctResolved === 100 ? 'ALL CLEARED' : 'ACTION REQUIRED',
    ]);

    const progressWs = XLSX.utils.aoa_to_sheet(progressSheetData);
    progressWs['!cols'] = [
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 22 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(workbook, progressWs, 'Customer_Progress_&_Charts');

    // ==========================================
    // Sheet 2: Customer Grouped Invoices, Lines & Resolution Charts
    // ==========================================
    const custSheetData: any[][] = [
      ['FAMOLA FBI - CUSTOMER-GROUPED INVOICES & RESOLUTION AUDIT'],
      [`Exported: ${new Date().toLocaleString()} • Detailed Hierarchical View`],
      [],
    ];

    customerGroups.forEach((cust) => {
      custSheetData.push([
        `CUSTOMER: ${cust.customerName.toUpperCase()}`,
        `Invoices: ${cust.invoices.length}`,
        `Total Issues: ${cust.totalIssues}`,
        `Pending: ${cust.pendingCount}`,
        `In Review: ${cust.underReviewCount}`,
        `Resolved: ${cust.resolvedCount} (${cust.pctResolved}%)`,
        `Disputed: TZS ${cust.totalDisputedAmount}`,
      ]);

      cust.invoices.forEach((inv) => {
        custSheetData.push([]);
        custSheetData.push([
          `>> INVOICE #${inv.invoiceNumber}`,
          `PO: ${inv.poNumber}`,
          `Invoice Value: TZS ${inv.totalAmount || 0}`,
          `Disputed: TZS ${inv.disputedAmount}`,
          `Status: ${inv.resolutionStats.primaryStatus}`,
          `Clearance: ${inv.resolutionStats.pctResolved}%`,
        ]);

        custSheetData.push([
          'Line #',
          'Item Description',
          'UOM',
          'PO Qty',
          'Billed Qty',
          'Deliv Qty',
          'Disc Qty',
          'Unit Price (TZS)',
          'Line Total (TZS)',
          'Discrepancy / Issue Reason',
          'Worker Note',
          'Status',
        ]);

        inv.lines.forEach((line, lIdx) => {
          custSheetData.push([
            lIdx + 1,
            line.itemDescription,
            line.unitOfMeasure,
            line.poQuantity,
            line.billedQuantity,
            line.deliveredQuantity,
            line.discrepancyQuantity,
            line.unitPrice,
            line.lineTotal,
            line.discrepancyReason,
            line.workerNote,
            line.status,
          ]);
        });

        // Below Invoice: Resolution Chart & Metrics Row
        custSheetData.push([
          `[RESOLUTION CHART]`,
          `Resolution Progress: ${generateBlockProgressBar(inv.resolutionStats.pctResolved, 20)}`,
          `Status: ${inv.resolutionStats.primaryStatus}`,
          `Issues: ${inv.resolutionStats.resolved}/${inv.resolutionStats.total} Resolved`,
          `Disputed: TZS ${inv.disputedAmount}`,
          `Step 1: Raised [DONE] -> Step 2: Review [${inv.resolutionStats.underReview > 0 || inv.resolutionStats.resolved > 0 ? 'ACTIVE' : 'PENDING'}] -> Step 3: Resolved [${inv.resolutionStats.primaryStatus === 'RESOLVED' ? 'CLEARED' : 'PENDING'}]`,
        ]);

        if (inv.comments && inv.comments.length > 0) {
          inv.comments.forEach((c) => {
            custSheetData.push([
              '  * Audit Note:',
              `${c.author} (${c.date || 'N/A'}): "${c.comment}"`,
            ]);
          });
        }
      });

      custSheetData.push([]);
      custSheetData.push(['-------------------------------------------------------------------------------------------------------------']);
      custSheetData.push([]);
    });

    const custWs = XLSX.utils.aoa_to_sheet(custSheetData);
    custWs['!cols'] = [
      { wch: 22 },
      { wch: 35 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 18 },
      { wch: 30 },
      { wch: 26 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, custWs, 'Customer_Grouped_Invoices');

    // ==========================================
    // Sheet 3: Master List of Operational Issues
    // ==========================================
    const masterSheetData: any[][] = [
      ['FAMOLA FBI - MASTER LIST OF OPERATIONAL ISSUES'],
      [`Exported: ${new Date().toLocaleString()} • Active Filter: ${filterSummary}`],
      [],
      [
        'S/N',
        'Issue ID',
        'Invoice / Ref #',
        'PO Number',
        'Customer',
        'Discrepancy Qty',
        'Issue Description / Reason',
        'Status',
        'Severity',
        'Disputed (TZS)',
        'Flagged By',
        'Date Flagged',
      ],
    ];

    issues.forEach((iss, idx) => {
      masterSheetData.push([
        idx + 1,
        getIssueTrackingNumber(iss),
        iss.referenceNumber || 'N/A',
        iss.poNumber || 'N/A',
        iss.customerName || 'General',
        getIssueTotalQty(iss) > 0 ? getIssueTotalQty(iss) : '-',
        getCleanIssueTitle(iss),
        iss.status === 'PENDING' ? 'Raised' : iss.status === 'UNDER_REVIEW' ? 'Work On It' : 'Resolved',
        iss.severity,
        iss.disputedAmount || 0,
        iss.flaggedBy || 'System',
        iss.flaggedAt ? new Date(iss.flaggedAt).toLocaleDateString() : 'N/A',
      ]);
    });

    const masterWs = XLSX.utils.aoa_to_sheet(masterSheetData);
    masterWs['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 30 },
      { wch: 16 },
      { wch: 36 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, masterWs, 'Master_List_of_Issues');

    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `detailed_issues_report_${dateStamp}.xlsx`);
  } catch (err) {
    console.error('Failed to export detailed issues excel:', err);
    alert('Failed to generate Excel report. Please check console.');
  }
};

/**
 * Exports Detailed Issues Report with Master List, Customer Grouped Invoices,
 * and Below-Invoice Resolution Charts to a Colorful PDF
 */
export const exportDetailedCustomerIssuesPdf = ({
  issues,
  invoices,
  activeFilters,
}: DetailedReportExportOptions) => {
  try {
    const stats = computeIssuesProgressStats(issues);
    const customerGroups = buildCustomerGroupedInvoicesData(issues, invoices);

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Active filters summary
    const filterParts: string[] = [];
    if (activeFilters?.status && activeFilters.status !== 'ALL') filterParts.push(`Status: ${activeFilters.status}`);
    if (activeFilters?.severity && activeFilters.severity !== 'ALL') filterParts.push(`Severity: ${activeFilters.severity}`);
    if (activeFilters?.customer && activeFilters.customer !== 'ALL') filterParts.push(`Customer: ${activeFilters.customer}`);
    if (activeFilters?.po && activeFilters.po !== 'ALL') filterParts.push(`PO: ${activeFilters.po}`);
    if (activeFilters?.issueType && activeFilters.issueType !== 'ALL') filterParts.push(`Type: ${activeFilters.issueType}`);
    if (activeFilters?.searchTerm) filterParts.push(`Search: "${activeFilters.searchTerm}"`);
    const filterSummary = filterParts.length > 0 ? filterParts.join(' • ') : 'Showing All Operational Issues (No Filter)';

    // ==========================================
    // Page 1: Header Banner & Executive Progress Summary
    // ==========================================
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 52, 'F');

    // Accent line below banner
    doc.setFillColor(99, 102, 241); // indigo-500
    doc.rect(0, 52, pageWidth, 3, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('FAMOLA FBI - OPERATIONAL ISSUES RESOLUTION & AUDIT REPORT', 24, 23);

    // Subtitle & Filter metadata
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Generated: ${new Date().toLocaleString()} • Currency: Tanzanian Shillings (TZS) • Filter: ${filterSummary}`,
      24,
      41
    );

    // ==========================================
    // Executive Summary Progress KPI Cards (Colour Full)
    // ==========================================
    const cardY = 64;
    const cardWidth = (pageWidth - 48 - 36) / 4;
    const cardHeight = 44;

    // Card 1: Total Audited (Slate/Indigo)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(24, cardY, cardWidth, cardHeight, 5, 5, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL ISSUES AUDITED', 32, cardY + 14);
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(String(stats.total), 32, cardY + 34);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`TZS ${formatCurrency(stats.totalDisputed)}`, 32 + 36, cardY + 34);

    // Card 2: Raised / Pending (Warm Amber)
    const card2X = 24 + cardWidth + 12;
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(card2X, cardY, cardWidth, cardHeight, 5, 5, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('RAISED (PENDING ACTION)', card2X + 10, cardY + 14);
    doc.setFontSize(15);
    doc.setTextColor(180, 83, 9);
    doc.text(`${stats.pending}`, card2X + 10, cardY + 34);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(146, 64, 14);
    doc.text(`(${stats.pctPending}%) • TZS ${formatCurrency(stats.pendingDisputed)}`, card2X + 38, cardY + 34);

    // Card 3: Working On It (Vibrant Blue)
    const card3X = card2X + cardWidth + 12;
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(59, 130, 246);
    doc.roundedRect(card3X, cardY, cardWidth, cardHeight, 5, 5, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('WORKING ON IT (IN REVIEW)', card3X + 10, cardY + 14);
    doc.setFontSize(15);
    doc.setTextColor(29, 78, 216);
    doc.text(`${stats.underReview}`, card3X + 10, cardY + 34);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 64, 175);
    doc.text(`(${stats.pctReview}%) • TZS ${formatCurrency(stats.reviewDisputed)}`, card3X + 38, cardY + 34);

    // Card 4: Resolved & Cleared (Fresh Emerald Green)
    const card4X = card3X + cardWidth + 12;
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(card4X, cardY, cardWidth, cardHeight, 5, 5, 'FD');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text('RESOLVED & CLEARED', card4X + 10, cardY + 14);
    doc.setFontSize(15);
    doc.setTextColor(4, 120, 87);
    doc.text(`${stats.resolved}`, card4X + 10, cardY + 34);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(6, 95, 70);
    doc.text(`(${stats.pctResolved}%) • TZS ${formatCurrency(stats.resolvedDisputed)}`, card4X + 38, cardY + 34);

    // ==========================================
    // Summary Progress Bar Graphic
    // ==========================================
    const progY = cardY + cardHeight + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('OVERALL RESOLUTION PROGRESS & STATUS CLEARANCE RATE:', 24, progY + 8);

    const totalBarW = pageWidth - 48;
    const barHeight = 12;
    const barTop = progY + 13;
    doc.setFillColor(226, 232, 240); // slate-200 background track
    doc.roundedRect(24, barTop, totalBarW, barHeight, 3, 3, 'F');

    if (stats.total > 0) {
      let curX = 24;
      // Resolved segment (Green)
      const resW = (stats.resolved / stats.total) * totalBarW;
      if (resW > 0) {
        doc.setFillColor(16, 185, 129);
        doc.roundedRect(curX, barTop, resW, barHeight, 2, 2, 'F');
        if (resW > 40) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(`Resolved ${stats.pctResolved}%`, curX + 4, barTop + 8.5);
        }
        curX += resW;
      }

      // In Review segment (Blue)
      const revW = (stats.underReview / stats.total) * totalBarW;
      if (revW > 0) {
        doc.setFillColor(59, 130, 246);
        doc.rect(curX, barTop, revW, barHeight, 'F');
        if (revW > 40) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(`Review ${stats.pctReview}%`, curX + 4, barTop + 8.5);
        }
        curX += revW;
      }

      // Raised segment (Amber)
      const pendW = (stats.pending / stats.total) * totalBarW;
      if (pendW > 0) {
        doc.setFillColor(245, 158, 11);
        doc.roundedRect(curX, barTop, pendW, barHeight, 2, 2, 'F');
        if (pendW > 40) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(`Raised ${stats.pctPending}%`, curX + 4, barTop + 8.5);
        }
      }
    }

    // Progress Legend
    const legY = barTop + barHeight + 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    doc.setFillColor(16, 185, 129);
    doc.rect(24, legY - 5, 8, 6, 'F');
    doc.setTextColor(4, 120, 87);
    doc.text(`Resolved: ${stats.resolved} (${stats.pctResolved}%)`, 36, legY);

    doc.setFillColor(59, 130, 246);
    doc.rect(170, legY - 5, 8, 6, 'F');
    doc.setTextColor(29, 78, 216);
    doc.text(`Working On It: ${stats.underReview} (${stats.pctReview}%)`, 182, legY);

    doc.setFillColor(245, 158, 11);
    doc.rect(340, legY - 5, 8, 6, 'F');
    doc.setTextColor(180, 83, 9);
    doc.text(`Raised / Pending: ${stats.pending} (${stats.pctPending}%)`, 352, legY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Clearance Ratio: ${stats.pctResolved}% Complete • Disputed: TZS ${formatCurrency(stats.totalDisputed)}`, 540, legY);

    // ==========================================
    // Page 1: Customer Progress Charts & Issue Status Grouped by Customer
    // (Only charts and graphs for issue status grouped by customer)
    // ==========================================
    const custTableStartY = legY + 14;

    // Section Header Banner
    doc.setFillColor(30, 41, 59); // slate-800
    doc.roundedRect(24, custTableStartY, pageWidth - 48, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('CUSTOMER ISSUE RESOLUTION STATUS & PERFORMANCE CHARTS', 34, custTableStartY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Grouped by Customer • Total Clients Audited: ${customerGroups.length} • Breakdown: Raised / On Review / Resolved`,
      pageWidth - 365,
      custTableStartY + 14
    );

    const custHeaders = [
      'Customer Name',
      'Total Issues',
      'Raised (Pending)',
      'On Review (Work On It)',
      'Resolved',
      'Clearance Progress Chart',
      'Total Disputed (TZS)',
      'Status',
    ];

    const custRows = customerGroups.map((cust) => {
      const statusLabel =
        cust.pctResolved === 100
          ? 'CLEARED'
          : cust.resolvedCount > 0 || cust.underReviewCount > 0
          ? 'IN REVIEW'
          : 'RAISED';

      const pctPending = Math.round((cust.pendingCount / (cust.totalIssues || 1)) * 100);
      const pctReview = Math.round((cust.underReviewCount / (cust.totalIssues || 1)) * 100);

      return [
        cust.customerName,
        String(cust.totalIssues),
        `${cust.pendingCount} (${pctPending}%)`,
        `${cust.underReviewCount} (${pctReview}%)`,
        `${cust.resolvedCount} (${cust.pctResolved}%)`,
        `${cust.pctResolved}%`, // will be rendered as segmented bar in didDrawCell
        formatCurrency(cust.totalDisputedAmount),
        statusLabel,
      ];
    });

    const custFoot = [
      [
        'TOTAL AUDITED PORTFOLIO',
        String(stats.total),
        `${stats.pending} (${stats.pctPending}%)`,
        `${stats.underReview} (${stats.pctReview}%)`,
        `${stats.resolved} (${stats.pctResolved}%)`,
        `${stats.pctResolved}%`,
        formatCurrency(stats.totalDisputed),
        stats.pctResolved === 100 ? 'ALL CLEARED' : 'ACTION REQUIRED',
      ],
    ];

    autoTable(doc, {
      startY: custTableStartY + 28,
      head: [custHeaders],
      body: custRows,
      foot: custFoot,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 4,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [30, 41, 59], // slate-800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      footStyles: {
        fillColor: [241, 245, 249], // slate-100
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 170, fontStyle: 'bold' },
        1: { cellWidth: 55, halign: 'center' },
        2: { cellWidth: 85, halign: 'center' },
        3: { cellWidth: 95, halign: 'center' },
        4: { cellWidth: 80, halign: 'center' },
        5: { cellWidth: 135 },
        6: { cellWidth: 95, halign: 'right' },
        7: { cellWidth: 79, halign: 'center' },
      },
      margin: { left: 24, right: 24, bottom: 25 },
      didParseCell: (data) => {
        // Pending column (index 2)
        if (data.section === 'body' && data.column.index === 2) {
          data.cell.styles.textColor = [180, 83, 9]; // amber-700
          data.cell.styles.fontStyle = 'bold';
        }
        // Review column (index 3)
        if (data.section === 'body' && data.column.index === 3) {
          data.cell.styles.textColor = [29, 78, 216]; // blue-700
          data.cell.styles.fontStyle = 'bold';
        }
        // Resolved column (index 4)
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = [4, 120, 87]; // emerald-700
          data.cell.styles.fontStyle = 'bold';
        }
        // Status column (index 7)
        if (data.section === 'body' && data.column.index === 7) {
          const val = String(data.cell.raw);
          if (val === 'CLEARED') {
            data.cell.styles.textColor = [4, 120, 87];
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'IN REVIEW') {
            data.cell.styles.textColor = [29, 78, 216];
            data.cell.styles.fillColor = [239, 246, 255];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [180, 83, 9];
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawCell: (data) => {
        // Draw visual segmented progress bar in column 5!
        if ((data.section === 'body' || data.section === 'foot') && data.column.index === 5) {
          const isFoot = data.section === 'foot';
          const resolved = isFoot ? stats.resolved : customerGroups[data.row.index]?.resolvedCount || 0;
          const review = isFoot ? stats.underReview : customerGroups[data.row.index]?.underReviewCount || 0;
          const pending = isFoot ? stats.pending : customerGroups[data.row.index]?.pendingCount || 0;
          const total = isFoot ? stats.total : customerGroups[data.row.index]?.totalIssues || 1;
          const pct = isFoot ? stats.pctResolved : customerGroups[data.row.index]?.pctResolved || 0;

          const cell = data.cell;
          const barW = cell.width - 45;
          const barH = 8;
          const barX = cell.x + 4;
          const barY = cell.y + (cell.height - barH) / 2;

          drawSegmentedBar(doc, barX, barY, barW, barH, resolved, review, pending, total);

          // Draw percentage text next to bar
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(30, 41, 59);
          doc.text(`${pct}%`, cell.x + cell.width - 38, cell.y + (cell.height / 2) + 2.5);
        }
      },
    });

    // ==========================================
    // Page 2 onwards: Full List of Issues Arranged by Customer
    // with Expanded Invoice Lines & Below-Invoice Resolution Charts
    // ==========================================
    doc.addPage('a4', 'landscape');

    let currentY = 24;

    // Section Master Banner
    doc.setFillColor(30, 27, 75); // indigo-950
    doc.roundedRect(24, currentY, pageWidth - 48, 30, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('FULL LIST OF OPERATIONAL ISSUES & INVOICES (ARRANGED BY CUSTOMER)', 36, currentY + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(199, 210, 254);
    doc.text(`Total Customers with Discrepancies: ${customerGroups.length}`, pageWidth - 200, currentY + 18);
    currentY += 40;

    customerGroups.forEach((cust, cIdx) => {
      // Check if space for customer header
      if (currentY + 120 > pageHeight - 35) {
        doc.addPage('a4', 'landscape');
        currentY = 28;
      }

      // Customer Header Banner
      doc.setFillColor(67, 56, 202); // indigo-700
      doc.roundedRect(24, currentY, pageWidth - 48, 26, 3, 3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`CUSTOMER #${cIdx + 1}: ${cust.customerName.toUpperCase()}`, 34, currentY + 17);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(224, 231, 255);
      doc.text(
        `Invoices: ${cust.invoices.length}  |  Issues: ${cust.totalIssues}  |  Resolved: ${cust.resolvedCount} (${cust.pctResolved}%)  |  Disputed: TZS ${formatCurrency(cust.totalDisputedAmount)}`,
        pageWidth - 360,
        currentY + 17
      );

      currentY += 32;

      // Iterate through each invoice under this customer
      cust.invoices.forEach((inv, iIdx) => {
        // Ensure space for invoice header + table head
        if (currentY + 100 > pageHeight - 35) {
          doc.addPage('a4', 'landscape');
          currentY = 28;
        }

        // Invoice Header Box
        doc.setFillColor(241, 245, 249); // slate-100
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(24, currentY, pageWidth - 48, 24, 3, 3, 'FD');

        // Left blue vertical accent strip
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(24, currentY, 4, 24, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`INVOICE: ${inv.invoiceNumber}`, 34, currentY + 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`PO: ${inv.poNumber}`, 160, currentY + 15);
        doc.text(`Total Value: TZS ${formatCurrency(inv.totalAmount || 0)}`, 270, currentY + 15);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 83, 9);
        doc.text(`Disputed Value: TZS ${formatCurrency(inv.disputedAmount || 0)}`, 430, currentY + 15);

        // Status badge pill on right
        const statusPillW = 75;
        const statusPillX = pageWidth - 24 - statusPillW - 8;
        if (inv.resolutionStats.primaryStatus === 'RESOLVED') {
          doc.setFillColor(209, 250, 229); // emerald-100
          doc.roundedRect(statusPillX, currentY + 4, statusPillW, 16, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(4, 120, 87);
          doc.text('RESOLVED', statusPillX + 16, currentY + 15);
        } else if (inv.resolutionStats.primaryStatus === 'UNDER_REVIEW') {
          doc.setFillColor(219, 234, 254); // blue-100
          doc.roundedRect(statusPillX, currentY + 4, statusPillW, 16, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(29, 78, 216);
          doc.text('WORK ON IT', statusPillX + 14, currentY + 15);
        } else {
          doc.setFillColor(254, 243, 199); // amber-100
          doc.roundedRect(statusPillX, currentY + 4, statusPillW, 16, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(180, 83, 9);
          doc.text('RAISED', statusPillX + 22, currentY + 15);
        }

        currentY += 28;

        // Invoice Line Items & Discrepancy Table
        const invoiceLineHeaders = [
          'Line #',
          'Item Description',
          'UOM',
          'PO Qty',
          'Invoiced Qty',
          'Deliv Qty',
          'Disc Qty',
          'Unit Price (TZS)',
          'Line Total (TZS)',
          'Discrepancy Reason / Finding',
          'Status',
        ];

        const invoiceLineRows = inv.lines.map((line, lIdx) => [
          String(lIdx + 1),
          line.itemDescription,
          line.unitOfMeasure,
          String(line.poQuantity),
          String(line.billedQuantity),
          String(line.deliveredQuantity),
          String(line.discrepancyQuantity),
          formatCurrency(line.unitPrice || 0),
          formatCurrency(line.lineTotal || 0),
          line.discrepancyReason,
          line.status === 'RESOLVED' ? 'Resolved' : line.status === 'UNDER_REVIEW' ? 'Work On It' : 'Raised',
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [invoiceLineHeaders],
          body: invoiceLineRows,
          theme: 'grid',
          styles: {
            fontSize: 6.5,
            cellPadding: 2.5,
            textColor: [30, 41, 59],
            overflow: 'linebreak',
          },
          headStyles: {
            fillColor: [51, 65, 85], // slate-700
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 150 },
            2: { cellWidth: 26, halign: 'center' },
            3: { cellWidth: 36, halign: 'right' },
            4: { cellWidth: 46, halign: 'right' },
            5: { cellWidth: 40, halign: 'right' },
            6: { cellWidth: 36, halign: 'right' },
            7: { cellWidth: 64, halign: 'right' },
            8: { cellWidth: 70, halign: 'right' },
            9: { cellWidth: 220 },
            10: { cellWidth: 55, halign: 'center' },
          },
          margin: { left: 24, right: 24, bottom: 25 },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 9) {
              const val = String(data.cell.raw).toLowerCase();
              if (val !== 'okay' && val !== 'normal' && val !== 'none') {
                data.cell.styles.textColor = [180, 83, 9];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            if (data.section === 'body' && data.column.index === 10) {
              const val = String(data.cell.raw);
              if (val === 'Resolved') {
                data.cell.styles.textColor = [4, 120, 87];
                data.cell.styles.fontStyle = 'bold';
              } else if (val === 'Work On It') {
                data.cell.styles.textColor = [29, 78, 216];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [180, 83, 9];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          },
        });

        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 60;

        // ==========================================
        // BELOW THE INVOICE: THE CHART RESOLVING THE ISSUE
        // ==========================================
        const chartBoxHeight = inv.comments && inv.comments.length > 0 ? 94 : 64;

        if (currentY + chartBoxHeight > pageHeight - 30) {
          doc.addPage('a4', 'landscape');
          currentY = 28;
        }

        // Chart Container Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(24, currentY, pageWidth - 48, chartBoxHeight, 4, 4, 'FD');

        // Chart Header Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`CHART: RESOLUTION STATUS & AUDIT CLEARANCE FOR INVOICE #${inv.invoiceNumber}`, 34, currentY + 13);

        // Chart Component 1: Segmented Progress Clearance Bar
        const barX = 34;
        const barY = currentY + 20;
        const invBarWidth = 280;
        const invBarH = 12;

        doc.setFillColor(226, 232, 240);
        doc.roundedRect(barX, barY, invBarWidth, invBarH, 2, 2, 'F');

        if (inv.resolutionStats.total > 0) {
          let bCurX = barX;
          const rW = (inv.resolutionStats.resolved / inv.resolutionStats.total) * invBarWidth;
          if (rW > 0) {
            doc.setFillColor(16, 185, 129);
            doc.roundedRect(bCurX, barY, rW, invBarH, 2, 2, 'F');
            bCurX += rW;
          }
          const uW = (inv.resolutionStats.underReview / inv.resolutionStats.total) * invBarWidth;
          if (uW > 0) {
            doc.setFillColor(59, 130, 246);
            doc.rect(bCurX, barY, uW, invBarH, 'F');
            bCurX += uW;
          }
          const pW = (inv.resolutionStats.pending / inv.resolutionStats.total) * invBarWidth;
          if (pW > 0) {
            doc.setFillColor(245, 158, 11);
            doc.roundedRect(bCurX, barY, pW, invBarH, 2, 2, 'F');
          }
        }

        // Bar Text Label below bar
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text(
          `${inv.resolutionStats.pctResolved}% Cleared (${inv.resolutionStats.resolved}/${inv.resolutionStats.total} Issues Resolved) • Pending: ${inv.resolutionStats.pending} • In Review: ${inv.resolutionStats.underReview}`,
          barX,
          barY + invBarH + 9
        );

        // Chart Component 2: 3-Stage Resolution Lifecycle Pipeline (Visual Step Graphic)
        const pipeStartX = 340;
        const pipeCenterY = currentY + 26;

        // Stage 1: Flagged
        doc.setFillColor(245, 158, 11); // amber
        doc.circle(pipeStartX, pipeCenterY, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text('1', pipeStartX - 1.5, pipeCenterY + 2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(180, 83, 9);
        doc.text('Stage 1: Raised', pipeStartX - 16, pipeCenterY + 14);

        // Connector 1 -> 2
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(1.5);
        doc.line(pipeStartX + 12, pipeCenterY, pipeStartX + 68, pipeCenterY);

        // Stage 2: Under Review
        const s2Active = inv.resolutionStats.underReview > 0 || inv.resolutionStats.resolved > 0;
        doc.setFillColor(s2Active ? 37 : 203, s2Active ? 99 : 213, s2Active ? 235 : 225);
        doc.circle(pipeStartX + 80, pipeCenterY, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text('2', pipeStartX + 80 - 1.5, pipeCenterY + 2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(s2Active ? 29 : 148, s2Active ? 78 : 163, s2Active ? 216 : 184);
        doc.text('Stage 2: Review', pipeStartX + 64, pipeCenterY + 14);

        // Connector 2 -> 3
        doc.setDrawColor(203, 213, 225);
        doc.line(pipeStartX + 92, pipeCenterY, pipeStartX + 148, pipeCenterY);

        // Stage 3: Resolved
        const s3Active = inv.resolutionStats.primaryStatus === 'RESOLVED';
        doc.setFillColor(s3Active ? 16 : 203, s3Active ? 185 : 213, s3Active ? 129 : 225);
        doc.circle(pipeStartX + 160, pipeCenterY, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text('3', pipeStartX + 160 - 1.5, pipeCenterY + 2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(s3Active ? 4 : 148, s3Active ? 120 : 163, s3Active ? 87 : 184);
        doc.text('Stage 3: Resolved', pipeStartX + 142, pipeCenterY + 14);

        // Chart Component 3: Summary Metric Pills
        const metricX = 570;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(metricX, currentY + 10, pageWidth - 48 - metricX + 16, 34, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Current Resolution Stage:', metricX + 8, currentY + 22);

        const currentStageLabel =
          inv.resolutionStats.primaryStatus === 'RESOLVED'
            ? 'Fully Resolved & Cleared (100%)'
            : inv.resolutionStats.primaryStatus === 'UNDER_REVIEW'
            ? 'Active Investigation (Working On It)'
            : 'Pending Staff Review (Raised)';

        doc.setTextColor(
          inv.resolutionStats.primaryStatus === 'RESOLVED'
            ? 4
            : inv.resolutionStats.primaryStatus === 'UNDER_REVIEW'
            ? 29
            : 180,
          inv.resolutionStats.primaryStatus === 'RESOLVED'
            ? 120
            : inv.resolutionStats.primaryStatus === 'UNDER_REVIEW'
            ? 78
            : 83,
          inv.resolutionStats.primaryStatus === 'RESOLVED'
            ? 87
            : inv.resolutionStats.primaryStatus === 'UNDER_REVIEW'
            ? 216
            : 9
        );
        doc.text(currentStageLabel, metricX + 8, currentY + 34);

        // Chart Component 4: Discussion comments trail (if any)
        if (inv.comments && inv.comments.length > 0) {
          const commentY = currentY + 50;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(51, 65, 85);
          doc.text(`Resolution Audit Trail & Comments (${inv.comments.length}):`, 34, commentY);

          inv.comments.slice(0, 2).forEach((c, cIdx) => {
            const rowY = commentY + 10 + cIdx * 10;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(71, 85, 105);
            doc.text(`[${c.author} • ${c.date || 'Recent'}]: `, 44, rowY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            const remark = c.comment.length > 130 ? c.comment.slice(0, 130) + '...' : c.comment;
            doc.text(`"${remark}"`, 160, rowY);
          });
        }

        currentY += chartBoxHeight + 14;
      });

      currentY += 8;
    });

    // Add page numbers on all pages
    const pageCount = (doc.internal as any).getNumberOfPages
      ? (doc.internal as any).getNumberOfPages()
      : (doc as any).internal.pages.length - 1;

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${i} of ${pageCount} • Famola FBI Issue Resolution & Quality Audit Report • Generated: ${new Date().toLocaleDateString()}`,
        24,
        pageHeight - 10
      );
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    doc.save(`detailed_issues_audit_report_${dateStamp}.pdf`);
  } catch (err) {
    console.error('Failed to export detailed issues PDF:', err);
    alert('Failed to generate PDF report. Please check console.');
  }
};
