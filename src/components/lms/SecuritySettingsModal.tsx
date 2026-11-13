import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../lms/LmsContext';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, setUser, toggleRole, showSecurityToast, theme, toggleTheme } = useApp();

  const [testPhone, setTestPhone] = useState(user.phone || '+91 98XXX-XXXXX');
  const [testEmail, setTestEmail] = useState(user.email || 'guest@elevatelabs.in');
  const [testName, setTestName] = useState(user.name || 'Guest Student');

  if (!isOpen) return null;

  const handleSaveWatermarkData = (e: React.FormEvent) => {
    e.preventDefault();
    setUser((prev) => ({
      ...prev,
      name: testName,
      phone: testPhone,
      email: testEmail,
    }));
    showSecurityToast('Updated Dynamic Watermark profile!');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[var(--md-sys-color-surface-container-high)] border-none rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 relative max-h-[92vh] sm:max-h-auto overflow-y-auto animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-[var(--md-sys-color-outline-variant)]/60 rounded-full mx-auto -mt-1 mb-2 sm:hidden" />
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-outline-variant)]/20">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Elevate Labs Security Engine
              </h2>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                Dynamic floating watermarks & guest testing controls
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition border-none outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme Mode Selector (Material 3 Segmented / Filter Chips) */}
        <div className="p-3.5 bg-[var(--md-sys-color-surface-container)] rounded-2xl border-none space-y-2">
          <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--md-sys-color-primary)]" />
            <span>Appearance Theme (Light & Dark)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (theme !== 'light') toggleTheme();
              }}
              className={`py-2 px-3 rounded-full text-xs font-bold flex items-center justify-center space-x-1.5 transition border-none outline-none ${
                theme === 'light'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (theme !== 'dark') toggleTheme();
              }}
              className={`py-2 px-3 rounded-full text-xs font-bold flex items-center justify-center space-x-1.5 transition border-none outline-none ${
                theme === 'dark'
                  ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-xs'
                  : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Form: Edit Watermark Info */}
        <form onSubmit={handleSaveWatermarkData} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
              Guest Name (Shows on Watermark)
            </label>
            <input
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              className="w-full px-3.5 py-2 bg-[var(--md-sys-color-surface-container)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Guest Phone (Floating on Screen)
              </label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="w-full px-3.5 py-2 bg-[var(--md-sys-color-surface-container)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] block mb-1">
                Guest Email (Floating on Screen)
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full px-3.5 py-2 bg-[var(--md-sys-color-surface-container)] rounded-2xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono text-[11px]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 m3-btn-filled text-xs shadow-xs border-none outline-none"
          >
            Update Live Video Watermark
          </button>
        </form>

        {/* Anti-Piracy Checklist / Status */}
        <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-4 border-none space-y-2 text-xs">
          <span className="font-bold block text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Active Protection Modules (Elevate Labs Grade)
          </span>

          <div className="flex items-center space-x-2 text-[var(--md-sys-color-on-surface-variant)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong>Dynamic Watermarking:</strong> Random coordinates shifting every 7s.</span>
          </div>

          <div className="flex items-center space-x-2 text-[var(--md-sys-color-on-surface-variant)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong>YouTube Cloaking:</strong> Native controls, logo & "Watch on YouTube" suppressed.</span>
          </div>

          <div className="flex items-center space-x-2 text-[var(--md-sys-color-on-surface-variant)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong>DevTools Active Detection:</strong> Real-time inspection detector halts playback & blacks out screen.</span>
          </div>

          <div className="flex items-center space-x-2 text-[var(--md-sys-color-on-surface-variant)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span><strong>Ephemeral Token Gateway:</strong> 60-second signed session tickets prevent link sharing.</span>
          </div>
        </div>

        {/* Role Toggle Pill */}
        <div className="pt-1 flex items-center justify-between">
          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Current Role Mode:</span>
          <button
            type="button"
            onClick={toggleRole}
            className="m3-btn-tonal px-4 py-1.5 text-xs font-bold border-none outline-none"
          >
            Switch to {user.role === 'admin' ? 'Student View' : 'Admin View'}
          </button>
        </div>
      </div>
    </div>
  );
};
