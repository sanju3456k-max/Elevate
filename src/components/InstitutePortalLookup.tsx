import React, { useState } from 'react';
import { Download, LogIn, Search, Building2, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  lookupInstitutesByEmail,
  setSelectedInstituteId,
  type InstituteLookupMatch,
} from '../lib/tenantFirebase';
import {
  setSelectedAppInstituteId,
  setAppInstituteGuestMode,
  type MasterWorkspace,
} from '../lib/masterWorkspace';
import { APP_BRAND, saveWebInstituteSession, clearWebInstituteSession } from '../config/appBrand';

interface InstitutePortalLookupProps {
  onOpenWorkspace: (workspace: MasterWorkspace) => void;
}

/**
 * Welcome-page email lookup component:
 * - Admins see "Login as {Institute} Admin" -> opens their isolated web workspace & Master Console.
 * - Students see their enrolled institute(s) and "Download {Institute} APK"
 *   (or choose between multiple institute APKs if enrolled in 2+).
 */
export const InstitutePortalLookup: React.FC<InstitutePortalLookupProps> = ({
  onOpenWorkspace,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [matches, setMatches] = useState<InstituteLookupMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          Enter your email to login as an Institute Admin or download your batch&apos;s Android APK.
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
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300">
          No institute found for <strong>{email}</strong>. Contact your institute admin to enroll your email.
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
                      ? 'Institute Admin • Web Workspace & Master Console'
                      : `Student • Download ${workspace.name} Android App`}
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
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer border-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login as Admin in {workspace.name}</span>
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
    </div>
  );
};
