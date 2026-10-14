import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PurchaseOrderGroup, 
  InvoiceRecord, 
  InvoiceLineItem, 
  POLineItem,
  CustomerSeriesBook,
  AppUser,
  DocumentAttachment
} from '../types';
import { ImageAttachmentManager } from './ImageAttachmentManager';
import { SmsConfirmationModal } from './SmsConfirmationModal';
import { 
  formatCurrency, 
  loadStoredSeriesConfig, 
  formatSeriesNumber,
  loadStoredCustomerSeriesBooks,
  saveOrUpdateCustomerSeriesBook,
  getCustomerSeriesBook,
  peekCustomerSeriesNumber,
  advanceCustomerSeriesNumber,
  getNextAvailableCustomerInvoiceNumber,
  deleteCustomerSeriesBook,
  groupPOsByNumber
} from '../utils/storage';
import { allocateSeriesNumber } from '../utils/seriesService';
import { isAdminUser } from '../utils/authService';
import { 
  Search, 
  Receipt, 
  Calendar, 
  Save, 
  Printer, 
  AlertCircle, 
  CheckCircle2, 
  Building2, 
  RotateCcw, 
  Sparkles, 
  ChevronDown, 
  Plus, 
  BookOpen, 
  X, 
  MessageSquare, 
  AlertTriangle,
  FileText,
  PlusCircle,
  Trash2,
  Download,
  CloudUpload,
  CheckSquare,
  Square,
  Edit3
} from 'lucide-react';
import { generateSampleInvoiceExcelTemplate } from '../utils/excelParser';

interface InvoiceCreatorProps {
  poGroups?: PurchaseOrderGroup[];
  allPoLines?: POLineItem[];
  poLines?: POLineItem[]; // alias fallback
  invoices?: InvoiceRecord[];
  initialPoNumber?: string;
  preselectedPoNumber?: string; // alias fallback
  onSaveInvoice: (invoice: InvoiceRecord) => void;
  onViewInvoicePrint?: (invoice: InvoiceRecord) => void;
  onNavigateToHistory?: () => void;
  onViewInvoicesDatabase?: () => void; // alias fallback
  onSeriesConfigChanged?: () => void;
  editingInvoice?: InvoiceRecord | null;
  onCancelEdit?: () => void;
  currentUser?: AppUser;
  sheetSyncStatus?: {
    isSaving: boolean;
    status: 'idle' | 'saving' | 'saved' | 'failed';
    message: string;
    lastSavedTime?: string;
    error?: string;
  };
  onPushDataSave?: () => Promise<boolean> | void;
}

