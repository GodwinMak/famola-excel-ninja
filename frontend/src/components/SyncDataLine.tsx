import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Database, 
  Layers, 
  FileText, 
  Truck, 
  CreditCard, 
  AlertTriangle, 
  Shield, 
  Activity, 
  Check, 
  Zap,
  ArrowDownUp,
  Trash2
} from 'lucide-react';
import { AppUser } from '../types';

export interface SyncDataLineProps {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  latencyMs: number;
  serverCounts: {
    totalPoLines: number;
    totalPoGroups: number;
    totalInvoices: number;
    totalDeliveryNotes: number;
    totalPayments: number;
    totalIssues: number;
    totalUsers: number;
  } | null;
  clientCounts: {
    totalPoLines: number;
    totalPoGroups: number;
    totalInvoices: number;
    totalDeliveryNotes: number;
    totalPayments: number;
    totalIssues: number;
    totalUsers: number;
  };
  currentUser: AppUser | null;
  onForceSync: () => Promise<void>;
  onClearAllData?: () => void;
  onClearPOs?: () => void;
  canClearData?: boolean;
}

export const SyncDataLine: React.FC<SyncDataLineProps> = ({
  isSyncing,
  lastSyncTime,
  latencyMs,
  serverCounts,
  clientCounts,
  currentUser,
  onForceSync,
  onClearAllData,
  onClearPOs,
  canClearData,
}) => {
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [justSyncedFlash, setJustSyncedFlash] = useState<boolean>(false);

  const isAuthorizedAdmin =
    canClearData !== undefined
      ? canClearData
      : (currentUser?.role === 'Admin' || currentUser?.email === 'excelninjatz@gmail.com');

  // Update "seconds ago" every second
  useEffect(() => {
    const updateElapsed = () => {
      if (!lastSyncTime) {
        setSecondsAgo(0);
        return;
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000));
      setSecondsAgo(diffSec);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  const handleManualSync = async () => {
    if (isManualSyncing || isSyncing) return;
    setIsManualSyncing(true);
    try {
      await onForceSync();
      setJustSyncedFlash(true);
      setTimeout(() => setJustSyncedFlash(false), 2500);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Check if client data has any difference from server data
  const hasDiff = serverCounts
    ? serverCounts.totalPoLines !== clientCounts.totalPoLines ||
      serverCounts.totalInvoices !== clientCounts.totalInvoices ||
      serverCounts.totalDeliveryNotes !== clientCounts.totalDeliveryNotes ||
      serverCounts.totalPayments !== clientCounts.totalPayments ||
      serverCounts.totalIssues !== clientCounts.totalIssues
    : false;

  const getRelativeTimeString = (secs: number) => {
    if (secs <= 2) return 'Just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  };

  const activeSyncing = isSyncing || isManualSyncing;

  return (
    <div 
      id="system-sync-data-line" 
      className="bg-slate-900 border-b border-slate-800 text-slate-300 text-xs px-3 sm:px-5 py-2 shadow-inner select-none transition-colors"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
        {/* Left: Real-time Status Badge & Latency profiling */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Live Sync Status Indicator */}
          <div 
            id="sync-status-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] border tracking-wider transition-all ${
              activeSyncing
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-xs'
                : hasDiff
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-xs'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {activeSyncing ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              ) : hasDiff ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              )}
              <span 
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  activeSyncing ? 'bg-blue-400' : hasDiff ? 'bg-amber-400' : 'bg-emerald-400'
                }`} 
              />
            </span>
            <span>
              {activeSyncing 
                ? 'SYNCING DATA...' 
                : hasDiff 
                ? 'RECONCILING DIFFS' 
                : 'IN SYNC'}
            </span>
          </div>

          {/* Database Channel & Read Latency */}
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Master DB</span>
            </span>
            <span className="text-slate-600">•</span>
            <span 
              id="sync-latency-indicator"
              className="inline-flex items-center gap-1 font-mono text-emerald-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60"
              title="Measured network roundtrip read time between client and local Master DB on port 3000"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Read: {latencyMs > 0 ? `${latencyMs}ms` : '<10ms'}</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span 
              id="sync-last-time-indicator"
              className="inline-flex items-center gap-1 text-slate-400 hidden sm:inline-flex"
            >
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{getRelativeTimeString(secondsAgo)}</span>
            </span>
          </div>
        </div>

        {/* Center: Live Synchronized Records Counters */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px]">
          {/* PO Lines & Orders */}
          <div 
            id="sync-count-pos"
            className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/80 text-slate-200 transition-colors"
            title={`${clientCounts.totalPoLines} lines across ${clientCounts.totalPoGroups} purchase orders`}
          >
            <Layers className="w-3 h-3 text-blue-400" />
            <span className="font-semibold text-white">{clientCounts.totalPoLines}</span>
            <span className="text-slate-400 text-[10px]">POs ({clientCounts.totalPoGroups})</span>
          </div>

          {/* Invoices */}
          <div 
            id="sync-count-invoices"
            className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/80 text-slate-200 transition-colors"
            title={`${clientCounts.totalInvoices} invoices in database`}
          >
            <FileText className="w-3 h-3 text-emerald-400" />
            <span className="font-semibold text-white">{clientCounts.totalInvoices}</span>
            <span className="text-slate-400 text-[10px]">Invoices</span>
          </div>

          {/* Delivery Notes */}
          <div 
            id="sync-count-dns"
            className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/80 text-slate-200 transition-colors"
            title={`${clientCounts.totalDeliveryNotes} delivery notes in database`}
          >
            <Truck className="w-3 h-3 text-amber-400" />
            <span className="font-semibold text-white">{clientCounts.totalDeliveryNotes}</span>
            <span className="text-slate-400 text-[10px]">DNs</span>
          </div>

          {/* Payments */}
          <div 
            id="sync-count-payments"
            className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/80 text-slate-200 transition-colors"
            title={`${clientCounts.totalPayments} payments registered`}
          >
            <CreditCard className="w-3 h-3 text-purple-400" />
            <span className="font-semibold text-white">{clientCounts.totalPayments}</span>
            <span className="text-slate-400 text-[10px]">Pay</span>
          </div>

          {/* Issues */}
          {clientCounts.totalIssues > 0 && (
            <div 
              id="sync-count-issues"
              className="inline-flex items-center gap-1.5 bg-red-950/40 px-2 py-0.5 rounded-md border border-red-800/60 text-red-300"
              title={`${clientCounts.totalIssues} unresolved issues`}
            >
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="font-bold text-red-200">{clientCounts.totalIssues}</span>
              <span className="text-red-400 text-[10px]">Issues</span>
            </div>
          )}

          {/* Users: Only ADM */}
          <div 
            id="sync-count-users"
            className="inline-flex items-center gap-1.5 bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-700/60 text-indigo-300"
            title={`${clientCounts.totalUsers} Administrator (ADM) accounts active`}
          >
            <Shield className="w-3 h-3 text-indigo-400" />
            <span className="font-bold text-indigo-200">{clientCounts.totalUsers}</span>
            <span className="text-indigo-400 text-[10px]">ADM Only</span>
          </div>

          {/* Match Indicator */}
          <div 
            id="sync-diff-status"
            className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
              hasDiff 
                ? 'text-amber-300 bg-amber-950/40 border border-amber-800/50' 
                : 'text-emerald-400/90'
            }`}
          >
            {hasDiff ? (
              <>
                <ArrowDownUp className="w-3 h-3 animate-spin" />
                <span>Reconciling diff</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>100% In-Sync</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Actions (Sync Now & Admin Clear All Data) */}
        <div className="flex items-center gap-2">
          {justSyncedFlash && (
            <span className="text-[11px] font-semibold text-emerald-400 inline-flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Synced</span>
            </span>
          )}

          <button
            type="button"
            id="sync-now-button"
            onClick={handleManualSync}
            disabled={activeSyncing}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 text-slate-200 font-semibold rounded-lg text-[11px] inline-flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 shadow-xs"
            title="Force immediate re-read and synchronization with Master Database"
          >
            <RefreshCw className={`w-3 h-3 text-blue-400 ${activeSyncing ? 'animate-spin' : ''}`} />
            <span>{activeSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>

          {isAuthorizedAdmin && onClearPOs && (
            <button
              type="button"
              id="sync-line-clear-pos-btn"
              onClick={onClearPOs}
              className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-800/80 text-amber-300 hover:text-white font-medium rounded-lg text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Clear all Purchase Orders permanently from Master Database"
            >
              <Trash2 className="w-3 h-3 text-amber-400" />
              <span>Clear All POs</span>
            </button>
          )}

          {isAuthorizedAdmin && onClearAllData && (
            <button
              type="button"
              id="sync-line-clear-all-btn"
              onClick={onClearAllData}
              className="px-2 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-white font-medium rounded-lg text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Clear all transactional data and keep ONLY ADM user accounts"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              <span>Clear (ADM only)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
