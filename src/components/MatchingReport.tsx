import React, { useState, useMemo } from 'react';
import { 
  POLineItem, 
  DeliveryNoteRecord, 
  InvoiceRecord, 
  PurchaseOrderGroup,
  MatchingItem 
} from '../types';
import { generateMatchingReport, formatCurrency } from '../utils/storage';
import * as XLSX from 'xlsx';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { 
  GitCompare, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Truck, 
  Receipt, 
  ChevronRight, 
  ChevronDown,
  Eye, 
  X, 
  Building2, 
  Package, 
  FileSpreadsheet,
  ArrowUpDown,
  AlertCircle,
  Sparkles,
  Layers,
  Hash,
  DollarSign,
  PackageCheck,
  Plus,
  Minus,
  ListTree,
  FileText
} from 'lucide-react';
import { naturalCompare } from '../utils/naturalSort';
import { TablePagination } from './TablePagination';

export interface POInvoiceGroupItem {
  poLineId?: string;
  itemDescription: string;
  unitOfMeasure: string;
  invoicedQuantity: number;
  unitPrice: number;
  valueBeforeVat: number;
  vatAmount: number;
  valueAfterVat: number;
  comment?: string;
  deliveryNoteNumbers?: string[];
}

export interface POInvoiceGroup {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  notes: string;
  totalQty: number;
  totalValue: number;
  lines: POInvoiceGroupItem[];
}

export interface GroupedPOMatching {
  poNumber: string;
  customerName: string;
  contract: string;
  destination: string;
  poDate: string;
  lines: MatchingItem[];
  invoicesIssued: POInvoiceGroup[];
  // Quantities
  poQty: number;
  deliveryQty: number;
  invoiceQty: number;
  varPoVsInvQty: number;      // poQty - invoiceQty
  varPoVsDeliveryQty: number; // poQty - deliveryQty
  varInvVsDeliveryQty: number; // invoiceQty - deliveryQty
  // Amounts (TZS)
  poAmount: number;
  deliveryAmount: number;
  invoiceAmount: number;
  varPoVsInvAmount: number;      // poAmount - invoiceAmount
  varPoVsDeliveryAmount: number; // poAmount - deliveryAmount
  varInvVsDeliveryAmount: number; // invoiceAmount - deliveryAmount
  // Aggregate status
  status: 'FULLY_MATCHED' | 'PARTIALLY_MATCHED' | 'DISCREPANCY' | 'UNMATCHED_PENDING';
  deliveryNoteNumbers: string[];
  invoiceNumbers: string[];
}

export const getInvoicesForPO = (
  poNumber: string,
  poLines: MatchingItem[],
  fallbackInvoiceNumbers: string[],
  customerName: string,
  poDate: string,
  allInvoices: InvoiceRecord[] = []
): POInvoiceGroup[] => {
  const result: POInvoiceGroup[] = [];
  const targetPoClean = (poNumber || '').trim().toLowerCase();
  if (!targetPoClean) return result;

  const seenInvoiceNums = new Set<string>();

  // 1. Scan actual invoices from records:
  // STRICT RULE: Only include invoices where the PO used to issue the invoice matches this exact PO number!
  (allInvoices || []).forEach((inv) => {
    if (!inv || inv.isCancelled || inv.status === 'CANCELLED') return;

    const invPoClean = (inv.poNumber || '').trim().toLowerCase();
    // Only invoice issued using this PO will be under this group (e.g. 3000421452-3)
    if (invPoClean !== targetPoClean) {
      return;
    }

    const invNumKey = (inv.invoiceNumber || '').trim().toLowerCase();
    if (invNumKey) seenInvoiceNums.add(invNumKey);

    const validLines = (inv.lines || []).filter((ln) => {
      if (!ln || ln.isSelected === false) return false;
      const qty = Number(ln.invoicedQuantity) || 0;
      return qty > 0;
    });

    const linesToUse = validLines.length > 0 
      ? validLines 
      : (inv.lines || []).filter((l) => (Number(l.invoicedQuantity) || 0) > 0);

    const totalQty = linesToUse.reduce((acc, l) => acc + (Number(l.invoicedQuantity) || 0), 0);
    const totalVal = linesToUse.reduce((acc, l) => acc + (Number(l.valueAfterVat) || 0), 0) || inv.totalAfterVat || 0;

    const mappedLines: POInvoiceGroupItem[] = linesToUse.map((l) => {
      const matchingPoLine = poLines.find(
        (gl) => (l.poLineId && gl.poLineId === l.poLineId) || gl.itemDescription.trim().toLowerCase() === (l.itemDescription || '').trim().toLowerCase()
      );
      const invQty = Number(l.invoicedQuantity) || 0;
      const uPrice = Number(l.unitPrice) || matchingPoLine?.poUnitPrice || 0;
      const valAfterVat = Number(l.valueAfterVat) || (matchingPoLine ? (matchingPoLine.poTotalValue / (matchingPoLine.poQuantity || 1)) * invQty : uPrice * 1.18 * invQty);
      const valBeforeVat = Number(l.valueBeforeVat) || valAfterVat / 1.18;
      const vatAmt = Number(l.vatAmount) || (valAfterVat - valBeforeVat);

      return {
        poLineId: l.poLineId,
        itemDescription: l.itemDescription,
        unitOfMeasure: l.unitOfMeasure || matchingPoLine?.unitOfMeasure || 'PCS',
        invoicedQuantity: invQty,
        unitPrice: uPrice,
        valueBeforeVat: Math.round(valBeforeVat * 100) / 100,
        vatAmount: Math.round(vatAmt * 100) / 100,
        valueAfterVat: Math.round(valAfterVat * 100) / 100,
        comment: l.comment || l.issueComment,
        deliveryNoteNumbers: matchingPoLine?.deliveryNoteNumbers || [],
      };
    });

    result.push({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate || '',
      customerName: inv.customerName || customerName,
      status: inv.status || 'ACTIVE',
      paymentStatus: inv.paymentStatus || 'UNPAID',
      notes: inv.notes || inv.comment || '',
      totalQty,
      totalValue: Math.round(totalVal * 100) / 100,
      lines: mappedLines,
    });
  });

  // 2. Also check any fallback invoice numbers recorded on PO lines for this PO (only if not already found and not issued under another PO)
  (fallbackInvoiceNumbers || []).forEach((invNum) => {
    const invNumKey = (invNum || '').trim().toLowerCase();
    if (!invNumKey || seenInvoiceNums.has(invNumKey)) return;

    // Check if this invoice number is known to belong to a DIFFERENT PO in allInvoices - if so, DO NOT include!
    const belongsToOtherPo = (allInvoices || []).some(
      (otherInv) => (otherInv.invoiceNumber || '').trim().toLowerCase() === invNumKey &&
                    (otherInv.poNumber || '').trim().toLowerCase() !== targetPoClean
    );
    if (belongsToOtherPo) return;

    seenInvoiceNums.add(invNumKey);

    const relevantLines = poLines.filter((l) =>
      l.invoiceNumbers && l.invoiceNumbers.some((n) => (n || '').trim().toLowerCase() === invNumKey)
    );
    if (relevantLines.length === 0) return;

    const totalQty = relevantLines.reduce((acc, l) => acc + (l.invoicedQuantity || 0), 0);
    const totalVal = relevantLines.reduce((acc, l) => acc + (l.invoicedValue || 0), 0);

    result.push({
      invoiceNumber: invNum,
      invoiceDate: poDate || '',
      customerName: customerName,
      status: 'ACTIVE',
      paymentStatus: 'UNPAID',
      notes: `Issued against PO ${poNumber}`,
      totalQty,
      totalValue: Math.round(totalVal * 100) / 100,
      lines: relevantLines.map((l) => ({
        poLineId: l.poLineId,
        itemDescription: l.itemDescription,
        unitOfMeasure: l.unitOfMeasure || 'PCS',
        invoicedQuantity: l.invoicedQuantity,
        unitPrice: l.poUnitPrice,
        valueBeforeVat: Math.round((l.invoicedValue / 1.18) * 100) / 100,
        vatAmount: Math.round((l.invoicedValue - l.invoicedValue / 1.18) * 100) / 100,
        valueAfterVat: l.invoicedValue,
        deliveryNoteNumbers: l.deliveryNoteNumbers,
      })),
    });
  });

  return result.sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
};

interface MatchingReportProps {
  poLines: POLineItem[];
  deliveryNotes: DeliveryNoteRecord[];
  invoices: InvoiceRecord[];
  poGroups?: PurchaseOrderGroup[];
  initialFilter?: 'ALL' | 'UNMATCHED' | 'UNDELIVERED' | 'MATCHED';
  onSelectPOForInvoice?: (poNumber: string) => void;
  onNavigateToInvoice?: () => void;
  onOpenAutoReport?: () => void;
}

