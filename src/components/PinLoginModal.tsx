import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  KeyRound, 
  ShieldAlert, 
  UserCheck, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Shield, 
  Users, 
  ArrowRight,
  Info
} from 'lucide-react';
import { AppUser } from '../types';
import { loadStoredUsers } from '../utils/storage';
import { loginWithPin, isAdminUser } from '../utils/authService';

interface PinLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AppUser | null;
  targetUser?: AppUser | null;
  onLoginSuccess: (user: AppUser) => void;
  isLockScreen?: boolean;
}

export const PinLoginModal: React.FC<PinLoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  onLoginSuccess,
  isLockScreen = false,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveUser = currentUser || targetUser;
  const canSwitchUser = Boolean(effectiveUser && isAdminUser(effectiveUser));

  useEffect(() => {
    if (isOpen) {
      const storedUsers = loadStoredUsers();
      setUsers(storedUsers);
      if (effectiveUser && !canSwitchUser) {
        setSelectedUserId(effectiveUser.id);
      } else if (targetUser) {
        setSelectedUserId(targetUser.id);
      } else if (currentUser) {
        setSelectedUserId(currentUser.id);
      } else if (storedUsers.length > 0) {
        setSelectedUserId(storedUsers[0].id);
      }
      setPin('');
      setError(null);
    }
  }, [isOpen, targetUser, currentUser, canSwitchUser, effectiveUser]);

  const currentUserObj = users.find((u) => u.id === selectedUserId) || effectiveUser;
  const isOnHold = currentUserObj?.status === 'On Hold';
  const isInactive = currentUserObj?.status === 'Inactive';

  const handleDigitClick = (digit: string) => {
    if (isOnHold || isInactive) return;
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        submitPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError(null);
    }
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const submitPin = async (pinToSubmit: string) => {
    setIsSubmitting(true);
    setError(null);

    // 1. First try validating against the selected account
    let result = currentUserObj
      ? await loginWithPin(pinToSubmit, currentUserObj.id)
      : { success: false, message: 'Select an account' };

    // 2. Only allow a universal match across accounts if authorized to switch accounts (Admin)
    if (!result.success && canSwitchUser) {
      const universalMatch = await loginWithPin(pinToSubmit);
      if (universalMatch.success) {
        result = universalMatch;
        if (universalMatch.user) {
          setSelectedUserId(universalMatch.user.id);
        }
      }
    }

    setIsSubmitting(false);

    if (result.success && result.user) {
      onLoginSuccess(result.user);
      onClose();
    } else {
      setError(result.message || 'Incorrect 4-digit PIN password.');
      setPin('');
    }
  };

  // Keyboard navigation support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        e.preventDefault();
        handleDigitClick(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' && !isLockScreen) {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 4) {
          submitPin(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isLockScreen, currentUserObj, isOnHold, isInactive]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError('Please enter a complete 4-digit PIN password.');
      return;
    }
    submitPin(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Famola FBI po invoice reconcilaition</h2>
              <p className="text-xs text-slate-400">Enter User PIN / Password</p>
            </div>
          </div>
          {!isLockScreen ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <Shield className="w-3.5 h-3.5" />
              <span>PIN Required</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* User selector / info card */}
          {canSwitchUser ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Select User Account
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Or type 4-digit PIN directly</span>
              </div>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setPin('');
                  setError(null);
                }}
                className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role} ({u.department}) {u.status === 'On Hold' ? '[ON HOLD]' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {currentUserObj && (
            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              isOnHold 
                ? 'bg-amber-50 border-amber-300 text-amber-900' 
                : 'bg-blue-50/70 border-blue-200 text-blue-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                  isOnHold ? 'bg-amber-200 text-amber-800' : 'bg-blue-600 text-white'
                }`}>
                  {currentUserObj.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>{currentUserObj.name}</span>
                    {currentUserObj.role === 'Admin' && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-semibold border border-purple-200">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {currentUserObj.role} &bull; {currentUserObj.department}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isOnHold
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : currentUserObj.status === 'Active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}>
                  {currentUserObj.status}
                </span>
              </div>
            </div>
          )}

          {/* Account ON HOLD Alert */}
          {isOnHold && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-red-800">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Account On Hold</span>
              </div>
              <p className="text-red-700 text-[11px] leading-relaxed">
                This user account has been placed on <strong>HOLD</strong> by the Administrator. Access to screens and database records is temporarily suspended.
              </p>
              <div className="pt-1 text-[11px] text-slate-600">
                Please contact the Administrator to remove the hold on this account.
              </div>
            </div>
          )}

          {/* PIN Input & Pad */}
          {!isOnHold && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-center text-xs font-bold text-slate-700 mb-2">
                  Enter 4-Digit PIN
                </label>
                
                {/* 4 PIN Dots/Boxes */}
                <div className="flex justify-center gap-3 my-2">
                  {[0, 1, 2, 3].map((index) => {
                    const hasChar = pin.length > index;
                    return (
                      <div
                        key={index}
                        className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-mono font-bold transition-all shadow-xs ${
                          hasChar
                            ? 'border-blue-600 bg-blue-50 text-blue-900 scale-105'
                            : 'border-slate-300 bg-slate-50 text-slate-400'
                        }`}
                      >
                        {hasChar ? '&bull;' : ''}
                      </div>
                    );
                  })}
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 mt-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Number Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-1 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleDigitClick(digit)}
                    disabled={isSubmitting}
                    className="h-12 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 active:bg-blue-100 border border-slate-200 rounded-xl text-base font-bold text-slate-800 transition-all cursor-pointer shadow-xs"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-12 bg-slate-50 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleDigitClick('0')}
                  disabled={isSubmitting}
                  className="h-12 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 active:bg-blue-100 border border-slate-200 rounded-xl text-base font-bold text-slate-800 transition-all cursor-pointer shadow-xs"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-12 bg-slate-50 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Del
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={pin.length !== 4 || isSubmitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isSubmitting ? (
                  <span>Verifying PIN...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Authenticate & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Helper for Admin/Demo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-700">Administrator Notice:</span> 4-digit PINs are generated and shared by the Admin in Settings.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
