import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './storage';

export interface ManagementReportPdfData {
  reportTitle: string;
  moduleType: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
  dateStr: string;
  customerFilter: string;
  aiNarrative: {
    executiveNarrative: string;
    operationalHighlights: string[];
    sequenceAuditInsights: string;
    reconciliationAssessment: string;
    issuesAndRisksSummary: string;
    strategicRecommendations: string[];
  };
  overallMetrics: {
    totalCustomers: number;
    totalBooks: number;
    totalCapacity: number;
    totalRecorded: number;
    totalMissing: number;
    completionRate: number;
    totalFinancialValue: number;
    totalPoCommitted: number;
    variance: number;
    totalIssues: number;
    openIssues: number;
    resolvedIssues: number;
  };
  customerBooks: Array<{
    customerName: string;
    totalBooks: number;
    shortRange: string;
    usedCount: number;
    missingCount: number;
    completionPercentage: number;
    missingRangesSummary: string;
    status: string;
  }>;
  customerReconciliations: Array<{
    customerName: string;
    poCount: number;
    totalPoValue: number;
    actualValue: number;
    variance: number;
    fulfillmentRate: number;
    status: string;
  }>;
  customerIssues: Array<{
    customerName: string;
    totalIssues: number;
    pendingCount: number;
    underReviewCount: number;
    resolvedCount: number;
    keyIssuesNotes: string;
  }>;
  topFinancials: Array<{
    customerName: string;
    totalValue: number;
    percentage: number;
  }>;
}

