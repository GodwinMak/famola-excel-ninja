import React, { useMemo, useState } from 'react';
import { 
  PurchaseOrderGroup, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  POLineItem, 
  DashboardMetrics,
  MatchingItem,
  DocumentIssueRecord 
} from '../types';
import { formatCurrency, generateMatchingReport } from '../utils/storage';
import { naturalCompare } from '../utils/naturalSort';
import { 
  DollarSign, 
  Receipt, 
  Truck, 
  CreditCard, 
  GitCompare, 
  TrendingUp, 
  Upload, 
  Download,
  Plus, 
  FileSpreadsheet, 
  ArrowRight, 
  Building2, 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  ChevronDown,
  Eye,
  ExternalLink,
  Layers,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  FileText,
  Boxes,
  HelpCircle,
  X,
  Mic,
  Sparkles,
  Calendar,
  ArrowUpRight,
  BookOpen
} from 'lucide-react';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TablePagination } from './TablePagination';
import { CustomerBookSeriesAudit } from './CustomerBookSeriesAudit';
import { AIManagementReportModal } from './AIManagementReportModal';

interface DashboardProps {
  metrics: DashboardMetrics;
  poGroups: PurchaseOrderGroup[];
  poLines: POLineItem[];
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  issues?: DocumentIssueRecord[];
  onNavigate: (tab: any, subFilter?: string) => void;
  onSelectPOForInvoice: (poNumber: string) => void;
  onOpenUploadModal: () => void;
  onDownloadTemplate: () => void;
  onOpenVoiceSearch?: () => void;
  onOpenAutoReport?: () => void;
}

type GroupingMode = 'PO' | 'INVOICE' | 'DELIVERY' | 'VENDOR' | 'ITEMS';
type StatusFilter = 'ALL' | 'MATCHED' | 'UNMATCHED' | 'UNDELIVERED' | 'PARTIAL';
type MetricDisplayMode = 'QUANTITY' | 'AMOUNT';

