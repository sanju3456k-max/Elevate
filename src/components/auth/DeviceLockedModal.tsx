import React, { useState } from 'react';
import { APP_BRAND } from '../../config/appBrand';
import { ShieldAlert, Smartphone, Laptop, RefreshCw, CheckCircle2, LogOut, MessageCircle } from 'lucide-react';
import { submitDeviceResetRequest, type DeviceLockStatus } from '../../lib/deviceAuthService';
import type { User } from 'firebase/auth';

interface DeviceLockedModalProps {
  status: DeviceLockStatus;
  currentUser: User | null;
  onSignOut: () => void;
}

export const DeviceLockedModal: React.FC<DeviceLockedModalProps> = ({
  status,
  currentUser,
  onSignOut,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [reason, setReason] = useState('Switched to a new phone / device');

  const handleSubmit = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    const ok = await submitDeviceResetRequest(currentUser, reason);
    setIsSubmitting(false);
    if (ok) {
      setIsSubmitted(true);
    }
  };

  const formattedRegDate = status.registeredDeviceAt
    ? new Date(status.registeredDeviceAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Previously registered';

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
      <div className="w-full max-w-md bg-white dark:bg-[#16181f] rounded-3xl shadow-2xl border border-red-500/20 overflow-hidden text-[#1f1f1f] dark:text-[#e3e3e3] animate-fade-in">
        {/* Top Warning Banner */}
        <div className="p-6 bg-gradient-to-b from-red-500/15 via-red-500/5 to-transparent flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shadow-lg ring-8 ring-red-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
              Single-Device Security Lock
            </h2>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1">
              Account Active on Another Device
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-slate-600 dark:text-zinc-400 text-center leading-relaxed">
            For anti-piracy compliance and course access integrity, your account is bound to a single registered device.
          </p>

          {/* Comparison Cards */}
          <div className="space-y-2.5">
            {/* Registered Device */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Authorized Device
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                  {status.registeredDeviceLabel || 'Primary Registered Device'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                  Locked on: {formattedRegDate}
                </p>
              </div>
            </div>

            {/* Current Device (Blocked) */}
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    This Device (Blocked)
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                  {status.currentDeviceLabel || 'Current Device'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                  Access requires Admin permission
                </p>
              </div>
            </div>
          </div>

          {/* Action: Request Admin Approval */}
          {!isSubmitted ? (
            <div className="pt-2 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Reason for Device Change:
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl bg-slate-100 dark:bg-[#22252a] border border-slate-300 dark:border-zinc-700 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Switched to a new phone / device">Switched to a new phone / device</option>
                  <option value="Reinstalled browser or cleared data">Reinstalled browser or formatted PC</option>
                  <option value="Old device lost or damaged">Old device lost or damaged</option>
                  <option value="Other valid academic requirement">Other academic requirement</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer border-none"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Send Reset Request to Admin</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-blue-500 mx-auto" />
              <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400">
                Request Sent to Master Admin
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                Your request has been queued. Once Admin approves and resets your device, you will be able to log in on this device immediately.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-[#1a1c22] border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <a
            href={`https://wa.me/?text=Hi%20Admin,%20I%20need%20a%20device%20lock%20reset%20for%20my%20${encodeURIComponent(APP_BRAND.name)}%20account.`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 flex items-center space-x-1.5 transition no-underline"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Contact Support</span>
          </a>

          <button
            type="button"
            onClick={onSignOut}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold border-none cursor-pointer flex items-center space-x-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
