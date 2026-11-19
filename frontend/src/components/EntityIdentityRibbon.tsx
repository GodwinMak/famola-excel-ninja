import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, ShieldCheck, MapPin } from 'lucide-react';
import { AppEntity } from '../types';
import { getEntityTheme } from '../utils/entityTheme';

interface EntityIdentityRibbonProps {
  currentEntity: AppEntity;
  availableEntities?: AppEntity[];
  onSwitchEntity?: (entityId: string) => void;
}

export const EntityIdentityRibbon: React.FC<EntityIdentityRibbonProps> = ({
  currentEntity,
  availableEntities = [],
  onSwitchEntity,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const theme = getEntityTheme(currentEntity);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasMultiple = availableEntities.length > 1 && Boolean(onSwitchEntity);

  return (
    <div
      className={`w-full border-b shadow-xs transition-colors duration-300 relative ${theme.ribbonBg} ${theme.ribbonBorder}`}
    >
      {/* 3px luminous entity color indicator on top border */}
      <div className={`h-[3px] w-full ${theme.topStripeGradient}`} />

      <div className="w-full mx-auto px-3 sm:px-6 lg:px-8 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Entity Badge & Details */}
          <div className="flex items-center gap-3">
            {/* Color Accent Bar */}
            <div className={`w-1.5 h-7 rounded-full shrink-0 ${theme.ribbonAccentBar}`} />

            {/* Short code badge */}
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-black tracking-wider uppercase shadow-xs shrink-0 ${theme.ribbonBadge}`}
            >
              {currentEntity.shortCode}
            </span>

            {/* Entity Name */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2.5">
              <span className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                {currentEntity.name}
              </span>
            </div>
          </div>

          {/* Right: Quick Entity Switcher / Authorization Indicator */}
          <div className="flex items-center gap-2" ref={dropdownRef}>
            {hasMultiple ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsOpen(!isOpen)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-xs ${
                    isOpen
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white/90 hover:bg-white text-slate-800 border-slate-300 hover:border-slate-400'
                  }`}
                  title="Switch to another company database"
                >
                  <Building2 className={`w-3.5 h-3.5 ${
                    currentEntity.id === 'volex'
                      ? 'text-blue-600'
                      : currentEntity.id === 'tan_general'
                      ? 'text-emerald-600'
                      : 'text-purple-600'
                  }`} />
                  <span>Switch Company</span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180 text-white' : ''}`} />
                </button>

                {isOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>Available Companies</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold">
                        {availableEntities.length}
                      </span>
                    </div>
                    <div className="py-1">
                      {availableEntities.map((ent) => {
                        const isSelected = ent.id === currentEntity.id;
                        const entTheme = getEntityTheme(ent);
                        return (
                          <button
                            key={ent.id}
                            type="button"
                            onClick={() => {
                              onSwitchEntity!(ent.id);
                              setIsOpen(false);
                            }}
                            className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                              isSelected
                                ? `${entTheme.pillBg} text-slate-900 font-bold border-l-4 ${entTheme.ribbonAccentBar}`
                                : 'hover:bg-slate-50 text-slate-700 font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${entTheme.ribbonBadge}`}>
                                {ent.shortCode}
                              </span>
                              <div>
                                <div className="text-xs text-slate-900 font-bold">{ent.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {ent.tinNumber ? `TIN: ${ent.tinNumber}` : 'Independent Entity'}
                                </div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-white/80 border border-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px]">Authorized: <strong className="text-slate-900">{currentEntity.name}</strong></span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
