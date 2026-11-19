export interface CustomerNameRuleConfig {
  /**
   * When true (default), automatically strips "TANESCO" / "ANESCO" prefix/word
   * and normalizes whitespace on all customer names for display, filtering,
   * searching, and cross-module matching without modifying the raw database.
   */
  autoStripTanesco: boolean;
  /**
   * Manual lookup dictionary mapping uppercase raw database customer name
   * (e.g. "TANESCO ILALA") -> replacement display & matching name (e.g. "ILALA").
   */
  manualMappings: Record<string, string>;
}

const STORAGE_KEY = 'famola_customer_name_lookup_v1';
export const CUSTOMER_NAME_RULES_EVENT = 'famola-customer-name-rules-updated';

const DEFAULT_CONFIG: CustomerNameRuleConfig = {
  autoStripTanesco: true,
  manualMappings: {},
};

/**
 * Normalizes a raw customer name key for case-insensitive lookup.
 */
export function normalizeCustomerKey(name: string | undefined | null): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Strips the word "TANESCO" (and common typo "ANESCO" at the start of a name)
 * along with surrounding hyphens/colons/extra whitespace, e.g.:
 * - "TANESCO LINDI" -> "LINDI"
 * - "ANESCO LINDI" -> "LINDI"
 * - "TANESCO - DODOMA" -> "DODOMA"
 * - "TANESCO ILALA" -> "ILALA"
 * If stripping leaves an empty string (e.g. the name was literally "TANESCO"),
 * returns the trimmed original name so a customer name is never blank.
 */
export function stripTanescoFromName(rawName: string | undefined | null): string {
  const original = String(rawName || '').trim();
  if (!original) return '';

  // Remove standalone word TANESCO or leading typo ANESCO (case-insensitive)
  let cleaned = original
    .replace(/\bTANESCO\b/gi, ' ')
    .replace(/^ANESCO\b/i, ' ')
    // Strip leading/trailing separators left behind (e.g. "- LINDI", ": DODOMA")
    .replace(/^[\s\-–—:.,/\\]+/, '')
    .replace(/[\s\-–—:.,/\\]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || original.replace(/\s+/g, ' ');
}

export function loadCustomerNameRules(): CustomerNameRuleConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      autoStripTanesco:
        typeof parsed.autoStripTanesco === 'boolean' ? parsed.autoStripTanesco : true,
      manualMappings:
        parsed.manualMappings && typeof parsed.manualMappings === 'object'
          ? parsed.manualMappings
          : {},
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveCustomerNameRules(config: CustomerNameRuleConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CUSTOMER_NAME_RULES_EVENT, { detail: config }));
  } catch (err) {
    console.warn('Failed to persist customer name lookup rules:', err);
  }
}

export function setCustomerManualMapping(
  rawDatabaseName: string,
  replacementName: string
): CustomerNameRuleConfig {
  const current = loadCustomerNameRules();
  const key = normalizeCustomerKey(rawDatabaseName);
  const cleanReplacement = stripTanescoFromName(replacementName).toUpperCase();
  if (!key) return current;

  const nextMappings = { ...current.manualMappings };
  if (cleanReplacement) {
    nextMappings[key] = cleanReplacement;
  } else {
    delete nextMappings[key];
  }

  const nextConfig: CustomerNameRuleConfig = {
    ...current,
    manualMappings: nextMappings,
  };
  saveCustomerNameRules(nextConfig);
  return nextConfig;
}

export function removeCustomerManualMapping(rawDatabaseName: string): CustomerNameRuleConfig {
  const current = loadCustomerNameRules();
  const key = normalizeCustomerKey(rawDatabaseName);
  const nextMappings = { ...current.manualMappings };
  delete nextMappings[key];
  const nextConfig: CustomerNameRuleConfig = {
    ...current,
    manualMappings: nextMappings,
  };
  saveCustomerNameRules(nextConfig);
  return nextConfig;
}

/**
 * Resolves the display, search, filter, and matching customer name for any record
 * without mutating the underlying database storage.
 */
export function resolveCustomerDisplayName(
  rawName: string | undefined | null,
  config?: CustomerNameRuleConfig
): string {
  const original = String(rawName || '').trim();
  if (!original) return '';

  const activeConfig = config || loadCustomerNameRules();
  const rawKey = normalizeCustomerKey(original);

  // 1. Check direct manual mapping on the raw database customer name
  if (activeConfig.manualMappings && activeConfig.manualMappings[rawKey]) {
    const mapped = activeConfig.manualMappings[rawKey].trim();
    return activeConfig.autoStripTanesco ? stripTanescoFromName(mapped) : mapped;
  }

  // 2. Apply automatic TANESCO removal rule if enabled
  const stripped = activeConfig.autoStripTanesco
    ? stripTanescoFromName(original)
    : original.replace(/\s+/g, ' ');

  // 3. Also check if there is a manual mapping keyed by the stripped name
  const strippedKey = normalizeCustomerKey(stripped);
  if (activeConfig.manualMappings && activeConfig.manualMappings[strippedKey]) {
    const mapped = activeConfig.manualMappings[strippedKey].trim();
    return activeConfig.autoStripTanesco ? stripTanescoFromName(mapped) : mapped;
  }

  return stripped;
}
