/**
 * Natural Alphanumeric Serial Sorting Utility
 * Accurately sorts alphanumeric transaction and document numbers such as:
 * "MYRA001", "MYRA002", "MYRA003", ..., "MYRA010", "MYRA100"
 * Handles mixed alphanumeric prefixes and numeric sequences in human-readable ascending order.
 */

// Constructing an Intl.Collator is expensive — String.prototype.localeCompare(b, locale,
// options) does it fresh on every single call, which is invisible for one comparison but
// dominates the profile when sorting thousands of records (an O(n log n) sort calls this
// tens of thousands of times). Building the collator once and reusing .compare() is
// behaviorally identical (localeCompare is spec'd in terms of a Collator) but avoids
// rebuilding it every call.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function naturalCompare(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;

  // If both are pure numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  const strA = String(a).trim();
  const strB = String(b).trim();

  // If both strings are purely numeric
  const numA = Number(strA);
  const numB = Number(strB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  // Natural alphanumeric comparison with numeric collation enabled
  return collator.compare(strA, strB);
}

/**
 * Sorts an array in-place or returns a new sorted array using natural comparison on a key.
 */
export function sortByNaturalSeries<T>(
  items: T[],
  keyExtractor: (item: T) => string | number | null | undefined,
  direction: 'asc' | 'desc' = 'asc'
): T[] {
  return [...items].sort((a, b) => {
    const valA = keyExtractor(a);
    const valB = keyExtractor(b);
    const result = naturalCompare(valA, valB);
    return direction === 'asc' ? result : -result;
  });
}
