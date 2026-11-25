import React, { useState } from 'react';
import {
  Building2,
  UserPlus,
  Trash2,
  Crown,
  ShieldCheck,
  Mail,
  CheckCircle2,
  AlertCircle,
  Plus,
  Users,
} from 'lucide-react';
import {
  type MasterWorkspace,
  canManageWorkspaceTeam,
  isRootSuperAdmin,
  addTeamAdminToWorkspace,
  removeTeamAdminFromWorkspace,
  createMasterWorkspace,
  deleteMasterWorkspace,
  PRIMARY_WORKSPACE_ID,
} from '../../lib/masterWorkspace';

interface MasterTeamAccessPanelProps {
  workspaces: MasterWorkspace[];
  activeWorkspace: MasterWorkspace;
  currentUserEmail: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onNotify: (msg: string, type?: 'info' | 'warn') => void;
}

export const MasterTeamAccessPanel: React.FC<MasterTeamAccessPanelProps> = ({
  workspaces,
  activeWorkspace,
  currentUserEmail,
  onSelectWorkspace,
  onNotify,
}) => {
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  const [newInstituteName, setNewInstituteName] = useState('');
  const [newInstituteOwnerEmail, setNewInstituteOwnerEmail] = useState('');
  const [isCreatingInstitute, setIsCreatingInstitute] = useState(false);

  const canManageTeam = canManageWorkspaceTeam(activeWorkspace, currentUserEmail);
  const isSuperAdmin = isRootSuperAdmin(currentUserEmail);

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
        onNotify(`Added ${newTeamEmail.trim().toLowerCase()} as Team Admin for "${activeWorkspace.name}".`, 'info');
        setNewTeamEmail('');
      } else {
        onNotify(res.error || 'Could not add team member.', 'warn');
      }
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    const res = await removeTeamAdminFromWorkspace({
      workspaceId: activeWorkspace.id,
      emailToRemove: email,
      actorEmail: currentUserEmail,
    });
    if (res.success) {
      onNotify(`Removed ${email} from "${activeWorkspace.name}".`, 'info');
    } else {
      onNotify(res.error || 'Could not remove team member.', 'warn');
    }
  };

  const handleCreateInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstituteName.trim() || !newInstituteOwnerEmail.trim() || isCreatingInstitute) return;
    setIsCreatingInstitute(true);
    try {
      const res = await createMasterWorkspace({
        name: newInstituteName,
        ownerEmail: newInstituteOwnerEmail,
        actorEmail: currentUserEmail,
      });
      if (res.success && res.workspace) {
        onNotify(`Created isolated Master Console "${res.workspace.name}" for ${res.workspace.ownerEmail}!`, 'info');
        setNewInstituteName('');
        setNewInstituteOwnerEmail('');
        onSelectWorkspace(res.workspace.id);
      } else {
        onNotify(res.error || 'Failed to create institute workspace.', 'warn');
      }
    } finally {
      setIsCreatingInstitute(false);
    }
  };

  const handleDeleteInstitute = async (ws: MasterWorkspace) => {
    const res = await deleteMasterWorkspace({
      workspaceId: ws.id,
      actorEmail: currentUserEmail,
    });
    if (res.success) {
      onNotify(`Deleted workspace "${ws.name}".`, 'info');
      if (activeWorkspace.id === ws.id) {
        onSelectWorkspace(PRIMARY_WORKSPACE_ID);
      }
    } else {
      onNotify(res.error || 'Could not delete workspace.', 'warn');
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 space-y-5 [scrollbar-width:thin]">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Active Workspace Banner */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/15 text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white m-0">
                    {activeWorkspace.name}
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Isolated Master Account
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-zinc-400 m-0 pt-0.5 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Owner: <strong>{activeWorkspace.ownerEmail}</strong></span>
                </p>
              </div>
            </div>

            {workspaces.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Switch Account:</span>
                <select
                  value={activeWorkspace.id}
                  onChange={(e) => onSelectWorkspace(e.target.value)}
                  className="h-9 px-3 rounded-full bg-[#f0f4f9] dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200 border-0 outline-none cursor-pointer"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-[#f0f4f9] dark:bg-zinc-900/70 text-xs text-slate-700 dark:text-zinc-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0 mt-0.5" />
            <span>
              Team members added here share access <strong>only</strong> to <strong>{activeWorkspace.name}</strong> (its batches, tests, and students). Other institutes remain completely separate.
            </span>
          </div>
        </div>

        {/* Team Members Management */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white m-0">
                Team Admins ({activeWorkspace.teamAdminEmails.length})
              </h3>
            </div>
            {!canManageTeam && (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Owner-only editing</span>
              </span>
            )}
          </div>

          {canManageTeam && (
            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={newTeamEmail}
                  onChange={(e) => setNewTeamEmail(e.target.value)}
                  placeholder="Enter team member email (e.g. teacher@gmail.com)..."
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

          {/* Owner Row */}
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

        {/* Super-Admin Provisioning for Separate Institutes */}
        {isSuperAdmin && (
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#16181f] border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="w-4.5 h-4.5 text-purple-500" />
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white m-0">
                Create Separate Institute Master Account (Super-Admin)
              </h3>
            </div>

            <form onSubmit={handleCreateInstitute} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                value={newInstituteName}
                onChange={(e) => setNewInstituteName(e.target.value)}
                placeholder="Institute Name (e.g. Institute B)"
                className="h-10 px-4 rounded-full bg-[#f0f4f9] dark:bg-zinc-900 text-xs font-medium text-slate-900 dark:text-white border border-slate-200/70 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-[#0b57d0]"
              />
              <input
                type="email"
                required
                value={newInstituteOwnerEmail}
                onChange={(e) => setNewInstituteOwnerEmail(e.target.value)}
                placeholder="Owner Email (e.g. head@instituteb.com)"
                className="h-10 px-4 rounded-full bg-[#f0f4f9] dark:bg-zinc-900 text-xs font-medium text-slate-900 dark:text-white border border-slate-200/70 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-[#0b57d0]"
              />
              <button
                type="submit"
                disabled={isCreatingInstitute}
                className="h-10 px-5 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer transition active:scale-95 disabled:opacity-50"
              >
                <Building2 className="w-4 h-4" />
                <span>Create Master Account</span>
              </button>
            </form>

            <div className="space-y-2 pt-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-2 transition ${
                    ws.id === activeWorkspace.id
                      ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-300/70 dark:border-blue-800/60'
                      : 'bg-slate-50/70 dark:bg-zinc-900/40 border-slate-200/60 dark:border-zinc-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {ws.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                      Owner: {ws.ownerEmail} • {ws.teamAdminEmails.length} Team Admin{ws.teamAdminEmails.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ws.id !== activeWorkspace.id && (
                      <button
                        type="button"
                        onClick={() => onSelectWorkspace(ws.id)}
                        className="h-7 px-3 rounded-full bg-white dark:bg-zinc-800 hover:bg-slate-100 text-xs font-bold text-[#0b57d0] dark:text-[#a8c7fa] border border-slate-200 dark:border-zinc-700 cursor-pointer"
                      >
                        Switch
                      </button>
                    )}
                    {ws.id !== PRIMARY_WORKSPACE_ID && (
                      <button
                        type="button"
                        onClick={() => handleDeleteInstitute(ws)}
                        className="w-7 h-7 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 flex items-center justify-center border-0 bg-transparent cursor-pointer"
                        title="Delete workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
