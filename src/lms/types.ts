export type Role = 'admin' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  enrolledBatchIds: string[];
  avatarUrl?: string;
}

export interface PdfNote {
  id: string;
  title: string;
  url: string;
  fileUrl?: string; // Optional alias for url compatibility
  size?: string;
  pages?: number;
  type?: 'pdf' | 'image' | 'formula_sheet' | 'drive_doc';
  previewImageUrl?: string;
  driveFileId?: string;
  drivePreviewUrl?: string;
}

export interface TimelineMilestone {
  id: string;
  seconds: number;
  title: string;
  description?: string;
}

export interface PersonalNote {
  id: string;
  lectureId: string;
  seconds: number;
  text: string;
  createdAt: string;
}

export interface Lecture {
  id: string;
  batchId: string;
  subjectId: string;
  chapterId: string;
  title: string;
  description: string;
  durationMinutes: number;
  videoSourceType: 'youtube' | 'direct_hls' | 'vimeo';
  encryptedVideoId: string; // Obfuscated YouTube ID or URL
  thumbnailUrl: string;
  order: number;
  isFreePreview: boolean;
  pdfNotes: PdfNote[];
  notes?: PdfNote[]; // Optional alias for pdfNotes
  milestones?: TimelineMilestone[];
  faculty?: {
    name: string;
    designation: string;
    avatarUrl: string;
  };
  createdAt: string;
}

export interface Chapter {
  id: string;
  batchId: string;
  subjectId: string;
  title: string;
  description?: string;
  order: number;
  testIds?: string[]; // Elevate mock test IDs linked to this chapter
  parentId?: string | null; // null/undefined = Root level folder in Batch
  folderType?: 'folder' | 'chapter'; // Nested folder container or chapter
  color?: string; // Optional folder color accent (hex or css class)
  icon?: string; // Optional custom folder icon identifier
  pdfNotes?: PdfNote[]; // Direct PDF attachments / formula sheets attached to this folder
  createdAt?: string;
  updatedAt?: string;
}

export interface Subject {
  id: string;
  batchId: string;
  title: string;
  iconName?: string;
  color?: string;
  order: number;
}

export interface Batch {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  price: number;
  originalPrice: number;
  bannerUrl: string;
  thumbnailUrl: string;
  instructor: {
    name: string;
    designation: string;
    avatarUrl: string;
  };
  validityDays: number;
  startDate: string;
  rating: number;
  enrolledStudentsCount: number;
  isPublished: boolean;
  allowGuestAccess?: boolean; // When true, guest visitors can access and self-enroll in this batch
}

export interface WatchProgress {
  lectureId: string;
  watchedSeconds: number;
  totalSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: string;
}

export interface Announcement {
  id: string;
  batchId?: string; // null means global
  title: string;
  message: string;
  date: string;
  isImportant?: boolean;
}

export interface PlaybackSessionToken {
  token: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
  ticketId: string;
  batchId: string;
  lectureId: string;
  isAuthorized: boolean;
  clientIp?: string;
}

export interface BatchEnrollment {
  id: string;
  batchId: string;
  userId: string;
  studentName: string;
  studentEmail?: string;
  studentPhone?: string;
  enrolledAt: string;
  expiresAt?: string;
  validUntil?: string; // Optional alias for expiresAt
  status: 'active' | 'expired' | 'revoked';
}

export interface BatchTestCard {
  testId: string;
  id?: string; // Optional alias for testId
  batchId: string;
  title: string;
  topic: string;
  questionCount: number;
  timeLimitMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
  passingScorePercentage: number;
  catalogChunkId: string;
  chunkId?: string; // Optional alias for catalogChunkId
  chunkEstimatedBytes: number;
  publishedAt: string;
}
