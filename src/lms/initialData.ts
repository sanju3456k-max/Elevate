import type { Batch, Subject, Chapter, Lecture, User, Announcement, BatchEnrollment, BatchTestCard } from './types';
import { obfuscateVideoKey } from './security';

export const INITIAL_USER: User = {
  id: 'usr_guest_001',
  name: 'Guest Student',
  email: '',
  phone: '',
  role: 'student',
  enrolledBatchIds: [],
};

// ONLY ONE SINGLE TESTING BATCH
export const INITIAL_BATCHES: Batch[] = [
  {
    id: 'batch_testing_01',
    title: 'Testing Batch',
    tagline: 'Official testing environment for video stream cloaking, folders & watermarking',
    description:
      'This single testing batch is configured for Elevate Labs to test YouTube unlisted link masking, dynamic moving watermarks, multi-tier curriculum folders, and downloadable class notes.',
    category: 'Testing Environment',
    price: 999,
    originalPrice: 2999,
    bannerUrl:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=80',
    instructor: {
      name: 'Elevate Labs Faculty',
      designation: 'Master Educator',
      avatarUrl: '/assets/default-profile.svg',
    },
    validityDays: 365,
    startDate: 'Instant Access',
    rating: 5.0,
    enrolledStudentsCount: 1,
    isPublished: true,
  },
];

export const INITIAL_SUBJECTS: Subject[] = [
  {
    id: 'sub_testing_01',
    batchId: 'batch_testing_01',
    title: 'Testing Subject: Core Module',
    order: 1,
    color: '#0b57d0',
  },
];

export const INITIAL_CHAPTERS: Chapter[] = [
  {
    id: 'chap_testing_01',
    batchId: 'batch_testing_01',
    subjectId: 'sub_testing_01',
    title: 'Chapter 01: Video Cloaking & Player Verification',
    description: 'Testing video playback, dynamic watermarks and player controls',
    order: 1,
  },
  {
    id: 'chap_testing_02',
    batchId: 'batch_testing_01',
    subjectId: 'sub_testing_01',
    title: 'Chapter 02: Core Formulas & Practice Problems',
    description: 'Concept formulas, shortcut derivations, and practice DPP materials',
    order: 2,
  },
];

export const INITIAL_LECTURES: Lecture[] = [
  {
    id: 'lec_testing_01',
    batchId: 'batch_testing_01',
    subjectId: 'sub_testing_01',
    chapterId: 'chap_testing_01',
    title: 'Lecture 01: Test Video Stream (Unlisted Link Masking)',
    description:
      'Test lecture to observe the cloaked player in action. Notice that YouTube branding and links are hidden while custom speed, scrubber, and dynamic watermark are active.',
    durationMinutes: 15,
    videoSourceType: 'youtube',
    encryptedVideoId: obfuscateVideoKey('WUvTyaaNkzM'), // High quality visual sample video
    thumbnailUrl:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=80',
    order: 1,
    isFreePreview: false,
    pdfNotes: [
      {
        id: 'pdf_test_01',
        title: 'Handwritten DPP & Formula Chart.pdf',
        url: '#',
        size: '1.4 MB',
        pages: 5,
        type: 'pdf',
      },
      {
        id: 'img_test_01',
        title: 'High-Res Circuit Diagram & Core Concept Summary.png',
        url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
        size: '850 KB',
        type: 'image',
        previewImageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
      },
    ],
    milestones: [
      { id: 'm1', seconds: 0, title: '01. Intro & Overview' },
      { id: 'm2', seconds: 90, title: '02. Visual Demonstration' },
      { id: 'm3', seconds: 240, title: '03. Core Formula Derivation' },
      { id: 'm4', seconds: 480, title: '04. Numerical Analysis' },
      { id: 'm5', seconds: 720, title: '05. Summary & Recap' },
    ],
    createdAt: '2026-11-13',
  },
  {
    id: 'lec_testing_02',
    batchId: 'batch_testing_01',
    subjectId: 'sub_testing_01',
    chapterId: 'chap_testing_02',
    title: 'Lecture 02: Core Formulas & Derivation Workshop',
    description:
      'Detailed walkthrough of shortcut techniques and formula derivations for rapid exam solving.',
    durationMinutes: 18,
    videoSourceType: 'youtube',
    encryptedVideoId: obfuscateVideoKey('WUvTyaaNkzM'),
    thumbnailUrl:
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=500&auto=format&fit=crop&q=80',
    order: 1,
    isFreePreview: false,
    pdfNotes: [
      {
        id: 'pdf_test_02',
        title: 'Complete Formula Cheat Sheet - JEE/NEET.pdf',
        url: '#',
        size: '2.1 MB',
        pages: 8,
        type: 'pdf',
      },
      {
        id: 'img_test_02',
        title: 'Master Concept Mindmap & Flowchart.png',
        url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
        size: '1.2 MB',
        type: 'image',
        previewImageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80',
      },
    ],
    milestones: [
      { id: 'm2_1', seconds: 0, title: '01. Workshop Goals' },
      { id: 'm2_2', seconds: 120, title: '02. Formula Matrix' },
      { id: 'm2_3', seconds: 360, title: '03. Solved Practice Questions' },
      { id: 'm2_4', seconds: 600, title: '04. Recap' },
    ],
    createdAt: '2026-11-13',
  },
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann_test_1',
    title: '🚀 Elevate Labs: Testing Environment Active',
    message: 'Welcome to the clean testing sandbox. Only the Testing Batch is currently active.',
    date: 'Just now',
    isImportant: true,
  },
];

export const INITIAL_STUDENTS = [
  { id: 'usr_guest_001', name: 'Guest Student', email: 'guest@elevatelabs.in', phone: '9876543210' },
  { id: 'usr_std_002', name: 'Aarav Sharma', email: 'aarav.sharma@gmail.com', phone: '9812345678' },
  { id: 'usr_std_003', name: 'Ananya Verma', email: 'ananya.verma@outlook.com', phone: '9823456789' },
  { id: 'usr_std_004', name: 'Rohan Patel', email: 'rohan.patel@gmail.com', phone: '9834567890' },
  { id: 'usr_std_005', name: 'Isha Nair', email: 'isha.nair@yahoo.com', phone: '9845678901' },
];

export const INITIAL_ENROLLMENTS: BatchEnrollment[] = [];

export const INITIAL_BATCH_TESTS: BatchTestCard[] = [
  {
    testId: 'test_batch_mock_01',
    batchId: 'batch_testing_01',
    title: 'JEE Advanced Full Syllabus Mock 01',
    topic: 'Mathematics - Calculus, Vectors & 3D Geometry',
    questionCount: 30,
    timeLimitMinutes: 60,
    difficulty: 'hard',
    passingScorePercentage: 40,
    catalogChunkId: 'chunk_001',
    chunkEstimatedBytes: 85000,
    publishedAt: '2026-11-10',
  },
  {
    testId: 'test_batch_mock_02',
    batchId: 'batch_testing_01',
    title: 'Definite Integrals & Area under Curve Sprint',
    topic: 'Integral Calculus High Weightage',
    questionCount: 20,
    timeLimitMinutes: 45,
    difficulty: 'medium',
    passingScorePercentage: 50,
    catalogChunkId: 'chunk_001',
    chunkEstimatedBytes: 52000,
    publishedAt: '2026-11-12',
  },
];
