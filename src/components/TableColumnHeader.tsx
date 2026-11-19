import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Check } from 'lucide-react';
import { SortConfig } from '../utils/useTableSortAndFilter';

export interface TableColumnHeaderProps {
  label: string;
  field?: string;
  sortConfig?: SortConfig | null;
  onSort?: (field: string) => void;
  filterValue?: string;
  onFilterChange?: (field: string, value: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
  distinctValues?: string[];
  placeholder?: string;
  disableSort?: boolean;
  disableFilter?: boolean;
}

export const TableColumnHeader: React.FC<TableColumnHeaderProps> = ({
  label,
  field,
  sortConfig,
  onSort,
  filterValue = '',
  onFilterChange,
  align = 'left',
  className = '',
  distinctValues,
  placeholder,
  disableSort = false,
  disableFilter = false,
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [localInput, setLocalInput] = useState(filterValue);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalInput(filterValue);
  }, [filterValue]);

  // Close popover on click outside
  useEffect(() => {
    if (!isFilterOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFilterOpen]);

  const isSorted = field && sortConfig?.field === field;
  const sortDirection = isSorted ? sortConfig.direction : null;
  const hasActiveFilter = Boolean(filterValue && filterValue.trim() !== '');

  const handleSortClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disableSort && field && onSort) {
      onSort(field);
    }
  };

  const handleApplyFilter = () => {
    if (field && onFilterChange) {
      onFilterChange(field, localInput);
    }
    setIsFilterOpen(false);
  };

  const handleClearFilter = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLocalInput('');
    if (field && onFilterChange) {
      onFilterChange(field, '');
    }
    setIsFilterOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleApplyFilter();
    } else if (e.key === 'Escape') {
      setIsFilterOpen(false);
    }
  };

  const alignClass =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <div className={`relative inline-flex items-center gap-1.5 select-none ${alignClass} ${className}`}>
      {/* Clickable Header Label for Sorting */}
      <span
        onClick={!disableSort && field && onSort ? handleSortClick : undefined}
        className={`inline-flex items-center gap-1 ${
          !disableSort && field && onSort ? 'cursor-pointer hover:text-white transition-colors group' : ''
        }`}
        title={!disableSort && field ? `Click to sort by ${label}` : undefined}
      >
        <span>{label}</span>

        {/* Sort Indicator */}
        {!disableSort && field && onSort && (
          <span className="inline-flex items-center text-slate-400 group-hover:text-white">
            {sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-blue-400 stroke-[2.5]" />
            ) : sortDirection === 'desc' ? (
              <ArrowDown className="w-3.5 h-3.5 text-blue-400 stroke-[2.5]" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
            )}
          </span>
        )}
      </span>

      {/* Filter Button */}
      {!disableFilter && field && onFilterChange && (
        <div className="relative inline-flex items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFilterOpen((prev) => !prev);
            }}
            className={`p-1 rounded transition-all cursor-pointer ${
              hasActiveFilter
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
            title={hasActiveFilter ? `Filtered by "${filterValue}". Click to edit.` : `Filter by ${label}`}
          >
            <Filter className="w-3 h-3" />
          </button>

          {/* Filter Popover */}
          {isFilterOpen && (
            <div
              ref={popoverRef}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-full mt-1.5 left-0 z-50 w-64 p-3 bg-white rounded-lg shadow-xl border border-slate-200 text-slate-800 text-xs normal-case tracking-normal font-normal cursor-default"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  Filter {label}
                </span>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={handleClearFilter}
                    className="text-[11px] text-red-600 hover:text-red-700 font-medium hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Text Search Input */}
              <div className="relative mb-2">
                <input
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder || `Search ${label}...`}
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
                {localInput && (
                  <button
                    type="button"
                    onClick={() => setLocalInput('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Distinct Values Quick Select */}
              {distinctValues && distinctValues.length > 0 && (
                <div className="mb-2 max-h-32 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded">
                  {distinctValues.slice(0, 15).map((val) => {
                    const isSelected = localInput.toLowerCase() === val.toLowerCase();
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setLocalInput(val);
                          if (field && onFilterChange) {
                            onFilterChange(field, val);
                          }
                          setIsFilterOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1 text-[11px] flex items-center justify-between hover:bg-slate-100 cursor-pointer ${
                          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        <span className="truncate">{val}</span>
                        {isSelected && <Check className="w-3 h-3 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyFilter}
                  className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer shadow-2xs"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
