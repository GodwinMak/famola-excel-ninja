import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PurchaseOrderGroup, 
  DeliveryNoteRecord, 
  DeliveryNoteLineItem, 
  POLineItem,
  CustomerSeriesBook,
  AppUser,
  DocumentAttachment,
  CallOfOrderLineAllocation,
  CallOfOrderStandingItem
} from '../types';
import { ImageAttachmentManager } from './ImageAttachmentManager';
import { 
  formatCurrency, 
  loadStoredSeriesConfig, 
  advanceSeriesNumber, 
  formatSeriesNumber,
  loadStoredCustomerSeriesBooks,
  saveOrUpdateCustomerSeriesBook,
  deleteCustomerSeriesBook,
  getCustomerSeriesBook,
  peekCustomerSeriesNumber,
  advanceCustomerSeriesNumber,
  getNextAvailableCustomerDeliveryNumber,
  groupPOsByNumber
} from '../utils/storage';
import { allocateSeriesNumber } from '../utils/seriesService';
import { deleteServerDeliveryNoteLine } from '../utils/databaseService';
import * as XLSX from 'xlsx';
import { generateSampleDeliveryNoteExcelTemplate } from '../utils/excelParser';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TableColumnHeader } from './TableColumnHeader';
import { TablePagination } from './TablePagination';
import { useTableSortAndFilter } from '../utils/useTableSortAndFilter';
import { 
  Truck, 
  Search, 
  Calendar, 
  CheckSquare, 
  Square, 
  Save, 
  Printer, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Building2, 
  RotateCcw, 
  Sparkles, 
  ChevronDown, 
  PlusCircle, 
  Plus,
  Minus,
  Edit3,
  ShieldAlert,
  FileSpreadsheet, 
  FileText,
  Package,
  MapPin,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  BookOpen,
  Ban,
  MessageSquare,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Database,
  Upload,
  Link2,
  Check
} from 'lucide-react';
import { DeliveryNotePrintModal } from './DeliveryNotePrintModal';
import { isAdminUser, canEditScreen, canDeleteData, canLoadDatabase } from '../utils/authService';
import { DeliveryDatabaseImportModal } from './DeliveryDatabaseImportModal';
import { naturalCompare } from '../utils/naturalSort';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { SmsConfirmationModal } from './SmsConfirmationModal';
import { CustomerNameLookupPanel } from './CustomerNameLookupPanel';
import { resolveCustomerDisplayName } from '../utils/customerNameRule';

/**
 * Universal comment color coding helper for delivery notes
 * Mirroring the invoice comment color scheme for rapid visual identification:
 * - Cancelled: rose/red (bg-rose-100 text-rose-800 border-rose-300)
 * - Issue / Discrepancy / Damage: amber/yellow (bg-amber-100 text-amber-900 border-amber-300)
 * - OFR (Out of Range): purple (bg-purple-100 text-purple-800 border-purple-300)
 * - Call of Order: blue (bg-blue-100 text-blue-800 border-blue-300)
 * - No PO: amber (bg-amber-100 text-amber-800 border-amber-200)
 * - Okay: emerald/green (bg-emerald-50 text-emerald-700 border-emerald-200)
 * - Custom note: indigo (bg-indigo-50 text-indigo-800 border-indigo-200)
 */
export const getDeliveryCommentColorStyle = (commentText?: string, isCancelled?: boolean, hasIssue?: boolean) => {
  const text = (commentText || '').trim();
  const lower = text.toLowerCase();

  if (isCancelled || lower.includes('cancel')) {
    return {
      bg: 'bg-rose-100',
      text: 'text-rose-800',
      border: 'border-rose-300',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      inputClass: 'bg-rose-50 border-rose-300 text-rose-900 font-bold focus:ring-rose-500',
      type: 'cancelled'
    };
  }
  if (hasIssue || lower.includes('issue') || lower.includes('discrepancy') || lower.includes('shortage') || lower.includes('damage') || lower.includes('reject')) {
    return {
      bg: 'bg-amber-100',
      text: 'text-amber-900',
      border: 'border-amber-300',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      inputClass: 'bg-amber-50 border-amber-300 text-amber-900 font-bold focus:ring-amber-500',
      type: 'issue'
    };
  }
  if (lower.includes('ofr') || lower.includes('out of range')) {
    return {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      border: 'border-purple-300',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
      inputClass: 'bg-purple-50 border-purple-300 text-purple-900 font-bold focus:ring-purple-500',
      type: 'ofr'
    };
  }
  if (lower.includes('call of order')) {
    return {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 font-bold',
      inputClass: 'bg-blue-50 border-blue-300 text-blue-900 font-bold focus:ring-blue-500',
      type: 'call_of_order'
    };
  }
  if (lower.includes('no po')) {
    return {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      border: 'border-amber-200',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 font-bold',
      inputClass: 'bg-amber-50 border-amber-200 text-amber-900 font-bold focus:ring-amber-500',
      type: 'no_po'
    };
  }
  if (lower === 'okay' || lower === 'ok') {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
      inputClass: 'bg-white border-slate-300 text-slate-800 focus:ring-blue-500',
      type: 'okay'
    };
  }
  if (text.length > 0) {
    return {
      bg: 'bg-indigo-50',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200 font-medium',
      inputClass: 'bg-indigo-50/40 border-indigo-300 text-indigo-950 font-medium focus:ring-indigo-500',
      type: 'custom'
    };
  }
  return {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
    inputClass: 'bg-white border-slate-300 text-slate-800 focus:ring-blue-500',
    type: 'default'
  };
};

export const renderDeliveryCommentBadge = (dn: DeliveryNoteRecord) => {
  const commentText = dn.comment || dn.notes || (dn.isCancelled ? 'Cancelled' : 'Okay');
  const style = getDeliveryCommentColorStyle(commentText, dn.isCancelled, dn.hasIssue);

  if (style.type === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 border border-rose-300 font-bold">
        <Ban className="w-3 h-3 text-rose-600 shrink-0" />
        <span>{commentText}</span>
      </span>
    );
  }
  if (style.type === 'issue') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-900 border border-amber-300 font-bold">
        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{commentText}</span>
      </span>
    );
  }
  if (style.type === 'ofr') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-purple-100 text-purple-800 border border-purple-200 font-bold">
        <span>{commentText}</span>
      </span>
    );
  }
  if (style.type === 'call_of_order') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 border border-blue-200 font-bold">
        <span>{commentText}</span>
      </span>
    );
  }
  if (style.type === 'no_po') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800 border border-amber-200 font-bold">
        <span>{commentText}</span>
      </span>
    );
  }
  if (style.type === 'okay') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>Okay</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-50 text-indigo-800 border border-indigo-200 font-medium">
      <MessageSquare className="w-3 h-3 text-indigo-600 shrink-0" />
      <span className="truncate max-w-[180px]">{commentText}</span>
    </span>
  );
};

export const renderDeliveryLineCommentBadge = (line: DeliveryNoteLineItem, dn: DeliveryNoteRecord) => {
  const lineText = line.comment || (line.hasIssue || dn.hasIssue ? 'Discrepancy' : 'Okay');
  const style = getDeliveryCommentColorStyle(lineText, dn.isCancelled, line.hasIssue || dn.hasIssue);

  if (style.type === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[10px]">
        <Ban className="w-3 h-3 text-rose-600 shrink-0" />
        <span>{lineText}</span>
      </span>
    );
  }
  if (style.type === 'issue') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">
        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{line.issueComment || dn.issueComment || lineText}</span>
      </span>
    );
  }
  if (style.type === 'ofr') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-bold text-[10px]">
        <span>{lineText}</span>
      </span>
    );
  }
  if (style.type === 'call_of_order') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[10px]">
        <span>{lineText}</span>
      </span>
    );
  }
  if (style.type === 'okay') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>Okay</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-medium text-[10px]">
      <MessageSquare className="w-3 h-3 text-indigo-500 shrink-0" />
      <span>{lineText}</span>
    </span>
  );
};

export interface ParsedCallOfOrderDetail {
  isStandingCallOfOrder?: boolean;
  isChildAllocation?: boolean;
  parentCallOfOrderId?: string;
  parentCallOfOrderNumber?: string;
  poNumber?: string;
  standingItems?: CallOfOrderStandingItem[];
  allocations?: CallOfOrderLineAllocation[];
}

export const buildNilCallOfOrderDeliveryLines = (dnId?: string): DeliveryNoteLineItem[] => [
  {
    id: dnId ? `coo-nil-${dnId}` : 'CALL-OF-ORDER-NIL-LINE',
    poLineId: 'CALL-OF-ORDER-NIL-LINE',
    itemDescription: 'Call of Order (Nil Delivery Record — Items tracked in Call of Order Table)',
    unitOfMeasure: 'NIL',
    poQuantity: 0,
    alreadyDeliveredQuantity: 0,
    availableQuantity: 0,
    deliveredQuantity: 0,
    unitCost: 0,
    unitPrice: 0,
    vatRate: 0.18,
    valueBeforeVat: 0,
    vatAmount: 0,
    valueAfterVat: 0,
    isSelected: true,
    comment: '[Call of Order]',
    hasIssue: true,
    issueComment: '[Call of Order] Nil record on Delivery Note — items & quantities tracked on Call of Order table',
  },
];

export const parseCallOfOrderDetail = (dn: DeliveryNoteRecord): ParsedCallOfOrderDetail | null => {
  if (!dn.callOfOrderDetail) return null;
  const raw = dn.callOfOrderDetail.trim();
  if (!raw.startsWith('{')) return null;
  try {
    return JSON.parse(raw) as ParsedCallOfOrderDetail;
  } catch {
    return null;
  }
};

export const hasDirectPoLinked = (dn: DeliveryNoteRecord): boolean => {
  const po = (dn.poNumber || '').trim().toLowerCase();
  if (!po) return false;
  if (
    po === 'n/a' ||
    po === 'none' ||
    po === 'pending' ||
    po.includes('call of order') ||
    po.includes('pending po') ||
    po.includes('no po') ||
    po.includes('n/a (') ||
    po.includes('flagged')
  ) {
    return false;
  }
  return true;
};

export const isCallOfOrderRecord = (dn: DeliveryNoteRecord): boolean => {
  const parsed = parseCallOfOrderDetail(dn);
  // Child allocation DNs have a PO linked and belong in Delivery Details, not Call of Order table
  if (parsed?.isChildAllocation || dn.parentCallOfOrderId) return false;

  // Requirement 1: Only Call of Order deliveries which have no PO directly linked on the delivery header are displayed in Call of Order table
  if (hasDirectPoLinked(dn)) return false;

  if (dn.isCallOfOrder) return true;
  if (dn.status === 'CALL_OF_ORDER') return true;
  if (parsed?.isStandingCallOfOrder) return true;
  const c = (dn.comment || '').toLowerCase();
  const n = (dn.notes || '').toLowerCase();
  const ic = (dn.issueComment || '').toLowerCase();
  const s = (dn.status || '').toLowerCase();
  return c.includes('call of order') || n.includes('call of order') || ic.includes('call of order') || s.includes('call of order');
};

export interface CallOfOrderLineUtilization {
  lineKey: string;
  lineIndex: number;
  line: DeliveryNoteLineItem;
  originalQty: number;
  assignedQty: number;
  remainingQty: number;
  utilizationPct: number;
  allocations: CallOfOrderLineAllocation[];
}

export interface CallOfOrderUtilizationSummary {
  lines: CallOfOrderLineUtilization[];
  allAllocations: CallOfOrderLineAllocation[];
  totalOriginalQty: number;
  totalAssignedQty: number;
  totalRemainingQty: number;
  overallPct: number;
  status: 'UNASSIGNED' | 'PARTIAL' | 'FULLY_UTILIZED';
  distinctChildDnNumbers: string[];
  distinctPoNumbers: string[];
}

export const getCallOfOrderUtilization = (
  dn: DeliveryNoteRecord,
  allDeliveryNotes: DeliveryNoteRecord[] = []
): CallOfOrderUtilizationSummary => {
  const parsed = parseCallOfOrderDetail(dn);
  const storedAllocations: CallOfOrderLineAllocation[] = [
    ...(parsed?.allocations || []),
    ...(dn.callOfOrderAllocations || []),
  ];

  // Deduplicate allocations by allocationId
  const allocMap = new Map<string, CallOfOrderLineAllocation>();
  storedAllocations.forEach((a) => {
    if (a && a.allocationId) {
      // Sync latest child DN number / PO number if child DN exists in allDeliveryNotes
      const childDn = allDeliveryNotes.find((d) => d.id === a.childDnId);
      allocMap.set(a.allocationId, {
        ...a,
        childDnNumber: childDn ? childDn.deliveryNoteNumber : a.childDnNumber,
        poNumber: childDn && hasDirectPoLinked(childDn) ? childDn.poNumber : a.poNumber,
      });
    }
  });

  const allAllocations = Array.from(allocMap.values());

  // Standing items come exclusively from callOfOrderDetail.standingItems (with backward-compatible fallback for legacy records)
  let sourceStandingItems: CallOfOrderStandingItem[] = Array.isArray(parsed?.standingItems)
    ? parsed!.standingItems!
    : [];

  if (sourceStandingItems.length === 0 && Array.isArray(dn.lines)) {
    const legacyLines = dn.lines.filter(
      (l) =>
        l.poLineId !== 'CALL-OF-ORDER-LINE' &&
        l.poLineId !== 'CALL-OF-ORDER-NIL-LINE' &&
        !(l.itemDescription || '').toLowerCase().includes('nil delivery record') &&
        Number(l.deliveredQuantity) > 0
    );
    sourceStandingItems = legacyLines.map((l, idx) => ({
      id: l.id || l.poLineId || `coo-item-${idx + 1}`,
      itemDescription: (l.itemDescription || '').trim(),
      unitOfMeasure: l.unitOfMeasure || 'PCS',
      callOfOrderQuantity: Number(l.deliveredQuantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      comment: l.comment || '[Call of Order]',
    }));
  }

  const lineUtilizations: CallOfOrderLineUtilization[] = sourceStandingItems.map((standingItem, idx) => {
    const lineKey = standingItem.id || `line-${idx}`;
    const lineDescClean = (standingItem.itemDescription || '').trim().toLowerCase();

    const lineAllocs = allAllocations.filter((a) => {
      if (
        a.cooLineId &&
        (a.cooLineId === lineKey ||
          a.cooLineId === standingItem.id ||
          a.cooLineId === `coo-${lineKey}`)
      ) {
        return true;
      }
      if (!a.cooLineId && a.cooItemDescription && a.cooItemDescription.trim().toLowerCase() === lineDescClean) {
        return true;
      }
      return false;
    });

    const originalQty = Math.max(0, Number(standingItem.callOfOrderQuantity) || 0);
    const assignedQty = Math.round(
      lineAllocs.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0) * 100
    ) / 100;
    const remainingQty = Math.max(0, Math.round((originalQty - assignedQty) * 100) / 100);
    const utilizationPct =
      originalQty > 0 ? Math.min(100, Math.round((assignedQty / originalQty) * 100)) : 0;

    const unitPrice = Number(standingItem.unitPrice) || 0;
    const valBefore = Math.round(originalQty * unitPrice * 100) / 100;
    const vatAmt = Math.round(valBefore * 0.18 * 100) / 100;
    const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

    const synthesizedLine: DeliveryNoteLineItem = {
      id: lineKey,
      poLineId: lineKey.startsWith('coo-') ? lineKey : `coo-${lineKey}`,
      itemDescription: standingItem.itemDescription || '',
      unitOfMeasure: standingItem.unitOfMeasure || 'PCS',
      poQuantity: 0,
      alreadyDeliveredQuantity: assignedQty,
      availableQuantity: remainingQty,
      deliveredQuantity: originalQty,
      unitPrice,
      vatRate: 0.18,
      valueBeforeVat: valBefore,
      vatAmount: vatAmt,
      valueAfterVat: valAfter,
      comment: standingItem.comment || '[Call of Order]',
      hasIssue: remainingQty > 0,
      callOfOrderAllocations: lineAllocs,
      assignedQuantity: assignedQty,
      remainingCallOfOrderQuantity: remainingQty,
    };

    return {
      lineKey,
      lineIndex: idx,
      line: synthesizedLine,
      originalQty,
      assignedQty,
      remainingQty,
      utilizationPct,
      allocations: lineAllocs,
    };
  });

  const totalOriginalQty = Math.round(
    lineUtilizations.reduce((sum, lu) => sum + lu.originalQty, 0) * 100
  ) / 100;
  const totalAssignedQty = Math.round(
    lineUtilizations.reduce((sum, lu) => sum + lu.assignedQty, 0) * 100
  ) / 100;
  const totalRemainingQty = Math.max(0, Math.round((totalOriginalQty - totalAssignedQty) * 100) / 100);
  const overallPct =
    totalOriginalQty > 0 ? Math.min(100, Math.round((totalAssignedQty / totalOriginalQty) * 100)) : 0;

  let status: 'UNASSIGNED' | 'PARTIAL' | 'FULLY_UTILIZED' = 'UNASSIGNED';
  if (totalOriginalQty > 0 && totalRemainingQty <= 0 && totalAssignedQty > 0) {
    status = 'FULLY_UTILIZED';
  } else if (totalAssignedQty > 0) {
    status = 'PARTIAL';
  }

  const distinctChildDnNumbers = Array.from(
    new Set(allAllocations.map((a) => a.childDnNumber).filter(Boolean))
  );
  const distinctPoNumbers = Array.from(
    new Set(allAllocations.map((a) => a.poNumber).filter(Boolean))
  );

  return {
    lines: lineUtilizations,
    allAllocations,
    totalOriginalQty,
    totalAssignedQty,
    totalRemainingQty,
    overallPct,
    status,
    distinctChildDnNumbers,
    distinctPoNumbers,
  };
};

interface DeliveryNotesManagerProps {
  deliveryNotes?: DeliveryNoteRecord[];
  poGroups?: PurchaseOrderGroup[];
  allPoLines?: POLineItem[];
  poLines?: POLineItem[]; // alias fallback
  onSaveDeliveryNote: (dn: DeliveryNoteRecord, secondaryDN?: DeliveryNoteRecord) => void;
  onDeleteDeliveryNote?: (dnId: string) => void;
  onNavigateToMatching?: () => void;
  onSeriesConfigChanged?: () => void;
  onViewIssuesTab?: () => void;
  currentUser?: AppUser;
  editingDeliveryNote?: DeliveryNoteRecord | null;
  onCancelEdit?: () => void;
  onReloadDeliveryNote?: (dn: DeliveryNoteRecord) => void;
  // Separate screen support: 'create' for Delivery (Issue Note), 'database' for Delivery Details, 'call_of_order' for Call of Order
  screenMode?: 'create' | 'database' | 'call_of_order';
  onNavigateScreen?: (mode: 'create' | 'database' | 'call_of_order') => void;
  onViewDeliveryDetails?: () => void;
  onCreateNewDelivery?: () => void;
  preselectedPoNumber?: string;
  onImportDeliveryNotes?: (deliveryNotes: DeliveryNoteRecord[], mode: 'append' | 'replace') => void;
}

