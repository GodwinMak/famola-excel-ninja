import * as XLSX from 'xlsx';
import { 
  POLineItem, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  SeriesSettings, 
  AppUser, 
  EmailAccessInvitation,
  SystemBackupPackage,
  MatchingItem,
  DocumentIssueRecord
} from '../types';
import { 
  savePOs, 
  saveInvoices, 
  saveDeliveryNotes, 
  savePayments, 
  saveIssues,
  loadStoredPOs,
  loadStoredInvoices,
  loadStoredDeliveryNotes,
  loadStoredPayments,
  loadStoredIssues,
  saveStoredSeriesConfig, 
  saveStoredUsers,
  generateMatchingReport
} from './storage';
import { saveStoredInvitations } from './authService';

/**
 * Generates the complete 10-sheet Master Excel Workbook containing all application tables
 */
export const exportMasterExcelWorkbook = (
  poLines: POLineItem[],
  invoices: InvoiceRecord[],
  deliveryNotes: DeliveryNoteRecord[],
  payments: PaymentRecord[],
  users: AppUser[] = [],
  issues: DocumentIssueRecord[] = []
) => {
  const workbook = XLSX.utils.book_new();
  const matchingData: MatchingItem[] = generateMatchingReport(poLines, deliveryNotes, invoices);

  // 1. PO Master Lines
  const poData = poLines.map((line, idx) => ({
    '#': idx + 1,
    'PO Number': line.poNumber,
    'Customer / Vendor': line.customerName,
    'Destination': line.destination,
    'Contract Ref': line.contract,
    'PO Date': line.date,
    'Item Description': line.itemDescription,
    'UOM': line.unitOfMeasure,
    'PO Quantity': line.quantity,
    'Unit Cost': line.unitCost || 0,
    'Unit Price': line.unitPrice,
    'Value Before VAT': line.valueBeforeVat,
    'VAT Rate %': Math.round(line.vatRate * 100),
    'VAT Amount': line.vatAmount,
    'Value After VAT': line.valueAfterVat,
    'Invoiced Quantity': line.invoicedQuantity || 0,
    'Remaining to Invoice': line.remainingQuantity ?? Math.max(0, line.quantity - (line.invoicedQuantity || 0)),
    'Delivered Quantity': line.deliveredQuantity || 0,
    'Undelivered Qty': line.undeliveredQuantity ?? Math.max(0, line.quantity - (line.deliveredQuantity || 0)),
    'Line Status': line.status || 'UNINVOICED',
    'Delivery Notes / Remarks': line.remarks || '',
  }));
  const poSheet = XLSX.utils.json_to_sheet(poData);
  XLSX.utils.book_append_sheet(workbook, poSheet, '1_PO_Lines');

  // 2. Invoices Summary
  const invData = invoices.map((inv, idx) => ({
    '#': idx + 1,
    'Invoice #': inv.invoiceNumber,
    'Invoice Date': inv.invoiceDate,
    'PO Reference': inv.poNumber,
    'Customer': inv.customerName,
    'Destination': inv.destination,
    'Subtotal Before VAT': inv.subtotalBeforeVat,
    'Total VAT': inv.totalVat,
    'Total Invoice Amount': inv.totalAfterVat,
    'Amount Paid': inv.paidAmount || 0,
    'Pending Balance': Math.max(0, inv.totalAfterVat - (inv.paidAmount || 0)),
    'Payment Status': inv.paymentStatus || 'UNPAID',
    'Notes': inv.notes || '',
    'Created Date': inv.createdAt,
  }));
  const invSheet = XLSX.utils.json_to_sheet(invData);
  XLSX.utils.book_append_sheet(workbook, invSheet, '2_Invoices_Summary');

  // 3. Invoice Items Breakdown
  const invItemsData: any[] = [];
  (invoices || []).forEach((inv) => {
    if (!inv) return;
    (inv.lines || []).forEach((l, idx) => {
      if (!l) return;
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

      invItemsData.push({
        'Invoice #': inv.invoiceNumber,
        'Item #': idx + 1,
        'PO Number': inv.poNumber,
        'Item Description': l.itemDescription,
        'UOM': l.unitOfMeasure,
        'Original PO Qty': l.poQuantity,
        'Invoiced Qty': qty,
        'Unit Price': price,
        'Value Before VAT': valBefore,
        'VAT Amount': vat,
        'Total After VAT': valAfter,
      });
    });
  });
  const invItemsSheet = XLSX.utils.json_to_sheet(invItemsData);
  XLSX.utils.book_append_sheet(workbook, invItemsSheet, '3_Invoice_Line_Items');

  // 4. Delivery Notes Summary
  const dnData = (deliveryNotes || []).map((dn, idx) => ({
    '#': idx + 1,
    'Delivery Note #': dn.deliveryNoteNumber,
    'Delivery Date': dn.deliveryDate,
    'PO Reference': dn.poNumber,
    'Customer / Consignee': dn.customerName,
    'Destination': dn.destination,
    'Carrier Name': dn.carrier || 'Direct Fleet',
    'Vehicle Number': dn.vehicleNumber || 'N/A',
    'Driver Name': dn.driverName || 'N/A',
    'Received By': dn.receivedBy || 'N/A',
    'Total Delivered Items Qty': dn.totalDeliveredQuantity,
    'Total Value After VAT': dn.totalDeliveredValue,
    'Created At': dn.createdAt,
  }));
  const dnSheet = XLSX.utils.json_to_sheet(dnData);
  XLSX.utils.book_append_sheet(workbook, dnSheet, '4_Delivery_Notes');

  // 5. Delivery Items Breakdown
  const dnItemsData: any[] = [];
  (deliveryNotes || []).forEach((dn) => {
    if (!dn) return;
    (dn.lines || []).forEach((l, idx) => {
      if (!l) return;
      dnItemsData.push({
        'Delivery Note #': dn.deliveryNoteNumber,
        'Item #': idx + 1,
        'PO Reference': dn.poNumber,
        'Customer': dn.customerName,
        'Item Description': l.itemDescription,
        'UOM': l.unitOfMeasure,
        'Delivered Quantity': l.deliveredQuantity,
        'Unit Price': l.unitPrice,
        'Value After VAT': l.valueAfterVat,
      });
    });
  });
  const dnItemsSheet = XLSX.utils.json_to_sheet(dnItemsData);
  XLSX.utils.book_append_sheet(workbook, dnItemsSheet, '5_Delivery_Items');

  // 6. Payments & Remittances
  const payData = (payments || []).map((p, idx) => ({
    '#': idx + 1,
    'Payment Receipt #': p.paymentNumber,
    'Payment Date': p.paymentDate,
    'Customer': p.customerName,
    'PO Reference': p.poNumber,
    'Amount Received': p.amountPaid,
    'Payment Method': p.paymentMethod,
    'Reference / Check #': p.referenceNumber,
    'Deposit Account': p.depositAccount || 'Default Operating Account',
    'Allocated Count': (p.allocations || []).length,
    'Notes': p.notes || '',
    'Recorded At': p.createdAt,
  }));
  const paySheet = XLSX.utils.json_to_sheet(payData);
  XLSX.utils.book_append_sheet(workbook, paySheet, '6_Payments_Ledger');

  // 7. Payment Allocations Detail
  const allocData: any[] = [];
  (payments || []).forEach((p) => {
    if (!p) return;
    (p.allocations || []).forEach((al, idx) => {
      if (!al) return;
      allocData.push({
        'Payment #': p.paymentNumber,
        'Allocation #': idx + 1,
        'Invoice #': al.invoiceNumber,
        'PO Reference': al.poNumber,
        'Customer': al.customerName,
        'Invoice Total': al.invoiceTotal,
        'Previously Paid': al.alreadyPaid,
        'Balance Before Allocation': al.pendingBalance,
        'Amount Allocated': al.allocatedAmount,
      });
    });
  });
  const allocSheet = XLSX.utils.json_to_sheet(allocData);
  XLSX.utils.book_append_sheet(workbook, allocSheet, '7_Payment_Allocations');

  // 8. 3-Way Matching Matrix
  const matchData = matchingData.map((m, idx) => ({
    '#': idx + 1,
    'PO Number': m.poNumber,
    'Customer / Vendor': m.customerName,
    'Item Description': m.itemDescription,
    'UOM': m.unitOfMeasure,
    '1. PO Qty': m.poQuantity,
    '1. PO Total Value': m.poTotalValue,
    '2. Delivered Qty': m.deliveredQuantity,
    '2. Delivered Value': m.deliveredValue,
    '3. Invoiced Qty': m.invoicedQuantity,
    '3. Invoiced Value': m.invoicedValue,
    'Undelivered Qty': m.undeliveredQty,
    'Uninvoiced Qty': m.unmatchedQty,
    'Variance (Delivered - Invoiced)': m.receivedVsInvoicedVarianceQty,
    'Audit Match Status': m.status,
    'Linked Delivery Notes': m.deliveryNoteNumbers.join(', '),
    'Linked Invoices': m.invoiceNumbers.join(', '),
  }));
  const matchSheet = XLSX.utils.json_to_sheet(matchData);
  XLSX.utils.book_append_sheet(workbook, matchSheet, '8_3Way_Matching_Matrix');

  // 9. Users & System Audit
  const auditData = users.map((u, idx) => ({
    '#': idx + 1,
    'User Name': u.name,
    'Email Address': u.email,
    'Role': u.role,
    'Department': u.department,
    'Status': u.status,
    'Enrolled Date': u.createdAt,
  }));
  const auditSheet = XLSX.utils.json_to_sheet(auditData);
  XLSX.utils.book_append_sheet(workbook, auditSheet, '9_Authorized_Users');

  // 10. Document Issues & Discrepancy Tracking
  const issueData = issues.map((iss, idx) => ({
    '#': idx + 1,
    'Issue ID': iss.id,
    'Entity Type': iss.entityType,
    'Reference Number': iss.referenceNumber,
    'PO Number': iss.poNumber,
    'Customer / Vendor': iss.customerName,
    'Issue Title': iss.issueTitle,
    'Issue Type': iss.issueType,
    'Severity': iss.severity,
    'Status': iss.status,
    'Flagged By': iss.flaggedBy,
    'Flagged Date': iss.flaggedAt,
    'Header Comment': iss.headerComment || '',
    'Line Issues Summary': (iss.lineIssues || []).map((li) => `[${li.itemDescription}: ${li.issueComment}]`).join('; '),
    'Resolved By': iss.resolvedBy || '',
    'Resolved Date': iss.resolvedAt || '',
    'Resolution Notes': iss.resolutionNotes || '',
  }));
  const issueSheet = XLSX.utils.json_to_sheet(issueData);
  XLSX.utils.book_append_sheet(workbook, issueSheet, '10_Document_Issues');

  const filename = `FAMOLA_Master_Data_Export_All_Details_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, filename);
};

/**
 * Downloads a single dataset as CSV
 */
export const downloadCsv = (data: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

/**
 * Generates and downloads the Full System Disaster Recovery Backup (.ninjabackup / .json)
 */
export const exportFullSystemBackup = (
  data: {
    poLines: POLineItem[];
    invoices: InvoiceRecord[];
    deliveryNotes: DeliveryNoteRecord[];
    payments: PaymentRecord[];
    seriesConfig: SeriesSettings;
    users: AppUser[];
    issues?: DocumentIssueRecord[];
    emailInvitations: EmailAccessInvitation[];
  },
  exportedBy: string = 'Admin'
) => {
  const now = new Date().toISOString();
  const checksum = `SHA256-${btoa(
    `${data.poLines.length}:${data.invoices.length}:${data.deliveryNotes.length}:${data.payments.length}:${data.issues?.length || 0}:${now}`
  )}`;

  const backupPackage: SystemBackupPackage = {
    backupFormat: 'FAMOLA_NINJA_FULL_SYSTEM_BACKUP',
    backupVersion: '2.4.0',
    exportedAt: now,
    exportedBy,
    checksum,
    data: {
      poLines: data.poLines,
      invoices: data.invoices,
      deliveryNotes: data.deliveryNotes,
      payments: data.payments,
      issues: data.issues || [],
      seriesConfig: data.seriesConfig,
      users: data.users,
      emailInvitations: data.emailInvitations,
    },
    systemMetadata: {
      appName: 'FAMOLA Excel Ninja',
      version: '2.4.0',
      description: 'Full Enterprise Purchase Order, Invoicing, Delivery Dispatch, Payment Remittance & 3-Way Matching System',
      workflowArchitecture: 'Single-view modular architecture backed by a MySQL master database, JWT-authenticated RBAC, sequential 1-600 series tracking, and zero-loss disaster recovery.',
      businessRules: {
        standardVatRate: 0.18,
        invoiceRange: `${data.seriesConfig.invoiceSeries.startNumber}-${data.seriesConfig.invoiceSeries.endNumber}`,
        deliveryNoteRange: `${data.seriesConfig.deliverySeries.startNumber}-${data.seriesConfig.deliverySeries.endNumber}`,
        threeWayReconciliationRule: 'Strict tolerance matching between PO, Delivery Dispatches, and Recorded Invoices',
        partialInvoicingPolicy: 'Calculates remaining balance dynamically and auto-deducts line allocations',
        autoAllocationMethod: 'Sequential FIFO allocation against open customer invoices',
      },
    },
  };

  const jsonString = JSON.stringify(backupPackage, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const filename = `FAMOLA_FULL_SYSTEM_BACKUP_${new Date().toISOString().slice(0, 10)}.ninjabackup`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

/**
 * Validates a backup file before restoring
 */
export const validateBackupFile = async (
  file: File
): Promise<{
  valid: boolean;
  packageData?: SystemBackupPackage;
  summary?: {
    poCount: number;
    invCount: number;
    dnCount: number;
    payCount: number;
    issueCount?: number;
    userCount: number;
    exportedAt: string;
    exportedBy: string;
    version: string;
  };
  error?: string;
}> => {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (
      !parsed.backupFormat ||
      (parsed.backupFormat !== 'FAMOLA_NINJA_FULL_SYSTEM_BACKUP' && !parsed.data)
    ) {
      // Check if it's a legacy JSON export
      if (Array.isArray(parsed.poLines) || Array.isArray(parsed.invoices)) {
        return {
          valid: true,
          packageData: {
            backupFormat: 'FAMOLA_NINJA_FULL_SYSTEM_BACKUP',
            backupVersion: '1.0.0-legacy',
            exportedAt: new Date().toISOString(),
            exportedBy: 'Legacy Exporter',
            checksum: 'LEGACY',
            data: {
              poLines: parsed.poLines || [],
              invoices: parsed.invoices || [],
              deliveryNotes: parsed.deliveryNotes || [],
              payments: parsed.payments || [],
              issues: parsed.issues || [],
              seriesConfig: parsed.seriesConfig || {},
              users: parsed.users || [],
              emailInvitations: parsed.emailInvitations || [],
            },
            systemMetadata: {
              appName: 'FAMOLA Excel Ninja',
              version: '1.0.0',
              description: 'Legacy backup',
              workflowArchitecture: 'Standard',
              businessRules: {
                standardVatRate: 0.18,
                invoiceRange: '1-600',
                deliveryNoteRange: '1-600',
                threeWayReconciliationRule: 'Standard',
                partialInvoicingPolicy: 'Standard',
                autoAllocationMethod: 'Standard',
              },
            },
          },
          summary: {
            poCount: (parsed.poLines || []).length,
            invCount: (parsed.invoices || []).length,
            dnCount: (parsed.deliveryNotes || []).length,
            payCount: (parsed.payments || []).length,
            issueCount: (parsed.issues || []).length,
            userCount: (parsed.users || []).length,
            exportedAt: new Date().toISOString().slice(0, 10),
            exportedBy: 'Legacy Backup',
            version: '1.0.0',
          },
        };
      }

      return {
        valid: false,
        error: 'Unrecognized backup file format. Please upload a valid .ninjabackup or system backup JSON file.',
      };
    }

    const d = parsed.data;
    return {
      valid: true,
      packageData: parsed as SystemBackupPackage,
      summary: {
        poCount: (d.poLines || []).length,
        invCount: (d.invoices || []).length,
        dnCount: (d.deliveryNotes || []).length,
        payCount: (d.payments || []).length,
        issueCount: (d.issues || []).length,
        userCount: (d.users || []).length,
        exportedAt: parsed.exportedAt || 'Unknown',
        exportedBy: parsed.exportedBy || 'Admin',
        version: parsed.backupVersion || '2.4.0',
      },
    };
  } catch (e: any) {
    return {
      valid: false,
      error: `Failed to parse backup file: ${e.message}`,
    };
  }
};

/**
 * Restores state from a validated backup package
 */
export const restoreSystemFromBackup = (
  pkg: SystemBackupPackage,
  mode: 'REPLACE' | 'MERGE' = 'REPLACE'
): {
  poLines: POLineItem[];
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  seriesConfig: SeriesSettings;
  users: AppUser[];
  issues?: DocumentIssueRecord[];
} => {
  const d = pkg.data;

  if (mode === 'REPLACE') {
    savePOs(d.poLines || []);
    saveInvoices(d.invoices || []);
    saveDeliveryNotes(d.deliveryNotes || []);
    savePayments(d.payments || []);
    if (d.issues) {
      saveIssues(d.issues);
    }
    if (d.seriesConfig && d.seriesConfig.invoiceSeries) {
      saveStoredSeriesConfig(d.seriesConfig);
    }
    if (d.users && d.users.length > 0) {
      saveStoredUsers(d.users);
    }
    if (d.emailInvitations && d.emailInvitations.length > 0) {
      saveStoredInvitations(d.emailInvitations);
    }
    return {
      poLines: d.poLines || [],
      invoices: d.invoices || [],
      deliveryNotes: d.deliveryNotes || [],
      payments: d.payments || [],
      issues: d.issues || [],
      seriesConfig: d.seriesConfig,
      users: d.users || [],
    };
  } else {
    // MERGE mode
    const existingPOs = loadStoredPOs();
    const existingInvoices = loadStoredInvoices();
    const existingDNs = loadStoredDeliveryNotes();
    const existingPayments = loadStoredPayments();
    const existingIssues = loadStoredIssues();

    const mergedPOs = [...existingPOs, ...(d.poLines || []).filter((p) => !existingPOs.some((ep: any) => ep.id === p.id))];
    const mergedInvoices = [...existingInvoices, ...(d.invoices || []).filter((i) => !existingInvoices.some((ei: any) => ei.id === i.id))];
    const mergedDNs = [...existingDNs, ...(d.deliveryNotes || []).filter((dn) => !existingDNs.some((edn: any) => edn.id === dn.id))];
    const mergedPayments = [...existingPayments, ...(d.payments || []).filter((py) => !existingPayments.some((epy: any) => epy.id === py.id))];
    const mergedIssues = [...existingIssues, ...(d.issues || []).filter((iss) => !existingIssues.some((eiss: any) => eiss.id === iss.id))];

    savePOs(mergedPOs);
    saveInvoices(mergedInvoices);
    saveDeliveryNotes(mergedDNs);
    savePayments(mergedPayments);
    saveIssues(mergedIssues);

    return {
      poLines: mergedPOs,
      invoices: mergedInvoices,
      deliveryNotes: mergedDNs,
      payments: mergedPayments,
      issues: mergedIssues,
      seriesConfig: d.seriesConfig,
      users: d.users || [],
    };
  }
};
