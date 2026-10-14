import {
  POLineItem,
  InvoiceRecord,
  DeliveryNoteRecord,
  PaymentRecord,
  DocumentIssueRecord,
  AppUser,
  CustomerSeriesBook,
  SeriesSettings,
} from '../types';
import { authHeaders, API_BASE } from './authToken';

export interface DatabasePayload {
  poLines?: POLineItem[];
  invoices?: InvoiceRecord[];
  deliveryNotes?: DeliveryNoteRecord[];
  payments?: PaymentRecord[];
  issues?: DocumentIssueRecord[];
  replace?: boolean;
}

export interface ServerDatabaseResponse {
  success: boolean;
  data: {
    poLines: POLineItem[];
    invoices: InvoiceRecord[];
    deliveryNotes: DeliveryNoteRecord[];
    payments: PaymentRecord[];
    issues: DocumentIssueRecord[];
    users: AppUser[];
    seriesConfig?: SeriesSettings | null;
    customerBooks?: CustomerSeriesBook[];
    updatedAt?: string;
  };
  counts: {
    totalPoLines: number;
    totalPoGroups: number;
    totalInvoices: number;
    totalDeliveryNotes: number;
    totalPayments: number;
    totalIssues: number;
    totalUsers: number;
  };
  updatedAt?: string;
}

export interface ServerDatabaseFetchResult {
  data: ServerDatabaseResponse['data'] | null;
  counts?: ServerDatabaseResponse['counts'];
  latencyMs: number;
  updatedAt?: string;
  error?: string;
}

export interface ServerDatabaseStatusResult {
  success: boolean;
  updatedAt?: string;
  counts?: ServerDatabaseResponse['counts'];
  latencyMs: number;
  changed: boolean;
}

/**
 * Ultra-lightweight status check to poll for server updates without downloading
 * the full database every few seconds.
 */
export const fetchServerDatabaseStatus = async (sinceUpdatedAt?: string): Promise<ServerDatabaseStatusResult | null> => {
  const startTime = performance.now();
  try {
    const url = sinceUpdatedAt
      ? `${API_BASE}/api/database/status?since=${encodeURIComponent(sinceUpdatedAt)}`
      : `${API_BASE}/api/database/status`;
    const res = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...authHeaders(),
      },
    });
    const latencyMs = Math.round(performance.now() - startTime);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success) {
      return {
        success: true,
        updatedAt: json.updatedAt,
        counts: json.counts,
        latencyMs,
        changed: json.changed !== false,
      };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Fetches the master database directly with latency profiling and full metadata.
 */
export const fetchServerDatabaseFull = async (): Promise<ServerDatabaseFetchResult> => {
  const startTime = performance.now();
  try {
    const res = await fetch(`${API_BASE}/api/database`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...authHeaders(),
      },
    });
    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      return {
        data: null,
        latencyMs,
        error: `Server responded with HTTP ${res.status}`,
      };
    }
    const json: ServerDatabaseResponse = await res.json();
    if (json && json.success && json.data) {
      return {
        data: json.data,
        counts: json.counts,
        latencyMs,
        updatedAt: json.updatedAt,
      };
    }
    return { data: null, latencyMs, error: 'Malformed response structure' };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return { data: null, latencyMs, error: err?.message || 'Network error' };
  }
};

/**
 * Fetches the master database directly from the persistent server endpoint.
 * This guarantees all users across any browser/device see identical, real-time records.
 */
export const fetchServerDatabase = async (): Promise<ServerDatabaseResponse['data'] | null> => {
  const result = await fetchServerDatabaseFull();
  return result.data;
};

/**
 * Administrative wipe of all records while preserving ONLY Admin user accounts.
 */
export const clearServerDatabaseKeepAdm = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const res = await fetch(`${API_BASE}/api/database/clear-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status}` };
    }
    const json = await res.json();
    return { success: Boolean(json.success), message: json.message };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to clear server database' };
  }
};

/**
 * Administrative wipe of all Purchase Orders on the server.
 */
export const clearServerPOs = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const res = await fetch(`${API_BASE}/api/database/clear-pos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status}` };
    }
    const json = await res.json();
    return { success: Boolean(json.success), message: json.message };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to clear POs on server' };
  }
};

/**
 * Persists updated entity arrays to the MySQL-backed master database in one shot.
 * `replace: true` means each provided array becomes the ENTIRE table for that
 * entity (anything absent gets deleted) — used for deletes/imports/restores.
 * `replace` false/omitted just upserts the given items — used for ordinary saves.
 * Built with timeout protection, a single retry, and non-crashing graceful fallbacks.
 */
export const persistServerDatabase = async (payload: DatabasePayload): Promise<boolean> => {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  const serializedBody = JSON.stringify(payload);

  const attemptFetch = async (timeoutMs: number): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}/api/database/bulk-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: serializedBody,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        // Surface the server's actual error body (errorHandler.ts sends
        // {success:false, error: <message>}) instead of just the status code —
        // otherwise a 500 here gives no clue which write inside bulk-sync failed.
        let detail = '';
        try {
          const errJson = await res.json();
          detail = errJson?.error || errJson?.message || '';
        } catch {
          // response wasn't JSON — ignore, we still log the status below
        }
        console.warn(`Server database persist returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
        return false;
      }
      const json = await res.json();
      return Boolean(json?.success);
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        console.warn('Server database persist timed out after 10s');
      } else {
        console.warn('Unable to persist database to server endpoint (will retry):', err?.message || err);
      }
      return false;
    }
  };

  // Bulk-sync payloads can carry thousands of rows (Excel PO uploads) plus every
  // reconciled invoice/delivery/issue touched by them, so this needs a much longer
  // budget than an ordinary status check — a too-short timeout here silently drops
  // the whole write (see persistServerDatabase callers, which must check this
  // return value rather than assume success).
  const firstSuccess = await attemptFetch(25000);
  if (firstSuccess) return true;

  await new Promise((r) => setTimeout(r, 1200));
  return await attemptFetch(35000);
};
