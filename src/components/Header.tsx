import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  ReceiptText,
  Database,
  Scale,
  PlusCircle,
  FileCheck2,
  Truck,
  GitCompare,
  CreditCard,
  Settings,
  Download,
  AlertTriangle,
  Lock,
  LogOut,
  Maximize,
  Minimize,
  ExternalLink,
  FileBarChart2,
  Building2,
  ChevronDown,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { AppUser, AppEntity, SYSTEM_ENTITIES } from '../types';
import { canViewScreen, canEditScreen, isAdminUser, canExportDatabase } from '../utils/authService';
import { isRunningInIframe, openInStandaloneWindow, toggleAppFullscreen } from '../utils/appInfoService';
import { getEntityTheme } from '../utils/entityTheme';

export type ActiveTab =
  | 'dashboard'
  | 'po_master'
  | 'create_invoice'
  | 'invoices_db'
  | 'issue_tracking'
  | 'delivery_notes'
  | 'delivery_details'
  | 'matching_report'
  | 'payments'
  | 'settings'
  | 'ledger'
  | 'reports'
  | 'database';

export interface NavItemConfig {
  id: ActiveTab;
  label: string;
  subtitle: string;
  category:
    | 'DASHBOARD'
    | 'REPORT'
    | 'PURCHASE_ORDER'
    | 'INVOICE'
    | 'DELIVERY'
    | 'PAYMENTS'
    | 'SETTING';
  icon: React.ElementType;
  badge?: number | string;
  badgeTooltip?: string;
  isAlertBadge?: boolean;
}

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  totalPOsCount: number;
  totalPOLinesCount?: number;
  totalInvoicesCount: number;
  totalDNsCount?: number;
  totalPaymentsCount?: number;
  pendingIssuesCount?: number;
  onOpenNewInvoice: () => void;
  onOpenMasterExport?: () => void;
  onOpenPinLogin?: () => void;
  onOpenDatabaseInspector?: () => void;
  currentUser?: AppUser;
  currentEntity?: AppEntity;
  availableEntities?: AppEntity[];
  onSwitchEntity?: (entityId: string) => void;
  isDbConnected?: boolean;
  isSyncingDb?: boolean;
  lastDbSync?: string;
  onManualSync?: () => void;
  onLockSession?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export function buildAuthorizedNavItems({
  currentUser,
  totalPOsCount,
  totalPOLinesCount = 0,
  totalInvoicesCount,
  totalDNsCount = 0,
  totalPaymentsCount = 0,
  pendingIssuesCount = 0,
}: {
  currentUser?: AppUser;
  totalPOsCount: number;
  totalPOLinesCount?: number;
  totalInvoicesCount: number;
  totalDNsCount?: number;
  totalPaymentsCount?: number;
  pendingIssuesCount?: number;
}): NavItemConfig[] {
  const isAdmin = isAdminUser(currentUser);

  const allNavItems: NavItemConfig[] = [
    // 1. Dashboard
    {
      id: 'dashboard',
      label: '1. Dashboard',
      subtitle: 'Executive KPIs & Analytics',
      category: 'DASHBOARD',
      icon: LayoutDashboard,
    },
    // 2. Report (include issue, matching, report ledger, report hub)
    {
      id: 'issue_tracking',
      label: 'Issues',
      subtitle: 'Discrepancy Resolution',
      category: 'REPORT',
      icon: AlertTriangle,
      badge: pendingIssuesCount,
      badgeTooltip: `${pendingIssuesCount} Pending Issues`,
      isAlertBadge: (pendingIssuesCount || 0) > 0,
    },
    {
      id: 'matching_report',
      label: 'Matching',
      subtitle: '3-Way PO / DN / Invoice',
      category: 'REPORT',
      icon: GitCompare,
    },
    {
      id: 'ledger',
      label: 'Report Ledger',
      subtitle: 'PO Fulfillment Ledger',
      category: 'REPORT',
      icon: Scale,
    },
    {
      id: 'reports',
      label: 'Report Hub',
      subtitle: 'Books, Statements & Audits',
      category: 'REPORT',
      icon: FileBarChart2,
    },
    // 3. Purchase Order
    {
      id: 'po_master',
      label: '3. Purchase Order',
      subtitle: 'Master PO Register & Lines',
      category: 'PURCHASE_ORDER',
      icon: FileSpreadsheet,
      badge:
        totalPOsCount > 0
          ? totalPOLinesCount && totalPOLinesCount > totalPOsCount
            ? `${totalPOsCount} (${totalPOLinesCount.toLocaleString()})`
            : totalPOsCount
          : undefined,
      badgeTooltip: `${totalPOsCount} Purchase Orders (${(totalPOLinesCount || totalPOsCount).toLocaleString()} total line items)`,
    },
    // 4. Invoice (single unified navigation entry linking to Create Invoice & Invoice Details tabs inside)
    ...(canViewScreen(currentUser, 'create_invoice') || canViewScreen(currentUser, 'invoices_db')
      ? [
          {
            id: (canViewScreen(currentUser, 'create_invoice') ? 'create_invoice' : 'invoices_db') as ActiveTab,
            label: '4. Invoice',
            subtitle: 'Create Invoice & Invoice Details',
            category: 'INVOICE' as const,
            icon: ReceiptText,
            badge: totalInvoicesCount,
            badgeTooltip: `${totalInvoicesCount} Invoices Issued`,
          },
        ]
      : []),
    // 5. Delivery (single unified navigation entry linking to Delivery, Delivery Details & Call of Order tabs inside)
    ...(canViewScreen(currentUser, 'delivery_notes') || canViewScreen(currentUser, 'delivery_details')
      ? [
          {
            id: (canViewScreen(currentUser, 'delivery_notes') ? 'delivery_notes' : 'delivery_details') as ActiveTab,
            label: '5. Delivery',
            subtitle: 'Delivery, Details & Call of Order',
            category: 'DELIVERY' as const,
            icon: Truck,
            badge: totalDNsCount,
            badgeTooltip: `${totalDNsCount} Delivery Notes`,
          },
        ]
      : []),
    // 6. Payments (single unified navigation entry linking to Record Payment, Ledger & Advance tabs inside)
    {
      id: 'payments',
      label: '6. Payments',
      subtitle: 'Payments, Ledger & Advance',
      category: 'PAYMENTS',
      icon: CreditCard,
      badge: totalPaymentsCount,
      badgeTooltip: `${totalPaymentsCount} Payments Recorded`,
    },
    // 7. Setting
    ...(isAdmin
      ? [
          {
            id: 'settings' as ActiveTab,
            label: '7. Setting',
            subtitle: 'Users, Series & Backups',
            category: 'SETTING' as const,
            icon: Settings,
          },
        ]
      : []),
  ];

  return allNavItems.filter((item) => canViewScreen(currentUser, item.id));
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalPOsCount,
  totalPOLinesCount = 0,
  totalInvoicesCount,
  totalDNsCount = 0,
  totalPaymentsCount = 0,
  pendingIssuesCount = 0,
  onOpenNewInvoice,
  onOpenMasterExport,
  onOpenPinLogin,
  currentUser,
  currentEntity = SYSTEM_ENTITIES[0],
  availableEntities = SYSTEM_ENTITIES,
  onSwitchEntity,
  onLockSession,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEntityDropdownOpen, setIsEntityDropdownOpen] = useState(false);
  const entityDropdownRef = React.useRef<HTMLDivElement>(null);
  const inIframe = isRunningInIframe();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(event.target as Node)) {
        setIsEntityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin = isAdminUser(currentUser);
  const theme = getEntityTheme(currentEntity);

  const navItems = buildAuthorizedNavItems({
    currentUser,
    totalPOsCount,
    totalPOLinesCount,
    totalInvoicesCount,
    totalDNsCount,
    totalPaymentsCount,
    pendingIssuesCount,
  });

  const activeNavItem = navItems.find((item) => {
    if (item.category === 'INVOICE') {
      return activeTab === 'create_invoice' || activeTab === 'invoices_db';
    }
    if (item.category === 'DELIVERY') {
      return activeTab === 'delivery_notes' || activeTab === 'delivery_details';
    }
    return item.id === activeTab;
  });

  return (
    <header className="bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/80 text-slate-100 sticky top-0 z-40 shadow-lg w-full">
      {/* Top Entity Color Horizon Stripe */}
      <div className={`h-[3px] w-full ${theme.topStripeGradient}`} />

      <div className="w-full px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-14 sm:h-15 gap-2">
          {/* Left: Sidebar Toggle + Brand Identity + Active Screen Breadcrumb */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile Drawer Toggle */}
            {onToggleMobileMenu && (
              <button
                type="button"
                onClick={onToggleMobileMenu}
                className="lg:hidden p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
                title="Toggle Navigation Menu"
              >
                {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            )}

            {/* Desktop Collapse / Expand Sidebar Toggle */}
            {onToggleSidebarCollapse && (
              <button
                type="button"
                onClick={onToggleSidebarCollapse}
                className="hidden lg:inline-flex items-center justify-center p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all cursor-pointer shadow-xs"
                title={isSidebarCollapsed ? 'Expand Left Navigation Sidebar' : 'Collapse Left Navigation Sidebar'}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-blue-400" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 text-slate-400" />
                )}
              </button>
            )}

            {/* Logo & Title */}
            <div
              className="flex items-center gap-2.5 cursor-pointer shrink-0"
              onClick={() => setActiveTab('dashboard')}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-md ${theme.logoBg} ${theme.logoShadow}`}
              >
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-sm sm:text-base text-white tracking-tight">
                    Famola FBI po invoice reconcilaition
                  </span>
                  <span
                    className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${theme.brandBadge}`}
                  >
                    {currentEntity.shortCode}
                  </span>
                </div>
                <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="truncate">{currentEntity.name}</span>
                  {activeNavItem && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                      <span className="font-semibold text-slate-200">{activeNavItem.label}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Center: Active Company / Multi-Entity Switcher */}
          <div className="relative shrink-0" ref={entityDropdownRef}>
            {availableEntities.length > 1 && onSwitchEntity ? (
              <button
                type="button"
                onClick={() => setIsEntityDropdownOpen(!isEntityDropdownOpen)}
                className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs text-white font-semibold shadow-xs transition-all cursor-pointer group ${theme.switcherBg} ${theme.switcherBorder}`}
                title="Click to switch active company"
              >
                <Building2 className={`w-3.5 h-3.5 ${theme.switcherIconColor}`} />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider leading-none">
                    Operating Entity
                  </span>
                  <span className="font-bold text-slate-100 flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${theme.switcherBadge}`}>
                      {currentEntity.shortCode}
                    </span>
                    <span className="max-w-[110px] sm:max-w-[165px] truncate">{currentEntity.name}</span>
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform" />
              </button>
            ) : (
              <div
                className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs text-white font-semibold ${theme.switcherBg} ${theme.switcherBorder}`}
                title={`Authorized Entity: ${currentEntity.name}`}
              >
                <Building2 className={`w-3.5 h-3.5 ${theme.switcherIconColor}`} />
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider leading-none">
                    Operating Entity
                  </span>
                  <span className="font-bold text-slate-100 flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${theme.switcherBadge}`}>
                      {currentEntity.shortCode}
                    </span>
                    <span className="max-w-[110px] sm:max-w-[165px] truncate">{currentEntity.name}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Entity Switcher Dropdown */}
            {isEntityDropdownOpen && availableEntities.length > 1 && onSwitchEntity && (
              <div className="absolute right-0 sm:left-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Switch Operating Company</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    {availableEntities.length} Authorized
                  </span>
                </div>
                <div className="py-1">
                  {availableEntities.map((ent) => {
                    const isSelected = ent.id === currentEntity.id;
                    return (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => {
                          onSwitchEntity(ent.id);
                          setIsEntityDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              ent.id === 'volex'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : ent.id === 'tan_general'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {ent.shortCode}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-white leading-tight">{ent.name}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Action CTAs */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onOpenMasterExport && (
              <button
                type="button"
                id="header-master-export-btn"
                onClick={onOpenMasterExport}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-700/80 rounded-xl transition-colors cursor-pointer"
                title="Master Database Export (Excel, JSON, Recovery)"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden lg:inline">Export All</span>
              </button>
            )}

            {currentUser &&
              (isAdmin ? (
                <button
                  type="button"
                  onClick={onOpenPinLogin}
                  className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-700/80 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
                  title={`Signed in as ${currentUser.name} (${currentUser.role}) • Admin: Click to switch user`}
                >
                  <div
                    className={`w-5 h-5 rounded-full text-white font-bold flex items-center justify-center text-[10px] ${
                      currentUser.status === 'On Hold' ? 'bg-amber-600' : 'bg-blue-600'
                    }`}
                  >
                    {currentUser.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-200 max-w-[85px] truncate leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      ({currentUser.role.split(' ')[0]})
                    </span>
                  </div>
                  {currentUser.status === 'On Hold' && (
                    <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-bold">
                      HOLD
                    </span>
                  )}
                </button>
              ) : (
                <div
                  className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2.5 py-1 bg-slate-900/80 border border-slate-700/70 rounded-xl text-xs text-slate-300 select-none cursor-default"
                  title={`Signed in as ${currentUser.name} (${currentUser.role})`}
                >
                  <div
                    className={`w-5 h-5 rounded-full text-white font-bold flex items-center justify-center text-[10px] ${
                      currentUser.status === 'On Hold' ? 'bg-amber-600' : 'bg-blue-600'
                    }`}
                  >
                    {currentUser.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-slate-200 max-w-[85px] truncate leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      ({currentUser.role.split(' ')[0]})
                    </span>
                  </div>
                  {currentUser.status === 'On Hold' && (
                    <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-bold">
                      HOLD
                    </span>
                  )}
                </div>
              ))}

            {currentUser && onLockSession && (
              <button
                type="button"
                onClick={onLockSession}
                className="p-1.5 sm:px-2.5 sm:py-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sign out of the application and return to login screen"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}

            {/* Standalone Full-Screen Mode Toggle */}
            <button
              type="button"
              onClick={toggleAppFullscreen}
              className="p-1.5 sm:px-2 sm:py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Full Screen' : 'Toggle Full Screen Mode'}
            >
              {isFullscreen ? (
                <Minimize className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Maximize className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="hidden xl:inline">{isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}</span>
            </button>

            {/* Open in Standalone Tab (outside of AI Studio iframe) */}
            {inIframe && (
              <button
                type="button"
                onClick={() => openInStandaloneWindow()}
                className="p-1.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border border-blue-400/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Open Independent Full-Screen App in New Browser Tab (No AI Studio frame)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open Standalone App</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// ============================================================================
// LEFT SIDEBAR GLASSMORPHIC NAVIGATION (User Request: 7 Groups)
// ============================================================================
interface SidebarNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  totalPOsCount: number;
  totalPOLinesCount?: number;
  totalInvoicesCount: number;
  totalDNsCount?: number;
  totalPaymentsCount?: number;
  pendingIssuesCount?: number;
  onOpenNewInvoice: () => void;
  onOpenMasterExport?: () => void;
  onLockSession?: () => void;
  currentUser?: AppUser;
  currentEntity?: AppEntity;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const CATEGORY_LABELS: Record<NavItemConfig['category'], string> = {
  DASHBOARD: '1. Dashboard',
  REPORT: '2. Report',
  PURCHASE_ORDER: '3. Purchase Order',
  INVOICE: '4. Invoice',
  DELIVERY: '5. Delivery',
  PAYMENTS: '6. Payments',
  SETTING: '7. Setting',
};

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  setActiveTab,
  totalPOsCount,
  totalPOLinesCount = 0,
  totalInvoicesCount,
  totalDNsCount = 0,
  totalPaymentsCount = 0,
  pendingIssuesCount = 0,
  onOpenNewInvoice,
  onLockSession,
  currentUser,
  currentEntity = SYSTEM_ENTITIES[0],
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const navItems = buildAuthorizedNavItems({
    currentUser,
    totalPOsCount,
    totalPOLinesCount,
    totalInvoicesCount,
    totalDNsCount,
    totalPaymentsCount,
    pendingIssuesCount,
  });

  // Entity-specific glass visual styles
  const entityVisuals = (() => {
    if (currentEntity.id === 'tan_general') {
      return {
        ambientGlow: 'from-emerald-600/20 via-teal-500/5 to-transparent',
        activeCard:
          'bg-gradient-to-r from-emerald-600 via-emerald-600/95 to-teal-700 border-emerald-300/80 text-white shadow-lg shadow-emerald-950/80 ring-1 ring-emerald-300/40',
        activeBar: 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)]',
        activeIconBox:
          'bg-white/20 text-white border-white/40 shadow-sm',
        activeBadge: 'bg-slate-950/40 text-emerald-100 border-emerald-200/50',
        inactiveCard:
          'bg-slate-800/95 hover:bg-slate-700/95 border-slate-600/80 hover:border-emerald-400/60 text-slate-100 hover:text-white shadow-sm shadow-black/40',
        inactiveIconBox:
          'bg-slate-900/95 group-hover:bg-emerald-600 border-slate-600/90 group-hover:border-emerald-300 text-emerald-300 group-hover:text-white',
        entityPill: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300',
      };
    }
    if (currentEntity.id === 'jgael') {
      return {
        ambientGlow: 'from-purple-600/20 via-fuchsia-500/5 to-transparent',
        activeCard:
          'bg-gradient-to-r from-purple-600 via-purple-600/95 to-indigo-700 border-purple-300/80 text-white shadow-lg shadow-purple-950/80 ring-1 ring-purple-300/40',
        activeBar: 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)]',
        activeIconBox:
          'bg-white/20 text-white border-white/40 shadow-sm',
        activeBadge: 'bg-slate-950/40 text-purple-100 border-purple-200/50',
        inactiveCard:
          'bg-slate-800/95 hover:bg-slate-700/95 border-slate-600/80 hover:border-purple-400/60 text-slate-100 hover:text-white shadow-sm shadow-black/40',
        inactiveIconBox:
          'bg-slate-900/95 group-hover:bg-purple-600 border-slate-600/90 group-hover:border-purple-300 text-purple-300 group-hover:text-white',
        entityPill: 'bg-purple-500/15 border-purple-400/30 text-purple-300',
      };
    }
    return {
      ambientGlow: 'from-blue-600/20 via-sky-500/5 to-transparent',
      activeCard:
        'bg-gradient-to-r from-blue-600 via-blue-600/95 to-indigo-700 border-sky-300/80 text-white shadow-lg shadow-blue-950/80 ring-1 ring-sky-300/40',
      activeBar: 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)]',
      activeIconBox:
        'bg-white/20 text-white border-white/40 shadow-sm',
      activeBadge: 'bg-slate-950/40 text-sky-100 border-sky-200/50',
      inactiveCard:
        'bg-slate-800/95 hover:bg-slate-700/95 border-slate-600/80 hover:border-sky-400/60 text-slate-100 hover:text-white shadow-sm shadow-black/40',
      inactiveIconBox:
        'bg-slate-900/95 group-hover:bg-blue-600 border-slate-600/90 group-hover:border-sky-300 text-sky-300 group-hover:text-white',
      entityPill: 'bg-blue-500/15 border-blue-400/30 text-blue-300',
    };
  })();

  const categories: NavItemConfig['category'][] = [
    'DASHBOARD',
    'REPORT',
    'PURCHASE_ORDER',
    'INVOICE',
    'DELIVERY',
    'PAYMENTS',
    'SETTING',
  ];

  const renderSidebarContent = (forceExpanded: boolean) => {
    const expanded = forceExpanded || !isCollapsed;

    return (
      <div className="relative h-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
        {/* Decorative Top Ambient Glass Glow */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b ${entityVisuals.ambientGlow}`}
        />

        {/* Top Glass Entity Header Card */}
        <div className="relative z-10 px-3 pt-3 pb-2.5 border-b border-slate-800">
          {expanded ? (
            <div className="p-2.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-inner flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${entityVisuals.activeIconBox}`}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                    Navigation Hub
                  </div>
                  <div className="text-xs font-extrabold text-white truncate mt-0.5">
                    {currentEntity.name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={forceExpanded ? onCloseMobile : onToggleCollapse}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600/80 transition-colors cursor-pointer shrink-0"
                title={forceExpanded ? 'Close Menu' : 'Collapse Sidebar'}
              >
                {forceExpanded ? (
                  <X className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onToggleCollapse}
                className="w-11 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 flex items-center justify-center text-slate-100 hover:text-white transition-all cursor-pointer shadow-md"
                title="Expand Left Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Glass Navigation Modules */}
        <nav className="relative z-10 flex-1 overflow-y-auto px-2.5 py-2.5 space-y-2 scrollbar-none">
          {categories.map((cat) => {
            const groupItems = navItems.filter((i) => i.category === cat);
            if (groupItems.length === 0) return null;
            const showCategoryHeader = cat === 'REPORT';

            return (
              <div
                key={cat}
                className={
                  showCategoryHeader
                    ? 'space-y-1.5 p-2 rounded-2xl bg-slate-900/90 border border-slate-800'
                    : 'space-y-1.5'
                }
              >
                {showCategoryHeader &&
                  (expanded ? (
                    <div className="px-1.5 pb-0.5 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-300">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="h-[1px] flex-1 bg-gradient-to-r from-sky-400/30 to-transparent ml-2" />
                    </div>
                  ) : (
                    <div className="h-[1px] w-8 mx-auto bg-slate-700 my-1" />
                  ))}

                <div className="space-y-1.5">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.category === 'INVOICE'
                        ? activeTab === 'create_invoice' || activeTab === 'invoices_db'
                        : item.category === 'DELIVERY'
                        ? activeTab === 'delivery_notes' || activeTab === 'delivery_details'
                        : activeTab === item.id;
                    const hasBadge =
                      item.badge !== undefined && item.badge !== 0 && item.badge !== '0';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          if (forceExpanded) onCloseMobile();
                        }}
                        title={
                          !expanded
                            ? `${item.label} — ${item.subtitle}${
                                hasBadge ? ` (${item.badge})` : ''
                              }`
                            : item.badgeTooltip || item.subtitle
                        }
                        className={`group relative w-full flex items-center ${
                          expanded ? 'justify-between px-3 py-2' : 'justify-center p-2'
                        } rounded-xl border transition-all duration-200 cursor-pointer ${
                          isActive ? entityVisuals.activeCard : entityVisuals.inactiveCard
                        }`}
                      >
                        {/* Luminous Left Indicator Bar on Active Item */}
                        {isActive && (
                          <span
                            className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full ${entityVisuals.activeBar}`}
                          />
                        )}

                        <div className={`flex items-center ${expanded ? 'gap-2.5 min-w-0' : ''}`}>
                          {/* Contrasting Icon Tile */}
                          <div
                            className={`relative w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                              isActive ? entityVisuals.activeIconBox : entityVisuals.inactiveIconBox
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {/* Compact dot badge when collapsed */}
                            {!expanded && hasBadge && (
                              <span
                                className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-mono font-black flex items-center justify-center border ${
                                  item.isAlertBadge
                                    ? 'bg-amber-500 text-slate-950 border-amber-300'
                                    : 'bg-blue-600 text-white border-blue-300'
                                }`}
                              >
                                {typeof item.badge === 'string'
                                  ? item.badge.split(' ')[0]
                                  : item.badge}
                              </span>
                            )}
                          </div>

                          {/* Label */}
                          {expanded && (
                            <div className="text-left min-w-0">
                              <div
                                className={`text-xs leading-tight truncate ${
                                  isActive
                                    ? 'font-extrabold text-white'
                                    : 'font-bold text-slate-100 group-hover:text-white'
                                }`}
                              >
                                {item.label}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Count Badge */}
                        {expanded && hasBadge && (
                          <span
                            className={`ml-1.5 shrink-0 text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-lg border transition-all ${
                              item.isAlertBadge
                                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-xs'
                                : isActive
                                ? entityVisuals.activeBadge
                                : 'bg-slate-950/90 text-sky-300 border-slate-600/90 group-hover:border-sky-400/60 group-hover:text-white'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom Glass Footer (Sign Out only — New Tax Invoice button removed as requested) */}
        {onLockSession && (
          <div className="relative z-10 p-3 border-t border-white/[0.08] bg-slate-950/60 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                onLockSession();
                if (forceExpanded) onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-rose-500/30 bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 hover:text-white text-xs font-bold transition-all cursor-pointer"
              title="Sign out and return to login screen"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              {expanded && <span>Sign Out</span>}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Left Glass Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-15 h-[calc(100vh-3.75rem)] border-r border-slate-800/80 shadow-2xl transition-all duration-300 z-30 ${
          isCollapsed ? 'w-20' : 'w-68'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile / Tablet Glass Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl border-r border-white/15 z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
