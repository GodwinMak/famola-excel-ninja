/**
 * Service to manage public standalone app URLs and fullscreen window state.
 * Ensures users always receive the public standalone URL (ais-pre-*) rather than
 * the private developer container preview (ais-dev-*).
 */

import { API_BASE } from './authToken';

let cachedSharedUrl: string | null = null;

export const fetchServerAppInfo = async (): Promise<{
  appUrl: string;
  sharedUrl: string;
  devUrl: string;
} | null> => {
  try {
    const res = await fetch(`${API_BASE}/api/app-info`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sharedUrl) {
        cachedSharedUrl = data.sharedUrl;
      }
      return data;
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * Returns the public standalone URL suitable for sharing with anyone worldwide.
 * Replaces private dev URLs (ais-dev-) with public shared URLs (ais-pre-).
 */
export const getPublicAppBaseUrl = (): string => {
  if (cachedSharedUrl) {
    return cachedSharedUrl;
  }

  if (typeof window !== 'undefined') {
    let origin = window.location.origin;
    // When running inside AI Studio dev container, convert to public shared preview
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  }

  return '';
};

/**
 * Checks if the application is currently running inside an iframe (such as AI Studio preview)
 */
export const isRunningInIframe = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * Checks if the browser is currently in standalone PWA or Fullscreen mode
 */
export const isStandaloneOrFullscreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-ignore
    window.navigator.standalone === true;
  const isFS = Boolean(document.fullscreenElement);
  return isPWA || isFS;
};

/**
 * Request fullscreen display on desktop/tablet/mobile
 */
export const toggleAppFullscreen = async (): Promise<boolean> => {
  if (typeof document === 'undefined') return false;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return true;
    } else {
      await document.exitFullscreen();
      return false;
    }
  } catch (err) {
    console.warn('Fullscreen request rejected or not supported:', err);
    return false;
  }
};

/**
 * Open the application as an independent standalone full-screen window in a new tab
 */
export const openInStandaloneWindow = (customPathOrQuery: string = '') => {
  const base = getPublicAppBaseUrl();
  const url = customPathOrQuery ? `${base}${customPathOrQuery}` : base;
  setTimeout(() => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Could not open standalone window:', err);
    }
  }, 0);
};
