import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  ArrowRight,
  Search,
  Sparkles,
  UserCheck,
  ArrowLeft,
  Loader2,
  Download,
} from 'lucide-react';
import {
  type MasterWorkspace,
  getCachedMasterWorkspaces,
  fetchMasterWorkspacesFromCloud,
  getWorkspaceById,
  setSelectedAppInstituteId,
  setAppInstituteGuestMode,
} from '../../lib/masterWorkspace';
import { APP_BRAND, clearWebInstituteSession } from '../../config/appBrand';
import { isNativeAndroid } from '../../lib/nativeHardwareBridge';
import { PRIMARY_WORKSPACE_ID } from '../../lib/masterWorkspace';
import { getInstituteFirebaseServices } from '../../lib/tenantFirebase';
import { InstitutePortalLookup } from '../InstitutePortalLookup';

interface InstitutePickerViewProps {
  onSelectInstitute: (ws: MasterWorkspace) => void;
  subtitle?: string;
}

export const InstitutePickerView: React.FC<InstitutePickerViewProps> = ({
  onSelectInstitute,
  subtitle = 'Select your coaching institute to enter its dedicated learning environment.',
}) => {
  const [workspaces, setWorkspaces] = useState<MasterWorkspace[]>(() => getCachedMasterWorkspaces());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    fetchMasterWorkspacesFromCloud()
      .then((list) => {
        if (mounted && Array.isArray(list) && list.length > 0) {
          setWorkspaces(list);
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const handleUpdate = () => {
      if (mounted) setWorkspaces(getCachedMasterWorkspaces());
    };
    window.addEventListener('master-workspaces-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('master-workspaces-updated', handleUpdate);
    };
  }, []);

  const filteredWorkspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (ws) =>
        ws.name.toLowerCase().includes(q) ||
        ws.id.toLowerCase().includes(q)
    );
  }, [workspaces, search]);

  return (
    <div className="w-full space-y-4 text-left">
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Choose Your Institute
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
          {subtitle}
        </p>
      </div>

      {workspaces.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search institute name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0b57d0]"
          />
        </div>
      )}

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
        {isLoading && workspaces.length <= 1 ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-[#0b57d0]" />
            <span>Loading institutes...</span>
          </div>
        ) : null}

        {filteredWorkspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => onSelectInstitute(ws)}
            className="w-full p-3.5 rounded-2xl bg-slate-50/90 dark:bg-zinc-900/70 hover:bg-blue-50/80 dark:hover:bg-blue-950/30 border border-slate-200/80 dark:border-zinc-800 hover:border-[#0b57d0]/50 flex items-center justify-between gap-3 transition-all text-left group cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-zinc-700 flex items-center justify-center shrink-0 text-[#0b57d0] dark:text-[#a8c7fa] shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {ws.name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  Tap to enter institute portal
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#0b57d0] group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        ))}

        {!isLoading && filteredWorkspaces.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-zinc-400">
            No institutes found matching "{search}".
          </div>
        )}
      </div>
    </div>
  );
};

interface InstitutePortalGateProps {
  selectedInstituteId: string | null;
  onInstituteSelected: (workspaceId: string | null) => void;
  onContinueAsGuest: () => void;
  onSignIn: () => Promise<void> | void;
  isSigningIn?: boolean;
}

export const InstitutePortalGate: React.FC<InstitutePortalGateProps> = ({
  selectedInstituteId,
  onInstituteSelected,
  onContinueAsGuest,
  onSignIn,
  isSigningIn = false,
}) => {
  const [selectedWorkspace, setSelectedWorkspace] = useState<MasterWorkspace | null>(() =>
    getWorkspaceById(selectedInstituteId)
  );

  useEffect(() => {
    setSelectedWorkspace(getWorkspaceById(selectedInstituteId));
    if (selectedInstituteId) {
      fetchMasterWorkspacesFromCloud().then(() => {
        setSelectedWorkspace(getWorkspaceById(selectedInstituteId));
      }).catch(() => {});
    }
  }, [selectedInstituteId]);

  const handlePickInstitute = (ws: MasterWorkspace) => {
    setSelectedAppInstituteId(ws.id);
    setSelectedWorkspace(ws);
    onInstituteSelected(ws.id);
  };

  const handleChangeInstitute = () => {
    setAppInstituteGuestMode(false);
    setSelectedAppInstituteId(null);
    setSelectedWorkspace(null);
    onInstituteSelected(null);
    if (APP_BRAND.isWebInstituteActive) {
      clearWebInstituteSession();
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-[999990] min-h-screen w-full flex items-center justify-center p-4 bg-[#f5f7fb] dark:bg-[#0b0c10] text-slate-800 dark:text-slate-100 select-none overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-[#13141a] border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden flex flex-col items-center text-center">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0">
            <img
              src={APP_BRAND.logoUrl}
              alt={APP_BRAND.name}
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {APP_BRAND.isWhiteLabel ? (
              APP_BRAND.name
            ) : (
              <>
                Elevate <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">Labs</span>
              </>
            )}
          </span>
        </div>

        {!(APP_BRAND.isLockedApk ? APP_BRAND.instituteId : (isNativeAndroid() ? (selectedInstituteId || PRIMARY_WORKSPACE_ID) : selectedInstituteId)) ? (
          <InstitutePortalLookup
            onOpenWorkspace={(ws) => {
              getInstituteFirebaseServices(ws);
              handlePickInstitute(ws);
            }}
          />
        ) : (
          <div className="w-full space-y-5 animate-fade-in">
            {APP_BRAND.isWhiteLabel && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[220px]">
                  {selectedWorkspace?.name || APP_BRAND.name}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Welcome to {APP_BRAND.isWhiteLabel ? (selectedWorkspace?.name || APP_BRAND.name) : 'Elevate Labs'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Sign in to access your enrolled batches & tests, or explore public courses in Guest Mode.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn}
                className="w-full py-3 px-5 rounded-2xl bg-[#0b57d0] hover:bg-[#0947a8] text-white font-bold text-sm shadow-md shadow-[#0b57d0]/20 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0"
              >
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAppInstituteGuestMode(true);
                  onContinueAsGuest();
                }}
                className="w-full py-3 px-5 rounded-2xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200/80 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer border border-slate-200/80 dark:border-zinc-700"
              >
                <UserCheck className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Continue as Guest</span>
              </button>

              {selectedWorkspace?.apkDownloadUrl && (
                <a
                  href={selectedWorkspace.apkDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] no-underline"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedWorkspace.name} APK</span>
                </a>
              )}
            </div>

            {!APP_BRAND.isLockedApk && !isNativeAndroid() && (
              <button
                type="button"
                onClick={handleChangeInstitute}
                className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white transition-colors flex items-center justify-center gap-1.5 bg-transparent border-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Institute</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-[#0b57d0]" />
          <span>Multi-Institute Learning Platform</span>
        </div>
      </div>
    </div>
  );
};
