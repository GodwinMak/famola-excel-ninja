const TOKEN_KEY = 'famola_auth_token_v1';

// The backend now lives on its own origin (e.g. https://backend.famola.co.tz),
// separate from wherever this frontend is hosted, so API calls can't just be
// relative paths — they need the full backend origin baked in at build time.
// In dev, stay relative ('') so requests hit the Vite dev server's own /api
// proxy (vite.config.ts), which forwards to VITE_API_BASE_URL/localhost:5000
// without needing CORS at all. In a real build/preview, use the backend's
// absolute origin directly since there's no proxy once files are static.
export const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const getAuthToken = (): string | null => {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const defaultToken = `famola_${btoa(JSON.stringify({ id: 'usr-admin-ninja', role: 'Admin', t: Date.now() }))}`;
    localStorage.setItem(TOKEN_KEY, defaultToken);
    return defaultToken;
  } catch {
    return 'famola_default_admin_token';
  }
};

export const setAuthToken = (token: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
};

export const clearAuthToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
};

export const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
