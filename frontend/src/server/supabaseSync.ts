var __defProp = Object.defineProperty;
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || "https://dhmqibpcljxvfevcpwjr.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";
let supabaseClient = null;
function getSupabaseServerClient() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_KEY) {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
      });
      console.log(
        "\u2705 Supabase server client initialized for project:",
        SUPABASE_URL,
      );
    } catch (e) {
      console.error("Failed to initialize Supabase server client:", e);
    }
  }
  return supabaseClient;
}
__name(getSupabaseServerClient, "getSupabaseServerClient");
function getSupabasePublicConfig() {
  return {
    url: SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_KEY,
    isConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY),
  };
}
__name(getSupabasePublicConfig, "getSupabasePublicConfig");
function safeDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}
__name(safeDate, "safeDate");
async function executeWithRetry(op, maxRetries = 3, baseDelayMs = 600) {
  let result = {};
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      result = await op();
      if (!result.error) return result;
      const msg = String(
        result.error?.message || result.error || "",
      ).toLowerCase();
      const isTransient =
        msg.includes("timeout") ||
        msg.includes("upstream") ||
        msg.includes("failed to fetch") ||
        msg.includes("network") ||
        result.error?.status === 504 ||
        result.error?.status === 502 ||
        result.error?.status === 429;
      if (attempt < maxRetries && isTransient) {
        const delay =
          baseDelayMs * Math.pow(1.8, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return result;
    } catch (err) {
      result = { error: err };
      if (attempt < maxRetries) {
        const delay =
          baseDelayMs * Math.pow(1.8, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return result;
    }
  }
  return result;
}
__name(executeWithRetry, "executeWithRetry");
async function fetchTableWithPaginationAndRetry(
  client,
  table,
  pageSize = 1e3,
  maxRetries = 3,
) {
  const allRows = [];
  let page = 0;
  while (true) {
    let pageData = null;
    let fetchedOk = false;
    const startRange = page * pageSize;
    const endRange = (page + 1) * pageSize - 1;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await client
          .from(table)
          .select("*")
          .range(startRange, endRange);
        if (!error && Array.isArray(data)) {
          pageData = data;
          fetchedOk = true;
          break;
        }
        const errMsg = String(error?.message || error?.details || error || "");
        const isTransient =
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("network") ||
          errMsg.includes("timeout") ||
          error?.status === 429 ||
          (typeof error?.status === "number" && error.status >= 500);
        if (attempt < maxRetries && isTransient) {
          const delay = 400 * Math.pow(1.8, attempt) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (isTransient && pageSize >= 500) {
          try {
            const mid = startRange + Math.floor(pageSize / 2) - 1;
            const sub1 = await client
              .from(table)
              .select("*")
              .range(startRange, mid);
            if (!sub1.error && Array.isArray(sub1.data)) {
              await new Promise((r) => setTimeout(r, 60));
              const sub2 = await client
                .from(table)
                .select("*")
                .range(mid + 1, endRange);
              if (!sub2.error && Array.isArray(sub2.data)) {
                pageData = [...sub1.data, ...sub2.data];
                fetchedOk = true;
                break;
              }
            }
          } catch {}
        }
        console.warn(
          `[SupabaseServer] Note fetching ${table} page ${page}:`,
          errMsg,
        );
        break;
      } catch (err) {
        const errMsg = String(err?.message || err || "");
        if (attempt < maxRetries) {
          const delay = 400 * Math.pow(1.8, attempt) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn(
            `[SupabaseServer] Transient exception on ${table} page ${page}:`,
            errMsg,
          );
          break;
        }
      }
    }
    if (pageData && pageData.length > 0) {
      allRows.push(...pageData);
    }
    if (!fetchedOk || !pageData || pageData.length < pageSize) {
      break;
    }
    page++;
    await new Promise((r) => setTimeout(r, 50));
  }
  return allRows;
}
__name(fetchTableWithPaginationAndRetry, "fetchTableWithPaginationAndRetry");
async function fetchSupabaseComplete() {
  const client = getSupabaseServerClient();
  if (!client) {
    return {
      poLines: [],
      invoices: [],
      deliveryNotes: [],
      payments: [],
      issues: [],
    };
  }
  try {
    const poRows = await fetchTableWithPaginationAndRetry(
      client,
      "po_lines",
      500,
      3,
    );
    const poLines = (poRows || []).map((r) => ({
      id: r.id,
      customerName: r.customer_name || "",
      destination: r.destination || "",
      poNumber: r.po_number || "",
      contract: r.contract || "",
      itemDescription: r.item_description || "",
      date: r.po_date || "",
      unitOfMeasure: r.unit_of_measure || "UNIT",
      quantity: Number(r.quantity) || 0,
      unitCost: Number(r.unit_cost) || 0,
      unitPrice: Number(r.unit_price) || 0,
      valueBeforeVat: Number(r.value_before_vat) || 0,
      vatRate: Number(r.vat_rate) ?? 0.18,
      vatAmount: Number(r.vat_amount) || 0,
      valueAfterVat: Number(r.value_after_vat) || 0,
      remarks: r.remarks || "",
    }));
    const invRows = await fetchTableWithPaginationAndRetry(
      client,
      "invoices",
      500,
      3,
    );
    const invLineRows = await fetchTableWithPaginationAndRetry(
      client,
      "invoice_lines",
      500,
      3,
    );
    const invoiceLinesMap = new Map();
    (invLineRows || []).forEach((line) => {
      const arr = invoiceLinesMap.get(line.invoice_id) || [];
      arr.push({
        id: line.id,
        poLineId: line.po_line_id || "",
        itemDescription: line.item_description || "",
        unitOfMeasure: line.unit_of_measure || "UNIT",
        poQuantity: Number(line.po_quantity) || 0,
        alreadyInvoicedQuantity: Number(line.already_invoiced_quantity) || 0,
        availableQuantity: Number(line.available_quantity) || 0,
        invoicedQuantity: Number(line.invoiced_quantity) || 0,
        unitCost: Number(line.unit_cost) || 0,
        unitPrice: Number(line.unit_price) || 0,
        valueBeforeVat: Number(line.value_before_vat) || 0,
        vatRate: Number(line.vat_rate) ?? 0.18,
        vatAmount: Number(line.vat_amount) || 0,
        valueAfterVat: Number(line.value_after_vat) || 0,
        isSelected: line.is_selected !== false,
        comment: line.comment || "Okay",
      });
      invoiceLinesMap.set(line.invoice_id, arr);
    });
    const invoices = (invRows || []).map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number || "",
      invoiceDate: r.invoice_date || "",
      poNumber: r.po_number || "",
      customerName: r.customer_name || "",
      destination: r.destination || "",
      contract: r.contract || "",
      poDate: r.po_date || "",
      subtotalBeforeVat: Number(r.subtotal_before_vat) || 0,
      totalVat: Number(r.total_vat) || 0,
      totalAfterVat: Number(r.total_after_vat) || 0,
      paidAmount: Number(r.paid_amount) || 0,
      paymentStatus: r.payment_status || "UNPAID",
      notes: r.notes || "",
      comment: r.comment || "Okay",
      lines: invoiceLinesMap.get(r.id) || [],
      status: r.status || "ACTIVE",
      isCancelled: Boolean(r.is_cancelled),
      cancelReason: r.cancel_reason || "",
      isOfr: Boolean(r.is_ofr),
      ofrDetail: r.ofr_detail || "",
      hasIssue: Boolean(r.has_issue),
      issueComment: r.issue_comment || "",
      issueId: r.issue_id || "",
      issueStatus: r.issue_status || "PENDING",
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      createdAt: r.created_at || new Date().toISOString(),
    }));
    const dnRows = await fetchTableWithPaginationAndRetry(
      client,
      "delivery_notes",
      500,
      3,
    );
    const dnLineRows = await fetchTableWithPaginationAndRetry(
      client,
      "delivery_note_lines",
      500,
      3,
    );
    const dnLinesMap = new Map();
    (dnLineRows || []).forEach((line) => {
      const arr = dnLinesMap.get(line.delivery_note_id) || [];
      arr.push({
        id: line.id,
        poLineId: line.po_line_id || "",
        itemDescription: line.item_description || "",
        unitOfMeasure: line.unit_of_measure || "UNIT",
        poQuantity: Number(line.po_quantity) || 0,
        alreadyDeliveredQuantity: Number(line.already_delivered_quantity) || 0,
        availableQuantity: Number(line.available_quantity) || 0,
        deliveredQuantity: Number(line.delivered_quantity) || 0,
        unitCost: Number(line.unit_cost) || 0,
        unitPrice: Number(line.unit_price) || 0,
        valueBeforeVat: Number(line.value_before_vat) || 0,
        vatRate: Number(line.vat_rate) ?? 0.18,
        vatAmount: Number(line.vat_amount) || 0,
        valueAfterVat: Number(line.value_after_vat) || 0,
        comment:
          line.comment || (line.issue_comment ? line.issue_comment : "Okay"),
        hasIssue: Boolean(line.has_issue),
        issueComment: line.issue_comment || "",
        isSelected: line.is_selected !== false,
      });
      dnLinesMap.set(line.delivery_note_id, arr);
    });
    const deliveryNotes = (dnRows || []).map((r) => ({
      id: r.id,
      deliveryNoteNumber: r.delivery_note_number || "",
      deliveryDate: r.delivery_date || "",
      poNumber: r.po_number || "",
      customerName: r.customer_name || "",
      destination: r.destination || "",
      contract: r.contract || "",
      poDate: r.po_date || "",
      carrier: r.carrier || "",
      vehicleNumber: r.vehicle_number || "",
      driverName: r.driver_name || "",
      receivedBy: r.received_by || "",
      subtotalBeforeVat: Number(r.subtotal_before_vat) || 0,
      totalVat: Number(r.total_vat) || 0,
      totalDeliveredQuantity: Number(r.total_delivered_quantity) || 0,
      totalDeliveredValue: Number(r.total_delivered_value) || 0,
      notes: r.notes || "",
      comment: r.comment || r.notes || "Okay",
      lines: dnLinesMap.get(r.id) || [],
      status: r.status || "ACTIVE",
      isCancelled: Boolean(r.is_cancelled),
      cancelReason: r.cancel_reason || "",
      isOfr: Boolean(r.is_ofr),
      ofrDetail: r.ofr_detail || "",
      matchedInvoiceNumber: r.matched_invoice_number || "",
      isFullyInvoiced: Boolean(r.is_fully_invoiced),
      hasIssue: Boolean(r.has_issue),
      issueComment: r.issue_comment || "",
      issueId: r.issue_id || "",
      issueStatus: r.issue_status || "PENDING",
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      createdAt: r.created_at || new Date().toISOString(),
    }));
    const payRows = await fetchTableWithPaginationAndRetry(
      client,
      "payments",
      500,
      3,
    );
    const allocRows = await fetchTableWithPaginationAndRetry(
      client,
      "payment_allocations",
      500,
      3,
    );
    const allocsMap = new Map();
    (allocRows || []).forEach((a) => {
      const arr = allocsMap.get(a.payment_id) || [];
      arr.push({
        invoiceId: a.invoice_id || "",
        invoiceNumber: a.invoice_number || "",
        poNumber: a.po_number || "",
        customerName: a.customer_name || "",
        invoiceTotal: Number(a.invoice_total) || 0,
        alreadyPaid: Number(a.already_paid) || 0,
        pendingBalance: Number(a.pending_balance) || 0,
        allocatedAmount: Number(a.allocated_amount) || 0,
      });
      allocsMap.set(a.payment_id, arr);
    });
    const payments = (payRows || []).map((r) => ({
      id: r.id,
      paymentNumber: r.payment_number || "",
      paymentDate: r.payment_date || "",
      invoiceId: r.invoice_id || "",
      invoiceNumber: r.invoice_number || "",
      poNumber: r.po_number || "",
      customerName: r.customer_name || "",
      amountPaid: Number(r.amount_paid) || 0,
      paymentMethod: r.payment_method || "Bank Transfer",
      referenceNumber: r.reference_number || "",
      depositAccount: r.deposit_account || "",
      notes: r.notes || "",
      allocations: allocsMap.get(r.id) || [],
      hasIssue: Boolean(r.has_issue),
      issueComment: r.issue_comment || "",
      createdAt: r.created_at || new Date().toISOString(),
    }));
    const issueRows = await fetchTableWithPaginationAndRetry(
      client,
      "document_issues",
      500,
      3,
    );
    const issues = (issueRows || []).map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      referenceNumber: r.reference_number,
      poNumber: r.po_number,
      customerName: r.customer_name,
      destination: r.destination || "",
      contract: r.contract || "",
      totalValue: Number(r.total_value) || 0,
      issueTitle: r.issue_title,
      issueType: r.issue_type,
      severity: r.severity || "MEDIUM",
      status: r.status || "PENDING",
      flaggedBy: r.flagged_by || "System",
      flaggedAt: r.flagged_at || new Date().toISOString(),
      headerComment: r.header_comment || "",
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
      resolutionNotes: r.resolution_notes,
      lineIssues: Array.isArray(r.line_issues) ? r.line_issues : [],
      comments: Array.isArray(r.comments) ? r.comments : [],
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
    }));
    console.log(
      `\u2705 Loaded from Supabase: ${poLines.length} PO lines, ${invoices.length} invoices, ${deliveryNotes.length} delivery notes, ${payments.length} payments, ${issues.length} issues`,
    );
    return { poLines, invoices, deliveryNotes, payments, issues };
  } catch (err) {
    console.error("Failed to fetch from Supabase:", err);
    return {
      poLines: [],
      invoices: [],
      deliveryNotes: [],
      payments: [],
      issues: [],
    };
  }
}
__name(fetchSupabaseComplete, "fetchSupabaseComplete");
async function pushRecordsToSupabase(payload) {
  const client = getSupabaseServerClient();
  if (!client) {
    return { success: false, errors: ["Supabase client not initialized"] };
  }
  const errors = [];
  try {
    if (Array.isArray(payload.deletedIds) && payload.deletedIds.length > 0) {
      for (const rawId of payload.deletedIds) {
        const id = String(rawId).trim();
        if (!id) continue;
        try {
          // 1. Invoices & associated child lines and allocations
          const { data: matchedInvoices } = await client
            .from("invoices")
            .select("id")
            .or(`id.eq.${id},invoice_number.eq.${id},invoice_number.ilike.${id}`);
          const invIds = Array.from(
            new Set([id, ...(matchedInvoices || []).map((r: any) => r.id)].filter(Boolean))
          );
          if (invIds.length > 0) {
            await client.from("payment_allocations").delete().in("invoice_id", invIds);
            await client.from("document_issues").delete().in("entity_id", invIds);
            await client.from("invoice_lines").delete().in("invoice_id", invIds);
            await client.from("invoices").delete().in("id", invIds);
          }
          await client
            .from("invoices")
            .delete()
            .or(`id.eq.${id},invoice_number.eq.${id},invoice_number.ilike.${id}`);

          // 2. Delivery Notes & associated child lines
          const { data: matchedDNs } = await client
            .from("delivery_notes")
            .select("id")
            .or(`id.eq.${id},delivery_note_number.eq.${id},delivery_note_number.ilike.${id}`);
          const dnIds = Array.from(
            new Set([id, ...(matchedDNs || []).map((r: any) => r.id)].filter(Boolean))
          );
          if (dnIds.length > 0) {
            await client.from("delivery_note_lines").delete().in("delivery_note_id", dnIds);
            await client.from("document_issues").delete().in("entity_id", dnIds);
            await client.from("delivery_notes").delete().in("id", dnIds);
          }
          await client
            .from("delivery_notes")
            .delete()
            .or(`id.eq.${id},delivery_note_number.eq.${id},delivery_note_number.ilike.${id}`);

          // 3. Payments & associated allocations
          const { data: matchedPayments } = await client
            .from("payments")
            .select("id")
            .or(`id.eq.${id},payment_number.eq.${id},payment_number.ilike.${id}`);
          const payIds = Array.from(
            new Set([id, ...(matchedPayments || []).map((r: any) => r.id)].filter(Boolean))
          );
          if (payIds.length > 0) {
            await client.from("payment_allocations").delete().in("payment_id", payIds);
            await client.from("document_issues").delete().in("entity_id", payIds);
            await client.from("payments").delete().in("id", payIds);
          }
          await client
            .from("payments")
            .delete()
            .or(`id.eq.${id},payment_number.eq.${id},payment_number.ilike.${id}`);

          // 4. Document Issues
          await client
            .from("document_issues")
            .delete()
            .or(`id.eq.${id},entity_id.eq.${id},reference_number.eq.${id},reference_number.ilike.${id}`);

          // 5. Purchase Order Lines
          await client
            .from("po_lines")
            .delete()
            .or(`id.eq.${id},po_number.eq.${id},po_number.ilike.${id}`);
        } catch (delErr) {
          console.warn("Supabase record purge note:", delErr);
        }
      }
    }
    const dedupeByNumberAndId = __name((list, getNum, getId) => {
      if (!Array.isArray(list) || list.length === 0) return [];
      const numMap = new Map();
      for (const item of list) {
        if (!item) continue;
        const num = (getNum(item) || "").trim().toLowerCase();
        const id = (getId(item) || "").trim().toLowerCase();
        const existing = num ? numMap.get(num) : null;
        if (existing) {
          const exLines = Array.isArray(existing.lines)
            ? existing.lines.length
            : 0;
          const curLines = Array.isArray(item.lines) ? item.lines.length : 0;
          if (curLines > exLines) {
            numMap.set(num, item);
          } else if (
            item.updatedAt &&
            (!existing.updatedAt || item.updatedAt > existing.updatedAt)
          ) {
            numMap.set(num, item);
          }
        } else if (num) {
          numMap.set(num, item);
        } else if (id) {
          numMap.set(id, item);
        }
      }
      return Array.from(numMap.values());
    }, "dedupeByNumberAndId");
    const dedupedDeliveryNotes = dedupeByNumberAndId(
      payload.deliveryNotes || [],
      (d) => d.deliveryNoteNumber,
      (d) => d.id,
    );
    if (dedupedDeliveryNotes.length > 0) {
      for (const dn of dedupedDeliveryNotes) {
        if (!dn || !dn.id) continue;
        let dnIdToUse = dn.id;
        try {
          if (dn.deliveryNoteNumber) {
            const { data: existingDn } = await client
              .from("delivery_notes")
              .select("id")
              .eq("delivery_note_number", dn.deliveryNoteNumber)
              .maybeSingle();
            if (existingDn?.id) {
              dnIdToUse = existingDn.id;
            }
          }
        } catch {
          // ignore lookup error
        }

        const dnRow = {
          id: dnIdToUse,
          delivery_note_number: dn.deliveryNoteNumber || `DN-${Date.now()}`,
          delivery_date:
            safeDate(dn.deliveryDate) || new Date().toISOString().slice(0, 10),
          po_number: dn.poNumber || "",
          customer_name: dn.customerName || "",
          destination: dn.destination || "",
          contract: dn.contract || "",
          po_date: safeDate(dn.poDate),
          carrier: dn.carrier || "",
          vehicle_number: dn.vehicleNumber || "",
          driver_name: dn.driverName || "",
          received_by: dn.receivedBy || "",
          subtotal_before_vat: Number(dn.subtotalBeforeVat) || 0,
          total_vat: Number(dn.totalVat) || 0,
          total_delivered_quantity: Number(dn.totalDeliveredQuantity) || 0,
          total_delivered_value: Number(dn.totalDeliveredValue) || 0,
          notes: dn.notes || "",
          status: dn.status || "ACTIVE",
          is_cancelled: Boolean(dn.isCancelled),
          cancel_reason: dn.cancelReason || "",
          is_ofr: Boolean(dn.isOfr),
          ofr_detail: dn.ofrDetail || "",
          matched_invoice_number: dn.matchedInvoiceNumber || "",
          is_fully_invoiced: Boolean(dn.isFullyInvoiced),
          has_issue: Boolean(dn.hasIssue),
          issue_comment: dn.issueComment || "",
          issue_id: dn.issueId || "",
          issue_status: dn.issueStatus || "PENDING",
          updated_at: new Date().toISOString(),
        };

        let { error: dnErr } = await executeWithRetry(() =>
          client.from("delivery_notes").upsert(dnRow, { onConflict: "id" }),
        );
        if (
          dnErr &&
          (dnErr.code === "23505" ||
            dnErr.message?.includes("delivery_note_number") ||
            dnErr.message?.includes("duplicate key"))
        ) {
          try {
            const { data: conflictDn } = await client
              .from("delivery_notes")
              .select("id")
              .eq("delivery_note_number", dn.deliveryNoteNumber)
              .maybeSingle();

            if (conflictDn?.id) {
              dnRow.id = conflictDn.id;
              dnIdToUse = conflictDn.id;
              await client
                .from("delivery_note_lines")
                .delete()
                .eq("delivery_note_id", conflictDn.id);
              const { error: updErr } = await client
                .from("delivery_notes")
                .update(dnRow)
                .eq("id", conflictDn.id);
              if (!updErr) {
                dnErr = null;
              } else {
                await client.from("delivery_notes").delete().eq("id", conflictDn.id);
                const { error: retryErr } = await executeWithRetry(() =>
                  client.from("delivery_notes").upsert(dnRow, { onConflict: "id" }),
                );
                if (!retryErr) dnErr = null;
                else dnErr = retryErr;
              }
            }
          } catch (e) {
            console.warn(
              "Fallback resolve DN duplicate note:",
              e?.message || e,
            );
          }
        }
        if (dnErr) {
          console.error(
            `Supabase DN Upsert Error (${dn.deliveryNoteNumber}):`,
            dnErr,
          );
          errors.push(`DN ${dn.deliveryNoteNumber}: ${dnErr.message}`);
        } else if (Array.isArray(dn.lines) && dn.lines.length > 0) {
          await client
            .from("delivery_note_lines")
            .delete()
            .eq("delivery_note_id", dnIdToUse);

          const lineRows = dn.lines.map((l, idx) => ({
            id: l.id ? `${dnIdToUse}-${l.id}` : `${dnIdToUse}-line-${idx}`,
            delivery_note_id: dnIdToUse,
            po_line_id: l.poLineId || "",
            item_description: l.itemDescription || "",
            unit_of_measure: l.unitOfMeasure || "UNIT",
            po_quantity: Number(l.poQuantity) || 0,
            already_delivered_quantity: Number(l.alreadyDeliveredQuantity) || 0,
            available_quantity: Number(l.availableQuantity) || 0,
            delivered_quantity: Number(l.deliveredQuantity) || 0,
            unit_cost: Number(l.unitCost) || 0,
            unit_price: Number(l.unitPrice) || 0,
            value_before_vat: Number(l.valueBeforeVat) || 0,
            vat_rate: Number(l.vatRate) ?? 0.18,
            vat_amount: Number(l.vatAmount) || 0,
            value_after_vat: Number(l.valueAfterVat) || 0,
            is_selected: l.isSelected !== false,
          }));
          const { error: lineErr } = await executeWithRetry(() =>
            client
              .from("delivery_note_lines")
              .upsert(lineRows, { onConflict: "id" }),
          );
          if (lineErr)
            console.warn("Supabase DN lines upsert warning:", lineErr);
        }
      }
    }
    const dedupedInvoices = dedupeByNumberAndId(
      payload.invoices || [],
      (i) => i.invoiceNumber,
      (i) => i.id,
    );
    if (dedupedInvoices.length > 0) {
      for (const inv of dedupedInvoices) {
        if (!inv || !inv.id) continue;
        let invIdToUse = inv.id;
        try {
          if (inv.invoiceNumber) {
            const { data: existingInv } = await client
              .from("invoices")
              .select("id")
              .eq("invoice_number", inv.invoiceNumber)
              .maybeSingle();
            if (existingInv?.id) {
              invIdToUse = existingInv.id;
            }
          }
        } catch {
          // ignore lookup error
        }

        const invRow = {
          id: invIdToUse,
          invoice_number: inv.invoiceNumber || `INV-${Date.now()}`,
          invoice_date:
            safeDate(inv.invoiceDate) || new Date().toISOString().slice(0, 10),
          po_number: inv.poNumber || "",
          customer_name: inv.customerName || "",
          destination: inv.destination || "",
          contract: inv.contract || "",
          po_date: safeDate(inv.poDate),
          subtotal_before_vat: Number(inv.subtotalBeforeVat) || 0,
          total_vat: Number(inv.totalVat) || 0,
          total_after_vat: Number(inv.totalAfterVat) || 0,
          paid_amount: Number(inv.paidAmount) || 0,
          payment_status: inv.paymentStatus || "UNPAID",
          notes: inv.notes || "",
          comment: inv.comment || "Okay",
          status: inv.status || "ACTIVE",
          is_cancelled: Boolean(inv.isCancelled),
          cancel_reason: inv.cancelReason || "",
          is_ofr: Boolean(inv.isOfr),
          ofr_detail: inv.ofrDetail || "",
          has_issue: Boolean(inv.hasIssue),
          issue_comment: inv.issueComment || "",
          issue_id: inv.issueId || "",
          issue_status: inv.issueStatus || "PENDING",
          updated_at: new Date().toISOString(),
        };

        let { error: invErr } = await executeWithRetry(() =>
          client.from("invoices").upsert(invRow, { onConflict: "id" }),
        );
        if (
          invErr &&
          (invErr.code === "23505" ||
            invErr.message?.includes("invoice_number") ||
            invErr.message?.includes("duplicate key"))
        ) {
          try {
            const { data: conflictRow } = await client
              .from("invoices")
              .select("id")
              .eq("invoice_number", inv.invoiceNumber)
              .maybeSingle();

            if (conflictRow?.id) {
              invRow.id = conflictRow.id;
              invIdToUse = conflictRow.id;
              await client
                .from("invoice_lines")
                .delete()
                .eq("invoice_id", conflictRow.id);
              const { error: updErr } = await client
                .from("invoices")
                .update(invRow)
                .eq("id", conflictRow.id);
              if (!updErr) {
                invErr = null;
              } else {
                await client.from("invoices").delete().eq("id", conflictRow.id);
                const { error: retryErr } = await executeWithRetry(() =>
                  client.from("invoices").upsert(invRow, { onConflict: "id" }),
                );
                if (!retryErr) invErr = null;
                else invErr = retryErr;
              }
            }
          } catch (e) {
            console.warn(
              "Fallback resolve invoice duplicate note:",
              e?.message || e,
            );
          }
        }
        if (invErr) {
          console.error(
            `Supabase Invoice Upsert Error (${inv.invoiceNumber}):`,
            invErr,
          );
          errors.push(`INV ${inv.invoiceNumber}: ${invErr.message}`);
        } else if (Array.isArray(inv.lines) && inv.lines.length > 0) {
          await client
            .from("invoice_lines")
            .delete()
            .eq("invoice_id", invIdToUse);

          const lineRows = inv.lines.map((l, idx) => ({
            id: l.id ? `${invIdToUse}-${l.id}` : `${invIdToUse}-line-${idx}`,
            invoice_id: invIdToUse,
            po_line_id: l.poLineId || "",
            item_description: l.itemDescription || "",
            unit_of_measure: l.unitOfMeasure || "UNIT",
            po_quantity: Number(l.poQuantity) || 0,
            already_invoiced_quantity: Number(l.alreadyInvoicedQuantity) || 0,
            available_quantity: Number(l.availableQuantity) || 0,
            invoiced_quantity: Number(l.invoicedQuantity) || 0,
            unit_cost: Number(l.unitCost) || 0,
            unit_price: Number(l.unitPrice) || 0,
            value_before_vat: Number(l.valueBeforeVat) || 0,
            vat_rate: Number(l.vatRate) ?? 0.18,
            vat_amount: Number(l.vatAmount) || 0,
            value_after_vat: Number(l.valueAfterVat) || 0,
            is_selected: l.isSelected !== false,
            comment: l.comment || "Okay",
          }));
          const { error: lineErr } = await executeWithRetry(() =>
            client.from("invoice_lines").upsert(lineRows, { onConflict: "id" }),
          );
          if (lineErr)
            console.warn("Supabase Invoice lines upsert warning:", lineErr);
        }
      }
    }
    const dedupedPayments = dedupeByNumberAndId(
      payload.payments || [],
      (p) => p.paymentNumber,
      (p) => p.id,
    );
    if (dedupedPayments.length > 0) {
      for (const pay of dedupedPayments) {
        if (!pay || !pay.id) continue;
        let payIdToUse = pay.id;
        try {
          if (pay.paymentNumber) {
            const { data: existingPay } = await client
              .from("payments")
              .select("id")
              .eq("payment_number", pay.paymentNumber)
              .maybeSingle();
            if (existingPay?.id) {
              payIdToUse = existingPay.id;
            }
          }
        } catch {
          // ignore lookup error
        }

        const payRow = {
          id: payIdToUse,
          payment_number: pay.paymentNumber || `PAY-${Date.now()}`,
          payment_date:
            safeDate(pay.paymentDate) || new Date().toISOString().slice(0, 10),
          invoice_id: pay.invoiceId || "",
          invoice_number: pay.invoiceNumber || "",
          po_number: pay.poNumber || "",
          customer_name: pay.customerName || "",
          amount_paid: Number(pay.amountPaid) || 0,
          payment_method: pay.paymentMethod || "Bank Transfer",
          reference_number: pay.referenceNumber || "",
          deposit_account: pay.depositAccount || "",
          notes: pay.notes || "",
          has_issue: Boolean(pay.hasIssue),
          issue_comment: pay.issueComment || "",
        };
        let { error: payErr } = await executeWithRetry(() =>
          client.from("payments").upsert(payRow, { onConflict: "id" }),
        );
        if (
          payErr &&
          (payErr.code === "23505" ||
            payErr.message?.includes("payment_number") ||
            payErr.message?.includes("duplicate key"))
        ) {
          try {
            const { data: conflictPay } = await client
              .from("payments")
              .select("id")
              .eq("payment_number", pay.paymentNumber)
              .maybeSingle();

            if (conflictPay?.id) {
              payRow.id = conflictPay.id;
              payIdToUse = conflictPay.id;
              await client
                .from("payment_allocations")
                .delete()
                .eq("payment_id", conflictPay.id);
              const { error: updErr } = await client
                .from("payments")
                .update(payRow)
                .eq("id", conflictPay.id);
              if (!updErr) {
                payErr = null;
              } else {
                await client.from("payments").delete().eq("id", conflictPay.id);
                const { error: retryErr } = await executeWithRetry(() =>
                  client.from("payments").upsert(payRow, { onConflict: "id" }),
                );
                if (!retryErr) payErr = null;
                else payErr = retryErr;
              }
            }
          } catch (e) {
            console.warn(
              "Fallback resolve payment duplicate note:",
              e?.message || e,
            );
          }
        }
        if (payErr) {
          console.error(
            `Supabase Payment Upsert Error (${pay.paymentNumber}):`,
            payErr,
          );
          errors.push(`PAY ${pay.paymentNumber}: ${payErr.message}`);
        } else if (
          Array.isArray(pay.allocations) &&
          pay.allocations.length > 0
        ) {
          await client
            .from("payment_allocations")
            .delete()
            .eq("payment_id", payIdToUse);

          const allocRows = pay.allocations.map((a, idx) => ({
            id: a.id ? `${payIdToUse}-${a.id}` : `${payIdToUse}-alloc-${idx}`,
            payment_id: payIdToUse,
            invoice_id: a.invoiceId || "",
            invoice_number: a.invoiceNumber || "",
            po_number: a.poNumber || "",
            customer_name: a.customerName || "",
            invoice_total: Number(a.invoiceTotal) || 0,
            already_paid: Number(a.alreadyPaid) || 0,
            pending_balance: Number(a.pendingBalance) || 0,
            allocated_amount: Number(a.allocatedAmount) || 0,
          }));
          const { error: allocErr } = await executeWithRetry(() =>
            client
              .from("payment_allocations")
              .upsert(allocRows, { onConflict: "id" }),
          );
          if (allocErr)
            console.warn(
              "Supabase Payment allocations upsert warning:",
              allocErr,
            );
        }
      }
    }
    if (Array.isArray(payload.issues) && payload.issues.length > 0) {
      const uniqueIssuesMap = new Map();
      for (const iss of payload.issues) {
        if (iss && iss.id) {
          uniqueIssuesMap.set(String(iss.id).trim(), iss);
        }
      }
      for (const iss of uniqueIssuesMap.values()) {
        const issueRow = {
          id: iss.id,
          entity_type: iss.entityType || "INVOICE",
          entity_id: iss.entityId || "",
          reference_number: iss.referenceNumber || "",
          po_number: iss.poNumber || "",
          customer_name: iss.customerName || "",
          destination: iss.destination || "",
          contract: iss.contract || "",
          total_value: Number(iss.totalValue) || 0,
          issue_title: iss.issueTitle || "",
          issue_type: iss.issueType || "General",
          severity: iss.severity || "MEDIUM",
          status: iss.status || "PENDING",
          flagged_by: iss.flaggedBy || "System",
          flagged_at: iss.flaggedAt || new Date().toISOString(),
          header_comment: iss.headerComment || "",
          resolved_at: iss.resolvedAt || null,
          resolved_by: iss.resolvedBy || "",
          resolution_notes: iss.resolutionNotes || "",
          line_issues: Array.isArray(iss.lineIssues) ? iss.lineIssues : [],
          comments: Array.isArray(iss.comments) ? iss.comments : [],
        };
        const { error: issErr } = await executeWithRetry(() =>
          client.from("document_issues").upsert(issueRow, { onConflict: "id" }),
        );
        if (issErr) {
          console.error("Supabase Issue Upsert Error:", issErr);
          errors.push(`Issue ${iss.referenceNumber}: ${issErr.message}`);
        }
      }
    }
    if (
      Array.isArray(payload.poLines) &&
      payload.poLines.length > 0 &&
      payload.poLines.length <= 100
    ) {
      const poRows = payload.poLines.map((p) => ({
        id: p.id,
        customer_name: p.customerName || "",
        destination: p.destination || "",
        po_number: p.poNumber || "",
        contract: p.contract || "",
        item_description: p.itemDescription || "",
        po_date: safeDate(p.date),
        unit_of_measure: p.unitOfMeasure || "UNIT",
        quantity: Number(p.quantity) || 0,
        unit_cost: Number(p.unitCost) || 0,
        unit_price: Number(p.unitPrice) || 0,
        value_before_vat: Number(p.valueBeforeVat) || 0,
        vat_rate: Number(p.vatRate) ?? 0.18,
        vat_amount: Number(p.vatAmount) || 0,
        value_after_vat: Number(p.valueAfterVat) || 0,
        remarks: p.remarks || "",
      }));
      const { error: poErr } = await executeWithRetry(() =>
        client.from("po_lines").upsert(poRows, { onConflict: "id" }),
      );
      if (poErr) console.warn("Supabase PO lines upsert error:", poErr);
    }
    return { success: errors.length === 0, errors };
  } catch (err) {
    console.error("pushRecordsToSupabase exception:", err);
    return { success: false, errors: [err?.message || "Unknown error"] };
  }
}
__name(pushRecordsToSupabase, "pushRecordsToSupabase");
export {
  fetchSupabaseComplete,
  getSupabasePublicConfig,
  getSupabaseServerClient,
  pushRecordsToSupabase,
};
