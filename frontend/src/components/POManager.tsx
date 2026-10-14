import React, { useState, useMemo, useRef } from 'react';
import { POLineItem, PurchaseOrderGroup, AppUser } from '../types';
import { formatCurrency } from '../utils/storage';
import { exportPOsToExcel } from '../utils/excelParser';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import { TableColumnHeader } from './TableColumnHeader';
import { useTableSortAndFilter } from '../utils/useTableSortAndFilter';
import { 
  Search, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  RotateCcw, 
  Trash2, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Layers,
  Building2,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  FileText,
  Mic,
  Sparkles,
  Plus,
  Edit3,
  X,
  PlusCircle,
  Save,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { canDeleteData } from '../utils/authService';
import { naturalCompare } from '../utils/naturalSort';
import { PermanentDeleteModal } from './PermanentDeleteModal';
import { TablePagination } from './TablePagination';

interface POManagerProps {
  poLines: POLineItem[];
  poGroups: PurchaseOrderGroup[];
  onUploadFile?: (file: File) => void;
  onUploadExcel?: (file: File) => void;
  onDownloadTemplate: () => void;
  onResetData?: () => void;
  onClearData?: () => void;
  onClearPOs?: () => void;
  onSelectPOForInvoice?: (poNumber: string) => void;
  onCreateInvoiceForPO?: (poNumber: string) => void;
  onNavigateToInvoice?: () => void;
  initialSearchTerm?: string;
  onOpenVoiceSearch?: () => void;
  currentUser?: AppUser;
  onAddPO?: (newLines: POLineItem[]) => void;
  onEditPODetails?: (poNumber: string, details: { customerName: string; destination: string; contract: string; date: string }) => void;
  onAddPOLine?: (newLine: POLineItem) => void;
  onUpdatePOLine?: (updatedLine: POLineItem) => void;
  onDeletePOLine?: (lineId: string) => void;
  onDeletePO?: (poNumber: string) => void;
}

interface CustomerPOGroup {
  customerName: string;
  pos: PurchaseOrderGroup[];
  totalPOs: number;
  totalLines: number;
  totalQuantity: number;
  invoicedQuantity: number;
  remainingQuantity: number;
  totalValueBeforeVat: number;
  totalVat: number;
  totalValueAfterVat: number;
  invoicedValueAfterVat: number;
  remainingValueAfterVat: number;
  status: 'PENDING' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED';
}

export const POManager: React.FC<POManagerProps> = ({
  poLines = [],
  poGroups = [],
  onUploadFile,
  onUploadExcel,
  onDownloadTemplate,
  onResetData,
  onClearData,
  onClearPOs,
  onSelectPOForInvoice,
  onCreateInvoiceForPO,
  onNavigateToInvoice = () => {},
  initialSearchTerm = '',
  onOpenVoiceSearch,
  currentUser,
  onAddPO,
  onEditPODetails,
  onAddPOLine,
  onUpdatePOLine,
  onDeletePOLine,
  onDeletePO,
}) => {
  const handleUpload = onUploadFile || onUploadExcel || (() => {});
  const handleSelectInvoicePO = onSelectPOForInvoice || onCreateInvoiceForPO || (() => {});
  const isAuthorizedAdmin = currentUser?.role === 'Admin' || canDeleteData(currentUser);
  const isAdmin = isAuthorizedAdmin;

  // Admin permanent delete confirmation states
  const [poPendingDelete, setPoPendingDelete] = useState<PurchaseOrderGroup | null>(null);
  const [poLinePendingDelete, setPoLinePendingDelete] = useState<POLineItem | null>(null);
  const [isClearAllPOsModalOpen, setIsClearAllPOsModalOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm || '');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grouped_pos' | 'customer_groups' | 'line_items'>('grouped_pos');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [expandedPOs, setExpandedPOs] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input for silky-smooth 60fps typing across tens of thousands of items
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm || '');
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Modals for Admin PO Editing
  const [isAddPOModalOpen, setIsAddPOModalOpen] = useState(false);
  const [isEditPODetailsModalOpen, setIsEditPODetailsModalOpen] = useState(false);
  const [isAddLineModalOpen, setIsAddLineModalOpen] = useState(false);
  const [isEditLineModalOpen, setIsEditLineModalOpen] = useState(false);

  // State for Add PO Modal
  const [newPoNumber, setNewPoNumber] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newContract, setNewContract] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPoLinesInput, setNewPoLinesInput] = useState<Array<{
    description: string;
    uom: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    vatRate: number;
  }>>([
    { description: '', uom: 'PCS', quantity: 10, unitCost: 15, unitPrice: 20, vatRate: 0.18 },
  ]);

  // State for Edit PO Details Modal
  const [editingPoNumber, setEditingPoNumber] = useState('');
  const [editDetailsCustomer, setEditDetailsCustomer] = useState('');
  const [editDetailsDestination, setEditDetailsDestination] = useState('');
  const [editDetailsContract, setEditDetailsContract] = useState('');
  const [editDetailsDate, setEditDetailsDate] = useState('');

  // State for Add Line Modal
  const [targetPoForNewLine, setTargetPoForNewLine] = useState<PurchaseOrderGroup | null>(null);
  const [newLineDesc, setNewLineDesc] = useState('');
  const [newLineUOM, setNewLineUOM] = useState('PCS');
  const [newLineQty, setNewLineQty] = useState(1);
  const [newLineCost, setNewLineCost] = useState(10);
  const [newLinePrice, setNewLinePrice] = useState(15);
  const [newLineVatRate, setNewLineVatRate] = useState(0.18);

  // State for Edit Single Line Modal
  const [editingLineItem, setEditingLineItem] = useState<POLineItem | null>(null);

  // Sync initialSearchTerm if changed
  React.useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Unique customers/vendors for filter
  const customers = useMemo(() => {
    const list = Array.from(new Set(poLines.map((l) => l.customerName))).filter(Boolean);
    return list.sort();
  }, [poLines]);

  // Filtered line items
  const filteredLines = useMemo(() => {
    const sTerm = (debouncedSearchTerm || '').toLowerCase().trim();
    const list = poLines.filter((item) => {
      const matchesSearch =
        sTerm === '' ||
        item.poNumber.toLowerCase().includes(sTerm) ||
        item.customerName.toLowerCase().includes(sTerm) ||
        item.destination.toLowerCase().includes(sTerm) ||
        item.contract.toLowerCase().includes(sTerm) ||
        item.itemDescription.toLowerCase().includes(sTerm);

      const matchesCustomer = selectedCustomer === 'ALL' || item.customerName === selectedCustomer;

      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'UNINVOICED' && (item.status === 'UNINVOICED' || !item.invoicedQuantity)) ||
        (selectedStatus === 'PARTIAL' && item.status === 'PARTIALLY_INVOICED') ||
        (selectedStatus === 'FULLY_INVOICED' && item.status === 'FULLY_INVOICED');

      return matchesSearch && matchesCustomer && matchesStatus;
    });

    // Arrange (sort) by PO number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
  }, [poLines, debouncedSearchTerm, selectedCustomer, selectedStatus]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    const sTerm = (debouncedSearchTerm || '').toLowerCase().trim();
    const list = poGroups.filter((grp) => {
      const matchesSearch =
        sTerm === '' ||
        grp.poNumber.toLowerCase().includes(sTerm) ||
        grp.customerName.toLowerCase().includes(sTerm) ||
        grp.destination.toLowerCase().includes(sTerm) ||
        grp.contract.toLowerCase().includes(sTerm);

      const matchesCustomer = selectedCustomer === 'ALL' || grp.customerName === selectedCustomer;

      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'UNINVOICED' && grp.status === 'PENDING') ||
        (selectedStatus === 'PARTIAL' && grp.status === 'PARTIALLY_INVOICED') ||
        (selectedStatus === 'FULLY_INVOICED' && grp.status === 'FULLY_INVOICED');

      return matchesSearch && matchesCustomer && matchesStatus;
    });

    // Arrange (sort) by PO number in ascending series small to larger e.g. MYRA001, MYRA002, MYRA003...
    return list.sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
  }, [poGroups, debouncedSearchTerm, selectedCustomer, selectedStatus]);

  // Table Sorting and Column Filtering for Grouped POs
  const {
    processedData: sortedAndFilteredGroups,
    sortConfig: groupSort,
    columnFilters: groupFilters,
    handleSort: handleGroupSort,
    handleFilterChange: handleGroupFilterChange,
  } = useTableSortAndFilter<PurchaseOrderGroup>(filteredGroups, {
    defaultSort: { field: 'poNumber', direction: 'asc' },
    customAccessors: {
      totalQuantity: (g: PurchaseOrderGroup) => g.totalQuantity,
      totalValueAfterVat: (g: PurchaseOrderGroup) => g.totalValueAfterVat,
      totalValueBeforeVat: (g: PurchaseOrderGroup) => g.totalValueBeforeVat,
    },
  });

  // Table Sorting and Column Filtering for Flat Lines
  const {
    processedData: sortedAndFilteredLines,
    sortConfig: lineSort,
    columnFilters: lineFilters,
    handleSort: handleLineSort,
    handleFilterChange: handleLineFilterChange,
  } = useTableSortAndFilter<POLineItem>(filteredLines, {
    defaultSort: { field: 'poNumber', direction: 'asc' },
    customAccessors: {
      quantity: (l: POLineItem) => l.quantity,
      invoicedQuantity: (l: POLineItem) => l.invoicedQuantity || 0,
      remainingQuantity: (l: POLineItem) => (l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity),
      unitPrice: (l: POLineItem) => l.unitPrice,
      valueAfterVat: (l: POLineItem) => l.valueAfterVat,
    },
  });

  // Pagination State for Grouped POs
  const [groupPage, setGroupPage] = useState<number>(1);
  const [groupPageSize, setGroupPageSize] = useState<number>(50);

  // Pagination State for Flat Lines
  const [linePage, setLinePage] = useState<number>(1);
  const [linePageSize, setLinePageSize] = useState<number>(50);

  // Reset pagination when search or filters change
  React.useEffect(() => {
    setGroupPage(1);
  }, [debouncedSearchTerm, selectedCustomer, selectedStatus, groupFilters]);

  React.useEffect(() => {
    setLinePage(1);
  }, [debouncedSearchTerm, selectedCustomer, selectedStatus, lineFilters]);

  const paginatedGroups = useMemo(() => {
    const start = (groupPage - 1) * groupPageSize;
    return sortedAndFilteredGroups.slice(start, start + groupPageSize);
  }, [sortedAndFilteredGroups, groupPage, groupPageSize]);

  const paginatedLines = useMemo(() => {
    const start = (linePage - 1) * linePageSize;
    return sortedAndFilteredLines.slice(start, start + linePageSize);
  }, [sortedAndFilteredLines, linePage, linePageSize]);

  // Filtered POs grouped by Customer
  const customerGroups = useMemo(() => {
    const map = new Map<string, PurchaseOrderGroup[]>();
    filteredGroups.forEach((grp) => {
      const cName = grp.customerName || 'Unassigned Customer';
      if (!map.has(cName)) {
        map.set(cName, []);
      }
      map.get(cName)!.push(grp);
    });

    const result: CustomerPOGroup[] = [];
    map.forEach((pos, customerName) => {
      // Sort pos within customer group naturally
      pos.sort((a, b) => naturalCompare(a.poNumber, b.poNumber));
      let totalLines = 0;
      let totalQuantity = 0;
      let invoicedQuantity = 0;
      let remainingQuantity = 0;
      let totalValueBeforeVat = 0;
      let totalVat = 0;
      let totalValueAfterVat = 0;
      let invoicedValueAfterVat = 0;
      let remainingValueAfterVat = 0;

      pos.forEach((po) => {
        totalLines += po.lines.length;
        totalQuantity += po.totalQuantity;
        invoicedQuantity += po.invoicedQuantity;
        remainingQuantity += po.remainingQuantity;
        totalValueBeforeVat += po.totalValueBeforeVat;
        totalVat += po.totalVat;
        totalValueAfterVat += po.totalValueAfterVat;
        invoicedValueAfterVat += po.invoicedValueAfterVat;
        remainingValueAfterVat += po.remainingValueAfterVat;
      });

      let status: 'PENDING' | 'PARTIALLY_INVOICED' | 'FULLY_INVOICED' = 'PENDING';
      if (invoicedQuantity >= totalQuantity && totalQuantity > 0) {
        status = 'FULLY_INVOICED';
      } else if (invoicedQuantity > 0) {
        status = 'PARTIALLY_INVOICED';
      }

      result.push({
        customerName,
        pos,
        totalPOs: pos.length,
        totalLines,
        totalQuantity,
        invoicedQuantity,
        remainingQuantity,
        totalValueBeforeVat: Math.round(totalValueBeforeVat * 100) / 100,
        totalVat: Math.round(totalVat * 100) / 100,
        totalValueAfterVat: Math.round(totalValueAfterVat * 100) / 100,
        invoicedValueAfterVat: Math.round(invoicedValueAfterVat * 100) / 100,
        remainingValueAfterVat: Math.round(remainingValueAfterVat * 100) / 100,
        status,
      });
    });

    return result.sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [filteredGroups]);

  // Toggle customer collapse
  const toggleCustomerExpand = (customerName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [customerName]: prev[customerName] === undefined ? false : !prev[customerName],
    }));
  };

  // Totals of filtered data
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalBeforeVat = 0;
    let totalVat = 0;
    let totalAfterVat = 0;
    let totalInvoicedQty = 0;
    let totalRemainingQty = 0;

    filteredLines.forEach((l) => {
      totalQty += l.quantity;
      totalBeforeVat += l.valueBeforeVat;
      totalVat += l.vatAmount;
      totalAfterVat += l.valueAfterVat;
      totalInvoicedQty += l.invoicedQuantity || 0;
      totalRemainingQty += l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity;
    });

    return {
      totalQty,
      totalBeforeVat: Math.round(totalBeforeVat * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalAfterVat: Math.round(totalAfterVat * 100) / 100,
      totalInvoicedQty,
      totalRemainingQty,
    };
  }, [filteredLines]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0]);
    }
  };

  // Open Edit PO Details Modal
  const handleOpenEditPODetails = (grp: PurchaseOrderGroup) => {
    if (!isAdmin) {
      alert('Only Administrator users can edit PO details.');
      return;
    }
    setEditingPoNumber(grp.poNumber);
    setEditDetailsCustomer(grp.customerName);
    setEditDetailsDestination(grp.destination);
    setEditDetailsContract(grp.contract);
    setEditDetailsDate(grp.date);
    setIsEditPODetailsModalOpen(true);
  };

  // Save Edit PO Details
  const handleSavePODetails = () => {
    if (!onEditPODetails) return;
    onEditPODetails(editingPoNumber, {
      customerName: editDetailsCustomer.trim(),
      destination: editDetailsDestination.trim(),
      contract: editDetailsContract.trim(),
      date: editDetailsDate,
    });
    setIsEditPODetailsModalOpen(false);
  };

  // Open Add Line Modal
  const handleOpenAddLine = (grp: PurchaseOrderGroup) => {
    if (!isAdmin) {
      alert('Only Administrator users can add PO lines.');
      return;
    }
    setTargetPoForNewLine(grp);
    setNewLineDesc('');
    setNewLineUOM('PCS');
    setNewLineQty(10);
    setNewLineCost(10);
    setNewLinePrice(15);
    setNewLineVatRate(0.18);
    setIsAddLineModalOpen(true);
  };

  // Save New Line to PO
  const handleSaveNewLine = () => {
    if (!onAddPOLine || !targetPoForNewLine) return;
    if (!newLineDesc.trim()) {
      alert('Please enter an item description.');
      return;
    }

    const valBefore = Math.round(newLineQty * newLinePrice * 100) / 100;
    const vatAmt = Math.round(valBefore * newLineVatRate * 100) / 100;
    const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

    const newLine: POLineItem = {
      id: `POLINE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      poNumber: targetPoForNewLine.poNumber,
      customerName: targetPoForNewLine.customerName,
      destination: targetPoForNewLine.destination,
      contract: targetPoForNewLine.contract,
      date: targetPoForNewLine.date,
      itemDescription: newLineDesc.trim(),
      unitOfMeasure: newLineUOM.trim() || 'PCS',
      quantity: Number(newLineQty),
      unitCost: Number(newLineCost),
      unitPrice: Number(newLinePrice),
      valueBeforeVat: valBefore,
      vatRate: Number(newLineVatRate),
      vatAmount: vatAmt,
      valueAfterVat: valAfter,
      invoicedQuantity: 0,
      remainingQuantity: Number(newLineQty),
      status: 'UNINVOICED',
    };

    onAddPOLine(newLine);
    setIsAddLineModalOpen(false);
  };

  // Open Edit Single Line Modal
  const handleOpenEditLine = (item: POLineItem) => {
    if (!isAdmin) {
      alert('Only Administrator users can edit PO line items.');
      return;
    }
    setEditingLineItem({ ...item });
    setIsEditLineModalOpen(true);
  };

  // Save Single Line Edit
  const handleSaveEditLine = () => {
    if (!onUpdatePOLine || !editingLineItem) return;

    const valBefore = Math.round(editingLineItem.quantity * editingLineItem.unitPrice * 100) / 100;
    const vatAmt = Math.round(valBefore * (editingLineItem.vatRate || 0.18) * 100) / 100;
    const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

    const updated: POLineItem = {
      ...editingLineItem,
      valueBeforeVat: valBefore,
      vatAmount: vatAmt,
      valueAfterVat: valAfter,
      remainingQuantity: Math.max(0, editingLineItem.quantity - (editingLineItem.invoicedQuantity || 0)),
    };

    onUpdatePOLine(updated);
    setIsEditLineModalOpen(false);
  };

  // Handle Save New PO Modal
  const handleSaveNewPO = () => {
    if (!onAddPO) return;
    if (!newPoNumber.trim()) {
      alert('Please enter a PO Number.');
      return;
    }
    if (!newCustomerName.trim()) {
      alert('Please enter Customer Name.');
      return;
    }

    const validLines = newPoLinesInput.filter((l) => l.description.trim() && l.quantity > 0);
    if (validLines.length === 0) {
      alert('Please enter at least one valid line item with description and quantity.');
      return;
    }

    const createdLines: POLineItem[] = validLines.map((l, idx) => {
      const valBefore = Math.round(l.quantity * l.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBefore * l.vatRate * 100) / 100;
      const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

      return {
        id: `POLINE-${Date.now()}-${idx}`,
        poNumber: newPoNumber.trim(),
        customerName: newCustomerName.trim(),
        destination: newDestination.trim() || 'Head Office',
        contract: newContract.trim() || 'General Supply',
        date: newDate,
        itemDescription: l.description.trim(),
        unitOfMeasure: l.uom.trim() || 'PCS',
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost),
        unitPrice: Number(l.unitPrice),
        valueBeforeVat: valBefore,
        vatRate: Number(l.vatRate),
        vatAmount: vatAmt,
        valueAfterVat: valAfter,
        invoicedQuantity: 0,
        remainingQuantity: Number(l.quantity),
        status: 'UNINVOICED',
      };
    });

    onAddPO(createdLines);
    setIsAddPOModalOpen(false);
    // Reset fields
    setNewPoNumber('');
    setNewCustomerName('');
    setNewDestination('');
    setNewContract('');
  };

  const handleExportLinesExcel = () => {
    const headers = [
      '#',
      'PO Number',
      'Vendor / Customer',
      'Destination',
      'Contract',
      'Item Description',
      'Date (LPO)',
      'UOM',
      'PO Qty',
      'Invoiced Qty',
      'Remaining Qty',
      'Unit Price (TZS)',
      'Total Value Incl. VAT (TZS)',
      'Status',
      'Delivery Notes / Remarks',
    ];
    const rows = filteredLines.map((l, idx) => [
      idx + 1,
      l.poNumber,
      l.customerName,
      l.destination,
      l.contract,
      l.itemDescription,
      l.date,
      l.unitOfMeasure,
      l.quantity,
      l.invoicedQuantity || 0,
      l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity,
      typeof l.unitPrice === 'number' ? l.unitPrice : Number(String(l.unitPrice || 0).replace(/[^0-9.-]+/g, '')),
      typeof l.valueAfterVat === 'number' ? l.valueAfterVat : Number(String(l.valueAfterVat || 0).replace(/[^0-9.-]+/g, '')),
      l.status || 'UNINVOICED',
      l.remarks || '',
    ]);
    exportTableToExcel('Purchase_Order_Master_Lines', headers, rows, 'PO_Lines');
  };

  const handleExportLinesPdf = () => {
    const headers = [
      '#',
      'PO #',
      'Customer',
      'Destination',
      'Item Description',
      'Date',
      'Qty',
      'Inv Qty',
      'Rem Qty',
      'Unit Price',
      'Total (TZS)',
      'Status',
    ];
    const rows = filteredLines.map((l, idx) => [
      idx + 1,
      l.poNumber,
      l.customerName,
      l.destination,
      l.itemDescription,
      l.date,
      `${l.quantity} ${l.unitOfMeasure}`,
      l.invoicedQuantity || 0,
      l.remainingQuantity !== undefined ? l.remainingQuantity : l.quantity,
      `TZS ${formatCurrency(l.unitPrice)}`,
      `TZS ${formatCurrency(l.valueAfterVat)}`,
      l.status || 'UNINVOICED',
    ]);
    exportTableToPdf('Purchase Order Master Lines Report', headers, rows, {
      filenamePrefix: 'PO_Lines_Report',
      subtitle: `Filtered Dataset • Total Lines: ${filteredLines.length} • Currency: TZS`,
      orientation: 'landscape',
    });
  };

  const toggleExpandPO = (poNum: string) => {
    setExpandedPOs((prev) => ({
      ...prev,
      [poNum]: !prev[poNum],
    }));
  };

  const handleToggleExpandAllPOs = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    if (expand) {
      filteredGroups.forEach((g) => {
        next[g.poNumber] = true;
      });
    }
    setExpandedPOs(next);
  };

  const handleExportGroupedPOsExcel = () => {
    const headers = [
      '#',
      'PO NUMBER',
      'CUSTOMER',
      'PO DATE',
      'CONTRACT',
      'QTY (SUM)',
      'VALUE (SUM) INCL (TZS)',
      'VALUE (SUM) CONTRACT (TZS)',
      'INVOICED QTY',
      'REMAINING QTY',
      'STATUS',
    ];
    const rows = filteredGroups.map((grp, idx) => [
      idx + 1,
      grp.poNumber,
      grp.customerName,
      grp.date,
      grp.contract,
      grp.totalQuantity,
      grp.totalValueAfterVat,
      grp.totalValueBeforeVat,
      grp.invoicedQuantity,
      grp.remainingQuantity,
      grp.status,
    ]);
    exportTableToExcel('PO_Summary_Grouped_By_PO', headers, rows, 'POs_Grouped');
  };

  const handleExportGroupedPOsPdf = () => {
    const headers = [
      '#',
      'PO NUMBER',
      'CUSTOMER',
      'PO DATE',
      'CONTRACT',
      'QTY (SUM)',
      'VALUE INCL VAT',
      'VALUE CONTRACT',
      'STATUS',
    ];
    const rows = filteredGroups.map((grp, idx) => [
      idx + 1,
      grp.poNumber,
      grp.customerName,
      grp.date,
      grp.contract,
      grp.totalQuantity.toLocaleString(),
      `TZS ${formatCurrency(grp.totalValueAfterVat)}`,
      `TZS ${formatCurrency(grp.totalValueBeforeVat)}`,
      grp.status,
    ]);
    exportTableToPdf('PO Summary Grouped by PO Number', headers, rows, {
      filenamePrefix: 'POs_Grouped_Report',
      subtitle: `Total POs: ${filteredGroups.length} • Generated on ${new Date().toLocaleDateString()}`,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">PO</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                Purchase Orders Master
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              Grouped by PO Number with line item drill-down, contract values, quantities, and invoice tracking.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDownloadTemplate}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Download Excel PO template to upload into system"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            Download Template
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload PO Excel
          </button>
        </div>
      </div>

      {/* Excel Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all bg-white ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".xlsx, .xls, .csv"
          className="hidden"
        />
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Upload Purchase Order Excel File</h2>
            <p className="text-xs text-slate-500 mt-1">
              Supports <span className="font-semibold text-slate-700">.xlsx, .xls, .csv</span> with headers: Customer name, destination, PO number, contract, item description, date, unit cost, quantity, unit price, value before VAT & VAT, and optional Delivery Notes / General Remarks.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Browse Excel File
            </button>
            <button
              onClick={onDownloadTemplate}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>

            {/* Admin: Add New PO Button */}
            {onAddPO && (
              <button
                onClick={() => {
                  if (!isAdmin) {
                    alert('Only Administrator users are permitted to manually add POs.');
                    return;
                  }
                  setIsAddPOModalOpen(true);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isAdmin
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                }`}
                title={isAdmin ? "Admin: Manually add a Purchase Order" : "Admin Only"}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New PO (Admin)
              </button>
            )}

            {poLines.length > 0 && (
              <button
                id="clear-all-pos-button"
                onClick={() => {
                  if (!isAuthorizedAdmin) {
                    alert('Access Denied: Only Administrator (ADM) can clear all Purchase Orders.');
                    return;
                  }
                  setIsClearAllPOsModalOpen(true);
                }}
                className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                title={isAuthorizedAdmin ? "Admin: Clear all loaded Purchase Orders" : "Admin Only: Clear all loaded PO lines"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All POs
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Calculated Totals Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm bg-gradient-to-br from-slate-50 to-white">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Purchase Orders</span>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {filteredGroups.length} <span className="text-xs font-normal text-slate-500">POs</span>
          </div>
          <div className="text-[11px] text-blue-600 font-bold mt-0.5">
            {filteredLines.length.toLocaleString()} Line Items
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Filtered Customers</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{customerGroups.length} <span className="text-xs font-normal text-slate-400">Customers</span></div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Quantity</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{totals.totalQty.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400">Rem: {totals.totalRemainingQty.toLocaleString()}</div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Excl. VAT</span>
          <div className="text-xl font-bold text-slate-900 mt-1">TZS {formatCurrency(totals.totalBeforeVat)}</div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total VAT (18%)</span>
          <div className="text-xl font-bold text-slate-900 mt-1">TZS {formatCurrency(totals.totalVat)}</div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm bg-gradient-to-br from-blue-50/50 to-white">
          <span className="text-[11px] font-semibold text-blue-700 uppercase">Total Incl. VAT</span>
          <div className="text-xl font-bold text-blue-800 mt-1">TZS {formatCurrency(totals.totalAfterVat)}</div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase">Invoiced Qty</span>
          <div className="text-xl font-bold text-emerald-800 mt-1">
            {totals.totalInvoicedQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">/ {totals.totalQty}</span>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer, PO number, destination, contract, or line item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {onOpenVoiceSearch && (
            <button
              type="button"
              onClick={onOpenVoiceSearch}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
              title="Speak to Search (Cmd+K)"
            >
              <Mic className="w-4 h-4 text-blue-500" />
            </button>
          )}
        </div>

        {/* Dropdown Filters & Views */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Customer Filter */}
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Customers ({customers.length})</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="UNINVOICED">Pending (Uninvoiced)</option>
            <option value="PARTIAL">Partially Invoiced</option>
            <option value="FULLY_INVOICED">Fully Invoiced</option>
          </select>

          {/* View Toggle with explicit counts */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('grouped_pos')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grouped_pos'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`View ${filteredGroups.length} Unique Purchase Orders`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Group by PO ({filteredGroups.length})</span>
            </button>
            <button
              onClick={() => setViewMode('customer_groups')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'customer_groups'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`View ${customerGroups.length} Customer Groups`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Group by Customer ({customerGroups.length})</span>
            </button>
            <button
              onClick={() => setViewMode('line_items')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'line_items'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`View All ${filteredLines.length.toLocaleString()} Individual Line Items`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>All Lines ({filteredLines.length.toLocaleString()})</span>
            </button>
          </div>

          {/* Export buttons */}
          <TableExportToolbar
            totalCount={viewMode === 'grouped_pos' ? filteredGroups.length : filteredLines.length}
            onExportExcel={viewMode === 'grouped_pos' ? handleExportGroupedPOsExcel : handleExportLinesExcel}
            onExportPdf={viewMode === 'grouped_pos' ? handleExportGroupedPOsPdf : handleExportLinesPdf}
          />
        </div>
      </div>

      {/* Explanatory Banner Clarifying PO Groups vs Individual Lines */}
      {viewMode === 'grouped_pos' && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-blue-950 gap-2 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase">
              Grouped PO View
            </span>
            <span className="font-medium">
              Displaying <strong>{filteredGroups.length}</strong> unique Purchase Orders containing all <strong>{filteredLines.length.toLocaleString()}</strong> individual line items.
            </span>
          </div>
          <div className="text-blue-700 text-[11px] flex items-center gap-1.5">
            <span>Click any PO row below to drill down, or switch to</span>
            <button
              type="button"
              onClick={() => setViewMode('line_items')}
              className="font-bold text-blue-800 underline hover:text-blue-950 cursor-pointer"
            >
              All Lines ({filteredLines.length.toLocaleString()})
            </button>
          </div>
        </div>
      )}

      {viewMode === 'line_items' && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-emerald-950 gap-2 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase">
              All Line Items View
            </span>
            <span className="font-medium">
              Displaying all <strong>{filteredLines.length.toLocaleString()}</strong> item lines across <strong>{filteredGroups.length}</strong> Purchase Orders.
            </span>
          </div>
          <div className="text-emerald-700 text-[11px] flex items-center gap-1.5">
            <span>Switch back to</span>
            <button
              type="button"
              onClick={() => setViewMode('grouped_pos')}
              className="font-bold text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
            >
              Group by PO ({filteredGroups.length} POs)
            </button>
          </div>
        </div>
      )}

      {/* Main View Render */}
      {viewMode === 'customer_groups' && (
        <div className="space-y-4">
          {customerGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              No Purchase Orders found matching your current filter.
            </div>
          ) : (
            customerGroups.map((cGroup) => {
              const isExpanded = expandedCustomers[cGroup.customerName] !== false;
              const customerPercent = cGroup.totalValueAfterVat > 0
                ? Math.round((cGroup.invoicedValueAfterVat / cGroup.totalValueAfterVat) * 100)
                : 0;

              return (
                <div
                  key={cGroup.customerName}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all"
                >
                  {/* Customer Header Bar */}
                  <div
                    onClick={() => toggleCustomerExpand(cGroup.customerName)}
                    className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-600/30 border border-blue-400/30 text-blue-300">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white">{cGroup.customerName}</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                            {cGroup.totalPOs} {cGroup.totalPOs === 1 ? 'PO' : 'POs'} ({cGroup.totalLines} lines)
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {cGroup.invoicedQuantity.toLocaleString()} of {cGroup.totalQuantity.toLocaleString()} units invoiced • Rem. Value: TZS {formatCurrency(cGroup.remainingValueAfterVat)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Financial Status Badges */}
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-semibold text-slate-400 uppercase">Customer PO Value</div>
                        <div className="text-sm font-bold text-white font-mono">
                          TZS {formatCurrency(cGroup.totalValueAfterVat)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {cGroup.status === 'FULLY_INVOICED' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Invoiced (100%)
                          </span>
                        )}
                        {cGroup.status === 'PARTIALLY_INVOICED' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> Invoiced ({customerPercent}%)
                          </span>
                        )}
                        {cGroup.status === 'PENDING' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40 inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Pending (0%)
                          </span>
                        )}

                        <div className="p-1 rounded text-slate-400 hover:text-white">
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Progress Bar */}
                  <div className="h-1.5 w-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${
                        customerPercent === 100 ? 'bg-emerald-500' : customerPercent > 0 ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                      style={{ width: `${customerPercent}%` }}
                    />
                  </div>

                  {/* Expanded POs Under this Customer */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 space-y-4 bg-slate-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {cGroup.pos.map((grp) => {
                          const poPercent = grp.totalValueAfterVat > 0
                            ? Math.round((grp.invoicedValueAfterVat / grp.totalValueAfterVat) * 100)
                            : 0;

                          return (
                            <div
                              key={grp.poNumber}
                              className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-900 font-mono">
                                      {grp.poNumber}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-medium">
                                      {grp.contract}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {grp.destination} • Date: {grp.date}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {grp.status === 'FULLY_INVOICED' && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Closed
                                    </span>
                                  )}
                                  {grp.status === 'PARTIALLY_INVOICED' && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" /> {poPercent}%
                                    </span>
                                  )}
                                  {grp.status === 'PENDING' && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 inline-flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> Pending
                                    </span>
                                  )}

                                  {/* Admin PO Edit & Add Line Buttons */}
                                  {isAdmin && (
                                    <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-1.5">
                                      <button
                                        onClick={() => handleOpenEditPODetails(grp)}
                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                        title="Admin: Edit PO Details"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleOpenAddLine(grp)}
                                        className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                        title="Admin: Add PO Line"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                      {canDeleteData(currentUser) && onDeletePO && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPoPendingDelete(grp);
                                          }}
                                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                          title="Admin: Permanently Delete Entire PO"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs text-slate-600">
                                  <span>Invoiced: TZS {formatCurrency(grp.invoicedValueAfterVat)}</span>
                                  <span className="font-bold text-slate-900">TZS {formatCurrency(grp.totalValueAfterVat)}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${poPercent}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-400">
                                  <span>{grp.invoicedQuantity} of {grp.totalQuantity} items</span>
                                  <span className="text-amber-600 font-medium">Rem: TZS {formatCurrency(grp.remainingValueAfterVat)}</span>
                                </div>
                              </div>

                              {/* Line Items List */}
                              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 space-y-1 max-h-36 overflow-y-auto text-xs">
                                {grp.lines.map((ln) => (
                                  <div
                                    key={ln.id}
                                    className="flex items-center justify-between py-1 border-b border-slate-200/50 last:border-0 text-[11px]"
                                  >
                                    <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleOpenEditLine(ln)}
                                          className="text-slate-400 hover:text-blue-600 shrink-0 cursor-pointer"
                                          title="Admin: Edit Line"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                      )}
                                      <span className="truncate text-slate-700 font-medium" title={ln.itemDescription}>
                                        {ln.itemDescription}
                                      </span>
                                      {ln.remarks && (
                                        <span className="text-[10px] text-slate-400 truncate italic" title={`Delivery Notes / Remarks: ${ln.remarks}`}>
                                          ({ln.remarks})
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-slate-500 font-mono">
                                        {ln.invoicedQuantity || 0}/{ln.quantity} {ln.unitOfMeasure}
                                      </span>
                                      <span className="font-semibold text-slate-900">
                                        TZS {formatCurrency(ln.valueAfterVat)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                                <button
                                  onClick={() => {
                                    handleSelectInvoicePO(grp.poNumber);
                                    onNavigateToInvoice();
                                  }}
                                  disabled={grp.status === 'FULLY_INVOICED'}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                    grp.status === 'FULLY_INVOICED'
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                                  }`}
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  Record Invoice for {grp.poNumber}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === 'grouped_pos' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Table Header Bar */}
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-bold text-sm text-slate-900">
                Purchase Orders Grouped by PO Number
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                {filteredGroups.length} POs
              </span>
              <span className="text-xs text-slate-500 hidden sm:inline">
                ({filteredLines.length} Total Lines)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleExpandAllPOs(Object.keys(expandedPOs).length !== filteredGroups.length)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {Object.keys(expandedPOs).length === filteredGroups.length && filteredGroups.length > 0
                  ? 'Collapse All Lines'
                  : 'Expand / Drill All POs'}
              </button>
              <TableExportToolbar
                totalCount={filteredGroups.length}
                onExportExcel={handleExportGroupedPOsExcel}
                onExportPdf={handleExportGroupedPOsPdf}
              />
            </div>
          </div>

          {/* Grouped Table */}
          <div className="overflow-x-auto max-h-[640px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-semibold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-xs">
                <tr>
                  <th className="py-2.5 px-2 w-10 text-center sticky top-0 bg-slate-900">#</th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="PO NUMBER"
                      field="poNumber"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.poNumber}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="CUSTOMER"
                      field="customerName"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.customerName}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="PO DATE"
                      field="date"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.date}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="CONTRACT"
                      field="contract"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.contract}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="QTY (SUM)"
                      field="totalQuantity"
                      align="right"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.totalQuantity}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="VALUE(SUM) INCL"
                      field="totalValueAfterVat"
                      align="right"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.totalValueAfterVat}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="VALUE(SUM) CONTRACT"
                      field="totalValueBeforeVat"
                      align="right"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.totalValueBeforeVat}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-center">
                    <TableColumnHeader
                      label="STATUS"
                      field="status"
                      align="center"
                      sortConfig={groupSort}
                      onSort={handleGroupSort}
                      filterValue={groupFilters.status}
                      onFilterChange={handleGroupFilterChange}
                    />
                  </th>
                  <th className="py-2.5 px-3 sticky top-0 bg-slate-900 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedAndFilteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      No Purchase Orders found matching current search or filters.
                    </td>
                  </tr>
                ) : (
                  paginatedGroups.map((grp) => {
                    const isExpanded = !!expandedPOs[grp.poNumber];
                    const percent = grp.totalValueAfterVat > 0
                      ? Math.round((grp.invoicedValueAfterVat / grp.totalValueAfterVat) * 100)
                      : 0;

                    return (
                      <React.Fragment key={grp.poNumber}>
                        {/* Parent PO Row */}
                        <tr
                          className={`transition-colors hover:bg-blue-50/60 ${
                            isExpanded ? 'bg-blue-50/40 font-medium' : 'bg-white'
                          }`}
                        >
                          {/* Drilldown Chevron */}
                          <td className="py-3 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpandPO(grp.poNumber)}
                              className={`p-1 rounded-md transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                              }`}
                              title={isExpanded ? 'Collapse PO lines' : 'Drill down into PO line items'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          {/* PO NUMBER */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-blue-700 text-xs">
                                {grp.poNumber}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                                {grp.lines.length} lines
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                              {grp.destination}
                            </div>
                          </td>

                          {/* CUSTOMER */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{grp.customerName}</div>
                          </td>

                          {/* PO DATE */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                            {grp.date || '—'}
                          </td>

                          {/* CONTRACT */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-medium border border-slate-200/60">
                              {grp.contract || 'General'}
                            </span>
                          </td>

                          {/* QTY (SUM) */}
                          <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                            {grp.totalQuantity.toLocaleString()}
                            <div className="text-[10px] text-slate-400 font-normal">
                              Inv: {grp.invoicedQuantity.toLocaleString()} • Rem: {grp.remainingQuantity.toLocaleString()}
                            </div>
                          </td>

                          {/* VALUE(SUM) INCL */}
                          <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-blue-900">
                            TZS {formatCurrency(grp.totalValueAfterVat)}
                            <div className="text-[10px] text-emerald-600 font-normal">
                              Inv: TZS {formatCurrency(grp.invoicedValueAfterVat)}
                            </div>
                          </td>

                          {/* VALUE(SUM) CONTRACT */}
                          <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-semibold text-slate-700">
                            TZS {formatCurrency(grp.totalValueBeforeVat)}
                          </td>

                          {/* STATUS */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {grp.status === 'FULLY_INVOICED' && (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Closed (100%)
                              </span>
                            )}
                            {grp.status === 'PARTIALLY_INVOICED' && (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 inline-flex items-center gap-1 border border-amber-200">
                                <AlertCircle className="w-3 h-3 text-amber-600" /> Partial ({percent}%)
                              </span>
                            )}
                            {grp.status === 'PENDING' && (
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 inline-flex items-center gap-1 border border-blue-200">
                                <Clock className="w-3 h-3 text-blue-600" /> Pending (0%)
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
                                title="Drill lines in PO"
                              >
                                {isExpanded ? 'Hide' : 'Drill'} Lines
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectInvoicePO(grp.poNumber);
                                  onNavigateToInvoice();
                                }}
                                disabled={grp.status === 'FULLY_INVOICED'}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                  grp.status === 'FULLY_INVOICED'
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                                }`}
                                title={`Record Invoice for ${grp.poNumber}`}
                              >
                                <Receipt className="w-3 h-3" />
                                Invoice
                              </button>

                              {isAdmin && (
                                <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditPODetails(grp)}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                    title="Admin: Edit PO Details"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAddLine(grp)}
                                    className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                    title="Admin: Add Line to PO"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  {canDeleteData(currentUser) && onDeletePO && (
                                    <button
                                      type="button"
                                      onClick={() => setPoPendingDelete(grp)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                      title="Admin: Permanently Delete Entire PO"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Drilled Lines Child Table Row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-y border-blue-200">
                            <td colSpan={10} className="p-4 pl-10">
                              <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
                                {/* Drill Header */}
                                <div className="p-3 bg-blue-900 text-white flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <PackageCheck className="w-4 h-4 text-blue-300" />
                                    <span className="font-bold text-xs">
                                      Line Items in PO <span className="font-mono text-amber-300">{grp.poNumber}</span>
                                    </span>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-800 text-blue-200">
                                      {grp.lines.length} items
                                    </span>
                                    <span className="text-[11px] text-blue-200 hidden md:inline">
                                      Customer: {grp.customerName} • Contract: {grp.contract}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleSelectInvoicePO(grp.poNumber);
                                        onNavigateToInvoice();
                                      }}
                                      disabled={grp.status === 'FULLY_INVOICED'}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                      Create Invoice for this PO
                                    </button>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAddLine(grp)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                                      >
                                        <Plus className="w-3 h-3" />
                                        Add Line
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Nested Lines Table */}
                                <div className="overflow-x-auto max-h-72">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                                      <tr>
                                        <th className="py-2.5 px-3">#</th>
                                        <th className="py-2.5 px-3">Item Description</th>
                                        <th className="py-2.5 px-2 text-center">UOM</th>
                                        <th className="py-2.5 px-3 text-right">Unit Price (TZS)</th>
                                        <th className="py-2.5 px-3 text-right">Ordered Qty</th>
                                        <th className="py-2.5 px-3 text-right">Contract Value</th>
                                        <th className="py-2.5 px-3 text-right">Total Incl. VAT</th>
                                        <th className="py-2.5 px-3 text-right">Invoiced Qty</th>
                                        <th className="py-2.5 px-3 text-right">Remaining Qty</th>
                                        <th className="py-2.5 px-3 text-center">Status</th>
                                        {isAdmin && <th className="py-2.5 px-3 text-center">Admin</th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {grp.lines.map((ln, lIdx) => {
                                        const remQty = ln.remainingQuantity !== undefined ? ln.remainingQuantity : (ln.quantity - (ln.invoicedQuantity || 0));
                                        return (
                                          <tr key={ln.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{lIdx + 1}</td>
                                            <td className="py-2 px-3">
                                              <div className="font-semibold text-slate-800">{ln.itemDescription}</div>
                                              <div className="text-[10px] text-slate-400">{ln.destination || grp.destination}</div>
                                            </td>
                                            <td className="py-2 px-2 text-center font-mono text-slate-600">{ln.unitOfMeasure}</td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                                              {formatCurrency(ln.unitPrice)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                              {ln.quantity}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                                              TZS {formatCurrency(ln.valueBeforeVat)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                                              TZS {formatCurrency(ln.valueAfterVat)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">
                                              {ln.invoicedQuantity || 0}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-amber-700 font-semibold">
                                              {remQty}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                  ln.status === 'FULLY_INVOICED'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : ln.status === 'PARTIALLY_INVOICED'
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}
                                              >
                                                {ln.status || 'UNINVOICED'}
                                              </span>
                                            </td>
                                            {isAdmin && (
                                              <td className="py-2 px-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenEditLine(ln)}
                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                                    title="Admin: Edit Line Item"
                                                  >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                  </button>
                                                  {canDeleteData(currentUser) && onDeletePOLine && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setPoLinePendingDelete(ln)}
                                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                                      title="Admin: Permanently Delete Line Item"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    {/* Subtotal row */}
                                    <tfoot className="bg-slate-50 font-semibold border-t border-slate-200 text-slate-900">
                                      <tr>
                                        <td colSpan={4} className="py-2 px-3 text-right text-[11px] uppercase tracking-wider text-slate-500">
                                          PO {grp.poNumber} Totals:
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold">
                                          {grp.totalQuantity.toLocaleString()}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono">
                                          TZS {formatCurrency(grp.totalValueBeforeVat)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                                          TZS {formatCurrency(grp.totalValueAfterVat)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                          {grp.invoicedQuantity.toLocaleString()}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-amber-700 font-bold">
                                          {grp.remainingQuantity.toLocaleString()}
                                        </td>
                                        <td colSpan={isAdmin ? 2 : 1}></td>
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
                  })
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={groupPage}
            totalItems={sortedAndFilteredGroups.length}
            pageSize={groupPageSize}
            onPageChange={setGroupPage}
            onPageSizeChange={setGroupPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
            itemLabel="Purchase Orders"
          />
        </div>
      )}

      {viewMode === 'line_items' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                PO Line Items Master Table
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                {filteredLines.length} lines
              </span>
            </div>
            <TableExportToolbar
              totalCount={filteredLines.length}
              onExportExcel={handleExportLinesExcel}
              onExportPdf={handleExportLinesPdf}
            />
          </div>
          <div className="overflow-auto max-h-[620px] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white sticky top-0 z-20 font-semibold tracking-wider uppercase text-[10px] shadow-sm whitespace-nowrap">
                <tr>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">#</th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="PO Number"
                      field="poNumber"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.poNumber}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="Customer"
                      field="customerName"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.customerName}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="Destination"
                      field="destination"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.destination}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="Contract"
                      field="contract"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.contract}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 min-w-[200px]">
                    <TableColumnHeader
                      label="Item Description"
                      field="itemDescription"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.itemDescription}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="Date (LPO)"
                      field="date"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.date}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900">
                    <TableColumnHeader
                      label="UOM"
                      field="unitOfMeasure"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.unitOfMeasure}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="PO Qty"
                      field="quantity"
                      align="right"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.quantity}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="Invoiced"
                      field="invoicedQuantity"
                      align="right"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.invoicedQuantity}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="Rem. Qty"
                      field="remainingQuantity"
                      align="right"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.remainingQuantity}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="Unit Price (TZS)"
                      field="unitPrice"
                      align="right"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.unitPrice}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-right">
                    <TableColumnHeader
                      label="Value (TZS)"
                      field="valueAfterVat"
                      align="right"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.valueAfterVat}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-center">
                    <TableColumnHeader
                      label="Status"
                      field="status"
                      align="center"
                      sortConfig={lineSort}
                      onSort={handleLineSort}
                      filterValue={lineFilters.status}
                      onFilterChange={handleLineFilterChange}
                    />
                  </th>
                  <th className="py-2 px-2 sticky top-0 bg-slate-900 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700 text-xs whitespace-nowrap">
                {sortedAndFilteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-8 text-center text-slate-400">
                      No Purchase Order lines match your current search and filters.
                    </td>
                  </tr>
                ) : (
                  paginatedLines.map((item, idx) => {
                    const globalIdx = (linePage - 1) * linePageSize + idx + 1;
                    return (
                    <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-1 px-2 text-slate-400 font-mono text-[10px]">{globalIdx}</td>
                      <td className="py-1 px-2 font-bold text-slate-900 font-mono">{item.poNumber}</td>
                      <td className="py-1 px-2 font-medium text-slate-800">{item.customerName}</td>
                      <td className="py-1 px-2 text-slate-600">{item.destination}</td>
                      <td className="py-1 px-2 text-slate-500 font-mono text-[11px]">{item.contract}</td>
                      <td className="py-1 px-2 font-medium text-slate-900 max-w-[240px]" title={item.itemDescription}>
                        <div className="truncate">{item.itemDescription}</div>
                        {item.remarks && (
                          <div className="text-[9px] text-slate-500 truncate flex items-center gap-1" title={`Delivery Notes / Remarks: ${item.remarks}`}>
                            <span className="font-semibold text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded text-[8px]">DN/Note</span>
                            <span className="truncate">{item.remarks}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-2 text-slate-500">{item.date}</td>
                      <td className="py-1 px-2 text-slate-600 font-semibold text-[11px]">{item.unitOfMeasure}</td>
                      <td className="py-1 px-2 text-right font-bold text-slate-900">{item.quantity}</td>
                      <td className="py-1 px-2 text-right font-semibold text-emerald-700">
                        {item.invoicedQuantity || 0}
                      </td>
                      <td className="py-1 px-2 text-right font-semibold text-amber-700">
                        {item.remainingQuantity !== undefined ? item.remainingQuantity : item.quantity}
                      </td>
                      <td className="py-1 px-2 text-right font-semibold text-slate-900">TZS {formatCurrency(item.unitPrice)}</td>
                      <td className="py-1 px-2 text-right font-bold text-slate-900">TZS {formatCurrency(item.valueAfterVat)}</td>
                      <td className="py-1 px-2 text-center">
                        {item.status === 'FULLY_INVOICED' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Fully Invoiced
                          </span>
                        )}
                        {item.status === 'PARTIALLY_INVOICED' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-amber-100 text-amber-800">
                            <AlertCircle className="w-2.5 h-2.5" /> Partial
                          </span>
                        )}
                        {(!item.status || item.status === 'UNINVOICED') && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-slate-100 text-slate-600">
                            <Clock className="w-2.5 h-2.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isAdmin && (
                            <button
                              onClick={() => handleOpenEditLine(item)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                              title="Admin: Edit Line"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDeleteData(currentUser) && onDeletePOLine && (
                            <button
                              type="button"
                              onClick={() => setPoLinePendingDelete(item)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              title="Admin: Permanently Delete Line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleSelectInvoicePO(item.poNumber);
                              onNavigateToInvoice();
                            }}
                            disabled={item.status === 'FULLY_INVOICED'}
                            className={`px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                              item.status === 'FULLY_INVOICED'
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200'
                            }`}
                          >
                            <Receipt className="w-3 h-3" />
                            Invoice
                          </button>
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
            totalItems={sortedAndFilteredLines.length}
            pageSize={linePageSize}
            onPageChange={setLinePage}
            onPageSizeChange={setLinePageSize}
            pageSizeOptions={[50, 100, 250, 500]}
            itemLabel="Line Items"
          />
        </div>
      )}

      {/* Modal: Admin Add New Purchase Order */}
      {isAddPOModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <PlusCircle className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Create New Purchase Order (Admin)</h3>
              </div>
              <button
                onClick={() => setIsAddPOModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">PO Number *</label>
                <input
                  type="text"
                  value={newPoNumber}
                  onChange={(e) => setNewPoNumber(e.target.value)}
                  placeholder="e.g. PO-2025-088"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="e.g. CRU Mining Ltd or GRB Mining"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Destination</label>
                <input
                  type="text"
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  placeholder="e.g. Geita Site / Warehouse A"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contract / Ref</label>
                <input
                  type="text"
                  value={newContract}
                  onChange={(e) => setNewContract(e.target.value)}
                  placeholder="e.g. CNT-2025-ENG"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PO Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-800">PO Line Items</h4>
                <button
                  type="button"
                  onClick={() =>
                    setNewPoLinesInput([
                      ...newPoLinesInput,
                      { description: '', uom: 'PCS', quantity: 10, unitCost: 15, unitPrice: 20, vatRate: 0.18 },
                    ])
                  }
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Another Line
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {newPoLinesInput.map((line, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-6 gap-2 text-xs">
                    <div className="col-span-3">
                      <label className="text-[10px] text-slate-500 block">Item Description</label>
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => {
                          const updated = [...newPoLinesInput];
                          updated[idx].description = e.target.value;
                          setNewPoLinesInput(updated);
                        }}
                        placeholder="Description..."
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">UOM</label>
                      <input
                        type="text"
                        value={line.uom}
                        onChange={(e) => {
                          const updated = [...newPoLinesInput];
                          updated[idx].uom = e.target.value;
                          setNewPoLinesInput(updated);
                        }}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => {
                          const updated = [...newPoLinesInput];
                          updated[idx].quantity = Number(e.target.value);
                          setNewPoLinesInput(updated);
                        }}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Unit Price</label>
                      <input
                        type="number"
                        step="any"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const updated = [...newPoLinesInput];
                          updated[idx].unitPrice = Number(e.target.value);
                          setNewPoLinesInput(updated);
                        }}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:outline-none font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddPOModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewPO}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                Save Purchase Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit PO Details */}
      {isEditPODetailsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Edit3 className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Edit PO Details ({editingPoNumber})</h3>
              </div>
              <button
                onClick={() => setIsEditPODetailsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Modifying these fields will update all line items associated with PO <span className="font-mono font-bold text-slate-800">{editingPoNumber}</span>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editDetailsCustomer}
                  onChange={(e) => setEditDetailsCustomer(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Destination</label>
                <input
                  type="text"
                  value={editDetailsDestination}
                  onChange={(e) => setEditDetailsDestination(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contract / Ref</label>
                <input
                  type="text"
                  value={editDetailsContract}
                  onChange={(e) => setEditDetailsContract(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PO Date</label>
                <input
                  type="date"
                  value={editDetailsDate}
                  onChange={(e) => setEditDetailsDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditPODetailsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePODetails}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Line to Existing PO */}
      {isAddLineModalOpen && targetPoForNewLine && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <PlusCircle className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">
                  Add Line Item to {targetPoForNewLine.poNumber}
                </h3>
              </div>
              <button
                onClick={() => setIsAddLineModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Item Description *</label>
                <input
                  type="text"
                  value={newLineDesc}
                  onChange={(e) => setNewLineDesc(e.target.value)}
                  placeholder="e.g. Hydraulic Seal Kit 40mm"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">UOM</label>
                  <input
                    type="text"
                    value={newLineUOM}
                    onChange={(e) => setNewLineUOM(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={newLineQty}
                    onChange={(e) => setNewLineQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={newLineCost}
                    onChange={(e) => setNewLineCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit Price *</label>
                  <input
                    type="number"
                    step="any"
                    value={newLinePrice}
                    onChange={(e) => setNewLinePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none text-blue-700"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">VAT Rate</label>
                  <select
                    value={newLineVatRate}
                    onChange={(e) => setNewLineVatRate(Number(e.target.value))}
                    className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  >
                    <option value={0.18}>18% (Standard)</option>
                    <option value={0}>0% (Exempt)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
                Calculated Line Total: TZS {formatCurrency(newLineQty * newLinePrice * (1 + newLineVatRate))} (Incl. VAT)
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddLineModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewLine}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
              >
                Add Line Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Existing PO Line Item */}
      {isEditLineModalOpen && editingLineItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Edit3 className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Edit Line Item</h3>
              </div>
              <button
                onClick={() => setIsEditLineModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Item Description</label>
                <input
                  type="text"
                  value={editingLineItem.itemDescription}
                  onChange={(e) =>
                    setEditingLineItem({ ...editingLineItem, itemDescription: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">UOM</label>
                  <input
                    type="text"
                    value={editingLineItem.unitOfMeasure}
                    onChange={(e) =>
                      setEditingLineItem({ ...editingLineItem, unitOfMeasure: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editingLineItem.quantity}
                    onChange={(e) =>
                      setEditingLineItem({ ...editingLineItem, quantity: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={editingLineItem.unitCost}
                    onChange={(e) =>
                      setEditingLineItem({ ...editingLineItem, unitCost: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unit Price</label>
                  <input
                    type="number"
                    step="any"
                    value={editingLineItem.unitPrice}
                    onChange={(e) =>
                      setEditingLineItem({ ...editingLineItem, unitPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold text-blue-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Delivery Notes / General Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. DN-2026-089 / Partial delivery schedule"
                  value={editingLineItem.remarks || ''}
                  onChange={(e) =>
                    setEditingLineItem({ ...editingLineItem, remarks: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              {editingLineItem.invoicedQuantity ? (
                <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  Note: {editingLineItem.invoicedQuantity} units have already been invoiced for this line.
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {canDeleteData(currentUser) && onDeletePOLine ? (
                <button
                  type="button"
                  onClick={() => {
                    const lineToDelete = editingLineItem;
                    setIsEditLineModalOpen(false);
                    setPoLinePendingDelete(lineToDelete);
                  }}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Line
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditLineModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditLine}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal for Entire PO */}
      <PermanentDeleteModal
        isOpen={!!poPendingDelete}
        onClose={() => setPoPendingDelete(null)}
        onConfirm={() => {
          if (poPendingDelete && onDeletePO) {
            onDeletePO(poPendingDelete.poNumber);
            setPoPendingDelete(null);
          }
        }}
        transactionType="PURCHASE_ORDER"
        referenceNumber={poPendingDelete?.poNumber || ''}
        customerName={poPendingDelete?.customerName}
        poNumber={poPendingDelete?.poNumber}
        totalAmount={poPendingDelete?.totalValueAfterVat}
        details={`Permanently removes Purchase Order ${poPendingDelete?.poNumber} and all ${poPendingDelete?.lines.length || 0} associated line items from the database.`}
      />

      {/* Permanent Delete Modal for Single PO Line Item */}
      <PermanentDeleteModal
        isOpen={!!poLinePendingDelete}
        onClose={() => setPoLinePendingDelete(null)}
        onConfirm={() => {
          if (poLinePendingDelete && onDeletePOLine) {
            onDeletePOLine(poLinePendingDelete.id);
            setPoLinePendingDelete(null);
          }
        }}
        transactionType="LINE_ITEM"
        referenceNumber={poLinePendingDelete?.itemDescription || ''}
        customerName={poLinePendingDelete?.customerName}
        poNumber={poLinePendingDelete?.poNumber}
        totalAmount={poLinePendingDelete?.valueAfterVat}
        details={`Permanently removes item "${poLinePendingDelete?.itemDescription}" (Qty: ${poLinePendingDelete?.quantity}) from PO ${poLinePendingDelete?.poNumber}.`}
      />

      {/* Permanent Delete Modal for ALL Purchase Orders */}
      {isClearAllPOsModalOpen && (
        <div
          id="clear-all-pos-modal-backdrop"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            id="clear-all-pos-modal-dialog"
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top Header Banner */}
            <div className="bg-gradient-to-r from-red-600 via-rose-700 to-red-800 p-5 text-white flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold tracking-tight">Clear All Purchase Orders</h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/30 border border-white/20 tracking-wider">
                      ADM ONLY
                    </span>
                  </div>
                  <p className="text-xs text-rose-100 mt-0.5">
                    Authorized Administrator bulk delete confirmation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsClearAllPOsModalOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 leading-relaxed">
                  <span className="font-bold">Permanent Bulk Action:</span> You are about to wipe all{' '}
                  <span className="font-bold">{poLines.length.toLocaleString()}</span> PO line items across{' '}
                  <span className="font-bold">{poGroups.length.toLocaleString()}</span> Purchase Orders from the database.
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
                <div className="font-semibold text-slate-900">What will happen:</div>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>All Purchase Order headers and item lines will be cleared immediately.</li>
                  <li>Changes will synchronize to the Central Master Database immediately.</li>
                  <li>Existing invoices, delivery notes, and payments are preserved, but will no longer match active PO lines.</li>
                  <li>You can upload a new PO Excel file at any time to reload fresh data.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  id="cancel-clear-all-pos-button"
                  onClick={() => setIsClearAllPOsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-clear-all-pos-button"
                  onClick={() => {
                    setIsClearAllPOsModalOpen(false);
                    if (onClearPOs) {
                      onClearPOs();
                    } else if (onClearData) {
                      onClearData();
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Clear All POs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