export const DeliveryNotesManager: React.FC<DeliveryNotesManagerProps> = ({
  deliveryNotes = [],
  poGroups: passedPoGroups = [],
  allPoLines = [],
  poLines = [],
  onSaveDeliveryNote,
  onDeleteDeliveryNote,
  onNavigateToMatching = () => {},
  onSeriesConfigChanged,
  onViewIssuesTab,
  currentUser,
  editingDeliveryNote,
  onCancelEdit,
  onReloadDeliveryNote,
  screenMode,
  onNavigateScreen,
  onViewDeliveryDetails,
  onCreateNewDelivery,
  preselectedPoNumber,
  onImportDeliveryNotes,
}) => {
  const isAdmin = isAdminUser(currentUser);
  const canLoadDB = canLoadDatabase(currentUser);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [internalMode, setInternalMode] = useState<'create' | 'database' | 'call_of_order' | 'customer_lookup'>(screenMode || 'create');

  useEffect(() => {
    if (screenMode) {
      setInternalMode(screenMode);
    }
  }, [screenMode]);

  const viewMode = internalMode;

  const handleSwitchMode = (newMode: 'create' | 'database' | 'call_of_order' | 'customer_lookup') => {
    setInternalMode(newMode);
    if (newMode === 'create' || newMode === 'database') {
      if (onNavigateScreen) {
        onNavigateScreen(newMode);
      } else if (newMode === 'database' && onViewDeliveryDetails) {
        onViewDeliveryDetails();
      } else if (newMode === 'create' && onCreateNewDelivery) {
        onCreateNewDelivery();
      }
    }
  };

  // Accordion expansion state for delivery notes database (+)
  const [expandedDNIds, setExpandedDNIds] = useState<Set<string>>(new Set());
  const toggleExpandDN = (dnId: string) => {
    setExpandedDNIds((prev) => {
      const next = new Set(prev);
      if (next.has(dnId)) next.delete(dnId);
      else next.add(dnId);
      return next;
    });
  };

  // Edit Delivery Note modal state
  const [editingDNModal, setEditingDNModal] = useState<DeliveryNoteRecord | null>(null);
  const [editDNNumber, setEditDNNumber] = useState<string>('');
  const [editDNDate, setEditDNDate] = useState<string>('');
  const [editDNCarrier, setEditDNCarrier] = useState<string>('');
  const [editDNVehicle, setEditDNVehicle] = useState<string>('');
  const [editDNDriver, setEditDNDriver] = useState<string>('');
  const [editDNReceivedBy, setEditDNReceivedBy] = useState<string>('');
  const [editDNNotes, setEditDNNotes] = useState<string>('');
  const [editDNComment, setEditDNComment] = useState<string>('Okay');
  const [editDNFlagStatus, setEditDNFlagStatus] = useState<'ACTIVE' | 'FLAGGED' | 'CANCELLED' | 'OFR' | 'CALL_OF_ORDER'>('ACTIVE');
  const [editDNLines, setEditDNLines] = useState<any[]>([]);
  const [editDNError, setEditDNError] = useState<string | null>(null);

  // Admin permanent delete confirmation state for individual delivery note line item
  const [linePendingDelete, setLinePendingDelete] = useState<{
    deliveryNote: DeliveryNoteRecord;
    line: any;
    lineIndex: number;
    source: 'accordion' | 'modal';
  } | null>(null);

  const handleConfirmDeleteLine = () => {
    if (!linePendingDelete || !onSaveDeliveryNote) return;
    const { deliveryNote, lineIndex, source } = linePendingDelete;
    const updatedLines = [...(deliveryNote.lines || [])];
    const [deletedItem] = updatedLines.splice(lineIndex, 1);

    const totalDeliveredQuantity = updatedLines.reduce(
      (acc, l) => acc + (Number(l.deliveredQuantity) || 0),
      0
    );
    const totalDeliveredValue =
      Math.round(
        updatedLines.reduce((acc, l) => acc + (Number(l.valueAfterVat || (l.deliveredQuantity * l.unitPrice * 1.18)) || 0), 0) * 100
      ) / 100;

    const updatedRecord: DeliveryNoteRecord = {
      ...deliveryNote,
      lines: updatedLines,
      totalDeliveredQuantity,
      totalDeliveredValue,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
    };

    onSaveDeliveryNote(updatedRecord);

    if (deletedItem?.id || deletedItem?.poLineId) {
      deleteServerDeliveryNoteLine(deliveryNote.id, deletedItem.id || deletedItem.poLineId);
    }

    if (source === 'modal' && editingDNModal && editingDNModal.id === deliveryNote.id) {
      setEditingDNModal(updatedRecord);
      setEditDNLines(updatedLines);
    }

    setLinePendingDelete(null);
  };

  const handleOpenEditDN = (dn: DeliveryNoteRecord) => {
    setEditingDNModal(dn);
    setEditDNNumber(dn.deliveryNoteNumber);
    setEditDNDate(dn.deliveryDate || new Date().toISOString().split('T')[0]);
    setEditDNCarrier(dn.carrier || '');
    setEditDNVehicle(dn.vehicleNumber || '');
    setEditDNDriver(dn.driverName || '');
    setEditDNReceivedBy(dn.receivedBy || '');
    setEditDNNotes(dn.notes || '');
    setEditDNComment(dn.comment || 'Okay');
    let status: 'ACTIVE' | 'FLAGGED' | 'CANCELLED' | 'OFR' | 'CALL_OF_ORDER' = 'ACTIVE';
    if (dn.isCancelled || dn.status === 'CANCELLED') status = 'CANCELLED';
    else if (dn.isOfr || dn.status === 'OFR') status = 'OFR';
    else if (dn.status === 'CALL_OF_ORDER' || dn.issueComment?.includes('Call of Order')) status = 'CALL_OF_ORDER';
    else if (dn.hasIssue) status = 'FLAGGED';
    setEditDNFlagStatus(status);
    setEditDNLines((dn.lines || []).map((l) => ({
      ...l,
      deliveredQuantity: l.deliveredQuantity || 0,
      comment: l.comment || 'Okay',
    })));
    setEditDNError(null);
  };

  const handleEditDNLineQty = (idx: number, rawVal: string) => {
    const val = parseFloat(rawVal);
    const qty = isNaN(val) ? 0 : Math.max(0, val);
    setEditDNLines((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      const valBefore = Math.round(qty * target.unitPrice * 100) / 100;
      const vRate = target.vatRate ?? 0.18;
      const vatAmt = Math.round(valBefore * vRate * 100) / 100;
      const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;
      updated[idx] = {
        ...target,
        deliveredQuantity: qty,
        valueBeforeVat: valBefore,
        vatAmount: vatAmt,
        valueAfterVat: valAfter,
        totalDeliveredValue: valAfter,
      };
      return updated;
    });
  };

  const handleEditDNLineComment = (idx: number, commentVal: string) => {
    setEditDNLines((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        comment: commentVal,
      };
      return updated;
    });
  };

  const handleSaveEditDNModal = () => {
    if (!editingDNModal) return;
    const cleanNum = editDNNumber.trim();
    if (!cleanNum) {
      setEditDNError('Delivery Note number cannot be empty.');
      return;
    }
    const isDup = deliveryNotes.some(
      (d) => d.id !== editingDNModal.id && d.deliveryNoteNumber.trim().toLowerCase() === cleanNum.toLowerCase()
    );
    if (isDup) {
      setEditDNError(`Delivery Note number "${cleanNum}" is already in use by another delivery note.`);
      return;
    }

    const totalQty = editDNLines.reduce((s, l) => s + (l.deliveredQuantity || 0), 0);
    const totalVal = editDNLines.reduce((s, l) => s + (l.valueAfterVat || 0), 0);
    const isCancelled = editDNFlagStatus === 'CANCELLED';
    const isOfr = editDNFlagStatus === 'OFR';
    const isCallOfOrder = editDNFlagStatus === 'CALL_OF_ORDER';
    const isFlagged = isCallOfOrder || editDNFlagStatus === 'FLAGGED';

    const existingCooDetail = parseCallOfOrderDetail(editingDNModal);
    const migratedStandingItems: CallOfOrderStandingItem[] = isCallOfOrder
      ? existingCooDetail?.standingItems && existingCooDetail.standingItems.length > 0
        ? existingCooDetail.standingItems
        : editDNLines
            .filter(
              (l) =>
                l.poLineId !== 'CALL-OF-ORDER-LINE' &&
                l.poLineId !== 'CALL-OF-ORDER-NIL-LINE' &&
                !(l.itemDescription || '').toLowerCase().includes('nil delivery record') &&
                Number(l.deliveredQuantity) > 0
            )
            .map((l, idx) => ({
              id: l.id || l.poLineId || `coo-item-${Date.now()}-${idx + 1}`,
              itemDescription: (l.itemDescription || '').trim(),
              unitOfMeasure: l.unitOfMeasure || 'PCS',
              callOfOrderQuantity: Number(l.deliveredQuantity) || 0,
              unitPrice: Number(l.unitPrice) || 0,
              comment: l.comment || '[Call of Order]',
            }))
      : [];

    const updatedRecord: DeliveryNoteRecord = {
      ...editingDNModal,
      id: editingDNModal.id,
      deliveryNoteNumber: cleanNum,
      deliveryDate: editDNDate,
      poNumber: isCallOfOrder ? 'N/A (Call of Order)' : editingDNModal.poNumber,
      carrier: editDNCarrier.trim(),
      vehicleNumber: editDNVehicle.trim(),
      driverName: editDNDriver.trim(),
      receivedBy: editDNReceivedBy.trim(),
      notes: editDNNotes.trim(),
      comment: editDNComment.trim() || (isCancelled ? 'Cancelled' : isCallOfOrder ? '[Call of Order]' : isFlagged ? 'Discrepancy' : 'Okay'),
      // All Call of Order DNs are recorded with NIL (0) qty & items on the Delivery Note record to prevent double counting
      lines: isCallOfOrder
        ? buildNilCallOfOrderDeliveryLines(editingDNModal.id)
        : editDNLines.map((l) => ({
            ...l,
            comment: l.comment || 'Okay',
          })),
      totalDeliveredQuantity: isCallOfOrder ? 0 : totalQty,
      totalDeliveredValue: isCallOfOrder ? 0 : Math.round(totalVal * 100) / 100,
      status: isCancelled ? 'CANCELLED' : isOfr ? 'OFR' : isCallOfOrder ? 'CALL_OF_ORDER' : 'ACTIVE',
      isCancelled: isCancelled,
      isOfr: isOfr,
      isCallOfOrder: isCallOfOrder,
      callOfOrderDetail: isCallOfOrder
        ? JSON.stringify({
            isStandingCallOfOrder: true,
            standingItems: migratedStandingItems,
            allocations: existingCooDetail?.allocations || editingDNModal.callOfOrderAllocations || [],
          } as ParsedCallOfOrderDetail)
        : editingDNModal.callOfOrderDetail,
      hasIssue: isFlagged,
      issueComment: isFlagged
        ? isCallOfOrder
          ? '[Call of Order] Dispatched without PO - pending PO linking'
          : editingDNModal.issueComment && !editingDNModal.issueComment.toLowerCase().includes('call of order')
          ? editingDNModal.issueComment
          : 'Delivery Discrepancy'
        : undefined,
      issueStatus: isFlagged ? (editingDNModal.issueStatus || 'PENDING') : undefined,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
    };

    onSaveDeliveryNote(updatedRecord);
    setEditingDNModal(null);
    setEditDNError(null);
    if (isCallOfOrder) {
      handleSwitchMode('call_of_order');
      handleOpenEditCallOfOrder(updatedRecord);
    }
  };

  const effectiveLines = allPoLines.length > 0 ? allPoLines : poLines;

  // Fallback if poGroups was not supplied directly
  const poGroups = useMemo(() => {
    if (passedPoGroups && passedPoGroups.length > 0) return passedPoGroups;
    if (effectiveLines.length > 0) {
      return groupPOsByNumber(effectiveLines, [], deliveryNotes);
    }
    return [];
  }, [passedPoGroups, effectiveLines, deliveryNotes]);

  // Customer filter & search
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPrefix, setNewCustPrefix] = useState<string>('DN');
  const [newCustStart, setNewCustStart] = useState<number>(1);

  // Flags & status
  const [isNoPoChecked, setIsNoPoChecked] = useState<boolean>(false);
  const [isCancelledChecked, setIsCancelledChecked] = useState<boolean>(false);
  const [isOfrChecked, setIsOfrChecked] = useState<boolean>(false);
  const [isCallOfOrderChecked, setIsCallOfOrderChecked] = useState<boolean>(false);
  const [editingDN, setEditingDN] = useState<DeliveryNoteRecord | null>(null);
  const [showLogisticsDetails, setShowLogisticsDetails] = useState<boolean>(false);

  // PO search & selection
  const [poSearchInput, setPoSearchInput] = useState<string>('');
  const [selectedPoGroup, setSelectedPoGroup] = useState<PurchaseOrderGroup | null>(null);
  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Delivery Note header fields
  const [dnNumber, setDnNumber] = useState<string>('');
  const [dnDate, setDnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [carrier, setCarrier] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [headerComment, setHeaderComment] = useState<string>('Okay');
  const [vatRate] = useState<number>(0.18);
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);

  // Customer series book state & modal
  const [activeCustomerBook, setActiveCustomerBook] = useState<CustomerSeriesBook | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState<boolean>(false);
  const [bookPrefix, setBookPrefix] = useState<string>('CRU');
  const [bookStartNum, setBookStartNum] = useState<number>(1);
  const [bookEndNum, setBookEndNum] = useState<number>(200);
  const [bookCurrentNum, setBookCurrentNum] = useState<number>(1);
  const [bookPadding, setBookPadding] = useState<number>(3);

  // Cancel delivery note modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('No PO reference');
  const [customCancelNote, setCustomCancelNote] = useState<string>('');

  // Delivery Note Issue Tracking State (Severity is HIGH by default)
  const [hasTransactionIssue, setHasTransactionIssue] = useState<boolean>(false);
  const [transactionIssueComment, setTransactionIssueComment] = useState<string>('');
  const [transactionIssueSeverity, setTransactionIssueSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [transactionIssueType, setTransactionIssueType] = useState<
    'Quantity Discrepancy' | 'Pricing / Rate Error' | 'Missing Delivery Ref' | 'VAT / Calculation Error' | 'Wrong PO Reference' | 'Other'
  >('Quantity Discrepancy');

  // Line items state
  const [deliveryLines, setDeliveryLines] = useState<DeliveryNoteLineItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSavedDN, setSuccessSavedDN] = useState<DeliveryNoteRecord | null>(null);

  // Print modal state
  const [printingDN, setPrintingDN] = useState<DeliveryNoteRecord | null>(null);

  // Database search
  const [dbSearchTerm, setDbSearchTerm] = useState('');
  const [dbCustomerFilter, setDbCustomerFilter] = useState('ALL');
  const [dbPage, setDbPage] = useState(1);
  const [dbPageSize, setDbPageSize] = useState(25);

  // Unique customers list from POs and stored customer books
  const customers = useMemo(() => {
    const set = new Set<string>();
    poGroups.forEach((g) => {
      if (g.customerName) set.add(g.customerName);
    });
    const storedBooks = loadStoredCustomerSeriesBooks();
    storedBooks.forEach((b) => {
      if (b.customerName) set.add(b.customerName);
    });
    return Array.from(set).sort();
  }, [poGroups]);

  // Filtered customers for combobox
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.toLowerCase().includes(q));
  }, [customers, customerSearchQuery]);

  // Filtered POs according to selected customer
  const customerFilteredPOs = useMemo(() => {
    if (selectedCustomer === 'ALL') return poGroups;
    return poGroups.filter((po) => po.customerName === selectedCustomer);
  }, [poGroups, selectedCustomer]);

  // Suggested POs for live dropdown search
  const suggestedPOs = useMemo(() => {
    const query = poSearchInput.trim().toLowerCase();
    return customerFilteredPOs.filter((po) => {
      if (!query) return true;
      return (
        po.poNumber.toLowerCase().includes(query) ||
        po.customerName.toLowerCase().includes(query) ||
        po.contract.toLowerCase().includes(query) ||
        po.destination.toLowerCase().includes(query)
      );
    });
  }, [customerFilteredPOs, poSearchInput]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPoDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update customer book whenever customer changes
  const syncCustomerBook = (customerName: string) => {
    if (!customerName || customerName === 'ALL') {
      const general = loadStoredSeriesConfig();
      setActiveCustomerBook(null);
      setDnNumber(
        formatSeriesNumber(
          general.deliverySeries.prefix,
          general.deliverySeries.currentNumber,
          general.deliverySeries.padding
        )
      );
      return;
    }

    const book = getCustomerSeriesBook(customerName);
    setActiveCustomerBook(book);
    setBookPrefix(book.deliveryPrefix || book.invoicePrefix);
    setBookStartNum(book.deliveryStartNumber || 1);
    setBookEndNum(book.deliveryEndNumber || 200);
    setBookCurrentNum(book.deliveryCurrentNumber || 1);
    setBookPadding(book.padding || 3);

    const nextNum = peekCustomerSeriesNumber(customerName, 'delivery');
    setDnNumber(nextNum);
  };

  // Initialize on mount: do NOT auto-select PO
  useEffect(() => {
    if (!dnNumber) {
      const initialCust = selectedCustomer !== 'ALL' ? selectedCustomer : (poGroups[0]?.customerName || '');
      if (initialCust) {
        syncCustomerBook(initialCust);
      } else {
        const config = loadStoredSeriesConfig();
        setDnNumber(formatSeriesNumber(config.deliverySeries.prefix, config.deliverySeries.currentNumber, config.deliverySeries.padding));
      }
    }
  }, []);

  // Customer selection
  const handleCustomerSelect = (customer: string) => {
    setSelectedCustomer(customer);
    syncCustomerBook(customer);
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
    setSelectedPoGroup(null);
    setPoSearchInput('');
    setDeliveryLines([]);
  };

  // Save New Customer
  const handleSaveNewCustomer = () => {
    if (!newCustName.trim()) return;
    const trimmed = newCustName.trim();
    const prefix = newCustPrefix.trim().toUpperCase() || 'DN';
    const newBook: CustomerSeriesBook = {
      id: `cust_${Date.now()}`,
      customerName: trimmed,
      invoicePrefix: prefix,
      invoiceStartNumber: newCustStart,
      invoiceEndNumber: 999,
      invoiceCurrentNumber: newCustStart,
      deliveryPrefix: prefix,
      deliveryStartNumber: newCustStart,
      deliveryEndNumber: 999,
      deliveryCurrentNumber: newCustStart,
      padding: 3,
      updatedAt: new Date().toISOString(),
    };
    saveOrUpdateCustomerSeriesBook(newBook);
    handleCustomerSelect(trimmed);
    setIsAddCustomerModalOpen(false);
    setNewCustName('');
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  const handleToggleNoPo = (checked: boolean) => {
    if (checked) {
      setIsNoPoChecked(true);
      setIsCancelledChecked(false);
      setIsOfrChecked(false);
      setHeaderComment('No PO details');
      setNotes('No PO details');

      if (deliveryLines.length === 0) {
        setDeliveryLines([
          {
            poLineId: 'NO-PO-LINE',
            itemDescription: 'No PO details',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: hasTransactionIssue,
            issueComment: hasTransactionIssue ? 'No PO details' : undefined,
          },
        ]);
      }
    } else {
      setIsNoPoChecked(false);
      setHeaderComment('Okay');
    }
  };

  const handleToggleCancelled = (checked: boolean) => {
    if (checked) {
      setIsCancelledChecked(true);
      setIsOfrChecked(false);
      setIsNoPoChecked(false);
      setHasTransactionIssue(false); // Cancelled is out of issue screen!
      setHeaderComment('Cancelled');
      setNotes('Cancelled');

      if (deliveryLines.length === 0) {
        setDeliveryLines([
          {
            poLineId: 'CANCELLED-LINE',
            itemDescription: 'Cancelled',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: false,
          },
        ]);
      }
    } else {
      setIsCancelledChecked(false);
      setHeaderComment('Okay');
    }
  };

  const handleToggleOfr = (checked: boolean) => {
    if (checked) {
      setIsOfrChecked(true);
      setIsCancelledChecked(false);
      setIsNoPoChecked(false);
      setHasTransactionIssue(false); // OFR is out of issue screen!
      setHeaderComment('OFR');
      setNotes('Out of range');

      if (deliveryLines.length === 0) {
        setDeliveryLines([
          {
            poLineId: 'OFR-LINE',
            itemDescription: 'Out of range (OFR)',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: false,
          },
        ]);
      }
    } else {
      setIsOfrChecked(false);
      setHeaderComment('Okay');
    }
  };

  // Toggle [Call of Order] flag
  const handleToggleCallOfOrder = (checked: boolean) => {
    if (checked) {
      setIsCallOfOrderChecked(true);
      setIsCancelledChecked(false);
      setIsOfrChecked(false);
      setIsNoPoChecked(false);
      setHasTransactionIssue(true);
      setHeaderComment('');
      setNotes((prev) => prev || '');

      // Cascade issue to lines
      setDeliveryLines((prev) =>
        prev.map((line) => ({
          ...line,
          hasIssue: line.isSelected ? true : false,
          issueComment: line.issueComment || (line.isSelected ? 'Quantity Discrepancy' : ''),
        }))
      );
      setTransactionIssueComment('Quantity Discrepancy');

      if (deliveryLines.length === 0) {
        setDeliveryLines([
          {
            poLineId: 'CALL-OF-ORDER-LINE',
            itemDescription: 'Direct Delivery Item',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: true,
            issueComment: 'Quantity Discrepancy',
          },
        ]);
      }
    } else {
      setIsCallOfOrderChecked(false);
      if (headerComment === '[Call of Order]') {
        setHeaderComment('Okay');
      }
      setHasTransactionIssue(false);
      setDeliveryLines((prev) =>
        prev.map((line) => ({
          ...line,
          hasIssue: false,
          issueComment: '',
        }))
      );
    }
  };

  const handleLineCommentChange = (idx: number, val: string) => {
    setDeliveryLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], comment: val };
      return updated;
    });
  };

  // Load an existing delivery note into the main form for full editing
  const handleLoadIntoForm = (dn: DeliveryNoteRecord) => {
    setEditingDN(dn);
    setInternalMode('create');
    if (onNavigateScreen) onNavigateScreen('create');
    setDnNumber(dn.deliveryNoteNumber);
    setDnDate(dn.deliveryDate);
    setPoSearchInput(dn.poNumber);
    setCarrier(dn.carrier || '');
    setVehicleNumber(dn.vehicleNumber || '');
    setDriverName(dn.driverName || '');
    setReceivedBy(dn.receivedBy || '');
    setNotes(dn.notes || '');
    setHeaderComment(dn.comment || dn.issueComment || (dn.isCancelled ? 'Cancelled' : dn.isOfr ? 'OFR' : 'Okay'));
    setAttachments(dn.attachments || []);

    if (dn.customerName) {
      setSelectedCustomer(dn.customerName);
      syncCustomerBook(dn.customerName);
    }

    const isCallOrder = dn.status === 'CALL_OF_ORDER' || dn.issueComment?.includes('Call of Order') || dn.notes?.includes('Call of Order');
    const isCancelled = dn.isCancelled || dn.status === 'CANCELLED';
    const isOfr = dn.isOfr || dn.status === 'OFR';
    const isNoPo = dn.poNumber?.includes('No PO') || dn.notes?.includes('No PO');

    setIsCallOfOrderChecked(Boolean(isCallOrder));
    setIsCancelledChecked(Boolean(isCancelled));
    setIsOfrChecked(Boolean(isOfr));
    setIsNoPoChecked(Boolean(isNoPo));
    setHasTransactionIssue(Boolean(dn.hasIssue || isCallOrder));
    if (dn.hasIssue || isCallOrder) {
      const cleanComment = (dn.issueComment && !dn.issueComment.toLowerCase().includes('call of order')) 
        ? dn.issueComment 
        : (dn.comment && !dn.comment.toLowerCase().includes('call of order') && dn.comment.toLowerCase() !== 'okay')
        ? dn.comment
        : (dn.notes && !dn.notes.toLowerCase().includes('call of order'))
        ? dn.notes
        : 'Quantity Discrepancy';
      setTransactionIssueComment(cleanComment);
    }

    const targetGroup = poGroups.find(
      (g) => g.poNumber.trim().toLowerCase() === dn.poNumber.trim().toLowerCase()
    );
    if (targetGroup) {
      setSelectedPoGroup(targetGroup);
    }

    setDeliveryLines(
      (dn.lines || []).map((l, idx) => ({
        ...l,
        poLineId: l.poLineId || `DN-LINE-${idx}`,
        isSelected: true,
        availableQuantity: l.availableQuantity ?? (l.poQuantity || l.deliveredQuantity || 9999),
        comment: l.comment || 'Okay',
        hasIssue: !!l.hasIssue,
        issueComment: l.issueComment || '',
        vatRate: l.vatRate ?? 0.18,
        valueBeforeVat: l.valueBeforeVat || (l.deliveredQuantity * l.unitPrice),
        vatAmount: l.vatAmount || (l.deliveredQuantity * l.unitPrice * (l.vatRate ?? 0.18)),
        valueAfterVat: l.valueAfterVat || (l.deliveredQuantity * l.unitPrice * (1 + (l.vatRate ?? 0.18))),
      }))
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (editingDeliveryNote) {
      handleLoadIntoForm(editingDeliveryNote);
    }
  }, [editingDeliveryNote]);

  const handleCancelEditingDN = () => {
    setEditingDN(null);
    if (onCancelEdit) onCancelEdit();
    setSelectedPoGroup(null);
    setPoSearchInput('');
    setCarrier('');
    setVehicleNumber('');
    setDriverName('');
    setReceivedBy('');
    setDeliveryLines([]);
    setNotes('');
    setHeaderComment('Okay');
    setIsCancelledChecked(false);
    setIsOfrChecked(false);
    setIsNoPoChecked(false);
    setIsCallOfOrderChecked(false);
    setHasTransactionIssue(false);
    setTransactionIssueComment('');
    const cfg = loadStoredSeriesConfig();
    const defaultDn = formatSeriesNumber(cfg.deliverySeries.prefix, cfg.deliverySeries.currentNumber, cfg.deliverySeries.padding);
    setDnNumber(defaultDn);
  };

  // Handler when a PO is searched / selected
  const handleSelectPO = (poNum: string) => {
    setErrorMessage(null);
    setSuccessSavedDN(null);
    setIsPoDropdownOpen(false);

    const targetGroup = poGroups.find(
      (g) => g.poNumber.trim().toLowerCase() === poNum.trim().toLowerCase()
    );

    if (!targetGroup) {
      setSelectedPoGroup(null);
      setDeliveryLines([]);
      setErrorMessage(`Purchase Order "${poNum}" was not found in the loaded PO Master Data.`);
      return;
    }

    setSelectedPoGroup(targetGroup);
    setPoSearchInput(targetGroup.poNumber);
    if (targetGroup.customerName) {
      setSelectedCustomer(targetGroup.customerName);
      syncCustomerBook(targetGroup.customerName);
    }

    // Initialize delivery lines from PO lines with delivery tracking
    const lines: DeliveryNoteLineItem[] = targetGroup.lines.map((poLine) => {
      const alreadyDelivered = poLine.deliveredQuantity || 0;
      const available = Math.max(0, poLine.quantity - alreadyDelivered);
      
      const initDeliveredQty = available;
      const valBeforeVat = Math.round(initDeliveredQty * poLine.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBeforeVat * (poLine.vatRate || vatRate) * 100) / 100;
      const valAfterVat = Math.round((valBeforeVat + vatAmt) * 100) / 100;

      return {
        poLineId: poLine.id,
        itemDescription: poLine.itemDescription,
        unitOfMeasure: poLine.unitOfMeasure,
        poQuantity: poLine.quantity,
        alreadyDeliveredQuantity: alreadyDelivered,
        availableQuantity: available,
        deliveredQuantity: initDeliveredQty,
        unitCost: poLine.unitCost,
        unitPrice: poLine.unitPrice,
        valueBeforeVat: valBeforeVat,
        vatRate: poLine.vatRate || vatRate,
        vatAmount: vatAmt,
        valueAfterVat: valAfterVat,
        isSelected: available > 0,
      };
    });

    setDeliveryLines(lines);
  };

  // Handler when customer changes in top dropdown
  const handleCustomerChange = (customer: string) => {
    setSelectedCustomer(customer);
    syncCustomerBook(customer);
    if (customer === 'ALL') return;

    const customerPOs = poGroups.filter((po) => po.customerName === customer);
    if (customerPOs.length > 0) {
      if (!selectedPoGroup || selectedPoGroup.customerName !== customer) {
        const firstActive = customerPOs.find((p) => p.lines.some((l) => (l.undeliveredQuantity ?? l.quantity) > 0)) || customerPOs[0];
        handleSelectPO(firstActive.poNumber);
      }
    }
  };

  // Advance to next DN series number manually
  const handleAdvanceToNextDNNumber = async () => {
    const cust = selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : '');
    const allocated = await allocateSeriesNumber('delivery', cust);
    const nextFormatted = allocated ? allocated.number : advanceCustomerSeriesNumber(cust, 'delivery');
    setDnNumber(nextFormatted);
    if (cust) {
      const updatedBook = getCustomerSeriesBook(cust);
      setActiveCustomerBook(updatedBook);
    }
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  // Save changes to Customer Delivery Book Settings
  const handleSaveCustomerBookSettings = () => {
    const cust = selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer');
    const existing = getCustomerSeriesBook(cust);
    const updatedBook: CustomerSeriesBook = {
      ...existing,
      customerName: cust,
      deliveryPrefix: bookPrefix.trim().toUpperCase() || 'DN',
      deliveryStartNumber: Number(bookStartNum) || 1,
      deliveryEndNumber: Number(bookEndNum) || 200,
      deliveryCurrentNumber: Number(bookCurrentNum) || 1,
      padding: Number(bookPadding) || 3,
    };
    saveOrUpdateCustomerSeriesBook(updatedBook);
    setActiveCustomerBook(updatedBook);
    setDnNumber(formatSeriesNumber(updatedBook.deliveryPrefix, updatedBook.deliveryCurrentNumber, updatedBook.padding));
    setIsBookModalOpen(false);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  // Delete Customer Delivery Book Settings
  const handleDeleteCustomerBook = () => {
    const cust = selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer');
    setCustomerBookPendingDelete(cust);
  };

  // Toggle select all lines
  const handleToggleSelectAll = (select: boolean) => {
    setDeliveryLines((prev) =>
      prev.map((line) => {
        if (line.availableQuantity <= 0 && select) {
          return line;
        }
        return {
          ...line,
          isSelected: select,
        };
      })
    );
  };

  // Toggle single line item
  const handleToggleLine = (index: number) => {
    setDeliveryLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        isSelected: !next[index].isSelected,
      };
      return next;
    });
  };

  // Modify quantity for line item
  const handleQuantityChange = (index: number, newQtyStr: string) => {
    const rawVal = parseFloat(newQtyStr);
    const newQty = isNaN(rawVal) ? 0 : Math.max(0, rawVal);

    setDeliveryLines((prev) => {
      const next = [...prev];
      const target = next[index];

      if (newQty > target.availableQuantity) {
        setErrorMessage(
          `Delivered quantity (${newQty}) cannot exceed remaining undelivered PO quantity (${target.availableQuantity}) for line: "${target.itemDescription}"`
        );
      } else {
        setErrorMessage(null);
      }

      const valBeforeVat = Math.round(newQty * target.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBeforeVat * target.vatRate * 100) / 100;
      const valAfterVat = Math.round((valBeforeVat + vatAmt) * 100) / 100;

      next[index] = {
        ...target,
        deliveredQuantity: newQty,
        valueBeforeVat: valBeforeVat,
        vatAmount: vatAmt,
        valueAfterVat: valAfterVat,
        isSelected: newQty > 0 ? true : target.isSelected,
      };
      return next;
    });
  };

  // Fill Max available quantity
  const handleSetMaxQuantity = (index: number) => {
    setDeliveryLines((prev) => {
      const next = [...prev];
      const target = next[index];
      const maxQty = target.availableQuantity;
      const valBeforeVat = Math.round(maxQty * target.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBeforeVat * target.vatRate * 100) / 100;
      const valAfterVat = Math.round((valBeforeVat + vatAmt) * 100) / 100;

      next[index] = {
        ...target,
        deliveredQuantity: maxQty,
        valueBeforeVat: valBeforeVat,
        vatAmount: vatAmt,
        valueAfterVat: valAfterVat,
        isSelected: true,
      };
      return next;
    });
  };

  // Toggle main delivery note issue (cascade to selected lines)
  const handleToggleMainIssue = (checked: boolean) => {
    setHasTransactionIssue(checked);
    if (checked) {
      if (deliveryLines.length === 0) {
        setDeliveryLines([
          {
            poLineId: 'FLAGGED-ZERO-LINE',
            itemDescription: 'Discrepancy / Flagged (Zero Items)',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: true,
            issueComment: 'Discrepancy flagged during delivery recording',
          },
        ]);
      } else {
        setDeliveryLines((prev) =>
          prev.map((line) => ({
            ...line,
            hasIssue: line.isSelected ? true : false,
            issueComment: line.issueComment || (line.isSelected ? 'Discrepancy identified on delivery line' : ''),
          }))
        );
      }
      if (!transactionIssueComment) {
        setTransactionIssueComment('Discrepancy flagged during delivery recording');
      }
      if (!headerComment || headerComment === 'Okay') {
        setHeaderComment('Discrepancy');
      }
    } else {
      setDeliveryLines((prev) =>
        prev.map((line) => ({
          ...line,
          hasIssue: false,
        }))
      );
      if (headerComment === 'Discrepancy') {
        setHeaderComment('Okay');
      }
    }
  };

  // Toggle single line delivery issue (allows manual uncheck for lines with no issue)
  const handleToggleLineIssue = (index: number, checked: boolean) => {
    setDeliveryLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        hasIssue: checked,
        issueComment: checked ? (next[index].issueComment || 'Discrepancy on delivered line item') : next[index].issueComment,
      };
      const anyChecked = next.some((l) => l.hasIssue);
      if (anyChecked && !hasTransactionIssue) {
        setHasTransactionIssue(true);
      }
      return next;
    });
  };

  // Modify line issue comment
  const handleLineIssueCommentChange = (index: number, val: string) => {
    setDeliveryLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        issueComment: val,
      };
      return next;
    });
  };

  // Flag status for active delivery note
  const isFlaggedAsIssue = hasTransactionIssue || deliveryLines.some((l) => l.hasIssue);

  // Calculations for active delivery note
  const deliveryTotals = useMemo(() => {
    const isCancelled = isCancelledChecked;
    const isOfr = isOfrChecked;
    const isCallOfOrder = isCallOfOrderChecked;
    const isNoPo = isNoPoChecked;
    const allowsZero = isFlaggedAsIssue || isCancelled || isOfr || isNoPo || isCallOfOrder;

    // When flagged as an issue, cancelled, OFR, NO PO, or Call of Order, permit lines with 0 delivered quantity
    const selectedLines = deliveryLines.filter((l) => l.isSelected && (allowsZero ? true : l.deliveredQuantity > 0));

    let subtotalBeforeVat = 0;
    let totalVat = 0;
    let totalAfterVat = 0;
    let totalItemsCount = 0;

    selectedLines.forEach((l) => {
      subtotalBeforeVat += l.valueBeforeVat;
      totalVat += l.vatAmount;
      totalAfterVat += l.valueAfterVat;
      totalItemsCount += l.deliveredQuantity;
    });

    let isFullyDelivered = false;
    if (selectedPoGroup) {
      let totalRemainingAfterThis = 0;
      deliveryLines.forEach((l) => {
        const remainingNow = l.availableQuantity - (l.isSelected ? l.deliveredQuantity : 0);
        totalRemainingAfterThis += Math.max(0, remainingNow);
      });
      isFullyDelivered = totalRemainingAfterThis <= 0;
    }

    return {
      selectedCount: selectedLines.length,
      totalItemsCount,
      subtotalBeforeVat: Math.round(subtotalBeforeVat * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalAfterVat: Math.round(totalAfterVat * 100) / 100,
      isFullyDelivered,
    };
  }, [deliveryLines, selectedPoGroup, isFlaggedAsIssue, isCancelledChecked, isOfrChecked, isCallOfOrderChecked, isNoPoChecked]);

  // Save Delivery Note record
  const handleSave = async () => {
    setErrorMessage(null);

    const isCancelled = isCancelledChecked;
    const isOfr = isOfrChecked;
    const isCallOfOrder = isCallOfOrderChecked;
    const isNoPo = isNoPoChecked;
    const isFlagged = isCallOfOrder || (!isCancelled && !isOfr && (hasTransactionIssue || isNoPo || deliveryLines.some((l) => l.hasIssue)));
    const allowsZeroItems = isFlagged || isCancelled || isOfr || isNoPo || isCallOfOrder;

    let poNum = selectedPoGroup?.poNumber || poSearchInput.trim();
    if (!poNum) {
      if (isCancelled) poNum = 'N/A (Cancelled)';
      else if (isOfr) poNum = 'N/A (OFR - Out of range)';
      else if (isNoPo) poNum = 'N/A (No PO Reference)';
      else if (isCallOfOrder) poNum = 'N/A (Call of Order)';
      else if (isFlagged) poNum = 'N/A (Flagged / Discrepancy)';
      else {
        setErrorMessage('Please select a valid Purchase Order first.');
        return;
      }
    }

    if (!dnNumber.trim()) {
      setErrorMessage('Please enter a valid Delivery Note Number.');
      return;
    }

    // Check if updating existing record or creating new
    const existingRecord = editingDN || deliveryNotes.find(
      (dn) => dn.deliveryNoteNumber.trim().toLowerCase() === dnNumber.trim().toLowerCase()
    );

    if (existingRecord) {
      const isDuplicateOther = deliveryNotes.some(
        (dn) => dn.id !== existingRecord.id && dn.deliveryNoteNumber.trim().toLowerCase() === dnNumber.trim().toLowerCase()
      );
      if (isDuplicateOther) {
        setErrorMessage(`Delivery Note number "${dnNumber}" is already in use by another record.`);
        return;
      }
    }

    let selectedLines = deliveryLines.filter((l) => l.isSelected && (allowsZeroItems ? true : l.deliveredQuantity > 0));
    
    if (selectedLines.length === 0) {
      if (allowsZeroItems) {
        selectedLines = [
          {
            poLineId: isCancelled
              ? 'CANCELLED-LINE'
              : isOfr
              ? 'OFR-LINE'
              : isCallOfOrder
              ? 'CALL-OF-ORDER-LINE'
              : isNoPo
              ? 'NO-PO-LINE'
              : 'FLAGGED-ZERO-LINE',
            itemDescription: isCancelled
              ? 'Cancelled'
              : isOfr
              ? 'Out of range (OFR)'
              : isCallOfOrder
              ? 'Direct Delivery Item'
              : isNoPo
              ? 'No PO details'
              : (transactionIssueComment.trim() || 'Discrepancy / Flagged (Zero Items)'),
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyDeliveredQuantity: 0,
            availableQuantity: 0,
            deliveredQuantity: 0,
            unitCost: 0,
            unitPrice: 0,
            valueBeforeVat: 0,
            vatRate: 0.18,
            vatAmount: 0,
            valueAfterVat: 0,
            isSelected: true,
            hasIssue: isCancelled || isOfr ? false : true,
            issueComment: isCancelled || isOfr ? undefined : (isCallOfOrder ? 'Quantity Discrepancy' : (transactionIssueComment.trim() || 'Discrepancy flagged during delivery recording')),
          }
        ];
      } else {
        setErrorMessage('Please select at least one line item with a delivered quantity greater than 0.');
        return;
      }
    }

    for (const line of selectedLines) {
      if (!allowsZeroItems && line.deliveredQuantity > line.availableQuantity) {
        setErrorMessage(
          `Line "${line.itemDescription}" delivered quantity (${line.deliveredQuantity}) exceeds available quantity (${line.availableQuantity}).`
        );
        return;
      }
    }

    const customerName = resolveCustomerDisplayName(
      selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer')
    );

    const totalDeliveredQuantity = selectedLines.reduce(
      (acc, l) => acc + (Number(l.deliveredQuantity) || 0),
      0
    );
    const totalDeliveredValue =
      Math.round(
        selectedLines.reduce((acc, l) => acc + (Number(l.valueAfterVat) || 0), 0) * 100
      ) / 100;

    const finalIssueComment = isCancelled || isOfr
      ? undefined
      : isCallOfOrder
        ? (transactionIssueComment.trim() && !transactionIssueComment.toLowerCase().includes('call of order') ? transactionIssueComment.trim() : 'Quantity Discrepancy')
        : transactionIssueComment.trim() || (isFlagged ? 'Discrepancy flagged during delivery recording' : undefined);

    const recordId = existingRecord ? existingRecord.id : `DN-REC-${Date.now()}`;
    const effectiveStatus = isCancelled ? 'CANCELLED' : isOfr ? 'OFR' : isCallOfOrder ? 'CALL_OF_ORDER' : undefined;

    // For a brand-new record whose number still matches the auto-suggested value
    // (i.e. the user didn't hand-type a custom one), reserve the real number from
    // the shared MySQL sequence right before persisting, in a locked, atomic
    // transaction on the server, so two users saving for the same customer at the
    // same moment can never end up with the same delivery note number.
    let finalDnNumber = dnNumber.trim();
    let reservedServerSide = false;
    if (!existingRecord) {
      const suggested = getNextAvailableCustomerDeliveryNumber(customerName, deliveryNotes);
      if (suggested.trim().toLowerCase() === finalDnNumber.toLowerCase()) {
        const allocated = await allocateSeriesNumber('delivery', customerName);
        if (allocated) {
          finalDnNumber = allocated.number;
          reservedServerSide = true;
        }
      }
    }

    const existingCooParsed = existingRecord ? parseCallOfOrderDetail(existingRecord) : null;
    const initialStandingItemsForCoo: CallOfOrderStandingItem[] = isCallOfOrder
      ? existingCooParsed?.standingItems && existingCooParsed.standingItems.length > 0
        ? existingCooParsed.standingItems
        : selectedLines
            .filter(
              (l) =>
                l.poLineId !== 'CALL-OF-ORDER-LINE' &&
                l.poLineId !== 'CALL-OF-ORDER-NIL-LINE' &&
                !(l.itemDescription || '').toLowerCase().includes('nil delivery record') &&
                Number(l.deliveredQuantity) > 0
            )
            .map((l, idx) => ({
              id: l.id || l.poLineId || `coo-item-${Date.now()}-${idx + 1}`,
              itemDescription: (l.itemDescription || '').trim(),
              unitOfMeasure: l.unitOfMeasure || 'PCS',
              callOfOrderQuantity: Number(l.deliveredQuantity) || 0,
              unitPrice: Number(l.unitPrice) || 0,
              comment: l.comment || '[Call of Order]',
            }))
      : [];

    const newDN: DeliveryNoteRecord = {
      ...(existingRecord || {}),
      id: recordId,
      deliveryNoteNumber: finalDnNumber,
      deliveryDate: dnDate,
      poNumber: isCallOfOrder ? 'N/A (Call of Order)' : poNum,
      customerName: customerName,
      destination: selectedPoGroup?.destination || existingRecord?.destination || 'N/A',
      contract: selectedPoGroup?.contract || existingRecord?.contract || 'N/A',
      poDate: selectedPoGroup?.date || existingRecord?.poDate || dnDate,
      // All Call of Order DNs are saved with NIL (0) delivery note lines/totals so only separate New DNs impact Delivery Note records
      lines: isCallOfOrder
        ? buildNilCallOfOrderDeliveryLines(recordId)
        : selectedLines.map((l) => ({
            ...l,
            poQuantity: l.poQuantity,
            hasIssue: isCancelled || isOfr ? false : !!l.hasIssue,
            issueComment:
              isCancelled || isOfr
                ? undefined
                : l.issueComment?.trim() && !l.issueComment.toLowerCase().includes('call of order')
                ? l.issueComment.trim()
                : l.hasIssue
                ? 'Discrepancy on delivery line'
                : undefined,
            comment: l.comment || 'Okay',
          })),
      totalDeliveredQuantity: isCallOfOrder ? 0 : totalDeliveredQuantity,
      totalDeliveredValue: isCallOfOrder ? 0 : totalDeliveredValue,
      carrier: carrier.trim(),
      vehicleNumber: vehicleNumber.trim(),
      driverName: driverName.trim(),
      receivedBy: receivedBy.trim(),
      notes: notes.trim(),
      comment: headerComment.trim() || (isCancelled ? 'Cancelled' : isOfr ? 'Out of range' : isCallOfOrder ? '[Call of Order]' : isFlagged ? 'Discrepancy' : 'Okay'),
      status: effectiveStatus,
      isCancelled: isCancelled,
      isOfr: isOfr,
      isCallOfOrder: isCallOfOrder,
      callOfOrderDetail: isCallOfOrder
        ? JSON.stringify({
            isStandingCallOfOrder: true,
            standingItems: initialStandingItemsForCoo,
            allocations: existingCooParsed?.allocations || existingRecord?.callOfOrderAllocations || [],
          } as ParsedCallOfOrderDetail)
        : existingRecord?.callOfOrderDetail,
      cancelReason: isCancelled ? 'Cancelled' : isOfr ? 'Out of range' : undefined,
      hasIssue: isCancelled || isOfr ? false : isFlagged,
      issueComment: isCancelled || isOfr ? undefined : (isCallOfOrder ? '[Call of Order] Dispatched without PO - pending PO linking' : finalIssueComment),
      issueStatus: !isCancelled && !isOfr && isFlagged ? (existingRecord?.issueStatus || 'PENDING') : undefined,
      attachments: attachments,
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      matchedInvoiceNumber: existingRecord?.matchedInvoiceNumber,
      isFullyInvoiced: existingRecord?.isFullyInvoiced || false,
    };

    onSaveDeliveryNote(newDN);
    setSuccessSavedDN(newDN);
    setEditingDN(null);

    // Advance series configuration for customer ONLY if creating a brand new record.
    // Skip the local mutation when the server already reserved+advanced the number
    // above, to avoid double-advancing past a number nobody used yet.
    if (!existingRecord) {
      if (!reservedServerSide) {
        advanceCustomerSeriesNumber(customerName, 'delivery');
      }
      if (onSeriesConfigChanged) onSeriesConfigChanged();
    }

    const nextNum = getNextAvailableCustomerDeliveryNumber(customerName, [newDN, ...deliveryNotes]);

    // Automatically reset fields for next record BUT KEEP CUSTOMER!
    setSelectedCustomer(customerName);
    setDnNumber(nextNum);
    setPoSearchInput('');
    setSelectedPoGroup(null);
    setCarrier('');
    setVehicleNumber('');
    setDriverName('');
    setReceivedBy('');
    setNotes('');
    setHeaderComment('Okay');
    setHasTransactionIssue(false);
    setIsNoPoChecked(false);
    setIsCancelledChecked(false);
    setIsOfrChecked(false);
    setIsCallOfOrderChecked(false);
    setAttachments([]);
    setDeliveryLines([]);

    if (isCallOfOrder) {
      handleSwitchMode('call_of_order');
      handleOpenEditCallOfOrder(newDN);
    }
  };

  // Cancel Delivery Note Number without PO Reference
  const handleConfirmCancelDeliveryNumber = async () => {
    const cust = selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer');
    const finalReason = cancelReason === 'Other custom reason' ? (customCancelNote || 'Cancelled') : cancelReason;

    const cancelledDN: DeliveryNoteRecord = {
      id: `DN-CANCELLED-${Date.now()}`,
      deliveryNoteNumber: dnNumber.trim(),
      deliveryDate: dnDate,
      poNumber: 'N/A (No PO Reference)',
      customerName: cust,
      destination: 'N/A',
      contract: 'N/A',
      poDate: dnDate,
      carrier: '',
      vehicleNumber: '',
      driverName: '',
      receivedBy: '',
      lines: [],
      totalDeliveredQuantity: 0,
      totalDeliveredValue: 0,
      isCancelled: true,
      cancelReason: finalReason,
      notes: `CANCELLED: ${finalReason}`,
      createdAt: new Date().toISOString(),
    };

    onSaveDeliveryNote(cancelledDN);

    const allocated = await allocateSeriesNumber('delivery', cust);
    const nextFormatted = allocated ? allocated.number : advanceCustomerSeriesNumber(cust, 'delivery');
    setDnNumber(nextFormatted);
    setIsCancelModalOpen(false);
    setHeaderComment('Okay');
    setErrorMessage(null);

    setSuccessSavedDN(cancelledDN);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  // Reset form for next delivery note - KEEP CUSTOMER!
  const handleStartNextDN = () => {
    setSuccessSavedDN(null);
    setHasTransactionIssue(false);
    setIsNoPoChecked(false);
    setIsCancelledChecked(false);
    setIsOfrChecked(false);
    setPoSearchInput('');
    setSelectedPoGroup(null);
    setCarrier('');
    setVehicleNumber('');
    setDriverName('');
    setReceivedBy('');
    setNotes('');
    setHeaderComment('Okay');
    setAttachments([]);
    setDeliveryLines([]);
    const cust = selectedCustomer !== 'ALL' ? selectedCustomer : (customers[0] || '');
    const nextNum = peekCustomerSeriesNumber(cust, 'delivery');
    setDnNumber(nextNum);
  };

  // Export Delivery Notes to Excel
  const handleExportToExcel = () => {
    if (deliveryNotes.length === 0) return;

    const exportRows: any[] = [];
    deliveryNotes.forEach((dn) => {
      if (dn.lines && dn.lines.length > 0) {
        dn.lines.forEach((l) => {
          exportRows.push({
            'DN Number': dn.deliveryNoteNumber,
            'DN Date': dn.deliveryDate,
            'PO Number': dn.poNumber,
            'Customer': dn.customerName,
            'Destination': dn.destination,
            'Carrier': dn.carrier,
            'Vehicle': dn.vehicleNumber,
            'Driver': dn.driverName,
            'Received By': dn.receivedBy,
            'Item Description': l.itemDescription,
            'UOM': l.unitOfMeasure,
            'Delivered Qty': l.deliveredQuantity,
            'Matched Invoice': dn.matchedInvoiceNumber || 'Pending Invoice',
            'Notes': dn.notes || '',
          });
        });
      } else {
        exportRows.push({
          'DN Number': dn.deliveryNoteNumber,
          'DN Date': dn.deliveryDate,
          'PO Number': dn.poNumber,
          'Customer': dn.customerName,
          'Destination': dn.destination,
          'Carrier': dn.carrier,
          'Vehicle': dn.vehicleNumber,
          'Driver': dn.driverName,
          'Received By': dn.receivedBy,
          'Item Description': 'N/A (Cancelled)',
          'UOM': '',
          'Delivered Qty': 0,
          'Matched Invoice': '',
          'Notes': dn.notes || '',
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DeliveryNotes');
    XLSX.writeFile(workbook, `Delivery_Notes_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportFilteredDNsExcel = () => {
    const headers = [
      '#',
      'DN Number',
      'Delivery Date',
      'PO Number',
      'Customer',
      'Destination',
      'Vehicle Number',
      'Driver Name',
      'Carrier',
      'Status',
      'Matched Invoice',
      'Items Summary',
    ];
    const rows = filteredDatabaseDNs.map((dn, idx) => [
      idx + 1,
      dn.deliveryNoteNumber,
      dn.deliveryDate,
      dn.poNumber,
      dn.customerName,
      dn.destination,
      dn.vehicleNumber || '—',
      dn.driverName || '—',
      dn.carrier || '—',
      dn.poNumber.includes('No PO') ? 'CANCELLED' : dn.matchedInvoiceNumber ? 'Matched' : 'Pending Invoice',
      dn.matchedInvoiceNumber || '—',
      (dn.lines || []).map((l) => `${l.itemDescription} (${l.deliveredQuantity} ${l.unitOfMeasure})`).join('; '),
    ]);
    exportTableToExcel('Delivery_Notes_Registry', headers, rows, 'Delivery_Notes');
  };

  const handleExportFilteredDNsPdf = () => {
    const headers = [
      '#',
      'DN #',
      'Date',
      'PO #',
      'Customer',
      'Destination',
      'Vehicle',
      'Status',
      'Matched Inv',
    ];
    const rows = filteredDatabaseDNs.map((dn, idx) => [
      idx + 1,
      dn.deliveryNoteNumber,
      dn.deliveryDate,
      dn.poNumber,
      dn.customerName,
      dn.destination,
      dn.vehicleNumber || '—',
      dn.poNumber.includes('No PO') ? 'CANCELLED' : dn.matchedInvoiceNumber ? 'Matched' : 'Pending',
      dn.matchedInvoiceNumber || '—',
    ]);
    exportTableToPdf('Delivery Notes Registry Report', headers, rows, {
      filenamePrefix: 'Delivery_Notes_Report',
      subtitle: `Filtered Dataset • Total Delivery Notes: ${filteredDatabaseDNs.length}`,
      orientation: 'landscape',
      currencyNote: 'Currency: TZS',
    });
  };

  const handleExportDeliveryLinesExcel = () => {
    const headers = [
      'Item Description',
      'UOM',
      'PO Ordered',
      'Already Delivered',
      'Remaining Before',
      'Dispatch Qty',
      'Unit Price (TZS)',
      'Line Total (TZS)',
    ];
    const rows = deliveryLines.map((l) => [
      l.itemDescription,
      l.unitOfMeasure,
      l.poQuantity,
      l.alreadyDeliveredQuantity,
      l.availableQuantity,
      l.deliveredQuantity,
      formatCurrency(l.unitPrice),
      formatCurrency(l.isSelected ? l.valueAfterVat : 0),
    ]);
    exportTableToExcel(
      `DN_${dnNumber || 'Draft'}_Items`,
      headers,
      rows,
      `dn_${dnNumber || 'draft'}_items`
    );
  };

  const handleExportDeliveryLinesPdf = () => {
    const headers = [
      'Item Description',
      'UOM',
      'PO Total',
      'Delivered',
      'Remaining',
      'Dispatch',
      'Total (TZS)',
    ];
    const rows = deliveryLines.map((l) => [
      l.itemDescription,
      l.unitOfMeasure,
      l.poQuantity,
      l.alreadyDeliveredQuantity,
      l.availableQuantity,
      l.deliveredQuantity,
      formatCurrency(l.isSelected ? l.valueAfterVat : 0),
    ]);
    exportTableToPdf(
      `Delivery Note #${dnNumber || 'Draft'} - Items Allocation`,
      headers,
      rows,
      {
        filenamePrefix: `dn_${dnNumber || 'draft'}_items`,
        currencyNote: 'Currency: TZS',
      }
    );
  };

  const allSelected = deliveryLines.length > 0 && deliveryLines.every((l) => l.isSelected);
  const activeCustomer = selectedPoGroup?.customerName || (selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer');

  // Admin permanent delete confirmation state for Delivery Note
  const [dnPendingDelete, setDnPendingDelete] = useState<DeliveryNoteRecord | null>(null);
  const [customerBookPendingDelete, setCustomerBookPendingDelete] = useState<string | null>(null);

  // Filtered Delivery Notes Database
  const filteredDatabaseDNs = useMemo(() => {
    const list = deliveryNotes.filter((dn) => {
      const matchSearch =
        !dbSearchTerm ||
        dn.deliveryNoteNumber.toLowerCase().includes(dbSearchTerm.toLowerCase()) ||
        dn.poNumber.toLowerCase().includes(dbSearchTerm.toLowerCase()) ||
        dn.customerName.toLowerCase().includes(dbSearchTerm.toLowerCase()) ||
        (dn.carrier && dn.carrier.toLowerCase().includes(dbSearchTerm.toLowerCase()));

      const matchCustomer = dbCustomerFilter === 'ALL' || dn.customerName === dbCustomerFilter;
      return matchSearch && matchCustomer;
    });

    // Arrange (sort) by delivery note number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.deliveryNoteNumber, b.deliveryNoteNumber));
  }, [deliveryNotes, dbSearchTerm, dbCustomerFilter]);

  // Table Sorting and Column Filtering for Delivery Notes Database
  const {
    processedData: sortedAndFilteredDatabaseDNs,
    sortConfig: dnSort,
    columnFilters: dnFilters,
    handleSort: handleDNSort,
    handleFilterChange: handleDNFilterChange,
  } = useTableSortAndFilter(filteredDatabaseDNs, {
    defaultSort: { field: 'deliveryNoteNumber', direction: 'asc' },
  });

  // Paginated slice for the database table — with thousands of real delivery notes,
  // rendering the full unsliced array froze the page for many seconds on open.
  const paginatedDatabaseDNs = useMemo(() => {
    const start = (dbPage - 1) * dbPageSize;
    return sortedAndFilteredDatabaseDNs.slice(start, start + dbPageSize);
  }, [sortedAndFilteredDatabaseDNs, dbPage, dbPageSize]);

  // Call of Order State
  const [cooSearchTerm, setCooSearchTerm] = useState<string>('');
  const [cooCustomerFilter, setCooCustomerFilter] = useState<string>('ALL');
  const [cooStatusFilter, setCooStatusFilter] = useState<string>('ALL'); // 'ALL' | 'UNASSIGNED' | 'PARTIAL' | 'FULLY_UTILIZED'
  const [cooPage, setCooPage] = useState<number>(1);
  const [cooPageSize, setCooPageSize] = useState<number>(25);
  const [expandedCooIds, setExpandedCooIds] = useState<Set<string>>(new Set());

  const toggleExpandCoo = (dnId: string) => {
    setExpandedCooIds((prev) => {
      const next = new Set(prev);
      if (next.has(dnId)) {
        next.delete(dnId);
      } else {
        next.add(dnId);
      }
      return next;
    });
  };

  // Manual Item Lines Editor Modal State
  const [isCooEditModalOpen, setIsCooEditModalOpen] = useState<boolean>(false);
  const [cooEditingDN, setCooEditingDN] = useState<DeliveryNoteRecord | null>(null);
  const [cooModalDNNumber, setCooModalDNNumber] = useState<string>('');
  const [cooModalDate, setCooModalDate] = useState<string>('');
  const [cooModalCustomer, setCooModalCustomer] = useState<string>('');
  const [cooModalVehicle, setCooModalVehicle] = useState<string>('');
  const [cooModalDriver, setCooModalDriver] = useState<string>('');
  const [cooModalCarrier, setCooModalCarrier] = useState<string>('');
  const [cooModalDestination, setCooModalDestination] = useState<string>('');
  const [cooModalNotes, setCooModalNotes] = useState<string>('');
  const [cooModalLines, setCooModalLines] = useState<
    Array<{
      id: string;
      itemDescription: string;
      deliveredQuantity: number;
      unitOfMeasure: string;
      unitPrice: number;
      comment: string;
    }>
  >([]);
  const [cooModalError, setCooModalError] = useState<string | null>(null);

  // Assign Call of Order to New DN # & PO # Modal State
  const [isCooLinkModalOpen, setIsCooLinkModalOpen] = useState<boolean>(false);
  const [cooLinkingDN, setCooLinkingDN] = useState<DeliveryNoteRecord | null>(null);
  const [cooLinkEditParentDnNumber, setCooLinkEditParentDnNumber] = useState<string>('');
  const [cooLinkNewDnNumber, setCooLinkNewDnNumber] = useState<string>('');
  const [cooSelectedPoNumber, setCooSelectedPoNumber] = useState<string>('');
  const [cooLinkShowAllCustomersPo, setCooLinkShowAllCustomersPo] = useState<boolean>(false);
  const [cooLinkDate, setCooLinkDate] = useState<string>('');
  const [cooLinkVehicle, setCooLinkVehicle] = useState<string>('');
  const [cooLinkDriver, setCooLinkDriver] = useState<string>('');
  const [cooLinkCarrier, setCooLinkCarrier] = useState<string>('');
  const [cooLinkDestination, setCooLinkDestination] = useState<string>('');
  const [cooLinkNotes, setCooLinkNotes] = useState<string>('');
  const [cooLinkLines, setCooLinkLines] = useState<
    Array<{
      id: string;
      itemDescription: string;
      unitOfMeasure: string;
      unitPrice: number;
      callOfOrderQty: number;
      alreadyAssignedQty: number;
      assignQty: number;
      isSelected: boolean;
      mappedPoLineId: string;
      comment: string;
    }>
  >([]);
  const [cooLinkError, setCooLinkError] = useState<string | null>(null);

  const callOfOrderDNs = useMemo(() => {
    return deliveryNotes.filter(isCallOfOrderRecord);
  }, [deliveryNotes]);

  const cooUtilizationMap = useMemo(() => {
    const map = new Map<string, CallOfOrderUtilizationSummary>();
    callOfOrderDNs.forEach((dn) => {
      map.set(dn.id, getCallOfOrderUtilization(dn, deliveryNotes));
    });
    return map;
  }, [callOfOrderDNs, deliveryNotes]);

  const filteredCallOfOrderDNs = useMemo(() => {
    return callOfOrderDNs
      .filter((dn) => {
        const util = cooUtilizationMap.get(dn.id) || getCallOfOrderUtilization(dn, deliveryNotes);
        const searchLower = cooSearchTerm.toLowerCase();
        const matchSearch =
          !cooSearchTerm ||
          dn.deliveryNoteNumber.toLowerCase().includes(searchLower) ||
          dn.customerName.toLowerCase().includes(searchLower) ||
          (dn.vehicleNumber && dn.vehicleNumber.toLowerCase().includes(searchLower)) ||
          (dn.driverName && dn.driverName.toLowerCase().includes(searchLower)) ||
          (dn.carrier && dn.carrier.toLowerCase().includes(searchLower)) ||
          util.lines.some((lu) => (lu.line.itemDescription || '').toLowerCase().includes(searchLower)) ||
          util.distinctChildDnNumbers.some((cNum) => cNum.toLowerCase().includes(searchLower)) ||
          util.distinctPoNumbers.some((pNum) => pNum.toLowerCase().includes(searchLower));

        const matchCustomer = cooCustomerFilter === 'ALL' || dn.customerName === cooCustomerFilter;

        let matchStatus = true;
        if (cooStatusFilter === 'UNASSIGNED' || cooStatusFilter === 'PENDING_PO') {
          matchStatus = util.status === 'UNASSIGNED';
        } else if (cooStatusFilter === 'PARTIAL') {
          matchStatus = util.status === 'PARTIAL';
        } else if (cooStatusFilter === 'FULLY_UTILIZED' || cooStatusFilter === 'LINKED') {
          matchStatus = util.status === 'FULLY_UTILIZED';
        }

        return matchSearch && matchCustomer && matchStatus;
      })
      .sort((a, b) => naturalCompare(a.deliveryNoteNumber, b.deliveryNoteNumber));
  }, [callOfOrderDNs, cooUtilizationMap, deliveryNotes, cooSearchTerm, cooCustomerFilter, cooStatusFilter]);

  const paginatedCallOfOrderDNs = useMemo(() => {
    const start = (cooPage - 1) * cooPageSize;
    return filteredCallOfOrderDNs.slice(start, start + cooPageSize);
  }, [filteredCallOfOrderDNs, cooPage, cooPageSize]);

  const cooMetrics = useMemo(() => {
    const total = callOfOrderDNs.length;
    let totalRegisteredUnits = 0;
    let totalAssignedUnits = 0;
    let totalRemainingUnits = 0;
    let unassignedCount = 0;
    let partialCount = 0;
    let fullyUtilizedCount = 0;

    callOfOrderDNs.forEach((d) => {
      const u = cooUtilizationMap.get(d.id) || getCallOfOrderUtilization(d, deliveryNotes);
      totalRegisteredUnits += u.totalOriginalQty;
      totalAssignedUnits += u.totalAssignedQty;
      totalRemainingUnits += u.totalRemainingQty;
      if (u.status === 'FULLY_UTILIZED') fullyUtilizedCount++;
      else if (u.status === 'PARTIAL') partialCount++;
      else unassignedCount++;
    });

    return {
      total,
      totalRegisteredUnits: Math.round(totalRegisteredUnits * 100) / 100,
      totalAssignedUnits: Math.round(totalAssignedUnits * 100) / 100,
      totalRemainingUnits: Math.round(totalRemainingUnits * 100) / 100,
      unassignedCount,
      partialCount,
      fullyUtilizedCount,
    };
  }, [callOfOrderDNs, cooUtilizationMap, deliveryNotes]);

  // Call of Order Handlers
  const handleOpenNewCallOfOrder = () => {
    setCooEditingDN(null);
    const defaultCust = selectedCustomer !== 'ALL' ? selectedCustomer : (customers[0] || '');
    setCooModalCustomer(defaultCust);
    const defaultDn = defaultCust
      ? getNextAvailableCustomerDeliveryNumber(defaultCust, deliveryNotes)
      : (() => {
          const cfg = loadStoredSeriesConfig();
          return formatSeriesNumber(cfg.deliverySeries.prefix, cfg.deliverySeries.currentNumber, cfg.deliverySeries.padding);
        })();
    setCooModalDNNumber(defaultDn);
    setCooModalDate(new Date().toISOString().split('T')[0]);
    setCooModalVehicle('');
    setCooModalDriver('');
    setCooModalCarrier('');
    setCooModalDestination('');
    setCooModalNotes('');
    setCooModalLines([
      {
        id: `line-new-${Date.now()}-1`,
        itemDescription: '',
        deliveredQuantity: 0,
        unitOfMeasure: 'PCS',
        unitPrice: 0,
        comment: '[Call of Order]',
      },
    ]);
    setCooModalError(null);
    setIsCooEditModalOpen(true);
  };

  const handleOpenEditCallOfOrder = (dn: DeliveryNoteRecord) => {
    setCooEditingDN(dn);
    setCooModalDNNumber(dn.deliveryNoteNumber);
    setCooModalDate(dn.deliveryDate || new Date().toISOString().split('T')[0]);
    setCooModalCustomer(dn.customerName);
    setCooModalVehicle(dn.vehicleNumber || '');
    setCooModalDriver(dn.driverName || '');
    setCooModalCarrier(dn.carrier || '');
    setCooModalDestination(dn.destination || '');
    setCooModalNotes(dn.notes || '');
    const util = getCallOfOrderUtilization(dn, deliveryNotes);
    if (util.lines.length > 0) {
      setCooModalLines(
        util.lines.map((lu, idx) => ({
          id: lu.lineKey || `line-${idx}`,
          itemDescription: lu.line.itemDescription || '',
          deliveredQuantity: lu.originalQty || 0,
          unitOfMeasure: lu.line.unitOfMeasure || 'PCS',
          unitPrice: lu.line.unitPrice || 0,
          comment: lu.line.comment || '[Call of Order]',
        }))
      );
    } else {
      setCooModalLines([
        {
          id: `line-${Date.now()}-1`,
          itemDescription: '',
          deliveredQuantity: 0,
          unitOfMeasure: 'PCS',
          unitPrice: 0,
          comment: '[Call of Order]',
        },
      ]);
    }
    setCooModalError(null);
    setIsCooEditModalOpen(true);
  };

  const handleAddCooModalLine = () => {
    setCooModalLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length + 1}`,
        itemDescription: '',
        deliveredQuantity: 0,
        unitOfMeasure: 'PCS',
        unitPrice: 0,
        comment: '[Call of Order]',
      },
    ]);
  };

  const handleRemoveCooModalLine = (idx: number) => {
    setCooModalLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateCooModalLine = (idx: number, field: string, value: any) => {
    setCooModalLines((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSaveCallOfOrderModal = () => {
    const cleanNum = cooModalDNNumber.trim();
    if (!cleanNum) {
      setCooModalError('Delivery Note number cannot be empty.');
      return;
    }
    const cleanCustomer = cooModalCustomer.trim();
    if (!cleanCustomer) {
      setCooModalError('Please select or specify a Customer.');
      return;
    }

    const validLines = cooModalLines.filter(
      (l) => l.itemDescription.trim() !== '' && Number(l.deliveredQuantity) > 0
    );
    if (validLines.length === 0) {
      setCooModalError('Please enter at least one item line with a description and Call of Order quantity > 0.');
      return;
    }

    const isDup = deliveryNotes.some(
      (d) => (!cooEditingDN || d.id !== cooEditingDN.id) && d.deliveryNoteNumber.trim().toLowerCase() === cleanNum.toLowerCase()
    );
    if (isDup) {
      setCooModalError(`Delivery Note number "${cleanNum}" is already in use by another delivery note.`);
      return;
    }

    const existingUtil = cooEditingDN ? getCallOfOrderUtilization(cooEditingDN, deliveryNotes) : null;
    const existingAllocations: CallOfOrderLineAllocation[] = existingUtil ? existingUtil.allAllocations : [];

    // Validate that edited quantities are not lower than already assigned quantities
    for (let i = 0; i < validLines.length; i++) {
      const ml = validLines[i];
      const lineAllocs = existingAllocations.filter(
        (a) =>
          (a.cooLineId && a.cooLineId === ml.id) ||
          (!a.cooLineId && a.cooItemDescription.trim().toLowerCase() === ml.itemDescription.trim().toLowerCase())
      );
      const alreadyAssigned = Math.round(
        lineAllocs.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0) * 100
      ) / 100;
      if (Number(ml.deliveredQuantity) < alreadyAssigned) {
        setCooModalError(
          `Item "${ml.itemDescription}" already has ${alreadyAssigned} ${ml.unitOfMeasure || 'PCS'} assigned to DN/POs. Call of Order quantity cannot be less than ${alreadyAssigned}.`
        );
        return;
      }
    }

    const updatedStandingItems: CallOfOrderStandingItem[] = validLines.map((ml, idx) => ({
      id: ml.id || `line-coo-${Date.now()}-${idx}`,
      itemDescription: ml.itemDescription.trim(),
      unitOfMeasure: ml.unitOfMeasure || 'PCS',
      callOfOrderQuantity: Number(ml.deliveredQuantity) || 0,
      unitPrice: Number(ml.unitPrice) || 0,
      comment: ml.comment || '[Call of Order]',
    }));

    const allLinesFullyUtilized =
      updatedStandingItems.length > 0 &&
      updatedStandingItems.every((item) => {
        const lineAllocs = existingAllocations.filter(
          (a) =>
            (a.cooLineId && a.cooLineId === item.id) ||
            (!a.cooLineId && a.cooItemDescription.trim().toLowerCase() === item.itemDescription.trim().toLowerCase())
        );
        const assignedQty = Math.round(
          lineAllocs.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0) * 100
        ) / 100;
        return item.callOfOrderQuantity - assignedQty <= 0;
      });

    const baseDN = cooEditingDN || {
      id: `dn-coo-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    const serializedDetail: ParsedCallOfOrderDetail = {
      isStandingCallOfOrder: true,
      standingItems: updatedStandingItems,
      allocations: existingAllocations,
    };

    // Requirement: Any changes on the Call of Order (adding items, editing quantities, or changing Call of Order details)
    // must NOT impact the Delivery Note record. All Call of Order DNs are saved with NIL (0) qty & items on the Delivery Note record.
    const updatedRecord: DeliveryNoteRecord = {
      ...baseDN,
      id: baseDN.id,
      deliveryNoteNumber: cleanNum,
      deliveryDate: cooModalDate || new Date().toISOString().split('T')[0],
      customerName: cleanCustomer,
      vehicleNumber: cooModalVehicle.trim(),
      driverName: cooModalDriver.trim(),
      carrier: cooModalCarrier.trim(),
      destination: cooModalDestination.trim(),
      notes: cooModalNotes.trim() || '[Call of Order]',
      poNumber: 'N/A (Call of Order)',
      status: 'CALL_OF_ORDER',
      isCallOfOrder: true,
      callOfOrderDetail: JSON.stringify(serializedDetail),
      callOfOrderAllocations: existingAllocations,
      hasIssue: !allLinesFullyUtilized,
      issueComment: allLinesFullyUtilized
        ? '[Call of Order] Fully utilized across assigned DNs and POs'
        : '[Call of Order] Dispatched without PO - pending PO linking',
      comment: '[Call of Order]',
      lines: buildNilCallOfOrderDeliveryLines(baseDN.id),
      totalDeliveredQuantity: 0,
      totalDeliveredValue: 0,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
    };

    onSaveDeliveryNote(updatedRecord);
    setExpandedCooIds((prev) => new Set(prev).add(updatedRecord.id));
    setIsCooEditModalOpen(false);
    setCooEditingDN(null);
    setCooModalError(null);
  };

  const buildAutoPoMappingsForLines = (
    poNum: string,
    linesToMap: Array<{ id: string; itemDescription: string; mappedPoLineId?: string }>
  ): Record<string, string> => {
    const mappings: Record<string, string> = {};
    if (!poNum) return mappings;
    const poObj = poGroups.find((g) => g.poNumber === poNum);
    const poLinesList = poObj?.lines || [];
    linesToMap.forEach((l) => {
      const desc = (l.itemDescription || '').toLowerCase().trim();
      const exactMatch = poLinesList.find((pl) => pl.itemDescription.toLowerCase().trim() === desc);
      const partialMatch =
        !exactMatch && desc.length >= 3
          ? poLinesList.find(
              (pl) =>
                pl.itemDescription.toLowerCase().includes(desc) ||
                desc.includes(pl.itemDescription.toLowerCase().trim())
            )
          : undefined;
      if (exactMatch) {
        mappings[l.id] = exactMatch.id;
      } else if (partialMatch) {
        mappings[l.id] = partialMatch.id;
      } else if (poLinesList.length === 1) {
        mappings[l.id] = poLinesList[0].id;
      }
    });
    return mappings;
  };

  const handleOpenLinkPoModal = (dn: DeliveryNoteRecord) => {
    const util = getCallOfOrderUtilization(dn, deliveryNotes);
    const validUtilLines = util.lines.filter(
      (lu) => lu.originalQty > 0 && lu.line.itemDescription.trim() !== ''
    );

    // If the Call of Order has no items registered yet, open the Edit / Add Items modal first
    if (validUtilLines.length === 0) {
      handleOpenEditCallOfOrder(dn);
      setCooModalError(
        'Please register items and Call of Order quantities on this Call of Order first before assigning to a New DN # and PO #.'
      );
      return;
    }

    setCooLinkingDN(dn);
    setCooLinkError(null);
    setCooLinkEditParentDnNumber(dn.deliveryNoteNumber);

    // Suggest next available customer delivery note number for the new PO-linked DN
    const suggestedNewDn = getNextAvailableCustomerDeliveryNumber(dn.customerName, deliveryNotes);
    setCooLinkNewDnNumber(
      suggestedNewDn.trim().toLowerCase() === dn.deliveryNoteNumber.trim().toLowerCase()
        ? `${dn.deliveryNoteNumber}-A`
        : suggestedNewDn
    );

    setCooLinkDate(new Date().toISOString().split('T')[0]);
    setCooLinkVehicle(dn.vehicleNumber || '');
    setCooLinkDriver(dn.driverName || '');
    setCooLinkCarrier(dn.carrier || '');
    setCooLinkDestination(dn.destination || '');
    setCooLinkNotes(`Assigned from Call of Order DN ${dn.deliveryNoteNumber}`);

    const custPOs = poGroups.filter((g) => g.customerName === dn.customerName);
    const hasCustPOs = custPOs.length > 0;
    setCooLinkShowAllCustomersPo(!hasCustPOs);
    const firstPo = (hasCustPOs ? custPOs[0]?.poNumber : poGroups[0]?.poNumber) || '';
    setCooSelectedPoNumber(firstPo);

    const initialLines = validUtilLines.map((lu) => ({
      id: lu.lineKey,
      itemDescription: lu.line.itemDescription || '',
      unitOfMeasure: lu.line.unitOfMeasure || 'PCS',
      unitPrice: lu.line.unitPrice || 0,
      callOfOrderQty: lu.originalQty,
      alreadyAssignedQty: lu.assignedQty,
      assignQty: lu.remainingQty,
      isSelected: lu.remainingQty > 0,
      mappedPoLineId: '',
      comment: lu.line.comment || '[Call of Order]',
    }));

    const autoMappings = buildAutoPoMappingsForLines(firstPo, initialLines);
    const poObj = poGroups.find((g) => g.poNumber === firstPo);
    const linesWithMappings = initialLines.map((l) => {
      const mappedId = autoMappings[l.id] || '';
      const matchedPoLine = (poObj?.lines || []).find((pl) => pl.id === mappedId);
      return {
        ...l,
        mappedPoLineId: mappedId,
        unitPrice: matchedPoLine?.unitPrice || l.unitPrice || 0,
      };
    });

    setCooLinkLines(linesWithMappings);
    setIsCooLinkModalOpen(true);
  };

  // Requirement: When assigning items to New DN option, Call of Order quantity (and item description / UOM)
  // shall NOT be editable — ONLY enable editing Assigned QTY against the Call of Order (plus selection, PO line mapping, and unit price).
  const handleUpdateCooLinkModalLine = (idx: number, field: string, value: any) => {
    if (field === 'callOfOrderQty' || field === 'itemDescription' || field === 'unitOfMeasure') {
      return;
    }
    setCooLinkLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[idx], [field]: value };

      if (field === 'assignQty') {
        const maxRem = Math.max(
          0,
          Math.round(((Number(current.callOfOrderQty) || 0) - (Number(current.alreadyAssignedQty) || 0)) * 100) / 100
        );
        const numericVal = Math.max(0, Number(value) || 0);
        current.assignQty = Math.min(maxRem, numericVal);
      } else if (field === 'mappedPoLineId') {
        const poObj = poGroups.find((g) => g.poNumber === cooSelectedPoNumber);
        const matchedPoLine = (poObj?.lines || []).find((pl) => pl.id === value);
        if (matchedPoLine) {
          current.unitPrice = matchedPoLine.unitPrice || current.unitPrice || 0;
        }
      }

      updated[idx] = current;
      return updated;
    });
  };

  const handleConfirmLinkPo = () => {
    if (!cooLinkingDN) return;

    const cleanParentDnNum = cooLinkingDN.deliveryNoteNumber;
    const cleanNewDnNum = cooLinkNewDnNumber.trim();
    const cleanPoNum = cooSelectedPoNumber.trim();

    if (!cleanNewDnNum) {
      setCooLinkError('Please enter a New Delivery Note Number (New DN #) for this PO assignment.');
      return;
    }
    if (cleanNewDnNum.toLowerCase() === cleanParentDnNum.toLowerCase()) {
      setCooLinkError(
        `New Delivery Note Number ("${cleanNewDnNum}") must be different from the standing Call of Order DN Number ("${cleanParentDnNum}") so the Call of Order remains tracked separately from the new PO-linked Delivery Note.`
      );
      return;
    }
    const isNewDnDup = deliveryNotes.some(
      (d) => d.deliveryNoteNumber.trim().toLowerCase() === cleanNewDnNum.toLowerCase()
    );
    if (isNewDnDup) {
      setCooLinkError(`New Delivery Note Number "${cleanNewDnNum}" is already in use. Please enter a unique New DN #.`);
      return;
    }

    if (!cleanPoNum) {
      setCooLinkError('Please select or enter a Purchase Order Number (PO #) to link.');
      return;
    }

    const validCooLines = cooLinkLines.filter(
      (l) => l.itemDescription.trim() !== '' && Number(l.callOfOrderQty) > 0
    );
    if (validCooLines.length === 0) {
      setCooLinkError('Please ensure the Call of Order has at least one valid item line with Call of Order Qty > 0.');
      return;
    }

    const selectedForAssignment = validCooLines.filter((l) => l.isSelected && Number(l.assignQty) > 0);
    if (selectedForAssignment.length === 0) {
      setCooLinkError('Please select at least one item line and enter an Assigned Qty > 0 against the Call of Order.');
      return;
    }

    for (const line of selectedForAssignment) {
      const maxAvailable = Math.max(
        0,
        Math.round(((Number(line.callOfOrderQty) || 0) - (Number(line.alreadyAssignedQty) || 0)) * 100) / 100
      );
      if (Number(line.assignQty) > maxAvailable) {
        setCooLinkError(
          `Assigned quantity (${line.assignQty}) for "${line.itemDescription}" exceeds remaining available Call of Order quantity (${maxAvailable}). Please reduce Assigned Qty.`
        );
        return;
      }
    }

    const poObj = poGroups.find((g) => g.poNumber === cleanPoNum);
    const nowIso = new Date().toISOString();
    const childDnId = `DN-COO-CHILD-${Date.now()}`;

    // 1. Build separate child Delivery Note lines (linked to PO) — ONLY this separate DN updates the Delivery Note record & PO balance
    const childLines: DeliveryNoteLineItem[] = selectedForAssignment.map((l, idx) => {
      const matchedPoLine =
        (poObj?.lines || []).find((pl) => pl.id === l.mappedPoLineId) ||
        (allPoLines || []).find((pl) => pl.id === l.mappedPoLineId);
      const qty = Number(l.assignQty) || 0;
      const price = matchedPoLine?.unitPrice ?? (Number(l.unitPrice) || 0);
      const vRate = matchedPoLine?.vatRate ?? 0.18;
      const vb = Math.round(qty * price * 100) / 100;
      const va = Math.round(vb * vRate * 100) / 100;
      const vt = Math.round((vb + va) * 100) / 100;

      return {
        id: `child-line-${Date.now()}-${idx}`,
        poLineId: matchedPoLine?.id || `POO-LINK-${cleanPoNum}-${idx + 1}`,
        itemDescription: matchedPoLine?.itemDescription || l.itemDescription.trim(),
        unitOfMeasure: matchedPoLine?.unitOfMeasure || l.unitOfMeasure || 'PCS',
        poQuantity: matchedPoLine?.orderedQuantity || qty,
        alreadyDeliveredQuantity: matchedPoLine?.deliveredQuantity || 0,
        availableQuantity: matchedPoLine?.undeliveredQuantity ?? qty,
        deliveredQuantity: qty,
        unitPrice: price,
        vatRate: vRate,
        valueBeforeVat: vb,
        vatAmount: va,
        valueAfterVat: vt,
        isSelected: true,
        comment: `Assigned from Call of Order ${cleanParentDnNum} to PO ${cleanPoNum}`,
        hasIssue: false,
      };
    });

    const childTotQty = Math.round(childLines.reduce((acc, l) => acc + l.deliveredQuantity, 0) * 100) / 100;
    const childTotVal = Math.round(childLines.reduce((acc, l) => acc + (l.valueAfterVat || 0), 0) * 100) / 100;

    const childDetailJson: ParsedCallOfOrderDetail = {
      isChildAllocation: true,
      parentCallOfOrderId: cooLinkingDN.id,
      parentCallOfOrderNumber: cleanParentDnNum,
      poNumber: cleanPoNum,
    };

    const newChildDN: DeliveryNoteRecord = {
      id: childDnId,
      entityId: cooLinkingDN.entityId,
      deliveryNoteNumber: cleanNewDnNum,
      deliveryDate: cooLinkDate || nowIso.split('T')[0],
      poNumber: cleanPoNum,
      customerName: poObj?.customerName || cooLinkingDN.customerName,
      destination: cooLinkDestination.trim() || poObj?.destination || cooLinkingDN.destination || 'N/A',
      contract: poObj?.contract || cooLinkingDN.contract || 'N/A',
      poDate: poObj?.date || cooLinkingDN.poDate || cooLinkDate,
      carrier: cooLinkCarrier.trim(),
      vehicleNumber: cooLinkVehicle.trim(),
      driverName: cooLinkDriver.trim(),
      receivedBy: cooLinkingDN.receivedBy || '',
      lines: childLines,
      totalDeliveredQuantity: childTotQty,
      totalDeliveredValue: childTotVal,
      notes:
        cooLinkNotes.trim() ||
        `Assigned from Standing Call of Order DN ${cleanParentDnNum} under PO ${cleanPoNum}`,
      comment: 'Okay',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
      status: 'ACTIVE',
      isCallOfOrder: false,
      callOfOrderDetail: JSON.stringify(childDetailJson),
      parentCallOfOrderId: cooLinkingDN.id,
      parentCallOfOrderNumber: cleanParentDnNum,
      hasIssue: false,
    };

    // 2. Build new allocations & update Standing Call of Order Parent DN (which stays in Call of Order table with NIL Delivery Note record!)
    const existingUtil = getCallOfOrderUtilization(cooLinkingDN, deliveryNotes);
    const newAllocations: CallOfOrderLineAllocation[] = selectedForAssignment.map((l, idx) => {
      const matchedPoLine =
        (poObj?.lines || []).find((pl) => pl.id === l.mappedPoLineId) ||
        (allPoLines || []).find((pl) => pl.id === l.mappedPoLineId);
      return {
        allocationId: `alloc-${Date.now()}-${idx}`,
        cooLineId: l.id,
        cooItemDescription: l.itemDescription.trim(),
        childDnId: childDnId,
        childDnNumber: cleanNewDnNum,
        poNumber: cleanPoNum,
        poLineId: matchedPoLine?.id,
        poItemDescription: matchedPoLine?.itemDescription || l.itemDescription.trim(),
        allocatedQuantity: Number(l.assignQty) || 0,
        unitPrice: matchedPoLine?.unitPrice ?? (Number(l.unitPrice) || 0),
        allocatedAt: nowIso,
        allocatedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
      };
    });

    const combinedAllocations: CallOfOrderLineAllocation[] = [
      ...existingUtil.allAllocations,
      ...newAllocations,
    ];

    // Standing Call of Order items remain unchanged during assignment
    const standingItemsPreserved: CallOfOrderStandingItem[] = existingUtil.lines.map((lu) => ({
      id: lu.lineKey,
      itemDescription: lu.line.itemDescription,
      unitOfMeasure: lu.line.unitOfMeasure || 'PCS',
      callOfOrderQuantity: lu.originalQty,
      unitPrice: lu.line.unitPrice || 0,
      comment: lu.line.comment || '[Call of Order]',
    }));

    const allLinesFullyUtilized =
      standingItemsPreserved.length > 0 &&
      standingItemsPreserved.every((item) => {
        const lineAllocs = combinedAllocations.filter(
          (a) =>
            (a.cooLineId && a.cooLineId === item.id) ||
            (!a.cooLineId && a.cooItemDescription.trim().toLowerCase() === item.itemDescription.trim().toLowerCase())
        );
        const assignedQty = Math.round(
          lineAllocs.reduce((sum, a) => sum + (Number(a.allocatedQuantity) || 0), 0) * 100
        ) / 100;
        return item.callOfOrderQuantity - assignedQty <= 0;
      });

    const parentDetailJson: ParsedCallOfOrderDetail = {
      isStandingCallOfOrder: true,
      standingItems: standingItemsPreserved,
      allocations: combinedAllocations,
    };

    const updatedParentCooDN: DeliveryNoteRecord = {
      ...cooLinkingDN,
      deliveryNoteNumber: cleanParentDnNum,
      poNumber: 'N/A (Call of Order)', // Keep no direct PO on header so standing Call of Order stays in Call of Order table
      status: 'CALL_OF_ORDER',
      isCallOfOrder: true,
      callOfOrderDetail: JSON.stringify(parentDetailJson),
      callOfOrderAllocations: combinedAllocations,
      hasIssue: !allLinesFullyUtilized,
      issueComment: allLinesFullyUtilized
        ? '[Call of Order] 100% Utilized across assigned Delivery Notes & POs'
        : `[Call of Order] Standing Call of Order (${combinedAllocations.length} DN/PO assignment(s))`,
      comment: '[Call of Order]',
      // Call of Order DN always maintains a NIL (0) Delivery Note record to prevent double counting
      lines: buildNilCallOfOrderDeliveryLines(cooLinkingDN.id),
      totalDeliveredQuantity: 0,
      totalDeliveredValue: 0,
      updatedAt: nowIso,
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'User',
    };

    onSaveDeliveryNote(updatedParentCooDN, newChildDN);
    setExpandedCooIds((prev) => new Set(prev).add(updatedParentCooDN.id));
    setIsCooLinkModalOpen(false);
    setCooLinkingDN(null);
    setCooLinkError(null);
  };

  const handleExportCallOfOrdersExcel = () => {
    const dataToExport = filteredCallOfOrderDNs.map((dn) => {
      const util = cooUtilizationMap.get(dn.id) || getCallOfOrderUtilization(dn, deliveryNotes);
      const itemsStr = util.lines
        .map(
          (lu) =>
            `${lu.line.itemDescription} [COO Qty: ${lu.originalQty} ${lu.line.unitOfMeasure || 'PCS'}, Assigned: ${lu.assignedQty}, Remaining: ${lu.remainingQty}]`
        )
        .join('; ');
      const allocStr = util.allAllocations
        .map((a) => `DN ${a.childDnNumber} -> PO ${a.poNumber} (${a.allocatedQuantity} of ${a.cooItemDescription})`)
        .join(' | ');

      return {
        'Call of Order DN #': dn.deliveryNoteNumber,
        'Delivery Date': dn.deliveryDate,
        'Customer Name': dn.customerName,
        'Vehicle Number': dn.vehicleNumber || '',
        'Driver Name': dn.driverName || '',
        'Destination': dn.destination || '',
        'Call of Order Total Qty': util.totalOriginalQty,
        'Assigned Qty (to DN/PO)': util.totalAssignedQty,
        'Remaining Unassigned Qty': util.totalRemainingQty,
        'Utilization %': `${util.overallPct}%`,
        'Standing Status':
          util.status === 'FULLY_UTILIZED'
            ? '100% FULLY UTILIZED'
            : util.status === 'PARTIAL'
            ? 'PARTIALLY ASSIGNED'
            : 'UNASSIGNED (PENDING PO)',
        'Assigned New DN #s': util.distinctChildDnNumbers.join(', ') || 'None',
        'Linked PO #s': util.distinctPoNumbers.join(', ') || 'None',
        'Item Lines Breakdown': itemsStr || 'No lines entered',
        'Assignment Details': allocStr || 'No DN/PO assignments yet',
        'Notes / Comment': dn.comment || dn.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Call of Orders');
    XLSX.writeFile(workbook, `Call_of_Orders_Standing_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSwitchMode('create')}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'create'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Truck className="w-4 h-4" />
            Delivery (Issue Note)
          </button>
          <button
            onClick={() => handleSwitchMode('database')}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'database'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Database className="w-4 h-4" />
            Delivery Details ({deliveryNotes.length})
          </button>
          <button
            onClick={() => handleSwitchMode('call_of_order')}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'call_of_order'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4" />
            Call of Order ({callOfOrderDNs.length})
          </button>
          <button
            onClick={() => handleSwitchMode('customer_lookup')}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'customer_lookup'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            Customer Name Lookup
          </button>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'call_of_order' && (
            <>
              <button
                type="button"
                onClick={handleOpenNewCallOfOrder}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Call of Order
              </button>
              <button
                onClick={handleExportCallOfOrdersExcel}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Call of Orders
              </button>
            </>
          )}
          {viewMode === 'database' && (
            <>
              <button
                type="button"
                onClick={() => handleSwitchMode('create')}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Issue Delivery Note
              </button>
              {onImportDeliveryNotes && canLoadDB && (
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  title="Admin Only: Load existing delivery note database (.xlsx, .csv) with field mapping & extract template"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Load Existing Database
                </button>
              )}
              <button
                onClick={handleExportToExcel}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export to Excel
              </button>
            </>
          )}
          {viewMode === 'create' && (
            <button
              type="button"
              onClick={() => handleSwitchMode('database')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              View Delivery Details ({deliveryNotes.length})
            </button>
          )}
        </div>
      </div>

      {viewMode === 'customer_lookup' && (
        <CustomerNameLookupPanel moduleLabel="Delivery Module" />
      )}

      {viewMode === 'create' && (
        <div className="space-y-6">
          {/* Success Banner */}
          {successSavedDN && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-900">
                      Delivery Note {successSavedDN.deliveryNoteNumber} Recorded!
                    </h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Logged against PO <span className="font-mono font-bold">{successSavedDN.poNumber}</span> ({successSavedDN.customerName}).
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setPrintingDN(successSavedDN)}
                    className="px-3.5 py-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print / PDF
                  </button>
                  <button
                    onClick={() => handleSwitchMode('database')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    View Delivery Details
                  </button>
                  <button
                    onClick={handleStartNextDN}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Issue Another DN
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Editing Banner */}
          {editingDN && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-200 text-amber-800 rounded-lg">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-amber-950 flex items-center gap-2">
                    <span>Editing Delivery Note:</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 text-blue-700">
                      {editingDN.deliveryNoteNumber}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5 text-xs">
                    Customer: <span className="font-semibold text-slate-800">{editingDN.customerName}</span> &bull; PO: <span className="font-semibold text-slate-800">{editingDN.poNumber}</span> &bull; Date: <span className="font-semibold text-slate-800">{editingDN.deliveryDate}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEditingDN}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors text-xs"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
                Cancel Edit Mode
              </button>
            </div>
          )}

          {/* Error alert */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2 shadow-xs">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Delivery Note Form Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Top Dark Header */}
            <div className="bg-slate-900 text-white p-5 sm:p-6 border-b border-slate-800">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-600/30 border border-blue-400/30 text-blue-300">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="font-bold text-lg text-white">Official Goods Delivery Note</h1>
                      {selectedPoGroup && (
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono font-semibold">
                          {selectedPoGroup.poNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Generate delivery notes with client-specific serial numbering, dispatch carrier details, and line item tracking.
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBookModalOpen(true)}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Configure customer series book (e.g. CRU001-CRU200)"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                    Customer Book: {activeCustomerBook ? `${activeCustomerBook.deliveryPrefix || activeCustomerBook.invoicePrefix} (${activeCustomerBook.deliveryStartNumber || 1}-${activeCustomerBook.deliveryEndNumber || 200})` : 'Default'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Mark this delivery note as Cancelled / No PO reference and advance serial number"
                  >
                    <Ban className="w-3.5 h-3.5 text-red-400" />
                    Cancel This # (No PO Ref)
                  </button>
                </div>
              </div>

              {/* ROW 1: Form Controls Grid (Customer, PO, DN # + Customer Book, Delivery Date, [add Notes]) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-5">
                {/* 1. Customer Selection */}
                <div className="relative" ref={customerDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      Customer <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddCustomerModalOpen(true)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-0.5 cursor-pointer bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-400/30"
                      title="Add New Customer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={customerSearchQuery !== '' ? customerSearchQuery : (selectedCustomer === 'ALL' ? '' : selectedCustomer)}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                      }}
                      onBlur={() => {
                        if (customerSearchQuery.trim()) {
                          setCustomerSearchQuery((prev) => resolveCustomerDisplayName(prev));
                        }
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      placeholder="Select / search customer..."
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isCustomerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-700 text-xs">
                      <div
                        onClick={() => handleCustomerSelect('ALL')}
                        className="p-2 hover:bg-slate-700 cursor-pointer text-slate-300 font-medium"
                      >
                        -- All Customers --
                      </div>
                      {filteredCustomers.length === 0 ? (
                        <div className="p-2 text-center text-slate-400 text-xs">No customer found</div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <div
                            key={c}
                            onClick={() => handleCustomerSelect(c)}
                            className={`p-2 hover:bg-slate-700 cursor-pointer transition-colors ${
                              selectedCustomer === c ? 'bg-blue-600/40 text-blue-200 font-bold' : 'text-white'
                            }`}
                          >
                            {c}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 2. PO Number Selection */}
                <div className="relative" ref={dropdownRef}>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 text-blue-400" />
                      PO Number
                    </span>
                    {customerFilteredPOs.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        {customerFilteredPOs.length} available
                      </span>
                    )}
                  </label>

                  <div className="relative">
                    <input
                      type="text"
                      value={poSearchInput}
                      onChange={(e) => {
                        setPoSearchInput(e.target.value);
                        setIsPoDropdownOpen(true);
                      }}
                      onFocus={() => setIsPoDropdownOpen(true)}
                      placeholder="Type or pick PO #..."
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPoDropdownOpen(!isPoDropdownOpen)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isPoDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-700 text-xs">
                      {suggestedPOs.length === 0 ? (
                        <div className="p-2 text-center text-slate-400 text-xs">
                          No matching PO. (Manual input supported)
                        </div>
                      ) : (
                        suggestedPOs.map((po) => (
                          <div
                            key={po.poNumber}
                            onClick={() => handleSelectPO(po.poNumber)}
                            className={`p-2 hover:bg-slate-700 cursor-pointer transition-colors flex items-center justify-between ${
                              selectedPoGroup?.poNumber === po.poNumber ? 'bg-blue-600/30' : ''
                            }`}
                          >
                            <div>
                              <div className="font-mono font-bold text-white">{po.poNumber}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                {po.customerName}
                              </div>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-500/20 text-blue-300">
                              {po.status}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Delivery Note Number + [Customer Book] directly right after */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-blue-400" />
                      DN # <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsBookModalOpen(true)}
                      className="text-[10px] px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400/40 text-blue-200 rounded font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Configure Customer Book"
                    >
                      <BookOpen className="w-3 h-3 text-blue-400" />
                      [Customer Book]
                    </button>
                  </div>
                  <input
                    type="text"
                    value={dnNumber}
                    onChange={(e) => setDnNumber(e.target.value)}
                    placeholder="e.g. CRU001"
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Delivery Date */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={dnDate}
                    onChange={(e) => setDnDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 5. [add Notes] */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    [add Notes]
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Delivery ref / remarks..."
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* ROW 2: Compact Flags Bar (All aligned in one single line to save space!) */}
            <div className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
              hasTransactionIssue ? 'bg-rose-50/90 border-rose-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex flex-wrap items-center gap-4">
                {/* 1. Flag delivery */}
                <label className="inline-flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasTransactionIssue}
                    onChange={(e) => handleToggleMainIssue(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
                  />
                  <span className={hasTransactionIssue ? 'text-rose-700 font-extrabold' : 'text-slate-800'}>
                    Flag delivery
                  </span>
                </label>

                {/* 2. cancelled */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold select-none">
                  <input
                    type="checkbox"
                    checked={isCancelledChecked}
                    onChange={(e) => handleToggleCancelled(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
                  />
                  <span className={isCancelledChecked ? 'text-rose-700 font-extrabold' : 'text-slate-700'}>
                    cancelled
                  </span>
                </label>

                {/* 3. [OFR] (Out of range) - just after cancelled mark */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold select-none">
                  <input
                    type="checkbox"
                    checked={isOfrChecked}
                    onChange={(e) => handleToggleOfr(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                  />
                  <span className={isOfrChecked ? 'text-purple-700 font-extrabold' : 'text-slate-700'}>
                    [OFR] (Out of range)
                  </span>
                </label>

                {/* 4. NO po */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold select-none">
                  <input
                    type="checkbox"
                    checked={isNoPoChecked}
                    onChange={(e) => handleToggleNoPo(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                  />
                  <span className={isNoPoChecked ? 'text-amber-700 font-extrabold' : 'text-slate-700'}>
                    NO po
                  </span>
                </label>

                {/* 5. [Call of Order] */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800 font-bold select-none">
                  <input
                    type="checkbox"
                    checked={isCallOfOrderChecked}
                    onChange={(e) => handleToggleCallOfOrder(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span className={isCallOfOrderChecked ? 'text-blue-700 font-extrabold' : 'text-slate-700'}>
                    [Call of Order]
                  </span>
                </label>

                {/* 6. Delivery Status */}
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Delivery Status:</span>
                  <input
                    type="text"
                    value={headerComment}
                    onChange={(e) => setHeaderComment(e.target.value)}
                    placeholder="Okay / Cancelled / OFR / No PO / Call of Order"
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold w-40 border focus:outline-none transition-all ${
                      getDeliveryCommentColorStyle(headerComment, isCancelledChecked).inputClass
                    }`}
                  />
                </div>

                {/* Fleet / Logistics toggle */}
                <button
                  type="button"
                  onClick={() => setShowLogisticsDetails(!showLogisticsDetails)}
                  className="text-[11px] font-bold text-slate-600 hover:text-blue-600 inline-flex items-center gap-1 cursor-pointer ml-1"
                >
                  <Truck className="w-3.5 h-3.5 text-blue-500" />
                  {showLogisticsDetails ? 'Hide Fleet Info' : '+ Fleet / Driver Details'}
                </button>
              </div>

              {/* Summary count */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {deliveryTotals.selectedCount} lines selected
                </span>
              </div>
            </div>

            {/* Optional Logistics / Fleet Metadata Sub-panel */}
            {showLogisticsDetails && (
              <div className="p-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/80">
                  <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Fleet &amp; Driver Dispatch Details</span>
                    <span className="text-[10px] font-normal text-slate-400">(All fields optional &bull; Empty by default)</span>
                  </div>
                  {(carrier || vehicleNumber || driverName || receivedBy) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCarrier('');
                        setVehicleNumber('');
                        setDriverName('');
                        setReceivedBy('');
                      }}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Clear Fleet Fields
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1 text-[11px]">Carrier / Transporter</label>
                    <input
                      type="text"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Enter carrier name..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1 text-[11px]">Vehicle Plate #</label>
                    <input
                      type="text"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      placeholder="Enter plate / truck #..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1 text-[11px]">Driver Name</label>
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Enter driver name..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1 text-[11px]">Receiving Officer / Site</label>
                    <input
                      type="text"
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      placeholder="Enter receiving officer..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Line Items Selection & Quantity Allocation Table */}
            {selectedPoGroup || deliveryLines.length > 0 ? (
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      Line Items Physical Dispatch Allocation
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                        {deliveryTotals.selectedCount} items ({deliveryTotals.totalItemsCount} units)
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select lines dispatched in this delivery batch and enter the verified quantities.
                    </p>
                  </div>

                  {/* Actions Aligned with Header */}
                  <div className="flex flex-wrap items-center gap-2">
                    <TableExportToolbar
                      totalCount={deliveryLines.length}
                      onExportExcel={handleExportDeliveryLinesExcel}
                      onExportPdf={handleExportDeliveryLinesPdf}
                      size="sm"
                    />

                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(true)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(false)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                      Unselect All
                    </button>


                    {/* Primary Save Button: Save Delivery */}
                    <button
                      type="button"
                      id="primary-save-delivery-btn"
                      onClick={() => handleSave()}
                      disabled={deliveryTotals.selectedCount === 0}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {editingDN ? 'Update Delivery' : 'Save Delivery'}
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-auto max-h-[500px] scrollbar-thin">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-white font-semibold uppercase text-[10px] sticky top-0 z-20 shadow-sm whitespace-nowrap">
                        <tr>
                          <th className="py-2 px-2 text-center w-10 sticky top-0 bg-slate-900">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={(e) => handleToggleSelectAll(e.target.checked)}
                              className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                            />
                          </th>
                          <th className="py-2 px-2.5 min-w-[200px] sticky top-0 bg-slate-900">Item Description</th>
                          <th className="py-2 px-2 text-center sticky top-0 bg-slate-900">UOM</th>
                          <th className="py-2 px-2 text-right sticky top-0 bg-slate-900">PO Total</th>
                          <th className="py-2 px-2 text-right text-slate-300 sticky top-0 bg-slate-900">Delivered</th>
                          <th className="py-2 px-2 text-right text-amber-300 sticky top-0 bg-slate-900">Remaining</th>
                          <th className="py-2 px-2 text-center min-w-[130px] sticky top-0 bg-slate-900">
                            Dispatch Qty <span className="text-blue-400 font-bold">*</span>
                          </th>
                          <th className="py-2 px-2.5 min-w-[140px] sticky top-0 bg-slate-900">
                            Line Comment
                          </th>
                          <th className="py-2 px-2 text-center sticky top-0 bg-slate-900 min-w-[80px]">Issue?</th>
                          <th className="py-2 px-2.5 min-w-[160px] sticky top-0 bg-slate-900">Delivery Issue Reason</th>
                          <th className="py-2 px-2.5 text-right sticky top-0 bg-slate-900">Unit Price</th>
                          <th className="py-2 px-2.5 text-right sticky top-0 bg-slate-900">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs whitespace-nowrap">
                        {deliveryLines.map((line, idx) => {
                          const isDepleted = line.availableQuantity <= 0;

                          return (
                            <tr
                              key={line.poLineId || idx}
                              className={`transition-colors ${
                                !line.isSelected
                                  ? 'bg-slate-50/40 text-slate-400'
                                  : isDepleted
                                  ? 'bg-amber-50/20'
                                  : 'bg-white hover:bg-blue-50/30'
                              }`}
                            >
                              <td className="py-1 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={line.isSelected}
                                  onChange={() => handleToggleLine(idx)}
                                  disabled={isDepleted && line.deliveredQuantity === 0}
                                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="py-1 px-2.5 font-medium text-slate-900 max-w-[240px]">
                                <div className="truncate">{line.itemDescription}</div>
                                {isDepleted && (
                                  <span className="text-[9px] text-amber-600 font-semibold">
                                    Already fully delivered
                                  </span>
                                )}
                              </td>
                              <td className="py-1 px-2 text-center text-slate-600 font-mono font-semibold text-[11px]">
                                {line.unitOfMeasure}
                              </td>
                              <td className="py-1 px-2 text-right font-semibold text-slate-700">
                                {line.poQuantity}
                              </td>
                              <td className="py-1 px-2 text-right text-slate-500">
                                {line.alreadyDeliveredQuantity}
                              </td>
                              <td className="py-1 px-2 text-right font-bold text-amber-700">
                                {line.availableQuantity}
                              </td>
                              <td className="py-1 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={line.availableQuantity}
                                    step="any"
                                    value={line.deliveredQuantity}
                                    onChange={(e) => handleQuantityChange(idx, e.target.value)}
                                    disabled={!line.isSelected || isDepleted}
                                    className={`w-16 px-1.5 py-0.5 text-center font-bold text-xs rounded border focus:outline-none ${
                                      !line.isSelected || isDepleted
                                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-white border-blue-400 text-slate-900 focus:ring-1 focus:ring-blue-500'
                                    }`}
                                  />
                                  {line.isSelected && line.availableQuantity > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetMaxQuantity(idx)}
                                      className="px-1 py-0.5 text-[9px] font-bold uppercase bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 cursor-pointer"
                                    >
                                      Max
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Line Comment Input */}
                              <td className="py-1 px-2.5">
                                <input
                                  type="text"
                                  value={line.comment ?? 'Okay'}
                                  onChange={(e) => handleLineCommentChange(idx, e.target.value)}
                                  disabled={!line.isSelected}
                                  placeholder="Comment (e.g. Okay)..."
                                  className={`w-full px-2 py-0.5 text-xs rounded border font-medium focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 transition-all ${
                                    getDeliveryCommentColorStyle(line.comment ?? 'Okay', isCancelledChecked, line.hasIssue).inputClass
                                  }`}
                                />
                              </td>

                              {/* Line Issue Flag Checkbox */}
                              <td className="py-1 px-2 text-center">
                                <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!line.hasIssue}
                                    onChange={(e) => handleToggleLineIssue(idx, e.target.checked)}
                                    disabled={!line.isSelected}
                                    className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-0 cursor-pointer accent-rose-600 disabled:opacity-30"
                                  />
                                  <span className={`text-[9px] font-bold uppercase ${line.hasIssue ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {line.hasIssue ? 'Issue' : 'Ok'}
                                  </span>
                                </label>
                              </td>

                              {/* Line Issue Note Input */}
                              <td className="py-1 px-2.5">
                                {line.hasIssue ? (
                                  <input
                                    type="text"
                                    value={line.issueComment || ''}
                                    onChange={(e) => handleLineIssueCommentChange(idx, e.target.value)}
                                    placeholder="Delivery discrepancy note..."
                                    className="w-full px-1.5 py-0.5 text-xs rounded border border-rose-300 bg-rose-50/70 text-rose-900 font-medium placeholder-rose-300 focus:bg-white focus:border-rose-500 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">No line issue</span>
                                )}
                              </td>

                              <td className="py-1 px-2.5 text-right font-semibold text-slate-800">
                                TZS {formatCurrency(line.unitPrice)}
                              </td>
                              <td className="py-1 px-2.5 text-right font-bold text-slate-900">
                                TZS {formatCurrency(line.isSelected ? line.valueAfterVat : 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Attached Picture / Document Scans Section */}
                <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl">
                  <ImageAttachmentManager
                    attachments={attachments}
                    onChange={setAttachments}
                    currentUser={currentUser}
                    title="Delivery Note Scans & Signed Physical Proof"
                    description="Attach photos or scans of the signed delivery note, gate pass, weighbridge ticket, or site receiving proof (PNG, JPG, WEBP)."
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div>
                      Selected lines: <span className="font-bold text-slate-900">{deliveryTotals.selectedCount}</span> ({deliveryTotals.totalItemsCount.toLocaleString()} total units).
                    </div>
                    {isFlaggedAsIssue && (
                      <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 font-medium inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Issue flag active: Zero delivered quantity permitted for Admin correction
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={generateSampleDeliveryNoteExcelTemplate}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      title="Download Excel template to upload deliveries into system"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      Download Template
                    </button>

                    <button
                      type="button"
                      onClick={handleStartNextDN}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      title="Reset form (preserves selected customer)"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Form
                    </button>

                    <button
                      type="button"
                      id="delivery-note-save-action-btn"
                      onClick={() => handleSave()}
                      disabled={deliveryTotals.selectedCount === 0}
                      className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {editingDN ? 'Update Delivery Note' : 'Save Delivery Note'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                Please select or search a PO Number from the header above to load line items.
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'database' && (
        /* Database View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={dbSearchTerm}
                onChange={(e) => {
                  setDbSearchTerm(e.target.value);
                  setDbPage(1);
                }}
                placeholder="Search DN, PO, or Customer..."
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs w-64 focus:outline-none focus:border-blue-500"
              />
              <select
                value={dbCustomerFilter}
                onChange={(e) => {
                  setDbCustomerFilter(e.target.value);
                  setDbPage(1);
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Customers</option>
                {customers.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Showing {filteredDatabaseDNs.length} of {deliveryNotes.length} Delivery Notes
              </span>
              <TableExportToolbar
                totalCount={filteredDatabaseDNs.length}
                onExportExcel={handleExportFilteredDNsExcel}
                onExportPdf={handleExportFilteredDNsPdf}
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-auto max-h-[620px] scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-semibold uppercase text-[10px] sticky top-0 z-20 shadow-sm whitespace-nowrap">
                  <tr>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="DN Number"
                        field="deliveryNoteNumber"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.deliveryNoteNumber}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="Delivery Date"
                        field="deliveryDate"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.deliveryDate}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="PO Number"
                        field="poNumber"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.poNumber}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="Customer"
                        field="customerName"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.customerName}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="Destination"
                        field="destination"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.destination}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="Vehicle"
                        field="vehicleNumber"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.vehicleNumber}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900">
                      <TableColumnHeader
                        label="Status"
                        field="status"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.status}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900 min-w-[130px]">
                      <TableColumnHeader
                        label="Comment"
                        field="comment"
                        sortConfig={dnSort}
                        onSort={handleDNSort}
                        filterValue={dnFilters.comment}
                        onFilterChange={handleDNFilterChange}
                      />
                    </th>
                    <th className="py-2 px-2.5 sticky top-0 bg-slate-900 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                  {sortedAndFilteredDatabaseDNs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No delivery notes recorded yet. Issue one using the 'Issue Delivery Note' tab.
                      </td>
                    </tr>
                  ) : (
                    paginatedDatabaseDNs.map((dn) => (
                      <React.Fragment key={dn.id}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-1 px-2.5 font-mono font-bold text-blue-700">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpandDN(dn.id)}
                                className="w-4 h-4 rounded flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer font-bold text-[10px] shrink-0"
                                title={expandedDNIds.has(dn.id) ? "Hide line items & details" : "Click (+) to view delivery details, items, quantity, price, and total"}
                              >
                                {expandedDNIds.has(dn.id) ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                              </button>
                              <span>{dn.deliveryNoteNumber}</span>
                            </div>
                          </td>
                          <td className="py-1 px-2.5 text-slate-600">{dn.deliveryDate}</td>
                          <td className="py-1 px-2.5 font-mono text-slate-800 font-semibold">{dn.poNumber}</td>
                          <td className="py-1 px-2.5 text-slate-800">{dn.customerName}</td>
                          <td className="py-1 px-2.5 text-slate-600">{dn.destination}</td>
                          <td className="py-1 px-2.5 font-mono text-slate-600">{dn.vehicleNumber}</td>
                          <td className="py-1 px-2.5">
                            {isCallOfOrderRecord(dn) ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                CALL OF ORDER (NIL RECORD)
                              </span>
                            ) : dn.poNumber.includes('No PO') ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-100 text-red-700">
                                CANCELLED
                              </span>
                            ) : dn.matchedInvoiceNumber ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                Matched ({dn.matchedInvoiceNumber})
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">
                                Pending Invoice
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-2.5 text-slate-700 text-xs">
                            {renderDeliveryCommentBadge(dn)}
                          </td>
                          <td className="py-1 px-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEditDN(dn)}
                                className="p-1 text-slate-500 hover:text-amber-600 rounded cursor-pointer"
                                title="Edit Delivery Note"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setPrintingDN(dn)}
                                className="p-1 text-slate-500 hover:text-blue-600 rounded cursor-pointer"
                                title="Print / View Delivery Note"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {canDeleteData(currentUser) && onDeleteDeliveryNote && (
                                <button
                                  onClick={() => setDnPendingDelete(dn)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                  title="Permanently Delete Delivery Note (ADM Only - Restores Dispatch Balance)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ACCORDION EXPANDED ROW: View delivery details, items, quantity, price, and total */}
                        {expandedDNIds.has(dn.id) && (
                          <tr className="bg-slate-50 border-y-2 border-blue-200">
                            <td colSpan={9} className="p-3 whitespace-normal">
                              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs space-y-3">
                                {/* Header logistics badges */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <div className="font-mono font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                      DN: {dn.deliveryNoteNumber}
                                    </div>
                                    <div><span className="text-slate-400">Carrier:</span> <strong className="text-slate-700">{dn.carrier || '—'}</strong></div>
                                    <div><span className="text-slate-400">Vehicle:</span> <strong className="text-slate-700 font-mono">{dn.vehicleNumber || '—'}</strong></div>
                                    <div><span className="text-slate-400">Driver:</span> <strong className="text-slate-700">{dn.driverName || '—'}</strong></div>
                                    <div><span className="text-slate-400">Received By:</span> <strong className="text-slate-700">{dn.receivedBy || '—'}</strong></div>
                                    {(dn.comment || dn.notes) && (
                                      <div className="bg-amber-50 text-amber-900 px-2.5 py-0.5 rounded border border-amber-200">
                                        <span className="font-bold">General Comment:</span> {dn.comment || dn.notes}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {onReloadDeliveryNote && (
                                      <button
                                        onClick={() => onReloadDeliveryNote(dn)}
                                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                        title="Open this delivery note in the Delivery Notes Creator to edit quantities and line items"
                                      >
                                        <Edit3 className="w-3 h-3" /> Open in Creator
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleOpenEditDN(dn)}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" /> Edit Delivery Note
                                    </button>
                                    <button
                                      onClick={() => setPrintingDN(dn)}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Printer className="w-3 h-3" /> Print Document
                                    </button>
                                    {canDeleteData(currentUser) && onDeleteDeliveryNote && (
                                      <button
                                        onClick={() => setDnPendingDelete(dn)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                        title="Permanently Delete Delivery Note (ADM Only)"
                                      >
                                        <Trash2 className="w-3 h-3" /> Delete DN
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Delivered line items table */}
                                <div className="border border-slate-200 rounded overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                                      <tr>
                                        <th className="py-1.5 px-2.5 w-8 text-center">#</th>
                                        <th className="py-1.5 px-2.5">Item Description</th>
                                        <th className="py-1.5 px-2.5">UOM</th>
                                        <th className="py-1.5 px-2.5 text-right">Delivered Qty</th>
                                        <th className="py-1.5 px-2.5 text-right">Unit Price (TZS)</th>
                                        <th className="py-1.5 px-2.5 text-right font-bold">Total Delivered Value (TZS)</th>
                                        <th className="py-1.5 px-2.5">Comments / Discrepancy</th>
                                        {isAdmin && <th className="py-1.5 px-2.5 text-center w-12">Action</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {(dn.lines || []).map((line, lIdx) => (
                                        <tr key={line.poLineId || lIdx} className="hover:bg-slate-50/70">
                                          <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[10px]">{lIdx + 1}</td>
                                          <td className="py-1.5 px-2.5 font-semibold text-slate-900">{line.itemDescription}</td>
                                          <td className="py-1.5 px-2.5 text-slate-600 uppercase text-[10px]">{line.unitOfMeasure || 'UNIT'}</td>
                                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-800">{line.deliveredQuantity}</td>
                                          <td className="py-1.5 px-2.5 text-right font-mono text-slate-600">TZS {formatCurrency(line.unitPrice)}</td>
                                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700">
                                            TZS {formatCurrency(line.valueAfterVat || (line.deliveredQuantity * line.unitPrice * 1.18))}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-slate-700 text-[11px]">
                                            {renderDeliveryLineCommentBadge(line, dn)}
                                          </td>
                                          {isAdmin && (
                                            <td className="py-1.5 px-2.5 text-center">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setLinePendingDelete({
                                                    deliveryNote: dn,
                                                    line,
                                                    lineIndex: lIdx,
                                                    source: 'accordion',
                                                  })
                                                }
                                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                                title="Permanently delete this line from database"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900 text-[11px]">
                                      <tr>
                                        <td colSpan={3} className="py-1.5 px-2.5 text-slate-600 uppercase tracking-wider">
                                          Delivery Totals ({dn.lines?.length || 0} items)
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-mono text-blue-700">
                                          {dn.totalDeliveredQuantity || (dn.lines || []).reduce((s, l) => s + (l.deliveredQuantity || 0), 0)}
                                        </td>
                                        <td className="py-1.5 px-2.5"></td>
                                        <td className="py-1.5 px-2.5 text-right font-mono text-emerald-700 text-xs">
                                          TZS {formatCurrency(dn.totalDeliveredValue || 0)}
                                        </td>
                                        <td className="py-1.5 px-2.5"></td>
                                        {isAdmin && <td className="py-1.5 px-2.5"></td>}
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>

                                {/* Attached Pictures & Document Scans */}
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>Attached Pictures & Scans for Delivery Note #{dn.deliveryNoteNumber}</span>
                                      {(dn.attachments || []).length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          {(dn.attachments || []).length} attached
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <ImageAttachmentManager
                                    attachments={dn.attachments || []}
                                    readOnly={!canEditScreen(currentUser, 'delivery_notes')}
                                    currentUser={currentUser}
                                    title=""
                                    description="Attach signed delivery leaflet, gate pass, or physical dispatch photos (PNG, JPG, WEBP)."
                                    compact={true}
                                    onChange={(updatedAttachments) => {
                                      const updatedDn = { ...dn, attachments: updatedAttachments };
                                      onSaveDeliveryNote(updatedDn);
                                    }}
                                  />
                                </div>

                                {/* Active Issue Banner if Flagged */}
                                {dn.hasIssue && (
                                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs text-amber-900">
                                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                      <div>
                                        <span className="font-bold">Flagged Issue:</span> {dn.issueComment || 'This delivery note has an active discrepancy registered.'}
                                        {dn.issueStatus && (
                                          <span className="ml-2 font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
                                            {dn.issueStatus}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {onViewIssuesTab && (
                                      <button
                                        type="button"
                                        onClick={onViewIssuesTab}
                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer shrink-0 inline-flex items-center gap-1 shadow-xs"
                                      >
                                        <ShieldAlert className="w-3.5 h-3.5" />
                                        View Issue & Pictures
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={dbPage}
              totalItems={sortedAndFilteredDatabaseDNs.length}
              pageSize={dbPageSize}
              onPageChange={setDbPage}
              onPageSizeChange={setDbPageSize}
              itemLabel="Delivery Notes"
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CALL OF ORDER VIEW                                                        */}
      {/* ========================================================================= */}
      {viewMode === 'call_of_order' && (
        <div className="space-y-5">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Standing Call of Orders
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{cooMetrics.total.toLocaleString()}</p>
                <p className="text-[11px] text-blue-600 font-medium mt-0.5">
                  {cooMetrics.unassignedCount} Unassigned · {cooMetrics.partialCount} Partial · {cooMetrics.fullyUtilizedCount} Full
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                <Package className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Total Call of Order Qty
                </p>
                <p className="text-2xl font-bold text-indigo-700 mt-1">
                  {cooMetrics.totalRegisteredUnits.toLocaleString()}
                </p>
                <p className="text-[11px] text-indigo-600 font-medium mt-0.5">Total registered item units</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                <Truck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Assigned to DN &amp; PO
                </p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {cooMetrics.totalAssignedUnits.toLocaleString()}
                </p>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Utilized across New DNs &amp; POs</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Remaining Unassigned Qty
                </p>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {cooMetrics.totalRemainingUnits.toLocaleString()}
                </p>
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">Available to assign to DN &amp; PO</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Call of Order Explanatory Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-blue-950 text-sm">
                  Standing Call of Order Management (Item Drill-Down &amp; Multi-DN / PO Fulfillment)
                </h4>
                <p className="text-slate-600 mt-0.5 leading-relaxed">
                  Only Call of Order deliveries with no direct PO linked are shown here. Each Call of Order DN acts like a <strong>Standing Purchase Order</strong>: click <strong>(+)</strong> on any DN to drill down into its item lines, click <strong>Edit / Add Items</strong> to add or modify items &amp; quantities, or click <strong>Assign DN &amp; PO</strong> to allocate full or partial item quantities to one or more <strong>New DN #s and PO #s</strong> while tracking utilized and remaining quantities until 100% utilized.
                </p>
              </div>
            </div>
            {onViewIssuesTab && (
              <button
                type="button"
                onClick={onViewIssuesTab}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shrink-0 inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                View in Resolution Hub
              </button>
            )}
          </div>

          {/* Filter & Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cooSearchTerm}
                    onChange={(e) => {
                      setCooSearchTerm(e.target.value);
                      setCooPage(1);
                    }}
                    placeholder="Search Call of Order DN, New DN, PO #, Item..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-72 focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>

                <select
                  value={cooCustomerFilter}
                  onChange={(e) => {
                    setCooCustomerFilter(e.target.value);
                    setCooPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="ALL">All Customers ({customers.length})</option>
                  {customers.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={cooStatusFilter}
                  onChange={(e) => {
                    setCooStatusFilter(e.target.value);
                    setCooPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="ALL">All Utilization Statuses</option>
                  <option value="UNASSIGNED">Unassigned (0% Utilized)</option>
                  <option value="PARTIAL">Partially Assigned (In Progress)</option>
                  <option value="FULLY_UTILIZED">100% Fully Utilized</option>
                </select>

                {filteredCallOfOrderDNs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedCooIds.size >= paginatedCallOfOrderDNs.length) {
                        setExpandedCooIds(new Set());
                      } else {
                        setExpandedCooIds(new Set(paginatedCallOfOrderDNs.map((d) => d.id)));
                      }
                    }}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {expandedCooIds.size >= paginatedCallOfOrderDNs.length ? (
                      <>
                        <Minus className="w-3.5 h-3.5" />
                        <span>Collapse All</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Drill All Items</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  Showing <strong>{filteredCallOfOrderDNs.length}</strong> of {callOfOrderDNs.length} Call of Orders
                </span>
                <button
                  type="button"
                  onClick={handleExportCallOfOrdersExcel}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewCallOfOrder}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Call of Order
                </button>
              </div>
            </div>

            {/* Call of Orders Standing Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-auto max-h-[680px] scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold uppercase text-[10px] sticky top-0 z-20 shadow-sm whitespace-nowrap">
                    <tr>
                      <th className="py-2.5 px-3">Call of Order DN # (Drill)</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer &amp; Vehicle</th>
                      <th className="py-2.5 px-3 min-w-[230px]">Registered Items</th>
                      <th className="py-2.5 px-3 text-right">Call of Order Qty</th>
                      <th className="py-2.5 px-3 text-right">Assigned Qty</th>
                      <th className="py-2.5 px-3 text-right">Remaining Qty</th>
                      <th className="py-2.5 px-3 min-w-[180px]">Assigned New DN # &amp; PO #</th>
                      <th className="py-2.5 px-3 min-w-[130px]">Standing Utilization</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCallOfOrderDNs.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-semibold text-slate-600">No Call of Order delivery notes match your filter.</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Click "+ New Call of Order" to record a Call of Order delivery note without a PO.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedCallOfOrderDNs.map((dn) => {
                        const util = cooUtilizationMap.get(dn.id) || getCallOfOrderUtilization(dn, deliveryNotes);
                        const isExpanded = expandedCooIds.has(dn.id);
                        const validLines = util.lines.filter(
                          (lu) =>
                            !(
                              lu.line.poLineId === 'CALL-OF-ORDER-LINE' &&
                              lu.originalQty === 0 &&
                              lu.line.itemDescription === 'Direct Delivery Item'
                            )
                        );
                        const lineCount = validLines.length;

                        return (
                          <React.Fragment key={dn.id}>
                            <tr
                              className={`hover:bg-slate-50/90 transition-colors ${
                                isExpanded ? 'bg-blue-50/40' : ''
                              }`}
                            >
                              {/* DN Number + Drill Toggle */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandCoo(dn.id)}
                                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${
                                      isExpanded
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                    }`}
                                    title={
                                      isExpanded
                                        ? 'Hide items & DN/PO assignment breakdown'
                                        : 'Drill down (+) to view items inside this Call of Order DN and their DN/PO assignments'
                                    }
                                  >
                                    {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleExpandCoo(dn.id)}
                                    className="font-mono font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer text-left"
                                    title="Click to drill down and view items inside this Call of Order DN"
                                  >
                                    {dn.deliveryNoteNumber}
                                  </button>

                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-800 font-bold tracking-tight">
                                    Call of Order
                                  </span>
                                </div>
                              </td>

                              {/* Delivery Date */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                                {dn.deliveryDate || '—'}
                              </td>

                              {/* Customer & Vehicle */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-800">{dn.customerName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {dn.vehicleNumber ? `Veh: ${dn.vehicleNumber}` : 'No Vehicle'}{' '}
                                    {dn.driverName ? `· ${dn.driverName}` : ''}
                                  </span>
                                </div>
                              </td>

                              {/* Registered Items Summary */}
                              <td className="py-2.5 px-3">
                                {lineCount > 0 ? (
                                  <div
                                    onClick={() => toggleExpandCoo(dn.id)}
                                    className="flex flex-wrap items-center gap-1.5 max-w-xs cursor-pointer"
                                    title="Click to drill down into all items"
                                  >
                                    {validLines.slice(0, 2).map((lu, idx) => (
                                      <span
                                        key={lu.lineKey || idx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-medium"
                                      >
                                        <Package className="w-3 h-3 text-blue-600 shrink-0" />
                                        <span className="font-bold text-blue-900">{lu.originalQty}</span>
                                        <span className="text-[10px] text-slate-500">{lu.line.unitOfMeasure || 'PCS'}</span>
                                        <span className="truncate max-w-[110px]">{lu.line.itemDescription}</span>
                                      </span>
                                    ))}
                                    {lineCount > 2 && (
                                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                        +{lineCount - 2} more
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditCallOfOrder(dn)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold cursor-pointer"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                    No items — Click to Add Items &amp; Qty
                                  </button>
                                )}
                              </td>

                              {/* Call of Order Qty */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold text-slate-900">
                                {util.totalOriginalQty.toLocaleString()}
                              </td>

                              {/* Assigned Qty */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold text-emerald-700">
                                {util.totalAssignedQty.toLocaleString()}
                              </td>

                              {/* Remaining Qty */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold">
                                <span
                                  className={
                                    util.totalRemainingQty > 0
                                      ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                                      : 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200'
                                  }
                                >
                                  {util.totalRemainingQty.toLocaleString()}
                                </span>
                              </td>

                              {/* Assigned New DN # & PO # */}
                              <td className="py-2.5 px-3">
                                {util.allAllocations.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                                    {Array.from(
                                      new Set(
                                        util.allAllocations.map((a) => `${a.childDnNumber} → PO: ${a.poNumber}`)
                                      )
                                    ).map((badgeStr, bIdx) => (
                                      <span
                                        key={bIdx}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      >
                                        <Link2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                        <span>{badgeStr}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>No DN / PO Assigned Yet</span>
                                  </span>
                                )}
                              </td>

                              {/* Standing Utilization */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="space-y-1 min-w-[115px]">
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span
                                      className={
                                        util.status === 'FULLY_UTILIZED'
                                          ? 'text-emerald-700'
                                          : util.status === 'PARTIAL'
                                          ? 'text-blue-700'
                                          : 'text-amber-700'
                                      }
                                    >
                                      {util.status === 'FULLY_UTILIZED'
                                        ? '100% Utilized'
                                        : util.status === 'PARTIAL'
                                        ? `${util.overallPct}% Partial`
                                        : '0% Unassigned'}
                                    </span>
                                    <span className="font-mono text-slate-500">
                                      {util.totalAssignedQty}/{util.totalOriginalQty}
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${
                                        util.status === 'FULLY_UTILIZED'
                                          ? 'bg-emerald-500'
                                          : util.status === 'PARTIAL'
                                          ? 'bg-blue-600'
                                          : 'bg-amber-400'
                                      }`}
                                      style={{ width: `${Math.max(util.overallPct, util.status === 'UNASSIGNED' ? 4 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditCallOfOrder(dn)}
                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Open this Call of Order DN in Edit Form to edit or add items and quantities"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit / Add Items</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenLinkPoModal(dn)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                                    title="Open Edit & Link Form to assign items & quantities to a New DN # and PO #"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    <span>Assign DN &amp; PO</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPrintingDN({
                                        ...dn,
                                        lines: util.lines.map((lu) => lu.line),
                                        totalDeliveredQuantity: util.totalOriginalQty,
                                      })
                                    }
                                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md cursor-pointer transition-colors"
                                    title="Print Call of Order Delivery Note"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>

                                  {canDeleteData(currentUser) && (
                                    <button
                                      type="button"
                                      onClick={() => setDnPendingDelete(dn)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer transition-colors"
                                      title="Delete Call of Order Delivery Note"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* DRILL-DOWN EXPANDED ROW: View items inside Call of Order DN + Assigned DN & PO Breakdown */}
                            {isExpanded && (
                              <tr className="bg-slate-50/95 border-y-2 border-blue-200">
                                <td colSpan={10} className="p-4 whitespace-normal">
                                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
                                    {/* Drill-Down Header Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                      <div className="flex flex-wrap items-center gap-3">
                                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono font-bold text-xs">
                                          Standing Call of Order DN: {dn.deliveryNoteNumber}
                                        </span>
                                        <span className="text-xs text-slate-600">
                                          Customer: <strong className="text-slate-900">{dn.customerName}</strong>
                                        </span>
                                        <span className="text-xs text-slate-600">
                                          Date: <strong className="text-slate-800">{dn.deliveryDate || '—'}</strong>
                                        </span>
                                        {dn.destination && (
                                          <span className="text-xs text-slate-600">
                                            Destination: <strong className="text-slate-800">{dn.destination}</strong>
                                          </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono font-bold text-xs">
                                          Registered: {util.totalOriginalQty} · Assigned: {util.totalAssignedQty} · Remaining: {util.totalRemainingQty}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditCallOfOrder(dn)}
                                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                          Edit / Add Items &amp; Qty
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenLinkPoModal(dn)}
                                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Link2 className="w-3.5 h-3.5" />
                                          Assign Items to New DN # &amp; PO #
                                        </button>
                                      </div>
                                    </div>

                                    {/* 1. Item Lines & Remaining Quantities Table */}
                                    <div className="space-y-2">
                                      <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                        <Package className="w-4 h-4 text-blue-600" />
                                        Items Registered Under Call of Order {dn.deliveryNoteNumber} &amp; Line Utilization
                                      </h5>

                                      {validLines.length === 0 ? (
                                        <div className="p-6 text-center bg-amber-50/60 border border-amber-200 rounded-xl">
                                          <p className="text-xs font-semibold text-amber-900">
                                            No item lines have been added to Call of Order {dn.deliveryNoteNumber} yet.
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditCallOfOrder(dn)}
                                            className="mt-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add Items &amp; Quantities Now
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                              <tr>
                                                <th className="py-2 px-2.5 w-8 text-center">#</th>
                                                <th className="py-2 px-2.5">Item Description</th>
                                                <th className="py-2 px-2.5 w-16">UOM</th>
                                                <th className="py-2 px-2.5 text-right">Call of Order Qty</th>
                                                <th className="py-2 px-2.5 text-right">Assigned Qty (to DN &amp; PO)</th>
                                                <th className="py-2 px-2.5 text-right">Remaining Qty</th>
                                                <th className="py-2 px-2.5 w-36">Line Utilization</th>
                                                <th className="py-2 px-2.5">Assigned New DN # &amp; PO # Breakdown</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                              {validLines.map((lu, lIdx) => (
                                                <tr key={lu.lineKey || lIdx} className="hover:bg-slate-50/80">
                                                  <td className="py-2 px-2.5 text-center font-mono text-slate-400 font-bold">
                                                    {lIdx + 1}
                                                  </td>
                                                  <td className="py-2 px-2.5 font-semibold text-slate-900">
                                                    {lu.line.itemDescription}
                                                  </td>
                                                  <td className="py-2 px-2.5 text-slate-600 font-mono text-[11px]">
                                                    {lu.line.unitOfMeasure || 'PCS'}
                                                  </td>
                                                  <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                                                    {lu.originalQty.toLocaleString()}
                                                  </td>
                                                  <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700">
                                                    {lu.assignedQty.toLocaleString()}
                                                  </td>
                                                  <td className="py-2 px-2.5 text-right font-mono font-bold">
                                                    <span
                                                      className={
                                                        lu.remainingQty > 0
                                                          ? 'px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200'
                                                          : 'px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                      }
                                                    >
                                                      {lu.remainingQty.toLocaleString()}
                                                    </span>
                                                  </td>
                                                  <td className="py-2 px-2.5">
                                                    <div className="space-y-1">
                                                      <div className="flex items-center justify-between text-[10px] font-bold">
                                                        <span
                                                          className={
                                                            lu.remainingQty <= 0 && lu.originalQty > 0
                                                              ? 'text-emerald-700'
                                                              : lu.assignedQty > 0
                                                              ? 'text-blue-700'
                                                              : 'text-slate-500'
                                                          }
                                                        >
                                                          {lu.utilizationPct}%
                                                        </span>
                                                        <span className="font-mono text-slate-400">
                                                          {lu.assignedQty}/{lu.originalQty}
                                                        </span>
                                                      </div>
                                                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                        <div
                                                          className={`h-full ${
                                                            lu.remainingQty <= 0 && lu.originalQty > 0
                                                              ? 'bg-emerald-500'
                                                              : lu.assignedQty > 0
                                                              ? 'bg-blue-600'
                                                              : 'bg-slate-300'
                                                          }`}
                                                          style={{ width: `${lu.utilizationPct}%` }}
                                                        />
                                                      </div>
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-2.5">
                                                    {lu.allocations.length > 0 ? (
                                                      <div className="flex flex-wrap gap-1.5">
                                                        {lu.allocations.map((alloc) => (
                                                          <span
                                                            key={alloc.allocationId}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-mono font-semibold"
                                                          >
                                                            <strong className="text-blue-700">DN: {alloc.childDnNumber}</strong>
                                                            <span className="text-slate-400">→</span>
                                                            <strong className="text-emerald-800">PO: {alloc.poNumber}</strong>
                                                            <span className="px-1 py-0.2 bg-white rounded border border-emerald-200 text-slate-900 font-bold">
                                                              Qty: {alloc.allocatedQuantity}
                                                            </span>
                                                          </span>
                                                        ))}
                                                      </div>
                                                    ) : (
                                                      <span className="text-[11px] text-slate-400 italic">
                                                        Not yet assigned to any New DN or PO
                                                      </span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot className="bg-slate-100 font-bold border-t border-slate-200 text-slate-900 text-xs">
                                              <tr>
                                                <td colSpan={3} className="py-2 px-2.5 uppercase text-[10px] tracking-wider text-slate-600">
                                                  Standing Call of Order Totals ({validLines.length} lines)
                                                </td>
                                                <td className="py-2 px-2.5 text-right font-mono text-slate-900">
                                                  {util.totalOriginalQty.toLocaleString()}
                                                </td>
                                                <td className="py-2 px-2.5 text-right font-mono text-emerald-700">
                                                  {util.totalAssignedQty.toLocaleString()}
                                                </td>
                                                <td className="py-2 px-2.5 text-right font-mono text-amber-800">
                                                  {util.totalRemainingQty.toLocaleString()}
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-blue-700">
                                                  {util.overallPct}% Utilized
                                                </td>
                                                <td className="py-2 px-2.5 text-[11px] text-slate-600">
                                                  {util.distinctChildDnNumbers.length} New DN(s) · {util.distinctPoNumbers.length} PO(s)
                                                </td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      )}
                                    </div>

                                    {/* 2. Assigned Delivery Notes & POs Fulfillment History Table */}
                                    {util.allAllocations.length > 0 && (
                                      <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <h5 className="font-bold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                          <Link2 className="w-4 h-4 text-emerald-600" />
                                          Assigned New Delivery Notes &amp; Linked Purchase Orders History ({util.allAllocations.length})
                                        </h5>
                                        <div className="border border-emerald-200 rounded-lg overflow-hidden">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-emerald-50 text-emerald-950 font-bold uppercase text-[10px] border-b border-emerald-200">
                                              <tr>
                                                <th className="py-1.5 px-2.5">Assigned New DN #</th>
                                                <th className="py-1.5 px-2.5">Linked PO #</th>
                                                <th className="py-1.5 px-2.5">Item Description</th>
                                                <th className="py-1.5 px-2.5 text-right">Assigned Qty</th>
                                                <th className="py-1.5 px-2.5 text-right">PO Unit Price</th>
                                                <th className="py-1.5 px-2.5">Assigned Date</th>
                                                <th className="py-1.5 px-2.5 text-center">Child DN Action</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-emerald-100 bg-white">
                                              {util.allAllocations.map((alloc) => {
                                                const childDnObj = deliveryNotes.find(
                                                  (d) =>
                                                    d.id === alloc.childDnId ||
                                                    d.deliveryNoteNumber.trim().toLowerCase() ===
                                                      alloc.childDnNumber.trim().toLowerCase()
                                                );
                                                return (
                                                  <tr key={alloc.allocationId} className="hover:bg-emerald-50/40">
                                                    <td className="py-1.5 px-2.5 font-mono font-bold text-blue-700">
                                                      {alloc.childDnNumber}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 font-mono font-bold text-emerald-800">
                                                      {alloc.poNumber}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 font-medium text-slate-900">
                                                      {alloc.poItemDescription || alloc.cooItemDescription}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700">
                                                      {alloc.allocatedQuantity.toLocaleString()}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-right font-mono text-slate-600">
                                                      {alloc.unitPrice ? `TZS ${formatCurrency(alloc.unitPrice)}` : '—'}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-slate-500 text-[11px]">
                                                      {alloc.allocatedAt ? alloc.allocatedAt.split('T')[0] : '—'}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-center">
                                                      {childDnObj ? (
                                                        <div className="inline-flex items-center gap-1">
                                                          <button
                                                            type="button"
                                                            onClick={() => setPrintingDN(childDnObj)}
                                                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                                          >
                                                            <Printer className="w-3 h-3" /> Print DN
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={() => handleOpenEditDN(childDnObj)}
                                                            className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                                          >
                                                            <Edit3 className="w-3 h-3" /> Edit Child DN
                                                          </button>
                                                        </div>
                                                      ) : (
                                                        <span className="text-[10px] text-slate-400">Recorded</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <TablePagination
                currentPage={cooPage}
                totalItems={filteredCallOfOrderDNs.length}
                pageSize={cooPageSize}
                onPageChange={setCooPage}
                onPageSizeChange={setCooPageSize}
                itemLabel="Call of Orders"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EDIT / ADD CALL OF ORDER MANUAL ITEM LINES                       */}
      {/* ========================================================================= */}
      {isCooEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    {cooEditingDN ? 'Edit Call of Order DN & Item Quantities' : 'New Standing Call of Order Delivery Note'}
                    <span className="font-mono text-blue-300 text-xs px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30">
                      {cooModalDNNumber || 'Draft'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Add or edit items and quantities inside this Call of Order DN. Existing DN/PO assignments are automatically preserved.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCooEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {cooModalError && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-700 flex items-center gap-2 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{cooModalError}</span>
                </div>
              )}

              {/* Delivery Header Information */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Call of Order Delivery Note Header
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Customer Name <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={cooModalCustomer}
                      onChange={(e) => setCooModalCustomer(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Select Customer...</option>
                      {customers.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Call of Order DN # <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cooModalDNNumber}
                      onChange={(e) => setCooModalDNNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. MRGR0381"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Delivery Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={cooModalDate}
                      onChange={(e) => setCooModalDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      value={cooModalVehicle}
                      onChange={(e) => setCooModalVehicle(e.target.value.toUpperCase())}
                      placeholder="e.g. T 123 ABC"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Driver Name</label>
                    <input
                      type="text"
                      value={cooModalDriver}
                      onChange={(e) => setCooModalDriver(e.target.value)}
                      placeholder="e.g. Juma Ally"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Destination / Location</label>
                    <input
                      type="text"
                      value={cooModalDestination}
                      onChange={(e) => setCooModalDestination(e.target.value)}
                      placeholder="e.g. Mine Site Depot"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Delivery Notes / Remarks</label>
                  <input
                    type="text"
                    value={cooModalNotes}
                    onChange={(e) => setCooModalNotes(e.target.value)}
                    placeholder="e.g. [Call of Order] Urgent stock requested by site manager pending formal PO release"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Line Items Entry Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-blue-600" />
                      Call of Order Item Lines &amp; Quantities
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Add or edit items and quantities inside this Call of Order DN.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCooModalLine}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item Line
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-2.5 w-8 text-center">#</th>
                        <th className="py-2 px-2.5 min-w-[220px]">
                          Item Name / Description <span className="text-red-500">*</span>
                        </th>
                        <th className="py-2 px-2.5 w-28">
                          Call of Order Qty <span className="text-red-500">*</span>
                        </th>
                        <th className="py-2 px-2.5 w-24">UOM</th>
                        <th className="py-2 px-2.5 w-28">Est. Unit Price</th>
                        <th className="py-2 px-2.5">Line Comment</th>
                        <th className="py-2 px-2.5 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {cooModalLines.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-slate-50/70">
                          <td className="py-2 px-2.5 text-center text-slate-400 font-mono font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              value={line.itemDescription}
                              onChange={(e) => handleUpdateCooModalLine(idx, 'itemDescription', e.target.value)}
                              placeholder="e.g. White Refined Sugar 50kg Bags"
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.deliveredQuantity || ''}
                              onChange={(e) =>
                                handleUpdateCooModalLine(idx, 'deliveredQuantity', parseFloat(e.target.value) || 0)
                              }
                              placeholder="0"
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <select
                              value={line.unitOfMeasure}
                              onChange={(e) => handleUpdateCooModalLine(idx, 'unitOfMeasure', e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            >
                              <option value="PCS">PCS</option>
                              <option value="BAGS">BAGS</option>
                              <option value="KGS">KGS</option>
                              <option value="CTNS">CTNS</option>
                              <option value="PKTS">PKTS</option>
                              <option value="BUNDLES">BUNDLES</option>
                              <option value="MT">MT</option>
                              <option value="LITRES">LITRES</option>
                            </select>
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.unitPrice || ''}
                              onChange={(e) =>
                                handleUpdateCooModalLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                              }
                              placeholder="0"
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              value={line.comment}
                              onChange={(e) => handleUpdateCooModalLine(idx, 'comment', e.target.value)}
                              placeholder="[Call of Order]"
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            {cooModalLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCooModalLine(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition-colors"
                                title="Remove item line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs">
                  <div className="flex items-center gap-2 text-blue-900 font-medium">
                    <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      This Call of Order DN acts like a standing order. After saving, you can assign its items &amp; quantities to one or more <strong>New DN #s and PO #s</strong>.
                    </span>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-800 shrink-0">
                    Total Call of Order Qty:{' '}
                    <span className="text-blue-700 text-sm">
                      {cooModalLines
                        .reduce((acc, l) => acc + (Number(l.deliveredQuantity) || 0), 0)
                        .toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsCooEditModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCallOfOrderModal}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                Save Call of Order Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ASSIGN / LINK CALL OF ORDER TO NEW DN # & PO #                   */}
      {/* ========================================================================= */}
      {isCooLinkModalOpen && cooLinkingDN && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    Assign Call of Order Items to New DN # &amp; Purchase Order
                    <span className="font-mono text-blue-300 text-xs px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30">
                      Standing Call of Order: {cooLinkingDN.deliveryNoteNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Customer: <span className="text-white font-semibold">{cooLinkingDN.customerName}</span> · Call of Order quantities are <span className="text-amber-300 font-semibold">read-only</span> here — enter the <span className="text-emerald-300 font-semibold">Assigned Qty</span> against the Call of Order to create a separate <span className="text-emerald-300 font-semibold">New DN #</span> &amp; <span className="text-emerald-300 font-semibold">PO #</span>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCooLinkModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {cooLinkError && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-700 flex items-center gap-2 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{cooLinkError}</span>
                </div>
              )}

              {/* Step 1: New DN # & PO # Assignment Header */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    1. Standing Call of Order DN, Separate New Delivery Note # &amp; Target Purchase Order
                  </h4>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cooLinkShowAllCustomersPo}
                      onChange={(e) => setCooLinkShowAllCustomersPo(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Show POs from all customers</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Standing Call of Order DN # (Read-Only)
                    </label>
                    <input
                      type="text"
                      value={cooLinkingDN.deliveryNoteNumber}
                      readOnly
                      disabled
                      className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-800 cursor-not-allowed"
                    />
                    <span className="text-[10px] text-slate-500">Nil record on DN · Tracked in Call of Order table</span>
                  </div>

                  <div>
                    <label className="font-semibold text-emerald-800 block mb-1">
                      New Delivery Note # (New DN #) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cooLinkNewDnNumber}
                      onChange={(e) => setCooLinkNewDnNumber(e.target.value.toUpperCase())}
                      placeholder="Enter New DN # (e.g. CRU045)"
                      className="w-full px-2.5 py-1.5 bg-white border-2 border-emerald-400 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-emerald-700 font-medium">Recorded as separate DN under selected PO</span>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-700 block mb-1">
                      Target Purchase Order (PO #) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={cooSelectedPoNumber}
                        onChange={(e) => {
                          const newPo = e.target.value;
                          setCooSelectedPoNumber(newPo);
                          const poObj = poGroups.find((g) => g.poNumber === newPo);
                          const autoMap = buildAutoPoMappingsForLines(newPo, cooLinkLines);
                          setCooLinkLines((prev) =>
                            prev.map((line) => {
                              const mappedId = autoMap[line.id] || '';
                              const matchedPoLine = (poObj?.lines || []).find((pl) => pl.id === mappedId);
                              return {
                                ...line,
                                mappedPoLineId: mappedId,
                                unitPrice: matchedPoLine?.unitPrice || line.unitPrice || 0,
                              };
                            })
                          );
                        }}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="">-- Select Official PO --</option>
                        {(cooLinkShowAllCustomersPo
                          ? poGroups
                          : poGroups.filter((g) => g.customerName === cooLinkingDN.customerName)
                        ).map((po) => (
                          <option key={po.poNumber} value={po.poNumber}>
                            {po.poNumber} — {po.customerName} ({po.lines.length} items, Dest: {po.destination || 'Main'})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={cooSelectedPoNumber}
                        onChange={(e) => setCooSelectedPoNumber(e.target.value.toUpperCase())}
                        placeholder="Or type PO #"
                        className="w-36 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        title="Select from dropdown or type a custom PO number"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Assignment Date</label>
                    <input
                      type="date"
                      value={cooLinkDate}
                      onChange={(e) => setCooLinkDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      value={cooLinkVehicle}
                      onChange={(e) => setCooLinkVehicle(e.target.value.toUpperCase())}
                      placeholder="Vehicle #"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Driver Name</label>
                    <input
                      type="text"
                      value={cooLinkDriver}
                      onChange={(e) => setCooLinkDriver(e.target.value)}
                      placeholder="Driver Name"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Destination</label>
                    <input
                      type="text"
                      value={cooLinkDestination}
                      onChange={(e) => setCooLinkDestination(e.target.value)}
                      placeholder="Destination"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Read-Only Call of Order Items & Editable Assigned Qty Against Call of Order */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-blue-600" />
                      2. Assign Quantities Against Call of Order {cooLinkingDN.deliveryNoteNumber} to New DN #{cooLinkNewDnNumber || '...'} &amp; PO #{cooSelectedPoNumber || '...'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Call of Order items and quantities are locked (read-only) during assignment. Only <strong>Assigned Qty (Against Call of Order)</strong> is editable here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const targetDn = cooLinkingDN;
                      setIsCooLinkModalOpen(false);
                      handleOpenEditCallOfOrder(targetDn);
                    }}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Switch to Edit / Add Call of Order Items
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-2.5 w-10 text-center">Assign?</th>
                          <th className="py-2.5 px-2.5 min-w-[200px]">Call of Order Item Description (Read-Only)</th>
                          <th className="py-2.5 px-2.5 w-20">UOM</th>
                          <th className="py-2.5 px-2.5 w-32 text-right">Call of Order Qty (Locked)</th>
                          <th className="py-2.5 px-2.5 w-28 text-right">Already Assigned</th>
                          <th className="py-2.5 px-2.5 w-36 text-right bg-emerald-900/60">
                            Assigned Qty (Against Call of Order)
                          </th>
                          <th className="py-2.5 px-2.5 w-28 text-right">Remaining After</th>
                          <th className="py-2.5 px-2.5 min-w-[230px]">Map to Official PO Line Item</th>
                          <th className="py-2.5 px-2.5 w-24 text-right">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {cooLinkLines.map((line, idx) => {
                          const poObj = poGroups.find((g) => g.poNumber === cooSelectedPoNumber);
                          const poLinesList = poObj?.lines || [];
                          const maxAvailable = Math.max(
                            0,
                            Math.round(((Number(line.callOfOrderQty) || 0) - (Number(line.alreadyAssignedQty) || 0)) * 100) / 100
                          );
                          const currentAssign = line.isSelected ? Number(line.assignQty) || 0 : 0;
                          const remainingAfter = Math.max(
                            0,
                            Math.round((maxAvailable - currentAssign) * 100) / 100
                          );

                          return (
                            <tr
                              key={line.id || idx}
                              className={`hover:bg-slate-50 ${line.isSelected ? 'bg-emerald-50/20' : 'opacity-75'}`}
                            >
                              {/* Checkbox */}
                              <td className="py-2 px-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={line.isSelected}
                                  disabled={maxAvailable <= 0}
                                  onChange={(e) =>
                                    handleUpdateCooLinkModalLine(idx, 'isSelected', e.target.checked)
                                  }
                                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                                />
                              </td>

                              {/* Read-Only Item Description */}
                              <td className="py-2 px-2.5">
                                <div className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-semibold text-slate-800 select-none">
                                  {line.itemDescription}
                                </div>
                              </td>

                              {/* Read-Only UOM */}
                              <td className="py-2 px-2.5">
                                <div className="px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono font-semibold text-slate-700 text-center select-none">
                                  {line.unitOfMeasure || 'PCS'}
                                </div>
                              </td>

                              {/* Read-Only Call of Order Total Qty */}
                              <td className="py-2 px-2.5 text-right">
                                <span
                                  className="inline-block w-24 px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-md text-xs font-mono font-bold text-slate-800 text-right select-none cursor-not-allowed"
                                  title="Call of Order Quantity is read-only when assigning to a New DN"
                                >
                                  {Number(line.callOfOrderQty || 0).toLocaleString()}
                                </span>
                              </td>

                              {/* Already Assigned Qty */}
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-600">
                                {line.alreadyAssignedQty.toLocaleString()}
                              </td>

                              {/* Editable Assigned Qty Against Call of Order */}
                              <td className="py-2 px-2.5 text-right bg-emerald-50/40">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxAvailable}
                                    step="any"
                                    disabled={!line.isSelected || maxAvailable <= 0}
                                    value={line.assignQty || ''}
                                    onChange={(e) =>
                                      handleUpdateCooLinkModalLine(
                                        idx,
                                        'assignQty',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="w-20 px-2 py-1 bg-white border-2 border-emerald-400 rounded-md text-xs font-mono font-bold text-emerald-900 text-right focus:ring-1 focus:ring-emerald-500 focus:outline-none disabled:opacity-50"
                                  />
                                  {maxAvailable > 0 && line.assignQty !== maxAvailable && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleUpdateCooLinkModalLine(idx, 'isSelected', true);
                                        handleUpdateCooLinkModalLine(idx, 'assignQty', maxAvailable);
                                      }}
                                      className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[9px] font-bold cursor-pointer"
                                      title="Assign all remaining quantity"
                                    >
                                      Max
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Remaining After This Assignment */}
                              <td className="py-2 px-2.5 text-right font-mono font-bold">
                                <span
                                  className={
                                    remainingAfter > 0
                                      ? 'px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  }
                                >
                                  {remainingAfter.toLocaleString()}
                                </span>
                              </td>

                              {/* Map to PO Line Item */}
                              <td className="py-2 px-2.5">
                                <select
                                  value={line.mappedPoLineId || ''}
                                  onChange={(e) =>
                                    handleUpdateCooLinkModalLine(idx, 'mappedPoLineId', e.target.value)
                                  }
                                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                >
                                  <option value="">-- Custom / Unmapped PO Line --</option>
                                  {poLinesList.map((pl) => (
                                    <option key={pl.id} value={pl.id}>
                                      {pl.itemDescription} (PO Qty: {pl.orderedQuantity}, Undeliv: {pl.undeliveredQuantity ?? pl.orderedQuantity}, Rate: {formatCurrency(pl.unitPrice || 0)})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Unit Price */}
                              <td className="py-2 px-2.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={line.unitPrice || ''}
                                  onChange={(e) =>
                                    handleUpdateCooLinkModalLine(
                                      idx,
                                      'unitPrice',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-24 px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono text-right text-slate-700"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Assignment Summary Banner */}
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-950">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Zero Double-Count Guarantee:</span> Confirming will record a <strong>separate Delivery Note</strong>{' '}
                      <strong className="font-mono text-blue-700">{cooLinkNewDnNumber || '(New DN #)'}</strong> under Purchase Order{' '}
                      <strong className="font-mono text-emerald-800">{cooSelectedPoNumber || '(PO #)'}</strong> with the assigned quantities, while original Call of Order{' '}
                      <strong className="font-mono text-blue-800">{cooLinkingDN.deliveryNoteNumber}</strong> remains a NIL Delivery Note record tracking utilized and remaining balances in the Call of Order table.
                    </div>
                  </div>
                  <div className="flex items-center gap-4 font-mono font-bold shrink-0 bg-white px-3 py-1.5 rounded-lg border border-emerald-200">
                    <div>
                      Assigning Now:{' '}
                      <span className="text-emerald-700">
                        {cooLinkLines
                          .filter((l) => l.isSelected)
                          .reduce((s, l) => s + (Number(l.assignQty) || 0), 0)
                          .toLocaleString()}
                      </span>
                    </div>
                    <div>
                      Remaining After:{' '}
                      <span className="text-amber-700">
                        {cooLinkLines
                          .reduce((s, l) => {
                            const maxAv = Math.max(0, (Number(l.callOfOrderQty) || 0) - (Number(l.alreadyAssignedQty) || 0));
                            const cur = l.isSelected ? Number(l.assignQty) || 0 : 0;
                            return s + Math.max(0, maxAv - cur);
                          }, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsCooLinkModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLinkPo}
                disabled={!cooSelectedPoNumber.trim() || !cooLinkNewDnNumber.trim()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Link2 className="w-4 h-4" />
                Create Separate DN #{cooLinkNewDnNumber || '...'} &amp; Link to PO #{cooSelectedPoNumber || '...'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Customer Delivery Series Book Setup */}
      {isBookModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base">Customer Delivery Series Book Setup</h3>
              </div>
              <button
                onClick={() => setIsBookModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Each customer has their own dedicated prefix and serial number range for delivery notes (e.g. CRU001–CRU200, GRB001–GRB100).
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Name</label>
                <input
                  type="text"
                  disabled
                  value={activeCustomer}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Delivery Prefix (e.g. CRU, GRB)
                  </label>
                  <input
                    type="text"
                    value={bookPrefix}
                    onChange={(e) => setBookPrefix(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Padding Digits
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={bookPadding}
                    onChange={(e) => setBookPadding(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Number</label>
                  <input
                    type="number"
                    value={bookStartNum}
                    onChange={(e) => setBookStartNum(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Number</label>
                  <input
                    type="number"
                    value={bookEndNum}
                    onChange={(e) => setBookEndNum(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Current Serial #</label>
                  <input
                    type="number"
                    value={bookCurrentNum}
                    onChange={(e) => setBookCurrentNum(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-blue-400 rounded-lg font-bold text-blue-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
                Preview Next Number:{' '}
                <span className="font-mono font-bold text-blue-900">
                  {formatSeriesNumber(bookPrefix, bookCurrentNum, bookPadding)}
                </span>{' '}
                (Range: {formatSeriesNumber(bookPrefix, bookStartNum, bookPadding)} to {formatSeriesNumber(bookPrefix, bookEndNum, bookPadding)})
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
              {activeCustomerBook ? (
                <button
                  type="button"
                  onClick={handleDeleteCustomerBook}
                  className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Delete this series book"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Book
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBookModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomerBookSettings}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Book Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mark Delivery Note Number as Cancelled (No PO Reference) */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Ban className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Cancel Delivery Note Number</h3>
              </div>
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Mark delivery note leaflet <span className="font-mono font-bold text-red-600">{dnNumber}</span> as Cancelled (No PO Reference). This records the cancelled serial number in the database and automatically advances to the next serial number.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Attribution</label>
                <input
                  type="text"
                  disabled
                  value={activeCustomer}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cancellation Reason</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-red-500 font-medium"
                >
                  <option value="No PO reference">No PO reference</option>
                  <option value="Spoiled / Voided physical DN leaflet">Spoiled / Voided physical DN leaflet</option>
                  <option value="Order cancelled before dispatch">Order cancelled before dispatch</option>
                  <option value="Printed with errors - replaced">Printed with errors - replaced</option>
                  <option value="Other custom reason">Other custom reason</option>
                </select>
              </div>

              {cancelReason === 'Other custom reason' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Custom Note</label>
                  <input
                    type="text"
                    value={customCancelNote}
                    onChange={(e) => setCustomCancelNote(e.target.value)}
                    placeholder="Enter reason..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-red-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelDeliveryNumber}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                Confirm & Mark Cancelled
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Add New Customer</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Geita Gold Mining Ltd"
                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Prefix</label>
                  <input
                    type="text"
                    value={newCustPrefix}
                    onChange={(e) => setNewCustPrefix(e.target.value)}
                    placeholder="e.g. GGM"
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs uppercase font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start #</label>
                  <input
                    type="number"
                    value={newCustStart}
                    onChange={(e) => setNewCustStart(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewCustomer}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print / PDF Modal */}
      {printingDN && (
        <DeliveryNotePrintModal
          deliveryNote={printingDN}
          onClose={() => setPrintingDN(null)}
        />
      )}

      {/* RESTRICTED EDIT DELIVERY NOTE MODAL */}
      {editingDNModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    Edit Delivery Note Details
                    <span className="font-mono text-amber-300 text-xs px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                      {editingDNModal.deliveryNoteNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Customer: <strong className="text-slate-200">{editingDNModal.customerName}</strong> | PO:{' '}
                    <strong className="text-slate-200 font-mono">{editingDNModal.poNumber}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingDNModal(null);
                  setEditDNError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Restricted policy badge */}
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Restricted Edit Access:</strong> Edit Delivery Note number, Date, Delivered Quantities, Logistics / Notes, and Flag Status. Line values and totals are updated automatically.
              </span>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {editDNError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{editDNError}</span>
                </div>
              )}

              {/* Allowed header edit fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {/* 1. Delivery Note Number */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    Delivery Note No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editDNNumber}
                    onChange={(e) => setEditDNNumber(e.target.value)}
                    placeholder="e.g. CRU001"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 2. Delivery Date */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    Delivery Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editDNDate}
                    onChange={(e) => setEditDNDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 3. Flag Status */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Flag Status
                  </label>
                  <select
                    value={editDNFlagStatus}
                    onChange={(e) => setEditDNFlagStatus(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE (Normal / Approved)</option>
                    <option value="FLAGGED">FLAGGED (Discrepancy / Issue)</option>
                    <option value="CANCELLED">CANCELLED (Cancelled / Void)</option>
                    <option value="OFR">OFR (Out of Range)</option>
                    <option value="CALL_OF_ORDER">CALL OF ORDER (Issue / Discrepancy)</option>
                  </select>
                </div>

                {/* 4. Vehicle Number */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={editDNVehicle}
                    onChange={(e) => setEditDNVehicle(e.target.value)}
                    placeholder="e.g. T 123 ABC"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Logistics details row */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Carrier / Transporter
                  </label>
                  <input
                    type="text"
                    value={editDNCarrier}
                    onChange={(e) => setEditDNCarrier(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={editDNDriver}
                    onChange={(e) => setEditDNDriver(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Received By
                  </label>
                  <input
                    type="text"
                    value={editDNReceivedBy}
                    onChange={(e) => setEditDNReceivedBy(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={editDNNotes}
                    onChange={(e) => setEditDNNotes(e.target.value)}
                    placeholder="Delivery notes..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Delivery General Comment */}
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    Delivery General Comment
                  </label>
                  <input
                    type="text"
                    value={editDNComment}
                    onChange={(e) => setEditDNComment(e.target.value)}
                    placeholder="e.g. Okay / Partial delivery / Discrepancy details..."
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border focus:outline-none transition-all ${
                      getDeliveryCommentColorStyle(editDNComment, editDNFlagStatus === 'CANCELLED', editDNFlagStatus === 'FLAGGED').inputClass
                    }`}
                  />
                </div>
              </div>

              {/* Editable Delivered Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Delivered Line Items ({editDNLines.length}) — Edit Quantity Delivered & Comments
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Delivered values & totals are updated automatically
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px] sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center">#</th>
                          <th className="py-2 px-3">Item Description</th>
                          <th className="py-2 px-3">UOM</th>
                          <th className="py-2 px-3 text-right">Unit Price (TZS)</th>
                          <th className="py-2 px-3 text-right w-28">Delivered Qty</th>
                          <th className="py-2 px-3 min-w-[140px]">Line Comment</th>
                          <th className="py-2 px-3 text-right">Excl. VAT (TZS)</th>
                          <th className="py-2 px-3 text-right">VAT (18%)</th>
                          <th className="py-2 px-3 text-right font-bold">Total Delivered (TZS)</th>
                          {isAdmin && <th className="py-2 px-3 text-center w-12">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editDNLines.map((line, lIdx) => (
                          <tr key={line.poLineId || lIdx} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{lIdx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{line.itemDescription}</td>
                            <td className="py-2 px-3 text-slate-600 uppercase text-[11px]">{line.unitOfMeasure || 'UNIT'}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              TZS {formatCurrency(line.unitPrice)}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.deliveredQuantity}
                                onChange={(e) => handleEditDNLineQty(lIdx, e.target.value)}
                                className="w-24 px-2 py-1 bg-amber-50/60 border border-amber-300 focus:bg-white focus:border-blue-500 rounded text-right font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={line.comment || 'Okay'}
                                onChange={(e) => handleEditDNLineComment(lIdx, e.target.value)}
                                placeholder="Line comment (e.g. Okay)..."
                                className={`w-full px-2 py-1 rounded text-xs font-medium border focus:outline-none transition-all ${
                                  getDeliveryCommentColorStyle(line.comment || 'Okay', editDNFlagStatus === 'CANCELLED', line.hasIssue).inputClass
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              TZS {formatCurrency(line.valueBeforeVat || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              TZS {formatCurrency(line.vatAmount || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              TZS {formatCurrency(line.valueAfterVat || 0)}
                            </td>
                            {isAdmin && (
                              <td className="py-1.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingDNModal) {
                                      setLinePendingDelete({
                                        deliveryNote: editingDNModal,
                                        line,
                                        lineIndex: lIdx,
                                        source: 'modal',
                                      });
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Permanently delete this line from database"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Recalculated totals bar */}
              {(() => {
                const totalQty = editDNLines.reduce((s, l) => s + (l.deliveredQuantity || 0), 0);
                const subtotal = editDNLines.reduce((s, l) => s + (l.valueBeforeVat || 0), 0);
                const totalVat = editDNLines.reduce((s, l) => s + (l.vatAmount || 0), 0);
                const grandTotal = editDNLines.reduce((s, l) => s + (l.valueAfterVat || 0), 0);

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Delivered Qty</span>
                      <span className="font-mono font-bold text-blue-700 text-sm">{totalQty}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Subtotal (Excl. VAT)</span>
                      <span className="font-mono font-bold text-slate-800 text-sm">TZS {formatCurrency(subtotal)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">VAT (18%)</span>
                      <span className="font-mono font-bold text-slate-700 text-sm">TZS {formatCurrency(totalVat)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Grand Total Delivered</span>
                      <span className="font-mono font-bold text-emerald-700 text-sm">TZS {formatCurrency(grandTotal)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingDNModal(null);
                  setEditDNError(null);
                }}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {onReloadDeliveryNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const dn = editingDNModal;
                      setEditingDNModal(null);
                      setEditDNError(null);
                      if (dn) onReloadDeliveryNote(dn);
                    }}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Open this delivery note directly in the Delivery Notes Creator screen"
                  >
                    <Edit3 className="w-4 h-4 text-blue-600" />
                    Open in Creator Form
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveEditDNModal}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  Save Delivery Note Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal for Admin Deleting Delivery Note */}
      <PermanentDeleteModal
        isOpen={!!dnPendingDelete}
        onClose={() => setDnPendingDelete(null)}
        onConfirm={() => {
          if (dnPendingDelete && onDeleteDeliveryNote) {
            onDeleteDeliveryNote(dnPendingDelete.id);
            setDnPendingDelete(null);
          }
        }}
        transactionType="DELIVERY_NOTE"
        referenceNumber={dnPendingDelete?.deliveryNoteNumber || ''}
        customerName={dnPendingDelete?.customerName}
        poNumber={dnPendingDelete?.poNumber}
        totalAmount={(dnPendingDelete?.lines || []).reduce(
          (acc, l) => acc + (l.valueAfterVat || (l.deliveredQuantity * (l.unitPrice || 0) * 1.18)),
          0
        )}
        details="Permanently removes delivery note from database. Delivered quantities will be returned back to dispatch balance. Any matched invoice links will be released."
      />

      {/* Permanent Delete Modal for Customer Series Book */}
      <PermanentDeleteModal
        isOpen={!!customerBookPendingDelete}
        onClose={() => setCustomerBookPendingDelete(null)}
        onConfirm={() => {
          if (customerBookPendingDelete) {
            deleteCustomerSeriesBook(customerBookPendingDelete);
            setActiveCustomerBook(null);
            const cfg = loadStoredSeriesConfig();
            const defaultDn = formatSeriesNumber(cfg.deliverySeries.prefix, cfg.deliverySeries.currentNumber, cfg.deliverySeries.padding);
            setDnNumber(defaultDn);
            setIsBookModalOpen(false);
            if (onSeriesConfigChanged) onSeriesConfigChanged();
            setCustomerBookPendingDelete(null);
          }
        }}
        transactionType="CUSTOM_SERIES"
        referenceNumber={customerBookPendingDelete || ''}
        customerName={customerBookPendingDelete || ''}
        details={`Deleting series book for "${customerBookPendingDelete}" will revert delivery note numbering for this customer back to the default system series.`}
      />

      {/* SMS Confirmation Modal for Deleting Line Item */}
      <SmsConfirmationModal
        isOpen={!!linePendingDelete}
        title="Authorize Permanent Line Item Deletion"
        description={`You are about to permanently delete line item "${linePendingDelete?.line.itemDescription}" from Delivery Note ${linePendingDelete?.deliveryNote.deliveryNoteNumber}.`}
        impactWarning="Deleting this line item will immediately restore its delivered quantity back to the undelivered PO pool and recompute total delivered quantities and values."
        actionCode={`DEL-LINE-${linePendingDelete?.line.poLineId || Date.now()}`}
        actionType="DELETE_DELIVERY_LINE"
        metadata={{
          deliveryNoteNumber: linePendingDelete?.deliveryNote.deliveryNoteNumber,
          itemDescription: linePendingDelete?.line.itemDescription,
          deliveredQuantity: linePendingDelete?.line.deliveredQuantity,
        }}
        confirmButtonText="Authorize & Delete Line"
        currentUser={currentUser}
        onClose={() => setLinePendingDelete(null)}
        onSuccess={handleConfirmDeleteLine}
      />

      {/* Delivery Notes Database Import Modal */}
      {isImportModalOpen && onImportDeliveryNotes && (
        <DeliveryDatabaseImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingDeliveryNotes={deliveryNotes}
          onImportDeliveryNotes={(imported, mode) => {
            const normalizedMode = (String(mode).toLowerCase() === 'replace' ? 'replace' : 'append');
            onImportDeliveryNotes(imported, normalizedMode);
            setIsImportModalOpen(false);
          }}
          onImport={(imported, mode) => {
            const normalizedMode = (String(mode).toLowerCase() === 'replace' ? 'replace' : 'append');
            onImportDeliveryNotes(imported, normalizedMode);
            setIsImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