export const exportManagementReportToPdf = (data: ManagementReportPdfData) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const isInvoice = data.moduleType === 'INVOICE';
    const isDelivery = data.moduleType === 'DELIVERY';
    const moduleLabel = isInvoice ? 'INVOICE' : isDelivery ? 'DELIVERY NOTE' : 'PAYMENT & SETTLEMENT';
    const unitLabel = isInvoice ? 'Invoiced Value' : isDelivery ? 'Delivered Value' : 'Settled Payments';

    // 1. EXECUTIVE HEADER BANNER
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 75, 'F');

    // Accent line
    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(0, 72, pageWidth, 3, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('FAMOLA ERP — EXECUTIVE MANAGEMENT REPORT', 24, 28);

    // Subtitle & Scope
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Operational Scope: ${moduleLabel} AUDIT • Currency: Tanzanian Shillings (TZS) • Scope: ${data.customerFilter}`,
      24,
      45
    );

    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(
      `Generated on: ${data.dateStr} • Prepared for Executive Board & Management Audit Review`,
      24,
      60
    );

    let currentY = 90;

    // 2. EXECUTIVE KPI CARDS SUMMARY TABLE
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('1. Executive Operational & Financial Metrics', 24, currentY);
    currentY += 12;

    const kpiRows = [
      [
        'Total Active Customers',
        `${data.overallMetrics.totalCustomers} Accounts`,
        'Total 50-Leaflet Books',
        `${data.overallMetrics.totalBooks} Books (${data.overallMetrics.totalCapacity} Leaves)`
      ],
      [
        'Leaves Verified & Recorded',
        `${data.overallMetrics.totalRecorded.toLocaleString()} Leaves`,
        'Missing Leaves (Sequence Gaps)',
        `${data.overallMetrics.totalMissing.toLocaleString()} Leaves`
      ],
      [
        'Overall Sequence Completion',
        `${data.overallMetrics.completionRate}% Verified`,
        `Total ${unitLabel}`,
        `TZS ${formatCurrency(data.overallMetrics.totalFinancialValue)}`
      ],
      [
        'Purchase Order Commitment',
        `TZS ${formatCurrency(data.overallMetrics.totalPoCommitted)}`,
        'PO Variance / Backlog',
        `TZS ${formatCurrency(data.overallMetrics.variance)}`
      ],
      [
        'Document Issues Logged',
        `${data.overallMetrics.totalIssues} Issues`,
        'Pending / Open Exceptions',
        `${data.overallMetrics.openIssues} Active Disputes`
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      body: kpiRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 140 },
        1: { fontStyle: 'normal', cellWidth: 125 },
        2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 140 },
        3: { fontStyle: 'normal', cellWidth: 125 },
      },
      margin: { left: 24, right: 24 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 18;

    // 3. AI EXECUTIVE NARRATIVE SECTION
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('2. Executive AI Management Narrative & Performance Insights', 24, currentY);
    currentY += 14;

    // Narrative Box
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    const narrativeParas = (data.aiNarrative.executiveNarrative || '').split('\n\n').filter(Boolean);
    narrativeParas.forEach((para) => {
      const splitLines = doc.splitTextToSize(para.trim(), pageWidth - 48);
      if (currentY + splitLines.length * 10 > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        currentY = 40;
      }
      doc.text(splitLines, 24, currentY);
      currentY += splitLines.length * 10 + 6;
    });

    // Operational Highlights Bullet Points
    if (data.aiNarrative.operationalHighlights && data.aiNarrative.operationalHighlights.length > 0) {
      if (currentY > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage();
        currentY = 40;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text('Operational Key Highlights:', 24, currentY);
      currentY += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      data.aiNarrative.operationalHighlights.forEach((highlight) => {
        const bulletText = `•  ${highlight}`;
        const bulletLines = doc.splitTextToSize(bulletText, pageWidth - 56);
        if (currentY + bulletLines.length * 9 > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          currentY = 40;
        }
        doc.text(bulletLines, 28, currentY);
        currentY += bulletLines.length * 9 + 3;
      });
      currentY += 6;
    }

    // Strategic Recommendations Box
    if (data.aiNarrative.strategicRecommendations && data.aiNarrative.strategicRecommendations.length > 0) {
      if (currentY > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage();
        currentY = 40;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text('Strategic Action Recommendations for Executive Leadership:', 24, currentY);
      currentY += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      data.aiNarrative.strategicRecommendations.forEach((rec, idx) => {
        const text = `${idx + 1}. ${rec}`;
        const lines = doc.splitTextToSize(text, pageWidth - 56);
        if (currentY + lines.length * 9 > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          currentY = 40;
        }
        doc.text(lines, 28, currentY);
        currentY += lines.length * 9 + 3;
      });
      currentY += 10;
    }

    // 4. CUSTOMER BOOK SERIES (50-LEAFLET TRACKER) & MISSING NUMBER AUDIT TABLE
    doc.addPage();
    currentY = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Customer Book Series (50-Leaflet Tracker) & Missing Number Audit', 24, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Tracks physical 50-leaflet books (001-050, 051-100...), leaves recorded, and missing sequence gaps per customer.',
      24,
      currentY + 11
    );
    currentY += 22;

    const bookAuditHeaders = [
      'Customer Name',
      'Books Done',
      'Leaves Rec.',
      'Missing',
      'Completion %',
      'Audit Status'
    ];

    const bookAuditRows = data.customerBooks.map((b) => [
      b.customerName,
      `${b.totalBooks} Books`,
      b.usedCount,
      b.missingCount,
      `${b.completionPercentage}%`,
      b.status
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [bookAuditHeaders],
      body: bookAuditRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 160 },
        1: { cellWidth: 70, halign: 'center' },
        2: { cellWidth: 80, halign: 'right' },
        3: { cellWidth: 70, halign: 'right' },
        4: { cellWidth: 80, halign: 'center' },
        5: { cellWidth: 90, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 24, right: 24 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;

    // 5. PO VS INVOICE/DELIVERY/PAYMENT CUSTOMER RECONCILIATION TABLE
    if (currentY > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      currentY = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`4. Purchase Order vs ${moduleLabel} Customer Reconciliation`, 24, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `High-level management reconciliation comparing committed PO contract value against executed ${unitLabel.toLowerCase()}.`,
      24,
      currentY + 11
    );
    currentY += 22;

    const reconcHeaders = [
      'Customer Name',
      'PO Orders',
      'Total PO Value (TZS)',
      `${unitLabel} (TZS)`,
      'Variance / Backlog (TZS)',
      'Fulfillment %',
      'Reconciliation Status'
    ];

    const reconcRows = data.customerReconciliations.map((r) => [
      r.customerName,
      `${r.poCount} Orders`,
      formatCurrency(r.totalPoValue),
      formatCurrency(r.actualValue),
      formatCurrency(r.variance),
      `${r.fulfillmentRate}%`,
      r.status
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [reconcHeaders],
      body: reconcRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 3.5,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [37, 99, 235], // blue-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110 },
        1: { cellWidth: 50, halign: 'center' },
        2: { cellWidth: 85, halign: 'right' },
        3: { cellWidth: 85, halign: 'right' },
        4: { cellWidth: 85, halign: 'right' },
        5: { cellWidth: 55, halign: 'center' },
        6: { cellWidth: 75, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 24, right: 24 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;

    // 6. SUMMARY OF ISSUES RAISED PER CUSTOMER & STATUS TABLE
    if (currentY > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      currentY = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('5. Summary of Document Issues Raised per Customer & Status', 24, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Breakdown of customer exceptions, dispute classifications, and pending versus resolved audit items.',
      24,
      currentY + 11
    );
    currentY += 22;

    const issueHeaders = [
      'Customer Name',
      'Total Issues',
      'Pending / Open',
      'Under Review',
      'Resolved',
      'Resolution %',
      'Status'
    ];

    const issueRows = data.customerIssues.map((iss) => {
      const resPct = iss.totalIssues > 0 ? Math.round((iss.resolvedCount / iss.totalIssues) * 100) : 0;
      const statusStr = iss.pendingCount === 0 && iss.underReviewCount === 0 ? 'All Resolved' : 'Pending Action';
      return [
        iss.customerName,
        iss.totalIssues,
        iss.pendingCount,
        iss.underReviewCount,
        iss.resolvedCount,
        `${resPct}%`,
        statusStr
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [issueHeaders],
      body: issueRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [225, 29, 72], // rose-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 150 },
        1: { cellWidth: 65, halign: 'center' },
        2: { cellWidth: 65, halign: 'center' },
        3: { cellWidth: 65, halign: 'center' },
        4: { cellWidth: 65, halign: 'center' },
        5: { cellWidth: 65, halign: 'center' },
        6: { cellWidth: 65, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 24, right: 24 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 20;

    // 7. FINANCIAL DISTRIBUTION TABLE (VALUE BY CUSTOMER)
    if (data.topFinancials && data.topFinancials.length > 0) {
      if (currentY > doc.internal.pageSize.getHeight() - 130) {
        doc.addPage();
        currentY = 40;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`6. Value of ${unitLabel} by Customer (Financial Breakdown)`, 24, currentY);
      currentY += 15;

      const finHeaders = ['# Rank', 'Customer Name', `Total ${unitLabel} (TZS)`, '% Contribution to Total'];
      const finRows = data.topFinancials.map((fin, idx) => [
        `#${idx + 1}`,
        fin.customerName,
        `TZS ${formatCurrency(fin.totalValue)}`,
        `${fin.percentage.toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [finHeaders],
        body: finRows,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: 3.5,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [15, 118, 110], // teal-700
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 45, halign: 'center' },
          1: { fontStyle: 'bold', cellWidth: 180 },
          2: { cellWidth: 150, halign: 'right' },
          3: { cellWidth: 120, halign: 'center' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 24, right: 24 },
      });
    }

    // 8. ADD PAGE FOOTERS TO ALL PAGES
    const totalPages = (doc.internal as any).getNumberOfPages
      ? (doc.internal as any).getNumberOfPages()
      : (doc as any).internal.pages.length - 1;

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);

      // Top header on subsequent pages
      if (i > 1) {
        doc.text(
          `FAMOLA ERP • Executive Management Audit Report (${moduleLabel}) • Page ${i} of ${totalPages}`,
          24,
          20
        );
        doc.setDrawColor(226, 232, 240);
        doc.line(24, 25, pageWidth - 24, 25);
      }

      // Bottom footer on every page
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(226, 232, 240);
      doc.line(24, pageHeight - 25, pageWidth - 24, pageHeight - 25);

      doc.text(
        `CONFIDENTIAL & PROPRIETARY — FOR MANAGEMENT USE ONLY • Generated by FAMOLA ERP AI Intelligence`,
        24,
        pageHeight - 12
      );
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth - 75,
        pageHeight - 12
      );
    }

    // Save PDF
    const cleanPrefix = `${data.moduleType.toLowerCase()}_management_report_${data.customerFilter.replace(/[^a-z0-9]/gi, '_')}`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    doc.save(`${cleanPrefix}_${dateStamp}.pdf`);
  } catch (err) {
    console.error('Failed to export Management Report to PDF:', err);
  }
};
