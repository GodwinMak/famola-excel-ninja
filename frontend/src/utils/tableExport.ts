import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface TableExportOptions {
  filenamePrefix?: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  currencyNote?: string;
}

/**
 * Sanitizes table row cell values for tabular export (Excel & PDF)
 */
export const sanitizeCellValue = (val: any): string | number => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const str = String(val).trim();
  // If value is formatted currency like "TZS 1,234,567.89", parse to pure numeric value for Excel arithmetic
  const cleanCurrency = str.replace(/^TZS\s*/i, '').replace(/,/g, '');
  if (cleanCurrency !== '' && !isNaN(Number(cleanCurrency)) && str !== cleanCurrency) {
    return Number(cleanCurrency);
  }
  return str;
};

/**
 * Exports any tabular dataset to formatted Excel (.xlsx) file
 */
export const exportTableToExcel = (
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  filenamePrefix?: string
) => {
  try {
    const workbook = XLSX.utils.book_new();

    // Prepare clean data array
    const cleanRows = rows.map((r) => r.map(sanitizeCellValue));
    const sheetData = [
      [`${title} - Famola FBI Excel Ninja (Currency: TZS)`],
      [`Exported on: ${new Date().toLocaleString()} • Total Records: ${rows.length}`],
      [], // blank spacer row
      headers,
      ...cleanRows,
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Calculate approximate column widths
    const colWidths = headers.map((h, colIdx) => {
      let maxLen = h.length;
      for (let i = 0; i < Math.min(cleanRows.length, 100); i++) {
        const valStr = String(cleanRows[i]?.[colIdx] ?? '');
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 45);
      }
      return { wch: Math.max(maxLen + 3, 12) };
    });
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data_Export');

    const cleanFilename = (filenamePrefix || title)
      .toLowerCase()
      .replace(/[^a-z0-9_]/gi, '_')
      .replace(/_+/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `${cleanFilename}_${dateStamp}.xlsx`);
  } catch (err) {
    console.error('Failed to export to Excel:', err);
  }
};

/**
 * Exports any tabular dataset to a styled, professional PDF document
 */
export const exportTableToPdf = (
  title: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  options: TableExportOptions = {}
) => {
  try {
    const {
      filenamePrefix,
      subtitle,
      orientation = headers.length > 6 ? 'landscape' : 'portrait',
      currencyNote = 'All Monetary Values in Tanzanian Shilling (TZS)',
    } = options;

    const doc = new jsPDF({
      orientation,
      unit: 'pt',
      format: 'a4',
    });

    const cleanRows = rows.map((r) => r.map((cell) => String(sanitizeCellValue(cell))));

    // Header banner styling
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 55, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(title, 24, 28);

    // Subtitle / Org
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Famola FBI Excel Ninja • ${currencyNote} • Generated: ${new Date().toLocaleString()}`,
      24,
      44
    );

    if (subtitle) {
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(subtitle, 24, 75);
    }

    const startY = subtitle ? 90 : 70;

    autoTable(doc, {
      startY,
      head: [headers],
      body: cleanRows,
      theme: 'grid',
      styles: {
        fontSize: headers.length > 10 ? 7 : headers.length > 7 ? 8 : 9,
        cellPadding: 4,
        overflow: 'linebreak',
        textColor: [30, 41, 59],
        valign: 'middle',
      },
      headStyles: {
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: headers.length > 10 ? 7.5 : 8.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      margin: { top: 70, bottom: 40, left: 20, right: 20 },
      didDrawPage: (data) => {
        // Footer page numbering
        const pageCount = (doc.internal as any).getNumberOfPages
          ? (doc.internal as any).getNumberOfPages()
          : (doc as any).internal.pages.length - 1;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount} • Famola FBI Excel Ninja • Currency: TZS`,
          24,
          doc.internal.pageSize.getHeight() - 15
        );
      },
    });

    const cleanFilename = (filenamePrefix || title)
      .toLowerCase()
      .replace(/[^a-z0-9_]/gi, '_')
      .replace(/_+/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    doc.save(`${cleanFilename}_${dateStamp}.pdf`);
  } catch (err) {
    console.error('Failed to export to PDF:', err);
  }
};
