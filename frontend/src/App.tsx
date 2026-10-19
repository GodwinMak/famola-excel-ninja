/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ActiveTab, Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { POManager } from './components/POManager';
import { InvoiceCreator } from './components/InvoiceCreator';
import { InvoiceHistory } from './components/InvoiceHistory';
import { POTrackingLedger } from './components/POTrackingLedger';
import { MatchingReport } from './components/MatchingReport';
import { DeliveryNotesManager } from './components/DeliveryNotesManager';
import { PaymentsManager } from './components/PaymentsManager';
import { SettingsManager } from './components/SettingsManager';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { MasterExportModal } from './components/MasterExportModal';
import { IssueResolutionHub } from './components/IssueResolutionHub';
import { FlagIssueModal } from './components/FlagIssueModal';
import { PinLoginModal } from './components/PinLoginModal';
import { UploadProgressModal } from './components/UploadProgressModal';
import { LoginPage } from './components/LoginPage';
import {
  POLineItem,
  InvoiceRecord,
  DeliveryNoteRecord,
  PaymentRecord,
  AppUser,
  DocumentIssueRecord,
  LineItemIssue
} from './types';
import {
  loadStoredPOs,
  savePOs,
  loadStoredInvoices,
  saveInvoices,
  loadStoredDeliveryNotes,
  saveDeliveryNotes,
  loadStoredPayments,
  savePayments,
  loadStoredIssues,
  saveIssues,
  addOrUpdateIssue,
  resolveDocumentIssue,
  resolveMultipleDocumentIssues,
  loadStoredUsers,
  saveStoredUsers,
  loadStoredSeriesConfig,
  saveStoredSeriesConfig,
  enrichPOLinesWithTracking,
  reconcileRelationshipsWithNewPOs,
  groupPOsByNumber,
  groupPOsByEnrichedLines,
  calculateDashboardMetrics,
  generateMatchingReport,
  formatCurrency,
  resetToSampleData,
  clearAllData,
  trackDeletedRecords,
  untrackDeletedRecords,
  loadStoredDeletedIds,
  DEFAULT_USERS,
  hydrateFromIndexedDB,
  parseCleanNumber,
  sanitizeInvoiceTotals,
} from './utils/storage';
import { parseExcelPOData, generateSampleExcelTemplate } from './utils/excelParser';
import {
  getCurrentSessionUser,
  fetchCurrentUser,
  canViewScreen,
  getAllowedScreensForUser,
  isAdminUser,
  canDeleteData,
  isSessionAuthenticated,
  setSessionAuthenticated,
  lockCurrentSession
} from './utils/authService';
import {
  fetchServerDatabaseFull,
  fetchServerDatabaseStatus,
  clearServerDatabaseKeepAdm,
  clearServerPOs,
  persistServerDatabase,
  deleteServerInvoice,
  deleteServerDeliveryNote,
  deleteServerPayment,
  deleteServerPO,
  deleteServerPOLine,
  deleteServerIssue,
  recalculateAllInvoiceTotalsOnServer,
} from './utils/databaseService';
import { SyncDataLine } from './components/SyncDataLine';
import { CheckCircle2, AlertCircle, X, AlertTriangle, ShieldAlert, FileSpreadsheet, Lock } from 'lucide-react';

// Maps each screen to a real, bookmarkable/deep-linkable URL. Keeping this as the
// single source of truth for both directions avoids the two maps drifting apart.
const TAB_PATHS: Record<ActiveTab, string> = {
  dashboard: '/',
  po_master: '/po',
  create_invoice: '/invoices/new',
  invoices_db: '/invoices',
  issue_tracking: '/issues',
  delivery_notes: '/deliveries/new',
  delivery_details: '/deliveries',
  matching_report: '/matching',
  payments: '/payments',
  settings: '/settings',
  ledger: '/ledger',
  database: '/database',
};

