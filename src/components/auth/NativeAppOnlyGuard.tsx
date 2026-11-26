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
  ExternalLink,
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
  onOpenAppStore?: (slug?: string | null) => void;
}

export const NativeAppOnlyGuard: React.FC<WelcomePortalGuardProps> = ({
  onUnlocked,
  onOpenAppStore,
}) => {
  const [showAdminSignIn, setShowAdminSignIn] = useState(false);
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

  // If the page just reloaded into a selected white-label organization (e.g. Apex Academy or Radix)
  const activeWebOrg = useMemo(() => {
    if (!APP_BRAND.isWebInstituteActive || !APP_BRAND.instituteId) return null;
    const regMatch = STATIC_INSTITUTES_REGISTRY.find((r) => r.id === APP_BRAND.instituteId) || null;
    const wsMatch = getWorkspaceById(APP_BRAND.instituteId);
    if (!wsMatch) return regMatch;
    return {
      ...regMatch,
      ...wsMatch,
      firebaseWebConfig: wsMatch.firebaseWebConfig || regMatch?.firebaseWebConfig || (APP_BRAND.firebaseConfig as any) || undefined,
      apkDownloadUrl: wsMatch.apkDownloadUrl || regMatch?.apkDownloadUrl,
      logoUrl: wsMatch.logoUrl || regMatch?.logoUrl,
    };
  }, []);

  useEffect(() => {
    fetchMasterWorkspacesFromCloud()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setCloudWorkspaces(list);
      })
      .catch(() => {});
  }, []);

  // Always keep Elevate Labs Official App at the top of the directory
  const allOrganizations = useMemo(() => {
    const byId = new Map<string, MasterWorkspace>();
    for (const reg of STATIC_INSTITUTES_REGISTRY) {
      byId.set(reg.id, reg);
    }
    for (const ws of cloudWorkspaces) {
      const prev = byId.get(ws.id);
      byId.set(
        ws.id,
        prev
          ? {
              ...prev,
              ...ws,
              apkDownloadUrl: ws.apkDownloadUrl || prev.apkDownloadUrl,
              logoUrl: ws.logoUrl || prev.logoUrl,
            }
          : ws
      );
    }
    const list = Array.from(byId.values());
    list.sort((a, b) => (a.id === 'ws_primary' ? -1 : b.id === 'ws_primary' ? 1 : 0));
    return list;
  }, [cloudWorkspaces]);

  const completeUnlock = (workspace: MasterWorkspace, userEmail: string) => {
    setSelectedInstituteId(workspace.id);
    setSelectedAppInstituteId(workspace.id);
    setPreferredWorkspaceId(workspace.id);
    setStatus('master_verified');
    unlockWebAccess('elevate_admin_pass');
    setFeedbackMsg(
      `Welcome back, ${workspace.name} Official Admin (${userEmail})! Unlocking web console...`
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
    } catch {
      setStatus('error');
      setFeedbackMsg('Unable to check email right now. Please try again.');
    }
  };

  const handleAdminGoogleSignIn = async (workspace: MasterWorkspace) => {
    const targetProjectId = workspace.firebaseWebConfig?.projectId || '';
    const currentProjectId = APP_BRAND.firebaseConfig?.projectId || '';

    // Switch Firebase project first if this organization uses a dedicated Firebase project
    if (targetProjectId && targetProjectId !== currentProjectId) {
      try {
        sessionStorage.setItem('elevate_auto_google_signin_v1', workspace.id);
      } catch {}
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
    if (!targetProjectId && APP_BRAND.isWebInstituteActive && workspace.id !== APP_BRAND.instituteId) {
      try {
        sessionStorage.setItem('elevate_auto_google_signin_v1', workspace.id);
      } catch {}
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
    <div className="fixed inset-0 z-[999999] min-h-screen w-full flex flex-col items-center justify-start sm:justify-center p-4 py-10 bg-white text-slate-800 select-none overflow-y-auto gap-6 antialiased">
      <div className="w-full max-w-[420px] bg-white border border-slate-200/80 rounded-3xl p-7 sm:p-9 shadow-[0_8px_30px_rgba(15,23,42,0.04)] relative overflow-hidden animate-fade-in flex flex-col items-center text-center shrink-0">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
            <img
              src={APP_BRAND.logoUrl}
              alt={APP_BRAND.name}
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <span className="text-lg font-semibold text-slate-900 tracking-tight">
            {APP_BRAND.isWhiteLabel ? (
              APP_BRAND.name
            ) : (
              <>
                Elevate <span className="text-[#0b57d0] font-medium">Labs</span>
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
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">
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
        ) : !showAdminSignIn ? (
          /* Minimal 3-Action Welcome Card */
          <div className="w-full space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">
                Welcome to Elevate Labs
              </h1>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Sign in as an Institute Admin or download the official Android App for your studies.
              </p>
            </div>

            <div className="w-full space-y-2.5">
              <button
                type="button"
                onClick={() => setShowAdminSignIn(true)}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer border-0"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Sign in as an Admin</span>
              </button>

              <a
                href="./elevate.apk"
                download="elevate.apk"
                className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 text-xs sm:text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] border-0 no-underline"
              >
                <Download className="w-4 h-4 text-[#0b57d0]" />
                <span>Download Elevate Labs Official App</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  if (onOpenAppStore) {
                    onOpenAppStore(null);
                  } else {
                    window.location.href = '/apps';
                  }
                }}
                className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 text-xs sm:text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer border-0"
              >
                <Building2 className="w-4 h-4 text-[#0b57d0]" />
                <span>Choose your own Institute&apos;s App</span>
              </button>
            </div>
          </div>
        ) : (
          /* Inline Admin Email Lookup & Google Sign-In Flow */
          <div className="w-full space-y-4">
            <div className="space-y-1.5">
              <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">
                Admin Console Sign-In
              </h1>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Enter your registered admin email to open your Institute Web Console.
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
                className="w-full py-3 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0"
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
                            ? `${workspace.name} Official Admin • Web Console Access`
                            : 'Enrolled Student • Official Android App'}
                        </p>
                      </div>
                    </div>

                    {role === 'admin' ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => handleAdminGoogleSignIn(workspace)}
                          disabled={isSigningInGoogle}
                          className="w-full py-3 px-4 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer border-0 focus:outline-none disabled:opacity-50"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>
                            {isSigningInGoogle ? 'Signing in...' : `Sign in as ${workspace.name} Official Admin`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const targetSlug = workspace.slug || workspace.id;
                            if (onOpenAppStore) {
                              onOpenAppStore(targetSlug);
                            } else {
                              window.location.href = `/apps/${encodeURIComponent(targetSlug)}`;
                            }
                          }}
                          className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] border-0 focus:outline-none cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#0b57d0]" />
                          <span>View App Page</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const targetSlug = workspace.slug || workspace.id;
                          if (onOpenAppStore) {
                            onOpenAppStore(targetSlug);
                          } else {
                            window.location.href = `/apps/${encodeURIComponent(targetSlug)}`;
                          }
                        }}
                        className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] border-0 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Android App</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Unregistered Email Notice */}
            {searched && matches.length === 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left leading-relaxed">
                No enrolled institute found for <strong>{email}</strong>. You can download the official{' '}
                <strong>Elevate Labs</strong> app below, or ask your coaching institute for their dedicated app link.
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowAdminSignIn(false);
                setFeedbackMsg('');
                setSearched(false);
              }}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5 bg-transparent border-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
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
