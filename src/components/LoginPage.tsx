import React, { useState } from 'react';
import { Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, FileCheck2 } from 'lucide-react';
import { AppUser } from '../types';
import { loginWithPassword } from '../utils/authService';

interface LoginPageProps {
  onLoginSuccess: (user: AppUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = userId.trim();
    const cleanPassword = password.trim();

    if (!cleanId) {
      setError('Please enter your email or username');
      return;
    }

    if (!cleanPassword) {
      setError('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    const result = await loginWithPassword(cleanId, cleanPassword);
    setIsSubmitting(false);

    if (result.success && result.user) {
      onLoginSuccess(result.user);
    } else {
      setError(result.message || 'Invalid email/username or password.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header Card */}
        <div className="bg-slate-900 text-white px-8 pt-8 pb-7 text-center border-b border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mx-auto mb-3.5 shadow-md">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
            Famola FBI po invoice reconcilaition
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Sign in to access your assigned screen modules
          </p>
        </div>

        {/* Login Form Body */}
        <div className="p-7 sm:p-8 space-y-5">
          {error && (
            <div
              id="login-error-alert"
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-user-id" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-user-id"
                  type="text"
                  autoFocus
                  autoComplete="username"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. name@company.com or username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isSubmitting}
                className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-[11px] text-slate-500 text-center pt-2">
            Enter your registered email or username and password.
          </p>
        </div>
      </div>
    </div>
  );
};