export const MatchingReport: React.FC<MatchingReportProps> = ({
  poLines = [],
  deliveryNotes = [],
  invoices = [],
  poGroups = [],
  initialFilter = 'ALL',
  onSelectPOForInvoice,
  onNavigateToInvoice,
  onOpenAutoReport,
}) => {
  const [viewMode, setViewMode] = useState<'grouped_pos' | 'line_items'>('grouped_pos');
  const [compareMode, setCompareMode] = useState<'qty' | 'amount'>('qty');
  const [expandedPOs, setExpandedPOs] = useState<Record<string, boolean>>({});
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});
  const [poDrillTab, setPoDrillTab] = useState<Record<string, 'invoices' | 'lines'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>(initialFilter);
  const [drilldownItem, setDrilldownItem] = useState<MatchingItem | null>(null);

  const toggleExpandInvoice = (poNumber: string, invoiceNumber: string) => {
    const key = `${poNumber}_${invoiceNumber}`;
    setExpandedInvoices((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleExpandAllInvoicesForPO = (poNumber: string, poInvoices: POInvoiceGroup[]) => {
    const allExpanded = poInvoices.length > 0 && poInvoices.every((inv) => !!expandedInvoices[`${poNumber}_${inv.invoiceNumber}`]);
    setExpandedInvoices((prev) => {
      const next = { ...prev };
      poInvoices.forEach((inv) => {
        next[`${poNumber}_${inv.invoiceNumber}`] = !allExpanded;
      });
      return next;
    });
  };

  // Generate full matching dataset
  const matchingData = useMemo(() => {
    return generateMatchingReport(poLines, deliveryNotes, invoices) || [];
  }, [poLines, deliveryNotes, invoices]);

  // Aggregate by PO for Grouped Layout
  const groupedPOData = useMemo(() => {
    const poMap = new Map<string, GroupedPOMatching>();

    matchingData.forEach((item) => {
      const existing = poMap.get(item.poNumber);
      const linePoVal = item.poTotalValue;
      const lineDelVal = item.deliveredValue;
      const lineInvVal = item.invoicedValue;

      if (!existing) {
        poMap.set(item.poNumber, {
          poNumber: item.poNumber,
          customerName: item.customerName,
          contract: item.contract || 'General',
          destination: item.destination || 'Site',
          poDate: item.poDate || '',
          lines: [item],
          invoicesIssued: [],
          poQty: item.poQuantity,
          deliveryQty: item.deliveredQuantity,
          invoiceQty: item.invoicedQuantity,
          varPoVsInvQty: item.poQuantity - item.invoicedQuantity,
          varPoVsDeliveryQty: item.poQuantity - item.deliveredQuantity,
          varInvVsDeliveryQty: item.invoicedQuantity - item.deliveredQuantity,
          poAmount: linePoVal,
          deliveryAmount: lineDelVal,
          invoiceAmount: lineInvVal,
          varPoVsInvAmount: linePoVal - lineInvVal,
          varPoVsDeliveryAmount: linePoVal - lineDelVal,
          varInvVsDeliveryAmount: lineInvVal - lineDelVal,
          status: item.status,
          deliveryNoteNumbers: [...item.deliveryNoteNumbers],
          invoiceNumbers: [...item.invoiceNumbers],
        });
      } else {
        existing.lines.push(item);
        existing.poQty += item.poQuantity;
        existing.deliveryQty += item.deliveredQuantity;
        existing.invoiceQty += item.invoicedQuantity;
        existing.varPoVsInvQty += (item.poQuantity - item.invoicedQuantity);
        existing.varPoVsDeliveryQty += (item.poQuantity - item.deliveredQuantity);
        existing.varInvVsDeliveryQty += (item.invoicedQuantity - item.deliveredQuantity);
        existing.poAmount += linePoVal;
        existing.deliveryAmount += lineDelVal;
        existing.invoiceAmount += lineInvVal;
        existing.varPoVsInvAmount += (linePoVal - lineInvVal);
        existing.varPoVsDeliveryAmount += (linePoVal - lineDelVal);
        existing.varInvVsDeliveryAmount += (lineInvVal - lineDelVal);
        item.deliveryNoteNumbers.forEach(dn => {
          if (!existing.deliveryNoteNumbers.includes(dn)) existing.deliveryNoteNumbers.push(dn);
        });
        item.invoiceNumbers.forEach(inv => {
          if (!existing.invoiceNumbers.includes(inv)) existing.invoiceNumbers.push(inv);
        });
      }
    });

    // Pre-index invoices by clean PO number for O(1) matching
    const invoicesByPo = new Map<string, InvoiceRecord[]>();
    (invoices || []).forEach((inv) => {
      if (!inv || inv.isCancelled || inv.status === 'CANCELLED') return;
      const key = (inv.poNumber || '').trim().toLowerCase();
      if (!key) return;
      let list = invoicesByPo.get(key);
      if (!list) {
        list = [];
        invoicesByPo.set(key, list);
      }
      list.push(inv);
    });

    const groups = Array.from(poMap.values());
    groups.forEach((grp) => {
      const targetPoClean = (grp.poNumber || '').trim().toLowerCase();
      const relevantInvoices = invoicesByPo.get(targetPoClean) || [];
      grp.invoicesIssued = getInvoicesForPO(
        grp.poNumber,
        grp.lines,
        grp.invoiceNumbers,
        grp.customerName,
        grp.poDate,
        relevantInvoices
      );

      grp.deliveryNoteNumbers.sort(naturalCompare);
      grp.invoiceNumbers.sort(naturalCompare);
      grp.lines.sort((a, b) => naturalCompare(a.itemDescription, b.itemDescription));

      if (grp.invoiceQty === grp.poQty && grp.deliveryQty === grp.poQty) {
        grp.status = 'FULLY_MATCHED';
      } else if (grp.invoiceQty > grp.deliveryQty || grp.invoiceAmount > grp.deliveryAmount) {
        grp.status = 'DISCREPANCY';
      } else if (grp.invoiceQty > 0 || grp.deliveryQty > 0) {
        grp.status = 'PARTIALLY_MATCHED';
      } else {
        grp.status = 'UNMATCHED_PENDING';
      }
    });

    return groups;
  }, [matchingData, invoices]);

  // Unique customers
  const customers = useMemo(() => {
    const set = new Set<string>();
    (matchingData || []).forEach((m) => set.add(m.customerName));
    return Array.from(set).sort();
  }, [matchingData]);

  // Debounce search input for snappy filtering
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filtered dataset for Line Items
  const filteredItems = useMemo(() => {
    const sTerm = (debouncedSearchTerm || '').toLowerCase().trim();
    const list = (matchingData || []).filter((item) => {
      const matchSearch =
        sTerm === '' ||
        item.poNumber.toLowerCase().includes(sTerm) ||
        item.customerName.toLowerCase().includes(sTerm) ||
        item.itemDescription.toLowerCase().includes(sTerm) ||
        item.contract.toLowerCase().includes(sTerm);

      const matchCustomer = selectedCustomer === 'ALL' || item.customerName === selectedCustomer;

      let matchStatus = true;
      if (selectedStatus === 'MATCHED') {
        matchStatus = item.status === 'FULLY_MATCHED';
      } else if (selectedStatus === 'UNMATCHED') {
        matchStatus = item.unmatchedQty > 0;
      } else if (selectedStatus === 'UNDELIVERED') {
        matchStatus = item.undeliveredQty > 0;
      } else if (selectedStatus === 'PARTIAL') {
        matchStatus = item.status === 'PARTIALLY_MATCHED';
      }

      return matchSearch && matchCustomer && matchStatus;
    });

    // Arrange (sort) naturally by PO, invoice number, and delivery note in ascending series small to larger e.g. DDM001, DDM002...
    return list.sort((a, b) => {
      const poComp = naturalCompare(a.poNumber, b.poNumber);
      if (poComp !== 0) return poComp;
      const invComp = naturalCompare(a.invoiceNumbers?.[0] || '', b.invoiceNumbers?.[0] || '');
      if (invComp !== 0) return invComp;
      const dnComp = naturalCompare(a.deliveryNoteNumbers?.[0] || '', b.deliveryNoteNumbers?.[0] || '');
      if (dnComp !== 0) return dnComp;
      return naturalCompare(a.itemDescription, b.itemDescription);
    });
  }, [matchingData, debouncedSearchTerm, selectedCustomer, selectedStatus]);

  // Filtered Groups for PO layout
  const filteredGroups = useMemo(() => {
    const sTerm = (debouncedSearchTerm || '').toLowerCase().trim();
    const list = groupedPOData.filter((grp) => {
      const matchSearch =
        sTerm === '' ||
        grp.poNumber.toLowerCase().includes(sTerm) ||
        grp.customerName.toLowerCase().includes(sTerm) ||
        grp.contract.toLowerCase().includes(sTerm) ||
        grp.lines.some((l) => l.itemDescription.toLowerCase().includes(sTerm)) ||
        grp.deliveryNoteNumbers.some((dn) => dn.toLowerCase().includes(sTerm)) ||
        grp.invoiceNumbers.some((inv) => inv.toLowerCase().includes(sTerm));

      const matchCustomer = selectedCustomer === 'ALL' || grp.customerName === selectedCustomer;

      let matchStatus = true;
      if (selectedStatus === 'MATCHED') {
        matchStatus = grp.status === 'FULLY_MATCHED';
      } else if (selectedStatus === 'UNMATCHED') {
        matchStatus = compareMode === 'qty' ? grp.varPoVsInvQty > 0 : grp.varPoVsInvAmount > 0;
      } else if (selectedStatus === 'UNDELIVERED') {
        matchStatus = compareMode === 'qty' ? grp.varPoVsDeliveryQty > 0 : grp.varPoVsDeliveryAmount > 0;
      } else if (selectedStatus === 'PARTIAL') {
        matchStatus = grp.status === 'PARTIALLY_MATCHED';
      }

      return matchSearch && matchCustomer && matchStatus;
    });

    // Arrange (sort) naturally by PO number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
  }, [groupedPOData, debouncedSearchTerm, selectedCustomer, selectedStatus, compareMode]);

  // Pagination for Grouped PO View
  const [groupPage, setGroupPage] = useState<number>(1);
  const [groupPageSize, setGroupPageSize] = useState<number>(50);

  // Pagination for Line Items View
  const [linePage, setLinePage] = useState<number>(1);
  const [linePageSize, setLinePageSize] = useState<number>(50);

  React.useEffect(() => {
    setGroupPage(1);
  }, [debouncedSearchTerm, selectedCustomer, selectedStatus, compareMode]);

  React.useEffect(() => {
    setLinePage(1);
  }, [debouncedSearchTerm, selectedCustomer, selectedStatus, compareMode]);

  const paginatedGroups = useMemo(() => {
    const start = (groupPage - 1) * groupPageSize;
    return filteredGroups.slice(start, start + groupPageSize);
  }, [filteredGroups, groupPage, groupPageSize]);

  const paginatedItems = useMemo(() => {
    const start = (linePage - 1) * linePageSize;
    return filteredItems.slice(start, start + linePageSize);
  }, [filteredItems, linePage, linePageSize]);

  // Drilldown PO handlers
  const toggleExpandPO = (poNum: string) => {
    setExpandedPOs((prev) => ({
      ...prev,
      [poNum]: !prev[poNum],
    }));
  };

  const handleToggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    if (expand) {
      filteredGroups.forEach((g) => {
        next[g.poNumber] = true;
      });
    }
    setExpandedPOs(next);
  };

  // Variance Badge Helper
  const renderVarianceBadge = (val: number, isAmount: boolean, type: 'po_inv' | 'po_del' | 'inv_del') => {
    const isZero = Math.abs(val) < 0.001;
    const formatted = isAmount ? `TZS ${formatCurrency(Math.abs(val))}` : Math.abs(val).toLocaleString();

    if (isZero) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> 0 (Match)
        </span>
      );
    }

    if (val > 0) {
      if (type === 'inv_del') {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-mono font-semibold border border-red-200" title="Invoiced more than Delivered goods">
            +{formatted} (Over-Inv)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-mono font-semibold border border-amber-200" title={type === 'po_inv' ? 'Pending Invoice' : 'Pending Delivery'}>
          +{formatted} {type === 'po_inv' ? 'Rem Inv' : 'Rem Del'}
        </span>
      );
    }

    // val < 0
    if (type === 'inv_del') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono font-semibold border border-blue-200" title="Delivered but not yet Invoiced">
          -{formatted} (Del No Inv)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-mono font-semibold border border-purple-200" title="Excess over PO">
        -{formatted} (Excess)
      </span>
    );
  };

  // Aggregate stats
  const stats = useMemo(() => {
    let totalPoQty = 0;
    let totalPoVal = 0;
    let totalDeliveredQty = 0;
    let totalDeliveredVal = 0;
    let totalInvoicedQty = 0;
    let totalInvoicedVal = 0;
    let totalUnmatchedQty = 0;
    let totalUndeliveredQty = 0;

    matchingData.forEach((m) => {
      totalPoQty += m.poQuantity;
      totalPoVal += m.poTotalValue;
      totalDeliveredQty += m.deliveredQuantity;
      totalDeliveredVal += m.deliveredValue;
      totalInvoicedQty += m.invoicedQuantity;
      totalInvoicedVal += m.invoicedValue;
      totalUnmatchedQty += m.unmatchedQty;
      totalUndeliveredQty += m.undeliveredQty;
    });

    return {
      totalPoQty,
      totalPoVal,
      totalDeliveredQty,
      totalDeliveredVal,
      totalInvoicedQty,
      totalInvoicedVal,
      totalUnmatchedQty,
      totalUndeliveredQty,
      matchRate: totalPoQty > 0 ? Math.round((totalInvoicedQty / totalPoQty) * 100) : 0,
      deliveryRate: totalPoQty > 0 ? Math.round((totalDeliveredQty / totalPoQty) * 100) : 0,
    };
  }, [matchingData]);

  // Export report to Excel and PDF
  const handleExportExcel = () => {
    const isAmount = compareMode === 'amount';

    if (viewMode === 'grouped_pos') {
      const headers = [
        '#',
        'PO Number',
        'Customer',
        'Contract',
        'Destination',
        'PO Date',
        isAmount ? 'PO Amount (TZS)' : 'PO Qty',
        isAmount ? 'Delivery Amount (TZS)' : 'Delivery Qty',
        isAmount ? 'Invoice Amount (TZS)' : 'Invoice Qty',
        isAmount ? 'Var PO vs INV (TZS)' : 'Var PO vs INV',
        isAmount ? 'Var PO vs Delivery (TZS)' : 'Var PO vs Delivery',
        isAmount ? 'Var Inv vs Delivery (TZS)' : 'Var Inv vs Delivery',
        'Matching Status',
        'Lines Count',
        'Delivery Notes',
        'Invoices',
      ];

      const rows = filteredGroups.map((grp, idx) => [
        idx + 1,
        grp.poNumber,
        grp.customerName,
        grp.contract,
        grp.destination,
        grp.poDate,
        isAmount ? grp.poAmount : grp.poQty,
        isAmount ? grp.deliveryAmount : grp.deliveryQty,
        isAmount ? grp.invoiceAmount : grp.invoiceQty,
        isAmount ? grp.varPoVsInvAmount : grp.varPoVsInvQty,
        isAmount ? grp.varPoVsDeliveryAmount : grp.varPoVsDeliveryQty,
        isAmount ? grp.varInvVsDeliveryAmount : grp.varInvVsDeliveryQty,
        grp.status,
        grp.lines.length,
        grp.deliveryNoteNumbers.join(', ') || 'None',
        grp.invoiceNumbers.join(', ') || 'None',
      ]);

      exportTableToExcel('PO_Matching_Grouped_By_PO', headers, rows, 'Grouped_PO_Matching');
    } else {
      const headers = [
        '#',
        'PO Number',
        'Customer',
        'Contract Ref',
        'Destination Site',
        'PO Date',
        'Item Description',
        'Unit of Measure',
        'PO Ordered Qty',
        'PO Unit Price (TZS)',
        'PO Total Value (TZS)',
        'Delivered Qty (Received)',
        'Delivered Value (TZS)',
        'Invoiced Qty',
        'Invoiced Value (TZS)',
        'Var PO vs INV (Qty)',
        'Var PO vs Delivery (Qty)',
        'Var Inv vs Delivery (Qty)',
        'Matching Status',
        'Delivery Notes',
        'Invoices Issued',
      ];
      const rows = filteredItems.map((item, idx) => [
        idx + 1,
        item.poNumber,
        item.customerName,
        item.contract || '',
        item.destination || '',
        item.poDate,
        item.itemDescription,
        item.unitOfMeasure,
        item.poQuantity,
        `TZS ${formatCurrency(item.poUnitPrice)}`,
        `TZS ${formatCurrency(item.poTotalValue)}`,
        item.deliveredQuantity,
        `TZS ${formatCurrency(item.deliveredValue)}`,
        item.invoicedQuantity,
        `TZS ${formatCurrency(item.invoicedValue)}`,
        item.poQuantity - item.invoicedQuantity,
        item.poQuantity - item.deliveredQuantity,
        item.invoicedQuantity - item.deliveredQuantity,
        item.status,
        item.deliveryNoteNumbers.join(', ') || 'None',
        item.invoiceNumbers.join(', ') || 'None',
      ]);
      exportTableToExcel('PO_Reconciliation_Matching_Report', headers, rows, 'Matching_Report');
    }
  };

  const handleExportPdf = () => {
    const isAmount = compareMode === 'amount';

    if (viewMode === 'grouped_pos') {
      const headers = [
        '#',
        'PO #',
        'Customer',
        isAmount ? 'PO Amount' : 'PO Qty',
        isAmount ? 'Delivered' : 'Del Qty',
        isAmount ? 'Invoiced' : 'Inv Qty',
        'Var PO-Inv',
        'Var PO-Del',
        'Var Inv-Del',
        'Status',
      ];

      const rows = filteredGroups.map((grp, idx) => [
        idx + 1,
        grp.poNumber,
        grp.customerName,
        isAmount ? `TZS ${formatCurrency(grp.poAmount)}` : grp.poQty.toLocaleString(),
        isAmount ? `TZS ${formatCurrency(grp.deliveryAmount)}` : grp.deliveryQty.toLocaleString(),
        isAmount ? `TZS ${formatCurrency(grp.invoiceAmount)}` : grp.invoiceQty.toLocaleString(),
        isAmount ? `TZS ${formatCurrency(grp.varPoVsInvAmount)}` : grp.varPoVsInvQty.toLocaleString(),
        isAmount ? `TZS ${formatCurrency(grp.varPoVsDeliveryAmount)}` : grp.varPoVsDeliveryQty.toLocaleString(),
        isAmount ? `TZS ${formatCurrency(grp.varInvVsDeliveryAmount)}` : grp.varInvVsDeliveryQty.toLocaleString(),
        grp.status,
      ]);

      exportTableToPdf('PO 3-Way Reconciliation Grouped by PO', headers, rows, {
        filenamePrefix: 'Grouped_PO_Matching_Report',
        subtitle: `Comparison Mode: ${isAmount ? 'Amounts (TZS)' : 'Quantities'} • Total POs: ${filteredGroups.length}`,
        orientation: 'landscape',
      });
    } else {
      const headers = [
        '#',
        'PO #',
        'Customer',
        'Item Description',
        'UOM',
        'PO Qty',
        'Delivered',
        'Invoiced',
        'Var PO-Inv',
        'Var Inv-Del',
        'Status',
      ];
      const rows = filteredItems.map((item, idx) => [
        idx + 1,
        item.poNumber,
        item.customerName,
        item.itemDescription,
        item.unitOfMeasure,
        item.poQuantity.toLocaleString(),
        item.deliveredQuantity.toLocaleString(),
        item.invoicedQuantity.toLocaleString(),
        (item.poQuantity - item.invoicedQuantity).toLocaleString(),
        (item.invoicedQuantity - item.deliveredQuantity).toLocaleString(),
        item.status,
      ]);
      exportTableToPdf('PO 3-Way Reconciliation Matching Report', headers, rows, {
        filenamePrefix: 'Reconciliation_Matching_Report',
        subtitle: `Filtered Dataset • Total Items: ${filteredItems.length} • Currency: TZS`,
        orientation: 'landscape',
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">PO vs Invoice vs Delivery Matching Report</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Item-by-item quantity & value reconciliation across Purchase Orders, Deliveries (Received), and Invoices.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {onOpenAutoReport && (
            <button
              onClick={onOpenAutoReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-purple-200" />
              AI Audit Report
            </button>
          )}
          <TableExportToolbar
            totalCount={filteredItems.length}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total PO Ordered */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>PO Ordered Total</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-slate-900">
              {stats.totalPoQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <div className="text-xs text-slate-600 mt-1 font-medium">
              Value: <span className="font-bold text-slate-800">TZS {formatCurrency(stats.totalPoVal)}</span>
            </div>
          </div>
        </div>

        {/* Received / Delivered */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Delivered / Received</span>
            <Truck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-indigo-700">
              {stats.totalDeliveredQty.toLocaleString()} <span className="text-xs font-normal text-indigo-500">Units</span>
            </div>
            <div className="text-xs text-slate-600 mt-1 flex justify-between">
              <span>Val: TZS {formatCurrency(stats.totalDeliveredVal)}</span>
              <span className="font-bold text-indigo-600">{stats.deliveryRate}% Received</span>
            </div>
          </div>
        </div>

        {/* Invoiced Quantity */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Invoiced Quantity</span>
            <Receipt className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-emerald-700">
              {stats.totalInvoicedQty.toLocaleString()} <span className="text-xs font-normal text-emerald-500">Units</span>
            </div>
            <div className="text-xs text-slate-600 mt-1 flex justify-between">
              <span>Val: TZS {formatCurrency(stats.totalInvoicedVal)}</span>
              <span className="font-bold text-emerald-600">{stats.matchRate}% Invoiced</span>
            </div>
          </div>
        </div>

        {/* Unmatched / Undelivered */}
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Unmatched / Undelivered</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-amber-700">
              {stats.totalUnmatchedQty.toLocaleString()} <span className="text-xs font-normal text-amber-600">Uninvoiced</span>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Undelivered: <span className="font-semibold text-slate-800">{stats.totalUndeliveredQty.toLocaleString()} units</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter, View & Search Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PO #, customer, item, delivery #, inv #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          {/* Controls: View Mode & Compare Mode */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Layout Toggle: Group by PO (Default) vs Line Items */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('grouped_pos')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grouped_pos'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Group by PO
              </button>
              <button
                type="button"
                onClick={() => setViewMode('line_items')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'line_items'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Detailed Line Items
              </button>
            </div>

            {/* Compare Metric Toggle: Compare Qty vs Compare Amount */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 px-2 hidden sm:inline">Compare:</span>
              <button
                type="button"
                onClick={() => setCompareMode('qty')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  compareMode === 'qty'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Compare quantities across PO, Delivery, and Invoice"
              >
                <Hash className="w-3.5 h-3.5" />
                Compare Qty
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('amount')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  compareMode === 'amount'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Compare TZS values across PO, Delivery, and Invoice"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Compare Amount (TZS)
              </button>
            </div>
          </div>
        </div>

        {/* Second Row: Customer filter and Status tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Customer:</span>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="ALL">All Customers ({customers.length})</option>
              {customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Tabs */}
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs flex-wrap gap-1">
            <button
              onClick={() => setSelectedStatus('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                selectedStatus === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All {viewMode === 'grouped_pos' ? `POs (${groupedPOData.length})` : `Lines (${matchingData.length})`}
            </button>
            <button
              onClick={() => setSelectedStatus('UNMATCHED')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                selectedStatus === 'UNMATCHED' ? 'bg-white text-amber-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Invoice ({viewMode === 'grouped_pos' ? groupedPOData.filter(g => g.varPoVsInvQty > 0).length : matchingData.filter(i => i.unmatchedQty > 0).length})
            </button>
            <button
              onClick={() => setSelectedStatus('UNDELIVERED')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                selectedStatus === 'UNDELIVERED' ? 'bg-white text-indigo-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending Delivery ({viewMode === 'grouped_pos' ? groupedPOData.filter(g => g.varPoVsDeliveryQty > 0).length : matchingData.filter(i => i.undeliveredQty > 0).length})
            </button>
            <button
              onClick={() => setSelectedStatus('MATCHED')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                selectedStatus === 'MATCHED' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fully Matched ({viewMode === 'grouped_pos' ? groupedPOData.filter(g => g.status === 'FULLY_MATCHED').length : matchingData.filter(i => i.status === 'FULLY_MATCHED').length})
            </button>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: GROUPED BY PO TABLE (DEFAULT) */}
      {viewMode === 'grouped_pos' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Table Header Bar */}
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-900">
                Matching Reconciliation Grouped by PO
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                {filteredGroups.length} POs
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-medium">
                Mode: {compareMode === 'qty' ? 'Quantities' : 'Amounts (TZS)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleExpandAll(Object.keys(expandedPOs).length !== filteredGroups.length)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {Object.keys(expandedPOs).length === filteredGroups.length && filteredGroups.length > 0
                  ? 'Collapse All'
                  : 'Expand / Drill All POs'}
              </button>
              <TableExportToolbar
                totalCount={filteredGroups.length}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
              />
            </div>
          </div>

          {/* Grouped Table */}
          <div className="overflow-x-auto max-h-[660px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-xs">
                <tr>
                  <th className="py-3 px-2 w-10 text-center sticky top-0 bg-slate-900">#</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-left">PO NUMBER</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-left">CUSTOMER</th>
                  {compareMode === 'qty' ? (
                    <>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">PO QTY</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">DELIVERY QTY</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">INVOICE QTY</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">VAR PO VS INV</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">PO VS DELIVERY</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">INV VS DELIVERY</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">PO AMOUNT (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">DELIVERY AMOUNT</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">INVOICE AMOUNT</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">VAR PO VS INV (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">PO VS DELIVERY (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">INV VS DELIVERY (TZS)</th>
                    </>
                  )}
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">STATUS</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      No Purchase Orders found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedGroups.map((grp) => {
                    const isExpanded = !!expandedPOs[grp.poNumber];
                    const isAmount = compareMode === 'amount';

                    return (
                      <React.Fragment key={grp.poNumber}>
                        {/* Parent PO Row */}
                        <tr
                          className={`transition-colors hover:bg-blue-50/60 ${
                            isExpanded ? 'bg-blue-50/40 font-medium' : 'bg-white'
                          }`}
                        >
                          {/* Drilldown (+) / (-) Button */}
                          <td className="py-3 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpandPO(grp.poNumber)}
                              className={`w-7 h-7 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center font-bold text-xs ${
                                isExpanded
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-600 hover:text-white shadow-2xs'
                              }`}
                              title={isExpanded ? 'Collapse PO details (-)' : 'Drill down into PO Invoices & Lines (+)'}
                            >
                              {isExpanded ? (
                                <Minus className="w-4 h-4" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          {/* PO NUMBER */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-blue-700 text-xs">
                                {grp.poNumber}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                                {grp.lines.length} lines
                              </span>
                              {grp.invoicesIssued && grp.invoicesIssued.length > 0 && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 inline-flex items-center gap-0.5">
                                  <Receipt className="w-2.5 h-2.5" />
                                  {grp.invoicesIssued.length} {grp.invoicesIssued.length === 1 ? 'inv' : 'invs'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                              {grp.contract} • {grp.poDate || '—'}
                            </div>
                          </td>

                          {/* CUSTOMER */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{grp.customerName}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{grp.destination}</div>
                          </td>

                          {/* Metrics based on compareMode */}
                          {isAmount ? (
                            <>
                              {/* PO AMOUNT */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                                TZS {formatCurrency(grp.poAmount)}
                              </td>
                              {/* DELIVERY AMOUNT */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-semibold text-indigo-700">
                                TZS {formatCurrency(grp.deliveryAmount)}
                              </td>
                              {/* INVOICE AMOUNT */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-emerald-700">
                                TZS {formatCurrency(grp.invoiceAmount)}
                              </td>
                              {/* VAR PO VS INV */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varPoVsInvAmount, true, 'po_inv')}
                              </td>
                              {/* PO VS DELIVERY */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varPoVsDeliveryAmount, true, 'po_del')}
                              </td>
                              {/* INV VS DELIVERY */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varInvVsDeliveryAmount, true, 'inv_del')}
                              </td>
                            </>
                          ) : (
                            <>
                              {/* PO QTY */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                                {grp.poQty.toLocaleString()}
                              </td>
                              {/* DELIVERY QTY */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-semibold text-indigo-700">
                                {grp.deliveryQty.toLocaleString()}
                              </td>
                              {/* INVOICE QTY */}
                              <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-emerald-700">
                                {grp.invoiceQty.toLocaleString()}
                              </td>
                              {/* VAR PO VS INV */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varPoVsInvQty, false, 'po_inv')}
                              </td>
                              {/* PO VS DELIVERY */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varPoVsDeliveryQty, false, 'po_del')}
                              </td>
                              {/* INV VS DELIVERY */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                {renderVarianceBadge(grp.varInvVsDeliveryQty, false, 'inv_del')}
                              </td>
                            </>
                          )}

                          {/* STATUS */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {grp.status === 'FULLY_MATCHED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Matched
                              </span>
                            )}
                            {grp.status === 'DISCREPANCY' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 inline-flex items-center gap-1 border border-red-200">
                                <AlertTriangle className="w-3 h-3 text-red-600" /> Discrepancy
                              </span>
                            )}
                            {grp.status === 'PARTIALLY_MATCHED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 inline-flex items-center gap-1 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" /> Partial
                              </span>
                            )}
                            {grp.status === 'UNMATCHED_PENDING' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 inline-flex items-center gap-1 border border-slate-200">
                                <AlertCircle className="w-3 h-3 text-slate-500" /> Pending
                              </span>
                            )}
                          </td>

                          {/* ACTIONS */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpandPO(grp.poNumber)}
                                className="px-2.5 py-1 text-slate-700 hover:text-blue-700 hover:bg-blue-100/70 border border-slate-200 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Drill Invoices & Lines in PO"
                              >
                                {isExpanded ? (
                                  <>
                                    <Minus className="w-3 h-3 text-blue-600" />
                                    <span>Hide</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3 text-blue-600" />
                                    <span>Drill (+)</span>
                                  </>
                                )}
                              </button>
                              {grp.varPoVsInvQty > 0 && onSelectPOForInvoice && onNavigateToInvoice && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectPOForInvoice(grp.poNumber);
                                    onNavigateToInvoice();
                                  }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-[11px] font-semibold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
                                  title={`Create Invoice for remaining ${grp.poNumber} balance`}
                                >
                                  <Receipt className="w-3 h-3" />
                                  Invoice
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Drilled Lines Child Table Row with Nested Invoices Grouping (+) */}
                        {isExpanded && (() => {
                          const poInvoices = grp.invoicesIssued || [];
                          const currentTab = poDrillTab[grp.poNumber] || 'invoices';
                          const totalInvoicesQty = poInvoices.reduce((acc, inv) => acc + inv.totalQty, 0);
                          const totalInvoicesVal = poInvoices.reduce((acc, inv) => acc + inv.totalValue, 0);
                          const remainingPoQty = Math.max(0, grp.poQty - grp.invoiceQty);
                          const remainingPoVal = Math.max(0, grp.poAmount - grp.invoiceAmount);

                          return (
                            <tr className="bg-slate-50/70 border-y border-blue-200">
                              <td colSpan={11} className="p-3 sm:p-5 pl-4 sm:pl-10">
                                <div className="bg-white rounded-2xl border border-blue-200 shadow-md overflow-hidden">
                                  {/* Drill Header & Tab Navigator */}
                                  <div className="p-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      <div className="w-7 h-7 rounded-lg bg-blue-600/40 border border-blue-400/40 text-blue-300 flex items-center justify-center">
                                        <PackageCheck className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-xs sm:text-sm text-white">
                                            PO Drilldown: <span className="font-mono text-amber-300">{grp.poNumber}</span>
                                          </span>
                                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-200 border border-blue-700/50">
                                            {poInvoices.length} {poInvoices.length === 1 ? 'Invoice Issued' : 'Invoices Issued'}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                          Customer: <strong className="text-slate-200">{grp.customerName}</strong> • Contract: {grp.contract} • Total: {grp.poQty.toLocaleString()} PCS (TZS {formatCurrency(grp.poAmount)})
                                        </div>
                                      </div>
                                    </div>

                                    {/* Hierarchy Sub-view Tabs */}
                                    <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                                      <button
                                        type="button"
                                        onClick={() => setPoDrillTab(prev => ({ ...prev, [grp.poNumber]: 'invoices' }))}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                          currentTab === 'invoices'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                                        }`}
                                      >
                                        <Plus className="w-3.5 h-3.5 text-amber-300" />
                                        <span>Group by Invoices Issued (+)</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 font-mono">
                                          {poInvoices.length}
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setPoDrillTab(prev => ({ ...prev, [grp.poNumber]: 'lines' }))}
                                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                          currentTab === 'lines'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                                        }`}
                                      >
                                        <FileText className="w-3.5 h-3.5 text-slate-300" />
                                        <span>PO Line Items</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 font-mono">
                                          {grp.lines.length}
                                        </span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* TAB 1: GROUP BY INVOICES ISSUED (+) */}
                                  {currentTab === 'invoices' && (
                                    <div className="p-4 sm:p-5 space-y-4">
                                      {/* Quick KPI Bar */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                                          <div className="text-slate-500 font-medium">Invoices Issued</div>
                                          <div className="text-lg font-bold font-mono text-slate-900 flex items-center gap-1.5 mt-0.5">
                                            <Receipt className="w-4 h-4 text-blue-600" />
                                            <span>{poInvoices.length}</span>
                                          </div>
                                        </div>
                                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 text-xs">
                                          <div className="text-emerald-700 font-medium">Total Invoiced Qty</div>
                                          <div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">
                                            {totalInvoicesQty.toLocaleString()} <span className="text-xs font-normal text-emerald-600">/ {grp.poQty.toLocaleString()}</span>
                                          </div>
                                        </div>
                                        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 text-xs">
                                          <div className="text-emerald-700 font-medium">Total Invoiced Value</div>
                                          <div className="text-base sm:text-lg font-bold font-mono text-emerald-800 mt-0.5 truncate">
                                            TZS {formatCurrency(totalInvoicesVal)}
                                          </div>
                                        </div>
                                        <div className={`rounded-xl p-3 text-xs border ${
                                          remainingPoQty > 0 
                                            ? 'bg-amber-50 border-amber-200 text-amber-900' 
                                            : 'bg-slate-50 border-slate-200 text-slate-700'
                                        }`}>
                                          <div className="font-medium">Remaining Uninvoiced</div>
                                          <div className="text-base sm:text-lg font-bold font-mono mt-0.5 truncate">
                                            {remainingPoQty.toLocaleString()} PCS (TZS {formatCurrency(remainingPoVal)})
                                          </div>
                                        </div>
                                      </div>

                                      {/* Invoices List with (+) Drill */}
                                      {poInvoices.length === 0 ? (
                                        <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-3">
                                          <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                                          <div>
                                            <h4 className="font-bold text-slate-800 text-sm">No Invoices Issued for PO {grp.poNumber}</h4>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                              All {grp.poQty.toLocaleString()} items (TZS {formatCurrency(grp.poAmount)}) are currently pending invoicing.
                                            </p>
                                          </div>
                                          {onSelectPOForInvoice && onNavigateToInvoice && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onSelectPOForInvoice(grp.poNumber);
                                                onNavigateToInvoice();
                                              }}
                                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <Plus className="w-3.5 h-3.5" />
                                              <span>Issue First Invoice for {grp.poNumber}</span>
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-bold text-slate-900">Invoices for PO {grp.poNumber}:</span>
                                              <span>Click the <strong className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">(+)</strong> sign to drill and see item lines within each invoice.</span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => toggleExpandAllInvoicesForPO(grp.poNumber, poInvoices)}
                                              className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                                            >
                                              {poInvoices.every(inv => expandedInvoices[`${grp.poNumber}_${inv.invoiceNumber}`])
                                                ? 'Collapse All Invoices (-)'
                                                : 'Expand All Invoices (+)'}
                                            </button>
                                          </div>

                                          {/* Invoices Group Table with Drilldown (+) */}
                                          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs bg-white">
                                            <table className="w-full text-xs border-collapse">
                                              <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                                                <tr>
                                                  <th className="py-2.5 px-2.5 w-10 text-center">Drill (+)</th>
                                                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                                                  <th className="py-2.5 px-3 text-left">Invoice No</th>
                                                  <th className="py-2.5 px-3 text-left">Invoice Date</th>
                                                  <th className="py-2.5 px-3 text-left">Customer</th>
                                                  <th className="py-2.5 px-3 text-right">Items</th>
                                                  <th className="py-2.5 px-3 text-right">Total Invoiced Qty (PCS)</th>
                                                  <th className="py-2.5 px-3 text-right text-emerald-800">Total Value (TZS)</th>
                                                  <th className="py-2.5 px-3 text-center">Payment Status</th>
                                                  <th className="py-2.5 px-3 text-left">Remarks / Note</th>
                                                  <th className="py-2.5 px-3 text-center">Action</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-200">
                                                {poInvoices.map((inv, invIdx) => {
                                                  const isInvExpanded = !!expandedInvoices[`${grp.poNumber}_${inv.invoiceNumber}`];
                                                  return (
                                                    <React.Fragment key={inv.invoiceNumber || invIdx}>
                                                      {/* Invoice Summary Row */}
                                                      <tr 
                                                        onClick={() => toggleExpandInvoice(grp.poNumber, inv.invoiceNumber)}
                                                        className={`cursor-pointer transition-colors ${
                                                          isInvExpanded ? 'bg-blue-50/80 font-semibold' : 'hover:bg-slate-50/90'
                                                        }`}
                                                      >
                                                        {/* Drill (+) Button */}
                                                        <td className="py-3 px-2.5 text-center">
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleExpandInvoice(grp.poNumber, inv.invoiceNumber);
                                                            }}
                                                            className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition-all cursor-pointer shadow-xs mx-auto ${
                                                              isInvExpanded
                                                                ? 'bg-blue-600 text-white shadow-blue-200'
                                                                : 'bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-600 hover:text-white'
                                                            }`}
                                                            title={isInvExpanded ? 'Collapse invoice lines (-)' : 'Drill invoice lines (+)'}
                                                          >
                                                            {isInvExpanded ? (
                                                              <Minus className="w-3.5 h-3.5" />
                                                            ) : (
                                                              <Plus className="w-3.5 h-3.5" />
                                                            )}
                                                          </button>
                                                        </td>
                                                        <td className="py-3 px-2 text-center font-mono text-slate-400 text-[11px]">{invIdx + 1}</td>
                                                        <td className="py-3 px-3 text-left">
                                                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                                                            {inv.invoiceNumber}
                                                          </span>
                                                        </td>
                                                        <td className="py-3 px-3 text-left text-slate-600 whitespace-nowrap">
                                                          {inv.invoiceDate || '—'}
                                                        </td>
                                                        <td className="py-3 px-3 text-left font-medium text-slate-800">
                                                          {inv.customerName}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                                                          {inv.lines.length}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                                          {inv.totalQty.toLocaleString()}
                                                        </td>
                                                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                                                          TZS {formatCurrency(inv.totalValue)}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                            inv.paymentStatus === 'PAID'
                                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                              : inv.paymentStatus === 'PARTIALLY_PAID'
                                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                              : 'bg-slate-100 text-slate-600 border-slate-200'
                                                          }`}>
                                                            {inv.paymentStatus || 'UNPAID'}
                                                          </span>
                                                        </td>
                                                        <td className="py-3 px-3 text-left text-slate-500 text-[11px] max-w-[200px] truncate">
                                                          {inv.notes || `Issued for PO ${grp.poNumber}`}
                                                        </td>
                                                        <td className="py-3 px-3 text-center">
                                                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded border inline-flex items-center gap-1 ${
                                                            isInvExpanded
                                                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                                                              : 'bg-slate-100 text-slate-700 border-slate-200'
                                                          }`}>
                                                            {isInvExpanded ? 'Hide (-)' : 'Drill (+)'}
                                                          </span>
                                                        </td>
                                                      </tr>

                                                      {/* Drilled Child Table Row for Invoice Line Items */}
                                                      {isInvExpanded && (
                                                        <tr className="bg-slate-50/90 border-y border-blue-200">
                                                          <td colSpan={11} className="py-3 px-3 sm:px-6">
                                                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                                                              <div className="px-3.5 py-2 bg-blue-900 text-white flex items-center justify-between text-xs font-semibold">
                                                                <div className="flex items-center gap-2">
                                                                  <Package className="w-3.5 h-3.5 text-amber-300" />
                                                                  <span>Line Items within Invoice: <strong className="font-mono text-amber-200">{inv.invoiceNumber}</strong> (Issued for PO {grp.poNumber})</span>
                                                                </div>
                                                                <span className="text-[11px] text-blue-200 font-mono">
                                                                  {inv.lines.length} items • {inv.totalQty.toLocaleString()} PCS • TZS {formatCurrency(inv.totalValue)}
                                                                </span>
                                                              </div>

                                                              <div className="overflow-x-auto">
                                                                <table className="w-full text-xs border-collapse">
                                                                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                                                                    <tr>
                                                                      <th className="py-2 px-3 w-8 text-center text-slate-400">#</th>
                                                                      <th className="py-2 px-3 text-left">Item Description</th>
                                                                      <th className="py-2 px-2 text-center">UOM</th>
                                                                      <th className="py-2 px-3 text-right">Invoiced Qty</th>
                                                                      <th className="py-2 px-3 text-right">Unit Price (TZS)</th>
                                                                      <th className="py-2 px-3 text-right">Value Before VAT (TZS)</th>
                                                                      <th className="py-2 px-3 text-right">VAT Amount (TZS)</th>
                                                                      <th className="py-2 px-3 text-right text-emerald-800 font-bold">Total Value (TZS)</th>
                                                                      <th className="py-2 px-3 text-left">Delivery Ref / Remarks</th>
                                                                    </tr>
                                                                  </thead>
                                                                  <tbody className="divide-y divide-slate-100">
                                                                    {inv.lines.map((line, lIdx) => (
                                                                      <tr key={lIdx} className="hover:bg-blue-50/40 transition-colors">
                                                                        <td className="py-2 px-3 text-center font-mono text-slate-400 text-[11px]">{lIdx + 1}</td>
                                                                        <td className="py-2 px-3 text-left font-medium text-slate-800 max-w-[280px]">
                                                                          <div>{line.itemDescription}</div>
                                                                          {line.comment && (
                                                                            <div className="text-[10px] text-slate-400 italic">{line.comment}</div>
                                                                          )}
                                                                        </td>
                                                                        <td className="py-2 px-2 text-center font-mono text-slate-600">{line.unitOfMeasure}</td>
                                                                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                                                                          {line.invoicedQuantity.toLocaleString()}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                                                                          TZS {formatCurrency(line.unitPrice)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                                                                          TZS {formatCurrency(line.valueBeforeVat)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-mono text-slate-500">
                                                                          TZS {formatCurrency(line.vatAmount)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                                                                          TZS {formatCurrency(line.valueAfterVat)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-left">
                                                                          {line.deliveryNoteNumbers && line.deliveryNoteNumbers.length > 0 ? (
                                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                              {line.deliveryNoteNumbers.map(dn => (
                                                                                <span key={dn} className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] border border-indigo-200">
                                                                                  {dn}
                                                                                </span>
                                                                              ))}
                                                                            </div>
                                                                          ) : (
                                                                            <span className="text-[10px] text-slate-400">—</span>
                                                                          )}
                                                                        </td>
                                                                      </tr>
                                                                    ))}
                                                                  </tbody>
                                                                  <tfoot className="bg-slate-100 font-bold border-t border-slate-200 text-slate-900 text-xs">
                                                                    <tr>
                                                                      <td colSpan={3} className="py-2.5 px-3 text-left uppercase text-[10px] text-slate-500 font-bold">
                                                                        Invoice {inv.invoiceNumber} Subtotal:
                                                                      </td>
                                                                      <td className="py-2.5 px-3 text-right font-mono text-slate-900 font-black">
                                                                        {inv.totalQty.toLocaleString()}
                                                                      </td>
                                                                      <td colSpan={3} className="py-2.5 px-3"></td>
                                                                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800 font-black">
                                                                        TZS {formatCurrency(inv.totalValue)}
                                                                      </td>
                                                                      <td className="py-2.5 px-3 text-left text-[11px] text-slate-500 font-normal">
                                                                        {inv.lines.length} lines confirmed
                                                                      </td>
                                                                    </tr>
                                                                  </tfoot>
                                                                </table>
                                                              </div>
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      )}
                                                    </React.Fragment>
                                                  );
                                                })}
                                              </tbody>
                                              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                                                <tr>
                                                  <td colSpan={5} className="py-3 px-3 text-left uppercase text-[11px] text-slate-700 font-black tracking-wider">
                                                    Total Invoiced across All Invoices for PO {grp.poNumber}:
                                                  </td>
                                                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-600">
                                                    {poInvoices.reduce((acc, inv) => acc + inv.lines.length, 0)} items
                                                  </td>
                                                  <td className="py-3 px-3 text-right font-mono text-slate-900 font-black text-sm">
                                                    {totalInvoicesQty.toLocaleString()} PCS
                                                  </td>
                                                  <td className="py-3 px-3 text-right font-mono text-emerald-800 font-black text-sm whitespace-nowrap">
                                                    TZS {formatCurrency(totalInvoicesVal)}
                                                  </td>
                                                  <td colSpan={3} className="py-3 px-3 text-left text-[11px] text-slate-500 font-normal">
                                                    {poInvoices.length} invoice(s) linked strictly to PO {grp.poNumber}
                                                  </td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          </div>
                                        </div>
                                      )}

                                      {/* Remaining PO Balance alert if any */}
                                      {remainingPoQty > 0 && (
                                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                          <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                            <div>
                                              <span className="font-bold text-amber-900">Remaining Uninvoiced Balance: </span>
                                              <span className="font-mono font-bold text-amber-800">{remainingPoQty.toLocaleString()} PCS</span>
                                              <span className="text-amber-700"> • Value: </span>
                                              <span className="font-mono font-bold text-amber-800">TZS {formatCurrency(remainingPoVal)}</span>
                                            </div>
                                          </div>
                                          {onSelectPOForInvoice && onNavigateToInvoice && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                onSelectPOForInvoice(grp.poNumber);
                                                onNavigateToInvoice();
                                              }}
                                              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                            >
                                              <Receipt className="w-3.5 h-3.5" />
                                              <span>Invoice Remaining Balance</span>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* TAB 2: PO LINE ITEMS (Original Lines Table) */}
                                  {currentTab === 'lines' && (
                                    <div>
                                      <div className="overflow-x-auto max-h-72">
                                        <table className="w-full text-left text-xs border-collapse">
                                          <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                                            <tr>
                                              <th className="py-2.5 px-3">#</th>
                                              <th className="py-2.5 px-3">Item Description</th>
                                              <th className="py-2.5 px-2 text-center">UOM</th>
                                              {isAmount ? (
                                                <>
                                                  <th className="py-2.5 px-3 text-right">PO Value (TZS)</th>
                                                  <th className="py-2.5 px-3 text-right">Delivered Value</th>
                                                  <th className="py-2.5 px-3 text-right">Invoiced Value</th>
                                                  <th className="py-2.5 px-3 text-center">Var PO-Inv</th>
                                                  <th className="py-2.5 px-3 text-center">PO-Delivery</th>
                                                  <th className="py-2.5 px-3 text-center">Inv-Delivery</th>
                                                </>
                                              ) : (
                                                <>
                                                  <th className="py-2.5 px-3 text-right">PO Qty</th>
                                                  <th className="py-2.5 px-3 text-right">Delivered Qty</th>
                                                  <th className="py-2.5 px-3 text-right">Invoiced Qty</th>
                                                  <th className="py-2.5 px-3 text-center">Var PO-Inv</th>
                                                  <th className="py-2.5 px-3 text-center">PO-Delivery</th>
                                                  <th className="py-2.5 px-3 text-center">Inv-Delivery</th>
                                                </>
                                              )}
                                              <th className="py-2.5 px-3 text-center">Linked Docs</th>
                                              <th className="py-2.5 px-3 text-center">Audit</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {grp.lines.map((ln, lIdx) => {
                                              const lineVarPoInvQty = ln.poQuantity - ln.invoicedQuantity;
                                              const lineVarPoDelQty = ln.poQuantity - ln.deliveredQuantity;
                                              const lineVarInvDelQty = ln.invoicedQuantity - ln.deliveredQuantity;

                                              const lineVarPoInvAmt = ln.poTotalValue - ln.invoicedValue;
                                              const lineVarPoDelAmt = ln.poTotalValue - ln.deliveredValue;
                                              const lineVarInvDelAmt = ln.invoicedValue - ln.deliveredValue;

                                              return (
                                                <tr key={ln.poLineId || lIdx} className="hover:bg-slate-50/80 transition-colors">
                                                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{lIdx + 1}</td>
                                                  <td className="py-2 px-3">
                                                    <div className="font-semibold text-slate-800">{ln.itemDescription}</div>
                                                    <div className="text-[10px] text-slate-400">
                                                      Rate: TZS {formatCurrency(ln.poUnitPrice)} • Dest: {ln.destination}
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-2 text-center font-mono text-slate-600">{ln.unitOfMeasure}</td>

                                                  {isAmount ? (
                                                    <>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                                        TZS {formatCurrency(ln.poTotalValue)}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-700">
                                                        TZS {formatCurrency(ln.deliveredValue)}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                                        TZS {formatCurrency(ln.invoicedValue)}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarPoInvAmt, true, 'po_inv')}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarPoDelAmt, true, 'po_del')}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarInvDelAmt, true, 'inv_del')}
                                                      </td>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                                        {ln.poQuantity.toLocaleString()}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-700">
                                                        {ln.deliveredQuantity.toLocaleString()}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                                        {ln.invoicedQuantity.toLocaleString()}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarPoInvQty, false, 'po_inv')}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarPoDelQty, false, 'po_del')}
                                                      </td>
                                                      <td className="py-2 px-3 text-center whitespace-nowrap">
                                                        {renderVarianceBadge(lineVarInvDelQty, false, 'inv_del')}
                                                      </td>
                                                    </>
                                                  )}

                                                  <td className="py-2 px-3 text-center">
                                                    <div className="flex items-center justify-center gap-1 flex-wrap max-w-[140px] mx-auto">
                                                      {ln.deliveryNoteNumbers.map(dn => (
                                                        <span key={dn} className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] border border-indigo-200">
                                                          {dn}
                                                        </span>
                                                      ))}
                                                      {ln.invoiceNumbers.map(inv => (
                                                        <span key={inv} className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] border border-emerald-200">
                                                          {inv}
                                                        </span>
                                                      ))}
                                                      {ln.deliveryNoteNumbers.length === 0 && ln.invoiceNumbers.length === 0 && (
                                                        <span className="text-[10px] text-slate-400">None</span>
                                                      )}
                                                    </div>
                                                  </td>

                                                  <td className="py-2 px-3 text-center">
                                                    <button
                                                      type="button"
                                                      onClick={() => setDrilldownItem(ln)}
                                                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                                      title="View 3-Way Audit Trail"
                                                    >
                                                      <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          {/* PO Drill Subtotal */}
                                          <tfoot className="bg-slate-50 font-semibold border-t border-slate-200 text-slate-900">
                                            <tr>
                                              <td colSpan={3} className="py-2 px-3 text-right text-[11px] uppercase tracking-wider text-slate-500">
                                                PO {grp.poNumber} Totals:
                                              </td>
                                              {isAmount ? (
                                                <>
                                                  <td className="py-2 px-3 text-right font-mono font-bold">
                                                    TZS {formatCurrency(grp.poAmount)}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono text-indigo-700">
                                                    TZS {formatCurrency(grp.deliveryAmount)}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                                    TZS {formatCurrency(grp.invoiceAmount)}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varPoVsInvAmount, true, 'po_inv')}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varPoVsDeliveryAmount, true, 'po_del')}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varInvVsDeliveryAmount, true, 'inv_del')}
                                                  </td>
                                                </>
                                              ) : (
                                                <>
                                                  <td className="py-2 px-3 text-right font-mono font-bold">
                                                    {grp.poQty.toLocaleString()}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono text-indigo-700">
                                                    {grp.deliveryQty.toLocaleString()}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                                    {grp.invoiceQty.toLocaleString()}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varPoVsInvQty, false, 'po_inv')}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varPoVsDeliveryQty, false, 'po_del')}
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    {renderVarianceBadge(grp.varInvVsDeliveryQty, false, 'inv_del')}
                                                  </td>
                                                </>
                                              )}
                                              <td colSpan={2}></td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {filteredGroups.length > 0 && (
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 text-xs sticky bottom-0 z-10 shadow-xs">
                  <tr>
                    <td colSpan={3} className="py-3 px-3 text-left uppercase text-[11px] font-black tracking-wider text-slate-800">
                      Grand Total ({filteredGroups.length} POs):
                    </td>
                    {compareMode === 'qty' ? (
                      <>
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                          {filteredGroups.reduce((s, g) => s + g.poQty, 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-indigo-700">
                          {filteredGroups.reduce((s, g) => s + g.deliveryQty, 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700">
                          {filteredGroups.reduce((s, g) => s + g.invoiceQty, 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varPoVsInvQty, 0),
                            false,
                            'po_inv'
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varPoVsDeliveryQty, 0),
                            false,
                            'po_del'
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varInvVsDeliveryQty, 0),
                            false,
                            'inv_del'
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                          TZS {formatCurrency(filteredGroups.reduce((s, g) => s + g.poAmount, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-indigo-700 whitespace-nowrap">
                          TZS {formatCurrency(filteredGroups.reduce((s, g) => s + g.deliveryAmount, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                          TZS {formatCurrency(filteredGroups.reduce((s, g) => s + g.invoiceAmount, 0))}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varPoVsInvAmount, 0),
                            true,
                            'po_inv'
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varPoVsDeliveryAmount, 0),
                            true,
                            'po_del'
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderVarianceBadge(
                            filteredGroups.reduce((s, g) => s + g.varInvVsDeliveryAmount, 0),
                            true,
                            'inv_del'
                          )}
                        </td>
                      </>
                    )}
                    <td colSpan={2} className="py-3 px-3 text-center text-[11px] text-slate-500 font-normal">
                      Reconciliation Summary
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination
            currentPage={groupPage}
            totalItems={filteredGroups.length}
            pageSize={groupPageSize}
            onPageChange={setGroupPage}
            onPageSizeChange={setGroupPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
            itemLabel="Purchase Orders"
          />
        </div>
      )}

      {/* VIEW MODE 2: DETAILED LINE ITEMS TABLE */}
      {viewMode === 'line_items' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">PO Items vs Invoice & Delivery Line Details</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {filteredItems.length} Records
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-medium">
                Mode: {compareMode === 'qty' ? 'Quantities' : 'Amounts (TZS)'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline">Click any row to drill down into order documents</span>
              <TableExportToolbar
                totalCount={filteredItems.length}
                onExportExcel={handleExportExcel}
                onExportPdf={handleExportPdf}
              />
            </div>
          </div>

          <div className="overflow-auto max-h-[620px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-sm">
                <tr>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900">PO & Customer</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900">Item Description</th>
                  <th className="py-3 px-2 sticky top-0 bg-slate-900 text-center">UOM</th>
                  {compareMode === 'qty' ? (
                    <>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">PO Qty</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Delivered (DN)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Invoiced Qty</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Var PO-Inv</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">PO-Delivery</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Inv-Delivery</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">PO Value (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Delivered Value</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Invoiced Value</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Var PO-Inv (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">PO-Delivery (TZS)</th>
                      <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Inv-Delivery (TZS)</th>
                    </>
                  )}
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Status</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      No line items found matching your current filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const isFullyInvoiced = item.status === 'FULLY_MATCHED';
                    const isPartial = item.status === 'PARTIALLY_MATCHED';
                    const isAmount = compareMode === 'amount';

                    const lineVarPoInvQty = item.poQuantity - item.invoicedQuantity;
                    const lineVarPoDelQty = item.poQuantity - item.deliveredQuantity;
                    const lineVarInvDelQty = item.invoicedQuantity - item.deliveredQuantity;

                    const lineVarPoInvAmt = item.poTotalValue - item.invoicedValue;
                    const lineVarPoDelAmt = item.poTotalValue - item.deliveredValue;
                    const lineVarInvDelAmt = item.invoicedValue - item.deliveredValue;

                    return (
                      <tr
                        key={item.poLineId || idx}
                        onClick={() => setDrilldownItem(item)}
                        className="hover:bg-blue-50/60 transition-colors cursor-pointer group"
                      >
                        {/* PO & Customer */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.poNumber}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[140px]" title={item.customerName}>
                            {item.customerName}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.poDate}</div>
                        </td>

                        {/* Description */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 max-w-[260px] line-clamp-2" title={item.itemDescription}>
                            {item.itemDescription}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Unit: TZS {formatCurrency(item.poUnitPrice)} • Dest: {item.destination}
                          </div>
                        </td>

                        {/* UOM */}
                        <td className="py-3 px-2 text-center font-mono text-slate-600">
                          {item.unitOfMeasure}
                        </td>

                        {/* Data based on compareMode */}
                        {isAmount ? (
                          <>
                            <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                              TZS {formatCurrency(item.poTotalValue)}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-indigo-700 font-mono">
                              TZS {formatCurrency(item.deliveredValue)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-700 font-mono">
                              TZS {formatCurrency(item.invoicedValue)}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarPoInvAmt, true, 'po_inv')}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarPoDelAmt, true, 'po_del')}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarInvDelAmt, true, 'inv_del')}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                              {item.poQuantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-indigo-700 font-mono">
                              {item.deliveredQuantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-700 font-mono">
                              {item.invoicedQuantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarPoInvQty, false, 'po_inv')}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarPoDelQty, false, 'po_del')}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {renderVarianceBadge(lineVarInvDelQty, false, 'inv_del')}
                            </td>
                          </>
                        )}

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          {isFullyInvoiced && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Fully Matched
                            </span>
                          )}
                          {isPartial && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" /> Partial
                            </span>
                          )}
                          {!isFullyInvoiced && !isPartial && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                              <AlertCircle className="w-3 h-3" /> Unmatched
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setDrilldownItem(item)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                              title="Drill down item details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {item.unmatchedQty > 0 && onSelectPOForInvoice && onNavigateToInvoice && (
                              <button
                                onClick={() => {
                                  onSelectPOForInvoice(item.poNumber);
                                  onNavigateToInvoice();
                                }}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                                title="Create Invoice for remaining balance"
                              >
                                Invoice
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={linePage}
            totalItems={filteredItems.length}
            pageSize={linePageSize}
            onPageChange={setLinePage}
            onPageSizeChange={setLinePageSize}
            pageSizeOptions={[50, 100, 250, 500]}
            itemLabel="Items"
          />
        </div>
      )}

      {/* Drill-down Modal for Item Matching Details */}
      {drilldownItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <GitCompare className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-base">Item Matching & 3-Way Audit Trail</h3>
                  <p className="text-xs text-slate-400 font-mono">PO: {drilldownItem.poNumber} • {drilldownItem.contract}</p>
                </div>
              </div>
              <button
                onClick={() => setDrilldownItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 text-xs text-slate-700">
              {/* Item Master Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="text-sm font-bold text-slate-900">{drilldownItem.itemDescription}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Customer</span>
                    <span className="font-medium text-slate-800">{drilldownItem.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Destination</span>
                    <span className="font-medium text-slate-800">{drilldownItem.destination}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Unit Price</span>
                    <span className="font-medium text-slate-800">TZS {formatCurrency(drilldownItem.poUnitPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">UOM</span>
                    <span className="font-mono font-bold text-slate-800">{drilldownItem.unitOfMeasure}</span>
                  </div>
                </div>
              </div>

              {/* 3-Way Reconciliation Comparison Grid */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {/* PO Ordered */}
                <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200/80">
                  <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">1. PO Ordered</span>
                  <div className="text-xl font-bold text-blue-900 mt-1">
                    {drilldownItem.poQuantity} <span className="text-xs font-normal text-blue-700">{drilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-0.5 font-medium">TZS {formatCurrency(drilldownItem.poTotalValue)}</div>
                </div>

                {/* Received / Delivered */}
                <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200/80">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">2. Received (DN)</span>
                  <div className="text-xl font-bold text-indigo-900 mt-1">
                    {drilldownItem.deliveredQuantity} <span className="text-xs font-normal text-indigo-700">{drilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-indigo-700 mt-0.5 font-medium">TZS {formatCurrency(drilldownItem.deliveredValue)}</div>
                </div>

                {/* Invoiced */}
                <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200/80">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">3. Invoiced Billed</span>
                  <div className="text-xl font-bold text-emerald-900 mt-1">
                    {drilldownItem.invoicedQuantity} <span className="text-xs font-normal text-emerald-700">{drilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">TZS {formatCurrency(drilldownItem.invoicedValue)}</div>
                </div>
              </div>

              {/* Variances & Unmatched Breakdown */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block">
                  Variance & Audit Checks
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/60 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-amber-900 block">Uninvoiced Balance (Unmatched):</span>
                      <span className="text-[11px] text-amber-700">Remaining to be billed</span>
                    </div>
                    <span className="text-base font-bold text-amber-900 font-mono">
                      {drilldownItem.unmatchedQty} {drilldownItem.unitOfMeasure}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-800 block">Undelivered Balance:</span>
                      <span className="text-[11px] text-slate-500">Physical receipt pending</span>
                    </div>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {drilldownItem.undeliveredQty} {drilldownItem.unitOfMeasure}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked Documents (Delivery Notes & Invoices) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Linked Delivery Notes */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Truck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Linked Delivery Notes ({drilldownItem.deliveryNoteNumbers.length})</span>
                  </div>
                  {drilldownItem.deliveryNoteNumbers.length === 0 ? (
                    <div className="text-slate-400 text-[11px]">No delivery note recorded for this item yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {drilldownItem.deliveryNoteNumbers.map((dn) => (
                        <span key={dn} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-semibold text-[11px] border border-indigo-200">
                          {dn}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked Invoices */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Linked Invoices Issued ({drilldownItem.invoiceNumbers.length})</span>
                  </div>
                  {drilldownItem.invoiceNumbers.length === 0 ? (
                    <div className="text-slate-400 text-[11px]">No invoice issued for this item yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {drilldownItem.invoiceNumbers.map((inv) => (
                        <span key={inv} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono font-semibold text-[11px] border border-emerald-200">
                          {inv}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  onClick={() => setDrilldownItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                {drilldownItem.unmatchedQty > 0 && (
                  <button
                    onClick={() => {
                      onSelectPOForInvoice(drilldownItem.poNumber);
                      setDrilldownItem(null);
                      onNavigateToInvoice();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Receipt className="w-4 h-4" />
                    Create Invoice for This PO
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
