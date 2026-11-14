import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  FileSpreadsheet,
  ReceiptText,
  Truck,
  CreditCard,
} from 'lucide-react';
import {
  loadStoredPOs,
  loadStoredInvoices,
  loadStoredDeliveryNotes,
  loadStoredPayments,
  loadActiveEntityId,
} from '../utils/storage';
import {
  CustomerNameRuleConfig,
  CUSTOMER_NAME_RULES_EVENT,
  loadCustomerNameRules,
  saveCustomerNameRules,
  setCustomerManualMapping,
  removeCustomerManualMapping,
  stripTanescoFromName,
  normalizeCustomerKey,
  resolveCustomerDisplayName,
} from '../utils/customerNameRule';

interface CustomerNameLookupPanelProps {
  moduleLabel?: string;
}

interface RawCustomerRow {
  rawKey: string;
  rawName: string;
  resolvedName: string;
  isManualRule: boolean;
  hasTanescoInRaw: boolean;
  poCount: number;
  invoiceCount: number;
  deliveryCount: number;
  paymentCount: number;
}

export const CustomerNameLookupPanel: React.FC<CustomerNameLookupPanelProps> = ({
  moduleLabel = 'All Modules (PO, Invoice, Delivery, Payment & Reports)',
}) => {
  const [config, setConfig] = useState<CustomerNameRuleConfig>(() => loadCustomerNameRules());
  const [selectedRawCustomer, setSelectedRawCustomer] = useState<string>('');
  const [customRawInput, setCustomRawInput] = useState<string>('');
  const [newReplacementName, setNewReplacementName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'TANESCO' | 'MANUAL'>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  useEffect(() => {
    const handleRuleUpdate = () => {
      setConfig(loadCustomerNameRules());
    };
    window.addEventListener(CUSTOMER_NAME_RULES_EVENT, handleRuleUpdate);
    return () => window.removeEventListener(CUSTOMER_NAME_RULES_EVENT, handleRuleUpdate);
  }, []);

  const showTempMessage = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Discover all raw database customer names from storage without altering the raw database
  const customerRows = useMemo<RawCustomerRow[]>(() => {
    const activeEntity = loadActiveEntityId();
    const rawPOs = (loadStoredPOs() || []).filter(
      (p) => (p.entityId || 'volex') === activeEntity
    );
    const rawInvoices = (loadStoredInvoices() || []).filter(
      (i) => (i.entityId || 'volex') === activeEntity
    );
    const rawDeliveries = (loadStoredDeliveryNotes() || []).filter(
      (d) => (d.entityId || 'volex') === activeEntity
    );
    const rawPayments = (loadStoredPayments() || []).filter(
      (p) => (p.entityId || 'volex') === activeEntity
    );

    const map = new Map<
      string,
      {
        rawName: string;
        poNumbers: Set<string>;
        invoiceIds: Set<string>;
        deliveryIds: Set<string>;
        paymentIds: Set<string>;
      }
    >();

    const ensureEntry = (name: string | undefined | null) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      const key = normalizeCustomerKey(trimmed);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          rawName: trimmed,
          poNumbers: new Set(),
          invoiceIds: new Set(),
          deliveryIds: new Set(),
          paymentIds: new Set(),
        };
        map.set(key, entry);
      }
      return entry;
    };

    rawPOs.forEach((po) => {
      const entry = ensureEntry(po.customerName);
      if (entry && po.poNumber) entry.poNumbers.add(po.poNumber);
    });

    rawInvoices.forEach((inv) => {
      const entry = ensureEntry(inv.customerName);
      if (entry && inv.id) entry.invoiceIds.add(inv.id);
    });

    rawDeliveries.forEach((dn) => {
      const entry = ensureEntry(dn.customerName);
      if (entry && dn.id) entry.deliveryIds.add(dn.id);
    });

    rawPayments.forEach((pay) => {
      const entry = ensureEntry(pay.customerName);
      if (entry && pay.id) entry.paymentIds.add(pay.id);
    });

    // Also include any manual mappings that don't yet appear in current records
    Object.keys(config.manualMappings || {}).forEach((manualKey) => {
      if (!map.has(manualKey)) {
        map.set(manualKey, {
          rawName: manualKey,
          poNumbers: new Set(),
          invoiceIds: new Set(),
          deliveryIds: new Set(),
          paymentIds: new Set(),
        });
      }
    });

    const rows: RawCustomerRow[] = [];
    map.forEach((entry, rawKey) => {
      const isManualRule = Boolean(
        config.manualMappings && config.manualMappings[rawKey]
      );
      const resolvedName = resolveCustomerDisplayName(entry.rawName, config);
      const hasTanescoInRaw = /\bT?ANESCO\b/i.test(entry.rawName);

      rows.push({
        rawKey,
        rawName: entry.rawName,
        resolvedName,
        isManualRule,
        hasTanescoInRaw,
        poCount: entry.poNumbers.size,
        invoiceCount: entry.invoiceIds.size,
        deliveryCount: entry.deliveryIds.size,
        paymentCount: entry.paymentIds.size,
      });
    });

    return rows.sort((a, b) => a.rawName.localeCompare(b.rawName));
  }, [config, refreshTick]);

  // Aggregate counts by resolved (normalized) name so users can see total unified records
  const unifiedCountsByResolvedName = useMemo(() => {
    const totals = new Map<
      string,
      { po: number; inv: number; dn: number; pay: number; rawVariants: string[] }
    >();
    customerRows.forEach((r) => {
      const key = normalizeCustomerKey(r.resolvedName);
      const cur = totals.get(key) || { po: 0, inv: 0, dn: 0, pay: 0, rawVariants: [] };
      cur.po += r.poCount;
      cur.inv += r.invoiceCount;
      cur.dn += r.deliveryCount;
      cur.pay += r.paymentCount;
      cur.rawVariants.push(r.rawName);
      totals.set(key, cur);
    });
    return totals;
  }, [customerRows]);

  const filteredRows = useMemo(() => {
    return customerRows.filter((row) => {
      if (filterMode === 'TANESCO' && !row.hasTanescoInRaw) return false;
      if (filterMode === 'MANUAL' && !row.isManualRule) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          row.rawName.toLowerCase().includes(q) ||
          row.resolvedName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [customerRows, filterMode, searchQuery]);

  const handleSelectRawCustomer = (rawName: string) => {
    setSelectedRawCustomer(rawName);
    setCustomRawInput('');
    if (!rawName) {
      setNewReplacementName('');
      return;
    }
    const key = normalizeCustomerKey(rawName);
    const existingManual = config.manualMappings[key];
    if (existingManual) {
      setNewReplacementName(existingManual);
    } else {
      setNewReplacementName(stripTanescoFromName(rawName).toUpperCase());
    }
  };

  const handleSaveMapping = (e: React.FormEvent) => {
    e.preventDefault();
    const sourceRaw = (customRawInput.trim() || selectedRawCustomer.trim());
    if (!sourceRaw) return;
    const targetReplacement = stripTanescoFromName(newReplacementName.trim()).toUpperCase();
    if (!targetReplacement) return;

    const updated = setCustomerManualMapping(sourceRaw, targetReplacement);
    setConfig(updated);
    showTempMessage(
      `Lookup mapping saved: "${sourceRaw}" → "${targetReplacement}" (Applied to Display, Search & Matching)`
    );
    setSelectedRawCustomer('');
    setCustomRawInput('');
    setNewReplacementName('');
  };

  const handleToggleAutoStrip = () => {
    const nextConfig: CustomerNameRuleConfig = {
      ...config,
      autoStripTanesco: !config.autoStripTanesco,
    };
    saveCustomerNameRules(nextConfig);
    setConfig(nextConfig);
    showTempMessage(
      nextConfig.autoStripTanesco
        ? 'Automatic "TANESCO" removal rule enabled across PO, Invoice, Delivery, Payment & Reports.'
        : 'Automatic "TANESCO" removal rule paused (only manual lookup overrides active).'
    );
  };

  const handleBulkSaveAllTanescoMappings = () => {
    const nextMappings = { ...config.manualMappings };
    let count = 0;
    customerRows.forEach((row) => {
      const stripped = stripTanescoFromName(row.rawName).toUpperCase();
      if (stripped && stripped !== normalizeCustomerKey(row.rawName)) {
        nextMappings[row.rawKey] = stripped;
        count++;
      }
    });
    const nextConfig: CustomerNameRuleConfig = {
      ...config,
      autoStripTanesco: true,
      manualMappings: nextMappings,
    };
    saveCustomerNameRules(nextConfig);
    setConfig(nextConfig);
    showTempMessage(
      `Locked in ${count} TANESCO customer lookup rules (e.g., TANESCO LINDI → LINDI, TANESCO DODOMA → DODOMA).`
    );
  };

  const handleRemoveManualRule = (rawName: string) => {
    const updated = removeCustomerManualMapping(rawName);
    setConfig(updated);
    showTempMessage(`Removed manual override for "${rawName}" (reverted to Auto TANESCO rule).`);
  };

  const tanescoCount = useMemo(
    () => customerRows.filter((r) => r.hasTanescoInRaw).length,
    [customerRows]
  );
  const manualRuleCount = useMemo(
    () => Object.keys(config.manualMappings || {}).length,
    [config.manualMappings]
  );

  return (
    <div className="space-y-4">
      {/* Top Rule Control & Manual Lookup Mapping Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                <Sparkles className="w-3.5 h-3.5" />
                Display & Matching Lookup Rule
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Active in {moduleLabel} • Database Records Preserved Untouched
              </span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mt-1">
              Customer Name Normalization & Lookup Matching (Remove &ldquo;TANESCO&rdquo; / Custom Alias)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Automatically displays and matches customer names without <strong>&ldquo;TANESCO&rdquo;</strong> (e.g.{' '}
              <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono">TANESCO LINDI</code> &rarr;{' '}
              <code className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold">
                LINDI
              </code>
              ,{' '}
              <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono">TANESCO DODOMA</code> &rarr;{' '}
              <code className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold">
                DODOMA
              </code>
              ,{' '}
              <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-mono">TANESCO ILALA</code> &rarr;{' '}
              <code className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold">
                ILALA
              </code>
              ) across Purchase Orders, Invoices, Deliveries, Payments, and Reports without altering the database.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleAutoStrip}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border inline-flex items-center gap-2 transition-all cursor-pointer ${
                config.autoStripTanesco
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Auto-Remove &ldquo;TANESCO&rdquo;: {config.autoStripTanesco ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={handleBulkSaveAllTanescoMappings}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Lock in explicit lookup mappings for all database customer names containing TANESCO"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Map All TANESCO Names ({tanescoCount})
            </button>

            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              title="Refresh database customer list"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Manual Lookup Mapping Builder Form */}
        <form
          onSubmit={handleSaveMapping}
          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              1. Select Database Customer Name (Old Name)
            </label>
            <select
              value={selectedRawCustomer}
              onChange={(e) => handleSelectRawCustomer(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Customer from Database ({customerRows.length} found) --</option>
              {customerRows.map((row) => (
                <option key={row.rawKey} value={row.rawName}>
                  {row.rawName} → [{row.resolvedName}] (PO:{row.poCount} | INV:{row.invoiceCount} | DN:{row.deliveryCount} | PAY:{row.paymentCount})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Or Type Database Name
            </label>
            <input
              type="text"
              value={customRawInput}
              onChange={(e) => {
                const val = e.target.value;
                setCustomRawInput(val);
                if (val.trim()) {
                  setSelectedRawCustomer('');
                  setNewReplacementName(stripTanescoFromName(val).toUpperCase());
                }
              }}
              placeholder="e.g. TANESCO ILALA"
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
              2. New Name (Matching & Display)
            </label>
            <input
              type="text"
              value={newReplacementName}
              onChange={(e) => setNewReplacementName(e.target.value)}
              placeholder="e.g. ILALA"
              className="w-full px-3 py-2 text-xs font-bold bg-white border border-emerald-400 rounded-xl text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-1">
            <button
              type="submit"
              disabled={!(selectedRawCustomer.trim() || customRawInput.trim()) || !newReplacementName.trim()}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition-colors inline-flex items-center justify-center gap-1 cursor-pointer"
              title="Save Customer Name Lookup Rule"
            >
              <Plus className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Customer Lookup & Cross-Module Matching Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Database Customers ({customerRows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('TANESCO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterMode === 'TANESCO'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Contains &ldquo;TANESCO&rdquo; ({tanescoCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('MANUAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterMode === 'MANUAL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Manual Lookup Overrides ({manualRuleCount})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search database or new matching name..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-4">Database Customer Name (Original)</th>
                <th className="py-2.5 px-2 text-center w-10"></th>
                <th className="py-2.5 px-4">New Matching &amp; Display Name</th>
                <th className="py-2.5 px-4">Rule Applied</th>
                <th className="py-2.5 px-4 text-center">Unified Matching Records (PO / INV / DN / PAY)</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No customer names match the current filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const unified = unifiedCountsByResolvedName.get(
                    normalizeCustomerKey(row.resolvedName)
                  );
                  const isTransformed =
                    normalizeCustomerKey(row.rawName) !== normalizeCustomerKey(row.resolvedName);

                  return (
                    <tr
                      key={row.rawKey}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-800">
                        {row.rawName}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <ArrowRight
                          className={`w-3.5 h-3.5 mx-auto ${
                            isTransformed ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-lg font-mono font-extrabold text-xs border ${
                            isTransformed
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {row.resolvedName}
                        </span>
                        {unified && unified.rawVariants.length > 1 && (
                          <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Unifies {unified.rawVariants.length} DB names
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {row.isManualRule ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Manual Lookup Override
                          </span>
                        ) : row.hasTanescoInRaw && config.autoStripTanesco ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Auto Rule (No TANESCO)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600">
                            Standard Name
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                            title="Purchase Orders matched under this customer name"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                            PO: {unified ? unified.po : row.poCount}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                            title="Invoices matched under this customer name"
                          >
                            <ReceiptText className="w-3 h-3 text-emerald-600" />
                            INV: {unified ? unified.inv : row.invoiceCount}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                            title="Delivery Notes matched under this customer name"
                          >
                            <Truck className="w-3 h-3 text-amber-600" />
                            DN: {unified ? unified.dn : row.deliveryCount}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                            title="Payments matched under this customer name"
                          >
                            <CreditCard className="w-3 h-3 text-purple-600" />
                            PAY: {unified ? unified.pay : row.paymentCount}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectRawCustomer(row.rawName)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Edit replacement name for this database customer"
                          >
                            <Edit3 className="w-3 h-3" />
                            Replace Name
                          </button>
                          {row.isManualRule && (
                            <button
                              type="button"
                              onClick={() => handleRemoveManualRule(row.rawName)}
                              className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                              title="Remove manual override and revert to automatic TANESCO removal rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
