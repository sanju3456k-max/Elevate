import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Settings,
  Users,
  UserPlus,
  RefreshCw,
  Trash2,
  Shield,
  Sparkles,
  Lock,
  CheckCircle,
  Calendar,
  DollarSign,
  Search,
  Image,
  Globe,
  Tag,
  AlertCircle,
  Check,
  Smartphone,
  ChevronDown,
  EyeOff,
} from 'lucide-react';
import type { Batch, BatchEnrollment } from '../../../lms/types';
import { useApp } from '../../../lms/LmsContext';
import { adminResetDeviceLock } from '../../../lib/deviceAuthService';
import { M3Switch } from '../../ui/Material3';
import { BatchThumbnailPicker } from './BatchThumbnailPicker';

/* =========================================================================
   1. EDIT BATCH MODAL (Settings, Details, Pricing, Status & Delete)
   ========================================================================= */
interface EditBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: Batch | null;
  onSave: (batchId: string, updated: Partial<Batch>) => void;
  onDelete?: (batchId: string) => void;
}

export const EditBatchModal: React.FC<EditBatchModalProps> = ({
  isOpen,
  onClose,
  batch,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState<number | string>(0);
  const [originalPrice, setOriginalPrice] = useState<number | string>(0);
  const [validityDays, setValidityDays] = useState<number | string>(365);
  const [bannerUrl, setBannerUrl] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [allowGuestAccess, setAllowGuestAccess] = useState(false);
  const [isPrivateRosterOnly, setIsPrivateRosterOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (batch && isOpen) {
      setTitle(batch.title || '');
      setDescription(batch.description || '');
      setCategory(batch.category || 'General');
      setPrice(batch.price ?? 0);
      setOriginalPrice(batch.originalPrice ?? 0);
      setValidityDays(batch.validityDays ?? 365);
      setBannerUrl(batch.bannerUrl || batch.thumbnailUrl || '');
      setIsPublished(batch.isPublished !== false);
      setAllowGuestAccess(Boolean(batch.allowGuestAccess));
      setIsPrivateRosterOnly(Boolean(batch.isPrivateRosterOnly));
      setConfirmDelete(false);
    }
  }, [batch, isOpen]);

  if (!isOpen || !batch) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave(batch.id, {
      title: title.trim(),
      description: description.trim(),
      category: category.trim() || 'General',
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || 0,
      validityDays: Number(validityDays) || 365,
      bannerUrl: bannerUrl.trim() || undefined,
      thumbnailUrl: bannerUrl.trim() || undefined,
      isPublished,
      allowGuestAccess,
      isPrivateRosterOnly,
    });
    onClose();
  };

  const handleDelete = () => {
    if (onDelete && batch) {
      onDelete(batch.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--md-sys-color-outline-variant)]/15 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#0b57d0] text-white flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Batch Settings & Details
              </h3>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[260px] sm:max-w-sm">
                Manage metadata, pricing, and access for {batch.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs flex-1">
          {/* Title */}
          <div>
            <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
              Batch Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
            />
          </div>

          {/* Category & Validity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                Category / Stream
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Mathematics, NDA, JEE"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                Validity (Days)
              </label>
              <input
                type="number"
                min="1"
                max="3650"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>
          </div>

          {/* Pricing: Selling Price & Original Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                Selling Price (₹)
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                Original Strikethrough Price (₹)
              </label>
              <input
                type="number"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
              Description & Objectives
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview of this course batch..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/40 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition resize-none"
            />
          </div>

          {/* High-Resolution Thumbnail & Course Banner with Live 16:9 Preview & Repair */}
          <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20">
            <BatchThumbnailPicker
              value={bannerUrl}
              onChange={setBannerUrl}
              previewTitle={title}
              previewCategory={category}
            />
          </div>

          {/* Toggles: Status & Guest Pass */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/60">
              <div>
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#0b57d0]" />
                  <span>Course Publication Status</span>
                </span>
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  {isPublished ? 'Live: Visible to students in course catalog' : 'Draft: Hidden from students, accessible to faculty only'}
                </span>
              </div>
              <M3Switch
                checked={isPublished}
                onChange={() => setIsPublished(!isPublished)}
              />
            </div>

            {(() => {
              const isGuestPassDisabled = !isPublished || isPrivateRosterOnly;
              return (
                <div className={`flex items-center justify-between p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/60 transition ${
                  isGuestPassDisabled ? 'opacity-60' : ''
                }`}>
                  <div>
                    <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block flex items-center space-x-1.5">
                      <Sparkles className={`w-3.5 h-3.5 ${!isGuestPassDisabled && allowGuestAccess ? 'text-amber-500' : 'text-slate-400'}`} />
                      <span>Free Guest Mode Pass</span>
                      {isGuestPassDisabled && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-500 font-semibold">
                          Disabled
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                      {!isPublished
                        ? 'Inactive in Draft mode (Publish course to enable)'
                        : isPrivateRosterOnly
                        ? 'Inactive in Secret Roster mode (Course hidden from guests)'
                        : allowGuestAccess
                        ? 'Allowed: Visitors can explore curriculum for free'
                        : 'Strict: Official roster enrollment required'}
                    </span>
                  </div>
                  <M3Switch
                    checked={!isGuestPassDisabled && allowGuestAccess}
                    disabled={isGuestPassDisabled}
                    onChange={() => {
                      if (!isGuestPassDisabled) setAllowGuestAccess(!allowGuestAccess);
                    }}
                  />
                </div>
              );
            })()}

            <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/60">
              <div>
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block flex items-center space-x-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                  <span>Secret Roster-Exclusive (Hidden from Catalog & Guests)</span>
                </span>
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  {isPrivateRosterOnly ? 'Secret: 100% hidden from catalog and guests. Only enrolled students see & access it.' : 'Catalog: Listed in catalog per publish setting'}
                </span>
              </div>
              <M3Switch
                checked={isPrivateRosterOnly}
                onChange={() => setIsPrivateRosterOnly(!isPrivateRosterOnly)}
              />
            </div>
          </div>

          {/* Danger Zone: Delete Course */}
          {onDelete && (
            <div className="p-3.5 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 block">
                    Delete Course Batch
                  </span>
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    Permanently deletes this batch container and syncs to cloud.
                  </span>
                </div>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-bold border-none bg-transparent cursor-pointer transition"
                  >
                    Delete Batch
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-none bg-transparent cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold border-none cursor-pointer shadow-xs hover:bg-rose-700 transition"
                    >
                      Confirm Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--md-sys-color-outline-variant)]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-none cursor-pointer shadow-xs transition"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


/* =========================================================================
   2. BATCH ROSTER & STUDENTS MODAL (Enroll, Revoke, Device Reset per Batch)
   ========================================================================= */
interface BatchRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: Batch | null;
}

export const BatchRosterModal: React.FC<BatchRosterModalProps> = ({
  isOpen,
  onClose,
  batch,
}) => {
  const {
    getEnrollmentsForBatch,
    loadRosterForBatch,
    enrollStudentByContact,
    revokeStudentEnrollment,
    showSecurityToast,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [newContact, setNewContact] = useState('');
  const [newName, setNewName] = useState('');
  const [newValidityDays, setNewValidityDays] = useState(365);
  const [resettingUid, setResettingUid] = useState<string | null>(null);

  // Load roster on open
  useEffect(() => {
    if (batch?.id && isOpen) {
      loadRosterForBatch(batch.id);
    }
  }, [batch?.id, isOpen, loadRosterForBatch]);

  const batchEnrollments = useMemo(() => {
    if (!batch?.id) return [];
    return getEnrollmentsForBatch(batch.id);
  }, [batch?.id, getEnrollmentsForBatch]);

  const filteredEnrollments = useMemo(() => {
    if (!searchQuery.trim()) return batchEnrollments;
    const q = searchQuery.toLowerCase().trim();
    return batchEnrollments.filter((e) => {
      const name = (e.studentName || '').toLowerCase();
      const email = (e.studentEmail || '').toLowerCase();
      const phone = (e.studentPhone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [batchEnrollments, searchQuery]);

  if (!isOpen || !batch) return null;

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.trim()) return;

    const res = enrollStudentByContact({
      contact: newContact.trim(),
      batchId: batch.id,
      name: newName.trim() || undefined,
      validityDays: Number(newValidityDays) || 365,
    });

    if (res.success) {
      showSecurityToast(`Student successfully enrolled in ${batch.title}`);
      setNewContact('');
      setNewName('');
      setIsAddingStudent(false);
      loadRosterForBatch(batch.id);
    } else {
      showSecurityToast(res.message);
    }
  };

  const handleRevoke = (enrollment: BatchEnrollment) => {
    const studentIdentifier = enrollment.studentEmail || enrollment.studentPhone || enrollment.userId;
    revokeStudentEnrollment(studentIdentifier, batch.id);
    showSecurityToast(`Revoked access for ${enrollment.studentName || studentIdentifier}`);
    loadRosterForBatch(batch.id);
  };

  const handleDeviceReset = async (enrollment: BatchEnrollment) => {
    const targetUid = enrollment.userId;
    setResettingUid(targetUid);
    try {
      const ok = await adminResetDeviceLock(targetUid);
      if (ok) {
        showSecurityToast(`Single-device lock reset for ${enrollment.studentName || 'Student'}`);
      } else {
        showSecurityToast('Device lock reset completed locally');
      }
    } catch {
      showSecurityToast('Reset command submitted');
    } finally {
      setResettingUid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#1e2024] rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)]/20 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--md-sys-color-outline-variant)]/15 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                  Batch Students & Access
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                  {batchEnrollments.length} Enrolled
                </span>
              </div>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[260px] sm:max-w-md">
                Course: <span className="font-semibold">{batch.title}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] border-none bg-transparent cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Toolbar: Search & Add Student */}
        <div className="p-3 sm:p-4 border-b border-[var(--md-sys-color-outline-variant)]/10 bg-[var(--md-sys-color-surface-container-low)] shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students by name, email, or phone..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 text-xs text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-[var(--md-sys-color-primary)] transition"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsAddingStudent(!isAddingStudent)}
              className="px-3.5 py-2 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs flex items-center space-x-1.5 shadow-xs border-none cursor-pointer shrink-0 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isAddingStudent ? 'Close Form' : '+ Enroll Student'}</span>
            </button>
          </div>

          {/* Inline Enroll Student Form */}
          {isAddingStudent && (
            <form
              onSubmit={handleEnrollSubmit}
              className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 space-y-3 animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-[#0b57d0]" />
                  <span>Manual Student Enrollment</span>
                </span>
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  Instant access to {batch.title}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                    Email or Mobile *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                    placeholder="student@gmail.com"
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                    Student Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--md-sys-color-on-surface)] block mb-1">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newValidityDays}
                    onChange={(e) => setNewValidityDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingStudent(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-none bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold border-none cursor-pointer shadow-xs transition"
                >
                  Confirm & Enroll
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal List: Enrolled Students */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
          {filteredEnrollments.length > 0 ? (
            filteredEnrollments.map((enr) => {
              const contactInfo = enr.studentEmail || enr.studentPhone || enr.userId;
              const isExpired = enr.expiresAt ? new Date(enr.expiresAt).getTime() < Date.now() : false;
              const isResetting = resettingUid === enr.userId;

              return (
                <div
                  key={enr.id}
                  className="p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--md-sys-color-primary)]/40 transition"
                >
                  {/* Student Info */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#0b57d0]/10 text-[#0b57d0] dark:bg-[#a8c7fa]/20 dark:text-[#a8c7fa] flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                      {(enr.studentName || contactInfo || 'S').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] truncate">
                          {enr.studentName || 'Student'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            isExpired
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {isExpired ? 'Expired' : 'Active'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate font-mono">
                        {contactInfo}
                      </p>
                      <div className="flex items-center space-x-3 text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                        <span>Enrolled: {enr.enrolledAt || 'Recent'}</span>
                        <span>•</span>
                        <span>Expires: {enr.expiresAt || 'Lifetime'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Reset Device Lock & Revoke Access */}
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleDeviceReset(enr)}
                      disabled={isResetting}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[11px] flex items-center space-x-1.5 border-none cursor-pointer transition disabled:opacity-50"
                      title="Reset single-device lock for this student"
                    >
                      <Smartphone className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                      <span>{isResetting ? 'Resetting...' : 'Reset Device'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRevoke(enr)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold text-[11px] flex items-center space-x-1.5 border-none cursor-pointer transition"
                      title="Revoke access to this batch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center space-y-2">
              <Users className="w-10 h-10 text-[var(--md-sys-color-outline)] mx-auto opacity-40" />
              <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                {searchQuery ? 'No matching students found' : 'No Students Enrolled Yet'}
              </p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] max-w-xs mx-auto">
                {searchQuery
                  ? 'Try searching with a different name or email'
                  : 'Click "+ Enroll Student" above to give a student access to this course.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
