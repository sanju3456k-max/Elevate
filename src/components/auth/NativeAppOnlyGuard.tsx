import React, { useState, useEffect, useMemo } from 'react';
import {
  Mail,
  ArrowRight,
  Download,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Building2,
  ArrowLeft,
  LogIn,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { unlockWebAccess } from '../../lib/platformSecurityGuard';
import { signInWithGoogle } from '../../lib/firebase';
import {
  type MasterWorkspace,
  getCachedMasterWorkspaces,
  fetchMasterWorkspacesFromCloud,
  setSelectedAppInstituteId,
  setPreferredWorkspaceId,
  canEmailUnlockInstituteWeb,
  getWorkspaceById,
} from '../../lib/masterWorkspace';
import {
  lookupInstitutesByEmail,
  setSelectedInstituteId,
  type InstituteLookupMatch,
} from '../../lib/tenantFirebase';
import { STATIC_INSTITUTES_REGISTRY } from '../../config/institutesRegistry';
import {
  APP_BRAND,
  saveWebInstituteSession,
  clearWebInstituteSession,
} from '../../config/appBrand';

interface WelcomePortalGuardProps {
  onUnlocked?: () => void;
}

export const NativeAppOnlyGuard: React.FC<WelcomePortalGuardProps> = ({ onUnlocked }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'master_verified' | 'error'>('idle');
  const [searched, setSearched] = useState(false);
  const [matches, setMatches] = useState<InstituteLookupMatch[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [cloudWorkspaces, setCloudWorkspaces] = useState<MasterWorkspace[]>(() =>
    getCachedMasterWorkspaces()
  );

  // If the page just reloaded into a selected white-label organization (e.g. Apex Academy)
  const activeWebOrg = useMemo(() => {
    if (!APP_BRAND.isWebInstituteActive || !APP_BRAND.instituteId) return null;
    return (
      getWorkspaceById(APP_BRAND.instituteId) ||
      STATIC_INSTITUTES_REGISTRY.find((r) => r.id === APP_BRAND.instituteId) ||
      null
    );
  }, []);

  useEffect(() => {
    fetchMasterWorkspacesFromCloud()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setCloudWorkspaces(list);
      })
      .catch(() => {});
  }, []);

  const allOrganizations = useMemo(() => {
    const byId = new Map<string, MasterWorkspace>();
    for (const reg of STATIC_INSTITUTES_REGISTRY) {
      byId.set(reg.id, reg);
    }
    for (const ws of cloudWorkspaces) {
      const prev = byId.get(ws.id);
      byId.set(ws.id, prev ? { ...prev, ...ws, apkDownloadUrl: ws.apkDownloadUrl || prev.apkDownloadUrl, logoUrl: ws.logoUrl || prev.logoUrl } : ws);
    }
    return Array.from(byId.values());
  }, [cloudWorkspaces]);

  const completeUnlock = (workspace: MasterWorkspace, userEmail: string) => {
    setSelectedInstituteId(workspace.id);
    setSelectedAppInstituteId(workspace.id);
    setPreferredWorkspaceId(workspace.id);
    setStatus('master_verified');
    unlockWebAccess('elevate_admin_pass');
    setFeedbackMsg(
      `Welcome back, ${workspace.name} Admin (${userEmail})! Unlocking web console...`
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
    }, 500);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setStatus('error');
      setFeedbackMsg('Please enter a valid email address.');
      return;
    }

    setStatus('checking');
    setFeedbackMsg('');
    try {
      const results = await lookupInstitutesByEmail(cleanEmail);
      setMatches(results);
      setSearched(true);
      setStatus('idle');
      if (results.length === 0) {
        setShowDirectory(true);
      }
    } catch {
      setStatus('error');
      setFeedbackMsg('Unable to check email right now. Please try again or choose an organization below.');
      setShowDirectory(true);
    }
  };

  const handleAdminGoogleSignIn = async (workspace: MasterWorkspace) => {
    const targetProjectId = workspace.firebaseWebConfig?.projectId || '';
    const currentProjectId = APP_BRAND.firebaseConfig?.projectId || '';

    // Switch Firebase project first if this organization uses a dedicated Firebase project
    if (targetProjectId && targetProjectId !== currentProjectId) {
      saveWebInstituteSession({
        instituteId: workspace.id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
        ownerEmail: workspace.ownerEmail,
        firebaseConfig: workspace.firebaseWebConfig,
      });
      window.location.reload();
      return;
    }
    if (!targetProjectId && APP_BRAND.isWebInstituteActive) {
      clearWebInstituteSession();
      window.location.reload();
      return;
    }

    try {
      setIsSigningInGoogle(true);
      setFeedbackMsg('');
      const user = await signInWithGoogle();
      if (user && canEmailUnlockInstituteWeb(user.email, workspace.id)) {
        completeUnlock(workspace, user.email || workspace.ownerEmail);
      } else if (user) {
        try {
          localStorage.removeItem('elevate_web_access_authorized_v1');
        } catch {}
        setStatus('error');
        setFeedbackMsg(
          `Signed in as ${user.email}, which is not an authorized Admin for ${workspace.name}. Students can download the Android App below.`
        );
      }
    } catch (err: any) {
      setStatus('error');
      setFeedbackMsg(err?.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleSwitchOrganization = () => {
    clearWebInstituteSession();
    setSelectedAppInstituteId(null);
    setSelectedInstituteId(null);
    window.location.reload();
  };

  const renderOrgLogo = (org: MasterWorkspace) =>
    org.logoUrl ? (
      <img
        src={org.logoUrl}
        alt={org.name}
        className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
      />
    ) : (
      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-[#0b57d0] flex items-center justify-center shrink-0">
        <Building2 className="w-5 h-5" />
      </div>
    );

  return (
    <div className="fixed inset-0 z-[999999] min-h-screen w-full flex flex-col items-center justify-start sm:justify-center p-4 py-8 bg-white text-slate-800 select-none overflow-y-auto gap-5">
      {/* Soft light ambient background accents */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-100/50 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-indigo-100/50 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-200/60 relative overflow-hidden animate-fade-in flex flex-col items-center text-center shrink-0">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0">
            <img
              src={APP_BRAND.logoUrl}
              alt={APP_BRAND.name}
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">
            {APP_BRAND.isWhiteLabel ? (
              APP_BRAND.name
            ) : (
              <>
                Elevate <span className="text-[#0b57d0] font-bold">Labs</span>
              </>
            )}
          </span>
        </div>

        {status === 'master_verified' ? (
          <div className="w-full p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <span className="font-bold text-sm text-emerald-950">Admin Verified!</span>
            <p>{feedbackMsg}</p>
          </div>
        ) : activeWebOrg ? (
          /* Post-reload step when switching to a dedicated organization Firebase */
          <div className="w-full space-y-4">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {activeWebOrg.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Sign in with Google using your authorized Admin email to open the {activeWebOrg.name} Web Console.
            </p>

            {feedbackMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left">
                {feedbackMsg}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleAdminGoogleSignIn(activeWebOrg)}
              disabled={isSigningInGoogle}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-bold text-sm shadow-lg shadow-[#0b57d0]/20 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0"
            >
              <LogIn className="w-4 h-4" />
              <span>{isSigningInGoogle ? 'Signing in...' : `Sign in with Google`}</span>
            </button>

            {activeWebOrg.apkDownloadUrl && (
              <a
                href={activeWebOrg.apkDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 no-underline"
              >
                <Download className="w-4 h-4" />
                <span>Download {activeWebOrg.name} Android APK</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleSwitchOrganization}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5 bg-transparent border-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Email Lookup</span>
            </button>
          </div>
        ) : (
          /* Primary Email-First Entry Flow */
          <div className="w-full space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Welcome to Elevate Labs
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Enter your email to open your Organization Web Console or download your Android App.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="w-full space-y-2.5 text-left">
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0b57d0] focus:border-transparent"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={status === 'checking'}
                className="w-full py-3 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-bold text-sm shadow-lg shadow-[#0b57d0]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0"
              >
                <span>{status === 'checking' ? 'Checking...' : 'Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {feedbackMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left">
                {feedbackMsg}
              </div>
            )}

            {/* Role-wise Smart Results for Searched Email */}
            {searched && matches.length > 0 && (
              <div className="w-full space-y-2.5 text-left pt-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Your Organizations ({matches.length})
                </div>
                {matches.map(({ workspace, role }) => (
                  <div
                    key={`${workspace.id}-${role}`}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                  >
                    <div className="flex items-center gap-3">
                      {renderOrgLogo(workspace)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm truncate">
                          <span className="truncate">{workspace.name}</span>
                          {role === 'admin' ? (
                            <ShieldCheck className="w-4 h-4 text-[#0b57d0] shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {role === 'admin'
                            ? 'Organization Admin • Web Console Access'
                            : 'Enrolled Student • Official Android App'}
                        </p>
                      </div>
                    </div>

                    {role === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => handleAdminGoogleSignIn(workspace)}
                        disabled={isSigningInGoogle}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer border-0 disabled:opacity-50"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>
                          {isSigningInGoogle ? 'Signing in...' : `Sign in as Admin (${workspace.name})`}
                        </span>
                      </button>
                    ) : (
                      workspace.apkDownloadUrl && (
                        <a
                          href={workspace.apkDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 no-underline"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download {workspace.name} APK</span>
                        </a>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Unregistered Email Notice */}
            {searched && matches.length === 0 && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left">
                No registered admin or enrolled account found for <strong>{email}</strong>. Choose any organization
                below to download its Android App:
              </div>
            )}

            {/* Manual Organization Directory Toggle */}
            <button
              type="button"
              onClick={() => setShowDirectory((v) => !v)}
              className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-[#0b57d0] transition-colors flex items-center justify-center gap-1 bg-transparent border-0 cursor-pointer"
            >
              <span>{showDirectory ? 'Hide all organizations' : 'Or browse all organizations & download app'}</span>
              {showDirectory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDirectory && (
              <div className="w-full space-y-2 text-left max-h-64 overflow-y-auto pr-0.5">
                {allOrganizations.map((org) => (
                  <div
                    key={org.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderOrgLogo(org)}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{org.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">Official Android App</div>
                      </div>
                    </div>
                    {org.apkDownloadUrl && (
                      <a
                        href={org.apkDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 no-underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>APK</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-[#0b57d0]" />
          <span>Elevate Labs Platform</span>
        </div>
      </div>

      {/* Plain White Transparent Navigation Buttons for All Devices */}
      <div className="w-full max-w-md flex flex-wrap items-center justify-center gap-2 shrink-0 relative">
        <a
          href="/about"
          className="px-3.5 py-1.5 rounded-full bg-transparent hover:bg-slate-50 border border-slate-200/90 text-slate-600 hover:text-[#0b57d0] text-xs font-semibold transition-colors no-underline"
        >
          About Elevate Labs
        </a>
        <a
          href="/privacy"
          className="px-3.5 py-1.5 rounded-full bg-transparent hover:bg-slate-50 border border-slate-200/90 text-slate-600 hover:text-[#0b57d0] text-xs font-semibold transition-colors no-underline"
        >
          Privacy Policy
        </a>
        <a
          href="/terms"
          className="px-3.5 py-1.5 rounded-full bg-transparent hover:bg-slate-50 border border-slate-200/90 text-slate-600 hover:text-[#0b57d0] text-xs font-semibold transition-colors no-underline"
        >
          Terms of Service
        </a>
      </div>
    </div>
  );
};
