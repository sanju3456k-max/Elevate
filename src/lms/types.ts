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
  updatedAt?: string;
  workspaceId?: string;
}

export interface Lecture {
  id: string;
  batchId: string;
  subjectId: string;
  chapterId: string;
  title: string;
  description: string;
  durationMinutes: number;
  durationSeconds?: number;
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
  updatedAt?: string;
  workspaceId?: string;
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
  isPrivateRosterOnly?: boolean; // When true, 100% hidden from catalog and guests; ONLY enrolled students and admin can see & access
  workspaceId?: string; // Owning Master Console workspace ID (e.g., ws_primary or institute workspace)
  ownerEmail?: string; // Owning Master account email
}

export interface WatchProgress {
  lectureId: string;
  watchedSeconds: number;
  totalSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: string;
  workspaceId?: string;
}

export interface Announcement {
  id: string;
  batchId?: string; // null or undefined means global (all students)
  workspaceId?: string;
  title?: string;
  message?: string;
  date: string;
  isImportant?: boolean;
  imageUrl?: string;
  authorName?: string;
  authorRole?: string;
  createdAt?: number;
  isHeroBanner?: boolean;
  themeColor?: 'yellow' | 'orange' | 'blue' | 'green' | 'purple' | 'rose' | 'slate' | string;
  expiresAt?: number | null;
  durationLabel?: string;
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
  chapterId?: string | null;
  folderId?: string | null;
  title: string;
  topic: string;
  questionCount: number;
  timeLimitMinutes: number;
  time?: number;
  durationMinutes?: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'adaptive';
  passingScorePercentage: number;
  catalogChunkId: string;
  chunkId?: string; // Optional alias for catalogChunkId
  chunkEstimatedBytes: number;
  publishedAt: string;
}

export interface SecuritySettingsConfig {
  enableDrmScreenProtection: boolean; // Active only during Video & Tests (focus loss blackout, clipboard clean)
  enableDynamicWatermark: boolean; // Drifting student identity watermark during Video & Tests
  enableExamAnswerMasking: boolean; // Mask answers/solutions until test submission
  enableDevToolsDeterrence: boolean; // Auto-pause/detect inspect shortcuts across all pages
  enableStorageEncryption: boolean; // Transparent AES cryptographic storage vault for client data
  enableTestShareButton?: boolean; // Controls student visibility of Test Share button in Test Detail page
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettingsConfig = {
  enableDrmScreenProtection: true,
  enableDynamicWatermark: true,
  enableExamAnswerMasking: true,
  enableDevToolsDeterrence: true,
  enableStorageEncryption: true,
  enableTestShareButton: false, // Default is OFF (hidden) per security policy
};

export interface StudentFeatureAccessConfig {
  enableTestCreatorStudio: boolean; // Controls student visibility of Test Creator Studio
  enableCustomTestBuilder: boolean; // Controls student visibility of Custom Test Builder
  enableOmrPrintStudio: boolean;    // Controls student visibility of OMR & Print Studio
  enableNotesStudio: boolean;       // Controls student visibility of Notes Studio (including Results page)
  enableThetaAiChatbot: boolean;    // Controls student visibility of Theta AI Chatbot
  allowFilesToBeDownloadedInNotesViaPdfOrImages: boolean; // Controls student Print & Download options in Notes PDF/Image Viewer
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_STUDENT_FEATURE_ACCESS: StudentFeatureAccessConfig = {
  enableTestCreatorStudio: false,
  enableCustomTestBuilder: false,
  enableOmrPrintStudio: false,
  enableNotesStudio: false,
  enableThetaAiChatbot: false,
  allowFilesToBeDownloadedInNotesViaPdfOrImages: false,
};
