import * as XLSX from 'xlsx';
import { POLineItem, InvoiceRecord, DeliveryNoteRecord } from '../types';

// Helper to sanitize header strings
const normalizeHeader = (header: string): string => {
  return header
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

const parseNumber = (val: any, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
};

// Guards against a mis-matched column (e.g. a VAT registration number/TIN
// picked up by the fuzzy header matcher instead of an actual VAT amount)
// producing a figure so large it overflows the database's DECIMAL(16,2)
// columns and fails the entire bulk-sync transaction — no real PO line's
// money value is ever in the hundreds of billions, so anything past this
// ceiling is treated as a bad match rather than trusted as real.
const MAX_SANE_AMOUNT = 999_999_999_999.99;
const sanitizeAmount = (val: number, label: string, rowIndex: number): number => {
  if (!Number.isFinite(val) || Math.abs(val) > MAX_SANE_AMOUNT) {
    console.warn(`Row ${rowIndex + 1}: "${label}" value ${val} looked like a bad column match, defaulted to 0.`);
    return 0;
  }
  return val;
};

// Preserves numeric PO numbers (e.g. 2540) as clean strings without precision loss
export const cleanPoNumber = (val: any): string => {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val.toString() : String(val).trim();
  }
  return String(val).trim();
};

const parseDateString = (val: any): string => {
  if (!val) {
    return new Date().toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date to JS date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return str;
};

/**
 * Intelligent, multi-pass header value extractor.
 * 1. Checks exact normalized matches first against preferred candidates.
 * 2. Strict negative filtering ensures 'PO DATE', 'DEPOT', 'PORT', 'POSITION' etc. NEVER match 'PO NUMBER'.
 * 3. Supports prefix and substring matching only for candidate tokens of adequate length without negative keywords.
 */
export const extractRowValue = (
  row: any,
  candidateHeaders: string[],
  negativeTokens: string[] = []
): any => {
  if (!row || typeof row !== 'object') return '';
  const keys = Object.keys(row);
  if (keys.length === 0) return '';

  const normCandidates = candidateHeaders.map(normalizeHeader);
  const normNegatives = negativeTokens.map(normalizeHeader).filter(Boolean);

  // Pass 1: Strict EXACT match on normalized header
  for (const cand of normCandidates) {
    for (const key of keys) {
      const normKey = normalizeHeader(key);
      if (normKey === cand) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }

  // Pass 2: Prefix / Suffix match (only if candidate is >= 3 characters and key contains NO negative tokens)
  for (const cand of normCandidates) {
    if (cand.length < 3) continue;
    for (const key of keys) {
      const normKey = normalizeHeader(key);
      if (normNegatives.some((neg) => normKey.includes(neg))) {
        continue;
      }
      if (normKey.startsWith(cand) || normKey.endsWith(cand)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }

  // Pass 3: General substring match (only if candidate is >= 4 characters and key contains NO negative tokens)
  for (const cand of normCandidates) {
    if (cand.length < 4) continue;
    for (const key of keys) {
      const normKey = normalizeHeader(key);
      if (normNegatives.some((neg) => normKey.includes(neg))) {
        continue;
      }
      if (normKey.includes(cand)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return val;
        }
      }
    }
  }

  return '';
};

export const parseExcelPOData = async (file: File): Promise<POLineItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        if (!worksheet) {
          throw new Error('No worksheet found in uploaded Excel file.');
        }

        // Dynamically expand worksheet range if worksheet['!ref'] was truncated in the original file
        let maxR = 0;
        let maxC = 0;
        let minR = 0;
        let minC = 0;
        if (worksheet['!ref']) {
          try {
            const decoded = XLSX.utils.decode_range(worksheet['!ref']);
            minR = decoded.s.r;
            minC = decoded.s.c;
            maxR = decoded.e.r;
            maxC = decoded.e.c;
          } catch (_) {}
        }
        const cellRegex = /^([A-Z]+)(\d+)$/;
        for (const cellKey of Object.keys(worksheet)) {
          if (cellKey[0] === '!') continue;
          const match = cellKey.match(cellRegex);
          if (match) {
            const colStr = match[1];
            const rowNum = parseInt(match[2], 10) - 1;
            let colNum = 0;
            for (let i = 0; i < colStr.length; i++) {
              colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
            }
            colNum -= 1;
            if (rowNum > maxR) maxR = rowNum;
            if (colNum > maxC) maxC = colNum;
          }
        }
        worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });

        // Convert sheet to json array of objects - reads all rows (e.g. 7060+ rows)
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('The uploaded file contains no data rows.');
        }

        const items: POLineItem[] = rawRows.map((row, index) => {
          const customerName = String(
            extractRowValue(
              row,
              ['CUSTOMER NAME', 'CUSTOMER / VENDOR', 'CUSTOMER', 'CLIENT NAME', 'CLIENT', 'BUYER', 'ACCOUNT NAME'],
              ['PO', 'DATE', 'PRICE', 'QTY', 'INVOICE']
            ) || 'Unknown Customer'
          ).trim();

          const destination = String(
            extractRowValue(
              row,
              ['DESTINATION', 'DELIVERY DESTINATION', 'LOCATION', 'DELIVERY LOCATION', 'SITE LOCATION', 'SITE', 'SHIP TO', 'PLACE OF DELIVERY'],
              ['CUSTOMER', 'DATE', 'ITEM']
            ) || 'Default Location'
          ).trim();

          // Robust PO Number extraction: strictly filters out 'DATE', 'TIME', 'STATUS', 'QTY', 'PRICE', etc.
          // This prevents 'PO DATE' from being mistaken as the PO Number, guaranteeing unique PO numbers (e.g. 2540 instead of 254 dates)
          const rawPoVal = extractRowValue(
            row,
            [
              'PURCHASE ORDER NUMBER',
              'PURCHASE ORDER NO',
              'PURCHASE ORDER #',
              'PURCHASE ORDER',
              'PO NUMBER',
              'PO NO',
              'PO #',
              'PONO',
              'PONUMBER',
              'PURCHASE ORDE',
              'LPO NUMBER',
              'LPO NO',
              'LPO #',
              'LPONUMBER',
              'LPONO',
              'LPO',
              'ORDER NUMBER',
              'ORDER NO',
            ],
            [
              'DATE',
              'TIME',
              'DAY',
              'MONTH',
              'YEAR',
              'STATUS',
              'TYPE',
              'CATEGORY',
              'DESC',
              'ITEM',
              'REMARK',
              'NOTE',
              'COMMENT',
              'CUSTOMER',
              'VENDOR',
              'CLIENT',
              'DESTINATION',
              'LOCATION',
              'QTY',
              'QUANTITY',
              'PRICE',
              'COST',
              'RATE',
              'VAT',
              'TAX',
              'AMOUNT',
              'TOTAL',
              'VALUE',
              'UOM',
              'UNIT',
              'CURRENCY',
            ]
          );
          const poNumber = cleanPoNumber(rawPoVal) || `PO-${index + 1}`;

          const contract = String(
            extractRowValue(
              row,
              ['CONTRACT NUMBER', 'CONTRACT NO', 'CONTRACT #', 'CONTRACT', 'AGREEMENT NO', 'AGREEMENT NUMBER', 'AGREEMENT'],
              ['DATE', 'PRICE', 'QTY']
            ) || 'N/A'
          ).trim();

          const itemDescription = String(
            extractRowValue(
              row,
              ['ITEM DESCRIPTION', 'DESCRIPTION OF GOODS', 'PART DESCRIPTION', 'PRODUCT DESCRIPTION', 'ITEM NAME', 'DESCRIPTION', 'PRODUCT', 'PART NAME', 'ITEM'],
              ['PO', 'CUSTOMER', 'DATE', 'QTY', 'PRICE', 'VAT', 'TOTAL']
            ) || `Item ${index + 1}`
          ).trim();

          const rawDate = extractRowValue(
            row,
            ['PO DATE', 'LPO DATE', 'PURCHASE ORDER DATE', 'ORDER DATE', 'DATE(LPO)', 'DATE (LPO)', 'DATE(LPC)', 'DOCUMENT DATE', 'DATE']
          );
          const date = parseDateString(rawDate);

          const unitOfMeasure = String(
            extractRowValue(
              row,
              ['UNIT OF MEAS', 'UNIT OF MEASURE', 'UOM', 'UNIT', 'U/M', 'MEASURE']
            ) || 'PCS'
          ).trim();

          const quantity = parseNumber(
            extractRowValue(
              row,
              ['QUANTITY(LPO)', 'QUANTITY (LPO)', 'QTY(LPO)', 'QTY (LPO)', 'QUANTITY', 'QTY', 'ORDER QTY', 'PO QUANTITY', 'PO QTY'],
              ['UNIT PRICE', 'PRICE', 'TOTAL', 'VAT', 'DATE']
            ),
            1
          );

          const unitCost = sanitizeAmount(parseNumber(
            extractRowValue(
              row,
              ['UNIT COST', 'COST', 'UNIT_COST', 'BUYING PRICE', 'COST PRICE']
            ),
            0
          ), 'unitCost', index);

          let unitPrice = sanitizeAmount(parseNumber(
            extractRowValue(
              row,
              ['UNIT PRICE', 'SELLING PRICE', 'PRICE', 'RATE', 'UNIT_PRICE'],
              ['TOTAL', 'VAT', 'COST']
            ),
            0
          ), 'unitPrice', index);

          // If unit price not provided but unit cost is, default unit price to unit cost
          if (unitPrice === 0 && unitCost > 0) {
            unitPrice = unitCost;
          }

          let valueBeforeVat = sanitizeAmount(parseNumber(
            extractRowValue(
              row,
              ['VALUE BEFORE VAT', 'VALULUE BEFORE VAT', 'TOTAL BEFORE VAT', 'AMOUNT BEFORE VAT', 'SUBTOTAL', 'VALUE EXCL VAT', 'AMOUNT EXCL VAT', 'LINE TOTAL']
            ),
            0
          ), 'valueBeforeVat', index);

          // If not in excel, calculate: quantity * unitPrice
          if (valueBeforeVat === 0 && quantity > 0 && unitPrice > 0) {
            valueBeforeVat = Math.round(quantity * unitPrice * 100) / 100;
          }

          // Extracted before vatAmount below so a genuine "VALUE AFTER VAT" total
          // can be used to derive the real VAT amount, rather than assuming a flat rate.
          let valueAfterVat = sanitizeAmount(parseNumber(
            extractRowValue(
              row,
              ['VALUE AFTER VAT', 'TOTAL AFTER VAT', 'AMOUNT AFTER VAT', 'TOTAL INCL VAT', 'VALUE INCL VAT', 'GRAND TOTAL', 'TOTAL AMOUNT', 'TOTAL']
            ),
            0
          ), 'valueAfterVat', index);

          // The bare 'VAT'/'TAX' candidates need the negative-token guard below —
          // without it they suffix/prefix-match "VALUE BEFORE VAT"/"VALUE AFTER VAT"
          // (both literally end in "VAT"), and columns like "VAT NO"/"VRN"/"TIN"
          // holding a tax REGISTRATION number rather than a monetary amount.
          let vatAmount = sanitizeAmount(parseNumber(
            extractRowValue(
              row,
              ['VAT AMOUNT', 'VAT (18%)', 'VAT(18%)', 'VAT VALUE', 'TAX AMOUNT', 'VAT 18%', 'VAT', 'TAX'],
              ['BEFORE', 'AFTER', 'NO', 'NUMBER', 'REG', 'REGISTRATION', 'RATE', 'ID', 'TIN', 'VRN']
            ),
            0
          ), 'vatAmount', index);

          // Default standard VAT rate (e.g., 18%), used only when the sheet gives us
          // neither an explicit VAT column nor both before/after totals to derive it from.
          const vatRate = 0.18;
          if (vatAmount === 0) {
            if (valueBeforeVat > 0 && valueAfterVat > valueBeforeVat) {
              vatAmount = Math.round((valueAfterVat - valueBeforeVat) * 100) / 100;
            } else if (valueBeforeVat > 0) {
              vatAmount = Math.round(valueBeforeVat * vatRate * 100) / 100;
            }
          }

          if (valueAfterVat === 0) {
            valueAfterVat = Math.round((valueBeforeVat + vatAmount) * 100) / 100;
          }

          const remarks = String(
            extractRowValue(
              row,
              [
                'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)',
                'DELIVERY NOTES / GENERAL REMARKS',
                'DELIVERY NOTES/GENERAL REMARKS',
                'DELIVERY NOTES',
                'GENERAL REMARKS',
                'DELIVERY NOTE',
                'REMARKS',
                'NOTES',
                'COMMENT',
                'COMMENTS',
              ]
            ) || ''
          ).trim();

          return {
            id: `pol-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
            customerName,
            destination,
            poNumber,
            contract,
            itemDescription,
            date,
            unitOfMeasure,
            quantity: Math.max(0, quantity),
            unitCost,
            unitPrice,
            valueBeforeVat,
            vatRate,
            vatAmount,
            valueAfterVat,
            remarks: remarks || undefined,
          };
        });

        resolve(items);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const generateSampleExcelTemplate = () => {
  const sampleHeaders = [
    {
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CONTRACT': 'CNT-EAST-091',
      'ITEM DESCRIPTION': 'High-Grade Steel Reinforcement Bars 16mm',
      'DATE(lpo)': '2026-08-15',
      'UNIT OF MEAS': 'TONS',
      'QUANTITY(lpo)': 50,
      'UNIT COST': 850.00,
      'UNIT PRICE': 980.00,
      'VALUE BEFORE VAT': 49000.00,
      'VAT': 8820.00,
      'VALUE AFTER VAT': 57820.00,
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'DN-2026-089 / First batch on delivery schedule',
    },
    {
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CONTRACT': 'CNT-EAST-091',
      'ITEM DESCRIPTION': 'Hydraulic Valve Assembly Type 4B',
      'DATE(lpo)': '2026-08-15',
      'UNIT OF MEAS': 'PCS',
      'QUANTITY(lpo)': 20,
      'UNIT COST': 340.00,
      'UNIT PRICE': 420.00,
      'VALUE BEFORE VAT': 8400.00,
      'VAT': 1512.00,
      'VALUE AFTER VAT': 9912.00,
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'DN-2026-090 / High priority shipment',
    },
    {
      'CUSTOMER NAME': 'Global Mining & Energy Corp',
      'DESTINATION': 'Mwanza Goldfield Logistics Hub',
      'PURCHASE ORDER NUMBER': 'PO-2026-9042',
      'CONTRACT': 'CNT-MINE-442',
      'ITEM DESCRIPTION': 'Heavy Duty Conveyor Belt 1200mm (50m roll)',
      'DATE(lpo)': '2026-08-20',
      'UNIT OF MEAS': 'ROLLS',
      'QUANTITY(lpo)': 15,
      'UNIT COST': 1200.00,
      'UNIT PRICE': 1450.00,
      'VALUE BEFORE VAT': 21750.00,
      'VAT': 3915.00,
      'VALUE AFTER VAT': 25665.00,
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'Direct delivery to site gate B',
    },
    {
      'CUSTOMER NAME': 'Global Mining & Energy Corp',
      'DESTINATION': 'Mwanza Goldfield Logistics Hub',
      'PURCHASE ORDER NUMBER': 'PO-2026-9042',
      'CONTRACT': 'CNT-MINE-442',
      'ITEM DESCRIPTION': 'Industrial Lubricant Synthetic 200L Drum',
      'DATE(lpo)': '2026-08-20',
      'UNIT OF MEAS': 'DRUMS',
      'QUANTITY(lpo)': 40,
      'UNIT COST': 180.00,
      'UNIT PRICE': 230.00,
      'VALUE BEFORE VAT': 9200.00,
      'VAT': 1656.00,
      'VALUE AFTER VAT': 10856.00,
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'Special handling required',
    },
    {
      'CUSTOMER NAME': 'Kilimanjaro Agro Industries',
      'DESTINATION': 'Arusha Depot Warehouse 2',
      'PURCHASE ORDER NUMBER': 'PO-2026-7730',
      'CONTRACT': 'CNT-AGRO-108',
      'ITEM DESCRIPTION': 'Drip Irrigation Poly Tubing 16mm (500m)',
      'DATE(lpo)': '2026-08-25',
      'UNIT OF MEAS': 'COILS',
      'QUANTITY(lpo)': 100,
      'UNIT COST': 45.00,
      'UNIT PRICE': 60.00,
      'VALUE BEFORE VAT': 6000.00,
      'VAT': 1080.00,
      'VALUE AFTER VAT': 7080.00,
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleHeaders);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PO_Data');

  XLSX.writeFile(wb, 'PO_Upload_Template.xlsx');
};

export const exportPOsToExcel = (items: POLineItem[], filename = 'PO_Master_Data.xlsx') => {
  const exportData = items.map((item) => ({
    'CUSTOMER NAME': item.customerName,
    'DESTINATION': item.destination,
    'PURCHASE ORDER NUMBER': item.poNumber,
    'CONTRACT': item.contract,
    'ITEM DESCRIPTION': item.itemDescription,
    'DATE(lpo)': item.date,
    'UNIT OF MEAS': item.unitOfMeasure,
    'QUANTITY(lpo)': item.quantity,
    'INVOICED QTY': item.invoicedQuantity || 0,
    'REMAINING QTY': item.remainingQuantity !== undefined ? item.remainingQuantity : item.quantity,
    'STATUS': item.status || 'UNINVOICED',
    'UNIT COST': item.unitCost,
    'UNIT PRICE': item.unitPrice,
    'VALUE BEFORE VAT': item.valueBeforeVat,
    'VAT': item.vatAmount,
    'VALUE AFTER VAT': item.valueAfterVat,
    'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': item.remarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PO_Summary');
  XLSX.writeFile(wb, filename);
};

export const exportInvoicesToExcel = (invoices: InvoiceRecord[], filename = 'Invoices_Database.xlsx') => {
  const flattenedRows: any[] = [];
  const summaryRows: any[] = [];

  (invoices || []).forEach((inv, invIdx) => {
    if (!inv) return;
    const invNumber = inv.invoiceNumber || `INV-${invIdx + 1}`;
    const invDate = inv.invoiceDate || (inv as any).date || new Date().toISOString().slice(0, 10);
    const poNum = inv.poNumber || 'N/A';
    const custName = inv.customerName || 'General Customer';
    const destination = inv.destination || '';
    const contract = inv.contract || '';
    const poDate = inv.poDate || invDate;
    const invStatus = inv.status || 'ACTIVE';
    const paymentStatus = inv.paymentStatus || 'UNPAID';
    const invComment = inv.comment || 'Okay';
    const invNotes = inv.notes || '';

    const lines = Array.isArray(inv.lines) && inv.lines.length > 0 ? inv.lines : null;

    let calcSub = 0;
    let calcVat = 0;
    if (lines) {
      lines.forEach((l) => {
        const qty = parseNumber(l.invoicedQuantity ?? (l as any).quantityInvoiced ?? (l as any).billedQuantity ?? (l as any).billQty ?? 0);
        const price = parseNumber(l.unitPrice ?? 0);
        const vRate = l.vatRate !== undefined && l.vatRate !== null && Number(l.vatRate) > 0 && Number(l.vatRate) <= 1 ? Number(l.vatRate) : 0.18;
        const lb = (qty > 0 && price > 0)
          ? Math.round(qty * price * 100) / 100
          : (parseNumber(l.valueBeforeVat) > 0)
            ? parseNumber(l.valueBeforeVat)
            : Math.round(qty * price * 100) / 100;
        let lv = Math.round(lb * vRate * 100) / 100;
        const explicitVat = parseNumber(l.vatAmount);
        if (explicitVat > 0 && explicitVat <= lb * 0.35) {
          lv = explicitVat;
        }
        calcSub += lb;
        calcVat += lv;
      });
      calcSub = Math.round(calcSub * 100) / 100;
      calcVat = Math.round(calcVat * 100) / 100;
    }

    const invSubtotal = calcSub > 0
      ? calcSub
      : parseNumber(inv.subtotalBeforeVat) > 0
        ? parseNumber(inv.subtotalBeforeVat)
        : parseNumber((inv as any).subtotal) > 0
          ? parseNumber((inv as any).subtotal)
          : 0;

    const invVat = calcVat > 0
      ? calcVat
      : parseNumber(inv.totalVat) > 0
        ? parseNumber(inv.totalVat)
        : Math.round(invSubtotal * 0.18 * 100) / 100;

    const invTotal = (calcSub + calcVat) > 0
      ? Math.round((calcSub + calcVat) * 100) / 100
      : parseNumber(inv.totalAfterVat) > 0
        ? parseNumber(inv.totalAfterVat)
        : parseNumber((inv as any).totalAmount) > 0
          ? parseNumber((inv as any).totalAmount)
          : Math.round((invSubtotal + invVat) * 100) / 100;

    const paidAmt = parseNumber(inv.paidAmount);
    const pendingBalance = Math.max(0, Math.round((invTotal - paidAmt) * 100) / 100);

    if (lines) {
      lines.forEach((line, idx) => {
        if (!line) return;
        const invoicedQty = parseNumber(line.invoicedQuantity ?? (line as any).quantityInvoiced ?? 0);
        const poQty = parseNumber(line.poQuantity, invoicedQty);
        let unitPrice = parseNumber(line.unitPrice);

        const vRate = line.vatRate !== undefined && line.vatRate !== null && Number(line.vatRate) > 0 && Number(line.vatRate) <= 1 ? Number(line.vatRate) : 0.18;

        let lineValBefore = (invoicedQty > 0 && unitPrice > 0)
          ? Math.round(invoicedQty * unitPrice * 100) / 100
          : parseNumber(line.valueBeforeVat) > 0
            ? parseNumber(line.valueBeforeVat)
            : parseNumber((line as any).totalBeforeVat) > 0
              ? parseNumber((line as any).totalBeforeVat)
              : Math.round(invoicedQty * unitPrice * 100) / 100;

        if (lineValBefore === 0 && invSubtotal > 0 && lines.length === 1) {
          lineValBefore = invSubtotal;
        }

        if (unitPrice === 0 && invoicedQty > 0 && lineValBefore > 0) {
          unitPrice = Math.round((lineValBefore / invoicedQty) * 100) / 100;
        }

        let lineVat = Math.round(lineValBefore * vRate * 100) / 100;
        const explicitLineVat = parseNumber(line.vatAmount);
        if (explicitLineVat > 0 && explicitLineVat <= lineValBefore * 0.35) {
          lineVat = explicitLineVat;
        }

        const lineValAfter = Math.round((lineValBefore + lineVat) * 100) / 100;

        flattenedRows.push({
          'INVOICE NUMBER': invNumber,
          'INVOICE DATE': invDate,
          'PURCHASE ORDER NUMBER': poNum,
          'CUSTOMER NAME': custName,
          'DESTINATION': destination,
          'CONTRACT': contract,
          'PO DATE': poDate,
          'LINE ITEM #': idx + 1,
          'ITEM DESCRIPTION': line.itemDescription || `Line Item ${idx + 1}`,
          'UOM': line.unitOfMeasure || 'PCS',
          'INVOICED QUANTITY': invoicedQty,
          'ORIGINAL PO QTY': poQty,
          'UNIT PRICE': unitPrice,
          'LINE VALUE BEFORE VAT': lineValBefore,
          'LINE VAT': lineVat,
          'LINE VALUE AFTER VAT': lineValAfter,
          'TOTAL INVOICE BEFORE VAT': invSubtotal > 0 ? invSubtotal : lineValBefore,
          'TOTAL INVOICE VAT': invVat > 0 ? invVat : lineVat,
          'TOTAL INVOICE AFTER VAT': invTotal > 0 ? invTotal : lineValAfter,
          'PAYMENT STATUS': paymentStatus,
          'COMMENT': line.comment || invComment,
          'NOTES': invNotes,
          'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': invNotes || line.comment || invComment,
        });
      });
    } else {
      // If invoice has no line item breakdown, export header as a single line item so no data is omitted
      flattenedRows.push({
        'INVOICE NUMBER': invNumber,
        'INVOICE DATE': invDate,
        'PURCHASE ORDER NUMBER': poNum,
        'CUSTOMER NAME': custName,
        'DESTINATION': destination,
        'CONTRACT': contract,
        'PO DATE': poDate,
        'LINE ITEM #': 1,
        'ITEM DESCRIPTION': invNotes || 'Invoice Summary Record',
        'UOM': 'LOT',
        'INVOICED QUANTITY': 1,
        'ORIGINAL PO QTY': 1,
        'UNIT PRICE': invSubtotal,
        'LINE VALUE BEFORE VAT': invSubtotal,
        'LINE VAT': invVat,
        'LINE VALUE AFTER VAT': invTotal,
        'TOTAL INVOICE BEFORE VAT': invSubtotal,
        'TOTAL INVOICE VAT': invVat,
        'TOTAL INVOICE AFTER VAT': invTotal,
        'PAYMENT STATUS': paymentStatus,
        'COMMENT': invComment,
        'NOTES': invNotes,
        'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': invNotes || invComment,
      });
    }

    summaryRows.push({
      '#': invIdx + 1,
      'INVOICE NUMBER': invNumber,
      'INVOICE DATE': invDate,
      'PURCHASE ORDER NUMBER': poNum,
      'CUSTOMER NAME': custName,
      'DESTINATION': destination,
      'CONTRACT': contract,
      'STATUS': invStatus,
      'TOTAL ITEMS COUNT': lines ? lines.length : 1,
      'SUBTOTAL BEFORE VAT (TZS)': invSubtotal,
      'TOTAL VAT (TZS)': invVat,
      'GRAND TOTAL (TZS)': invTotal,
      'AMOUNT PAID (TZS)': paidAmt,
      'OUTSTANDING BALANCE (TZS)': pendingBalance,
      'PAYMENT STATUS': paymentStatus,
      'COMMENT / REMARKS': invComment,
      'NOTES': invNotes,
    });
  });

  const wb = XLSX.utils.book_new();

  // Sheet 1: Invoices_Database (Primary Import & Backup Sheet)
  const wsDatabase = XLSX.utils.json_to_sheet(flattenedRows);
  // Auto-fit column widths
  if (flattenedRows.length > 0) {
    const colKeys = Object.keys(flattenedRows[0]);
    wsDatabase['!cols'] = colKeys.map((key) => {
      let maxLen = key.length;
      for (let i = 0; i < Math.min(flattenedRows.length, 50); i++) {
        const valStr = String(flattenedRows[i]?.[key] ?? '');
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 45);
      }
      return { wch: Math.max(maxLen + 3, 12) };
    });
  }
  XLSX.utils.book_append_sheet(wb, wsDatabase, 'Invoices_Database');

  // Sheet 2: Invoices_Summary (Header Overview)
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  if (summaryRows.length > 0) {
    const colKeys = Object.keys(summaryRows[0]);
    wsSummary['!cols'] = colKeys.map((key) => {
      let maxLen = key.length;
      for (let i = 0; i < Math.min(summaryRows.length, 50); i++) {
        const valStr = String(summaryRows[i]?.[key] ?? '');
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 45);
      }
      return { wch: Math.max(maxLen + 3, 12) };
    });
  }
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Invoices_Summary');

  XLSX.writeFile(wb, filename);
};

export const generateSampleInvoiceExcelTemplate = () => {
  const sampleInvoiceRows = [
    {
      'INVOICE NUMBER': 'CRU001',
      'INVOICE DATE': '2026-08-28',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'PO DATE': '2026-08-15',
      'ITEM DESCRIPTION': 'High-Grade Steel Reinforcement Bars 16mm',
      'UOM': 'TONS',
      'INVOICED QUANTITY': 25,
      'ORIGINAL PO QTY': 50,
      'UNIT PRICE': 980.00,
      'LINE VALUE BEFORE VAT': 24500.00,
      'LINE VAT': 4410.00,
      'LINE VALUE AFTER VAT': 28910.00,
      'PAYMENT STATUS': 'UNPAID',
      'COMMENT': 'Okay',
      'NOTES': 'First partial billing batch',
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'DN-2026-089 / First partial billing batch'
    },
    {
      'INVOICE NUMBER': 'CRU001',
      'INVOICE DATE': '2026-08-28',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'PO DATE': '2026-08-15',
      'ITEM DESCRIPTION': 'Hydraulic Valve Assembly Type 4B',
      'UOM': 'PCS',
      'INVOICED QUANTITY': 10,
      'ORIGINAL PO QTY': 20,
      'UNIT PRICE': 420.00,
      'LINE VALUE BEFORE VAT': 4200.00,
      'LINE VAT': 756.00,
      'LINE VALUE AFTER VAT': 4956.00,
      'PAYMENT STATUS': 'UNPAID',
      'COMMENT': 'Okay',
      'NOTES': 'First partial billing batch',
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'DN-2026-090 / High priority shipment'
    },
    {
      'INVOICE NUMBER': 'GRB001',
      'INVOICE DATE': '2026-08-30',
      'PURCHASE ORDER NUMBER': 'PO-2026-9042',
      'CUSTOMER NAME': 'Global Mining & Energy Corp',
      'DESTINATION': 'Mwanza Goldfield Logistics Hub',
      'CONTRACT': 'CNT-MINE-442',
      'PO DATE': '2026-08-20',
      'ITEM DESCRIPTION': 'Industrial Lubricant Synthetic 200L Drum',
      'UOM': 'DRUMS',
      'INVOICED QUANTITY': 40,
      'ORIGINAL PO QTY': 40,
      'UNIT PRICE': 230.00,
      'LINE VALUE BEFORE VAT': 9200.00,
      'LINE VAT': 1656.00,
      'LINE VALUE AFTER VAT': 10856.00,
      'PAYMENT STATUS': 'PAID',
      'COMMENT': 'Full batch invoiced',
      'NOTES': 'Fully delivered and verified by site manager',
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'Fully delivered and verified by site manager'
    },
    {
      'INVOICE NUMBER': 'CRU002',
      'INVOICE DATE': '2026-09-01',
      'PURCHASE ORDER NUMBER': 'N/A (No PO Reference)',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'N/A',
      'CONTRACT': 'N/A',
      'PO DATE': '2026-09-01',
      'ITEM DESCRIPTION': 'Leaflet Cancelled / Voided',
      'UOM': 'PCS',
      'INVOICED QUANTITY': 0,
      'ORIGINAL PO QTY': 0,
      'UNIT PRICE': 0.00,
      'LINE VALUE BEFORE VAT': 0.00,
      'LINE VAT': 0.00,
      'LINE VALUE AFTER VAT': 0.00,
      'PAYMENT STATUS': 'UNPAID',
      'COMMENT': 'Cancelled (No PO Reference)',
      'NOTES': 'Cancelled / Voided Leaflet',
      'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)': 'Cancelled Leaflet'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleInvoiceRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices_Template');
  XLSX.writeFile(wb, 'Invoice_Upload_Template.xlsx');
};

export const generateSampleDeliveryNoteExcelTemplate = () => {
  const sampleDeliveryRows = [
    {
      'DELIVERY NOTE NUMBER': 'DN001',
      'DELIVERY DATE': '2026-08-27',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'CARRIER': 'Enterprise Logistics Fleet',
      'VEHICLE NUMBER': 'T 492 DXB',
      'DRIVER NAME': 'Hassan Rashid',
      'RECEIVED BY': 'Site Receiving Officer',
      'ITEM DESCRIPTION': 'High-Grade Steel Reinforcement Bars 16mm',
      'UOM': 'TONS',
      'DELIVERED QUANTITY': 25,
      'UNIT PRICE': 980.00,
      'LINE VALUE BEFORE VAT': 24500.00,
      'LINE VAT': 4410.00,
      'LINE VALUE AFTER VAT': 28910.00,
      'STATUS': 'Okay',
      'NOTES': 'Delivered in full batch condition',
    },
    {
      'DELIVERY NOTE NUMBER': 'DN001',
      'DELIVERY DATE': '2026-08-27',
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'CARRIER': 'Enterprise Logistics Fleet',
      'VEHICLE NUMBER': 'T 492 DXB',
      'DRIVER NAME': 'Hassan Rashid',
      'RECEIVED BY': 'Site Receiving Officer',
      'ITEM DESCRIPTION': 'Hydraulic Valve Assembly Type 4B',
      'UOM': 'PCS',
      'DELIVERED QUANTITY': 10,
      'UNIT PRICE': 420.00,
      'LINE VALUE BEFORE VAT': 4200.00,
      'LINE VAT': 756.00,
      'LINE VALUE AFTER VAT': 4956.00,
      'STATUS': 'Okay',
      'NOTES': 'First delivery batch',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleDeliveryRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delivery_Notes_Template');
  XLSX.writeFile(wb, 'Delivery_Note_Upload_Template.xlsx');
};

export const generateSamplePOExcelTemplate = () => {
  const samplePORows = [
    {
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'DATE(LPO)': '2026-08-15',
      'ITEM DESCRIPTION': 'High-Grade Steel Reinforcement Bars 16mm',
      'UNIT OF MEASURE': 'TONS',
      'QUANTITY(LPO)': 50,
      'UNIT COST': 800.00,
      'UNIT PRICE': 980.00,
      'VALUE BEFORE VAT': 49000.00,
      'VAT(18%)': 8820.00,
      'VALUE AFTER VAT': 57820.00,
    },
    {
      'PURCHASE ORDER NUMBER': 'PO-2026-8801',
      'CUSTOMER NAME': 'Acme Engineering Ltd',
      'DESTINATION': 'Dar es Salaam Port - Site A',
      'CONTRACT': 'CNT-EAST-091',
      'DATE(LPO)': '2026-08-15',
      'ITEM DESCRIPTION': 'Hydraulic Valve Assembly Type 4B',
      'UNIT OF MEASURE': 'PCS',
      'QUANTITY(LPO)': 20,
      'UNIT COST': 340.00,
      'UNIT PRICE': 420.00,
      'VALUE BEFORE VAT': 8400.00,
      'VAT(18%)': 1512.00,
      'VALUE AFTER VAT': 9912.00,
    },
    {
      'PURCHASE ORDER NUMBER': 'PO-2026-9042',
      'CUSTOMER NAME': 'Global Mining & Energy Corp',
      'DESTINATION': 'Mwanza Goldfield Logistics Hub',
      'CONTRACT': 'CNT-MINE-442',
      'DATE(LPO)': '2026-08-20',
      'ITEM DESCRIPTION': 'Industrial Lubricant Synthetic 200L Drum',
      'UNIT OF MEASURE': 'DRUMS',
      'QUANTITY(LPO)': 40,
      'UNIT COST': 190.00,
      'UNIT PRICE': 230.00,
      'VALUE BEFORE VAT': 9200.00,
      'VAT(18%)': 1656.00,
      'VALUE AFTER VAT': 10856.00,
    }
  ];

  const ws = XLSX.utils.json_to_sheet(samplePORows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase_Orders_Template');
  XLSX.writeFile(wb, 'Purchase_Order_Upload_Template.xlsx');
};

export const readExcelHeadersAndSample = async (file: File): Promise<{ headers: string[]; previewRows: any[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        if (!rawRows || rawRows.length === 0) {
          throw new Error('No data found in uploaded spreadsheet.');
        }
        const headers = Object.keys(rawRows[0] || {});
        resolve({
          headers,
          previewRows: rawRows.slice(0, 5),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const parseExcelInvoiceData = async (
  file: File,
  customColumnMap?: Record<string, string>
): Promise<{ invoices: InvoiceRecord[]; totalRows: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('Spreadsheet has no data sheet.');
        }

        // Dynamically expand worksheet range if !ref was truncated
        let maxR = 0;
        let maxC = 0;
        let minR = 0;
        let minC = 0;
        if (worksheet['!ref']) {
          try {
            const decoded = XLSX.utils.decode_range(worksheet['!ref']);
            minR = decoded.s.r;
            minC = decoded.s.c;
            maxR = decoded.e.r;
            maxC = decoded.e.c;
          } catch (_) {}
        }
        const cellRegex = /^([A-Z]+)(\d+)$/;
        for (const cellKey of Object.keys(worksheet)) {
          if (cellKey[0] === '!') continue;
          const match = cellKey.match(cellRegex);
          if (match) {
            const colStr = match[1];
            const rowNum = parseInt(match[2], 10) - 1;
            let colNum = 0;
            for (let i = 0; i < colStr.length; i++) {
              colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
            }
            colNum -= 1;
            if (rowNum > maxR) maxR = rowNum;
            if (colNum > maxC) maxC = colNum;
          }
        }
        worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });

        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('Spreadsheet has no data rows.');
        }

        const mapField = (row: any, fieldKey: string, defaultVariants: string[], negativeTokens: string[] = []): any => {
          // Check custom mapping first if provided
          if (customColumnMap && customColumnMap[fieldKey] && row[customColumnMap[fieldKey]] !== undefined) {
            return row[customColumnMap[fieldKey]];
          }
          return extractRowValue(row, defaultVariants, negativeTokens);
        };

        // Group rows by invoice number
        const groupedByInvoice = new Map<string, any[]>();

        rawRows.forEach((row, idx) => {
          const invNumRaw = String(
            mapField(row, 'invoiceNumber', ['INVOICE NUMBER', 'INVOICE NO', 'INV #', 'INVOICE #', 'INVOICE_NO', 'INVOICE', 'INV NO', 'BILL NUMBER'], ['DATE', 'STATUS', 'ITEM', 'AMOUNT']) || `INV-IMP-${idx + 1}`
          ).trim();

          if (!invNumRaw) return;

          if (!groupedByInvoice.has(invNumRaw)) {
            groupedByInvoice.set(invNumRaw, []);
          }
          groupedByInvoice.get(invNumRaw)!.push(row);
        });

        const parsedInvoices: InvoiceRecord[] = [];

        groupedByInvoice.forEach((rows, invNumber) => {
          const firstRow = rows[0];

          const invoiceDate = parseDateString(
            mapField(firstRow, 'invoiceDate', ['INVOICE DATE', 'INV DATE', 'DATE', 'BILL DATE'])
          );

          const poNumber = cleanPoNumber(
            mapField(
              firstRow,
              'poNumber',
              ['PURCHASE ORDER NUMBER', 'PURCHASE ORDER NO', 'PO NUMBER', 'PO #', 'PO NO', 'PURCHASE ORDER', 'LPO NO', 'LPONUMBER', 'LPO'],
              ['DATE', 'TIME', 'STATUS', 'DESC', 'ITEM', 'PRICE', 'AMOUNT', 'TOTAL']
            )
          ) || 'N/A';

          const customerName = String(
            mapField(firstRow, 'customerName', ['CUSTOMER NAME', 'CUSTOMER', 'CLIENT', 'CLIENT NAME', 'BUYER', 'ACCOUNT'], ['PO', 'DATE', 'PRICE']) || 'General Customer'
          ).trim();

          const destination = String(
            mapField(firstRow, 'destination', ['DESTINATION', 'LOCATION', 'DELIVERY DESTINATION', 'SITE', 'SHIP TO'], ['CUSTOMER', 'DATE']) || 'Default Location'
          ).trim();

          const contract = String(
            mapField(firstRow, 'contract', ['CONTRACT', 'CONTRACT NO', 'AGREEMENT', 'CONTRACT NUMBER']) || 'N/A'
          ).trim();

          const poDate = parseDateString(
            mapField(firstRow, 'poDate', ['PO DATE', 'LPO DATE', 'ORDER DATE', 'DATE(lpo)', 'PODATE']) || invoiceDate
          );

          const comment = String(
            mapField(firstRow, 'comment', ['COMMENT', 'LINE COMMENT', 'REMARKS', 'INVOICE COMMENT', 'STATUS COMMENT']) || 'Okay'
          ).trim();

          const notes = String(
            mapField(firstRow, 'notes', [
              'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)',
              'DELIVERY NOTES / GENERAL REMARKS',
              'DELIVERY NOTES',
              'NOTES',
              'GENERAL REMARKS',
              'REMARKS',
            ]) || ''
          ).trim();

          const paymentStatusRaw = String(
            mapField(firstRow, 'paymentStatus', ['PAYMENT STATUS', 'PAY STATUS', 'SETTLEMENT', 'PAID STATUS']) || 'UNPAID'
          ).toUpperCase();

          const isCancelled =
            comment.toLowerCase().includes('cancel') ||
            notes.toLowerCase().includes('cancel') ||
            poNumber.toLowerCase().includes('cancel');

          const status: 'ACTIVE' | 'CANCELLED' = isCancelled ? 'CANCELLED' : 'ACTIVE';

          let subtotalBeforeVat = 0;
          let totalVat = 0;
          let totalAfterVat = 0;

          const lines = rows.map((r, lineIdx) => {
            const itemDescription = String(
              mapField(r, 'itemDescription', ['ITEM DESCRIPTION', 'DESCRIPTION', 'ITEM', 'PRODUCT', 'PART DESCRIPTION', 'PART NAME']) || `Item ${lineIdx + 1}`
            ).trim();

            const unitOfMeasure = String(
              mapField(r, 'unitOfMeasure', ['UOM', 'UNIT OF MEAS', 'UNIT OF MEASURE', 'UNIT', 'MEASURE']) || 'PCS'
            ).trim();

            const invoicedQuantity = parseNumber(
              mapField(r, 'invoicedQuantity', ['INVOICED QUANTITY', 'INVOICED QTY', 'QTY INVOICED', 'BILL QTY', 'QUANTITY', 'QTY']),
              isCancelled ? 0 : 1
            );

            const poQuantity = parseNumber(
              mapField(r, 'poQuantity', ['ORIGINAL PO QTY', 'PO QUANTITY', 'PO QTY', 'TOTAL PO QTY', 'ORDER QTY']),
              invoicedQuantity
            );

            const unitPrice = parseNumber(
              mapField(r, 'unitPrice', ['UNIT PRICE', 'PRICE', 'RATE', 'SELLING PRICE']),
              0
            );

            let lineBeforeVat = parseNumber(
              mapField(r, 'valueBeforeVat', ['LINE VALUE BEFORE VAT', 'VALUE BEFORE VAT', 'TOTAL BEFORE VAT', 'SUBTOTAL', 'AMOUNT']),
              0
            );
            if (lineBeforeVat === 0 && invoicedQuantity > 0 && unitPrice > 0) {
              lineBeforeVat = Math.round(invoicedQuantity * unitPrice * 100) / 100;
            }

            let lineVat = parseNumber(
              mapField(r, 'vatAmount', ['LINE VAT', 'VAT', 'VAT AMOUNT', 'TAX']),
              0
            );
            if (lineVat === 0 && lineBeforeVat > 0) {
              lineVat = Math.round(lineBeforeVat * 0.18 * 100) / 100;
            }

            let lineAfterVat = parseNumber(
              mapField(r, 'valueAfterVat', ['LINE VALUE AFTER VAT', 'VALUE AFTER VAT', 'TOTAL AFTER VAT', 'LINE TOTAL', 'TOTAL']),
              0
            );
            if (lineAfterVat === 0) {
              lineAfterVat = Math.round((lineBeforeVat + lineVat) * 100) / 100;
            }

            const lineComment = String(
              mapField(r, 'lineComment', ['LINE COMMENT', 'ITEM COMMENT', 'COMMENT']) || comment || 'Okay'
            ).trim();

            subtotalBeforeVat += lineBeforeVat;
            totalVat += lineVat;
            totalAfterVat += lineAfterVat;

            return {
              poLineId: `imp-line-${Date.now()}-${lineIdx}-${Math.random().toString(36).substring(2, 6)}`,
              itemDescription,
              unitOfMeasure,
              poQuantity,
              alreadyInvoicedQuantity: invoicedQuantity,
              availableQuantity: Math.max(0, poQuantity - invoicedQuantity),
              invoicedQuantity,
              unitCost: unitPrice * 0.85,
              unitPrice,
              valueBeforeVat: lineBeforeVat,
              vatRate: 0.18,
              vatAmount: lineVat,
              valueAfterVat: lineAfterVat,
              isSelected: true,
              comment: lineComment,
            };
          });

          // Check if top-level totals were specified in spreadsheet
          const explicitTotalBeforeVat = parseNumber(
            mapField(firstRow, 'totalBeforeVat', ['TOTAL INVOICE BEFORE VAT', 'SUBTOTAL EXCL VAT', 'INVOICE SUBTOTAL']),
            0
          );
          const explicitTotalVat = parseNumber(
            mapField(firstRow, 'totalVat', ['TOTAL INVOICE VAT', 'INVOICE VAT', 'TOTAL VAT']),
            0
          );
          const explicitTotalAfterVat = parseNumber(
            mapField(firstRow, 'totalAfterVat', ['TOTAL INVOICE AFTER VAT', 'GRAND TOTAL', 'TOTAL INCL VAT', 'INVOICE TOTAL']),
            0
          );

          if (explicitTotalAfterVat > 0) {
            totalAfterVat = explicitTotalAfterVat;
            totalVat = explicitTotalVat || Math.round(explicitTotalAfterVat * (0.18 / 1.18) * 100) / 100;
            subtotalBeforeVat = explicitTotalBeforeVat || Math.round((totalAfterVat - totalVat) * 100) / 100;
          } else {
            subtotalBeforeVat = Math.round(subtotalBeforeVat * 100) / 100;
            totalVat = Math.round(totalVat * 100) / 100;
            totalAfterVat = Math.round(totalAfterVat * 100) / 100;
          }

          let paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
          if (paymentStatusRaw.includes('PAID') && !paymentStatusRaw.includes('UN')) {
            paymentStatus = 'PAID';
          } else if (paymentStatusRaw.includes('PART')) {
            paymentStatus = 'PARTIAL';
          }

          parsedInvoices.push({
            id: `INV-IMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            invoiceNumber: invNumber,
            invoiceDate,
            poNumber,
            customerName,
            destination,
            contract,
            poDate,
            lines,
            subtotalBeforeVat,
            totalVat,
            totalAfterVat,
            paidAmount: paymentStatus === 'PAID' ? totalAfterVat : 0,
            paymentStatus,
            notes,
            comment,
            status,
            isCancelled,
            cancelReason: isCancelled ? (comment || 'Cancelled') : undefined,
            createdAt: new Date().toISOString(),
            lastModifiedBy: 'Excel Database Import',
          });
        });

        resolve({ invoices: parsedInvoices, totalRows: rawRows.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

export const parseExcelDeliveryNoteData = async (
  file: File,
  customColumnMap?: Record<string, string>
): Promise<{ deliveryNotes: DeliveryNoteRecord[]; totalRows: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('Spreadsheet has no data sheet.');
        }

        // Dynamically expand worksheet range if !ref was truncated
        let maxR = 0;
        let maxC = 0;
        let minR = 0;
        let minC = 0;
        if (worksheet['!ref']) {
          try {
            const decoded = XLSX.utils.decode_range(worksheet['!ref']);
            minR = decoded.s.r;
            minC = decoded.s.c;
            maxR = decoded.e.r;
            maxC = decoded.e.c;
          } catch (_) {}
        }
        const cellRegex = /^([A-Z]+)(\d+)$/;
        for (const cellKey of Object.keys(worksheet)) {
          if (cellKey[0] === '!') continue;
          const match = cellKey.match(cellRegex);
          if (match) {
            const colStr = match[1];
            const rowNum = parseInt(match[2], 10) - 1;
            let colNum = 0;
            for (let i = 0; i < colStr.length; i++) {
              colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
            }
            colNum -= 1;
            if (rowNum > maxR) maxR = rowNum;
            if (colNum > maxC) maxC = colNum;
          }
        }
        worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });

        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('Spreadsheet has no data rows.');
        }

        const mapField = (row: any, fieldKey: string, defaultVariants: string[], negativeTokens: string[] = []): any => {
          if (customColumnMap && customColumnMap[fieldKey] && row[customColumnMap[fieldKey]] !== undefined) {
            return row[customColumnMap[fieldKey]];
          }
          return extractRowValue(row, defaultVariants, negativeTokens);
        };

        // Group rows by delivery note number
        const groupedByDN = new Map<string, any[]>();

        rawRows.forEach((row, idx) => {
          const dnNumRaw = String(
            mapField(row, 'deliveryNoteNumber', ['DELIVERY NOTE NUMBER', 'DELIVERY NOTE NO', 'DN NUMBER', 'DN NO', 'DN #', 'DELIVERY NUMBER'], ['DATE', 'STATUS', 'ITEM', 'AMOUNT']) || `DN-IMP-${idx + 1}`
          ).trim();

          if (!dnNumRaw) return;

          if (!groupedByDN.has(dnNumRaw)) {
            groupedByDN.set(dnNumRaw, []);
          }
          groupedByDN.get(dnNumRaw)!.push(row);
        });

        const parsedDeliveryNotes: DeliveryNoteRecord[] = [];

        groupedByDN.forEach((rows, dnNumber) => {
          const firstRow = rows[0];

          const deliveryDate = parseDateString(
            mapField(firstRow, 'deliveryDate', ['DELIVERY DATE', 'DN DATE', 'DATE', 'ISSUE DATE'])
          );

          const poNumber = cleanPoNumber(
            mapField(
              firstRow,
              'poNumber',
              ['PURCHASE ORDER NUMBER', 'PURCHASE ORDER NO', 'PO NUMBER', 'PO #', 'PO NO', 'PURCHASE ORDER', 'LPO NO', 'LPONUMBER', 'LPO'],
              ['DATE', 'TIME', 'STATUS', 'DESC', 'ITEM', 'PRICE', 'AMOUNT', 'TOTAL']
            )
          ) || 'N/A';

          const customerName = String(
            mapField(firstRow, 'customerName', ['CUSTOMER NAME', 'CUSTOMER', 'CLIENT', 'CLIENT NAME', 'BUYER', 'ACCOUNT'], ['PO', 'DATE', 'PRICE']) || 'General Customer'
          ).trim();

          const destination = String(
            mapField(firstRow, 'destination', ['DESTINATION', 'LOCATION', 'DELIVERY DESTINATION', 'SITE', 'SHIP TO'], ['CUSTOMER', 'DATE']) || 'Default Location'
          ).trim();

          const contract = String(
            mapField(firstRow, 'contract', ['CONTRACT', 'CONTRACT NO', 'AGREEMENT', 'CONTRACT NUMBER']) || 'N/A'
          ).trim();

          const poDate = parseDateString(
            mapField(firstRow, 'poDate', ['PO DATE', 'LPO DATE', 'ORDER DATE', 'DATE(lpo)', 'PODATE']) || deliveryDate
          );

          const carrier = String(
            mapField(firstRow, 'carrier', ['CARRIER', 'LOGISTICS PROVIDER', 'TRANSPORTER', 'HAULAGE COMPANY']) || ''
          ).trim();

          const vehicleNumber = String(
            mapField(firstRow, 'vehicleNumber', ['VEHICLE NUMBER', 'VEHICLE NO', 'PLATE NUMBER', 'TRUCK NUMBER']) || ''
          ).trim();

          const driverName = String(
            mapField(firstRow, 'driverName', ['DRIVER NAME', 'DRIVER']) || ''
          ).trim();

          const receivedBy = String(
            mapField(firstRow, 'receivedBy', ['RECEIVED BY', 'RECEIVER', 'RECEIVING OFFICER']) || ''
          ).trim();

          const comment = String(
            mapField(firstRow, 'comment', ['STATUS', 'COMMENT', 'LINE COMMENT', 'DN COMMENT']) || 'Okay'
          ).trim();

          const notes = String(
            mapField(firstRow, 'notes', [
              'NOTES',
              'DELIVERY NOTES / GENERAL REMARKS (OPTIONAL)',
              'DELIVERY NOTES / GENERAL REMARKS',
              'GENERAL REMARKS',
              'REMARKS',
            ]) || ''
          ).trim();

          const isCancelled =
            comment.toLowerCase().includes('cancel') ||
            notes.toLowerCase().includes('cancel') ||
            poNumber.toLowerCase().includes('cancel');

          const status: 'ACTIVE' | 'CANCELLED' = isCancelled ? 'CANCELLED' : 'ACTIVE';

          let subtotalBeforeVat = 0;
          let totalVat = 0;
          let totalDeliveredValue = 0;
          let totalDeliveredQuantity = 0;

          const lines = rows.map((r, lineIdx) => {
            const itemDescription = String(
              mapField(r, 'itemDescription', ['ITEM DESCRIPTION', 'DESCRIPTION', 'ITEM', 'PRODUCT', 'PART DESCRIPTION', 'PART NAME']) || `Item ${lineIdx + 1}`
            ).trim();

            const unitOfMeasure = String(
              mapField(r, 'unitOfMeasure', ['UOM', 'UNIT OF MEAS', 'UNIT OF MEASURE', 'UNIT', 'MEASURE']) || 'PCS'
            ).trim();

            const deliveredQuantity = parseNumber(
              mapField(r, 'deliveredQuantity', ['DELIVERED QUANTITY', 'DELIVERED QTY', 'QTY DELIVERED', 'QUANTITY', 'QTY']),
              isCancelled ? 0 : 1
            );

            const poQuantity = parseNumber(
              mapField(r, 'poQuantity', ['ORIGINAL PO QTY', 'PO QUANTITY', 'PO QTY', 'TOTAL PO QTY', 'ORDER QTY']),
              deliveredQuantity
            );

            const unitPrice = parseNumber(
              mapField(r, 'unitPrice', ['UNIT PRICE', 'PRICE', 'RATE', 'SELLING PRICE']),
              0
            );

            let lineBeforeVat = parseNumber(
              mapField(r, 'valueBeforeVat', ['LINE VALUE BEFORE VAT', 'VALUE BEFORE VAT', 'TOTAL BEFORE VAT', 'SUBTOTAL', 'AMOUNT']),
              0
            );
            if (lineBeforeVat === 0 && deliveredQuantity > 0 && unitPrice > 0) {
              lineBeforeVat = Math.round(deliveredQuantity * unitPrice * 100) / 100;
            }

            let lineAfterVat = parseNumber(
              mapField(r, 'valueAfterVat', ['LINE VALUE AFTER VAT', 'VALUE AFTER VAT', 'TOTAL AFTER VAT', 'LINE TOTAL', 'TOTAL']),
              0
            );

            let lineVat = parseNumber(
              mapField(r, 'vatAmount', ['LINE VAT', 'VAT AMOUNT', 'VAT', 'TAX']),
              0
            );
            if (lineVat === 0) {
              if (lineBeforeVat > 0 && lineAfterVat > lineBeforeVat) {
                lineVat = Math.round((lineAfterVat - lineBeforeVat) * 100) / 100;
              } else if (lineBeforeVat > 0) {
                lineVat = Math.round(lineBeforeVat * 0.18 * 100) / 100;
              }
            }

            if (lineAfterVat === 0) {
              lineAfterVat = Math.round((lineBeforeVat + lineVat) * 100) / 100;
            }

            const lineComment = String(
              mapField(r, 'lineComment', ['LINE COMMENT', 'ITEM COMMENT', 'COMMENT']) || comment || 'Okay'
            ).trim();

            subtotalBeforeVat += lineBeforeVat;
            totalVat += lineVat;
            totalDeliveredValue += lineAfterVat;
            totalDeliveredQuantity += deliveredQuantity;

            return {
              poLineId: `imp-line-${Date.now()}-${lineIdx}-${Math.random().toString(36).substring(2, 6)}`,
              itemDescription,
              unitOfMeasure,
              poQuantity,
              alreadyDeliveredQuantity: deliveredQuantity,
              availableQuantity: Math.max(0, poQuantity - deliveredQuantity),
              deliveredQuantity,
              unitCost: unitPrice * 0.85,
              unitPrice,
              valueBeforeVat: lineBeforeVat,
              vatRate: 0.18,
              vatAmount: lineVat,
              valueAfterVat: lineAfterVat,
              isSelected: true,
              comment: lineComment,
            };
          });

          subtotalBeforeVat = Math.round(subtotalBeforeVat * 100) / 100;
          totalVat = Math.round(totalVat * 100) / 100;
          totalDeliveredValue = Math.round(totalDeliveredValue * 100) / 100;

          parsedDeliveryNotes.push({
            id: `DN-IMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            deliveryNoteNumber: dnNumber,
            deliveryDate,
            poNumber,
            customerName,
            destination,
            contract,
            poDate,
            carrier,
            vehicleNumber,
            driverName,
            receivedBy,
            lines,
            subtotalBeforeVat,
            totalVat,
            totalDeliveredQuantity,
            totalDeliveredValue,
            notes,
            comment,
            status,
            isCancelled,
            cancelReason: isCancelled ? (comment || 'Cancelled') : undefined,
            createdAt: new Date().toISOString(),
            lastModifiedBy: 'Excel Database Import',
          });
        });

        resolve({ deliveryNotes: parsedDeliveryNotes, totalRows: rawRows.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
