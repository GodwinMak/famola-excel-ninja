import { AppEntity } from '../types';

export interface EntityThemeConfig {
  id: string;
  name: string;
  shortCode: string;
  colorName: 'blue' | 'emerald' | 'purple';

  // Top window gradient stripe
  topStripeGradient: string;

  // Header branding
  logoBg: string;
  logoShadow: string;
  brandBadge: string;

  // Nav tabs styling
  navActiveTab: string;
  navActiveIcon: string;
  navActiveBadge: string;

  // Header Switcher
  switcherBorder: string;
  switcherBg: string;
  switcherBadge: string;
  switcherIconColor: string;

  // Action CTA button
  primaryCtaBtn: string;

  // Identity ribbon below header (High-visibility entity differentiator)
  ribbonBg: string;
  ribbonBorder: string;
  ribbonAccentBar: string;
  ribbonBadge: string;
  ribbonTag: string;

  // Text Selection
  selectionClass: string;

  // Accent Borders & Soft Cards
  cardAccentBorder: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

export const ENTITY_THEMES: Record<string, EntityThemeConfig> = {
  volex: {
    id: 'volex',
    name: 'Volex Electrical',
    shortCode: 'VOLEX',
    colorName: 'blue',
    topStripeGradient: 'bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600',
    logoBg: 'bg-blue-600 text-white',
    logoShadow: 'shadow-blue-500/25',
    brandBadge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    navActiveTab: 'border-blue-500 text-blue-300 bg-blue-950/40 shadow-inner',
    navActiveIcon: 'text-blue-400',
    navActiveBadge: 'bg-blue-600 text-white',
    switcherBorder: 'border-blue-500/40 hover:border-blue-400',
    switcherBg: 'bg-blue-950/40 hover:bg-blue-900/40',
    switcherBadge: 'bg-blue-500/25 text-blue-200 border-blue-500/40',
    switcherIconColor: 'text-blue-400',
    primaryCtaBtn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25',
    ribbonBg: 'bg-blue-50/90',
    ribbonBorder: 'border-blue-200/90',
    ribbonAccentBar: 'bg-blue-600',
    ribbonBadge: 'bg-blue-700 text-white',
    ribbonTag: 'bg-blue-100 text-blue-900 border-blue-300',
    selectionClass: 'selection:bg-blue-600 selection:text-white',
    cardAccentBorder: 'border-l-4 border-l-blue-600',
    pillBg: 'bg-blue-50',
    pillText: 'text-blue-900',
    pillBorder: 'border-blue-200',
  },
  tan_general: {
    id: 'tan_general',
    name: 'TAN GENERAL SUPPLY',
    shortCode: 'TGS',
    colorName: 'emerald',
    topStripeGradient: 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-700',
    logoBg: 'bg-emerald-600 text-white',
    logoShadow: 'shadow-emerald-500/25',
    brandBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    navActiveTab: 'border-emerald-500 text-emerald-300 bg-emerald-950/40 shadow-inner',
    navActiveIcon: 'text-emerald-400',
    navActiveBadge: 'bg-emerald-600 text-white',
    switcherBorder: 'border-emerald-500/40 hover:border-emerald-400',
    switcherBg: 'bg-emerald-950/40 hover:bg-emerald-900/40',
    switcherBadge: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
    switcherIconColor: 'text-emerald-400',
    primaryCtaBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25',
    ribbonBg: 'bg-emerald-50/90',
    ribbonBorder: 'border-emerald-200/90',
    ribbonAccentBar: 'bg-emerald-600',
    ribbonBadge: 'bg-emerald-700 text-white',
    ribbonTag: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    selectionClass: 'selection:bg-emerald-600 selection:text-white',
    cardAccentBorder: 'border-l-4 border-l-emerald-600',
    pillBg: 'bg-emerald-50',
    pillText: 'text-emerald-900',
    pillBorder: 'border-emerald-200',
  },
  jgael: {
    id: 'jgael',
    name: 'JGAEL ELECTRICAL',
    shortCode: 'JGAEL',
    colorName: 'purple',
    topStripeGradient: 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-indigo-600',
    logoBg: 'bg-purple-600 text-white',
    logoShadow: 'shadow-purple-500/25',
    brandBadge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    navActiveTab: 'border-purple-500 text-purple-300 bg-purple-950/40 shadow-inner',
    navActiveIcon: 'text-purple-400',
    navActiveBadge: 'bg-purple-600 text-white',
    switcherBorder: 'border-purple-500/40 hover:border-purple-400',
    switcherBg: 'bg-purple-950/40 hover:bg-purple-900/40',
    switcherBadge: 'bg-purple-500/25 text-purple-200 border-purple-500/40',
    switcherIconColor: 'text-purple-400',
    primaryCtaBtn: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/25',
    ribbonBg: 'bg-purple-50/90',
    ribbonBorder: 'border-purple-200/90',
    ribbonAccentBar: 'bg-purple-600',
    ribbonBadge: 'bg-purple-700 text-white',
    ribbonTag: 'bg-purple-100 text-purple-900 border-purple-300',
    selectionClass: 'selection:bg-purple-600 selection:text-white',
    cardAccentBorder: 'border-l-4 border-l-purple-600',
    pillBg: 'bg-purple-50',
    pillText: 'text-purple-900',
    pillBorder: 'border-purple-200',
  },
};

export const getEntityTheme = (entityOrId?: AppEntity | string | null): EntityThemeConfig => {
  const id = typeof entityOrId === 'string' ? entityOrId : entityOrId?.id || 'volex';
  return ENTITY_THEMES[id] || ENTITY_THEMES.volex;
};
