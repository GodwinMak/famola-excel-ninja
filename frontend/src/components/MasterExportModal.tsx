import React, { useState } from 'react';
import { 
  POLineItem, 
  InvoiceRecord, 
  DeliveryNoteRecord, 
  PaymentRecord, 
  AppUser,
  SeriesSettings,
  DocumentIssueRecord
} from '../types';
import { 
  exportMasterExcelWorkbook, 
  downloadCsv, 
  exportFullSystemBackup 
} from '../utils/backupExportService';
import { loadStoredInvitations } from '../utils/authService';
import { loadStoredSeriesConfig, loadStoredIssues } from '../utils/storage';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Layers, 
  CheckCircle2, 
  X, 
  ShieldCheck, 
  Table, 
  Archive,
  Printer,
  Code2
} from 'lucide-react';

interface MasterExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  poLines: POLineItem[];
  invoices: InvoiceRecord[];
  deliveryNotes: DeliveryNoteRecord[];
  payments: PaymentRecord[];
  users: AppUser[];
  issues?: DocumentIssueRecord[];
  seriesConfig?: SeriesSettings;
}

export const MasterExportModal: React.FC<MasterExportModalProps> = ({
  isOpen,
  onClose,
  poLines,
  invoices,
  deliveryNotes,
  payments,
  users,
  issues,
  seriesConfig,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  if (!isOpen) return null;

  const currentSeries = seriesConfig || loadStoredSeriesConfig();
  const currentInvitations = loadStoredInvitations();
  const currentIssues = issues || loadStoredIssues();

  const handleExcelExport = () => {
    exportMasterExcelWorkbook(poLines, invoices, deliveryNotes, payments, users, currentIssues);
    setDownloadSuccess('Master Excel Multi-Sheet Workbook exported successfully!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleJsonExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      appName: 'FAMOLA Excel Ninja',
      poLines,
      invoices,
      deliveryNotes,
      payments,
      issues: currentIssues,
      users,
      seriesConfig: currentSeries,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FAMOLA_Master_Dataset_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setDownloadSuccess('Master JSON Dataset exported successfully!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleFullBackupExport = () => {
    exportFullSystemBackup({
      poLines,
      invoices,
      deliveryNotes,
      payments,
      issues: currentIssues,
      seriesConfig: currentSeries,
      users,
      emailInvitations: currentInvitations,
    });
    setDownloadSuccess('Full System Disaster Recovery Backup (.ninjabackup) exported!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleDownloadSourceZip = () => {
    setIsZipping(true);
    const link = document.createElement('a');
    link.href = '/api/download-zip';
    link.setAttribute('download', 'famola-erp-source-code.zip');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsZipping(false);
      setDownloadSuccess('Full Project Source Code (.zip) download initiated!');
      setTimeout(() => setDownloadSuccess(null), 4000);
    }, 1500);
  };

  const handleDownloadCsv = (type: 'po' | 'invoices' | 'deliveries' | 'payments') => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (type === 'po') {
      downloadCsv(poLines, `FAMOLA_PO_Lines_${dateStr}.csv`);
    } else if (type === 'invoices') {
      downloadCsv(
        invoices.map((i) => ({
          invoiceNumber: i.invoiceNumber,
          date: i.invoiceDate,
          poNumber: i.poNumber,
          customer: i.customerName,
          amount: i.totalAfterVat,
          paid: i.paidAmount || 0,
          status: i.paymentStatus || 'UNPAID',
        })),
        `FAMOLA_Invoices_${dateStr}.csv`
      );
    } else if (type === 'deliveries') {
      downloadCsv(
        deliveryNotes.map((d) => ({
          deliveryNoteNumber: d.deliveryNoteNumber,
          date: d.deliveryDate,
          poNumber: d.poNumber,
          customer: d.customerName,
          carrier: d.carrier,
          totalQty: d.totalDeliveredQuantity,
          totalValue: d.totalDeliveredValue,
        })),
        `FAMOLA_Delivery_Notes_${dateStr}.csv`
      );
    } else if (type === 'payments') {
      downloadCsv(
        payments.map((p) => ({
          paymentNumber: p.paymentNumber,
          date: p.paymentDate,
          customer: p.customerName,
          amount: p.amountPaid,
          method: p.paymentMethod,
          ref: p.referenceNumber,
        })),
        `FAMOLA_Payments_${dateStr}.csv`
      );
    }
    setDownloadSuccess(`CSV file exported successfully!`);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Export All Details & Data Suites</h2>
              <p className="text-xs text-slate-400">
                Generate master multi-sheet workbooks, full system backups, or CSV exports
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{downloadSuccess}</span>
            </div>
          )}

          {/* Master Summary Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">PO Lines</span>
              <span className="text-sm font-bold text-slate-900">{poLines.length}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Invoices</span>
              <span className="text-sm font-bold text-slate-900">{invoices.length}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Delivery Notes</span>
              <span className="text-sm font-bold text-slate-900">{deliveryNotes.length}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Payments</span>
              <span className="text-sm font-bold text-slate-900">{payments.length}</span>
            </div>
          </div>

          {/* Option 1: Master Multi-Tab Excel Workbook */}
          <div className="border border-slate-200 rounded-xl p-4 hover:border-blue-400 transition-all bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Master Multi-Tab Excel Workbook (.xlsx)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Includes all 9 individual worksheet tabs: PO Lines, Invoices Summary, Line Items Breakdown, Delivery Notes, Delivery Items, Payments Ledger, Allocations, 3-Way Matching Matrix & Users.
                  </p>
                </div>
              </div>
              <button
                onClick={handleExcelExport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Option 2: Full System Disaster Recovery Backup */}
          <div className="border border-slate-200 rounded-xl p-4 hover:border-indigo-400 transition-all bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Full System & Flow Backup (.ninjabackup)</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Disaster Recovery
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Packages 100% of data, active number series (1-600), counters, user accounts, email access tokens, and system flow schemas for complete disaster restoration.
                  </p>
                </div>
              </div>
              <button
                onClick={handleFullBackupExport}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                <Archive className="w-3.5 h-3.5" />
                Download Backup
              </button>
            </div>
          </div>

          {/* Option 3: Raw JSON Package */}
          <div className="border border-slate-200 rounded-xl p-4 hover:border-slate-400 transition-all bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Unified JSON Dataset (.json)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Standard raw JSON payload formatted for external API consumption, integrations, or custom script processing.
                  </p>
                </div>
              </div>
              <button
                onClick={handleJsonExport}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
            </div>
          </div>

          {/* Option 4: Full System Source Code (.zip) */}
          <div className="border border-slate-200 rounded-xl p-4 hover:border-emerald-400 transition-all bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Complete System Source Code (.zip)</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Developer Export
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Download the entire frontend & backend project repository, components, API server, database configs, and scripts packaged into a clean, ready-to-run ZIP archive.
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownloadSourceZip}
                disabled={isZipping}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {isZipping ? 'Packaging ZIP...' : 'Download Code (.zip)'}
              </button>
            </div>
          </div>

          {/* Option 5: Individual CSV Files */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-bold uppercase text-slate-600 mb-2 flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5 text-slate-500" />
              Download Individual CSV Tables
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                onClick={() => handleDownloadCsv('po')}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium text-center transition-colors cursor-pointer"
              >
                PO Lines CSV
              </button>
              <button
                onClick={() => handleDownloadCsv('invoices')}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium text-center transition-colors cursor-pointer"
              >
                Invoices CSV
              </button>
              <button
                onClick={() => handleDownloadCsv('deliveries')}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium text-center transition-colors cursor-pointer"
              >
                Delivery Notes CSV
              </button>
              <button
                onClick={() => handleDownloadCsv('payments')}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium text-center transition-colors cursor-pointer"
              >
                Payments CSV
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