const PATH_TO_TAB: Record<string, ActiveTab> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as ActiveTab])
);

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab: ActiveTab = PATH_TO_TAB[location.pathname] ?? 'dashboard';
  // Kept as a plain function (not state) so every existing setActiveTab(...) call
  // site across this file continues to work unchanged — it now drives the URL
  // instead of local state, which is what makes screens deep-linkable/bookmarkable.
  const setActiveTab = useCallback(
    (tab: ActiveTab) => {
      const path = TAB_PATHS[tab];
      if (path && path !== location.pathname) navigate(path);
    },
    [navigate, location.pathname]
  );
  const [poLines, setPoLines] = useState<POLineItem[]>(() => loadStoredPOs());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => loadStoredInvoices());
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteRecord[]>(() => loadStoredDeliveryNotes());
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadStoredPayments());
  const [issues, setIssues] = useState<DocumentIssueRecord[]>(() => loadStoredIssues());

  // Master Database Sync State (Sync Data Line)
  const [isDataSyncing, setIsDataSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => new Date());
  const [latencyMs, setLatencyMs] = useState<number>(12);
  const [serverCounts, setServerCounts] = useState<{
    totalPoLines: number;
    totalPoGroups: number;
    totalInvoices: number;
    totalDeliveryNotes: number;
    totalPayments: number;
    totalIssues: number;
    totalUsers: number;
  } | null>(null);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [preselectedFlagEntity, setPreselectedFlagEntity] = useState<{
    type: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
    invoice?: InvoiceRecord;
    deliveryNote?: DeliveryNoteRecord;
    payment?: PaymentRecord;
  } | null>(null);

  const [matchingFilter, setMatchingFilter] = useState<'ALL' | 'UNMATCHED' | 'UNDELIVERED' | 'MATCHED'>('ALL');

  const [selectedPoForInvoice, setSelectedPoForInvoice] = useState<string>('');
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [printingInvoice, setPrintingInvoice] = useState<InvoiceRecord | null>(null);
  const [editingDeliveryNote, setEditingDeliveryNote] = useState<DeliveryNoteRecord | null>(null);
  const [isMasterExportOpen, setIsMasterExportOpen] = useState(false);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; fileName?: string; stage?: string }>({ open: false });
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Authentication state (JWT-backed; see utils/authService.ts)
  const [currentUser, setCurrentUser] = useState<AppUser>(() => getCurrentSessionUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isPinLoginOpen, setIsPinLoginOpen] = useState(false);
  const [pinLoginTargetUser, setPinLoginTargetUser] = useState<AppUser | null>(null);

  // Notification Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setSessionAuthenticated(user);
    setIsPinLoginOpen(false);
    setPinLoginTargetUser(null);
    showToast('success', `Signed in as ${user.name} (${user.role})`);
  };

  // Rehydrate the session from the backend using the cached JWT on initial load.
  useEffect(() => {
    fetchCurrentUser().then((user) => {
      if (user) {
        setCurrentUser(user);
        setIsAuthenticated(true);
      }
    }).catch(() => {});
  }, []);

  const handleLockSession = () => {
    lockCurrentSession();
    setIsAuthenticated(false);
    showToast('info', 'You have signed out.');
  };

  const lastAppliedUpdatedAtRef = useRef<string>('');
  // Guards against the initial-load effect (which React StrictMode double-invokes
  // in dev), the route-change sync, and the polling fallback all deciding to fetch
  // the full database at once — each transfers/parses the entire dataset
  // (invoices+delivery notes with nested lines), so overlapping fetches meaningfully
  // slow down first load for no benefit.
  const isFetchingFullDbRef = useRef(false);

  // Bumped by every local write (see syncToMasterDatabase/handleUploadExcelFile)
  // so a full-database fetch that was already in flight before that write can be
  // recognized as stale once it resolves. A full fetch nests every invoice's and
  // delivery note's line items and can take several seconds, so one issued right
  // before e.g. a large PO Excel upload routinely resolves only AFTER the upload's
  // own save completes — applying it then would silently overwrite the fresh data
  // with the pre-write snapshot it actually captured. A local counter (rather than
  // comparing server updatedAt timestamps against a client-stamped write time) sidesteps
  // clock-skew entirely: the client's Date.now() right after a write is routinely a
  // little later than the timestamp MySQL recorded for that same write, which would
  // make a timestamp-based guard permanently reject even genuinely fresh later fetches.
  const dataGenerationRef = useRef(0);

  const fetchFullDatabaseGuarded = useCallback(async () => {
    if (isFetchingFullDbRef.current) {
      return null;
    }
    isFetchingFullDbRef.current = true;
    const generationAtRequestStart = dataGenerationRef.current;
    try {
      const result = await fetchServerDatabaseFull();
      if (dataGenerationRef.current !== generationAtRequestStart) {
        // A newer local write started while this fetch was in flight — its data
        // reflects the pre-write state and must not clobber what that write produced.
        return null;
      }
      return result;
    } finally {
      isFetchingFullDbRef.current = false;
    }
  }, []);

  // MySQL is now the single source of truth, so this simply replaces local state
  // with whatever the server returns — no more 3-way merge/tombstone logic
  // (that existed only to reconcile the old JSON-file/Supabase/Sheets stores).
  // Staleness is guarded upstream in fetchFullDatabaseGuarded (see dataGenerationRef)
  // rather than here, since comparing server updatedAt timestamps against a
  // client-stamped "last write" time is vulnerable to clock skew: the client's
  // Date.now() right after a write resolves is routinely a little later than the
  // timestamp MySQL actually recorded for that same write, which would make this
  // function permanently reject even genuinely fresh later fetches.
  const applyServerDatabase = useCallback((serverDb: any) => {
    if (!serverDb || typeof serverDb !== 'object') return;

    if (serverDb.updatedAt) {
      lastAppliedUpdatedAtRef.current = serverDb.updatedAt;
    }

    const localDeletedIds = loadStoredDeletedIds();
    const serverDeletedIds = Array.isArray(serverDb.deletedIds) ? serverDb.deletedIds : [];
    if (serverDeletedIds.length > 0) {
      trackDeletedRecords(serverDeletedIds);
    }
    const combinedDeletedIds = Array.from(
      new Set([...localDeletedIds, ...serverDeletedIds].filter(Boolean))
    );
    const deletedSet = new Set(combinedDeletedIds.map((id) => String(id).toLowerCase().trim()));

    const rawPOs: POLineItem[] = Array.isArray(serverDb.poLines) ? serverDb.poLines : [];
    const rawInvoices: InvoiceRecord[] = Array.isArray(serverDb.invoices) ? serverDb.invoices : [];
    const rawDNs: DeliveryNoteRecord[] = Array.isArray(serverDb.deliveryNotes) ? serverDb.deliveryNotes : [];
    const rawPays: PaymentRecord[] = Array.isArray(serverDb.payments) ? serverDb.payments : [];
    const rawIssues: DocumentIssueRecord[] = Array.isArray(serverDb.issues) ? serverDb.issues : [];

    const cleanPOs = rawPOs.filter((p) => !deletedSet.has(String(p.id).toLowerCase().trim()) && (!p.poNumber || !deletedSet.has(String(p.poNumber).toLowerCase().trim())));
    const cleanInvoices = rawInvoices.filter((i) => !deletedSet.has(String(i.id).toLowerCase().trim()) && (!i.invoiceNumber || !deletedSet.has(String(i.invoiceNumber).toLowerCase().trim())));
    const cleanDNs = rawDNs.filter((d) => !deletedSet.has(String(d.id).toLowerCase().trim()) && (!d.deliveryNoteNumber || !deletedSet.has(String(d.deliveryNoteNumber).toLowerCase().trim())));
    const cleanPays = rawPays.filter((p) => !deletedSet.has(String(p.id).toLowerCase().trim()) && (!p.paymentNumber || !deletedSet.has(String(p.paymentNumber).toLowerCase().trim())));
    const cleanIssues = rawIssues.filter((iss) => !deletedSet.has(String(iss.id).toLowerCase().trim()) && (!iss.entityId || !deletedSet.has(String(iss.entityId).toLowerCase().trim())));

    // Index PO lines for price backfills
    const poById = new Map<string, POLineItem>();
    const poByDescKey = new Map<string, POLineItem>();
    (cleanPOs || []).forEach((p) => {
      if (p.id) poById.set(p.id.toLowerCase().trim(), p);
      if (p.poNumber && p.itemDescription) {
        poByDescKey.set(`${p.poNumber.trim().toLowerCase()}___${p.itemDescription.trim().toLowerCase()}`, p);
      }
    });

    // Auto-calculate totals for invoices: (bill qty * unit price) + VAT (18%)
    const calculatedInvoices = cleanInvoices.map((inv) => {
      const lines = inv.lines || [];
      if (lines.length > 0) {
        let sub = 0;
        let vt = 0;
        const updatedLines = lines.map((l) => {
          const qty = parseCleanNumber(l.invoicedQuantity ?? (l as any).quantityInvoiced ?? (l as any).billedQuantity ?? (l as any).billQty ?? 0);
          let price = parseCleanNumber(l.unitPrice ?? 0);
          if (price === 0 && l.poLineId) {
            const p = poById.get(String(l.poLineId).toLowerCase().trim());
            if (p && parseCleanNumber(p.unitPrice) > 0) price = parseCleanNumber(p.unitPrice);
          }
          if (price === 0 && inv.poNumber && l.itemDescription) {
            const k = `${inv.poNumber.trim().toLowerCase()}___${l.itemDescription.trim().toLowerCase()}`;
            const p = poByDescKey.get(k);
            if (p && parseCleanNumber(p.unitPrice) > 0) price = parseCleanNumber(p.unitPrice);
          }

          const vRate =
            l.vatRate !== undefined && l.vatRate !== null && Number(l.vatRate) > 0 && Number(l.vatRate) <= 1
              ? Number(l.vatRate)
              : 0.18;

          let valBefore = 0;
          if (qty > 0 && price > 0) {
            valBefore = Math.round(qty * price * 100) / 100;
          } else if (parseCleanNumber(l.valueBeforeVat) > 0) {
            valBefore = parseCleanNumber(l.valueBeforeVat);
            if (qty > 0 && price === 0) price = Math.round((valBefore / qty) * 100) / 100;
          } else if (parseCleanNumber(l.totalBeforeVat) > 0) {
            valBefore = parseCleanNumber(l.totalBeforeVat);
            if (qty > 0 && price === 0) price = Math.round((valBefore / qty) * 100) / 100;
          } else if (parseCleanNumber(l.valueAfterVat) > 0) {
            valBefore = Math.round((parseCleanNumber(l.valueAfterVat) / (1 + vRate)) * 100) / 100;
            if (qty > 0 && price === 0) price = Math.round((valBefore / qty) * 100) / 100;
          } else {
            valBefore = Math.round(qty * price * 100) / 100;
          }

          let vatAmt = Math.round(valBefore * vRate * 100) / 100;
          const explicitVat = parseCleanNumber(l.vatAmount);
          if (explicitVat > 0 && explicitVat <= valBefore * 0.35) {
            vatAmt = explicitVat;
          }
          const valAfter = Math.round((valBefore + vatAmt) * 100) / 100;

          sub += valBefore;
          vt += vatAmt;

          return {
            ...l,
            invoicedQuantity: qty,
            unitPrice: price,
            vatRate: vRate,
            valueBeforeVat: valBefore,
            totalBeforeVat: valBefore,
            vatAmount: vatAmt,
            valueAfterVat: valAfter,
            totalAfterVat: valAfter,
          };
        });

        sub = Math.round(sub * 100) / 100;
        vt = Math.round(vt * 100) / 100;
        const tot = Math.round((sub + vt) * 100) / 100;

        return {
          ...inv,
          lines: updatedLines,
          subtotalBeforeVat: sub,
          totalVat: vt,
          totalAfterVat: tot,
        };
      } else {
        let sub = parseCleanNumber(inv.subtotalBeforeVat);
        let vt = parseCleanNumber(inv.totalVat);
        let tot = parseCleanNumber(inv.totalAfterVat);

        if (tot > 0 && sub <= 0) {
          sub = Math.round((tot / 1.18) * 100) / 100;
          vt = Math.round((tot - sub) * 100) / 100;
        } else if (sub > 0 && tot <= 0) {
          vt = Math.round(sub * 0.18 * 100) / 100;
          tot = Math.round((sub + vt) * 100) / 100;
        }

        return {
          ...inv,
          subtotalBeforeVat: sub,
          totalVat: vt,
          totalAfterVat: tot,
        };
      }
    });

    // Recompute PO <-> Invoice <-> Delivery Note tracking/link fields against the
    // freshly-loaded data (pure, local computation — nothing persisted here).
    let finalPOs = cleanPOs;
    let finalInvoices = calculatedInvoices;
    let finalDNs = cleanDNs;

    if (cleanPOs.length > 0) {
      const reconciled = reconcileRelationshipsWithNewPOs(cleanPOs, calculatedInvoices, cleanDNs, cleanIssues);
      finalPOs = reconciled.updatedPoLines;
      finalInvoices = reconciled.updatedInvoices;
      finalDNs = reconciled.updatedDeliveryNotes;
    }

    setPoLines(finalPOs);
    savePOs(finalPOs);

    setInvoices(finalInvoices);
    saveInvoices(finalInvoices);

    setDeliveryNotes(finalDNs);
    saveDeliveryNotes(finalDNs);

    setPayments(cleanPays);
    savePayments(cleanPays);

    setIssues(cleanIssues);
    saveIssues(cleanIssues);

    if (Array.isArray(serverDb.users) && serverDb.users.length > 0) {
      saveStoredUsers(serverDb.users);
      setCurrentUser((prevUser) => {
        if (!prevUser) return prevUser;
        const freshUser = serverDb.users.find(
          (u: any) => u.id === prevUser.id || (u.email && u.email.toLowerCase() === prevUser.email?.toLowerCase())
        );
        return freshUser || prevUser;
      });
    }

    if (serverDb.seriesConfig?.invoiceSeries) {
      saveStoredSeriesConfig(serverDb.seriesConfig);
    }

    const poNumbers = new Set(finalPOs.map((p) => p.poNumber).filter(Boolean));
    setServerCounts({
      totalPoLines: finalPOs.length,
      totalPoGroups: poNumbers.size,
      totalInvoices: finalInvoices.length,
      totalDeliveryNotes: finalDNs.length,
      totalPayments: cleanPays.length,
      totalIssues: cleanIssues.length,
      totalUsers: (serverDb.users || []).length || loadStoredUsers().length,
    });
    setLastSyncTime(new Date());
  }, []);

  // Shared by the 15s polling fallback, the window-focus/visibility listeners, and
  // the route-change effect below: a cheap status ping first, and only pulls the
  // full (multi-MB, nested) dataset when the server actually has something newer.
  const isSyncingRef = useRef(false);
  const syncWithServer = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const statusRes = await fetchServerDatabaseStatus(lastAppliedUpdatedAtRef.current);
      if (!statusRes) return;

      if (statusRes.latencyMs) setLatencyMs(statusRes.latencyMs);
      if (statusRes.counts) setServerCounts(statusRes.counts);

      if (statusRes.changed && statusRes.updatedAt !== lastAppliedUpdatedAtRef.current) {
        setIsDataSyncing(true);
        const res = await fetchFullDatabaseGuarded();
        if (res && res.data) {
          applyServerDatabase(res.data);
        }
      }
    } catch (err) {
      console.warn('Background sync notice:', err);
    } finally {
      isSyncingRef.current = false;
      setIsDataSyncing(false);
    }
  }, [fetchFullDatabaseGuarded, applyServerDatabase]);

  const syncToMasterDatabase = async (payload: {
    poLines?: POLineItem[];
    invoices?: InvoiceRecord[];
    deliveryNotes?: DeliveryNoteRecord[];
    payments?: PaymentRecord[];
    issues?: DocumentIssueRecord[];
    users?: AppUser[];
    seriesConfig?: any;
    replace?: boolean;
    deletedIds?: string[];
    source?: string;
  }) => {
    // `users`/`seriesConfig`/`deletedIds`/`source` were only meaningful under the old
    // JSON-file/Supabase merge design; MySQL's per-entity tables (and the users/sync +
    // series-config routes) now own that state, so only the entity arrays below are
    // forwarded to the backend's bulk-sync endpoint.
    //
    // Bumped up front (not after persistServerDatabase resolves): callers already set
    // their own optimistic local state before calling this, so a full-database fetch
    // that was already in flight before that local update becomes stale as of THIS
    // point in time, not after the (multi-second) persist round-trip finishes. Bumping
    // only on success left a multi-second gap where an old in-flight fetch's generation
    // check would still see the pre-bump value and wrongly accept it.
    dataGenerationRef.current += 1;
    try {
      return await persistServerDatabase({
        poLines: payload.poLines,
        invoices: payload.invoices,
        deliveryNotes: payload.deliveryNotes,
        payments: payload.payments,
        issues: payload.issues,
        users: payload.users,
        seriesConfig: payload.seriesConfig,
        deletedIds: payload.deletedIds,
        source: payload.source,
        lastSyncSource: payload.source,
        replace: payload.replace ?? false,
      });
    } catch (e) {
      console.warn('syncToMasterDatabase notice:', e);
      return false;
    }
  };

  // Load initial data from the MySQL-backed master database once authenticated.
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Initial local render so screen is immediately interactive
    const loadedPOs = loadStoredPOs();
    const loadedInvoices = loadStoredInvoices();
    const loadedDNs = loadStoredDeliveryNotes();
    const loadedPayments = loadStoredPayments();
    const loadedIssues = loadStoredIssues();

    setPoLines(loadedPOs);
    setInvoices(loadedInvoices);
    setDeliveryNotes(loadedDNs);
    setPayments(loadedPayments);
    setIssues(loadedIssues);

    // 1.2 Hydrate from IndexedDB in case localStorage was over quota on prior sessions
    hydrateFromIndexedDB().then((idbData) => {
      if (idbData.poLines && idbData.poLines.length > 0) {
        setPoLines((curr) => curr.length === 0 ? idbData.poLines! : curr);
      }
      if (idbData.invoices && idbData.invoices.length > 0) {
        setInvoices((curr) => curr.length === 0 ? idbData.invoices! : curr);
      }
      if (idbData.deliveryNotes && idbData.deliveryNotes.length > 0) {
        setDeliveryNotes((curr) => curr.length === 0 ? idbData.deliveryNotes! : curr);
      }
      if (idbData.payments && idbData.payments.length > 0) {
        setPayments((curr) => curr.length === 0 ? idbData.payments! : curr);
      }
      if (idbData.issues && idbData.issues.length > 0) {
        setIssues((curr) => curr.length === 0 ? idbData.issues! : curr);
      }
    }).catch(() => {});

    // 1.5 Load directly from the Central Master Database with latency measurement
    fetchFullDatabaseGuarded()
      .then((res) => {
        if (!res) return;
        if (res.latencyMs) setLatencyMs(res.latencyMs);
        if (res.data) {
          applyServerDatabase(res.data);
        }
      })
      .catch((err) => {
        console.warn('Initial server db fetch note:', err);
      });
  }, [isAuthenticated]);

  // Periodic polling (+ refresh on tab focus/visibility) keeps the client in sync
  // with whatever's actually in MySQL — no persistent SSE connection needed since
  // every screen also re-checks on navigation (see the route-change effect below).
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      if (!document.hidden) syncWithServer();
    }, 15000);
    window.addEventListener('focus', syncWithServer);
    const handleVisChange = () => {
      if (!document.hidden) syncWithServer();
    };
    document.addEventListener('visibilitychange', handleVisChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', syncWithServer);
      document.removeEventListener('visibilitychange', handleVisChange);
    };
  }, [isAuthenticated, syncWithServer]);

  // Re-check with the server on every screen change, so switching to a screen
  // always shows the latest MySQL data rather than waiting for the next 15s poll.
  // Skips the very first run — the initial-load effect above already fetches once
  // on mount/login — so this only fires on actual in-app navigation.
  const hasDoneInitialRouteSyncRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!hasDoneInitialRouteSyncRef.current) {
      hasDoneInitialRouteSyncRef.current = true;
      return;
    }
    syncWithServer();
  }, [location.pathname, isAuthenticated, syncWithServer]);

  const isSessionValid = Boolean(isAuthenticated);
  const isAuthRequired = false;

  const pendingIssuesCount = useMemo(() => {
    return (issues || []).filter((i) => i.status !== 'RESOLVED').length;
  }, [issues]);

  // Compute enriched PO lines and grouped POs with real-time tracking (optimized single pass)
  const enrichedLines = useMemo(() => {
    return enrichPOLinesWithTracking(poLines, invoices, deliveryNotes);
  }, [poLines, invoices, deliveryNotes]);

  const poGroups = useMemo(() => {
    return groupPOsByEnrichedLines(enrichedLines);
  }, [enrichedLines]);

  const metrics = useMemo(() => {
    return calculateDashboardMetrics(poGroups, invoices, deliveryNotes, payments);
  }, [poGroups, invoices, deliveryNotes, payments]);

  // Handle uploading Excel file
  const handleUploadExcelFile = async (file: File) => {
    setUploadModal({ open: true, fileName: file.name, stage: 'Reading Excel file...' });
    // Bumped up front, not after the persist succeeds: a full-database fetch already
    // in flight when this upload starts takes several seconds and can otherwise
    // resolve after this function's own local setPoLines/persist finish, silently
    // overwriting the freshly-uploaded PO table with the pre-upload snapshot it
    // actually captured (see fetchFullDatabaseGuarded's generation check).
    dataGenerationRef.current += 1;
    try {
      const parsedItems = await parseExcelPOData(file);
      setUploadModal((prev) => ({ ...prev, stage: 'Linking to invoices, delivery notes & issues...' }));

      // Untrack any of these items from deleted tombstones so they aren't filtered out
      const newIdentifiers = parsedItems.map((p) => p.id).concat(parsedItems.map((p) => p.poNumber).filter(Boolean));
      untrackDeletedRecords(newIdentifiers);

      // If previous data had samples or was empty, replace cleanly; otherwise merge deduplicating by item id/poNumber+description
      const isInitialOrSample = poLines.length === 0 || poLines.every((p) => p.id?.includes('sample'));
      const updatedLines = isInitialOrSample
        ? parsedItems
        : [
            ...parsedItems,
            ...poLines.filter(
              (p) => !parsedItems.some((item) => item.id === p.id || (item.poNumber === p.poNumber && item.itemDescription === p.itemDescription))
            ),
          ];

      // Reconcile and dynamically link all Invoices, Delivery Notes, and Issues against the new POs
      const reconciled = reconcileRelationshipsWithNewPOs(updatedLines, invoices, deliveryNotes, issues);

      setPoLines(reconciled.updatedPoLines);
      savePOs(reconciled.updatedPoLines);

      setInvoices(reconciled.updatedInvoices);
      saveInvoices(reconciled.updatedInvoices);

      setDeliveryNotes(reconciled.updatedDeliveryNotes);
      saveDeliveryNotes(reconciled.updatedDeliveryNotes);

      setIssues(reconciled.updatedIssues);
      saveIssues(reconciled.updatedIssues);

      // Reconciliation maps over the FULL invoices/deliveryNotes/issues tables
      // (thousands of records) but returns each untouched record by the same
      // reference it was given, so only entries the new POs actually changed
      // differ from the pre-upload arrays. Sending the whole tables to the
      // server on every PO upload made bulk-sync do a full per-row upsert of
      // every invoice/delivery-note/issue in the system each time — that's
      // what was blowing past the client's sync timeout on large files.
      // Sending only the changed subset keeps the payload (and the server's
      // work) proportional to what this upload actually touched.
      const changedInvoices = reconciled.updatedInvoices.filter((inv, idx) => inv !== invoices[idx]);
      const changedDeliveryNotes = reconciled.updatedDeliveryNotes.filter((dn, idx) => dn !== deliveryNotes[idx]);
      const changedIssues = reconciled.updatedIssues.filter((iss, idx) => iss !== issues[idx]);

      // Persist to Central Master Database so all users on other devices see all updated relationships immediately!
      setUploadModal((prev) => ({ ...prev, stage: `Saving ${parsedItems.length.toLocaleString()} PO line items to the database...` }));
      const persisted = await persistServerDatabase({
        poLines: reconciled.updatedPoLines,
        invoices: changedInvoices,
        deliveryNotes: changedDeliveryNotes,
        payments: [],
        issues: changedIssues,
      });

      if (!persisted) {
        // Server-first: nothing from this upload is kept unless the database accepted it.
        setPoLines(poLines);
        savePOs(poLines);
        setInvoices(invoices);
        saveInvoices(invoices);
        setDeliveryNotes(deliveryNotes);
        saveDeliveryNotes(deliveryNotes);
        setIssues(issues);
        saveIssues(issues);
        showToast(
          'error',
          `"${file.name}" was NOT saved — the server did not accept it. Nothing was changed. Check your connection and try uploading again.`
        );
        return;
      }

      const uniquePOs = new Set(reconciled.updatedPoLines.map((p) => p.poNumber).filter(Boolean)).size;
      const countMsg = [
        reconciled.reconciledCounts.invoicesUpdated > 0 ? `${reconciled.reconciledCounts.invoicesUpdated} invoices linked` : '',
        reconciled.reconciledCounts.deliveryNotesUpdated > 0 ? `${reconciled.reconciledCounts.deliveryNotesUpdated} delivery notes linked` : '',
        reconciled.reconciledCounts.issuesUpdated > 0 ? `${reconciled.reconciledCounts.issuesUpdated} issues updated/resolved` : '',
      ].filter(Boolean).join(', ');

      const linkSummary = countMsg ? ` (${countMsg})` : '';
      showToast(
        'success',
        `Successfully loaded ${parsedItems.length.toLocaleString()} PO line items (${uniquePOs} POs) from "${file.name}".${linkSummary}`
      );
      setActiveTab('po_master');
    } catch (err: any) {
      console.error(err);
      showToast(
        'error',
        err?.message || 'Failed to parse Excel file. Please ensure columns match the required PO headers.'
      );
    } finally {
      setUploadModal({ open: false });
    }
  };

  // Handle saving an Invoice (Supports create and admin correction/reload)
  const handleSaveInvoice = async (newInvoice: InvoiceRecord) => {
    const isCancelledOrOfr =
      newInvoice.status === 'CANCELLED' ||
      newInvoice.status === 'OFR' ||
      newInvoice.isCancelled ||
      newInvoice.isOfr;

    // Check if there is an existing unresolved issue for this invoice
    const existingIssue = (issues || []).find(
      (i) =>
        i.entityType === 'INVOICE' &&
        i.status !== 'RESOLVED' &&
        ((newInvoice.id && i.entityId === newInvoice.id) ||
         (i.referenceNumber && i.referenceNumber.trim().toLowerCase() === newInvoice.invoiceNumber.trim().toLowerCase()))
    );

    const isExplicitlyFlagged = Boolean(
      newInvoice.hasIssue ||
      (newInvoice.lines || []).some((l) => l.hasIssue) ||
      (newInvoice.comment && !['okay', 'ok', 'active', ''].includes(newInvoice.comment.trim().toLowerCase()))
    );

    // Flag sticks if explicitly flagged OR if it was already an unresolved issue in the Hub!
    const isFlagged = !isCancelledOrOfr && (isExplicitlyFlagged || Boolean(existingIssue));

    // Ensure hasIssue and issueStatus are set on the saved invoice record
    const invoiceToSave: InvoiceRecord = {
      ...newInvoice,
      hasIssue: isFlagged,
      issueStatus: isFlagged ? (existingIssue?.status || 'PENDING') : undefined,
      comment: isFlagged && (!newInvoice.comment || newInvoice.comment.trim().toLowerCase() === 'okay')
        ? 'Discrepancy'
        : (newInvoice.comment || 'Okay'),
    };

    untrackDeletedRecords([invoiceToSave.id, invoiceToSave.invoiceNumber].filter(Boolean));

    const existingIndex = invoices.findIndex(
      (i) => i.id === invoiceToSave.id || i.invoiceNumber.trim().toLowerCase() === invoiceToSave.invoiceNumber.trim().toLowerCase()
    );
    let updatedInvoices: InvoiceRecord[];
    if (existingIndex >= 0) {
      updatedInvoices = [...invoices];
      updatedInvoices[existingIndex] = invoiceToSave;
    } else {
      updatedInvoices = [invoiceToSave, ...invoices];
    }
    setInvoices(updatedInvoices);
    saveInvoices(updatedInvoices);
    setEditingInvoice(null);

    let updatedIssuesList = issues;
    let changedIssue: DocumentIssueRecord | undefined;
    let pendingToast: ['success' | 'info' | 'warning', string] | undefined;

    if (isCancelledOrOfr) {
      // Remove any existing active issue for this invoice
      updatedIssuesList = (issues || []).filter(
        (i) => i.entityId !== invoiceToSave.id && i.referenceNumber.trim().toLowerCase() !== invoiceToSave.invoiceNumber.trim().toLowerCase()
      );
      setIssues(updatedIssuesList);
      saveIssues(updatedIssuesList);
      pendingToast = ['info', `Invoice "${invoiceToSave.invoiceNumber}" saved as ${invoiceToSave.status || 'Cancelled/OFR'} (excluded from Issue screen).`];
    } else if (isFlagged) {
      const lineIssuesList: LineItemIssue[] = (invoiceToSave.lines || [])
        .filter((l) => l.hasIssue)
        .map((l) => ({
          lineId: l.poLineId,
          itemDescription: l.itemDescription,
          unitOfMeasure: l.unitOfMeasure,
          poQuantity: l.poQuantity,
          billedOrDeliveredQuantity: l.invoicedQuantity,
          unitPrice: l.unitPrice,
          valueAfterVat: l.valueAfterVat,
          issueComment: l.issueComment || 'Discrepancy flagged on invoice line item',
          workComment: '',
          status: existingIssue?.status || 'PENDING',
        }));

      const issueId = existingIssue?.id || invoiceToSave.issueId || `issue-inv-${Date.now()}`;
      const rawReason = 
        (invoiceToSave.issueComment && invoiceToSave.issueComment.trim() !== '' && invoiceToSave.issueComment.toLowerCase() !== 'okay')
          ? invoiceToSave.issueComment.trim()
          : (invoiceToSave.comment && invoiceToSave.comment.trim() !== '' && invoiceToSave.comment.toLowerCase() !== 'okay')
          ? invoiceToSave.comment.trim()
          : (lineIssuesList.find(l => l.issueComment && l.issueComment.trim() !== '' && l.issueComment.toLowerCase() !== 'okay')?.issueComment)
          || existingIssue?.primaryIssue
          || existingIssue?.issueTitle
          || 'Discrepancy';
      const cleanReason = (rawReason && !rawReason.startsWith('Issue on ') && !rawReason.startsWith('Issue on Invoice')) 
        ? rawReason 
        : (existingIssue?.issueType || 'Discrepancy');

      const autoIssue: DocumentIssueRecord = {
        ...(existingIssue || {}),
        id: issueId,
        entityType: 'INVOICE',
        entityId: invoiceToSave.id,
        referenceNumber: invoiceToSave.invoiceNumber,
        poNumber: invoiceToSave.poNumber,
        customerName: invoiceToSave.customerName,
        destination: invoiceToSave.destination,
        contract: invoiceToSave.contract,
        totalValue: invoiceToSave.totalAfterVat,
        issueTitle: cleanReason,
        primaryIssue: cleanReason,
        issueType: existingIssue?.issueType || 'Quantity Discrepancy',
        severity: existingIssue?.severity || 'HIGH',
        status: existingIssue?.status || 'PENDING',
        flaggedBy: existingIssue?.flaggedBy || `${currentUser?.name || 'Billing Officer'} (${currentUser?.role || 'Billing Clerk'})`,
        flaggedAt: existingIssue?.flaggedAt || new Date().toISOString(),
        headerComment: invoiceToSave.issueComment || invoiceToSave.comment || existingIssue?.headerComment || cleanReason,
        lineIssues: lineIssuesList.length > 0 ? lineIssuesList : (existingIssue?.lineIssues || []),
        comments: [
          ...(existingIssue?.comments || []),
          {
            id: `cmt-${Date.now()}`,
            userName: currentUser ? `${currentUser.name} (${currentUser.role})` : 'System',
            comment: existingIssue
              ? `Invoice ${invoiceToSave.invoiceNumber} updated. Issue remains active until formally resolved.`
              : `Invoice ${invoiceToSave.invoiceNumber} flagged as discrepancy during billing.`,
            createdAt: new Date().toISOString(),
          }
        ],
      };

      updatedIssuesList = addOrUpdateIssue(autoIssue);
      changedIssue = autoIssue;
      setIssues(updatedIssuesList);
      pendingToast = ['warning', `Invoice "${invoiceToSave.invoiceNumber}" saved and flagged in Issue Resolution Hub.`];
    }

    // Persist all data silently in the background to Server Database and Google Sheets without blocking UI
    // Non-replace upsert, so only the touched rows need to go: sending the whole
    // invoices/issues tables made bulk-sync rewrite every record (and every invoice
    // line) per save and time out client-side.
    const invoiceSaved = await syncToMasterDatabase({
      invoices: [invoiceToSave],
      issues: changedIssue ? [changedIssue] : [],
      replace: false,
      source: 'invoice_save',
    });
    if (!invoiceSaved) {
      // Server-first: undo the local change so the screen never shows an unsaved invoice.
      setInvoices(invoices);
      saveInvoices(invoices);
      setIssues(issues);
      saveIssues(issues);
      setEditingInvoice(newInvoice);
      showToast('error', `Invoice "${invoiceToSave.invoiceNumber}" was NOT saved — the server did not accept it. Please try again.`);
      return;
    }
    if (pendingToast) showToast(pendingToast[0], pendingToast[1]);
  };

  // Issue Management Handlers
  const handleSaveIssue = async (newIssue: DocumentIssueRecord) => {
    untrackDeletedRecords([newIssue.id, newIssue.referenceNumber, newIssue.entityId].filter(Boolean));
    const updated = addOrUpdateIssue(newIssue);
    setIssues(updated);

    let updatedInvs = invoices;
    let updatedDNs = deliveryNotes;
    let updatedPays = payments;

    // Update document status across entities
    if (newIssue.entityType === 'INVOICE') {
      updatedInvs = invoices.map((inv) => {
        if (inv.id === newIssue.entityId || inv.invoiceNumber === newIssue.referenceNumber) {
          return { ...inv, hasIssue: true, issueId: newIssue.id, issueStatus: 'PENDING' as const };
        }
        return inv;
      });
      setInvoices(updatedInvs);
      saveInvoices(updatedInvs);
    } else if (newIssue.entityType === 'DELIVERY') {
      updatedDNs = deliveryNotes.map((dn) => {
        if (dn.id === newIssue.entityId || dn.deliveryNoteNumber === newIssue.referenceNumber) {
          return { ...dn, hasIssue: true, issueId: newIssue.id, issueStatus: 'PENDING' as const };
        }
        return dn;
      });
      setDeliveryNotes(updatedDNs);
      saveDeliveryNotes(updatedDNs);
    } else if (newIssue.entityType === 'PAYMENT') {
      updatedPays = payments.map((p) => {
        if (p.id === newIssue.entityId || p.paymentNumber === newIssue.referenceNumber) {
          return { ...p, hasIssue: true, issueStatus: 'PENDING' as const };
        }
        return p;
      });
      setPayments(updatedPays);
      savePayments(updatedPays);
    }
    showToast('success', `Issue flagged on ${newIssue.referenceNumber}. Viewable in Issue Resolution Hub.`);
    syncToMasterDatabase({
      invoices: updatedInvs,
      deliveryNotes: updatedDNs,
      payments: updatedPays,
      issues: updated,
      replace: true,
      source: 'issue_save',
    });
  };

  const handleUpdateIssue = async (updatedIssue: DocumentIssueRecord) => {
    const updated = addOrUpdateIssue(updatedIssue);
    setIssues(updated);
    showToast('success', `Updated issue record on ${updatedIssue.referenceNumber}.`);
    syncToMasterDatabase({
      issues: updated,
      replace: true,
      source: 'issue_update',
    });
  };

  const handleResolveIssue = async (issueId: string, resolvedBy: string, resolutionNotes: string) => {
    if (!isAdminUser(currentUser)) {
      showToast('error', 'Access Denied: Only Administrators are authorized to resolve issues.');
      return;
    }
    const updated = resolveDocumentIssue(issueId, resolvedBy, resolutionNotes);
    setIssues(updated);

    let updatedInvs = invoices;
    let updatedDNs = deliveryNotes;
    let updatedPays = payments;

    const resolvedItem = updated.find((i) => i.id === issueId);
    if (resolvedItem) {
      if (resolvedItem.entityType === 'INVOICE') {
        updatedInvs = invoices.map((inv) => {
          if (inv.id === resolvedItem.entityId || inv.invoiceNumber === resolvedItem.referenceNumber) {
            return { ...inv, hasIssue: false, issueStatus: 'RESOLVED' as const };
          }
          return inv;
        });
        setInvoices(updatedInvs);
        saveInvoices(updatedInvs);
      } else if (resolvedItem.entityType === 'DELIVERY') {
        updatedDNs = deliveryNotes.map((dn) => {
          if (dn.id === resolvedItem.entityId || dn.deliveryNoteNumber === resolvedItem.referenceNumber) {
            return { ...dn, hasIssue: false, issueStatus: 'RESOLVED' as const };
          }
          return dn;
        });
        setDeliveryNotes(updatedDNs);
        saveDeliveryNotes(updatedDNs);
      } else if (resolvedItem.entityType === 'PAYMENT') {
        updatedPays = payments.map((p) => {
          if (p.id === resolvedItem.entityId || p.paymentNumber === resolvedItem.referenceNumber) {
            return { ...p, hasIssue: false, issueStatus: 'RESOLVED' as const };
          }
          return p;
        });
        setPayments(updatedPays);
        savePayments(updatedPays);
      }
    }
    showToast('success', `Issue resolved and cleared from active issue screen.`);
    syncToMasterDatabase({
      invoices: updatedInvs,
      deliveryNotes: updatedDNs,
      payments: updatedPays,
      issues: updated,
      replace: true,
      source: 'issue_resolve',
    });
  };

  const handleResolveMultipleIssues = async (issueIds: string[], resolvedBy: string, resolutionNotes: string) => {
    if (!isAdminUser(currentUser)) {
      showToast('error', 'Access Denied: Only Administrators are authorized to resolve issues.');
      return;
    }
    if (!issueIds || issueIds.length === 0) return;
    const updated = resolveMultipleDocumentIssues(issueIds, resolvedBy, resolutionNotes);
    setIssues(updated);

    const idSet = new Set(issueIds);
    const resolvedItems = updated.filter((i) => idSet.has(i.id));
    const resolvedRefs = new Set(resolvedItems.map((i) => (i.referenceNumber || '').trim().toLowerCase()));

    const updatedInvs = invoices.map((inv) => {
      const ref = (inv.invoiceNumber || '').trim().toLowerCase();
      if (resolvedRefs.has(ref) || resolvedItems.some((r) => r.entityId === inv.id)) {
        return { ...inv, hasIssue: false, issueStatus: 'RESOLVED' as const };
      }
      return inv;
    });
    setInvoices(updatedInvs);
    saveInvoices(updatedInvs);

    const updatedDNs = deliveryNotes.map((dn) => {
      const ref = (dn.deliveryNoteNumber || '').trim().toLowerCase();
      if (resolvedRefs.has(ref) || resolvedItems.some((r) => r.entityId === dn.id)) {
        return { ...dn, hasIssue: false, issueStatus: 'RESOLVED' as const };
      }
      return dn;
    });
    setDeliveryNotes(updatedDNs);
    saveDeliveryNotes(updatedDNs);

    const updatedPays = payments.map((p) => {
      const ref = (p.paymentNumber || '').trim().toLowerCase();
      if (resolvedRefs.has(ref) || resolvedItems.some((r) => r.entityId === p.id)) {
        return { ...p, hasIssue: false, issueStatus: 'RESOLVED' as const };
      }
      return p;
    });
    setPayments(updatedPays);
    savePayments(updatedPays);

    showToast('success', `Successfully resolved ${issueIds.length} issues.`);
    syncToMasterDatabase({
      invoices: updatedInvs,
      deliveryNotes: updatedDNs,
      payments: updatedPays,
      issues: updated,
      replace: true,
      source: 'issue_batch_resolve',
    });
  };

  const handleImportInvoices = async (importedInvoices: InvoiceRecord[], mode: 'append' | 'replace' | string = 'append') => {
    let finalInvoices: InvoiceRecord[] = [];
    const isReplace = String(mode).toLowerCase() === 'replace';
    if (isReplace) {
      finalInvoices = importedInvoices;
    } else {
      // Append mode: merge imported records with existing records
      const map = new Map<string, InvoiceRecord>();
      invoices.forEach((inv) => map.set(inv.invoiceNumber.toLowerCase().trim(), inv));
      importedInvoices.forEach((inv) => map.set(inv.invoiceNumber.toLowerCase().trim(), inv));
      finalInvoices = Array.from(map.values());
    }

    setInvoices(finalInvoices);
    saveInvoices(finalInvoices);
    // Only the imported rows are upserted; sending the whole table would rewrite every invoice.
    const importSaved = await syncToMasterDatabase({
      invoices: importedInvoices,
      source: 'invoice_import',
    });
    if (!importSaved) {
      // Server-first: undo the local import if the database did not accept it.
      setInvoices(invoices);
      saveInvoices(invoices);
      showToast('error', 'Invoice import was NOT saved — the server did not accept it. Nothing was changed. Please try again.');
      return;
    }
    showToast('success', `Successfully loaded ${importedInvoices.length} invoices into database (${isReplace ? 'replace' : 'append'} mode). Total database: ${finalInvoices.length} invoices.`);
  };

  const handleImportDeliveryNotes = async (importedDeliveryNotes: DeliveryNoteRecord[], mode: 'append' | 'replace' | string = 'append') => {
    let finalDeliveryNotes: DeliveryNoteRecord[] = [];
    const isReplace = String(mode).toLowerCase() === 'replace';
    if (isReplace) {
      finalDeliveryNotes = importedDeliveryNotes;
    } else {
      // Append mode: merge imported records with existing records
      const map = new Map<string, DeliveryNoteRecord>();
      deliveryNotes.forEach((dn) => map.set(dn.deliveryNoteNumber.toLowerCase().trim(), dn));
      importedDeliveryNotes.forEach((dn) => map.set(dn.deliveryNoteNumber.toLowerCase().trim(), dn));
      finalDeliveryNotes = Array.from(map.values());
    }

    setDeliveryNotes(finalDeliveryNotes);
    saveDeliveryNotes(finalDeliveryNotes);
    // Only the imported rows are upserted; sending the whole table would rewrite every delivery note.
    const importSaved = await syncToMasterDatabase({
      deliveryNotes: importedDeliveryNotes,
      source: 'delivery_note_import',
    });
    if (!importSaved) {
      // Server-first: undo the local import if the database did not accept it.
      setDeliveryNotes(deliveryNotes);
      saveDeliveryNotes(deliveryNotes);
      showToast('error', 'Delivery note import was NOT saved — the server did not accept it. Nothing was changed. Please try again.');
      return;
    }
    showToast('success', `Successfully loaded ${importedDeliveryNotes.length} delivery notes into database (${isReplace ? 'replace' : 'append'} mode). Total database: ${finalDeliveryNotes.length} delivery notes.`);
  };

  const handleDeleteIssue = async (issueId: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const target = issues.find((i) => i.id === issueId);
    const updated = (issues || []).filter((i) => i.id !== issueId);
    setIssues(updated);
    saveIssues(updated);
    const deletedIdentifiers = [issueId, target?.referenceNumber].filter(Boolean) as string[];
    trackDeletedRecords(deletedIdentifiers);
    try {
      await deleteServerIssue(issueId);
    } catch (e) {
      console.warn('Backend issue deletion note:', e);
    }
    await syncToMasterDatabase({
      issues: updated,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'issue_delete',
    });
    showToast('info', `Issue record "${target?.referenceNumber || issueId}" permanently deleted.`);
  };

  const handleOpenFlagModal = (preselected?: {
    type: 'INVOICE' | 'DELIVERY' | 'PAYMENT';
    invoice?: InvoiceRecord;
    deliveryNote?: DeliveryNoteRecord;
    payment?: PaymentRecord;
  }) => {
    setPreselectedFlagEntity(preselected || null);
    setIsFlagModalOpen(true);
  };

  // Admin: Handle adding new PO
  const handleAddPO = (newLines: POLineItem[]) => {
    const newIdentifiers = newLines.map((l) => l.id).concat(newLines.map((l) => l.poNumber).filter(Boolean));
    untrackDeletedRecords(newIdentifiers);
    const updated = [...newLines, ...poLines];
    setPoLines(updated);
    savePOs(updated);
    syncToMasterDatabase({
      poLines: updated,
      source: 'po_add',
    });
    showToast('success', `Added Purchase Order with ${newLines.length} line(s).`);
  };

  // Admin: Handle editing PO header details across all lines
  const handleEditPODetails = (
    poNumber: string,
    details: { customerName: string; destination: string; contract: string; date: string }
  ) => {
    const updated = poLines.map((l) => {
      if (l.poNumber.trim().toLowerCase() === poNumber.trim().toLowerCase()) {
        return {
          ...l,
          customerName: details.customerName || l.customerName,
          destination: details.destination || l.destination,
          contract: details.contract || l.contract,
          date: details.date || l.date,
        };
      }
      return l;
    });
    setPoLines(updated);
    savePOs(updated);
    syncToMasterDatabase({
      poLines: updated,
      source: 'po_edit',
    });
    showToast('success', `Updated details for PO "${poNumber}".`);
  };

  // Admin: Handle adding a new line to an existing PO
  const handleAddPOLine = (newLine: POLineItem) => {
    const newIdentifiers = [newLine.id, newLine.poNumber].filter(Boolean);
    untrackDeletedRecords(newIdentifiers);
    const updated = [newLine, ...poLines];
    setPoLines(updated);
    savePOs(updated);
    syncToMasterDatabase({
      poLines: updated,
      source: 'po_line_add',
    });
    showToast('success', `Added line item to PO "${newLine.poNumber}".`);
  };

  // Admin: Handle updating a single PO line item
  const handleUpdatePOLine = (updatedLine: POLineItem) => {
    const updated = poLines.map((l) => (l.id === updatedLine.id ? updatedLine : l));
    setPoLines(updated);
    savePOs(updated);
    syncToMasterDatabase({
      poLines: updated,
      source: 'po_line_update',
    });
    showToast('success', `Updated line item "${updatedLine.itemDescription}".`);
  };

  // Admin: Handle deleting a single PO line item permanently
  const handleDeletePOLine = async (lineId: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const updated = (poLines || []).filter((l) => l.id !== lineId);
    setPoLines(updated);
    savePOs(updated);
    const deletedIdentifiers = [lineId];
    trackDeletedRecords(deletedIdentifiers);
    try {
      await deleteServerPOLine(lineId);
    } catch (e) {
      console.warn('Backend PO line delete note:', e);
    }
    await syncToMasterDatabase({
      poLines: updated,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'po_line_delete',
    });
    showToast('info', 'PO line item permanently deleted.');
  };

  // Admin: Handle deleting an entire Purchase Order permanently
  const handleDeletePO = async (poNumber: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const clean = (poNumber || '').trim().toLowerCase();
    const poLineIds = (poLines || []).filter((l) => (l.poNumber || '').trim().toLowerCase() === clean).map((l) => l.id);
    const updated = (poLines || []).filter((l) => (l.poNumber || '').trim().toLowerCase() !== clean);
    setPoLines(updated);
    savePOs(updated);
    const deletedIdentifiers = [poNumber, ...poLineIds];
    trackDeletedRecords(deletedIdentifiers);
    try {
      await deleteServerPO(poNumber);
    } catch (e) {
      console.warn('Server PO delete note:', e);
    }
    await syncToMasterDatabase({
      poLines: updated,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'po_delete',
    });
    showToast('info', `Purchase Order "${poNumber}" permanently deleted.`);
  };

  // Admin: Handle deleting multiple selected Purchase Orders permanently in a batch
  const handleDeleteBatchPOs = async (poNumbers: string[]) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    if (!poNumbers || poNumbers.length === 0) return;

    const cleanNumbers = new Set(poNumbers.map((n) => (n || '').trim().toLowerCase()).filter(Boolean));
    const linesToDelete = (poLines || []).filter((l) => cleanNumbers.has((l.poNumber || '').trim().toLowerCase()));
    const poLineIds = linesToDelete.map((l) => l.id);
    const updated = (poLines || []).filter((l) => !cleanNumbers.has((l.poNumber || '').trim().toLowerCase()));

    setPoLines(updated);
    savePOs(updated);

    const deletedIdentifiers = [...poNumbers, ...poLineIds];
    trackDeletedRecords(deletedIdentifiers);

    // Call atomic server delete for each selected PO
    for (const poNum of poNumbers) {
      try {
        await deleteServerPO(poNum);
      } catch (e) {
        console.warn('Server batch PO delete note:', e);
      }
    }

    await syncToMasterDatabase({
      poLines: updated,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'po_batch_delete',
    });

    showToast('info', `Successfully deleted ${poNumbers.length} Purchase Orders (${linesToDelete.length} line items) permanently.`);
  };

  // Admin: Handle clearing all Purchase Orders permanently
  const handleClearAllPOs = async () => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can clear all Purchase Orders.');
      return;
    }

    const count = (poLines || []).length;

    // Collect all PO numbers and line IDs to register as deleted tombstones
    const deletedPoIdentifiers = (poLines || [])
      .map((l) => l.id)
      .concat((poLines || []).map((l) => l.poNumber).filter(Boolean));
    trackDeletedRecords(deletedPoIdentifiers);

    // 1. Update state and local storage immediately
    setPoLines([]);
    savePOs([]);

    // 2. Persist to Central Master Database
    syncToMasterDatabase({
      poLines: [],
      deletedIds: deletedPoIdentifiers,
      replace: true,
      source: 'po_clear_all',
    });

    // 3. Clear POs directly on Central Master Database endpoint
    await clearServerPOs();

    // 4. Update sync line metrics
    if (serverCounts) {
      setServerCounts({
        ...serverCounts,
        totalPoLines: 0,
        totalPoGroups: 0,
      });
    }
    setLastSyncTime(new Date());

    showToast('success', count > 0 ? `All ${count.toLocaleString()} Purchase Order lines cleared permanently.` : 'All Purchase Orders cleared.');
  };

  // Admin: Handle permanently deleting an Invoice transaction
  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const target = invoices.find((i) => i.id === invoiceId);
    const targetNum = target?.invoiceNumber ? target.invoiceNumber.trim() : '';
    const targetRef = targetNum.toLowerCase();

    const deletedIdentifiers = [invoiceId, targetNum, targetRef].filter(Boolean) as string[];
    trackDeletedRecords(deletedIdentifiers);

    const updatedInvoices = (invoices || []).filter(
      (i) => i.id !== invoiceId && (!targetRef || (i.invoiceNumber || '').trim().toLowerCase() !== targetRef)
    );
    setInvoices(updatedInvoices);
    saveInvoices(updatedInvoices);

    // Also remove any linked issues permanently
    const updatedIssues = (issues || []).filter(
      (i) => i.entityId !== invoiceId && (targetRef ? (i.referenceNumber || '').trim().toLowerCase() !== targetRef : true)
    );
    setIssues(updatedIssues);
    saveIssues(updatedIssues);

    showToast('info', `Invoice "${targetNum || invoiceId}" permanently deleted. PO balance restored.`);

    // 1. Immediate atomic DELETE on server
    try {
      await deleteServerInvoice(target?.id || invoiceId);
    } catch (e) {
      console.warn('Server invoice deletion note:', e);
    }

    // 2. Also sync to master database with deletedIds and replace: true
    await syncToMasterDatabase({
      invoices: updatedInvoices,
      issues: updatedIssues,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'invoice_delete',
    });
  };

  // Admin: Handle permanently deleting a Delivery Note transaction
  const handleDeleteDeliveryNote = async (dnId: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const target = deliveryNotes.find((dn) => dn.id === dnId);
    const targetNum = target?.deliveryNoteNumber ? target.deliveryNoteNumber.trim() : '';
    const targetRef = targetNum.toLowerCase();

    const deletedIdentifiers = [dnId, targetNum, targetRef].filter(Boolean) as string[];
    trackDeletedRecords(deletedIdentifiers);

    const updatedDNs = (deliveryNotes || []).filter(
      (dn) => dn.id !== dnId && (!targetRef || (dn.deliveryNoteNumber || '').trim().toLowerCase() !== targetRef)
    );
    setDeliveryNotes(updatedDNs);
    saveDeliveryNotes(updatedDNs);

    // Also remove any linked issues permanently
    const updatedIssues = (issues || []).filter(
      (i) => i.entityId !== dnId && (targetRef ? (i.referenceNumber || '').trim().toLowerCase() !== targetRef : true)
    );
    setIssues(updatedIssues);
    saveIssues(updatedIssues);

    showToast('info', `Delivery Note "${targetNum || dnId}" permanently deleted. Dispatch balance restored.`);

    // 1. Immediate atomic DELETE on server
    try {
      await deleteServerDeliveryNote(target?.id || dnId);
    } catch (e) {
      console.warn('Server DN deletion note:', e);
    }

    // 2. Also sync to master database with deletedIds and replace: true
    await syncToMasterDatabase({
      deliveryNotes: updatedDNs,
      issues: updatedIssues,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'dn_delete',
    });
  };

  // Admin: Handle permanently deleting a Payment transaction
  const handleDeletePayment = async (paymentId: string) => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can delete data in the system.');
      return;
    }
    const target = payments.find((p) => p.id === paymentId);
    if (!target) return;

    const targetNum = target.paymentNumber ? target.paymentNumber.trim() : '';
    const targetRef = targetNum.toLowerCase();
    const deletedIdentifiers = [paymentId, targetNum, targetRef].filter(Boolean) as string[];
    trackDeletedRecords(deletedIdentifiers);

    // Reverse payment allocations on affected invoices
    let updatedInvoices = [...invoices];
    if (target.allocations && target.allocations.length > 0) {
      const allocMap = new Map<string, number>();
      target.allocations.forEach((a) => {
        allocMap.set(a.invoiceId, (allocMap.get(a.invoiceId) || 0) + (a.allocatedAmount || 0));
      });

      updatedInvoices = updatedInvoices.map((inv) => {
        if (allocMap.has(inv.id)) {
          const allocatedAmount = allocMap.get(inv.id) || 0;
          const newPaid = Math.max(0, (inv.paidAmount || 0) - allocatedAmount);
          const totalAfterVat = inv.totalAfterVat || 0;
          let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' = 'UNPAID';
          if (newPaid >= totalAfterVat && totalAfterVat > 0) {
            paymentStatus = 'FULLY_PAID';
          } else if (newPaid > 0) {
            paymentStatus = 'PARTIALLY_PAID';
          }
          return {
            ...inv,
            paidAmount: Math.round(newPaid * 100) / 100,
            paymentStatus,
          };
        }
        return inv;
      });
      setInvoices(updatedInvoices);
      saveInvoices(updatedInvoices);
    }

    const updatedPayments = (payments || []).filter((p) => p.id !== paymentId);
    setPayments(updatedPayments);
    savePayments(updatedPayments);

    // Remove linked issues permanently
    const updatedIssues = (issues || []).filter(
      (i) => i.entityId !== paymentId && (targetRef ? (i.referenceNumber || '').trim().toLowerCase() !== targetRef : true)
    );
    setIssues(updatedIssues);
    saveIssues(updatedIssues);

    try {
      await deleteServerPayment(target.id || paymentId);
    } catch (e) {
      console.warn('Server payment deletion note:', e);
    }

    await syncToMasterDatabase({
      payments: updatedPayments,
      invoices: updatedInvoices,
      issues: updatedIssues,
      deletedIds: deletedIdentifiers,
      replace: true,
      source: 'payment_delete',
    });
    showToast('info', `Payment "${target.paymentNumber}" permanently deleted. Open invoice balances restored.`);
  };

  // Recalculate & refresh totals across all invoices & delivery notes
  const handleRecalculateAllTotals = async () => {
    setIsDataSyncing(true);
    try {
      let invUpdatedCount = 0;
      const poById = new Map<string, POLineItem>();
      const poByDescKey = new Map<string, POLineItem>();
      (poLines || []).forEach((p) => {
        if (p.id) poById.set(p.id.toLowerCase().trim(), p);
        if (p.poNumber && p.itemDescription) {
          poByDescKey.set(`${p.poNumber.trim().toLowerCase()}___${p.itemDescription.trim().toLowerCase()}`, p);
        }
      });

      const recalculatedInvoices = (invoices || []).map((inv) => {
        const lines = inv.lines || [];
        if (lines.length === 0) {
          let sub = parseCleanNumber(inv.subtotalBeforeVat);
          let vt = parseCleanNumber(inv.totalVat);
          let tot = parseCleanNumber(inv.totalAfterVat);
          if (tot > 0 && sub <= 0) {
            sub = Math.round((tot / 1.18) * 100) / 100;
            vt = Math.round((tot - sub) * 100) / 100;
          } else if (sub > 0 && tot <= 0) {
            vt = Math.round(sub * 0.18 * 100) / 100;
            tot = Math.round((sub + vt) * 100) / 100;
          }
          if (inv.subtotalBeforeVat !== sub || inv.totalVat !== vt || inv.totalAfterVat !== tot) {
            invUpdatedCount += 1;
          }
          return { ...inv, subtotalBeforeVat: sub, totalVat: vt, totalAfterVat: tot };
        }

        let sub = 0;
        let vt = 0;
        const updatedLines = lines.map((l) => {
          const qty = parseCleanNumber(l.invoicedQuantity ?? l.quantityInvoiced ?? l.billedQuantity ?? l.billQty ?? 0);
          let price = parseCleanNumber(l.unitPrice ?? 0);
          if (price === 0 && l.poLineId) {
            const p = poById.get(String(l.poLineId).toLowerCase().trim());
            if (p && parseCleanNumber(p.unitPrice) > 0) price = parseCleanNumber(p.unitPrice);
          }
          if (price === 0 && inv.poNumber && l.itemDescription) {
            const k = `${inv.poNumber.trim().toLowerCase()}___${l.itemDescription.trim().toLowerCase()}`;
            const p = poByDescKey.get(k);
            if (p && parseCleanNumber(p.unitPrice) > 0) price = parseCleanNumber(p.unitPrice);
          }

          const vRate =
            l.vatRate !== undefined && l.vatRate !== null && Number(l.vatRate) > 0 && Number(l.vatRate) <= 1
              ? Number(l.vatRate)
              : 0.18;

          let vb = 0;
          if (qty > 0 && price > 0) {
            vb = Math.round(qty * price * 100) / 100;
          } else if (parseCleanNumber(l.valueBeforeVat) > 0) {
            vb = parseCleanNumber(l.valueBeforeVat);
            if (qty > 0 && price === 0) price = Math.round((vb / qty) * 100) / 100;
          } else if (parseCleanNumber(l.totalBeforeVat) > 0) {
            vb = parseCleanNumber(l.totalBeforeVat);
            if (qty > 0 && price === 0) price = Math.round((vb / qty) * 100) / 100;
          } else if (parseCleanNumber(l.valueAfterVat) > 0) {
            vb = Math.round((parseCleanNumber(l.valueAfterVat) / (1 + vRate)) * 100) / 100;
            if (qty > 0 && price === 0) price = Math.round((vb / qty) * 100) / 100;
          } else {
            vb = Math.round(qty * price * 100) / 100;
          }

          let va = Math.round(vb * vRate * 100) / 100;
          const explicitVat = parseCleanNumber(l.vatAmount);
          if (explicitVat > 0 && explicitVat <= vb * 0.35) {
            va = explicitVat;
          }
          const vTot = Math.round((vb + va) * 100) / 100;

          sub += vb;
          vt += va;

          return {
            ...l,
            invoicedQuantity: qty,
            unitPrice: price,
            vatRate: vRate,
            valueBeforeVat: vb,
            totalBeforeVat: vb,
            vatAmount: va,
            valueAfterVat: vTot,
            totalAfterVat: vTot,
          };
        });

        sub = Math.round(sub * 100) / 100;
        vt = Math.round(vt * 100) / 100;
        const tot = Math.round((sub + vt) * 100) / 100;

        if (inv.subtotalBeforeVat !== sub || inv.totalVat !== vt || inv.totalAfterVat !== tot) {
          invUpdatedCount += 1;
        }

        return {
          ...inv,
          lines: updatedLines,
          subtotalBeforeVat: sub,
          totalVat: vt,
          totalAfterVat: tot,
        };
      });

      let dnUpdatedCount = 0;
      const recalculatedDNs = (deliveryNotes || []).map((dn) => {
        const lines = dn.lines || [];
        if (lines.length === 0) return dn;
        let totQty = 0;
        let totVal = 0;
        const updatedLines = lines.map((l) => {
          const qty = Number(l.deliveredQuantity ?? l.quantityDelivered ?? 0);
          const price = Number(l.unitPrice ?? 0);
          const vRate = l.vatRate !== undefined && l.vatRate !== null ? Number(l.vatRate) : 0.18;
          const vb = Math.round(qty * price * 100) / 100;
          const va = Math.round(vb * vRate * 100) / 100;
          const vTot = Math.round((vb + va) * 100) / 100;
          totQty += qty;
          totVal += vTot;
          return {
            ...l,
            deliveredQuantity: qty,
            unitPrice: price,
            vatRate: vRate,
            valueBeforeVat: vb,
            vatAmount: va,
            valueAfterVat: vTot,
            totalDeliveredValue: vTot,
          };
        });
        totVal = Math.round(totVal * 100) / 100;
        if (dn.totalDeliveredQuantity !== totQty || dn.totalDeliveredValue !== totVal) {
          dnUpdatedCount += 1;
        }
        return {
          ...dn,
          lines: updatedLines,
          totalDeliveredQuantity: totQty,
          totalDeliveredValue: totVal,
        };
      });

      setInvoices(recalculatedInvoices);
      saveInvoices(recalculatedInvoices);
      setDeliveryNotes(recalculatedDNs);
      saveDeliveryNotes(recalculatedDNs);

      await recalculateAllInvoiceTotalsOnServer();

      // Push recalculated values to server master database and Supabase
      await syncToMasterDatabase({
        invoices: recalculatedInvoices,
        deliveryNotes: recalculatedDNs,
        replace: true,
        source: 'recalculate_totals',
      });

      showToast(
        'success',
        `Successfully recalculated and refreshed totals across all ${recalculatedInvoices.length} invoices and ${recalculatedDNs.length} delivery notes!`
      );
    } catch (err: any) {
      console.error('Error recalculating totals:', err);
      showToast('error', 'Failed to recalculate all totals. Please try again.');
    } finally {
      setIsDataSyncing(false);
    }
  };

  // Handle saving a Delivery Note
  const handleSaveDeliveryNote = async (newDN: DeliveryNoteRecord) => {
    untrackDeletedRecords([newDN.id, newDN.deliveryNoteNumber].filter(Boolean));

    const cleanNum = (newDN.deliveryNoteNumber || '').trim().toLowerCase();
    const existingIndex = deliveryNotes.findIndex(
      (d) => d.id === newDN.id || (d.deliveryNoteNumber || '').trim().toLowerCase() === cleanNum
    );
    let updatedDNs: DeliveryNoteRecord[];
    if (existingIndex >= 0) {
      updatedDNs = [...deliveryNotes];
      updatedDNs[existingIndex] = newDN;
    } else {
      updatedDNs = [newDN, ...deliveryNotes];
    }
    setDeliveryNotes(updatedDNs);
    saveDeliveryNotes(updatedDNs);

    const isCancelledOrOfr =
      newDN.status === 'CANCELLED' ||
      newDN.status === 'OFR' ||
      newDN.isCancelled ||
      newDN.isOfr;
    const isFlagged = !isCancelledOrOfr && (newDN.hasIssue || (newDN.lines || []).some((l) => l.hasIssue));

    let updatedIssuesList = issues;
    let changedIssue: DocumentIssueRecord | undefined;
    let pendingToast: ['success' | 'info', string] = ['success', `Delivery Note "${newDN.deliveryNoteNumber}" recorded successfully.`];

    if (isCancelledOrOfr) {
      // Remove any existing active issue for this delivery note
      updatedIssuesList = (issues || []).filter(
        (i) => i.entityId !== newDN.id && i.referenceNumber.trim().toLowerCase() !== newDN.deliveryNoteNumber.trim().toLowerCase()
      );
      setIssues(updatedIssuesList);
      saveIssues(updatedIssuesList);
      pendingToast = ['info', `Delivery Note "${newDN.deliveryNoteNumber}" saved as ${newDN.status || 'Cancelled/OFR'} (excluded from Issue screen).`];
    } else if (isFlagged) {
      const existingIssue = (issues || []).find(
        (i) => i.entityId === newDN.id || (newDN.deliveryNoteNumber && i.referenceNumber?.trim().toLowerCase() === newDN.deliveryNoteNumber.trim().toLowerCase())
      );

      const isCallOfOrderStr = (s?: string) => s && (s.toLowerCase().includes('call of order') || s === '[call of order]');

      const lineIssuesList: LineItemIssue[] = (newDN.lines || [])
        .filter((l) => l.hasIssue)
        .map((l) => ({
          lineId: l.poLineId,
          itemDescription: l.itemDescription,
          unitOfMeasure: l.unitOfMeasure,
          poQuantity: l.poQuantity,
          billedOrDeliveredQuantity: l.deliveredQuantity,
          unitPrice: l.unitPrice,
          valueAfterVat: l.valueAfterVat,
          issueComment: (l.issueComment && !isCallOfOrderStr(l.issueComment)) ? l.issueComment : (l.comment && !isCallOfOrderStr(l.comment) && l.comment.toLowerCase() !== 'okay') ? l.comment : 'Discrepancy on delivered line item',
          workComment: '',
          status: existingIssue?.status || 'PENDING',
        }));

      const issueId = existingIssue?.id || newDN.issueId || `issue-dn-${Date.now()}`;

      // Clean Flagged Reason: Never "Call of Order", never generic
      const rawReason = 
        (newDN.issueComment && !isCallOfOrderStr(newDN.issueComment) && newDN.issueComment.trim() !== '' && newDN.issueComment.toLowerCase() !== 'okay')
          ? newDN.issueComment.trim()
          : (lineIssuesList.find(l => l.issueComment && !isCallOfOrderStr(l.issueComment) && l.issueComment.trim() !== '' && l.issueComment.toLowerCase() !== 'okay')?.issueComment)
          || (existingIssue?.primaryIssue && !isCallOfOrderStr(existingIssue.primaryIssue) ? existingIssue.primaryIssue : null)
          || (existingIssue?.issueType || 'Quantity Discrepancy');

      const cleanReason = (rawReason && !rawReason.startsWith('Issue on ') && !rawReason.startsWith('Delivery Discrepancy on '))
        ? rawReason
        : (existingIssue?.issueType || 'Quantity Discrepancy');

      // Comment from delivery details
      const deliveryComment = (newDN.comment && !isCallOfOrderStr(newDN.comment) && newDN.comment.trim() !== '' && newDN.comment.toLowerCase() !== 'okay')
        ? newDN.comment.trim()
        : (newDN.notes && !isCallOfOrderStr(newDN.notes) && newDN.notes.trim() !== '')
        ? newDN.notes.trim()
        : (existingIssue?.headerComment && !isCallOfOrderStr(existingIssue.headerComment) && !existingIssue.headerComment.startsWith('Discrepancy flagged during'))
        ? existingIssue.headerComment
        : '';

      const autoIssue: DocumentIssueRecord = {
        ...(existingIssue || {}),
        id: issueId,
        entityType: 'DELIVERY',
        entityId: newDN.id,
        referenceNumber: newDN.deliveryNoteNumber,
        poNumber: newDN.poNumber,
        customerName: newDN.customerName,
        destination: newDN.destination,
        contract: newDN.contract,
        totalValue: newDN.totalDeliveredValue,
        issueTitle: cleanReason,
        primaryIssue: cleanReason,
        issueType: existingIssue?.issueType || 'Quantity Discrepancy',
        severity: existingIssue?.severity || 'HIGH',
        status: existingIssue?.status || 'PENDING',
        flaggedBy: existingIssue?.flaggedBy || `${currentUser?.name || 'Logistics Officer'} (${currentUser?.role || 'Dispatcher'})`,
        flaggedAt: existingIssue?.flaggedAt || new Date().toISOString(),
        headerComment: deliveryComment || cleanReason,
        lineIssues: lineIssuesList.length > 0 ? lineIssuesList : (existingIssue?.lineIssues || []),
        comments: existingIssue?.comments || [],
      };

      updatedIssuesList = addOrUpdateIssue(autoIssue);
      changedIssue = autoIssue;
      setIssues(updatedIssuesList);
      pendingToast = ['info', `Delivery Note "${newDN.deliveryNoteNumber}" saved and automatically added to Issue Resolution Hub.`];
    }

    // Persist all data simultaneously to Server Database & Google Sheets
    const dnSaved = await syncToMasterDatabase({
      deliveryNotes: [newDN],
      issues: changedIssue ? [changedIssue] : [],
      replace: false,
      source: 'dn_save',
    });
    if (!dnSaved) {
      // Server-first: undo the local change so the screen never shows an unsaved delivery note.
      setDeliveryNotes(deliveryNotes);
      saveDeliveryNotes(deliveryNotes);
      setIssues(issues);
      saveIssues(issues);
      showToast('error', `Delivery Note "${newDN.deliveryNoteNumber}" was NOT saved — the server did not accept it. Please try again.`);
      return;
    }
    showToast(pendingToast[0], pendingToast[1]);
  };

  // Handle saving a Payment with invoice allocation updates
  const handleSavePayment = async (newPayment: PaymentRecord, updatedInvoices: InvoiceRecord[]) => {
    untrackDeletedRecords([
      newPayment.id,
      newPayment.paymentNumber,
      newPayment.referenceNumber,
      ...updatedInvoices.map((i) => i.id),
      ...updatedInvoices.map((i) => i.invoiceNumber),
    ].filter(Boolean));

    const cleanNum = (newPayment.paymentNumber || '').trim().toLowerCase();
    const updatedPayments = [
      newPayment,
      ...payments.filter((p) => p.id !== newPayment.id && (p.paymentNumber || '').trim().toLowerCase() !== cleanNum)
    ];
    setPayments(updatedPayments);
    savePayments(updatedPayments);
    setInvoices(updatedInvoices);
    saveInvoices(updatedInvoices);

    const isFlagged = newPayment.hasIssue || (newPayment.allocations || []).some((a) => a.hasIssue);
    let updatedIssuesList = issues;

    if (isFlagged) {
      const lineIssuesList: LineItemIssue[] = (newPayment.allocations || [])
        .filter((a) => a.hasIssue)
        .map((a) => ({
          lineId: a.invoiceId,
          itemDescription: `Invoice #${a.invoiceNumber} (PO: ${a.poNumber})`,
          unitOfMeasure: 'UNIT',
          poQuantity: 1,
          billedOrDeliveredQuantity: 1,
          unitPrice: a.allocatedAmount,
          valueAfterVat: a.allocatedAmount,
          issueComment: a.issueComment || 'Payment remittance / settlement discrepancy',
          workComment: '',
          status: 'PENDING',
        }));

      const autoIssue: DocumentIssueRecord = {
        id: `issue-pay-${Date.now()}`,
        entityType: 'PAYMENT',
        entityId: newPayment.id,
        referenceNumber: newPayment.paymentNumber,
        poNumber: newPayment.poNumber || 'MULTI-PO',
        customerName: newPayment.customerName,
        destination: '',
        contract: '',
        totalValue: newPayment.amountPaid,
        issueTitle: `Payment Discrepancy on ${newPayment.paymentNumber} (${newPayment.customerName})`,
        issueType: 'Payment Mismatch',
        severity: 'HIGH',
        status: 'PENDING',
        flaggedBy: `${currentUser?.name || 'Finance Officer'} (${currentUser?.role || 'Finance'})`,
        flaggedAt: new Date().toISOString(),
        headerComment: newPayment.issueComment || 'Payment discrepancy flagged during recording',
        lineIssues: lineIssuesList,
        comments: [],
      };

      updatedIssuesList = addOrUpdateIssue(autoIssue);
      setIssues(updatedIssuesList);
      showToast('info', `Payment "${newPayment.paymentNumber}" recorded and automatically added to Issue Resolution Hub.`);
    } else {
      showToast('success', `Payment "${newPayment.paymentNumber}" of TZS ${formatCurrency(newPayment.amountPaid)} recorded and allocated.`);
    }

    // Persist all data simultaneously to Server Database & Google Sheets
    syncToMasterDatabase({
      payments: updatedPayments,
      invoices: updatedInvoices,
      issues: updatedIssuesList,
      source: 'payment_save',
    });
  };

  // Handle deep navigation from Dashboard
  const handleDashboardNavigate = (tab: ActiveTab, subFilter?: string) => {
    if (tab === 'matching_report' && subFilter) {
      setMatchingFilter(subFilter as any);
    } else {
      setMatchingFilter('ALL');
    }
    setActiveTab(tab);
  };

  // Handle full restore from a disaster-recovery backup file
  const handleDataRestored = (restored: {
    poLines: POLineItem[];
    invoices: InvoiceRecord[];
    deliveryNotes: DeliveryNoteRecord[];
    payments: PaymentRecord[];
    issues?: DocumentIssueRecord[];
  }) => {
    setPoLines(restored.poLines);
    setInvoices(restored.invoices);
    setDeliveryNotes(restored.deliveryNotes);
    setPayments(restored.payments);
    if (restored.issues !== undefined) {
      setIssues(restored.issues);
      saveIssues(restored.issues);
    }
    setCurrentUser(getCurrentSessionUser());
    syncToMasterDatabase({
      poLines: restored.poLines,
      invoices: restored.invoices,
      deliveryNotes: restored.deliveryNotes,
      payments: restored.payments,
      issues: restored.issues !== undefined ? restored.issues : issues,
      replace: true,
      source: 'data_restore',
    });
    const issueCount = restored.issues !== undefined ? restored.issues.length : issues.length;
    showToast(
      'success',
      `Workspace successfully updated and synchronized! (${restored.poLines.length} PO lines, ${restored.invoices.length} Invoices, ${restored.deliveryNotes.length} Delivery Notes, ${restored.payments.length} Payments, ${issueCount} Document Issues)`
    );
  };

  // Reset to clean fresh workspace
  const handleResetData = () => {
    setIsResetModalOpen(true);
  };

  const executeResetData = () => {
    const res = clearAllData();
    setPoLines(res.pos);
    setInvoices(res.invoices);
    setDeliveryNotes(res.deliveryNotes);
    setPayments(res.payments);
    setIssues(res.issues);
    syncToMasterDatabase({
      poLines: res.pos,
      invoices: res.invoices,
      deliveryNotes: res.deliveryNotes,
      payments: res.payments,
      issues: res.issues,
      replace: true,
      source: 'workspace_reset',
    });
    setIsResetModalOpen(false);
    showToast('success', 'Workspace cleared and ready for live data.');
  };

  // Clear all data (Admin reset with server persistence) - purges all data and removes all non-ADM users
  const handleClearData = async () => {
    if (!canDeleteData(currentUser)) {
      showToast('error', 'Access Denied: Only Administrator (ADM) can clear all data.');
      return;
    }
    setIsClearAllModalOpen(true);
  };

  const executeClearData = async () => {
    // 1. Clear local transactions
    const res = clearAllData();
    setPoLines(res.pos);
    setInvoices(res.invoices);
    setDeliveryNotes(res.deliveryNotes);
    setPayments(res.payments);
    setIssues(res.issues);

    // 2. Filter users to only ADM accounts
    const allUsers = loadStoredUsers();
    const adminOnlyUsers = allUsers.filter((u) => {
      const role = (u.role || '').trim().toLowerCase();
      const id = (u.id || '').trim().toLowerCase();
      return role === 'admin' || id === 'excel' || id === 'usr-admin-ninja' || id === 'usr-1';
    });
    const finalAdmins = adminOnlyUsers.length > 0 ? adminOnlyUsers : DEFAULT_USERS;
    saveStoredUsers(finalAdmins);

    // If current user is non-admin, switch to primary ADM
    if (currentUser && currentUser.role !== 'Admin') {
      setCurrentUser(finalAdmins[0]);
    }

    // 3. Clear database on server, preserving only ADM users
    await clearServerDatabaseKeepAdm();

    // 4. Update sync line metrics
    setServerCounts({
      totalPoLines: 0,
      totalPoGroups: 0,
      totalInvoices: 0,
      totalDeliveryNotes: 0,
      totalPayments: 0,
      totalIssues: 0,
      totalUsers: finalAdmins.length,
    });
    setLastSyncTime(new Date());

    setIsClearAllModalOpen(false);
    showToast('success', 'All data cleared successfully. Only ADM user accounts preserved.');
  };

  // Real-time synchronization trigger with latency measurement
  const handleForceSync = async () => {
    setIsDataSyncing(true);
    try {
      const res = await fetchServerDatabaseFull();
      if (res.latencyMs) setLatencyMs(res.latencyMs);
      if (res.data) {
        applyServerDatabase(res.data, 'manual');
      }
      showToast('success', `Database synchronized in ${res.latencyMs || 0}ms.`);
    } catch (err: any) {
      showToast('error', `Sync failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsDataSyncing(false);
    }
  };

  // Gives /login its own real URL (distinct from the dashboard's "/") using
  // react-router's own recommended pattern for protected routes: render a
  // <Navigate> with the page the visitor was trying to reach in router state,
  // rather than an imperative navigate() call in an effect. Computed purely from
  // render-time values (props/state/location), so — unlike an effect-based
  // redirect — it's naturally idempotent under React StrictMode's double-render.
  if (isAuthRequired) {
    if (location.pathname !== '/login') {
      return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-between">
        <LoginPage onLoginSuccess={handleLoginSuccess} />
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 animate-in fade-in duration-200">
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium ${
                toast.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : toast.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              }`}
            >
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (location.pathname === '/login') {
    const allowed = getAllowedScreensForUser(currentUser);
    const fromPath = (location.state as { from?: string } | null)?.from;
    const intendedTab = fromPath ? PATH_TO_TAB[fromPath] : undefined;
    const targetTab = intendedTab && allowed.includes(intendedTab) ? intendedTab : allowed[0];
    return <Navigate to={targetTab ? TAB_PATHS[targetTab] : TAB_PATHS.dashboard} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-md animate-in fade-in slide-in-from-top-3">
          <div
            className={`p-4 rounded-xl shadow-lg border flex items-center justify-between gap-3 text-xs font-semibold ${
              toast.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                : toast.type === 'error'
                ? 'bg-red-900 text-red-100 border-red-700'
                : 'bg-slate-900 text-slate-100 border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              {toast.type === 'info' && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={(t) => {
          setMatchingFilter('ALL');
          setActiveTab(t);
        }}
        totalPOsCount={poGroups.length}
        totalPOLinesCount={poLines.length}
        totalInvoicesCount={invoices.length}
        totalDNsCount={deliveryNotes.length}
        totalPaymentsCount={payments.length}
        pendingIssuesCount={pendingIssuesCount}
        onOpenNewInvoice={() => {
          setSelectedPoForInvoice('');
          setActiveTab('create_invoice');
        }}
        onOpenMasterExport={() => setIsMasterExportOpen(true)}
        currentUser={currentUser}
        onOpenPinLogin={() => setIsPinLoginOpen(true)}
        onLockSession={handleLockSession}
      />

      {/* Real-time System Sync Data Line: Master Database Latency, Live Record Counts & Discrepancy Monitor */}
      <SyncDataLine
        isSyncing={isDataSyncing}
        lastSyncTime={lastSyncTime}
        latencyMs={latencyMs}
        serverCounts={serverCounts}
        clientCounts={{
          totalPoLines: (poLines || []).length,
          totalPoGroups: poGroups.length,
          totalInvoices: (invoices || []).length,
          totalDeliveryNotes: (deliveryNotes || []).length,
          totalPayments: (payments || []).length,
          totalIssues: (issues || []).length,
          totalUsers: (loadStoredUsers() || []).length,
        }}
        currentUser={currentUser}
        onForceSync={handleForceSync}
        onClearAllData={handleClearData}
        onClearPOs={handleClearAllPOs}
        canClearData={canDeleteData(currentUser)}
      />

      {/* Main Content Body */}
      <main className="flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {!canViewScreen(currentUser, activeTab) ? (
          <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your account does not currently have permission to view the <strong className="text-slate-900">{activeTab.replace('_', ' ').toUpperCase()}</strong> module.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 text-left space-y-1">
              <p><span className="font-semibold text-slate-900">User:</span> {currentUser.name}</p>
              <p><span className="font-semibold text-slate-900">Role:</span> {currentUser.role} ({currentUser.department})</p>
              <p><span className="font-semibold text-slate-900">Status:</span> {currentUser.status}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
              {isAdminUser(currentUser) && (
                <button
                  type="button"
                  onClick={() => setIsPinLoginOpen(true)}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Admin: Switch Account
                </button>
              )}
            </div>
          </div>
        ) : (
          <Routes>
            <Route
              path={TAB_PATHS.dashboard}
              element={
                <Dashboard
                  metrics={metrics}
                  poGroups={poGroups}
                  poLines={enrichedLines}
                  invoices={invoices}
                  deliveryNotes={deliveryNotes}
                  payments={payments}
                  issues={issues}
                  onNavigate={handleDashboardNavigate}
                  onSelectPOForInvoice={(poNum) => {
                    setSelectedPoForInvoice(poNum);
                    setActiveTab('create_invoice');
                  }}
                  onOpenUploadModal={() => setActiveTab('settings')}
                  onDownloadTemplate={generateSampleExcelTemplate}
                />
              }
            />

            <Route
              path={TAB_PATHS.po_master}
              element={
                <POManager
                  poLines={enrichedLines}
                  poGroups={poGroups}
                  onUploadExcel={handleUploadExcelFile}
                  onCreateInvoiceForPO={(poNum) => {
                    setSelectedPoForInvoice(poNum);
                    setActiveTab('create_invoice');
                  }}
                  onDownloadTemplate={generateSampleExcelTemplate}
                  currentUser={currentUser}
                  onAddPO={handleAddPO}
                  onEditPODetails={handleEditPODetails}
                  onAddPOLine={handleAddPOLine}
                  onUpdatePOLine={handleUpdatePOLine}
                  onDeletePOLine={handleDeletePOLine}
                  onDeletePO={handleDeletePO}
                  onDeleteBatchPOs={handleDeleteBatchPOs}
                  onClearPOs={handleClearAllPOs}
                  onClearData={handleClearAllPOs}
                />
              }
            />

            <Route
              path={TAB_PATHS.create_invoice}
              element={
                <InvoiceCreator
                  allPoLines={enrichedLines}
                  poLines={enrichedLines}
                  poGroups={poGroups}
                  invoices={invoices}
                  preselectedPoNumber={selectedPoForInvoice}
                  onSaveInvoice={handleSaveInvoice}
                  onViewInvoicesDatabase={() => setActiveTab('invoices_db')}
                  editingInvoice={editingInvoice}
                  onCancelEdit={() => setEditingInvoice(null)}
                  currentUser={currentUser}
                />
              }
            />

            <Route
              path={TAB_PATHS.invoices_db}
              element={
                <InvoiceHistory
                  invoices={invoices}
                  issues={issues}
                  onDeleteInvoice={handleDeleteInvoice}
                  onRecalculateTotals={handleRecalculateAllTotals}
                  onCreateNewInvoice={() => {
                    setSelectedPoForInvoice('');
                    setEditingInvoice(null);
                    setActiveTab('create_invoice');
                  }}
                  onPrintInvoice={(inv) => setPrintingInvoice(inv)}
                  onReloadInvoice={(inv) => {
                    setEditingInvoice(inv);
                    setActiveTab('create_invoice');
                  }}
                  onFlagIssue={(inv) => handleOpenFlagModal({ type: 'INVOICE', invoice: inv })}
                  onViewIssuesTab={() => setActiveTab('issue_tracking')}
                  onImportInvoices={handleImportInvoices}
                  onSaveInvoice={handleSaveInvoice}
                  currentUser={currentUser}
                />
              }
            />

            <Route
              path={TAB_PATHS.issue_tracking}
              element={
                <IssueResolutionHub
                  issues={issues}
                  invoices={invoices}
                  deliveryNotes={deliveryNotes}
                  payments={payments}
                  onUpdateIssue={handleUpdateIssue}
                  onResolveIssue={handleResolveIssue}
                  onResolveMultipleIssues={handleResolveMultipleIssues}
                  onDeleteIssue={handleDeleteIssue}
                  onReloadInvoice={(inv) => {
                    setEditingInvoice(inv);
                    setActiveTab('create_invoice');
                  }}
                  onOpenFlagModal={handleOpenFlagModal}
                  currentUser={currentUser}
                  onSaveInvoice={handleSaveInvoice}
                />
              }
            />

            <Route
              path={TAB_PATHS.delivery_notes}
              element={
                <DeliveryNotesManager
                  screenMode="create"
                  allPoLines={enrichedLines}
                  poLines={enrichedLines}
                  poGroups={poGroups}
                  deliveryNotes={deliveryNotes}
                  onSaveDeliveryNote={handleSaveDeliveryNote}
                  onDeleteDeliveryNote={handleDeleteDeliveryNote}
                  onViewIssuesTab={() => setActiveTab('issue_tracking')}
                  onViewDeliveryDetails={() => setActiveTab('delivery_details')}
                  onCreateNewDelivery={() => {
                    setEditingDeliveryNote(null);
                    setActiveTab('delivery_notes');
                  }}
                  onNavigateScreen={(mode) => setActiveTab(mode === 'create' ? 'delivery_notes' : 'delivery_details')}
                  editingDeliveryNote={editingDeliveryNote}
                  onCancelEdit={() => setEditingDeliveryNote(null)}
                  currentUser={currentUser}
                />
              }
            />

            <Route
              path={TAB_PATHS.delivery_details}
              element={
                <DeliveryNotesManager
                  screenMode="database"
                  allPoLines={enrichedLines}
                  poLines={enrichedLines}
                  poGroups={poGroups}
                  deliveryNotes={deliveryNotes}
                  onSaveDeliveryNote={handleSaveDeliveryNote}
                  onDeleteDeliveryNote={handleDeleteDeliveryNote}
                  onViewIssuesTab={() => setActiveTab('issue_tracking')}
                  onViewDeliveryDetails={() => setActiveTab('delivery_details')}
                  onCreateNewDelivery={() => {
                    setEditingDeliveryNote(null);
                    setActiveTab('delivery_notes');
                  }}
                  onNavigateScreen={(mode) => setActiveTab(mode === 'create' ? 'delivery_notes' : 'delivery_details')}
                  onReloadDeliveryNote={(dn) => {
                    setEditingDeliveryNote(dn);
                    setActiveTab('delivery_notes');
                  }}
                  currentUser={currentUser}
                  onImportDeliveryNotes={handleImportDeliveryNotes}
                />
              }
            />

            <Route
              path={TAB_PATHS.payments}
              element={
                <PaymentsManager
                  invoices={invoices}
                  payments={payments}
                  onSavePayment={handleSavePayment}
                  onDeletePayment={handleDeletePayment}
                  currentUser={currentUser}
                />
              }
            />

            <Route
              path={TAB_PATHS.matching_report}
              element={
                <MatchingReport
                  poLines={enrichedLines}
                  deliveryNotes={deliveryNotes}
                  invoices={invoices}
                  poGroups={poGroups}
                  initialFilter={matchingFilter}
                  onSelectPOForInvoice={(poNum) => {
                    setSelectedPoForInvoice(poNum);
                    setActiveTab('create_invoice');
                  }}
                  onNavigateToInvoice={() => setActiveTab('create_invoice')}
                />
              }
            />

            <Route
              path={TAB_PATHS.settings}
              element={
                <SettingsManager
                  poLines={poLines}
                  invoices={invoices}
                  deliveryNotes={deliveryNotes}
                  payments={payments}
                  onUploadExcelPO={handleUploadExcelFile}
                  onDownloadTemplate={generateSampleExcelTemplate}
                  onResetData={handleResetData}
                  onClearData={handleClearData}
                  onClearPOs={handleClearAllPOs}
                  onDataRestored={handleDataRestored}
                  onUserRoleSwitched={(u) => {
                    setCurrentUser(u);
                    showToast('success', `Session user switched to ${u.name} (${u.role})`);
                  }}
                />
              }
            />

            <Route
              path={TAB_PATHS.ledger}
              element={
                <POTrackingLedger
                  poGroups={poGroups}
                  poLines={enrichedLines}
                  invoices={invoices}
                  deliveryNotes={deliveryNotes}
                  onSelectPOForInvoice={(poNum) => {
                    setSelectedPoForInvoice(poNum);
                    setActiveTab('create_invoice');
                  }}
                  onCreateInvoice={(poNum) => {
                    setSelectedPoForInvoice(poNum);
                    setActiveTab('create_invoice');
                  }}
                  onViewInvoicePrint={(inv) => setPrintingInvoice(inv)}
                />
              }
            />

            <Route path="*" element={<Navigate to={TAB_PATHS.dashboard} replace />} />
          </Routes>
        )}
      </main>

      {/* PO Excel Upload Progress Modal */}
      <UploadProgressModal
        isOpen={uploadModal.open}
        fileName={uploadModal.fileName}
        stage={uploadModal.stage}
      />

      {/* Invoice Print Modal */}
      {printingInvoice && (
        <InvoicePrintModal
          invoice={printingInvoice}
          onClose={() => setPrintingInvoice(null)}
        />
      )}

      {/* Master Export All Details Modal */}
      <MasterExportModal
        isOpen={isMasterExportOpen}
        onClose={() => setIsMasterExportOpen(false)}
        poLines={poLines}
        invoices={invoices}
        deliveryNotes={deliveryNotes}
        payments={payments}
        issues={issues}
        users={loadStoredUsers()}
      />

      {/* Flag / Report Discrepancy Issue Modal */}
      <FlagIssueModal
        isOpen={isFlagModalOpen}
        onClose={() => {
          setIsFlagModalOpen(false);
          setPreselectedFlagEntity(null);
        }}
        onSaveIssue={handleSaveIssue}
        currentUser={currentUser}
        initialEntity={preselectedFlagEntity}
        invoices={invoices}
        deliveryNotes={deliveryNotes}
        payments={payments}
      />

      {/* 4-Digit PIN Authentication & User Switcher Modal */}
      <PinLoginModal
        isOpen={isPinLoginOpen}
        isLockScreen={!isAuthenticated}
        currentUser={currentUser}
        onClose={() => {
          if (isAuthenticated) {
            setIsPinLoginOpen(false);
            setPinLoginTargetUser(null);
          }
        }}
        targetUser={pinLoginTargetUser}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Reset Data Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-amber-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-800 p-5 text-white flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Reset Workspace Data</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Prepare clean workspace for live data</p>
                </div>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
                Are you sure you want to clear all records and reset the workspace for a brand new start with live data?
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeResetData}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Confirm Reset Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Data Admin Confirmation Modal */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-red-600 via-rose-700 to-red-800 p-5 text-white flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl shrink-0 mt-0.5">
                  <ShieldAlert className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold tracking-tight">Clear All Master Data</h3>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-black/30 border border-white/20 tracking-wider">
                      ADM ONLY
                    </span>
                  </div>
                  <p className="text-xs text-rose-100 mt-0.5">Permanent purge of all transactions & non-admin users</p>
                </div>
              </div>
              <button
                onClick={() => setIsClearAllModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 leading-relaxed font-semibold">
                ⚠️ This will permanently purge all transactions (POs, Invoices, Delivery Notes, Payments, Issues) from the local client and MySQL master database. Only Administrator accounts will be preserved.
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClearAllModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeClearData}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Authorize Hard Clear All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
