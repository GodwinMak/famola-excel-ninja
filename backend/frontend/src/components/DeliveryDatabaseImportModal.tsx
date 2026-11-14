import React, { useState, useRef } from 'react';
import { DeliveryNoteRecord } from '../types';
import {
  generateSampleDeliveryNoteExcelTemplate,
  readExcelHeadersAndSample,
  parseExcelDeliveryNoteData
} from '../utils/excelParser';
import { formatCurrency } from '../utils/storage';
import { exportTableToExcel, exportTableToPdf } from '../utils/tableExport';
import { TableExportToolbar } from './TableExportToolbar';
import {
  FileSpreadsheet,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Table,
  RefreshCw,
  Layers,
  Database,
  Eye,
  Settings2
} from 'lucide-react';

interface DeliveryDatabaseImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDeliveryNotes?: (deliveryNotes: DeliveryNoteRecord[], mode: 'APPEND' | 'REPLACE' | 'append' | 'replace') => void;
  onImport?: (deliveryNotes: DeliveryNoteRecord[], mode: 'APPEND' | 'REPLACE' | 'append' | 'replace') => void;
  existingDeliveryNotes?: DeliveryNoteRecord[];
}

export const DeliveryDatabaseImportModal: React.FC<DeliveryDatabaseImportModalProps> = ({
  isOpen,
  onClose,
  onImportDeliveryNotes,
  onImport,
  existingDeliveryNotes = [],
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [previewRawRows, setPreviewRawRows] = useState<any[]>([]);

  // Column Mappings
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    deliveryNoteNumber: '',
    deliveryDate: '',
    poNumber: '',
    customerName: '',
    itemDescription: '',
    deliveredQuantity: '',
    unitPrice: '',
    valueBeforeVat: '',
    totalAfterVat: '',
    comment: '',
  });

  // Parsed Result
  const [parsedDeliveryNotes, setParsedDeliveryNotes] = useState<DeliveryNoteRecord[]>([]);
  const [totalRowsCount, setTotalRowsCount] = useState<number>(0);
  const [importMode, setImportMode] = useState<'APPEND' | 'REPLACE'>('APPEND');
  const [step, setStep] = useState<'UPLOAD' | 'MAP' | 'PREVIEW'>('UPLOAD');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    generateSampleDeliveryNoteExcelTemplate();
  };

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) return;
    setError(null);
    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const { headers, previewRows } = await readExcelHeadersAndSample(selectedFile);
      setFileHeaders(headers);
      setPreviewRawRows(previewRows);

      // Auto-detect best column matches
      const initialMap: Record<string, string> = {};
      const findBestHeader = (candidates: string[]): string => {
        for (const candidate of candidates) {
          const found = headers.find((h) =>
            h.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
          );
          if (found) return found;
        }
        for (const candidate of candidates) {
          const found = headers.find((h) =>
            h.trim().toLowerCase().includes(candidate.toLowerCase())
          );
          if (found) return found;
        }
        return '';
      };

      initialMap.deliveryNoteNumber = findBestHeader(['DELIVERY NOTE NUMBER', 'DELIVERY NOTE NO', 'DN NUMBER', 'DN #', 'DN NO']);
      initialMap.deliveryDate = findBestHeader(['DELIVERY DATE', 'DN DATE', 'DATE', 'ISSUE DATE']);
      initialMap.poNumber = findBestHeader(['PURCHASE ORDER NUMBER', 'PO NUMBER', 'PO #', 'PO NO', 'PURCHASE ORDER', 'LPO NO']);
      initialMap.customerName = findBestHeader(['CUSTOMER NAME', 'CUSTOMER', 'CLIENT', 'CLIENT NAME', 'BUYER']);
      initialMap.itemDescription = findBestHeader(['ITEM DESCRIPTION', 'DESCRIPTION', 'ITEM', 'PRODUCT']);
      initialMap.deliveredQuantity = findBestHeader(['DELIVERED QUANTITY', 'DELIVERED QTY', 'QTY DELIVERED', 'QUANTITY', 'QTY']);
      initialMap.unitPrice = findBestHeader(['UNIT PRICE', 'PRICE', 'RATE', 'SELLING PRICE']);
      initialMap.valueBeforeVat = findBestHeader(['LINE VALUE BEFORE VAT', 'VALUE BEFORE VAT', 'SUBTOTAL', 'AMOUNT']);
      initialMap.totalAfterVat = findBestHeader(['LINE VALUE AFTER VAT', 'VALUE AFTER VAT', 'TOTAL AFTER VAT', 'TOTAL']);
      initialMap.comment = findBestHeader([
        'NOTES',
        'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)',
        'DELIVERY NOTES / GENERAL REMARKS',
        'GENERAL REMARKS',
        'COMMENT',
        'LINE COMMENT',
        'REMARKS',
        'STATUS',
      ]);

      setColumnMap(initialMap);

      // Parse with initial mapping
      const { deliveryNotes, totalRows } = await parseExcelDeliveryNoteData(selectedFile, initialMap);
      setParsedDeliveryNotes(deliveryNotes);
      setTotalRowsCount(totalRows);

      setStep('MAP');
    } catch (err: any) {
      setError(err.message || 'Failed to read spreadsheet data.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReparseWithMap = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    try {
      const { deliveryNotes, totalRows } = await parseExcelDeliveryNoteData(file, columnMap);
      setParsedDeliveryNotes(deliveryNotes);
      setTotalRowsCount(totalRows);
      setStep('PREVIEW');
    } catch (err: any) {
      setError(err.message || 'Error processing spreadsheet with specified mapping.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitImport = () => {
    if (parsedDeliveryNotes.length === 0) {
      setError('No valid delivery notes were parsed to import.');
      return;
    }
    const importCallback = onImportDeliveryNotes || onImport;
    if (importCallback) {
      importCallback(parsedDeliveryNotes, importMode);
    }
    onClose();
  };

  // Grand summary of parsed delivery notes
  const totalDeliveredValue = parsedDeliveryNotes.reduce((acc, dn) => acc + (dn.totalDeliveredValue || 0), 0);
  const totalLineCount = parsedDeliveryNotes.reduce((acc, dn) => acc + (dn.lines?.length || 0), 0);
  const uniqueCustomers = Array.from(new Set(parsedDeliveryNotes.map((d) => d.customerName)));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">

        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Load & Map Existing Delivery Notes Database
              </h2>
              <p className="text-xs text-slate-300">
                Import delivery note history from Excel / CSV files and map columns to your database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className={`px-3 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                step === 'UPLOAD' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              1. Upload File & Template
            </button>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <button
              type="button"
              disabled={!file}
              onClick={() => setStep('MAP')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                !file
                  ? 'text-slate-400 cursor-not-allowed'
                  : step === 'MAP'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200 cursor-pointer'
              }`}
            >
              2. Column Mapping
            </button>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <button
              type="button"
              disabled={parsedDeliveryNotes.length === 0}
              onClick={() => setStep('PREVIEW')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                parsedDeliveryNotes.length === 0
                  ? 'text-slate-400 cursor-not-allowed'
                  : step === 'PREVIEW'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200 cursor-pointer'
              }`}
            >
              3. Review & Import ({parsedDeliveryNotes.length} Delivery Notes)
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer text-xs"
            title="Download sample excel layout with all headers"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            Extract Template to load data (.xlsx)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD FILE */}
          {step === 'UPLOAD' && (
            <div className="space-y-6">
              <div className="p-5 bg-blue-50/60 rounded-2xl border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    Extract Database Template
                  </h3>
                  <p className="text-xs text-blue-800 mt-1">
                    Download our structured Excel template containing all delivery note columns (numbers, dates, PO references, carrier/vehicle details, line items, and quantities) to easily format your data before uploading.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs cursor-pointer shrink-0 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Extract Template (.xlsx)
                </button>
              </div>

              {/* Upload Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-blue-50/30 flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-sm block">
                    {file ? file.name : 'Click or drag & drop existing delivery notes file here'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1 block">
                    Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
                  </span>
                </div>
                {file && (
                  <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 font-semibold rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> File Selected: {(file.size / 1024).toFixed(1)} KB
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                />
              </div>

              {isProcessing && (
                <div className="p-4 bg-slate-100 rounded-xl flex items-center justify-center gap-3 text-xs text-slate-700">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  Analyzing headers and delivery note lines...
                </div>
              )}
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'MAP' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                    Map Spreadsheet Columns to Delivery Note Database
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Match fields from <span className="font-semibold text-slate-800">"{file?.name}"</span> with the system delivery note structure.
                  </p>
                </div>
                <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                  Detected {fileHeaders.length} Columns
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Delivery Note Number */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1 flex items-center justify-between">
                    <span>Delivery Note Number <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-slate-500 font-normal">Groups line items</span>
                  </label>
                  <select
                    value={columnMap.deliveryNoteNumber}
                    onChange={(e) => setColumnMap({ ...columnMap, deliveryNoteNumber: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Customer Name */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Customer / Client Name <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={columnMap.customerName}
                    onChange={(e) => setColumnMap({ ...columnMap, customerName: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. PO Number */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Purchase Order (PO) Reference
                  </label>
                  <select
                    value={columnMap.poNumber}
                    onChange={(e) => setColumnMap({ ...columnMap, poNumber: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Delivery Date */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Delivery Date
                  </label>
                  <select
                    value={columnMap.deliveryDate}
                    onChange={(e) => setColumnMap({ ...columnMap, deliveryDate: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Item Description */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Line Item Description
                  </label>
                  <select
                    value={columnMap.itemDescription}
                    onChange={(e) => setColumnMap({ ...columnMap, itemDescription: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Quantity */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Delivered Quantity
                  </label>
                  <select
                    value={columnMap.deliveredQuantity}
                    onChange={(e) => setColumnMap({ ...columnMap, deliveredQuantity: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7. Unit Price */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Unit Price
                  </label>
                  <select
                    value={columnMap.unitPrice}
                    onChange={(e) => setColumnMap({ ...columnMap, unitPrice: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 8. Total Amount / Value */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Line or Total Value (Incl. VAT)
                  </label>
                  <select
                    value={columnMap.totalAfterVat}
                    onChange={(e) => setColumnMap({ ...columnMap, totalAfterVat: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select File Column --</option>
                    {fileHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action */}
              <div className="flex justify-end pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleReparseWithMap}
                  disabled={isProcessing}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                  Apply Mapping & Review Data
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & COMMIT */}
          {step === 'PREVIEW' && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Delivery Notes Detected</span>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">{parsedDeliveryNotes.length}</div>
                  <span className="text-[10px] text-slate-400">across {totalRowsCount} raw rows</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Total Delivered Lines</span>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">{totalLineCount}</div>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Unique Customers</span>
                  <div className="text-xl font-bold text-slate-900 mt-0.5">{uniqueCustomers.length}</div>
                </div>
                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase">Total Value (Incl. VAT)</span>
                  <div className="text-xl font-bold text-emerald-700 mt-0.5">TZS {formatCurrency(totalDeliveredValue)}</div>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-800 block">
                  Select Import Integration Mode:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      importMode === 'APPEND'
                        ? 'bg-blue-50/60 border-blue-400 text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'APPEND'}
                      onChange={() => setImportMode('APPEND')}
                      className="mt-0.5 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <div className="font-bold text-xs">Append & Merge</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Add these {parsedDeliveryNotes.length} delivery notes into the existing database without overwriting prior records.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      importMode === 'REPLACE'
                        ? 'bg-amber-50/60 border-amber-400 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'REPLACE'}
                      onChange={() => setImportMode('REPLACE')}
                      className="mt-0.5 text-amber-600 focus:ring-0"
                    />
                    <div>
                      <div className="font-bold text-xs">Replace Entire Delivery Notes Database</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Overwrite the database with this imported dataset (use when migrating full master dataset).
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Delivery Notes Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 flex flex-wrap justify-between items-center gap-2 border-b border-slate-200">
                  <span>Sample Parsed Delivery Notes Preview ({parsedDeliveryNotes.length} delivery notes parsed)</span>
                  <TableExportToolbar
                    totalCount={parsedDeliveryNotes.length}
                    onExportExcel={() => {
                      const headers = ['DN #', 'Date', 'Customer', 'PO Reference', 'Lines Count', 'Grand Total (TZS)', 'Status'];
                      const rows = parsedDeliveryNotes.map(dn => [
                        dn.deliveryNoteNumber,
                        dn.deliveryDate,
                        dn.customerName,
                        dn.poNumber,
                        dn.lines?.length || 0,
                        formatCurrency(dn.totalDeliveredValue),
                        dn.isCancelled ? 'CANCELLED' : 'ACTIVE',
                      ]);
                      exportTableToExcel('Parsed_Delivery_Notes_Preview', headers, rows, 'parsed_delivery_notes_preview');
                    }}
                    onExportPdf={() => {
                      const headers = ['DN #', 'Date', 'Customer', 'PO Ref', 'Lines', 'Total (TZS)', 'Status'];
                      const rows = parsedDeliveryNotes.map(dn => [
                        dn.deliveryNoteNumber,
                        dn.deliveryDate,
                        dn.customerName,
                        dn.poNumber,
                        dn.lines?.length || 0,
                        formatCurrency(dn.totalDeliveredValue),
                        dn.isCancelled ? 'CANCELLED' : 'ACTIVE',
                      ]);
                      exportTableToPdf('Parsed Delivery Notes Import Preview', headers, rows, {
                        filenamePrefix: 'parsed_delivery_notes_preview',
                        currencyNote: 'Currency: TZS',
                      });
                    }}
                    size="sm"
                  />
                </div>
                <div className="overflow-auto max-h-60 scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-800 text-white uppercase text-[10px] font-semibold sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="py-2.5 px-3 sticky top-0 bg-slate-800">DN #</th>
                        <th className="py-2.5 px-3 sticky top-0 bg-slate-800">Date</th>
                        <th className="py-2.5 px-3 sticky top-0 bg-slate-800">Customer</th>
                        <th className="py-2.5 px-3 sticky top-0 bg-slate-800">PO Reference</th>
                        <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-800">Lines</th>
                        <th className="py-2.5 px-3 text-right sticky top-0 bg-slate-800">Grand Total (TZS)</th>
                        <th className="py-2.5 px-3 text-center sticky top-0 bg-slate-800">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedDeliveryNotes.slice(0, 8).map((dn, idx) => (
                        <tr key={dn.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{dn.deliveryNoteNumber}</td>
                          <td className="py-2.5 px-3 text-slate-600">{dn.deliveryDate}</td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">{dn.customerName}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{dn.poNumber}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-700">{dn.lines?.length || 0}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            TZS {formatCurrency(dn.totalDeliveredValue)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                dn.isCancelled
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {dn.isCancelled ? 'CANCELLED' : 'ACTIVE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div>
            {step !== 'UPLOAD' && (
              <button
                type="button"
                onClick={() => setStep(step === 'PREVIEW' ? 'MAP' : 'UPLOAD')}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>

            {step === 'PREVIEW' ? (
              <button
                type="button"
                onClick={handleCommitImport}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Commit & Load {parsedDeliveryNotes.length} Delivery Notes to Database
              </button>
            ) : (
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  if (step === 'UPLOAD') setStep('MAP');
                  else handleReparseWithMap();
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
