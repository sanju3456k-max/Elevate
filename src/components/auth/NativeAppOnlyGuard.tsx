import React, { useState, useEffect } from 'react';
import { Mail, ArrowRight, Download, CheckCircle2, ShieldCheck, Sparkles, RefreshCw, Building2, ArrowLeft } from 'lucide-react';
import { unlockWebAccess } from '../../lib/platformSecurityGuard';
import { signInWithGoogle } from '../../lib/firebase';
import {
  type MasterWorkspace,
  getSelectedAppInstituteId,
  setSelectedAppInstituteId,
  setPreferredWorkspaceId,
  getWorkspaceById,
  fetchMasterWorkspacesFromCloud,
  canEmailUnlockInstituteWeb,
} from '../../lib/masterWorkspace';
import { InstitutePickerView } from './InstitutePortalGate';

interface WelcomePortalGuardProps {
  onUnlocked?: () => void;
}

export const NativeAppOnlyGuard: React.FC<WelcomePortalGuardProps> = ({ onUnlocked }) => {
  const [selectedInstituteId, setSelectedInstituteId] = useState<string | null>(() =>
    getSelectedAppInstituteId()
  );
  const [selectedWorkspace, setSelectedWorkspace] = useState<MasterWorkspace | null>(() =>
    getWorkspaceById(getSelectedAppInstituteId())
  );
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'student' | 'master_verified' | 'error'>('idle');
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    fetchMasterWorkspacesFromCloud().then(() => {
      if (selectedInstituteId) {
        setSelectedWorkspace(getWorkspaceById(selectedInstituteId));
      }
    }).catch(() => {});
  }, [selectedInstituteId]);

  const completeUnlock = (userEmail: string) => {
    if (selectedInstituteId) {
      setSelectedAppInstituteId(selectedInstituteId);
      setPreferredWorkspaceId(selectedInstituteId);
    }
    setStatus('master_verified');
    unlockWebAccess('elevate_admin_pass');
    setFeedbackMsg(
      `Welcome back, ${selectedWorkspace?.name || 'Institute'} Admin (${userEmail})! Unlocking web console...`
    );
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
    }, 600);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setStatus('error');
      setFeedbackMsg('Please enter a valid email address.');
      return;
    }

    setStatus('checking');

    // Check if this email is an authorized Master / Team Admin for the chosen institute
    const isAuthorizedAdmin = canEmailUnlockInstituteWeb(cleanEmail, selectedInstituteId);

    if (isAuthorizedAdmin) {
      setFeedbackMsg(
        `Institute Admin recognized (${cleanEmail}). Please sign in with Google to confirm ownership.`
      );
      setIsSigningInGoogle(true);
      signInWithGoogle()
        .then((user) => {
          if (user && canEmailUnlockInstituteWeb(user.email, selectedInstituteId)) {
            completeUnlock(user.email || cleanEmail);
          } else if (user) {
            try { localStorage.removeItem('elevate_web_access_authorized_v1'); } catch {}
            setStatus('student');
            setFeedbackMsg(
              `Web access for ${selectedWorkspace?.name || 'this institute'} is restricted to its authorized Institute Admins. Students must use the Elevate Android App.`
            );
          } else {
            setStatus('idle');
          }
        })
        .catch((err: any) => {
          setStatus('error');
          setFeedbackMsg(err?.message || 'Google Sign-In required to verify institute admin credentials.');
        })
        .finally(() => {
          setIsSigningInGoogle(false);
        });
    } else {
      // Normal student or unauthorized user -> Keep Web App blocked
      setStatus('student');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningInGoogle(true);
      const user = await signInWithGoogle();
      if (user && canEmailUnlockInstituteWeb(user.email, selectedInstituteId)) {
        completeUnlock(user.email || 'Admin');
      } else if (user) {
        try { localStorage.removeItem('elevate_web_access_authorized_v1'); } catch {}
        setStatus('student');
        setFeedbackMsg(
          `Web access for ${selectedWorkspace?.name || 'this institute'} is restricted to its authorized Institute Admins. Students must use the Elevate Android App.`
        );
      }
    } catch (err: any) {
      setStatus('error');
      setFeedbackMsg(err?.message || 'Google sign in failed. Please try with email.');
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] min-h-screen w-full flex flex-col items-center justify-start sm:justify-center p-4 py-8 bg-white text-slate-800 select-none overflow-y-auto gap-5">
      {/* Soft light ambient background accents */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-100/50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-indigo-100/50 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-200/60 relative overflow-hidden animate-fade-in flex flex-col items-center text-center shrink-0">
        
        {/* Brand Logo & Pill */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0">
            <img 
              src="./assets/preplens-icon.svg?v=25" 
              alt="Elevate Labs" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            Elevate <span className="text-[#0b57d0] font-bold">Labs</span>
          </span>
        </div>

        {/* Dynamic Institute Step vs Web Portal */}
        {!selectedInstituteId ? (
          <InstitutePickerView
            subtitle="Choose your institute to verify Web Console access. Students should use the official Elevate Android App."
            onSelectInstitute={(ws) => {
              setSelectedAppInstituteId(ws.id);
              setSelectedInstituteId(ws.id);
              setSelectedWorkspace(ws);
              setStatus('idle');
              setFeedbackMsg('');
            }}
          />
        ) : (
          <>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[#0b57d0] text-xs font-bold mb-3">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[220px]">{selectedWorkspace?.name || 'Selected Institute'}</span>
            </div>

            {/* Clean Welcome Title */}
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
              {selectedWorkspace?.name || 'Welcome to Elevate'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-xs leading-relaxed mb-5">
              Web Console is exclusively for authorized Institute Admins. Students must use the Elevate Android App.
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

            <button
              type="button"
              onClick={() => {
                setSelectedAppInstituteId(null);
                setSelectedInstituteId(null);
                setSelectedWorkspace(null);
                setStatus('idle');
                setEmail('');
                setFeedbackMsg('');
              }}
              className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5 bg-transparent border-0 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              Change Institute
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

            <button
              type="button"
              onClick={() => {
                setSelectedAppInstituteId(null);
                setSelectedInstituteId(null);
                setSelectedWorkspace(null);
                setStatus('idle');
                setFeedbackMsg('');
              }}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5 bg-transparent border-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Institute</span>
            </button>
          </div>
        )}
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#0b57d0]" />
            <span>Elevate Labs Platform</span>
          </span>
          <span>&bull;</span>
          <a href="/privacy" className="font-semibold text-[#0b57d0] hover:underline">
            Privacy Policy
          </a>
          <span>&bull;</span>
          <a href="/terms" className="font-semibold text-[#0b57d0] hover:underline">
            Terms of Service
          </a>
        </div>
      </div>

      {/* Public App Overview & Compliance Footer (visible without login) */}
      <section className="w-full max-w-2xl bg-slate-50/90 border border-slate-200/90 rounded-3xl p-5 sm:p-6 text-left space-y-3 relative shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
            About Elevate Labs
          </h2>
          <span className="text-[11px] font-semibold text-[#0b57d0]">
            Mock Tests &bull; Batch Learning &bull; Analytics
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          <strong>Elevate Labs</strong> is an educational mock-test practice, OMR evaluation, batch lecture, and
          study-notes platform for students and coaching institutes. Google Sign-In (<code>email</code> &amp;{' '}
          <code>profile</code>) is used only to authenticate your account, sync your test progress across devices,
          and unlock your enrolled institute batches.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-700">
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80">
            <div className="font-bold text-slate-900 mb-0.5">Timed Mock Tests</div>
            Practice chapter-wise &amp; full-length exams with instant scoring.
          </div>
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80">
            <div className="font-bold text-slate-900 mb-0.5">Batch Lectures &amp; PDFs</div>
            Access structured institute courses, video lessons, and study material.
          </div>
          <div className="p-3 rounded-2xl bg-white border border-slate-200/80">
            <div className="font-bold text-slate-900 mb-0.5">Private &amp; Isolated</div>
            No in-app payment collection; each institute runs on isolated storage.
          </div>
        </div>
        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <a href="/privacy" className="font-semibold text-[#0b57d0] hover:underline">
              Privacy Policy
            </a>
            <a href="/terms" className="font-semibold text-[#0b57d0] hover:underline">
              Terms of Service
            </a>
          </div>
          <span>
            Support:{' '}
            <a href="mailto:sanju3456k@gmail.com" className="underline text-slate-700">
              sanju3456k@gmail.com
            </a>
          </span>
        </div>
      </section>
    </div>
  );
};
