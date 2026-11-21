import React, { useState } from 'react';
import { Mail, ArrowRight, Download, CheckCircle2, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { isMasterUser } from '../../lib/masterAccount';
import { unlockWebAccess } from '../../lib/platformSecurityGuard';
import { signInWithGoogle } from '../../lib/firebase';

interface WelcomePortalGuardProps {
  onUnlocked?: () => void;
}

export const NativeAppOnlyGuard: React.FC<WelcomePortalGuardProps> = ({ onUnlocked }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'student' | 'master_verified' | 'error'>('idle');
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setStatus('error');
      setFeedbackMsg('Please enter a valid email address.');
      return;
    }

    setStatus('checking');

    // Check if this email is a recognized Master Account
    const isMaster = isMasterUser({ email: cleanEmail });

    if (isMaster) {
      setStatus('master_verified');
      unlockWebAccess('elevate_admin_pass');
      setFeedbackMsg(`Welcome back, Master Educator (${cleanEmail})! Unlocking full web access...`);
      setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('test_lock')) {
            url.searchParams.delete('test_lock');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
          }
        } catch {}
        if (onUnlocked) {
          onUnlocked();
        } else {
          window.location.reload();
        }
      }, 700);
    } else {
      // Normal student or standard user
      setStatus('student');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningInGoogle(true);
      const user = await signInWithGoogle();
      if (user && isMasterUser({ email: user.email })) {
        setStatus('master_verified');
        unlockWebAccess('elevate_admin_pass');
        if (onUnlocked) onUnlocked();
      } else if (user) {
        setStatus('student');
      }
    } catch (err: any) {
      setStatus('error');
      setFeedbackMsg(err?.message || 'Google sign in failed. Please try with email.');
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] min-h-screen w-full flex items-center justify-center p-4 bg-white text-slate-800 select-none overflow-y-auto">
      {/* Soft light ambient background accents */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-100/50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-indigo-100/50 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-200/60 relative overflow-hidden animate-fade-in flex flex-col items-center text-center">
        
        {/* Brand Logo & Pill */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0b57d0] to-indigo-600 p-2 flex items-center justify-center shadow-md shadow-[#0b57d0]/20">
            <img 
              src="./assets/preplens-icon.svg?v=21" 
              alt="Elevate" 
              className="w-full h-full object-contain brightness-200"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            Elevate <span className="text-[#0b57d0] font-bold">Learning</span>
          </span>
        </div>

        {/* Clean Welcome Title */}
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          Welcome to Elevate
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-xs leading-relaxed mb-6">
          Your centralized learning portal for mathematics mock tests, remedial tracking, and mastery assessments.
        </p>

        {/* Dynamic States */}
        {status === 'student' ? (
          // Friendly Student Download State
          <div className="w-full space-y-4 animate-fade-in text-left">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                Student Account Verified
              </div>
              <p className="text-slate-600 leading-relaxed">
                For offline mock practice, anti-cheat test environments, and live OMR grading, all student activities are hosted on the <strong className="text-slate-900">official Elevate Android App</strong>.
              </p>
            </div>

            <a
              href="./elevate.apk"
              download="elevate.apk"
              className="w-full py-3.5 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-bold text-sm shadow-lg shadow-[#0b57d0]/25 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
            >
              <Download className="w-4.5 h-4.5" />
              Download Official Android APK
            </a>

            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setEmail('');
              }}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Use a different email address
            </button>
          </div>
        ) : status === 'master_verified' ? (
          // Master Account Success State
          <div className="w-full p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex flex-col items-center gap-2 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="font-bold text-sm text-slate-900">Master Account Verified</div>
            <p className="text-center text-slate-600">{feedbackMsg}</p>
          </div>
        ) : (
          // Default Welcome Email Input Form
          <div className="w-full space-y-4">
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0b57d0] transition-all"
                  autoFocus
                />
              </div>

              {status === 'error' && (
                <p className="text-xs text-red-500 text-left font-medium px-1">{feedbackMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'checking'}
                className="w-full py-3 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-bold text-sm shadow-md shadow-[#0b57d0]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative flex items-center justify-center my-3">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                or
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningInGoogle}
              className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2.5 shadow-sm transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{isSigningInGoogle ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-[#0b57d0]" />
          <span>Elevate Learning Platform</span>
        </div>
      </div>
    </div>
  );
};
