import React, { useState, useMemo } from 'react';
import { Download, LogIn, Search, Building2, CheckCircle2, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import {
  lookupInstitutesByEmail,
  setSelectedInstituteId,
  type InstituteLookupMatch,
} from '../lib/tenantFirebase';
import {
  setSelectedAppInstituteId,
  setAppInstituteGuestMode,
  getCachedMasterWorkspaces,
  type MasterWorkspace,
} from '../lib/masterWorkspace';
import { STATIC_INSTITUTES_REGISTRY } from '../config/institutesRegistry';
import { APP_BRAND, saveWebInstituteSession, clearWebInstituteSession } from '../config/appBrand';

interface InstitutePortalLookupProps {
  onOpenWorkspace: (workspace: MasterWorkspace) => void;
  onOpenAppStore?: (slug?: string | null) => void;
}

/**
 * Welcome-page email lookup component:
 * - Admins see "Login as {Institute} Official Admin" -> opens their isolated web workspace & Master Console.
 * - Students see their enrolled institute(s) and "Download Android App".
 */
export const InstitutePortalLookup: React.FC<InstitutePortalLookupProps> = ({
  onOpenWorkspace,
  onOpenAppStore,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [matches, setMatches] = useState<InstituteLookupMatch[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allOrganizations = useMemo(() => {
    const byId = new Map<string, MasterWorkspace>();
    for (const reg of STATIC_INSTITUTES_REGISTRY) {
      byId.set(reg.id, reg);
    }
    for (const ws of getCachedMasterWorkspaces()) {
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
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const results = await lookupInstitutesByEmail(trimmed);
      setMatches(results);
      setSearched(true);
    } catch {
      setError('Unable to look up institutes right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full text-left space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Welcome to Elevate Labs
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400">
          Enter your email to login as an institute admin or download your assigned Android App.
        </p>
      </div>

      <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-[#0b57d0] hover:bg-[#0947a8] disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer border-0"
        >
          {loading ? 'Checking...' : 'Continue'}
        </button>
      </form>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {searched && matches.length === 0 && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
          No enrolled institute found for <strong>{email}</strong>. You can download the official{' '}
          <strong>Elevate Labs</strong> app below, or ask your coaching institute for their dedicated app link.
        </div>
      )}

      {matches.length > 0 && (
        <div className="space-y-2.5">
          {matches.some((m) => m.role === 'student') && matches.length > 1 && (
            <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
              You are enrolled in {matches.length} institutes. Choose which APK to download:
            </p>
          )}

          {matches.map(({ workspace, role }) => (
            <div
              key={workspace.id}
              className="flex flex-col gap-2.5 p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60"
            >
              <div className="flex items-center gap-3">
                {workspace.logoUrl ? (
                  <img
                    src={workspace.logoUrl}
                    alt={workspace.name}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-zinc-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm truncate">
                    <span className="truncate">{workspace.name}</span>
                    {role === 'admin' ? (
                      <ShieldCheck className="w-4 h-4 text-[#0b57d0] shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {role === 'admin'
                      ? `${workspace.name} Official Admin • Web Workspace & Master Console`
                      : 'Enrolled Student • Official Android App'}
                  </p>
                </div>
              </div>

              {role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInstituteId(workspace.id);
                    setSelectedAppInstituteId(workspace.id);
                    setAppInstituteGuestMode(false);
                    const targetProjectId = workspace.firebaseWebConfig?.projectId || '';
                    const currentProjectId = APP_BRAND.firebaseConfig?.projectId || '';
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
                    onOpenWorkspace(workspace);
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer border-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login as {workspace.name} Official Admin</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenAppStore) {
                      onOpenAppStore(workspace.slug || null);
                    } else {
                      window.location.href = workspace.slug
                        ? `/apps/${encodeURIComponent(workspace.slug)}`
                        : '/apps';
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

      {/* Always-available Elevate Labs Official App download + Full-page Institute App Storefront */}
      <div className="space-y-2">
        <a
          href="./elevate.apk"
          download="elevate.apk"
          className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 dark:bg-zinc-800/90 hover:bg-slate-200/80 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] border-0 no-underline"
        >
          <Download className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
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
          className="w-full py-3 px-4 rounded-2xl bg-slate-100/90 dark:bg-zinc-800/90 hover:bg-slate-200/80 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99] border-0 cursor-pointer"
        >
          <Building2 className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span>Choose your own Institute&apos;s App</span>
        </button>
      </div>
    </div>
  );
};