export const Dashboard: React.FC<DashboardProps> = ({
  metrics,
  poGroups,
  poLines,
  invoices,
  deliveryNotes,
  payments,
  issues = [],
  onNavigate,
  onSelectPOForInvoice,
  onOpenUploadModal,
  onDownloadTemplate,
  onOpenVoiceSearch,
  onOpenAutoReport,
}) => {
  const [isAIManagementReportOpen, setIsAIManagementReportOpen] = useState(false);
  const [aiManagementReportModule, setAiManagementReportModule] = useState<'INVOICE' | 'DELIVERY' | 'PAYMENT'>('INVOICE');

  const [groupingMode, setGroupingMode] = useState<GroupingMode>('PO');
  const [metricMode, setMetricMode] = useState<MetricDisplayMode>('QUANTITY');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedDrilldownItem, setSelectedDrilldownItem] = useState<MatchingItem | null>(null);
  const [poSubTabs, setPoSubTabs] = useState<Record<string, 'items' | 'invoices' | 'deliveries'>>({});

  // Pagination states for different grouping modes
  const [poPage, setPoPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(25);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize, setItemsPageSize] = useState(50);
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(25);
  const [delPage, setDelPage] = useState(1);
  const [delPageSize, setDelPageSize] = useState(25);
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorPageSize, setVendorPageSize] = useState(25);

  // Debounce search query to keep UI responsive
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination on filter or view changes
  React.useEffect(() => {
    setPoPage(1);
    setItemsPage(1);
    setInvPage(1);
    setDelPage(1);
    setVendorPage(1);
  }, [debouncedSearchQuery, statusFilter, groupingMode, metricMode]);

  // Pre-index records by poNumber for O(1) relationships
  const invoicesByPoMap = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    (invoices || []).forEach((inv) => {
      if (!inv?.poNumber) return;
      const k = inv.poNumber.trim();
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(inv);
    });
    return map;
  }, [invoices]);

  const deliveryNotesByPoMap = useMemo(() => {
    const map = new Map<string, DeliveryNoteRecord[]>();
    (deliveryNotes || []).forEach((dn) => {
      if (!dn?.poNumber) return;
      const k = dn.poNumber.trim();
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(dn);
    });
    return map;
  }, [deliveryNotes]);

  const poLinesByPoMap = useMemo(() => {
    const map = new Map<string, POLineItem[]>();
    (poLines || []).forEach((p) => {
      if (!p?.poNumber) return;
      const k = p.poNumber.trim();
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(p);
    });
    return map;
  }, [poLines]);

  const getPoSubTab = (poNumber: string) => poSubTabs[poNumber] || 'items';
  const setPoSubTab = (poNumber: string, tab: 'items' | 'invoices' | 'deliveries') => {
    setPoSubTabs((prev) => ({ ...prev, [poNumber]: tab }));
  };

  // Matching dataset
  const matchingData = useMemo(() => {
    return generateMatchingReport(poLines, deliveryNotes, invoices);
  }, [poLines, deliveryNotes, invoices]);

  // Delivery Notes summary per vendor
  const vendorDnStats = useMemo(() => {
    const map = new Map<string, { totalDnVal: number; totalDeliveredQty: number; dnCount: number }>();
    (deliveryNotes || []).forEach((dn) => {
      if (!dn) return;
      const existing = map.get(dn.customerName) || { totalDnVal: 0, totalDeliveredQty: 0, dnCount: 0 };
      existing.totalDnVal += dn.totalDeliveredValue || 0;
      existing.totalDeliveredQty += dn.totalDeliveredQuantity || 0;
      existing.dnCount += 1;
      map.set(dn.customerName, existing);
    });
    return Array.from(map.entries()).map(([vendor, data]) => ({
      vendor,
      totalDnVal: data.totalDnVal,
      totalDeliveredQty: data.totalDeliveredQty,
      dnCount: data.dnCount,
    }));
  }, [deliveryNotes]);

  // Unmatched Items (Un-invoiced lines)
  const unmatchedItems = useMemo(() => {
    return (matchingData || []).filter((m) => m.unmatchedQty > 0);
  }, [matchingData]);

  // Undelivered Items (Remaining delivery pending)
  const undeliveredItems = useMemo(() => {
    return (matchingData || []).filter((m) => m.undeliveredQty > 0);
  }, [matchingData]);

  // Fully Matched Items
  const fullyMatchedItems = useMemo(() => {
    return (matchingData || []).filter((m) => m.status === 'FULLY_MATCHED');
  }, [matchingData]);

  // Toggle single group expand
  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Expand / Collapse all
  const toggleAllGroups = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    if (groupingMode === 'PO') {
      (poReconciliationGroups || []).forEach((g) => {
        if (g && g.poNumber) next[g.poNumber] = expand;
      });
    } else if (groupingMode === 'INVOICE') {
      (invoiceReconciliationGroups || []).forEach((g) => {
        if (g && g.invoice.invoiceNumber) next[g.invoice.invoiceNumber] = expand;
      });
    } else if (groupingMode === 'DELIVERY') {
      (deliveryReconciliationGroups || []).forEach((g) => {
        if (g && g.deliveryNote.deliveryNoteNumber) next[g.deliveryNote.deliveryNoteNumber] = expand;
      });
    } else if (groupingMode === 'VENDOR') {
      (vendorReconciliationGroups || []).forEach((g) => {
        if (g && g.vendor) next[g.vendor] = expand;
      });
    }
    setExpandedKeys(next);
  };

  // Filtered matching items based on search and status - sorted in natural ascending order
  const filteredMatchingData = useMemo(() => {
    const q = (debouncedSearchQuery || '').toLowerCase().trim();
    const list = (matchingData || []).filter((item) => {
      if (!item) return false;
      const matchesSearch =
        !q ||
        (item.poNumber || '').toLowerCase().includes(q) ||
        (item.customerName || '').toLowerCase().includes(q) ||
        (item.itemDescription || '').toLowerCase().includes(q) ||
        (item.destination || '').toLowerCase().includes(q) ||
        (item.contract || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === 'MATCHED') return item.status === 'FULLY_MATCHED';
      if (statusFilter === 'PARTIAL') return item.status === 'PARTIALLY_MATCHED';
      if (statusFilter === 'UNMATCHED') return (item.unmatchedQty || 0) > 0;
      if (statusFilter === 'UNDELIVERED') return (item.undeliveredQty || 0) > 0;

      return true;
    });

    return list.sort((a, b) => {
      const poComp = naturalCompare(a.poNumber, b.poNumber);
      if (poComp !== 0) return poComp;
      const invComp = naturalCompare(a.invoiceNumbers?.[0] || '', b.invoiceNumbers?.[0] || '');
      if (invComp !== 0) return invComp;
      const dnComp = naturalCompare(a.deliveryNoteNumbers?.[0] || '', b.deliveryNoteNumbers?.[0] || '');
      if (dnComp !== 0) return dnComp;
      return naturalCompare(a.itemDescription, b.itemDescription);
    });
  }, [matchingData, debouncedSearchQuery, statusFilter]);

  // Grouping 1: Group by PO
  const poReconciliationGroups = useMemo(() => {
    const groupsMap = new Map<string, {
      poNumber: string;
      customerName: string;
      destination: string;
      contract: string;
      poDate: string;
      items: MatchingItem[];
      totalPoQty: number;
      totalPoVal: number;
      totalDeliveredQty: number;
      totalDeliveredVal: number;
      totalInvoicedQty: number;
      totalInvoicedVal: number;
      totalUnmatchedQty: number;
      totalUndeliveredQty: number;
    }>();

    (filteredMatchingData || []).forEach((item) => {
      if (!item || !item.poNumber) return;
      const existing = groupsMap.get(item.poNumber) || {
        poNumber: item.poNumber,
        customerName: item.customerName,
        destination: item.destination,
        contract: item.contract,
        poDate: item.poDate,
        items: [],
        totalPoQty: 0,
        totalPoVal: 0,
        totalDeliveredQty: 0,
        totalDeliveredVal: 0,
        totalInvoicedQty: 0,
        totalInvoicedVal: 0,
        totalUnmatchedQty: 0,
        totalUndeliveredQty: 0,
      };

      existing.items.push(item);
      existing.totalPoQty += item.poQuantity || 0;
      existing.totalPoVal += item.poTotalValue || 0;
      existing.totalDeliveredQty += item.deliveredQuantity || 0;
      existing.totalDeliveredVal += item.deliveredValue || 0;
      existing.totalInvoicedQty += item.invoicedQuantity || 0;
      existing.totalInvoicedVal += item.invoicedValue || 0;
      existing.totalUnmatchedQty += item.unmatchedQty || 0;
      existing.totalUndeliveredQty += item.undeliveredQty || 0;

      groupsMap.set(item.poNumber, existing);
    });

    return Array.from(groupsMap.values()).map((grp) => {
      const fulfillmentRate = grp.totalPoQty > 0 ? Math.round((grp.totalInvoicedQty / grp.totalPoQty) * 100) : 0;
      const deliveryRate = grp.totalPoQty > 0 ? Math.round((grp.totalDeliveredQty / grp.totalPoQty) * 100) : 0;
      
      let status: 'FULLY_MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED' = 'UNMATCHED';
      if (grp.totalInvoicedQty >= grp.totalPoQty && grp.totalPoQty > 0) {
        status = 'FULLY_MATCHED';
      } else if (grp.totalInvoicedQty > 0) {
        status = 'PARTIALLY_MATCHED';
      }

      const invoicesForPo = (invoicesByPoMap.get(grp.poNumber) || []).slice().sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
      const deliveryNotesForPo = (deliveryNotesByPoMap.get(grp.poNumber) || []).slice().sort((a, b) => naturalCompare(a.deliveryNoteNumber, b.deliveryNoteNumber));

      return {
        ...grp,
        fulfillmentRate,
        deliveryRate,
        status,
        invoicesForPo,
        deliveryNotesForPo,
      };
    }).sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
  }, [filteredMatchingData, invoicesByPoMap, deliveryNotesByPoMap]);

  // Grouping: Group by Invoices Raised - sorted naturally ascending by invoice number (e.g. DDM001, DDM002...)
  const invoiceReconciliationGroups = useMemo(() => {
    const q = (debouncedSearchQuery || '').toLowerCase().trim();
    return (invoices || []).filter((inv) => {
      if (!inv) return false;
      const matchesSearch =
        !q ||
        (inv.invoiceNumber || '').toLowerCase().includes(q) ||
        (inv.poNumber || '').toLowerCase().includes(q) ||
        (inv.customerName || '').toLowerCase().includes(q) ||
        (inv.destination || '').toLowerCase().includes(q) ||
        (inv.contract || '').toLowerCase().includes(q) ||
        (inv.lines || []).some((l) => (l.itemDescription || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter === 'MATCHED') return inv.paymentStatus === 'PAID';
      if (statusFilter === 'UNMATCHED') return inv.paymentStatus === 'UNPAID' || inv.paymentStatus === 'PARTIAL' || inv.hasIssue;
      if (statusFilter === 'UNDELIVERED') {
        const dns = deliveryNotesByPoMap.get(inv.poNumber) || [];
        return dns.length === 0;
      }
      return true;
    }).map((inv) => {
      const relatedPoLines = poLinesByPoMap.get(inv.poNumber) || [];
      const relatedDns = (deliveryNotesByPoMap.get(inv.poNumber) || []).slice().sort((a, b) => naturalCompare(a.deliveryNoteNumber, b.deliveryNoteNumber));
      const totalBilledQty = (inv.lines || []).reduce((sum, l) => sum + (l.invoicedQuantity || 0), 0);
      const totalBilledVal = inv.totalAfterVat || (inv.lines || []).reduce((sum, l) => sum + (l.valueAfterVat || 0), 0);
      const totalPoQty = relatedPoLines.reduce((sum, p) => sum + (p.poQuantity || 0), 0);
      const totalPoVal = relatedPoLines.reduce((sum, p) => sum + (p.valueAfterVat || (p.poQuantity * p.unitPrice * (1 + (p.vatRate ?? 0.18)))), 0);
      const totalDeliveredQty = relatedDns.reduce((sum, d) => sum + (d.totalDeliveredQuantity || 0), 0);
      const totalDeliveredVal = relatedDns.reduce((sum, d) => sum + (d.totalDeliveredValue || (d.lines || []).reduce((s, l) => s + (l.valueAfterVat || 0), 0)), 0);

      return {
        invoice: inv,
        relatedPoLines,
        relatedDns,
        totalBilledQty,
        totalBilledVal,
        totalPoQty,
        totalPoVal,
        totalDeliveredQty,
        totalDeliveredVal,
      };
    }).sort((a, b) => naturalCompare(a.invoice.invoiceNumber, b.invoice.invoiceNumber));
  }, [invoices, poLinesByPoMap, deliveryNotesByPoMap, debouncedSearchQuery, statusFilter]);

  // Grouping: Group by Delivery Notes - sorted naturally ascending by delivery note number (e.g. DDM001, DDM002...)
  const deliveryReconciliationGroups = useMemo(() => {
    const q = (debouncedSearchQuery || '').toLowerCase().trim();
    return (deliveryNotes || []).filter((dn) => {
      if (!dn) return false;
      const matchesSearch =
        !q ||
        (dn.deliveryNoteNumber || '').toLowerCase().includes(q) ||
        (dn.poNumber || '').toLowerCase().includes(q) ||
        (dn.customerName || '').toLowerCase().includes(q) ||
        (dn.destination || '').toLowerCase().includes(q) ||
        (dn.carrier || '').toLowerCase().includes(q) ||
        (dn.vehicleNumber || '').toLowerCase().includes(q) ||
        (dn.driverName || '').toLowerCase().includes(q) ||
        (dn.lines || []).some((l) => (l.itemDescription || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const relatedInvoices = invoicesByPoMap.get(dn.poNumber) || [];

      if (statusFilter === 'MATCHED') return relatedInvoices.length > 0;
      if (statusFilter === 'UNMATCHED') return relatedInvoices.length === 0;
      return true;
    }).map((dn) => {
      const relatedPoLines = poLinesByPoMap.get(dn.poNumber) || [];
      const relatedInvoices = (invoicesByPoMap.get(dn.poNumber) || []).slice().sort((a, b) => naturalCompare(a.invoiceNumber, b.invoiceNumber));
      const totalDeliveredQty = dn.totalDeliveredQuantity || (dn.lines || []).reduce((sum, l) => sum + (l.deliveredQuantity || 0), 0);
      const totalDeliveredVal = dn.totalDeliveredValue || (dn.lines || []).reduce((sum, l) => sum + (l.valueAfterVat || 0), 0);
      const totalPoQty = relatedPoLines.reduce((sum, p) => sum + (p.poQuantity || 0), 0);
      const totalPoVal = relatedPoLines.reduce((sum, p) => sum + (p.valueAfterVat || (p.poQuantity * p.unitPrice * (1 + (p.vatRate ?? 0.18)))), 0);
      const totalInvoicedQty = relatedInvoices.reduce((sum, inv) => sum + (inv.lines || []).reduce((lsum, l) => lsum + (l.invoicedQuantity || 0), 0), 0);
      const totalInvoicedVal = relatedInvoices.reduce((sum, inv) => sum + (inv.totalAfterVat || 0), 0);

      return {
        deliveryNote: dn,
        relatedPoLines,
        relatedInvoices,
        totalDeliveredQty,
        totalDeliveredVal,
        totalPoQty,
        totalPoVal,
        totalInvoicedQty,
        totalInvoicedVal,
      };
    }).sort((a, b) => naturalCompare(a.deliveryNote.deliveryNoteNumber, b.deliveryNote.deliveryNoteNumber));
  }, [deliveryNotes, poLinesByPoMap, invoicesByPoMap, debouncedSearchQuery, statusFilter]);

  // Paginated slices for performance
  const paginatedPoGroups = useMemo(() => {
    const start = (poPage - 1) * poPageSize;
    return poReconciliationGroups.slice(start, start + poPageSize);
  }, [poReconciliationGroups, poPage, poPageSize]);

  const paginatedInvoiceGroups = useMemo(() => {
    const start = (invPage - 1) * invPageSize;
    return invoiceReconciliationGroups.slice(start, start + invPageSize);
  }, [invoiceReconciliationGroups, invPage, invPageSize]);

  const paginatedDeliveryGroups = useMemo(() => {
    const start = (delPage - 1) * delPageSize;
    return deliveryReconciliationGroups.slice(start, start + delPageSize);
  }, [deliveryReconciliationGroups, delPage, delPageSize]);

  const paginatedItems = useMemo(() => {
    const start = (itemsPage - 1) * itemsPageSize;
    return filteredMatchingData.slice(start, start + itemsPageSize);
  }, [filteredMatchingData, itemsPage, itemsPageSize]);

  // Grouping 2: Group by Vendor / Customer
  const vendorReconciliationGroups = useMemo(() => {
    const groupsMap = new Map<string, {
      vendor: string;
      poNumbersSet: Set<string>;
      items: MatchingItem[];
      totalPoQty: number;
      totalPoVal: number;
      totalDeliveredQty: number;
      totalDeliveredVal: number;
      totalInvoicedQty: number;
      totalInvoicedVal: number;
      totalUnmatchedQty: number;
      totalUndeliveredQty: number;
    }>();

    (filteredMatchingData || []).forEach((item) => {
      if (!item || !item.customerName) return;
      const existing = groupsMap.get(item.customerName) || {
        vendor: item.customerName,
        poNumbersSet: new Set<string>(),
        items: [],
        totalPoQty: 0,
        totalPoVal: 0,
        totalDeliveredQty: 0,
        totalDeliveredVal: 0,
        totalInvoicedQty: 0,
        totalInvoicedVal: 0,
        totalUnmatchedQty: 0,
        totalUndeliveredQty: 0,
      };

      existing.poNumbersSet.add(item.poNumber);
      existing.items.push(item);
      existing.totalPoQty += item.poQuantity || 0;
      existing.totalPoVal += item.poTotalValue || 0;
      existing.totalDeliveredQty += item.deliveredQuantity || 0;
      existing.totalDeliveredVal += item.deliveredValue || 0;
      existing.totalInvoicedQty += item.invoicedQuantity || 0;
      existing.totalInvoicedVal += item.invoicedValue || 0;
      existing.totalUnmatchedQty += item.unmatchedQty || 0;
      existing.totalUndeliveredQty += item.undeliveredQty || 0;

      groupsMap.set(item.customerName, existing);
    });

    return Array.from(groupsMap.values()).map((grp) => {
      const fulfillmentRate = grp.totalPoQty > 0 ? Math.round((grp.totalInvoicedQty / grp.totalPoQty) * 100) : 0;
      const deliveryRate = grp.totalPoQty > 0 ? Math.round((grp.totalDeliveredQty / grp.totalPoQty) * 100) : 0;
      
      let status: 'FULLY_MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED' = 'UNMATCHED';
      if (grp.totalInvoicedQty >= grp.totalPoQty && grp.totalPoQty > 0) {
        status = 'FULLY_MATCHED';
      } else if (grp.totalInvoicedQty > 0) {
        status = 'PARTIALLY_MATCHED';
      }

      return {
        ...grp,
        poCount: grp.poNumbersSet.size,
        poNumbers: Array.from(grp.poNumbersSet),
        fulfillmentRate,
        deliveryRate,
        status,
      };
    });
  }, [filteredMatchingData]);

  // Paginated slice for the Vendor grouping view — the other three grouping modes
  // (PO/Invoice/Delivery) already paginate; this one rendered every vendor's full
  // card (with nested items) unbounded, which only stayed cheap by luck of a small
  // customer count.
  const paginatedVendorGroups = useMemo(() => {
    const start = (vendorPage - 1) * vendorPageSize;
    return vendorReconciliationGroups.slice(start, start + vendorPageSize);
  }, [vendorReconciliationGroups, vendorPage, vendorPageSize]);

  // Export handlers for reconciliation dataset
  const handleExportReconciliationExcel = () => {
    const headers = [
      'PO Number',
      'Customer/Vendor',
      'Item Description',
      'PO Qty',
      'Unit',
      'Unit Price (TZS)',
      'Total Value (TZS)',
      'Delivered Qty',
      'Invoiced Qty',
      'Uninvoiced Qty',
      'Undelivered Qty',
      'Status'
    ];
    const rows = filteredMatchingData.map((item) => [
      item.poNumber,
      item.customerName,
      item.itemDescription,
      item.poQuantity,
      item.unitOfMeasure,
      formatCurrency(item.unitPrice),
      formatCurrency(item.poTotalValue),
      item.deliveredQuantity,
      item.invoicedQuantity,
      item.unmatchedQty,
      item.undeliveredQty,
      item.status
    ]);
    exportTableToExcel('Reconciliation_Summary', headers, rows, 'reconciliation_summary');
  };

  const handleExportReconciliationPdf = () => {
    const headers = [
      'PO #',
      'Customer',
      'Item',
      'PO Qty',
      'Delivered',
      'Invoiced',
      'Uninvoiced',
      'Status'
    ];
    const rows = filteredMatchingData.map((item) => [
      item.poNumber,
      item.customerName,
      item.itemDescription,
      `${item.poQuantity} ${item.unitOfMeasure}`,
      `${item.deliveredQuantity} ${item.unitOfMeasure}`,
      `${item.invoicedQuantity} ${item.unitOfMeasure}`,
      `${item.unmatchedQty} ${item.unitOfMeasure}`,
      item.status
    ]);
    exportTableToPdf('Reconciliation & Matching Summary', headers, rows, {
      filenamePrefix: 'reconciliation_summary',
      currencyNote: 'Currency: TZS'
    });
  };

  const handleExportPOItemsExcel = (poNumber: string, items: MatchingItem[]) => {
    const headers = ['Item Description', 'PO Qty', 'Delivered Qty', 'Invoiced Qty', 'Uninvoiced Qty', 'Undelivered Qty', 'Status'];
    const rows = items.map(item => [
      item.itemDescription,
      `${item.poQuantity} ${item.unitOfMeasure}`,
      `${item.deliveredQuantity} ${item.unitOfMeasure}`,
      `${item.invoicedQuantity} ${item.unitOfMeasure}`,
      `${item.unmatchedQty} ${item.unitOfMeasure}`,
      `${item.undeliveredQty} ${item.unitOfMeasure}`,
      item.status
    ]);
    exportTableToExcel(`PO_${poNumber}_Items`, headers, rows, `po_${poNumber}_items`);
  };

  const handleExportPOItemsPdf = (poNumber: string, items: MatchingItem[]) => {
    const headers = ['Item Description', 'PO Qty', 'Delivered Qty', 'Invoiced Qty', 'Uninvoiced Qty', 'Undelivered Qty', 'Status'];
    const rows = items.map(item => [
      item.itemDescription,
      `${item.poQuantity} ${item.unitOfMeasure}`,
      `${item.deliveredQuantity} ${item.unitOfMeasure}`,
      `${item.invoicedQuantity} ${item.unitOfMeasure}`,
      `${item.unmatchedQty} ${item.unitOfMeasure}`,
      `${item.undeliveredQty} ${item.unitOfMeasure}`,
      item.status
    ]);
    exportTableToPdf(`PO #${poNumber} Items Matching`, headers, rows, { filenamePrefix: `po_${poNumber}_items`, currencyNote: 'Currency: TZS' });
  };

  const handleExportInvoicesExcel = () => {
    const headers = ['Invoice #', 'Date Raised', 'PO Number', 'Customer / Vendor', 'Destination', 'Contract', 'Subtotal', 'VAT', 'Total Value (TZS)', 'Paid Amount', 'Payment Status', 'Lines Billed'];
    const rows = invoiceReconciliationGroups.map(({ invoice, totalBilledQty }) => [
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.poNumber,
      invoice.customerName,
      invoice.destination,
      invoice.contract || '',
      invoice.subtotalBeforeVat,
      invoice.totalVat,
      invoice.totalAfterVat,
      invoice.paidAmount || 0,
      invoice.paymentStatus || 'UNPAID',
      `${totalBilledQty} units (${invoice.lines?.length || 0} lines)`
    ]);
    exportTableToExcel('Invoices_Raised_Reconciliation', headers, rows, 'invoices_reconciliation');
  };

  const handleExportInvoicesPdf = () => {
    const headers = ['Invoice #', 'Date Raised', 'PO #', 'Customer', 'Total Value', 'Paid', 'Status'];
    const rows = invoiceReconciliationGroups.map(({ invoice }) => [
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.poNumber,
      invoice.customerName,
      `TZS ${formatCurrency(invoice.totalAfterVat)}`,
      `TZS ${formatCurrency(invoice.paidAmount || 0)}`,
      invoice.paymentStatus || 'UNPAID'
    ]);
    exportTableToPdf('Invoices Raised Reconciliation', headers, rows, { filenamePrefix: 'invoices_reconciliation', currencyNote: 'Currency: TZS' });
  };

  const handleExportDeliveriesExcel = () => {
    const headers = ['Delivery Note #', 'Delivery Date', 'PO Number', 'Customer / Vendor', 'Destination', 'Carrier / Vehicle', 'Driver Name', 'Received By', 'Delivered Qty', 'Total Value (TZS)'];
    const rows = deliveryReconciliationGroups.map(({ deliveryNote, totalDeliveredQty, totalDeliveredVal }) => [
      deliveryNote.deliveryNoteNumber,
      deliveryNote.deliveryDate,
      deliveryNote.poNumber,
      deliveryNote.customerName,
      deliveryNote.destination,
      `${deliveryNote.carrier || ''} ${deliveryNote.vehicleNumber || ''}`.trim(),
      deliveryNote.driverName || '',
      deliveryNote.receivedBy || '',
      totalDeliveredQty,
      totalDeliveredVal
    ]);
    exportTableToExcel('Delivery_Notes_Reconciliation', headers, rows, 'deliveries_reconciliation');
  };

  const handleExportDeliveriesPdf = () => {
    const headers = ['DN #', 'Date Delivered', 'PO #', 'Customer', 'Vehicle / Driver', 'Delivered Qty', 'Total Value'];
    const rows = deliveryReconciliationGroups.map(({ deliveryNote, totalDeliveredQty, totalDeliveredVal }) => [
      deliveryNote.deliveryNoteNumber,
      deliveryNote.deliveryDate,
      deliveryNote.poNumber,
      deliveryNote.customerName,
      `${deliveryNote.vehicleNumber || ''} ${deliveryNote.driverName || ''}`.trim() || 'N/A',
      `${totalDeliveredQty} units`,
      `TZS ${formatCurrency(totalDeliveredVal)}`
    ]);
    exportTableToPdf('Delivery Notes Reconciliation', headers, rows, { filenamePrefix: 'deliveries_reconciliation', currencyNote: 'Currency: TZS' });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Quick Actions */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-700/60 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight">PO, Invoice & Delivery Analytics</span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Live Reconciled
              </span>
            </div>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">
              Interactive dashboard with 3-way reconciliation (PO vs. Delivery Note vs. Invoice) grouped by PO or Vendor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenVoiceSearch && (
              <button
                type="button"
                onClick={onOpenVoiceSearch}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer group"
                title="AI Voice Search POs (Cmd+K)"
              >
                <Mic className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                <span>AI Voice Search</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAiManagementReportModule('INVOICE');
                setIsAIManagementReportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer group"
              title="Generate AI Management Report Summary (Invoice, Delivery, Payment & PDF Export)"
            >
              <Sparkles className="w-4 h-4 text-purple-200 group-hover:rotate-12 transition-transform" />
              <span>AI Management Report</span>
            </button>
            {onOpenAutoReport && (
              <button
                type="button"
                onClick={onOpenAutoReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer"
                title="Generate AI Automated Reports"
              >
                <Sparkles className="w-4 h-4 text-purple-300" />
                <span>AI Auto Reports</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('matching_report')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <GitCompare className="w-4 h-4" />
              Full Matching Matrix
            </button>
            <button
              type="button"
              onClick={() => {
                document.getElementById('customer-book-series-audit')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600/80 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
              title="Customer 50-Leaflet Book Series & Missing Numbers Audit"
            >
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span>50-Book Series Audit</span>
            </button>
            <button
              onClick={() => onNavigate('create_invoice')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Record Invoice
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4 PRIMARY INTERACTIVE SUMMARY CARDS (Clickable to navigate to full data)
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: Total Number of POs and Value */}
        <div
          onClick={() => onNavigate('po_master')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                1. Total POs & Value
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono">
                TZS {formatCurrency(metrics.totalPoValue)}
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-2">
                <span className="text-blue-600 font-bold">{metrics.totalPOs.toLocaleString()} Total POs</span>
                <span>•</span>
                <span>{poLines.length.toLocaleString()} Item Lines</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold">
            <span>View Full PO Master Data</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* CARD 2: Total Invoice and Value */}
        <div
          onClick={() => onNavigate('invoices_db')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                2. Total Invoices Issued
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-emerald-700 font-mono">
                TZS {formatCurrency(metrics.totalInvoicedValue)}
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-2">
                <span className="text-emerald-600 font-bold">{metrics.totalInvoicesCount} Invoices</span>
                <span>•</span>
                <span>{metrics.fulfillmentRate}% Fulfilled</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-semibold">
            <span>View Invoiced PO Database</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* CARD 3: Delivery Notes per Vendor (Total & Value) */}
        <div
          onClick={() => onNavigate('delivery_details')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                3. Delivery Notes (DNs)
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-indigo-700 font-mono">
                TZS {formatCurrency(metrics.totalDeliveredValue)}
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-2">
                <span className="text-indigo-600 font-bold">{metrics.totalDeliveryNotesCount} Delivery Notes</span>
                <span>•</span>
                <span>{vendorDnStats.length} Vendors</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-semibold">
            <span>View Delivery Notes Database</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* CARD 4: Payment Received Against Invoices */}
        <div
          onClick={() => onNavigate('payments')}
          className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-400 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                4. Payments Received
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 font-mono">
                TZS {formatCurrency(metrics.totalPaymentsReceived)}
              </div>
              <div className="text-xs text-slate-600 font-semibold mt-1 flex items-center justify-between">
                <span className="text-amber-700 font-medium">Unpaid: TZS {formatCurrency(metrics.totalOutstandingPayments)}</span>
                <span className="font-bold text-emerald-600">
                  {metrics.totalInvoicedValue > 0 ? Math.round((metrics.totalPaymentsReceived / metrics.totalInvoicedValue) * 100) : 0}% Paid
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-700 font-semibold">
            <span>View Payments Received</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* =========================================================================
          AI EXECUTIVE MANAGEMENT REPORT GENERATOR BANNER & QUICK LAUNCH
          ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center shrink-0 shadow-inner">
            <Sparkles className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight">
                AI Executive Management Report Generator
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                Invoices • Deliveries • Payments
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Generate executive summary reports with 50-leaflet books tracking, customer issues status, work performance narrative, customer billing value charts, PO reconciliation, and one-click PDF export.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setAiManagementReportModule('INVOICE');
              setIsAIManagementReportOpen(true);
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-blue-200" />
            <span>Invoice Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAiManagementReportModule('DELIVERY');
              setIsAIManagementReportOpen(true);
            }}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-purple-200" />
            <span>Delivery Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAiManagementReportModule('PAYMENT');
              setIsAIManagementReportOpen(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-200" />
            <span>Payment Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAiManagementReportModule('INVOICE');
              setIsAIManagementReportOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          CUSTOMER BOOK SERIES (50-LEAFLETS) & MISSING NUMBER AUDIT SUMMARY
          ========================================================================= */}
      <CustomerBookSeriesAudit
        invoices={invoices}
        deliveryNotes={deliveryNotes}
        onNavigate={onNavigate}
      />

      {/* =========================================================================
          RECONCILIATION & MATCHING: PO ITEMS VS DELIVERED VS INVOICED
          WITH GROUP BY PO OR VENDOR TOGGLE
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Section Header */}
        <div className="p-5 border-b border-slate-100 bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <GitCompare className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Reconciliation & Matching: PO Items vs Delivered (Received) vs Invoiced
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                3-Way variance tracking across Ordered POs, Physical Delivery Notes, and Issued Invoices. Group by Purchase Order, Invoice Raised, Delivery Note, or Vendor.
              </p>
            </div>

            {/* Grouping Mode & Metric View Mode Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Grouping Mode Selector */}
              <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold gap-1">
                <button
                  onClick={() => setGroupingMode('PO')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    groupingMode === 'PO'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  Group by PO ({poGroups.length})
                </button>
                <button
                  onClick={() => setGroupingMode('INVOICE')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    groupingMode === 'INVOICE'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Group items by invoice raised to trace billed amounts and delivery matching"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Group by Invoice ({invoices.length})
                </button>
                <button
                  onClick={() => setGroupingMode('DELIVERY')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    groupingMode === 'DELIVERY'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Group items per delivery note to trace goods received and invoice matching"
                >
                  <Truck className="w-3.5 h-3.5" />
                  Group by Delivery ({deliveryNotes.length})
                </button>
                <button
                  onClick={() => setGroupingMode('VENDOR')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    groupingMode === 'VENDOR'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Group by Vendor ({vendorDnStats.length || poGroups.reduce((acc, g) => acc.add(g.customerName), new Set()).size})
                </button>
                <button
                  onClick={() => setGroupingMode('ITEMS')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    groupingMode === 'ITEMS'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  All Line Items ({matchingData.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('customer-book-series-audit')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  title="Trace physical 50-leaflet books and missing numbers for Invoices and Deliveries"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>50-Book Series</span>
                </button>
              </div>

              {/* Top Selector: Item Lines View by Quantity (Qty) vs. Amount (TZS) */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold gap-1 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-500 pl-2 pr-1 hidden sm:inline-block">
                  Item View:
                </span>
                <button
                  type="button"
                  onClick={() => setMetricMode('QUANTITY')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    metricMode === 'QUANTITY'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="View item lines by Quantity (Invoice Qty, Delivered Qty, PO Qty & Variance)"
                >
                  <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                  Quantity (Qty)
                </button>
                <button
                  type="button"
                  onClick={() => setMetricMode('AMOUNT')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    metricMode === 'AMOUNT'
                      ? 'bg-white text-emerald-700 shadow-xs font-bold ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="View item lines by Amount / Value (Invoice Amount, Delivered Value, PO Value in TZS)"
                >
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  Amount (TZS)
                </button>
              </div>

              <button
                onClick={() => onNavigate('matching_report')}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Full Matrix
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search, Status Filters and Expand All */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search PO, Vendor, Item, or Site..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status filter chips */}
              <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-medium">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Statuses ({matchingData.length})
                </button>
                <button
                  onClick={() => setStatusFilter('MATCHED')}
                  className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'MATCHED'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Fully Matched ({fullyMatchedItems.length})
                </button>
                <button
                  onClick={() => setStatusFilter('UNMATCHED')}
                  className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'UNMATCHED'
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Un-invoiced ({unmatchedItems.length})
                </button>
                <button
                  onClick={() => setStatusFilter('UNDELIVERED')}
                  className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'UNDELIVERED'
                      ? 'bg-indigo-700 text-white border-indigo-700'
                      : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  Undelivered ({undeliveredItems.length})
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
              <TableExportToolbar
                totalCount={
                  groupingMode === 'PO' ? poReconciliationGroups.length :
                  groupingMode === 'INVOICE' ? invoiceReconciliationGroups.length :
                  groupingMode === 'DELIVERY' ? deliveryReconciliationGroups.length :
                  groupingMode === 'VENDOR' ? vendorReconciliationGroups.length :
                  filteredMatchingData.length
                }
                onExportExcel={
                  groupingMode === 'INVOICE' ? handleExportInvoicesExcel :
                  groupingMode === 'DELIVERY' ? handleExportDeliveriesExcel :
                  handleExportReconciliationExcel
                }
                onExportPdf={
                  groupingMode === 'INVOICE' ? handleExportInvoicesPdf :
                  groupingMode === 'DELIVERY' ? handleExportDeliveriesPdf :
                  handleExportReconciliationPdf
                }
                size="sm"
              />
              {groupingMode !== 'ITEMS' && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => toggleAllGroups(true)}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    Expand All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => toggleAllGroups(false)}
                    className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3 Quick Reconciliation Stat Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/70 text-xs border-b border-slate-100">
          <div
            onClick={() => setStatusFilter('MATCHED')}
            className="p-3.5 hover:bg-emerald-50/50 transition-colors cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 block">Fully Matched Lines</span>
                <span className="text-[11px] text-slate-500">100% Invoiced against PO</span>
              </div>
            </div>
            <span className="font-mono font-bold text-sm text-emerald-700">
              {fullyMatchedItems.length}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('UNMATCHED')}
            className="p-3.5 hover:bg-amber-50/50 transition-colors cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 block">Unmatched Items on PO</span>
                <span className="text-[11px] text-amber-700 font-medium">Remaining balance to invoice</span>
              </div>
            </div>
            <span className="font-mono font-bold text-sm text-amber-700">
              {unmatchedItems.length}
            </span>
          </div>

          <div
            onClick={() => setStatusFilter('UNDELIVERED')}
            className="p-3.5 hover:bg-indigo-50/50 transition-colors cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 block">Undelivered Items</span>
                <span className="text-[11px] text-indigo-700 font-medium">Pending physical delivery note</span>
              </div>
            </div>
            <span className="font-mono font-bold text-sm text-indigo-700">
              {undeliveredItems.length}
            </span>
          </div>
        </div>

        {/* =====================================================================
            VIEW MODE 1: GROUP BY PURCHASE ORDER (PO)
            ===================================================================== */}
        {groupingMode === 'PO' && (
          <>
            <div className="divide-y divide-slate-100">
              {poReconciliationGroups.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No Purchase Orders found matching the current search or filters.
                </div>
              ) : (
                paginatedPoGroups.map((poGroup) => {
                const isExpanded = expandedKeys[poGroup.poNumber];
                return (
                  <div key={poGroup.poNumber} className="bg-white hover:bg-slate-50/60 transition-colors">
                    {/* Header Row for PO */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left info: PO #, Vendor, Contract, Date */}
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={() => toggleGroup(poGroup.poNumber)}
                          className="mt-0.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title={isExpanded ? 'Collapse PO items' : 'Expand PO items'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {poGroup.poNumber}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{poGroup.customerName}</span>
                            {poGroup.contract && (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {poGroup.contract}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              {poGroup.poDate} • {poGroup.destination}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span>{poGroup.items.length} Line Items</span>
                            <span>•</span>
                            <span>
                              Ordered: <strong className="text-slate-800">{poGroup.totalPoQty.toLocaleString()} units</strong> (TZS {formatCurrency(poGroup.totalPoVal)})
                            </span>
                            <span>•</span>
                            <span>
                              Delivered: <strong className="text-indigo-700">{poGroup.totalDeliveredQty.toLocaleString()} units</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Invoiced: <strong className="text-emerald-700">{poGroup.totalInvoicedQty.toLocaleString()} units</strong> (TZS {formatCurrency(poGroup.totalInvoicedVal)})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right metrics, fulfillment bar & quick action */}
                      <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                        {/* Progress visual */}
                        <div className="w-32 hidden sm:block">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1">
                            <span>Invoiced</span>
                            <span className={poGroup.fulfillmentRate >= 100 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                              {poGroup.fulfillmentRate}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, poGroup.fulfillmentRate)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                            <span>Delivered: {poGroup.deliveryRate}%</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {poGroup.status === 'FULLY_MATCHED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Matched
                            </span>
                          ) : poGroup.status === 'PARTIALLY_MATCHED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3.5 h-3.5" />
                              Partial ({poGroup.totalUnmatchedQty} left)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Un-invoiced
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          {poGroup.totalUnmatchedQty > 0 && (
                            <button
                              onClick={() => {
                                onSelectPOForInvoice(poGroup.poNumber);
                                onNavigate('create_invoice');
                              }}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                              title="Create new invoice for remaining items on this PO"
                            >
                              + Invoice
                            </button>
                          )}
                          <button
                            onClick={() => toggleGroup(poGroup.poNumber)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            {isExpanded ? 'Hide' : 'Items'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-table & Details under this PO */}
                    {isExpanded && (
                      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-3 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => setPoSubTab(poGroup.poNumber, 'items')}
                              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                                getPoSubTab(poGroup.poNumber) === 'items'
                                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Layers className="w-3.5 h-3.5" />
                              PO Items Matching ({poGroup.items.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setPoSubTab(poGroup.poNumber, 'invoices')}
                              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                                getPoSubTab(poGroup.poNumber) === 'invoices'
                                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Invoices Raised ({poGroup.invoicesForPo.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setPoSubTab(poGroup.poNumber, 'deliveries')}
                              className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                                getPoSubTab(poGroup.poNumber) === 'deliveries'
                                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Delivery Notes ({poGroup.deliveryNotesForPo.length})
                            </button>
                          </div>

                          {getPoSubTab(poGroup.poNumber) === 'items' && (
                            <TableExportToolbar
                              totalCount={poGroup.items.length}
                              onExportExcel={() => handleExportPOItemsExcel(poGroup.poNumber, poGroup.items)}
                              onExportPdf={() => handleExportPOItemsPdf(poGroup.poNumber, poGroup.items)}
                              size="sm"
                            />
                          )}
                        </div>

                        {/* SUB-TAB 1: PO LINE ITEMS */}
                        {getPoSubTab(poGroup.poNumber) === 'items' && (
                          <div className="overflow-auto max-h-[380px] scrollbar-thin rounded-xl border border-slate-200/80 bg-white shadow-xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-900 text-white text-[10px] uppercase font-semibold sticky top-0 z-10 shadow-sm">
                                <tr>
                                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Item Description</th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                    {metricMode === 'AMOUNT' ? 'PO Value (TZS)' : 'PO Ordered'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-indigo-300">
                                    {metricMode === 'AMOUNT' ? 'Delivered Value (TZS)' : 'Delivered (DN)'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-emerald-300">
                                    {metricMode === 'AMOUNT' ? 'Invoiced Amount (TZS)' : 'Invoiced Qty'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-amber-300">
                                    {metricMode === 'AMOUNT' ? 'Delivered vs Invoiced' : 'Delivery vs Invoice'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                    {metricMode === 'AMOUNT' ? 'Uninvoiced Value' : 'Un-invoiced'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                    {metricMode === 'AMOUNT' ? 'Undelivered Value' : 'Undelivered'}
                                  </th>
                                  <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Status</th>
                                  <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {poGroup.items.map((item, itemIdx) => {
                                  const dnVsInvQtyDiff = item.deliveredQuantity - item.invoicedQuantity;
                                  const dnVsInvValDiff = item.deliveredValue - item.invoicedValue;
                                  const uninvoicedVal = Math.max(0, item.poTotalValue - item.invoicedValue);
                                  const undeliveredVal = Math.max(0, item.poTotalValue - item.deliveredValue);

                                  return (
                                    <tr key={itemIdx} className="hover:bg-indigo-50/30 transition-colors">
                                      <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={item.itemDescription}>
                                        {item.itemDescription}
                                      </td>
                                      {/* PO Ordered */}
                                      <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                                        {metricMode === 'AMOUNT' ? (
                                          `TZS ${formatCurrency(item.poTotalValue)}`
                                        ) : (
                                          `${item.poQuantity} ${item.unitOfMeasure}`
                                        )}
                                      </td>
                                      {/* Delivered */}
                                      <td className="py-2 px-3 text-right font-semibold text-indigo-700 font-mono">
                                        {metricMode === 'AMOUNT' ? (
                                          `TZS ${formatCurrency(item.deliveredValue)}`
                                        ) : (
                                          `${item.deliveredQuantity} ${item.unitOfMeasure}`
                                        )}
                                      </td>
                                      {/* Invoiced */}
                                      <td className="py-2 px-3 text-right font-bold text-emerald-700 font-mono">
                                        {metricMode === 'AMOUNT' ? (
                                          `TZS ${formatCurrency(item.invoicedValue)}`
                                        ) : (
                                          `${item.invoicedQuantity} ${item.unitOfMeasure}`
                                        )}
                                      </td>
                                      {/* Delivery vs Invoice comparison */}
                                      <td className="py-2 px-3 text-right font-mono text-[11px]">
                                        {metricMode === 'AMOUNT' ? (
                                          dnVsInvValDiff === 0 ? (
                                            <span className="text-emerald-700 font-semibold">Matched (TZS 0)</span>
                                          ) : dnVsInvValDiff > 0 ? (
                                            <span className="text-indigo-700 font-semibold" title="Delivered value pending invoice">
                                              +TZS {formatCurrency(dnVsInvValDiff)} Unbilled
                                            </span>
                                          ) : (
                                            <span className="text-amber-700 font-semibold" title="Invoiced exceeds delivered goods">
                                              -TZS {formatCurrency(Math.abs(dnVsInvValDiff))} Overbilled
                                            </span>
                                          )
                                        ) : (
                                          dnVsInvQtyDiff === 0 ? (
                                            <span className="text-emerald-700 font-semibold">Matched (0)</span>
                                          ) : dnVsInvQtyDiff > 0 ? (
                                            <span className="text-indigo-700 font-semibold" title="Delivered units pending invoice">
                                              +{dnVsInvQtyDiff} {item.unitOfMeasure} Unbilled
                                            </span>
                                          ) : (
                                            <span className="text-amber-700 font-semibold" title="Invoiced units exceed delivery">
                                              {dnVsInvQtyDiff} {item.unitOfMeasure} Overbilled
                                            </span>
                                          )
                                        )}
                                      </td>
                                      {/* Uninvoiced */}
                                      <td className="py-2 px-3 text-right font-bold font-mono">
                                        {metricMode === 'AMOUNT' ? (
                                          uninvoicedVal > 0 ? (
                                            <span className="text-amber-700">TZS {formatCurrency(uninvoicedVal)}</span>
                                          ) : (
                                            <span className="text-emerald-700">TZS 0</span>
                                          )
                                        ) : (
                                          item.unmatchedQty > 0 ? (
                                            <span className="text-amber-700">{item.unmatchedQty} {item.unitOfMeasure}</span>
                                          ) : (
                                            <span className="text-emerald-700">0</span>
                                          )
                                        )}
                                      </td>
                                      {/* Undelivered */}
                                      <td className="py-2 px-3 text-right font-medium font-mono">
                                        {metricMode === 'AMOUNT' ? (
                                          undeliveredVal > 0 ? (
                                            <span className="text-red-600">TZS {formatCurrency(undeliveredVal)}</span>
                                          ) : (
                                            <span className="text-slate-400">TZS 0</span>
                                          )
                                        ) : (
                                          item.undeliveredQty > 0 ? (
                                            <span className="text-red-600">{item.undeliveredQty} {item.unitOfMeasure}</span>
                                          ) : (
                                            <span className="text-slate-400">0</span>
                                          )
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {item.status === 'FULLY_MATCHED' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            Matched
                                          </span>
                                        ) : item.status === 'PARTIALLY_MATCHED' ? (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                            Partial
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                            Unmatched
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        <button
                                          onClick={() => setSelectedDrilldownItem(item)}
                                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium cursor-pointer"
                                        >
                                          Drilldown
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* SUB-TAB 2: INVOICES RAISED FOR THIS PO */}
                        {getPoSubTab(poGroup.poNumber) === 'invoices' && (
                          <div className="space-y-3">
                            {poGroup.invoicesForPo.length === 0 ? (
                              <div className="py-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="font-semibold text-slate-700">No Invoices Issued Yet for PO #{poGroup.poNumber}</p>
                                <p className="text-slate-400 mt-0.5">Click "+ Invoice" above to raise an invoice for remaining PO items.</p>
                              </div>
                            ) : (
                              poGroup.invoicesForPo.map((inv, invIdx) => (
                                <div key={invIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                                  <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                                        {inv.invoiceNumber}
                                      </span>
                                      <span className="text-xs text-slate-600 flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        Raised on: <strong className="text-slate-800">{inv.invoiceDate || 'N/A'}</strong>
                                      </span>
                                      {inv.contract && (
                                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                          Contract: {inv.contract}
                                        </span>
                                      )}
                                      <span className="text-[11px] text-slate-400">
                                        {inv.destination}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Invoiced</span>
                                        <span className="font-bold text-xs text-slate-900 font-mono">
                                          TZS {formatCurrency(inv.totalAfterVat)}
                                        </span>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        inv.paymentStatus === 'PAID'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : inv.paymentStatus === 'PARTIAL'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}>
                                        {inv.paymentStatus || 'UNPAID'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Line items billed */}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-slate-100/70 text-slate-700 text-[10px] uppercase font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="py-2 px-3">Billed Item Description</th>
                                          <th className="py-2 px-3 text-right">Billed Qty</th>
                                          <th className="py-2 px-3 text-right">Unit Price</th>
                                          <th className="py-2 px-3 text-right">VAT</th>
                                          <th className="py-2 px-3 text-right">Line Total (TZS)</th>
                                          <th className="py-2 px-3">Discrepancy / Remarks</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {(inv.lines || []).map((line, lIdx) => (
                                          <tr key={lIdx} className="hover:bg-slate-50/50">
                                            <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={line.itemDescription}>
                                              {line.itemDescription}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-emerald-700 font-mono">
                                              {line.invoicedQuantity} {line.unitOfMeasure}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                                              TZS {formatCurrency(line.unitPrice)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-500">
                                              TZS {formatCurrency(line.vatAmount)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">
                                              TZS {formatCurrency(line.valueAfterVat)}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                                              {line.issueDescription ? (
                                                <span className="text-red-600 font-medium">{line.issueDescription}</span>
                                              ) : (
                                                <span className="text-slate-400 italic">None</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* SUB-TAB 3: DELIVERY NOTES RECORDED FOR THIS PO */}
                        {getPoSubTab(poGroup.poNumber) === 'deliveries' && (
                          <div className="space-y-3">
                            {poGroup.deliveryNotesForPo.length === 0 ? (
                              <div className="py-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                                <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="font-semibold text-slate-700">No Delivery Notes Recorded Yet for PO #{poGroup.poNumber}</p>
                                <p className="text-slate-400 mt-0.5">Physical goods deliveries will appear here once recorded with delivery dates.</p>
                              </div>
                            ) : (
                              poGroup.deliveryNotesForPo.map((dn, dnIdx) => (
                                <div key={dnIdx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                                  <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs">
                                        {dn.deliveryNoteNumber}
                                      </span>
                                      <span className="text-xs text-slate-600 flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        Delivered on: <strong className="text-slate-800">{dn.deliveryDate || 'N/A'}</strong>
                                      </span>
                                      {dn.vehicleNumber && (
                                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                          Vehicle: {dn.vehicleNumber} {dn.driverName ? `• Driver: ${dn.driverName}` : ''}
                                        </span>
                                      )}
                                      {dn.receivedBy && (
                                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                          Received by: {dn.receivedBy}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Delivered Qty</span>
                                        <span className="font-bold text-xs text-indigo-900 font-mono">
                                          {dn.totalDeliveredQuantity || (dn.lines || []).reduce((s, l) => s + (l.deliveredQuantity || 0), 0)} units
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Line items delivered */}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-slate-100/70 text-slate-700 text-[10px] uppercase font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="py-2 px-3">Delivered Item Description</th>
                                          <th className="py-2 px-3 text-right">Delivered Qty</th>
                                          <th className="py-2 px-3 text-right">Unit Price</th>
                                          <th className="py-2 px-3 text-right">Line Value After VAT</th>
                                          <th className="py-2 px-3">Remarks / Discrepancy</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {(dn.lines || []).map((line, lIdx) => (
                                          <tr key={lIdx} className="hover:bg-slate-50/50">
                                            <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={line.itemDescription}>
                                              {line.itemDescription}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-indigo-700 font-mono">
                                              {line.deliveredQuantity} {line.unitOfMeasure}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                                              TZS {formatCurrency(line.unitPrice)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">
                                              TZS {formatCurrency(line.valueAfterVat)}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                                              {line.discrepancyNote ? (
                                                <span className="text-amber-600 font-medium">{line.discrepancyNote}</span>
                                              ) : (
                                                <span className="text-slate-400 italic">Good Condition</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {poReconciliationGroups.length > 0 && (
            <TablePagination
              currentPage={poPage}
              totalItems={poReconciliationGroups.length}
              pageSize={poPageSize}
              onPageChange={setPoPage}
              onPageSizeChange={setPoPageSize}
              itemLabel="Purchase Orders"
            />
          )}
        </>
        )}

        {/* =====================================================================
            VIEW MODE: GROUP BY INVOICE RAISED
            Traces every invoice raised, its items billed, and delivery notes on the PO
            ===================================================================== */}
        {groupingMode === 'INVOICE' && (
          <>
            <div className="divide-y divide-slate-100">
              {invoiceReconciliationGroups.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No Invoices Raised Found</p>
                  <p className="text-slate-400 mt-1">No invoices match your current search or filter criteria.</p>
                </div>
              ) : (
                paginatedInvoiceGroups.map((invGrp) => {
                const { invoice: inv, relatedDns, totalBilledQty, totalPoQty, totalDeliveredQty } = invGrp;
                const isExpanded = expandedKeys[inv.invoiceNumber];
                const balanceDue = (inv.totalAfterVat || 0) - (inv.paidAmount || 0);

                return (
                  <div key={inv.invoiceNumber} className="bg-white hover:bg-slate-50/60 transition-colors">
                    {/* Header Row for Invoice */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={() => toggleGroup(inv.invoiceNumber)}
                          className="mt-0.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title={isExpanded ? 'Collapse Invoice details' : 'Expand Invoice details'}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isExpanded ? 'transform rotate-180 text-slate-700' : ''
                            }`}
                          />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {inv.invoiceNumber}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{inv.customerName}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              <Package className="w-3 h-3" />
                              PO #{inv.poNumber}
                            </span>
                            {inv.contract && (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {inv.contract}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Raised: {inv.invoiceDate || 'N/A'}
                            </span>
                            {inv.destination && (
                              <span className="text-[11px] text-slate-400">
                                • {inv.destination}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span>
                              {metricMode === 'AMOUNT' ? 'Total Billed Value: ' : 'Items Billed: '}
                              <strong className={metricMode === 'AMOUNT' ? 'text-emerald-700 font-bold' : 'text-slate-800'}>
                                {metricMode === 'AMOUNT'
                                  ? `TZS ${formatCurrency(inv.totalAfterVat)}`
                                  : `${totalBilledQty.toLocaleString()} units`}
                              </strong>{' '}
                              ({inv.lines?.length || 0} line items)
                            </span>
                            <span>•</span>
                            <span>
                              Invoice Value: <strong className="text-emerald-700">TZS {formatCurrency(inv.totalAfterVat)}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Paid: <strong className="text-slate-700">TZS {formatCurrency(inv.paidAmount || 0)}</strong>
                            </span>
                            {balanceDue > 0 && (
                              <>
                                <span>•</span>
                                <span>
                                  Balance Due: <strong className="text-amber-700">TZS {formatCurrency(balanceDue)}</strong>
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500">
                              Deliveries on PO: <strong className="text-indigo-700">{relatedDns.length} note(s)</strong> (
                              {metricMode === 'AMOUNT'
                                ? `TZS ${formatCurrency(invGrp.totalDeliveredVal)}`
                                : `${totalDeliveredQty.toLocaleString()} units delivered`}
                              )
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right side: Status and Actions */}
                      <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end">
                        {/* Payment Status badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          inv.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : inv.paymentStatus === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {inv.paymentStatus || 'UNPAID'}
                        </span>

                        {inv.hasIssue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            <AlertTriangle className="w-3 h-3" />
                            Issue Flagged
                          </span>
                        )}

                        <button
                          onClick={() => toggleGroup(inv.invoiceNumber)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          {isExpanded ? 'Hide Trace' : 'Items & Trace'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details: PO Reconciliation & Billed Items */}
                    {isExpanded && (
                      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-3 space-y-3">
                        {/* Trace Context Banner: Linked PO and Associated Delivery Notes */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                                PO Fulfillment Context:
                              </span>
                              <span className="font-mono font-semibold text-blue-700">
                                PO #{inv.poNumber}
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                Total Ordered on PO:{' '}
                                <strong className="text-slate-900">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(invGrp.totalPoVal)}`
                                    : `${totalPoQty.toLocaleString()} units`}
                                </strong>
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                Total Delivered to date:{' '}
                                <strong className="text-indigo-700">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(invGrp.totalDeliveredVal)}`
                                    : `${totalDeliveredQty.toLocaleString()} units`}
                                </strong>
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                Billed on this Invoice:{' '}
                                <strong className="text-emerald-700">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(invGrp.totalBilledVal)}`
                                    : `${totalBilledQty.toLocaleString()} units`}
                                </strong>
                              </span>
                            </div>

                            <button
                              onClick={() => {
                                setGroupingMode('PO');
                                if (!expandedKeys[inv.poNumber]) {
                                  toggleGroup(inv.poNumber);
                                }
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              View PO #{inv.poNumber} Full Dashboard
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Related Delivery Notes on this PO */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5 text-indigo-600" />
                              Deliveries for PO #{inv.poNumber}:
                            </span>
                            {relatedDns.length === 0 ? (
                              <span className="text-slate-400 italic text-[11px]">
                                No delivery notes recorded yet for this PO.
                              </span>
                            ) : (
                              relatedDns.map((dn, dnI) => (
                                <span
                                  key={dnI}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50/80 border border-indigo-200 rounded-lg text-[11px] text-indigo-900"
                                >
                                  <strong className="font-mono">{dn.deliveryNoteNumber}</strong>
                                  <span className="text-indigo-400">•</span>
                                  <span>{dn.deliveryDate || 'N/A'}</span>
                                  <span className="text-indigo-400">•</span>
                                  <span className="font-semibold">
                                    {metricMode === 'AMOUNT'
                                      ? `TZS ${formatCurrency(dn.totalDeliveredValue || (dn.lines || []).reduce((s, l) => s + (l.valueAfterVat || 0), 0))}`
                                      : `${dn.totalDeliveredQuantity || (dn.lines || []).reduce((s, l) => s + (l.deliveredQuantity || 0), 0)} units`}
                                  </span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Items Billed on THIS Invoice */}
                        <div className="overflow-auto max-h-[380px] scrollbar-thin rounded-xl border border-slate-200/80 bg-white shadow-xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-900 text-white text-[10px] uppercase font-semibold sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Billed Item Description</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                  {metricMode === 'AMOUNT' ? 'PO Ordered Value (TZS)' : 'PO Ordered Qty'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-indigo-300">
                                  {metricMode === 'AMOUNT' ? 'Delivered Value (DNs)' : 'Delivered on PO'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-emerald-300">
                                  {metricMode === 'AMOUNT' ? 'Invoiced Amount (This Inv)' : 'Invoice Qty (This Inv)'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-amber-300">
                                  {metricMode === 'AMOUNT' ? 'Delivery vs Invoiced Variance' : 'Delivery vs Invoice Qty'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Unit Price</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Line Total (TZS)</th>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Issue / Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {(inv.lines || []).map((line, lIdx) => {
                                // Find matching PO item to show PO ordered & delivered qty / amount context
                                const poMatch = invGrp.relatedPoLines.find(
                                  (p) => p.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                );

                                // Aggregate delivery quantities & values for this specific line item from all DNs on this PO
                                const totalDeliveredLineQty = relatedDns.reduce((sum, d) => {
                                  const matchingDnLine = (d.lines || []).find(
                                    (dl) => dl.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                  );
                                  return sum + (matchingDnLine ? (matchingDnLine.deliveredQuantity || 0) : 0);
                                }, (poMatch?.deliveredQuantity || 0));

                                const totalDeliveredLineVal = relatedDns.reduce((sum, d) => {
                                  const matchingDnLine = (d.lines || []).find(
                                    (dl) => dl.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                  );
                                  return sum + (matchingDnLine ? (matchingDnLine.valueAfterVat || (matchingDnLine.deliveredQuantity * matchingDnLine.unitPrice * 1.18)) : 0);
                                }, (poMatch ? (poMatch.deliveredQuantity * poMatch.unitPrice * (1 + (poMatch.vatRate ?? 0.18))) : 0));

                                const poVal = poMatch
                                  ? (poMatch.valueAfterVat || (poMatch.poQuantity * poMatch.unitPrice * (1 + (poMatch.vatRate ?? 0.18))))
                                  : 0;

                                const qtyDiff = totalDeliveredLineQty - line.invoicedQuantity;
                                const valDiff = totalDeliveredLineVal - line.valueAfterVat;

                                return (
                                  <tr key={lIdx} className="hover:bg-emerald-50/30 transition-colors">
                                    <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={line.itemDescription}>
                                      {line.itemDescription}
                                    </td>
                                    {/* PO Ordered */}
                                    <td className="py-2 px-3 text-right font-semibold text-slate-800 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        poMatch ? `TZS ${formatCurrency(poVal)}` : '—'
                                      ) : (
                                        poMatch ? `${poMatch.poQuantity} ${poMatch.unitOfMeasure}` : '—'
                                      )}
                                    </td>
                                    {/* Delivered on PO */}
                                    <td className="py-2 px-3 text-right font-semibold text-indigo-700 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        `TZS ${formatCurrency(totalDeliveredLineVal)}`
                                      ) : (
                                        `${totalDeliveredLineQty} ${line.unitOfMeasure}`
                                      )}
                                    </td>
                                    {/* Invoice Line (Qty or Amount) */}
                                    <td className="py-2 px-3 text-right font-bold text-emerald-700 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        `TZS ${formatCurrency(line.valueAfterVat)}`
                                      ) : (
                                        `${line.invoicedQuantity} ${line.unitOfMeasure}`
                                      )}
                                    </td>
                                    {/* Delivery vs Invoiced Variance */}
                                    <td className="py-2 px-3 text-right font-mono text-[11px]">
                                      {metricMode === 'AMOUNT' ? (
                                        Math.abs(valDiff) < 1 ? (
                                          <span className="text-emerald-700 font-semibold">Matched (TZS 0)</span>
                                        ) : valDiff > 0 ? (
                                          <span className="text-indigo-700 font-semibold" title="Delivered goods pending invoice">
                                            +TZS {formatCurrency(valDiff)} Unbilled
                                          </span>
                                        ) : (
                                          <span className="text-amber-700 font-semibold" title="Invoiced amount exceeds delivered goods">
                                            -TZS {formatCurrency(Math.abs(valDiff))} Overbilled
                                          </span>
                                        )
                                      ) : (
                                        qtyDiff === 0 ? (
                                          <span className="text-emerald-700 font-semibold">Matched (0)</span>
                                        ) : qtyDiff > 0 ? (
                                          <span className="text-indigo-700 font-semibold" title="Delivered units pending invoice">
                                            +{qtyDiff} {line.unitOfMeasure} Unbilled
                                          </span>
                                        ) : (
                                          <span className="text-amber-700 font-semibold" title="Invoiced units exceed delivery">
                                            {qtyDiff} {line.unitOfMeasure} Overbilled
                                          </span>
                                        )
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                                      TZS {formatCurrency(line.unitPrice)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">
                                      TZS {formatCurrency(line.valueAfterVat)}
                                    </td>
                                    <td className="py-2 px-3 text-slate-500 text-[11px]">
                                      {line.issueDescription ? (
                                        <span className="text-red-600 font-semibold flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3 text-red-500" />
                                          {line.issueDescription}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Clear</span>
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
                );
              })
            )}
          </div>
          {invoiceReconciliationGroups.length > 0 && (
            <TablePagination
              currentPage={invPage}
              totalItems={invoiceReconciliationGroups.length}
              pageSize={invPageSize}
              onPageChange={setInvPage}
              onPageSizeChange={setInvPageSize}
              itemLabel="Invoices"
            />
          )}
        </>
        )}

        {/* =====================================================================
            VIEW MODE: GROUP BY DELIVERY NOTE
            Traces physical deliveries, dates, items received, and linked invoices
            ===================================================================== */}
        {groupingMode === 'DELIVERY' && (
          <>
            <div className="divide-y divide-slate-100">
              {deliveryReconciliationGroups.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No Delivery Notes Found</p>
                  <p className="text-slate-400 mt-1">No delivery notes match your current search or filter criteria.</p>
                </div>
              ) : (
                paginatedDeliveryGroups.map((dnGrp) => {
                const { deliveryNote: dn, relatedInvoices, totalDeliveredQty, totalDeliveredVal, totalPoQty, totalInvoicedQty } = dnGrp;
                const isExpanded = expandedKeys[dn.deliveryNoteNumber];

                return (
                  <div key={dn.deliveryNoteNumber} className="bg-white hover:bg-slate-50/60 transition-colors">
                    {/* Header Row for Delivery Note */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={() => toggleGroup(dn.deliveryNoteNumber)}
                          className="mt-0.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title={isExpanded ? 'Collapse Delivery Note details' : 'Expand Delivery Note details'}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isExpanded ? 'transform rotate-180 text-slate-700' : ''
                            }`}
                          />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {dn.deliveryNoteNumber}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">{dn.customerName}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              <Package className="w-3 h-3" />
                              PO #{dn.poNumber}
                            </span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Delivered: {dn.deliveryDate || 'N/A'}
                            </span>
                            {dn.vehicleNumber && (
                              <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                Vehicle: {dn.vehicleNumber}
                              </span>
                            )}
                            {dn.destination && (
                              <span className="text-[11px] text-slate-400">
                                • {dn.destination}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span>
                              {metricMode === 'AMOUNT' ? 'Delivered Value: ' : 'Delivered: '}
                              <strong className="text-indigo-700 font-bold">
                                {metricMode === 'AMOUNT'
                                  ? `TZS ${formatCurrency(totalDeliveredVal)}`
                                  : `${totalDeliveredQty.toLocaleString()} units`}
                              </strong>{' '}
                              ({dn.lines?.length || 0} line items)
                            </span>
                            <span>•</span>
                            <span>
                              Total Value: <strong className="text-slate-800">TZS {formatCurrency(totalDeliveredVal)}</strong>
                            </span>
                            {dn.driverName && (
                              <>
                                <span>•</span>
                                <span>Driver: <strong className="text-slate-700">{dn.driverName}</strong></span>
                              </>
                            )}
                            {dn.receivedBy && (
                              <>
                                <span>•</span>
                                <span>Received by: <strong className="text-slate-700">{dn.receivedBy}</strong></span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500">
                              Invoices on PO: <strong className="text-emerald-700">{relatedInvoices.length} invoice(s)</strong> (
                              {metricMode === 'AMOUNT'
                                ? `TZS ${formatCurrency(dnGrp.totalInvoicedVal)}`
                                : `${totalInvoicedQty.toLocaleString()} units invoiced`}
                              )
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right side: Status and Actions */}
                      <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end">
                        {relatedInvoices.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {relatedInvoices.length} Invoice(s) Issued
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Invoicing
                          </span>
                        )}

                        <button
                          onClick={() => {
                            onSelectPOForInvoice(dn.poNumber);
                            onNavigate('create_invoice');
                          }}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                          title={`Create new invoice for PO #${dn.poNumber}`}
                        >
                          + Invoice PO
                        </button>

                        <button
                          onClick={() => toggleGroup(dn.deliveryNoteNumber)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          {isExpanded ? 'Hide Trace' : 'Items & Trace'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details: Linked PO, Invoices Issued, and Delivered Items */}
                    {isExpanded && (
                      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-3 space-y-3">
                        {/* Trace Context Banner */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                                PO Invoicing Trace:
                              </span>
                              <span className="font-mono font-semibold text-blue-700">
                                PO #{dn.poNumber}
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                PO Ordered:{' '}
                                <strong className="text-slate-900">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(dnGrp.totalPoVal)}`
                                    : `${totalPoQty.toLocaleString()} units`}
                                </strong>
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                Total Invoiced on PO:{' '}
                                <strong className="text-emerald-700">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(dnGrp.totalInvoicedVal)}`
                                    : `${totalInvoicedQty.toLocaleString()} units`}
                                </strong>
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                Delivered on this DN:{' '}
                                <strong className="text-indigo-700">
                                  {metricMode === 'AMOUNT'
                                    ? `TZS ${formatCurrency(totalDeliveredVal)}`
                                    : `${totalDeliveredQty.toLocaleString()} units`}
                                </strong>
                              </span>
                            </div>

                            <button
                              onClick={() => {
                                setGroupingMode('PO');
                                if (!expandedKeys[dn.poNumber]) {
                                  toggleGroup(dn.poNumber);
                                }
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              View PO #{dn.poNumber} Full Dashboard
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Related Invoices Raised on this PO */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-emerald-600" />
                              Invoices Raised on PO #{dn.poNumber}:
                            </span>
                            {relatedInvoices.length === 0 ? (
                              <span className="text-slate-400 italic text-[11px]">
                                No invoices raised yet for this PO. Click "+ Invoice PO" above to issue an invoice.
                              </span>
                            ) : (
                              relatedInvoices.map((inv, invI) => (
                                <span
                                  key={invI}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50/80 border border-emerald-200 rounded-lg text-[11px] text-emerald-900"
                                >
                                  <strong className="font-mono">{inv.invoiceNumber}</strong>
                                  <span className="text-emerald-400">•</span>
                                  <span>Raised: {inv.invoiceDate || 'N/A'}</span>
                                  <span className="text-emerald-400">•</span>
                                  <span className="font-semibold font-mono">TZS {formatCurrency(inv.totalAfterVat)}</span>
                                  <span className="text-emerald-400">•</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    inv.paymentStatus === 'PAID' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-900'
                                  }`}>
                                    {inv.paymentStatus || 'UNPAID'}
                                  </span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Items Delivered on THIS Delivery Note */}
                        <div className="overflow-auto max-h-[380px] scrollbar-thin rounded-xl border border-slate-200/80 bg-white shadow-xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-900 text-white text-[10px] uppercase font-semibold sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Delivered Item Description</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">
                                  {metricMode === 'AMOUNT' ? 'PO Ordered Value (TZS)' : 'PO Ordered Qty'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-indigo-300">
                                  {metricMode === 'AMOUNT' ? 'Delivered Value (This DN)' : 'Delivery Qty (This DN)'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-emerald-300">
                                  {metricMode === 'AMOUNT' ? 'Invoiced Value on PO' : 'Invoiced on PO'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900 text-amber-300">
                                  {metricMode === 'AMOUNT' ? 'Delivery vs Invoiced Variance' : 'Delivery vs Invoiced Qty'}
                                </th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Unit Price</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Line Value After VAT</th>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Condition / Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                              {(dn.lines || []).map((line, lIdx) => {
                                const poMatch = dnGrp.relatedPoLines.find(
                                  (p) => p.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                );

                                // Calculate invoice quantities & values for this item across all invoices on this PO
                                const totalInvoicedLineQty = relatedInvoices.reduce((sum, inv) => {
                                  const matchingInvLine = (inv.lines || []).find(
                                    (il) => il.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                  );
                                  return sum + (matchingInvLine ? (matchingInvLine.invoicedQuantity || 0) : 0);
                                }, (poMatch?.invoicedQuantity || 0));

                                const totalInvoicedLineVal = relatedInvoices.reduce((sum, inv) => {
                                  const matchingInvLine = (inv.lines || []).find(
                                    (il) => il.itemDescription.toLowerCase() === line.itemDescription.toLowerCase()
                                  );
                                  return sum + (matchingInvLine ? (matchingInvLine.valueAfterVat || (matchingInvLine.invoicedQuantity * matchingInvLine.unitPrice * 1.18)) : 0);
                                }, (poMatch ? (poMatch.invoicedQuantity * poMatch.unitPrice * (1 + (poMatch.vatRate ?? 0.18))) : 0));

                                const poVal = poMatch
                                  ? (poMatch.valueAfterVat || (poMatch.poQuantity * poMatch.unitPrice * (1 + (poMatch.vatRate ?? 0.18))))
                                  : 0;

                                const qtyDiff = line.deliveredQuantity - totalInvoicedLineQty;
                                const valDiff = line.valueAfterVat - totalInvoicedLineVal;

                                return (
                                  <tr key={lIdx} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={line.itemDescription}>
                                      {line.itemDescription}
                                    </td>
                                    {/* PO Ordered */}
                                    <td className="py-2 px-3 text-right font-semibold text-slate-800 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        poMatch ? `TZS ${formatCurrency(poVal)}` : '—'
                                      ) : (
                                        poMatch ? `${poMatch.poQuantity} ${poMatch.unitOfMeasure}` : '—'
                                      )}
                                    </td>
                                    {/* Delivered this DN */}
                                    <td className="py-2 px-3 text-right font-bold text-indigo-700 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        `TZS ${formatCurrency(line.valueAfterVat)}`
                                      ) : (
                                        `${line.deliveredQuantity} ${line.unitOfMeasure}`
                                      )}
                                    </td>
                                    {/* Invoiced on PO */}
                                    <td className="py-2 px-3 text-right font-semibold text-emerald-700 font-mono">
                                      {metricMode === 'AMOUNT' ? (
                                        `TZS ${formatCurrency(totalInvoicedLineVal)}`
                                      ) : (
                                        `${totalInvoicedLineQty} ${line.unitOfMeasure}`
                                      )}
                                    </td>
                                    {/* Delivery vs Invoiced Variance */}
                                    <td className="py-2 px-3 text-right font-mono text-[11px]">
                                      {metricMode === 'AMOUNT' ? (
                                        Math.abs(valDiff) < 1 ? (
                                          <span className="text-emerald-700 font-semibold">Matched (TZS 0)</span>
                                        ) : valDiff > 0 ? (
                                          <span className="text-indigo-700 font-semibold" title="Delivered value not yet invoiced">
                                            +TZS {formatCurrency(valDiff)} Unbilled
                                          </span>
                                        ) : (
                                          <span className="text-amber-700 font-semibold" title="Invoiced value exceeds this delivery">
                                            -TZS {formatCurrency(Math.abs(valDiff))} Overinvoiced
                                          </span>
                                        )
                                      ) : (
                                        qtyDiff === 0 ? (
                                          <span className="text-emerald-700 font-semibold">Matched (0)</span>
                                        ) : qtyDiff > 0 ? (
                                          <span className="text-indigo-700 font-semibold" title="Delivered units not yet invoiced">
                                            +{qtyDiff} {line.unitOfMeasure} Unbilled
                                          </span>
                                        ) : (
                                          <span className="text-amber-700 font-semibold" title="Invoiced units exceed this delivery">
                                            {qtyDiff} {line.unitOfMeasure} Overinvoiced
                                          </span>
                                        )
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                                      TZS {formatCurrency(line.unitPrice)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">
                                      TZS {formatCurrency(line.valueAfterVat)}
                                    </td>
                                    <td className="py-2 px-3 text-slate-500 text-[11px]">
                                      {line.discrepancyNote ? (
                                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                                          {line.discrepancyNote}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Delivered in Good Order</span>
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
                );
              })
            )}
          </div>
          {deliveryReconciliationGroups.length > 0 && (
            <TablePagination
              currentPage={delPage}
              totalItems={deliveryReconciliationGroups.length}
              pageSize={delPageSize}
              onPageChange={setDelPage}
              onPageSizeChange={setDelPageSize}
              itemLabel="Delivery Notes"
            />
          )}
        </>
        )}

        {/* =====================================================================
            VIEW MODE 2: GROUP BY VENDOR / CUSTOMER
            ===================================================================== */}
        {groupingMode === 'VENDOR' && (
          <>
          <div className="divide-y divide-slate-100">
            {vendorReconciliationGroups.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No Vendors found matching the current search or filters.
              </div>
            ) : (
              paginatedVendorGroups.map((vGroup) => {
                const isExpanded = expandedKeys[vGroup.vendor];
                return (
                  <div key={vGroup.vendor} className="bg-white hover:bg-slate-50/60 transition-colors">
                    {/* Header Row for Vendor */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left info: Vendor name, POs count, ordered vs invoiced */}
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={() => toggleGroup(vGroup.vendor)}
                          className="mt-0.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title={isExpanded ? 'Collapse Vendor details' : 'Expand Vendor details'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-blue-600" />
                              {vGroup.vendor}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {vGroup.poCount} {vGroup.poCount === 1 ? 'PO' : 'POs'}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({vGroup.poNumbers.slice(0, 3).join(', ')}{vGroup.poNumbers.length > 3 ? '…' : ''})
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                            <span>{vGroup.items.length} Item Lines</span>
                            <span>•</span>
                            <span>
                              Total PO Val: <strong className="text-slate-800">TZS {formatCurrency(vGroup.totalPoVal)}</strong> ({vGroup.totalPoQty.toLocaleString()} units)
                            </span>
                            <span>•</span>
                            <span>
                              Delivered: <strong className="text-indigo-700">TZS {formatCurrency(vGroup.totalDeliveredVal)}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Invoiced: <strong className="text-emerald-700">TZS {formatCurrency(vGroup.totalInvoicedVal)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right metrics, fulfillment & action */}
                      <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                        {/* Progress visual */}
                        <div className="w-32 hidden sm:block">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 mb-1">
                            <span>Fulfillment</span>
                            <span className={vGroup.fulfillmentRate >= 100 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                              {vGroup.fulfillmentRate}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, vGroup.fulfillmentRate)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                            <span>Delivered: {vGroup.deliveryRate}%</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {vGroup.status === 'FULLY_MATCHED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Fully Matched
                            </span>
                          ) : vGroup.status === 'PARTIALLY_MATCHED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3.5 h-3.5" />
                              Partial ({vGroup.totalUnmatchedQty} left)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Un-invoiced
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleGroup(vGroup.vendor)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            {isExpanded ? 'Hide Details' : 'View POs & Items'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-table: Items belonging to this Vendor */}
                    {isExpanded && (
                      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            All Items & POs under Vendor: {vGroup.vendor}
                          </div>
                          <TableExportToolbar
                            totalCount={vGroup.items.length}
                            onExportExcel={() => handleExportPOItemsExcel(vGroup.vendor, vGroup.items)}
                            onExportPdf={() => handleExportPOItemsPdf(vGroup.vendor, vGroup.items)}
                            size="sm"
                          />
                        </div>
                        <div className="overflow-auto max-h-[380px] scrollbar-thin rounded-xl border border-slate-200/80 bg-white shadow-xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-900 text-white text-[10px] uppercase font-semibold sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">PO Number</th>
                                <th className="py-2.5 px-3 sticky top-0 bg-slate-900">Item Description</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">PO Ordered</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Delivered (DN)</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Invoiced Qty</th>
                                <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-900">Un-invoiced</th>
                                <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Status</th>
                                <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-900">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                            {vGroup.items.map((item, itemIdx) => (
                              <tr key={itemIdx} className="hover:bg-indigo-50/30 transition-colors">
                                <td className="py-2 px-3 font-mono font-bold text-blue-600">
                                  {item.poNumber}
                                </td>
                                <td className="py-2 px-3 font-medium text-slate-900 max-w-xs truncate" title={item.itemDescription}>
                                  {item.itemDescription}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-slate-900">
                                  {item.poQuantity} {item.unitOfMeasure}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-indigo-700">
                                  {item.deliveredQuantity} {item.unitOfMeasure}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-700">
                                  {item.invoicedQuantity} {item.unitOfMeasure}
                                </td>
                                <td className="py-2 px-3 text-right font-bold">
                                  {item.unmatchedQty > 0 ? (
                                    <span className="text-amber-700">{item.unmatchedQty} {item.unitOfMeasure}</span>
                                  ) : (
                                    <span className="text-emerald-700">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {item.status === 'FULLY_MATCHED' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Matched
                                    </span>
                                  ) : item.status === 'PARTIALLY_MATCHED' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                      Partial
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                      Unmatched
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        onSelectPOForInvoice(item.poNumber);
                                        onNavigate('create_invoice');
                                      }}
                                      className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                                    >
                                      Invoice
                                    </button>
                                    <button
                                      onClick={() => setSelectedDrilldownItem(item)}
                                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium cursor-pointer"
                                    >
                                      Drilldown
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })
            )}
          </div>
          {vendorReconciliationGroups.length > 0 && (
            <TablePagination
              currentPage={vendorPage}
              totalItems={vendorReconciliationGroups.length}
              pageSize={vendorPageSize}
              onPageChange={setVendorPage}
              onPageSizeChange={setVendorPageSize}
              itemLabel="Vendors"
            />
          )}
          </>
        )}

        {/* =====================================================================
            VIEW MODE 3: ALL LINE ITEMS (FLAT LIST)
            ===================================================================== */}
        {groupingMode === 'ITEMS' && (
          <>
            <div className="overflow-auto max-h-[500px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900">PO & Vendor</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900">Item Description</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">PO Ordered</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Delivered (DN)</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Invoiced Qty</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Un-invoiced</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-right">Undelivered</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Status</th>
                  <th className="py-3 px-3 sticky top-0 bg-slate-900 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredMatchingData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-xs text-slate-400">
                      No line items matching search and status filter.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-blue-700 font-mono block">{item.poNumber}</span>
                        <span className="text-[11px] text-slate-500 truncate max-w-[140px] block">{item.customerName}</span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[220px] truncate" title={item.itemDescription}>
                        {item.itemDescription}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {item.poQuantity} {item.unitOfMeasure}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-indigo-700">
                        {item.deliveredQuantity} {item.unitOfMeasure}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                        {item.invoicedQuantity} {item.unitOfMeasure}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {item.unmatchedQty > 0 ? (
                          <span className="text-amber-700">{item.unmatchedQty} {item.unitOfMeasure}</span>
                        ) : (
                          <span className="text-emerald-700">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {item.undeliveredQty > 0 ? (
                          <span className="text-red-600">{item.undeliveredQty} {item.unitOfMeasure}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.status === 'FULLY_MATCHED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Matched
                          </span>
                        ) : item.status === 'PARTIALLY_MATCHED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Partial
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            Unmatched
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.unmatchedQty > 0 && (
                            <button
                              onClick={() => {
                                onSelectPOForInvoice(item.poNumber);
                                onNavigate('create_invoice');
                              }}
                              className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                              title="Create Invoice"
                            >
                              Invoice
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedDrilldownItem(item)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium cursor-pointer"
                          >
                            Drilldown
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredMatchingData.length > 0 && (
            <TablePagination
              currentPage={itemsPage}
              totalItems={filteredMatchingData.length}
              pageSize={itemsPageSize}
              onPageChange={setItemsPage}
              onPageSizeChange={setItemsPageSize}
              itemLabel="Line Items"
            />
          )}
        </>
        )}
      </div>

      {/* =========================================================================
          UNDELIVERED ITEMS & UNMATCHED ITEMS LIST PREVIEWS
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Undelivered Items by PO & Vendor */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-indigo-600" />
              <h2 className="font-bold text-sm text-slate-900">Undelivered Items by Vendor & PO</h2>
            </div>
            <button
              onClick={() => onNavigate('matching_report', 'UNDELIVERED')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
            >
              View All ({undeliveredItems.length})
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {undeliveredItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                All ordered items have been delivered via Delivery Notes!
              </div>
            ) : (
              undeliveredItems.slice(0, 5).map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate" title={item.itemDescription}>
                      {item.itemDescription}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      <span className="font-mono text-blue-600 font-semibold">{item.poNumber}</span> • {item.customerName}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <span className="font-bold text-red-600 font-mono">
                        {item.undeliveredQty} {item.unitOfMeasure}
                      </span>
                      <span className="block text-[10px] text-slate-400">Undelivered</span>
                    </div>
                    <button
                      onClick={() => onNavigate('delivery_notes')}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Receive Delivery"
                    >
                      + DN
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unmatched Items on PO & Invoiced */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="font-bold text-sm text-slate-900">Unmatched / Un-invoiced PO Balances</h2>
            </div>
            <button
              onClick={() => onNavigate('matching_report', 'UNMATCHED')}
              className="text-xs text-amber-600 hover:text-amber-700 font-semibold cursor-pointer"
            >
              View All ({unmatchedItems.length})
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {unmatchedItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                All PO items have been completely matched and invoiced!
              </div>
            ) : (
              unmatchedItems.slice(0, 5).map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate" title={item.itemDescription}>
                      {item.itemDescription}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      <span className="font-mono text-blue-600 font-semibold">{item.poNumber}</span> • {item.customerName}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <span className="font-bold text-amber-700 font-mono">
                        {item.unmatchedQty} {item.unitOfMeasure}
                      </span>
                      <span className="block text-[10px] text-slate-400">Uninvoiced</span>
                    </div>
                    <button
                      onClick={() => {
                        onSelectPOForInvoice(item.poNumber);
                        onNavigate('create_invoice');
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                    >
                      Invoice
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          DRILLDOWN MODAL FOR DETAILED 3-WAY RECONCILIATION
          ========================================================================= */}
      {selectedDrilldownItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-400 bg-blue-950 px-2.5 py-0.5 rounded border border-blue-800 text-xs">
                    PO #{selectedDrilldownItem.poNumber}
                  </span>
                  <span className="font-bold text-base">{selectedDrilldownItem.customerName}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 truncate max-w-md">
                  {selectedDrilldownItem.itemDescription}
                </p>
              </div>
              <button
                onClick={() => setSelectedDrilldownItem(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
              {/* 3-Way Reconciliation Comparison Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-[10px] font-bold text-blue-600 uppercase">1. Purchase Order</div>
                  <div className="text-xl font-bold text-blue-900 mt-1 font-mono">
                    {selectedDrilldownItem.poQuantity} <span className="text-xs font-normal">{selectedDrilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-blue-700 mt-1">
                    TZS {formatCurrency(selectedDrilldownItem.poTotalValue)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[10px] font-bold text-indigo-600 uppercase">2. Delivered (DN)</div>
                  <div className="text-xl font-bold text-indigo-900 mt-1 font-mono">
                    {selectedDrilldownItem.deliveredQuantity} <span className="text-xs font-normal">{selectedDrilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-indigo-700 mt-1">
                    TZS {formatCurrency(selectedDrilldownItem.deliveredValue)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase">3. Invoiced Billed</div>
                  <div className="text-xl font-bold text-emerald-900 mt-1 font-mono">
                    {selectedDrilldownItem.invoicedQuantity} <span className="text-xs font-normal">{selectedDrilldownItem.unitOfMeasure}</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    TZS {formatCurrency(selectedDrilldownItem.invoicedValue)}
                  </div>
                </div>
              </div>

              {/* Variance & Status */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">Matching Breakdown & Variances:</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500">Un-invoiced Balance (PO vs Invoice):</span>
                    <div className="font-bold font-mono text-sm mt-0.5">
                      {selectedDrilldownItem.unmatchedQty > 0 ? (
                        <span className="text-amber-700">{selectedDrilldownItem.unmatchedQty} {selectedDrilldownItem.unitOfMeasure} pending invoice</span>
                      ) : (
                        <span className="text-emerald-700">0 (Fully Invoiced)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Undelivered Balance (PO vs Delivery):</span>
                    <div className="font-bold font-mono text-sm mt-0.5">
                      {selectedDrilldownItem.undeliveredQty > 0 ? (
                        <span className="text-red-600">{selectedDrilldownItem.undeliveredQty} {selectedDrilldownItem.unitOfMeasure} pending receipt</span>
                      ) : (
                        <span className="text-emerald-700">0 (Fully Delivered)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Linked References */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800">Linked Documents:</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 font-semibold block">Delivery Notes:</span>
                    {selectedDrilldownItem.deliveryNoteNumbers.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedDrilldownItem.deliveryNoteNumbers.map((dn, i) => (
                          <span key={i} className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                            {dn}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic mt-1 block">No delivery notes recorded</span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 bg-white">
                    <span className="text-[11px] text-slate-500 font-semibold block">Issued Invoices:</span>
                    {selectedDrilldownItem.invoiceNumbers.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedDrilldownItem.invoiceNumbers.map((inv, i) => (
                          <span key={i} className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                            {inv}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic mt-1 block">No invoices issued yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              {selectedDrilldownItem.unmatchedQty > 0 && (
                <button
                  onClick={() => {
                    const po = selectedDrilldownItem.poNumber;
                    setSelectedDrilldownItem(null);
                    onSelectPOForInvoice(po);
                    onNavigate('create_invoice');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Create Invoice for PO #{selectedDrilldownItem.poNumber}
                </button>
              )}
              <button
                onClick={() => setSelectedDrilldownItem(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Management Report Summary Modal */}
      <AIManagementReportModal
        isOpen={isAIManagementReportOpen}
        onClose={() => setIsAIManagementReportOpen(false)}
        invoices={invoices}
        deliveryNotes={deliveryNotes}
        payments={payments}
        poGroups={poGroups}
        issues={issues}
        initialModule={aiManagementReportModule}
      />
    </div>
  );
};