export const InvoiceCreator: React.FC<InvoiceCreatorProps> = ({
  poGroups: passedPoGroups = [],
  allPoLines = [],
  poLines = [],
  invoices = [],
  initialPoNumber,
  preselectedPoNumber,
  onSaveInvoice,
  onViewInvoicePrint = (_inv?: InvoiceRecord) => {},
  onNavigateToHistory,
  onViewInvoicesDatabase,
  onSeriesConfigChanged,
  editingInvoice = null,
  onCancelEdit,
  currentUser,
  sheetSyncStatus,
  onPushDataSave,
}) => {
  const effectiveInitialPo = initialPoNumber || preselectedPoNumber || '';
  const effectiveLines = allPoLines.length > 0 ? allPoLines : poLines;
  const isAdmin = isAdminUser(currentUser);

  // Fallback if poGroups was not supplied directly
  const poGroups = useMemo(() => {
    if (passedPoGroups && passedPoGroups.length > 0) return passedPoGroups;
    if (effectiveLines.length > 0) {
      return groupPOsByNumber(effectiveLines, invoices, []);
    }
    return [];
  }, [passedPoGroups, effectiveLines, invoices]);

  const handleNavigateToHistory = onNavigateToHistory || onViewInvoicesDatabase || (() => {});

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Modal for adding a new customer
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPrefix, setNewCustPrefix] = useState<string>('');
  const [newCustStart, setNewCustStart] = useState<number>(1);
  const [newCustEnd, setNewCustEnd] = useState<number>(200);

  // PO search & selection (EMPTY BY DEFAULT!)
  const [poSearchInput, setPoSearchInput] = useState<string>(effectiveInitialPo || '');
  const [selectedPoGroup, setSelectedPoGroup] = useState<PurchaseOrderGroup | null>(null);
  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState<boolean>(false);
  const poDropdownRef = useRef<HTMLDivElement>(null);

  // Header fields
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>(''); // [add Notes]
  const [headerComment, setHeaderComment] = useState<string>('Okay'); // Invoice Status
  const [vatRate] = useState<number>(0.18);
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);

  // Customer book settings modal
  const [activeCustomerBook, setActiveCustomerBook] = useState<CustomerSeriesBook | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState<boolean>(false);
  const [bookPrefix, setBookPrefix] = useState<string>('CRU');
  const [bookStartNum, setBookStartNum] = useState<number>(1);
  const [bookEndNum, setBookEndNum] = useState<number>(200);
  const [bookCurrentNum, setBookCurrentNum] = useState<number>(1);
  const [bookPadding, setBookPadding] = useState<number>(3);

  // Checkbox flags (aligned in one line: Flag invoice, cancelled, OFR, NO po, Invoice Status)
  const [hasTransactionIssue, setHasTransactionIssue] = useState<boolean>(false);
  const [isCancelledChecked, setIsCancelledChecked] = useState<boolean>(false);
  const [isOfrChecked, setIsOfrChecked] = useState<boolean>(false);
  const [isNoPoChecked, setIsNoPoChecked] = useState<boolean>(false);

  // Line items state
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSavedInvoice, setSuccessSavedInvoice] = useState<InvoiceRecord | null>(null);

  // Admin delete confirmation modal for line items
  const [linePendingDelete, setLinePendingDelete] = useState<{
    line: InvoiceLineItem;
    lineIndex: number;
  } | null>(null);

  const handleConfirmDeleteLine = () => {
    if (!linePendingDelete) return;
    const { lineIndex } = linePendingDelete;
    setInvoiceLines((prev) => prev.filter((_, i) => i !== lineIndex));
    setLinePendingDelete(null);
  };

  // Dynamic list of unique customers from POs and stored customer books
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

  // Filtered customers for combobox (capped for fast DOM rendering)
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers.filter((c) => c.toLowerCase().includes(q)).slice(0, 30);
  }, [customers, customerSearchQuery]);

  // Filtered POs according to selected customer
  const customerFilteredPOs = useMemo(() => {
    if (selectedCustomer === 'ALL') return poGroups;
    const lowerCust = selectedCustomer.toLowerCase();
    return poGroups.filter((po) => po.customerName.toLowerCase() === lowerCust);
  }, [poGroups, selectedCustomer]);

  // Suggested POs for live dropdown search - sliced for lightning-fast responsive rendering
  const suggestedPOs = useMemo(() => {
    const query = poSearchInput.trim().toLowerCase();
    if (!query) {
      return customerFilteredPOs.slice(0, 40);
    }
    const filtered = customerFilteredPOs.filter((po) => {
      return (
        po.poNumber.toLowerCase().includes(query) ||
        po.customerName.toLowerCase().includes(query) ||
        po.contract.toLowerCase().includes(query) ||
        po.destination.toLowerCase().includes(query)
      );
    });
    return filtered.slice(0, 40);
  }, [customerFilteredPOs, poSearchInput]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (poDropdownRef.current && !poDropdownRef.current.contains(e.target as Node)) {
        setIsPoDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync customer series book and invoice number
  const syncCustomerBook = (customerName: string, overrideNextNum?: string) => {
    if (!customerName || customerName === 'ALL') {
      const cfg = loadStoredSeriesConfig();
      setBookPrefix(cfg.invoiceSeries.prefix);
      setBookStartNum(cfg.invoiceSeries.startNumber);
      setBookEndNum(cfg.invoiceSeries.endNumber);
      setBookCurrentNum(cfg.invoiceSeries.currentNumber);
      setBookPadding(cfg.invoiceSeries.padding);
      setActiveCustomerBook(null);
      if (!editingInvoice) {
        setInvoiceNumber(overrideNextNum || formatSeriesNumber(cfg.invoiceSeries.prefix, cfg.invoiceSeries.currentNumber, cfg.invoiceSeries.padding));
      }
      return;
    }
    const book = getCustomerSeriesBook(customerName);
    setActiveCustomerBook(book);
    setBookPrefix(book.invoicePrefix);
    setBookStartNum(book.invoiceStartNumber);
    setBookEndNum(book.invoiceEndNumber);
    setBookCurrentNum(book.invoiceCurrentNumber);
    setBookPadding(book.padding);

    if (!editingInvoice) {
      const nextNum = overrideNextNum || getNextAvailableCustomerInvoiceNumber(customerName, invoices);
      setInvoiceNumber(nextNum);
    }
  };

  // If editing an existing invoice
  useEffect(() => {
    if (editingInvoice) {
      setInvoiceNumber(editingInvoice.invoiceNumber);
      setInvoiceDate(editingInvoice.invoiceDate);
      setPoSearchInput(editingInvoice.poNumber);
      setNotes(editingInvoice.notes || '');
      setHeaderComment(editingInvoice.comment || 'Okay');
      setAttachments(editingInvoice.attachments || []);
      if (editingInvoice.customerName) {
        setSelectedCustomer(editingInvoice.customerName);
        syncCustomerBook(editingInvoice.customerName);
      }
      const isInvoiceFlagged = Boolean(
        editingInvoice.hasIssue ||
        editingInvoice.lines?.some((l) => l.hasIssue) ||
        (editingInvoice.comment && !['okay', 'ok', 'active', ''].includes(editingInvoice.comment.trim().toLowerCase()))
      );
      setHasTransactionIssue(isInvoiceFlagged);
      setIsCancelledChecked(editingInvoice.isCancelled || editingInvoice.status === 'CANCELLED');
      setIsNoPoChecked(editingInvoice.comment?.includes('No PO') || editingInvoice.notes?.includes('No PO') || false);

      const targetGroup = poGroups.find(
        (g) => g.poNumber.trim().toLowerCase() === editingInvoice.poNumber.trim().toLowerCase()
      );
      if (targetGroup) {
        setSelectedPoGroup(targetGroup);
      }

      setInvoiceLines(
        editingInvoice.lines.map((l) => ({
          ...l,
          isSelected: true,
        }))
      );
    } else {
      // Default creation: keep PO Number empty!
      if (!invoiceNumber) {
        const initialCust = selectedCustomer !== 'ALL' ? selectedCustomer : (customers[0] || '');
        if (initialCust) {
          syncCustomerBook(initialCust);
        } else {
          const cfg = loadStoredSeriesConfig();
          setInvoiceNumber(formatSeriesNumber(cfg.invoiceSeries.prefix, cfg.invoiceSeries.currentNumber, cfg.invoiceSeries.padding));
        }
      }
    }
  }, [editingInvoice]);

  // If effectiveInitialPo is provided explicitly (e.g. from PO list)
  useEffect(() => {
    if (editingInvoice) return;
    if (effectiveInitialPo && poGroups.length > 0 && !selectedPoGroup) {
      handleSelectPO(effectiveInitialPo);
    }
  }, [poGroups, effectiveInitialPo]);

  // Handler when PO is selected
  const handleSelectPO = (poNum: string) => {
    setErrorMessage(null);
    setSuccessSavedInvoice(null);
    setIsPoDropdownOpen(false);

    const targetGroup = poGroups.find(
      (g) => g.poNumber.trim().toLowerCase() === poNum.trim().toLowerCase()
    );

    if (!targetGroup) {
      setSelectedPoGroup(null);
      setInvoiceLines([]);
      setPoSearchInput(poNum);
      return;
    }

    setSelectedPoGroup(targetGroup);
    setPoSearchInput(targetGroup.poNumber);

    if (targetGroup.customerName) {
      setSelectedCustomer(targetGroup.customerName);
      setCustomerSearchQuery('');
      const nextNum = getNextAvailableCustomerInvoiceNumber(targetGroup.customerName, invoices);
      syncCustomerBook(targetGroup.customerName, nextNum);
    }

    // Initialize lines
    const lines: InvoiceLineItem[] = targetGroup.lines.map((poLine) => {
      const alreadyInvoiced = poLine.invoicedQuantity || 0;
      const available = Math.max(0, poLine.quantity - alreadyInvoiced);
      const initInvoicedQty = available;
      const valBeforeVat = Math.round(initInvoicedQty * poLine.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBeforeVat * (poLine.vatRate || vatRate) * 100) / 100;

      return {
        id: `inv-line-${poLine.id}-${Date.now()}`,
        poLineId: poLine.id,
        itemDescription: poLine.itemDescription,
        unitOfMeasure: poLine.unitOfMeasure,
        poQuantity: poLine.quantity,
        alreadyInvoicedQuantity: alreadyInvoiced,
        availableQuantity: available,
        invoicedQuantity: initInvoicedQty,
        unitPrice: poLine.unitPrice,
        vatRate: poLine.vatRate || vatRate,
        valueBeforeVat: valBeforeVat,
        totalBeforeVat: valBeforeVat,
        vatAmount: vatAmt,
        valueAfterVat: Math.round((valBeforeVat + vatAmt) * 100) / 100,
        totalAfterVat: Math.round((valBeforeVat + vatAmt) * 100) / 100,
        comment: 'Okay',
        isSelected: available > 0,
        hasIssue: hasTransactionIssue,
        issueComment: hasTransactionIssue ? 'Discrepancy' : undefined,
      };
    });

    setInvoiceLines(lines);
  };

  // Customer change handler
  const handleCustomerSelect = (cust: string) => {
    setSelectedCustomer(cust);
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
    const nextNum = getNextAvailableCustomerInvoiceNumber(cust, invoices);
    syncCustomerBook(cust, nextNum);

    // If active PO belongs to another customer, clear PO
    if (selectedPoGroup && selectedPoGroup.customerName.toLowerCase() !== cust.toLowerCase()) {
      setSelectedPoGroup(null);
      setPoSearchInput('');
      setInvoiceLines([]);
    }
  };

  // Add new customer handler
  const handleSaveNewCustomer = () => {
    const name = newCustName.trim();
    if (!name) {
      setErrorMessage('Please provide a valid Customer Name.');
      return;
    }
    const prefix = (newCustPrefix.trim() || name.slice(0, 3)).toUpperCase();
    const newBook: CustomerSeriesBook = {
      id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      customerName: name,
      invoicePrefix: prefix,
      invoiceStartNumber: newCustStart || 1,
      invoiceEndNumber: newCustEnd || 200,
      invoiceCurrentNumber: newCustStart || 1,
      deliveryPrefix: prefix,
      deliveryStartNumber: 1,
      deliveryEndNumber: 200,
      deliveryCurrentNumber: 1,
      padding: 3,
      updatedAt: new Date().toISOString(),
    };
    saveOrUpdateCustomerSeriesBook(newBook);
    setIsAddCustomerModalOpen(false);
    setNewCustName('');
    setNewCustPrefix('');
    handleCustomerSelect(name);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  // Flag and Checkbox logic: Flag invoice, NO po, cancelled, Invoice Status
  const handleToggleMainIssue = (checked: boolean) => {
    setHasTransactionIssue(checked);
    if (!checked) {
      setIsNoPoChecked(false);
      setIsCancelledChecked(false);
      setHeaderComment('Okay');
      setInvoiceLines((prev) =>
        prev.map((l) => ({
          ...l,
          hasIssue: false,
          issueComment: undefined,
          comment: (l.comment && l.comment.toLowerCase() !== 'okay' && l.comment !== l.issueComment) ? l.comment : 'Okay',
        }))
      );
    } else {
      if (!headerComment || headerComment.trim().toLowerCase() === 'okay') {
        setHeaderComment('Discrepancy');
      }
      setInvoiceLines((prev) =>
        prev.map((l) => ({
          ...l,
          isSelected: true,
          hasIssue: true,
          issueComment: l.issueComment || 'Discrepancy',
          comment: (l.comment && l.comment.toLowerCase() !== 'okay') ? l.comment : (l.issueComment || 'Discrepancy'),
        }))
      );
    }
  };

  const handleToggleNoPo = (checked: boolean) => {
    if (checked) {
      setIsNoPoChecked(true);
      setIsCancelledChecked(false);
      setIsOfrChecked(false);
      setHeaderComment('NO PO');
      setNotes('NO PO');
      setInvoiceLines((prev) =>
        prev.map((l) => ({
          ...l,
          hasIssue: true,
          issueComment: l.issueComment || 'NO PO',
          comment: (l.comment && l.comment.toLowerCase() !== 'okay') ? l.comment : 'NO PO',
        }))
      );

      // Populate dummy zero line if no lines exist
      if (invoiceLines.length === 0) {
        setInvoiceLines([
          {
            id: `inv-line-nopo-${Date.now()}`,
            poLineId: 'NO-PO-LINE',
            itemDescription: 'No PO details',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyInvoicedQuantity: 0,
            availableQuantity: 0,
            invoicedQuantity: 0,
            unitPrice: 0,
            vatRate: 0.18,
            vatAmount: 0,
            totalBeforeVat: 0,
            totalAfterVat: 0,
            comment: 'No PO details',
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

      // Populate dummy zero line if no lines exist
      if (invoiceLines.length === 0) {
        setInvoiceLines([
          {
            id: `inv-line-cancelled-${Date.now()}`,
            poLineId: 'CANCELLED-LINE',
            itemDescription: 'Cancelled',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyInvoicedQuantity: 0,
            availableQuantity: 0,
            invoicedQuantity: 0,
            unitPrice: 0,
            vatRate: 0.18,
            vatAmount: 0,
            totalBeforeVat: 0,
            totalAfterVat: 0,
            comment: 'Cancelled',
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

      // Populate dummy zero line if no lines exist
      if (invoiceLines.length === 0) {
        setInvoiceLines([
          {
            id: `inv-line-ofr-${Date.now()}`,
            poLineId: 'OFR-LINE',
            itemDescription: 'Out of range (OFR)',
            unitOfMeasure: 'LOT',
            poQuantity: 0,
            alreadyInvoicedQuantity: 0,
            availableQuantity: 0,
            invoicedQuantity: 0,
            unitPrice: 0,
            vatRate: 0.18,
            vatAmount: 0,
            totalBeforeVat: 0,
            totalAfterVat: 0,
            comment: 'Out of range',
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

  // Master checkbox toggle for table
  const allSelected = useMemo(() => {
    if (invoiceLines.length === 0) return false;
    return invoiceLines.every((l) => l.isSelected);
  }, [invoiceLines]);

  const handleToggleSelectAll = (select: boolean) => {
    setInvoiceLines((prev) =>
      prev.map((line) => {
        if (!select) {
          return {
            ...line,
            isSelected: false,
            invoicedQuantity: 0,
            valueBeforeVat: 0,
            totalBeforeVat: 0,
            vatAmount: 0,
            valueAfterVat: 0,
            totalAfterVat: 0,
          };
        }
        const canSelect = editingInvoice || line.availableQuantity > 0 || hasTransactionIssue || isNoPoChecked || isCancelledChecked;
        if (!canSelect && select) return line;

        const nextQty = line.invoicedQuantity > 0
          ? line.invoicedQuantity
          : (line.availableQuantity > 0 ? line.availableQuantity : (line.poQuantity || 1));
        const valBefore = Math.round(nextQty * line.unitPrice * 100) / 100;
        const vRate = line.vatRate ?? vatRate;
        const vatAmt = Math.round(valBefore * vRate * 100) / 100;
        const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

        return {
          ...line,
          isSelected: true,
          invoicedQuantity: nextQty,
          valueBeforeVat: valBefore,
          totalBeforeVat: valBefore,
          vatAmount: vatAmt,
          valueAfterVat: valAfter,
          totalAfterVat: valAfter,
        };
      })
    );
  };

  const handleToggleLine = (index: number) => {
    setInvoiceLines((prev) => {
      const updated = [...prev];
      const target = updated[index];
      const nextSelected = !target.isSelected;
      let nextQty = target.invoicedQuantity;
      if (nextSelected && (!nextQty || nextQty <= 0)) {
        nextQty = target.availableQuantity > 0 ? target.availableQuantity : (target.poQuantity || 1);
      } else if (!nextSelected) {
        nextQty = 0;
      }
      const valBefore = Math.round(nextQty * target.unitPrice * 100) / 100;
      const vRate = target.vatRate ?? vatRate;
      const vatAmt = Math.round(valBefore * vRate * 100) / 100;
      const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;
      updated[index] = {
        ...target,
        isSelected: nextSelected,
        invoicedQuantity: nextQty,
        valueBeforeVat: valBefore,
        totalBeforeVat: valBefore,
        vatAmount: vatAmt,
        valueAfterVat: valAfter,
        totalAfterVat: valAfter,
      };
      return updated;
    });
  };

  // Line changes
  const handleQuantityChange = (index: number, val: string) => {
    const parsed = parseFloat(val);
    const qty = isNaN(parsed) ? 0 : parsed;

    setInvoiceLines((prev) => {
      const updated = [...prev];
      const target = updated[index];
      const maxAllowed = editingInvoice ? 999999 : target.availableQuantity;
      const finalQty = hasTransactionIssue ? Math.max(0, qty) : Math.min(Math.max(0, qty), maxAllowed);

      const valBeforeVat = Math.round(finalQty * target.unitPrice * 100) / 100;
      const vatAmt = Math.round(valBeforeVat * (target.vatRate || vatRate) * 100) / 100;

      updated[index] = {
        ...target,
        invoicedQuantity: finalQty,
        valueBeforeVat: valBeforeVat,
        totalBeforeVat: valBeforeVat,
        vatAmount: vatAmt,
        valueAfterVat: Math.round((valBeforeVat + vatAmt) * 100) / 100,
        totalAfterVat: Math.round((valBeforeVat + vatAmt) * 100) / 100,
        isSelected: finalQty > 0 || hasTransactionIssue,
      };
      return updated;
    });
  };

  const handleLineCommentChange = (index: number, commentVal: string) => {
    setInvoiceLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        comment: commentVal,
      };
      return updated;
    });
  };

  const handleToggleLineIssue = (index: number) => {
    setInvoiceLines((prev) => {
      const updated = [...prev];
      const cur = updated[index];
      const nextIssue = !cur.hasIssue;
      const issueNote = cur.issueComment || 'Discrepancy';
      updated[index] = {
        ...cur,
        hasIssue: nextIssue,
        issueComment: nextIssue ? issueNote : undefined,
        comment: nextIssue
          ? (cur.comment && cur.comment.toLowerCase() !== 'okay' ? cur.comment : issueNote)
          : (cur.comment && cur.comment !== cur.issueComment ? cur.comment : 'Okay'),
      };
      if (nextIssue) {
        setHasTransactionIssue(true);
        if (!headerComment || headerComment.trim().toLowerCase() === 'okay') {
          setHeaderComment(issueNote);
        }
      }
      return updated;
    });
  };

  const handleLineIssueNoteChange = (index: number, noteVal: string) => {
    setInvoiceLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        issueComment: noteVal,
        comment: noteVal.trim() !== '' ? noteVal : updated[index].comment,
      };
      return updated;
    });
  };

  // Admin add line capability
  const handleAddCustomLine = () => {
    const newLine: InvoiceLineItem = {
      poLineId: `CUSTOM-${Date.now().toString().slice(-4)}`,
      itemDescription: 'Custom Line Item',
      unitOfMeasure: 'PCS',
      poQuantity: 1,
      alreadyInvoicedQuantity: 0,
      availableQuantity: 9999,
      invoicedQuantity: 1,
      unitCost: 0,
      unitPrice: 0,
      valueBeforeVat: 0,
      vatRate: 0.18,
      vatAmount: 0,
      valueAfterVat: 0,
      comment: 'Okay',
      isSelected: true,
      hasIssue: false,
    };
    setInvoiceLines((prev) => [...prev, newLine]);
  };

  const handleRemoveLine = (index: number) => {
    setInvoiceLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Totals calculations
  const invoiceTotals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    let selectedCount = 0;
    let totalItems = 0;

    invoiceLines.forEach((l) => {
      if (l.isSelected) {
        subtotal += l.totalBeforeVat;
        vat += l.vatAmount;
        selectedCount += 1;
        totalItems += l.invoicedQuantity;
      }
    });

    return {
      subtotalBeforeVat: Math.round(subtotal * 100) / 100,
      totalVat: Math.round(vat * 100) / 100,
      totalAfterVat: Math.round((subtotal + vat) * 100) / 100,
      selectedCount,
      totalItemsCount: totalItems,
    };
  }, [invoiceLines]);

  // Save Invoice & Proceed to Next
  const handleSave = async (andPrint: boolean = false) => {
    setErrorMessage(null);

    const isCancelled = isCancelledChecked;
    const isOfr = isOfrChecked;
    const hasAnyLineIssue = invoiceLines.some((l) => l.hasIssue);
    const isCustomIssueComment = Boolean(
      headerComment && !['okay', 'ok', 'active', ''].includes(headerComment.trim().toLowerCase())
    );
    const isExistingUnresolved = Boolean(editingInvoice?.hasIssue && editingInvoice?.issueStatus !== 'RESOLVED');
    
    // Cancelled and OFR are explicitly excluded from the issue screen
    const isFlagged = !isCancelled && !isOfr && (
      hasTransactionIssue ||
      isNoPoChecked ||
      hasAnyLineIssue ||
      isCustomIssueComment ||
      isExistingUnresolved
    );

    if (!isFlagged && !isCancelled && !isOfr && !selectedPoGroup && !editingInvoice && !poSearchInput.trim()) {
      setErrorMessage('Please select or input a PO Number.');
      return;
    }

    if (!invoiceNumber.trim()) {
      setErrorMessage('Please provide a valid Invoice Number.');
      return;
    }

    // Check if updating existing record or creating new
    const existingRecord = editingInvoice || invoices.find(
      (inv) => inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
    );

    if (existingRecord) {
      const isDuplicateOther = invoices.some(
        (inv) => inv.id !== existingRecord.id && inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
      );
      if (isDuplicateOther) {
        setErrorMessage(`Invoice number "${invoiceNumber}" is already in use by another invoice.`);
        return;
      }
    } else {
      const isDuplicate = invoices.some(
        (inv) => inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
      );
      if (isDuplicate) {
        setErrorMessage(`Invoice number "${invoiceNumber}" already exists in the database.`);
        return;
      }
    }

    const selectedLines = invoiceLines.filter((l) => l.isSelected);
    if (selectedLines.length === 0 && !isFlagged && !isCancelled && !isOfr) {
      setErrorMessage('Please select at least one line item to bill.');
      return;
    }

    const finalCustomer =
      selectedPoGroup?.customerName?.trim() ||
      (selectedCustomer !== 'ALL' && selectedCustomer.trim() ? selectedCustomer.trim() : '') ||
      (customerSearchQuery.trim() ? customerSearchQuery.trim() : '') ||
      (existingRecord?.customerName ? existingRecord.customerName : 'General Customer');

    const poNumberToSave =
      poSearchInput.trim() ||
      selectedPoGroup?.poNumber ||
      existingRecord?.poNumber ||
      (isNoPoChecked ? 'NO-PO' : (isCancelledChecked ? 'CANCELLED' : (isOfrChecked ? 'OFR' : 'N/A')));

    const effectiveStatus: 'ACTIVE' | 'CANCELLED' | 'OFR' = isCancelledChecked ? 'CANCELLED' : (isOfrChecked ? 'OFR' : 'ACTIVE');

    const effectiveComment = isFlagged && (!headerComment || headerComment.trim().toLowerCase() === 'okay')
      ? 'Discrepancy'
      : (headerComment.trim() || 'Okay');

    const effectiveIssueComment = isFlagged
      ? (isCustomIssueComment
          ? headerComment.trim()
          : (invoiceLines.find((l) => l.issueComment)?.issueComment || 'Discrepancy flagged on invoice'))
      : undefined;

    // For a brand-new record whose number still matches the auto-suggested value
    // (i.e. the user didn't hand-type a custom one), reserve the real number from
    // the shared MySQL sequence right before persisting. This is a locked,
    // atomic transaction on the server, so two users saving for the same customer
    // at the same moment can never end up with the same invoice number.
    let finalInvoiceNumber = invoiceNumber.trim();
    let reservedServerSide = false;
    if (!existingRecord) {
      const suggested = getNextAvailableCustomerInvoiceNumber(finalCustomer, invoices);
      if (suggested.trim().toLowerCase() === finalInvoiceNumber.toLowerCase()) {
        const allocated = await allocateSeriesNumber('invoice', finalCustomer);
        if (allocated) {
          finalInvoiceNumber = allocated.number;
          reservedServerSide = true;
        }
      }
    }

    const recordToSave: InvoiceRecord = {
      ...(existingRecord || {}),
      id: existingRecord ? existingRecord.id : `INV-REC-${Date.now()}`,
      invoiceNumber: finalInvoiceNumber,
      invoiceDate: invoiceDate,
      poNumber: poNumberToSave,
      customerName: finalCustomer,
      destination: selectedPoGroup?.destination || existingRecord?.destination || 'N/A',
      contract: selectedPoGroup?.contract || existingRecord?.contract || 'N/A',
      poDate: selectedPoGroup?.date || existingRecord?.poDate || invoiceDate,
      lines: (selectedLines.length > 0
        ? selectedLines
        : [
            {
              id: `line-${Date.now()}`,
              poLineId: 'LINE-1',
              itemDescription: isNoPoChecked ? 'No PO details' : (isCancelledChecked ? 'Cancelled' : (isOfrChecked ? 'Out of range (OFR)' : 'General Line')),
              unitOfMeasure: 'LOT',
              poQuantity: 0,
              alreadyInvoicedQuantity: 0,
              availableQuantity: 0,
              invoicedQuantity: 0,
              unitPrice: 0,
              vatRate: 0.18,
              vatAmount: 0,
              totalBeforeVat: 0,
              totalAfterVat: 0,
              comment: effectiveComment,
              isSelected: true,
              hasIssue: isFlagged,
              issueComment: effectiveIssueComment,
            },
          ]
      ).map((l) => {
        const qty = typeof l.invoicedQuantity === 'number' ? l.invoicedQuantity : 0;
        const price = typeof l.unitPrice === 'number' ? l.unitPrice : 0;
        const valBefore = (typeof l.valueBeforeVat === 'number' && l.valueBeforeVat > 0)
          ? l.valueBeforeVat
          : (typeof (l as any).totalBeforeVat === 'number' && (l as any).totalBeforeVat > 0)
            ? (l as any).totalBeforeVat
            : Math.round(qty * price * 100) / 100;
        const vat = (typeof l.vatAmount === 'number' && l.vatAmount > 0)
          ? l.vatAmount
          : Math.round(valBefore * (l.vatRate || 0.18) * 100) / 100;
        const valAfter = (typeof l.valueAfterVat === 'number' && l.valueAfterVat > 0)
          ? l.valueAfterVat
          : (typeof (l as any).totalAfterVat === 'number' && (l as any).totalAfterVat > 0)
            ? (l as any).totalAfterVat
            : Math.round((valBefore + vat) * 100) / 100;

        return {
          ...l,
          unitPrice: price,
          valueBeforeVat: valBefore,
          totalBeforeVat: valBefore,
          vatAmount: vat,
          valueAfterVat: valAfter,
          totalAfterVat: valAfter,
          comment: l.comment || 'Okay',
          hasIssue: isFlagged ? (hasAnyLineIssue ? !!l.hasIssue : true) : !!l.hasIssue,
          issueComment: l.issueComment?.trim() || (isFlagged ? effectiveIssueComment : undefined),
        };
      }),
      subtotalBeforeVat: invoiceTotals.subtotalBeforeVat,
      totalVat: invoiceTotals.totalVat,
      totalAfterVat: invoiceTotals.totalAfterVat,
      paymentStatus: existingRecord?.paymentStatus || 'UNPAID',
      paidAmount: existingRecord?.paidAmount || 0,
      notes: notes.trim(),
      comment: effectiveComment,
      hasIssue: isFlagged,
      issueComment: effectiveIssueComment,
      issueStatus: isFlagged ? (existingRecord?.issueStatus || 'PENDING') : undefined,
      status: effectiveStatus,
      isCancelled: isCancelledChecked,
      cancelReason: isCancelledChecked ? notes.trim() || 'Cancelled' : undefined,
      isOfr: isOfrChecked,
      ofrDetail: isOfrChecked ? (notes.trim() || 'Out of range') : undefined,
      attachments: attachments,
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Administrator',
    };

    onSaveInvoice(recordToSave);
    setSuccessSavedInvoice(recordToSave);

    // Advance customer book series number automatically ONLY IF NEW RECORD.
    // If the server already reserved+advanced the number above, the local
    // counter would double-advance, so only fall back to the local mutation
    // when the server call failed (offline) and the local counter is still
    // the authoritative source.
    if (!existingRecord) {
      if (!reservedServerSide) {
        advanceCustomerSeriesNumber(finalCustomer, 'invoice');
      }
      if (onSeriesConfigChanged) onSeriesConfigChanged();
    }

    // Determine the next invoice number for this same customer (skipping already saved/used numbers)
    const allInvoicesAfterSave = [recordToSave, ...invoices];
    const nextInvoiceNum = getNextAvailableCustomerInvoiceNumber(finalCustomer, allInvoicesAfterSave);

    if (andPrint && onViewInvoicePrint) {
      onViewInvoicePrint(recordToSave);
    }

    // Refresh and go to next invoice number of the same customer:
    // 1. Maintain customer name on the customer name field
    setSelectedCustomer(finalCustomer);
    setCustomerSearchQuery('');

    // 2. Update customer book and set next invoice number for this customer
    syncCustomerBook(finalCustomer, nextInvoiceNum);
    setInvoiceNumber(nextInvoiceNum);

    // 3. Clear PO number, line items, notes, attachments, and flags ready for the customer's next invoice
    setPoSearchInput('');
    setSelectedPoGroup(null);
    setNotes('');
    setHeaderComment('Okay');
    setHasTransactionIssue(false);
    setIsNoPoChecked(false);
    setIsCancelledChecked(false);
    setIsOfrChecked(false);
    setAttachments([]);
    setInvoiceLines([]);
    setErrorMessage(null);

    if (editingInvoice && onCancelEdit) {
      onCancelEdit();
    }
  };

  // Reset form for next invoice
  const handleStartNextInvoice = () => {
    setSuccessSavedInvoice(null);
    setHasTransactionIssue(false);
    setIsNoPoChecked(false);
    setIsCancelledChecked(false);
    setIsOfrChecked(false);
    setPoSearchInput('');
    setSelectedPoGroup(null);
    setNotes('');
    setHeaderComment('Okay');
    setAttachments([]);
    setInvoiceLines([]);
    setErrorMessage(null);
    const cust = selectedCustomer !== 'ALL' && selectedCustomer ? selectedCustomer : (customers[0] || 'General Customer');
    setSelectedCustomer(cust);
    setCustomerSearchQuery('');
    const nextNum = getNextAvailableCustomerInvoiceNumber(cust, invoices);
    setInvoiceNumber(nextNum);
    syncCustomerBook(cust, nextNum);
    if (editingInvoice && onCancelEdit) {
      onCancelEdit();
    }
  };

  // Save changes to Customer Book modal
  const handleSaveCustomerBookSettings = () => {
    const cust = selectedCustomer !== 'ALL' ? selectedCustomer : 'General Customer';
    const existing = getCustomerSeriesBook(cust);
    const updatedBook: CustomerSeriesBook = {
      ...existing,
      customerName: cust,
      invoicePrefix: bookPrefix.trim().toUpperCase(),
      invoiceStartNumber: bookStartNum,
      invoiceEndNumber: bookEndNum,
      invoiceCurrentNumber: bookCurrentNum,
      padding: bookPadding,
      updatedAt: new Date().toISOString(),
    };
    saveOrUpdateCustomerSeriesBook(updatedBook);
    setActiveCustomerBook(updatedBook);
    setInvoiceNumber(formatSeriesNumber(updatedBook.invoicePrefix, bookCurrentNum, bookPadding));
    setIsBookModalOpen(false);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  // Delete customer book series
  const handleDeleteCustomerBook = () => {
    const cust = selectedCustomer !== 'ALL' ? selectedCustomer : (selectedPoGroup?.customerName || '');
    if (!cust) return;
    deleteCustomerSeriesBook(cust);
    setActiveCustomerBook(null);
    const cfg = loadStoredSeriesConfig();
    const defaultInv = formatSeriesNumber(cfg.invoiceSeries.prefix, cfg.invoiceSeries.currentNumber, cfg.invoiceSeries.padding);
    setInvoiceNumber(defaultInv);
    setIsBookModalOpen(false);
    if (onSeriesConfigChanged) onSeriesConfigChanged();
  };

  return (
    <div className="space-y-3">
      {/* Saved Invoice Status Banner */}
      {successSavedInvoice && (
        <div
          id="invoice-save-status-banner"
          className="p-3.5 border rounded-xl text-xs flex items-center justify-between shadow-xs transition-all bg-emerald-50 border-emerald-300 text-emerald-900"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span className="text-emerald-800">✅ Invoice Saved Successfully</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/80 border border-current">
                  {successSavedInvoice.invoiceNumber}
                </span>
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">
                Record saved to database • Ready for delivery tracking and receipt printing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="invoice-print-saved-btn"
              onClick={() => onViewInvoicePrint(successSavedInvoice)}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              id="invoice-dismiss-saved-banner-btn"
              onClick={() => setSuccessSavedInvoice(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error alert */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* COMPACT MAIN FORM CONTAINER (No Commercial Tax Invoice big hero card!) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Editing Invoice Banner */}
        {editingInvoice && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-950">
            <span className="flex items-center gap-2 font-bold">
              <Edit3 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Editing Invoice: <span className="font-mono text-blue-700 text-sm font-extrabold">#{editingInvoice.invoiceNumber}</span> ({editingInvoice.customerName}) — Changes will update this record in-place.
              </span>
            </span>
            {onCancelEdit && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[11px] cursor-pointer shadow-xs"
              >
                Cancel Edit
              </button>
            )}
          </div>
        )}

        {/* ROW 1: Dense Header Inputs (Customer with Search & +, PO Number, Invoice Number + [Customer Book], Date, [add Notes]) */}
        <div className="bg-slate-900 text-white p-3 border-b border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
            
            {/* 1. Customer Selection with Search and + Button */}
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

            {/* 2. PO Number Selection (EMPTY BY DEFAULT!) */}
            <div className="relative" ref={poDropdownRef}>
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
                        <span className="text-[10px] font-mono text-emerald-400">
                          TZS {formatCurrency(po.remainingValueAfterVat)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 3. [add Notes] (Interchanged with Invoice Number position) */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                [add Notes]
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery note ref / remarks..."
                className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 4. Invoice Date */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 5. Invoice Number + [Customer Book] (Interchanged with [add Notes] position) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  Invoice # <span className="text-red-400">*</span>
                </label>
                {/* [Customer Book] button directly right after Invoice Number label */}
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
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. CRU001"
                className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

          </div>
        </div>

        {/* ROW 2: Compact Flags Bar (All aligned in one single line to save space!) */}
        {/* Alignment: Flag invoice, NO po, cancelled, Invoice Status */}
        <div className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
          hasTransactionIssue ? 'bg-rose-50/90 border-rose-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex flex-wrap items-center gap-4">
            {/* 1. Flag invoice */}
            <label className="inline-flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasTransactionIssue}
                onChange={(e) => handleToggleMainIssue(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
              />
              <span className={hasTransactionIssue ? 'text-rose-700 font-extrabold' : 'text-slate-800'}>
                Flag invoice
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

            {/* 5. Invoice Status */}
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Invoice Status:</span>
              <input
                type="text"
                value={headerComment}
                onChange={(e) => setHeaderComment(e.target.value)}
                placeholder="Okay / Cancelled / OFR / No PO"
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800 w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Line selection & actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleToggleSelectAll(true)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Select all line items and allocate available quantities"
            >
              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
              Select All
            </button>
            <button
              type="button"
              onClick={() => handleToggleSelectAll(false)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Unselect all line items"
            >
              <Square className="w-3.5 h-3.5 text-slate-400" />
              Unselect All
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={handleAddCustomLine}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                title="Add custom line item (Admin only)"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
                + Add Line
              </button>
            )}
            <span className="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
              {invoiceTotals.selectedCount} lines selected
            </span>
          </div>
        </div>

        {/* ROW 3: ULTRA-DENSE TABLE FORMAT (No text wrapping, reduced font size & padding for quick review!) */}
        <div className="overflow-x-auto max-h-[520px] scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
            <thead className="bg-slate-900 text-white font-bold uppercase text-[11px] tracking-wider sticky top-0 z-20 shadow-xs">
              <tr>
                {/* Master checkbox before Item Description */}
                <th className="py-1.5 px-2 text-center w-8 sticky top-0 bg-slate-900">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                    title="Select / Unselect All Lines"
                  />
                </th>
                <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Item Description</th>
                <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-900">UOM</th>
                <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-900">PO Qty</th>
                <th className="py-1.5 px-2 text-right text-slate-300 sticky top-0 bg-slate-900">Invoiced</th>
                <th className="py-1.5 px-2 text-right text-amber-300 sticky top-0 bg-slate-900">Available</th>
                <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-900">Bill Qty</th>
                <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Line Comment</th>
                <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-900">Issue?</th>
                <th className="py-1.5 px-2 sticky top-0 bg-slate-900">Line Issue Note</th>
                <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-900">Unit Price (TZS)</th>
                <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-900">VAT (18%)</th>
                <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-900">Total (TZS)</th>
                {isAdmin && <th className="py-1.5 px-1 text-center sticky top-0 bg-slate-900">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoiceLines.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 14 : 13} className="py-8 text-center text-slate-400">
                    <AlertCircle className="w-5 h-5 mx-auto text-slate-300 mb-1" />
                    No line items loaded. Type/select a PO Number above, or check "NO po" / "cancelled", or click "+ Add Line" as Admin.
                  </td>
                </tr>
              ) : (
                invoiceLines.map((line, idx) => {
                  const isDepleted = line.availableQuantity <= 0 && !editingInvoice && !hasTransactionIssue;

                  return (
                    <tr
                      key={line.id || idx}
                      className={`transition-colors ${
                        !line.isSelected
                          ? 'bg-slate-50/50 text-slate-400 opacity-70'
                          : line.hasIssue
                          ? 'bg-rose-50/30 hover:bg-rose-50/60'
                          : 'bg-white hover:bg-blue-50/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-1 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={line.isSelected}
                          onChange={() => handleToggleLine(idx)}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Description */}
                      <td className="py-1 px-2 font-medium text-slate-900">
                        {isAdmin && line.poLineId.startsWith('CUSTOM-') ? (
                          <input
                            type="text"
                            value={line.itemDescription}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInvoiceLines((prev) => {
                                const up = [...prev];
                                up[idx].itemDescription = val;
                                return up;
                              });
                            }}
                            className="px-1.5 py-0.5 border border-slate-300 rounded text-xs w-48 focus:outline-none"
                          />
                        ) : (
                          <span>{line.itemDescription}</span>
                        )}
                      </td>

                      {/* UOM */}
                      <td className="py-1 px-2 text-center text-slate-600 font-mono text-[11px]">
                        {line.unitOfMeasure}
                      </td>

                      {/* PO Total Qty */}
                      <td className="py-1 px-2 text-right font-semibold text-slate-700">
                        {line.poQuantity}
                      </td>

                      {/* Invoiced */}
                      <td className="py-1 px-2 text-right text-slate-500">
                        {line.alreadyInvoicedQuantity}
                      </td>

                      {/* Available */}
                      <td className="py-1 px-2 text-right font-bold text-amber-700">
                        {line.availableQuantity}
                      </td>

                      {/* Bill Qty */}
                      <td className="py-1 px-2 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.invoicedQuantity}
                          onChange={(e) => handleQuantityChange(idx, e.target.value)}
                          disabled={!line.isSelected}
                          className={`w-18 px-1.5 py-0.5 text-center font-bold text-xs rounded border focus:outline-none ${
                            !line.isSelected
                              ? 'bg-slate-100 border-slate-200 text-slate-400'
                              : 'bg-white border-blue-400 text-slate-900 focus:ring-1 focus:ring-blue-500'
                          }`}
                        />
                      </td>

                      {/* Line Comment */}
                      <td className="py-1 px-2">
                        <input
                          type="text"
                          value={
                            (line.hasIssue || hasTransactionIssue || isNoPoChecked) && (!line.comment || line.comment.trim().toLowerCase() === 'okay')
                              ? (line.issueComment || (isNoPoChecked ? 'NO PO' : 'Discrepancy'))
                              : (line.comment || 'Okay')
                          }
                          onChange={(e) => handleLineCommentChange(idx, e.target.value)}
                          disabled={!line.isSelected}
                          className={`w-28 px-1.5 py-0.5 text-xs rounded border focus:outline-none ${
                            line.hasIssue || hasTransactionIssue || isNoPoChecked
                              ? 'border-amber-300 bg-amber-50/70 text-amber-900 font-semibold focus:ring-1 focus:ring-amber-500'
                              : 'border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500'
                          }`}
                        />
                      </td>

                      {/* Issue checkbox */}
                      <td className="py-1 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={line.hasIssue}
                          onChange={() => handleToggleLineIssue(idx)}
                          className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-0 accent-rose-600 cursor-pointer"
                        />
                      </td>

                      {/* Line Issue Note */}
                      <td className="py-1 px-2">
                        {line.hasIssue ? (
                          <input
                            type="text"
                            value={line.issueComment || ''}
                            onChange={(e) => handleLineIssueNoteChange(idx, e.target.value)}
                            placeholder="Issue note..."
                            className="w-32 px-1.5 py-0.5 text-xs rounded border border-rose-300 bg-rose-50 text-rose-900 font-medium placeholder-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No issue</span>
                        )}
                      </td>

                      {/* Unit Price */}
                      <td className="py-1 px-2 text-right font-semibold text-slate-800">
                        {isAdmin && line.poLineId.startsWith('CUSTOM-') ? (
                          <input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => {
                              const p = parseFloat(e.target.value) || 0;
                              setInvoiceLines((prev) => {
                                const up = [...prev];
                                const l = up[idx];
                                l.unitPrice = p;
                                const valBefore = Math.round(l.invoicedQuantity * p * 100) / 100;
                                const vatAmt = Math.round(valBefore * (l.vatRate || vatRate) * 100) / 100;
                                const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;
                                l.valueBeforeVat = valBefore;
                                l.totalBeforeVat = valBefore;
                                l.vatAmount = vatAmt;
                                l.valueAfterVat = valAfter;
                                l.totalAfterVat = valAfter;
                                return up;
                              });
                            }}
                            className="w-20 px-1 py-0.5 text-right border rounded text-xs"
                          />
                        ) : (
                          <span>TZS {formatCurrency(line.unitPrice)}</span>
                        )}
                      </td>

                      {/* VAT */}
                      <td className="py-1 px-2 text-right text-slate-500">
                        TZS {formatCurrency(line.isSelected ? line.vatAmount : 0)}
                      </td>

                      {/* Line Total */}
                      <td className="py-1 px-2 text-right font-bold text-slate-900">
                        TZS {formatCurrency(line.isSelected ? line.totalAfterVat : 0)}
                      </td>

                      {/* Admin remove line with SMS confirmation */}
                      {isAdmin && (
                        <td className="py-1 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => setLinePendingDelete({ line, lineIndex: idx })}
                            className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer rounded hover:bg-red-50 transition-colors"
                            title="Permanently delete line item from database"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Attached Picture / Document Scans Section */}
        <div className="p-3.5 bg-slate-50/70 border-t border-slate-200">
          <ImageAttachmentManager
            attachments={attachments}
            onChange={setAttachments}
            currentUser={currentUser}
            title="Invoice Physical Scans & Pictures"
            description="Attach photo or scan of the physical tax invoice, customer stamped copy, or gate pass (PNG, JPG, WEBP)."
          />
        </div>

        {/* ROW 4: Compact Summary & Bottom Save/Print Controls */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              Customer: <strong className="text-slate-900">{selectedCustomer !== 'ALL' ? selectedCustomer : 'All'}</strong>
            </span>
            <span>
              Subtotal: <strong className="text-slate-900">TZS {formatCurrency(invoiceTotals.subtotalBeforeVat)}</strong>
            </span>
            <span>
              VAT (18%): <strong className="text-slate-900">TZS {formatCurrency(invoiceTotals.totalVat)}</strong>
            </span>
            <span className="text-sm font-bold text-emerald-700 font-mono">
              Grand Total: TZS {formatCurrency(invoiceTotals.totalAfterVat)}
            </span>
          </div>

          {/* Bottom Action Buttons: Download Template, Reset Form, Save Invoice */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={generateSampleInvoiceExcelTemplate}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="Download Excel template to upload invoices into system"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Download Template
            </button>

            {editingInvoice && onCancelEdit && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                title="Cancel editing without saving"
              >
                Cancel Edit
              </button>
            )}

            <button
              type="button"
              onClick={handleStartNextInvoice}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              title="Clear PO and reset for next invoice"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Form
            </button>

            <button
              type="button"
              id="invoice-save-action-btn"
              onClick={() => handleSave(false)}
              className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {editingInvoice ? 'Save Invoice (Update)' : 'Save Invoice'}
            </button>
          </div>
        </div>
      </div>

      {/* Customer Book Configuration Modal */}
      {isBookModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>Customer Book Series Settings</span>
              </div>
              <button
                type="button"
                onClick={() => setIsBookModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Configure serial series for <strong>{selectedCustomer !== 'ALL' ? selectedCustomer : 'General'}</strong>:
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Prefix</label>
                <input
                  type="text"
                  value={bookPrefix}
                  onChange={(e) => setBookPrefix(e.target.value)}
                  className="w-full px-2.5 py-1.5 border rounded-lg uppercase font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Padding Digits</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={bookPadding}
                  onChange={(e) => setBookPadding(parseInt(e.target.value) || 3)}
                  className="w-full px-2.5 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Start #</label>
                <input
                  type="number"
                  value={bookStartNum}
                  onChange={(e) => setBookStartNum(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">End #</label>
                <input
                  type="number"
                  value={bookEndNum}
                  onChange={(e) => setBookEndNum(parseInt(e.target.value) || 200)}
                  className="w-full px-2.5 py-1.5 border rounded-lg"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Current Number</label>
                <input
                  type="number"
                  value={bookCurrentNum}
                  onChange={(e) => setBookCurrentNum(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 border rounded-lg font-mono font-bold text-blue-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              {activeCustomerBook ? (
                <button
                  type="button"
                  onClick={handleDeleteCustomerBook}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
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
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomerBookSettings}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
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
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Add Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Confirmation Modal for Admin Deleting Items Line */}
      <SmsConfirmationModal
        isOpen={!!linePendingDelete}
        onClose={() => setLinePendingDelete(null)}
        onConfirm={handleConfirmDeleteLine}
        title="Permanently Delete Line Item from Invoice"
        itemName={linePendingDelete?.line.itemDescription || ''}
        quantity={linePendingDelete?.line.invoicedQuantity}
        unitPrice={linePendingDelete?.line.unitPrice}
        totalAmount={linePendingDelete?.line.valueAfterVat}
        referenceNumber={invoiceNumber}
        customerName={selectedCustomer !== 'ALL' ? selectedCustomer : undefined}
        warningNote="⚠️ This action will permanently remove this item line from this invoice and recalculate totals."
      />
    </div>
  );
};
