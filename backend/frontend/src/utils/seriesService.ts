import { authHeaders, API_BASE } from './authToken';

export interface AllocatedSeriesNumber {
  number: string;
  raw: number;
}

/**
 * Atomically reserves and advances the next invoice/delivery-note number on the
 * server (row-locked transaction), so two concurrent saves for the same customer
 * can never be handed the same number. Returns null on any network/server failure
 * so callers can fall back to the local, non-authoritative counter.
 */
export const allocateSeriesNumber = async (
  type: 'invoice' | 'delivery',
  customerName?: string
): Promise<AllocatedSeriesNumber | null> => {
  try {
    const res = await fetch(`${API_BASE}/api/series-config/${type}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        customerName: customerName && customerName !== 'ALL' ? customerName : undefined,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json?.data?.number) {
      return { number: json.data.number, raw: json.data.raw };
    }
    return null;
  } catch {
    return null;
  }
};
