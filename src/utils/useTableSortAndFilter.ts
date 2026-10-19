import { useState, useMemo } from 'react';
import { naturalCompare } from './naturalSort';

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface UseTableSortAndFilterOptions<T extends Record<string, any>> {
  defaultSort?: SortConfig;
  customAccessors?: Record<string, (item: T) => any>;
}

export function useTableSortAndFilter<T extends Record<string, any>>(
  items: T[],
  options?: UseTableSortAndFilterOptions<T>
) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(options?.defaultSort || null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.field !== field) {
        return { field, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { field, direction: 'desc' };
      }
      return null;
    });
  };

  const handleFilterChange = (field: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[field];
      } else {
        next[field] = trimmed;
      }
      return next;
    });
  };

  const clearFilter = (field: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearAllFilters = () => {
    setColumnFilters({});
  };

  const activeFilterCount = Object.keys(columnFilters).length;

  const processedData = useMemo(() => {
    let result = [...items];

    // 1. Apply column filters
    const filterEntries = Object.entries(columnFilters);
    if (filterEntries.length > 0) {
      result = result.filter((item: any) => {
        return filterEntries.every(([field, filterVal]) => {
          const lowerFilter = String(filterVal || '').toLowerCase();
          const accessor = options?.customAccessors?.[field];
          const rawVal = accessor ? accessor(item) : item[field];
          if (rawVal === undefined || rawVal === null) return false;
          return String(rawVal).toLowerCase().includes(lowerFilter);
        });
      });
    }

    // 2. Apply sort
    if (sortConfig) {
      const { field, direction } = sortConfig;
      const accessor = options?.customAccessors?.[field];

      result.sort((a: any, b: any) => {
        const valA = accessor ? accessor(a) : a[field];
        const valB = accessor ? accessor(b) : b[field];

        if (valA === valB) return 0;
        if (valA === undefined || valA === null || valA === '') return 1;
        if (valB === undefined || valB === null || valB === '') return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return direction === 'asc' ? valA - valB : valB - valA;
        }

        // Try numeric parse if string looks numeric
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB) && String(valA).trim() !== '' && String(valB).trim() !== '') {
          return direction === 'asc' ? numA - numB : numB - numA;
        }

        const comp = naturalCompare(valA, valB);
        return direction === 'asc' ? comp : -comp;
      });
    }

    return result;
  }, [items, sortConfig, columnFilters, options?.customAccessors]);

  return {
    processedData,
    sortConfig,
    columnFilters,
    handleSort,
    handleFilterChange,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
  };
}
