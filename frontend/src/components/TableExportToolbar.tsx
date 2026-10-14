import React from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';

interface TableExportToolbarProps {
  onExportExcel: () => void;
  onExportPdf: () => void;
  label?: string;
  totalCount?: number;
  className?: string;
  size?: 'sm' | 'md';
}

export const TableExportToolbar: React.FC<TableExportToolbarProps> = ({
  onExportExcel,
  onExportPdf,
  label = 'Export',
  totalCount,
  className = '',
  size = 'sm',
}) => {
  const isSm = size === 'sm';

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {totalCount !== undefined && (
        <span className="text-[11px] text-slate-500 font-medium mr-1 hidden sm:inline">
          {totalCount} {totalCount === 1 ? 'row' : 'rows'}
        </span>
      )}
      <button
        type="button"
        onClick={onExportExcel}
        className={`font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
        }`}
        title="Export table data to Excel (.xlsx)"
      >
        <FileSpreadsheet className={`${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-emerald-600`} />
        <span>Excel</span>
      </button>

      <button
        type="button"
        onClick={onExportPdf}
        className={`font-semibold rounded-lg bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs ${
          isSm ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
        }`}
        title="Export table data to formatted PDF (.pdf)"
      >
        <FileText className={`${isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-red-600`} />
        <span>PDF</span>
      </button>
    </div>
  );
};
