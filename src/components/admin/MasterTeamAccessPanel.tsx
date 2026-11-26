import React, { useState } from 'react';
import {
  UserPlus,
  Trash2,
  Crown,
  ShieldCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react';
import {
  type MasterWorkspace,
  canManageWorkspaceTeam,
  addTeamAdminToWorkspace,
  removeTeamAdminFromWorkspace,
} from '../../lib/masterWorkspace';

interface MasterTeamAccessPanelProps {
  workspaces: MasterWorkspace[];
  activeWorkspace: MasterWorkspace;
  currentUserEmail: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onNotify: (msg: string, type?: 'info' | 'warn') => void;
}

/**
 * Team Access panel for the current institute's Master Console.
 * Allows the institute owner/admins to add or remove Team Admins for their own institute only.
 * New institutes and APKs are provisioned in code (`tenants/<slug>/` + `institutesRegistry.ts`).
 */
export const MasterTeamAccessPanel: React.FC<MasterTeamAccessPanelProps> = ({
  activeWorkspace,
  currentUserEmail,
  onNotify,
}) => {
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  const canManageTeam = canManageWorkspaceTeam(activeWorkspace, currentUserEmail);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamEmail.trim() || isAddingMember) return;
    setIsAddingMember(true);
    try {
      const res = await addTeamAdminToWorkspace({
        workspaceId: activeWorkspace.id,
        emailToAdd: newTeamEmail,
        actorEmail: currentUserEmail,
      });
      if (res.success) {
        setNewTeamEmail('');
        onNotify(res.message, 'info');
      } else {
        onNotify(res.message, 'warn');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Failed to add team member.', 'warn');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    try {
      const res = await removeTeamAdminFromWorkspace({
        workspaceId: activeWorkspace.id,
        emailToRemove: email,
        actorEmail: currentUserEmail,
      });
      onNotify(res.message, res.success ? 'info' : 'warn');
    } catch (err: any) {
      onNotify(err?.message || 'Failed to remove team member.', 'warn');
    }
  };

  return (
    <div className="w-full space-y-6 pb-8">
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white m-0">
                Institute Team Admins
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
              Manage team admins for <strong>{activeWorkspace.name}</strong>. Admins can sign in to this institute&apos;s web console.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-[#0b57d0] dark:text-[#a8c7fa] text-xs font-bold shrink-0">
            <Users className="w-3.5 h-3.5" />
            <span>{1 + activeWorkspace.teamAdminEmails.length} Authorized</span>
          </span>
        </div>

        {!canManageTeam && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Only the institute Master Owner ({activeWorkspace.ownerEmail}) can add or remove team admins.</span>
          </div>
        )}

        {canManageTeam && (
          <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={newTeamEmail}
                onChange={(e) => setNewTeamEmail(e.target.value)}
                placeholder="Enter team admin email (e.g. teacher@gmail.com)..."
                className="w-full h-10 pl-10 pr-4 rounded-full bg-[#f0f4f9] dark:bg-zinc-900 text-xs font-medium text-slate-900 dark:text-white border border-slate-200/70 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-[#0b57d0]"
              />
            </div>
            <button
              type="submit"
              disabled={isAddingMember || !newTeamEmail.trim()}
              className="h-10 px-5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer transition active:scale-95 disabled:opacity-50 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Team Admin</span>
            </button>
          </form>
        )}

        <div className="space-y-2">
          <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Crown className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {activeWorkspace.ownerEmail}
              </span>
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
              Master Owner
            </span>
          </div>

          {activeWorkspace.teamAdminEmails.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-zinc-400 bg-slate-50/70 dark:bg-zinc-900/40 rounded-2xl">
              No team admins added yet. Add a team member email above to share this Master Console.
            </div>
          ) : (
            activeWorkspace.teamAdminEmails.map((email) => (
              <div
                key={email}
                className="p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-200/60 dark:border-zinc-800 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate">
                    {email}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-[#0b57d0] dark:text-[#a8c7fa]">
                    Team Admin
                  </span>
                  {canManageTeam && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(email)}
                      className="w-7 h-7 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 flex items-center justify-center border-0 bg-transparent cursor-pointer transition"
                      title={`Remove ${email}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
