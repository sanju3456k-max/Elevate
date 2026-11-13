import React, { useState, useMemo, useEffect } from 'react';
import { X, Users, UserPlus, Search, CheckCircle2, ShieldAlert, Phone, Mail, Calendar, UserX } from 'lucide-react';
import { useApp } from '../../../lms/LmsContext';
import type { Batch } from '../../../lms/types';

interface BatchQuickEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: Batch | null;
}

export const BatchQuickEnrollModal: React.FC<BatchQuickEnrollModalProps> = ({
  isOpen,
  onClose,
  batch,
}) => {
  const {
    students,
    getEnrollmentsForBatch,
    loadRosterForBatch,
    enrollStudentByContact,
    revokeStudentEnrollment,
    showSecurityToast,
  } = useApp();

  const [contactInput, setContactInput] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [validityDays, setValidityDays] = useState('365');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  React.useEffect(() => {
    if (isOpen && batch?.id) {
      loadRosterForBatch(batch.id);
    }
  }, [isOpen, batch?.id, loadRosterForBatch]);

  const batchEnrollments = useMemo(() => {
    if (!batch) return [];
    return getEnrollmentsForBatch(batch.id);
  }, [batch, getEnrollmentsForBatch]);

  const enrolledUserIds = useMemo(() => {
    return new Set(batchEnrollments.map((e) => e.userId));
  }, [batchEnrollments]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students.slice(0, 8);
    const q = searchQuery.toLowerCase().trim();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
  }, [students, searchQuery]);

  if (!isOpen || !batch) return null;

  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactInput.trim()) return;

    const res = enrollStudentByContact({
      contact: contactInput.trim(),
      batchId: batch.id,
      name: studentNameInput.trim() || undefined,
      validityDays: Number(validityDays) || 365,
    });

    setActionFeedback({ success: res.success, msg: res.message });
    if (res.success) {
      setContactInput('');
      setStudentNameInput('');
      showSecurityToast(`Student successfully enrolled into ${batch.title}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleDirectEnroll = (stu: { id: string; name: string; email?: string; phone?: string }) => {
    const contact = stu.email || stu.phone || stu.id;
    const res = enrollStudentByContact({
      contact,
      batchId: batch.id,
      name: stu.name,
      validityDays: Number(validityDays) || 365,
    });
    setActionFeedback({ success: res.success, msg: res.message });
    if (res.success) {
      showSecurityToast(`${stu.name} enrolled into ${batch.title}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleRevoke = async (identifier: string, name: string) => {
    if (window.confirm(`Are you sure you want to revoke access for ${name} from ${batch.title}?`)) {
      await revokeStudentEnrollment(identifier, batch.id);
      showSecurityToast(`Access revoked for ${name}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--md-sys-color-surface-container)] rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-none">
        {/* Header */}
        <div className="p-6 border-b border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-between sticky top-0 bg-[var(--md-sys-color-surface-container)] z-10 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <img
              src={batch.thumbnailUrl}
              alt=""
              className="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] truncate">
                  Manage Access: {batch.title}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {batchEnrollments.length} Enrolled
                </span>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Grant or revoke student access by phone, email, or user profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] transition border-none outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action feedback alert */}
        {actionFeedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-2xl text-xs font-bold flex items-center space-x-2 ${
              actionFeedback.success
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            }`}
          >
            {actionFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionFeedback.msg}</span>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Section 1: Enroll by Phone / Email */}
          <div className="p-4 rounded-3xl bg-[var(--md-sys-color-surface-container-high)] space-y-3">
            <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
              <UserPlus className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
              <span>Quick Enroll Student by Contact</span>
            </h3>

            <form onSubmit={handleEnroll} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5 space-y-1">
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                  Student Phone or Email *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={contactInput}
                    onChange={(e) => setContactInput(e.target.value)}
                    placeholder="e.g. 9876543210 or student@gmail.com"
                    className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none font-mono"
                  />
                </div>
              </div>

              <div className="md:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] block">
                  Student Name (Optional)
                </label>
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full p-2.5 bg-[var(--md-sys-color-surface-container-highest)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  className="w-full py-2.5 m3-btn-filled text-xs font-bold shadow-xs border-none outline-none cursor-pointer flex items-center justify-center space-x-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Enroll Access</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Directory Search & 1-Click Enroll */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
                <Search className="w-4 h-4 text-indigo-500" />
                <span>Search Student Directory ({students.length})</span>
              </h3>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--md-sys-color-on-surface-variant)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students by name, email, or phone..."
                className="w-full pl-9 pr-4 py-2 bg-[var(--md-sys-color-surface-container-high)] rounded-xl text-xs text-[var(--md-sys-color-on-surface)] border-none outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {filteredStudents.map((stu) => {
                const isAlreadyEnrolled = enrolledUserIds.has(stu.id);
                return (
                  <div
                    key={stu.id}
                    className="p-2.5 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-[var(--md-sys-color-on-surface)] truncate">{stu.name}</p>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                        {stu.email || stu.phone || stu.id}
                      </p>
                    </div>

                    {isAlreadyEnrolled ? (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 flex items-center space-x-1 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Enrolled</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDirectEnroll(stu)}
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] hover:opacity-90 transition border-none outline-none cursor-pointer flex-shrink-0"
                      >
                        + Enroll
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Current Enrolled Roster */}
          <div className="space-y-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
            <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-1.5">
              <Users className="w-4 h-4 text-emerald-500" />
              <span>Active Batch Roster ({batchEnrollments.length})</span>
            </h3>

            {batchEnrollments.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/40 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No students enrolled in this batch yet. Use the form above to grant access.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {batchEnrollments.map((enr) => (
                  <div
                    key={enr.id}
                    className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-[var(--md-sys-color-on-surface)]">{enr.studentName}</p>
                      <div className="flex items-center space-x-3 text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                        {enr.studentEmail && (
                          <span className="flex items-center space-x-1">
                            <Mail className="w-3 h-3" />
                            <span>{enr.studentEmail}</span>
                          </span>
                        )}
                        {enr.studentPhone && (
                          <span className="flex items-center space-x-1">
                            <Phone className="w-3 h-3" />
                            <span>{enr.studentPhone}</span>
                          </span>
                        )}
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>Enrolled: {new Date(enr.enrolledAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevoke(enr.studentEmail || enr.studentPhone || enr.userId || enr.id, enr.studentName)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition border-none outline-none cursor-pointer flex items-center space-x-1 flex-shrink-0"
                    >
                      <UserX className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--md-sys-color-outline-variant)]/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-bold bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] hover:opacity-80 transition border-none outline-none cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
