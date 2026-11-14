import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import type { Batch, BatchEnrollment, Chapter, Lecture } from '../lms/types';
import { INITIAL_BATCHES } from '../lms/initialData';
import { obfuscateVideoKey } from '../lms/security';

export const cleanKeyForFirestore = (str: string): string => {
  return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
};

/**
 * 1. Sync a batch to Cloud Firestore: /batches/{batchId}
 * Also initializes the authoritative roster document: /batches/{batchId}/access/roster
 */
export async function syncBatchToFirestore(batch: Batch): Promise<{ success: boolean; error?: string }> {
  if (!batch || !batch.id) return { success: false, error: 'Invalid batch structure' };
  try {
    const batchRef = doc(db, 'batches', batch.id);
    const now = new Date().toISOString();
    const batchData = sanitizeForFirestore({
      ...batch,
      updatedAt: now,
      createdAt: (batch as any).createdAt || now,
    });
    await setDoc(batchRef, batchData, { merge: true });

    // Initialize the authoritative roster document in the batch collection hierarchy
    try {
      const rosterRef = doc(db, 'batches', batch.id, 'access', 'roster');
      const rosterSnap = await getDoc(rosterRef);
      if (!rosterSnap.exists()) {
        await setDoc(rosterRef, sanitizeForFirestore({
          batchId: batch.id,
          batchTitle: batch.title,
          totalStudents: 0,
          allowedEmails: [],
          allowedPhones: [],
          allowedUids: [],
          students: {},
          createdAt: now,
          updatedAt: now,
        }));
      }
    } catch (rosterErr) {
      console.warn('Roster document initialization notice:', rosterErr);
    }

    // Initialize starter curriculum if none exists
    try {
      const chapCol = collection(db, 'batches', batch.id, 'chapters');
      const chapSnap = await getDocs(chapCol);
      if (chapSnap.empty) {
        const starterChapId = `chap_${batch.id}_01`;
        const starterLecId = `lec_${batch.id}_01`;
        const starterChap: Chapter = {
          id: starterChapId,
          batchId: batch.id,
          subjectId: 'sub_math_01',
          title: 'Chapter 01: Concept Mastery & Foundation',
          description: `Core curriculum module with video lessons and study materials for ${batch.title}.`,
          order: 1,
        };
        const starterLec: Lecture = {
          id: starterLecId,
          batchId: batch.id,
          subjectId: 'sub_math_01',
          chapterId: starterChapId,
          title: 'Lecture 01: Course Orientation & Core Problem Solving',
          description: 'Comprehensive coaching lecture covering foundational derivations, problem-solving shortcuts, and formula charts.',
          durationMinutes: 45,
          videoSourceType: 'youtube',
          encryptedVideoId: obfuscateVideoKey('WUvTyaaNkzM'), // High quality visual sample video key
          thumbnailUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=80',
          order: 1,
          isFreePreview: false,
          pdfNotes: [
            {
              id: `pdf_${Date.now()}`,
              title: `${batch.title} - Chapter 01 DPP & Formula Notes.pdf`,
              url: '#',
              size: '1.8 MB',
              pages: 6,
              type: 'pdf',
            },
          ],
          milestones: [
            { id: 'm1', seconds: 0, title: '01. Lecture Roadmap & Key Formulae' },
            { id: 'm2', seconds: 180, title: '02. Step-by-Step Derivation' },
            { id: 'm3', seconds: 480, title: '03. Exam Pattern Question Solving' },
          ],
          faculty: {
            name: batch.instructor?.name || 'Sanju Kumar',
            designation: batch.instructor?.designation || 'Master Faculty',
            avatarUrl: batch.instructor?.avatarUrl || '',
          },
          createdAt: now,
        };
        await syncChapterToFirestore(batch.id, starterChap);
        await syncLectureToFirestore(batch.id, starterLec);
      }
    } catch (curricErr) {
      console.warn('Starter curriculum initialization notice:', curricErr);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to sync batch to Firestore:', error);
    return { success: false, error: error?.message || 'Firestore batch write failed' };
  }
}

/**
 * 2. Delete a batch from Cloud Firestore: /batches/{batchId}
 */
export async function deleteBatchFromFirestore(batchId: string): Promise<void> {
  if (!batchId) return;
  try {
    const batchRef = doc(db, 'batches', batchId);
    await deleteDoc(batchRef);
  } catch (error) {
    console.warn('Failed to delete batch from Firestore:', error);
  }
}

/**
 * 3. Fetch all active published batches from Cloud Firestore
 */
export async function fetchBatchesFromFirestore(): Promise<Batch[]> {
  try {
    const batchesCol = collection(db, 'batches');
    const snap = await getDocs(batchesCol);
    if (!snap.empty) {
      const cloudBatches: Batch[] = [];
      snap.forEach((d) => {
        const data = d.data();
        cloudBatches.push({
          id: d.id,
          title: data.title || 'Coaching Batch',
          tagline: data.tagline || '',
          description: data.description || '',
          category: data.category || 'Coaching',
          price: Number(data.price) || 0,
          originalPrice: Number(data.originalPrice) || Number(data.price) || 0,
          bannerUrl: data.bannerUrl || '',
          thumbnailUrl: data.thumbnailUrl || data.bannerUrl || '',
          instructor: {
            name: data.instructor?.name || 'Sanju Kumar',
            designation: data.instructor?.designation || 'Master Faculty',
            avatarUrl: data.instructor?.avatarUrl || '',
          },
          validityDays: Number(data.validityDays) || 365,
          startDate: data.startDate || new Date().toISOString(),
          rating: Number(data.rating) || 5.0,
          enrolledStudentsCount: Number(data.enrolledStudentsCount) || 0,
          isPublished: data.isPublished !== false,
          allowGuestAccess: !!data.allowGuestAccess,
        });
      });
      return cloudBatches;
    }
  } catch (error) {
    console.warn('Failed to fetch batches from Firestore, using initial fallback:', error);
  }
  return INITIAL_BATCHES;
}

/**
 * 4. Enroll student in Cloud Firestore:
 * Writes to top-level /batch_enrollments and batch-scoped /batches/{batchId}/enrollments
 */
export async function enrollStudentInFirestore(params: {
  batchId: string;
  batchTitle?: string;
  contact: string;
  name?: string;
  validityDays?: number;
}): Promise<{ success: boolean; enrollment: BatchEnrollment; error?: string }> {
  const { batchId, batchTitle = 'Batch', contact, name, validityDays = 365 } = params;
  const cleanedContact = contact.trim().toLowerCase();
  const isEmail = cleanedContact.includes('@');
  const cleanContactKey = cleanKeyForFirestore(cleanedContact);
  const enrollmentKey = `${batchId}__${cleanContactKey}`;

  const studentName = name?.trim() || (isEmail ? cleanedContact.split('@')[0] : `Student ${cleanedContact.slice(-4)}`);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const enrollmentRecord: BatchEnrollment = {
    id: enrollmentKey,
    batchId,
    userId: `usr_${cleanContactKey}`,
    studentName,
    studentEmail: isEmail ? cleanedContact : undefined,
    studentPhone: !isEmail ? cleanedContact : undefined,
    enrolledAt: now.split('T')[0],
    expiresAt,
    status: 'active',
  };

  try {
    const firestoreData = sanitizeForFirestore({
      ...enrollmentRecord,
      batchTitle,
      updatedAt: now,
    });

    // 1. Fast Global Index: /batch_enrollments/{batchId}__{studentEmailSafe}
    await setDoc(doc(db, 'batch_enrollments', enrollmentKey), firestoreData, { merge: true });

    // 2. Batch-scoped Roster: /batches/{batchId}/enrollments/{studentEmailSafe}
    await setDoc(doc(db, 'batches', batchId, 'enrollments', cleanContactKey), firestoreData, { merge: true });

    // 3. Authoritative Batch Roster Manifest Document: /batches/{batchId}/access/roster
    try {
      const rosterRef = doc(db, 'batches', batchId, 'access', 'roster');
      const rosterSnap = await getDoc(rosterRef).catch(() => null);
      const existingRoster = rosterSnap?.exists() ? rosterSnap.data() : {};
      const existingEmails: string[] = Array.isArray(existingRoster?.allowedEmails) ? existingRoster.allowedEmails : [];
      const existingPhones: string[] = Array.isArray(existingRoster?.allowedPhones) ? existingRoster.allowedPhones : [];
      const existingStudents = (existingRoster?.students && typeof existingRoster.students === 'object') ? existingRoster.students : {};

      const updatedEmails = isEmail && !existingEmails.includes(cleanedContact)
        ? [...existingEmails, cleanedContact]
        : existingEmails;
      const updatedPhones = !isEmail && !existingPhones.includes(cleanedContact)
        ? [...existingPhones, cleanedContact]
        : existingPhones;

      const studentMapEntry = {
        id: enrollmentKey,
        studentName,
        studentEmail: isEmail ? cleanedContact : null,
        studentPhone: !isEmail ? cleanedContact : null,
        enrolledAt: now.split('T')[0],
        expiresAt,
        validityDays,
        status: 'active',
      };

      const updatedRoster = sanitizeForFirestore({
        batchId,
        batchTitle,
        updatedAt: now,
        totalStudents: Object.keys(existingStudents).length + (existingStudents[cleanContactKey] ? 0 : 1),
        allowedEmails: updatedEmails,
        allowedPhones: updatedPhones,
        students: {
          ...existingStudents,
          [cleanContactKey]: studentMapEntry,
        },
      });

      await setDoc(rosterRef, updatedRoster, { merge: true });
    } catch (rosterErr) {
      console.warn('Batch access roster update notice:', rosterErr);
    }

    // 4. Increment batch student count in Firestore
    try {
      const batchRef = doc(db, 'batches', batchId);
      const batchSnap = await getDoc(batchRef);
      if (batchSnap.exists()) {
        const curCount = Number(batchSnap.data().enrolledStudentsCount) || 0;
        await updateDoc(batchRef, { enrolledStudentsCount: curCount + 1, updatedAt: now });
      } else {
        await setDoc(batchRef, sanitizeForFirestore({
          id: batchId,
          title: batchTitle,
          enrolledStudentsCount: 1,
          updatedAt: now,
          createdAt: now,
          isPublished: true,
        }), { merge: true });
      }
    } catch (countErr) {
      console.warn('Batch student count update notice:', countErr);
    }

    // 5. Update student's user profile if registered
    if (isEmail) {
      try {
        const userQ = query(collection(db, 'users'), where('email', '==', cleanedContact));
        const userSnap = await getDocs(userQ);
        userSnap.forEach(async (uDoc) => {
          await updateDoc(doc(db, 'users', uDoc.id), {
            enrolledBatchIds: arrayUnion(batchId),
          }).catch(() => {});
        });
      } catch {}
    }

    return { success: true, enrollment: enrollmentRecord };
  } catch (error: any) {
    console.error('Failed to commit enrollment to Cloud Firestore:', error);
    return { success: false, enrollment: enrollmentRecord, error: error?.message || String(error) };
  }
}

/**
 * 5. Revoke student access in Cloud Firestore (Exhaustive & Permanent)
 */
export async function revokeStudentInFirestore(batchId: string, contact: string): Promise<void> {
  const cleanedContact = (contact || '').trim().toLowerCase();
  if (!batchId || !cleanedContact) return;

  const isEmail = cleanedContact.includes('@');
  const cleanContactKey = cleanKeyForFirestore(cleanedContact);
  const enrollmentKey = `${batchId}__${cleanContactKey}`;
  const now = new Date().toISOString();

  try {
    // 1. Delete from fast global index (/batch_enrollments)
    await deleteDoc(doc(db, 'batch_enrollments', enrollmentKey)).catch(() => {});

    // Secondary cleanup: query batch_enrollments to ensure any record for this batch & contact is wiped
    try {
      const qCol = collection(db, 'batch_enrollments');
      const q = isEmail
        ? query(qCol, where('batchId', '==', batchId), where('studentEmail', '==', cleanedContact))
        : query(qCol, where('batchId', '==', batchId), where('studentPhone', '==', cleanedContact));
      const qSnap = await getDocs(q);
      for (const d of qSnap.docs) {
        await deleteDoc(doc(db, 'batch_enrollments', d.id)).catch(() => {});
      }
    } catch (cleanErr) {
      console.warn('batch_enrollments secondary purge notice:', cleanErr);
    }

    // 2. Delete from batch subcollection (/batches/{batchId}/enrollments)
    await deleteDoc(doc(db, 'batches', batchId, 'enrollments', cleanContactKey)).catch(() => {});

    // 3. Update authoritative batch roster manifest (/batches/{batchId}/access/roster)
    let remainingCount = 0;
    try {
      const rosterRef = doc(db, 'batches', batchId, 'access', 'roster');
      const rosterSnap = await getDoc(rosterRef).catch(() => null);
      if (rosterSnap?.exists()) {
        const existingRoster = rosterSnap.data() || {};
        const existingEmails: string[] = Array.isArray(existingRoster?.allowedEmails) ? existingRoster.allowedEmails : [];
        const existingPhones: string[] = Array.isArray(existingRoster?.allowedPhones) ? existingRoster.allowedPhones : [];
        const existingStudents = (existingRoster?.students && typeof existingRoster.students === 'object')
          ? { ...existingRoster.students }
          : {};

        // Case-insensitive filtering
        const updatedEmails = existingEmails.filter((e) => e && e.toLowerCase().trim() !== cleanedContact);
        const updatedPhones = existingPhones.filter((p) => p && p.trim() !== cleanedContact);

        // Purge student from map
        delete existingStudents[cleanContactKey];
        Object.keys(existingStudents).forEach((k) => {
          const s = existingStudents[k];
          if (
            (s?.studentEmail && s.studentEmail.toLowerCase().trim() === cleanedContact) ||
            (s?.studentPhone && s.studentPhone.trim() === cleanedContact) ||
            s?.userId === contact
          ) {
            delete existingStudents[k];
          }
        });

        remainingCount = Object.keys(existingStudents).length;

        await setDoc(
          rosterRef,
          sanitizeForFirestore({
            ...existingRoster,
            batchId,
            allowedEmails: updatedEmails,
            allowedPhones: updatedPhones,
            students: existingStudents,
            totalStudents: remainingCount,
            updatedAt: now,
          })
        );
      }
    } catch (rErr) {
      console.warn('Roster revoke update notice:', rErr);
    }

    // 4. Update batch student count in Firestore (/batches/{batchId})
    try {
      const batchRef = doc(db, 'batches', batchId);
      const batchSnap = await getDoc(batchRef).catch(() => null);
      if (batchSnap?.exists()) {
        await updateDoc(batchRef, { enrolledStudentsCount: remainingCount, updatedAt: now }).catch(() => {});
      }
    } catch (countErr) {
      console.warn('Batch count update notice:', countErr);
    }

    // 5. Purge batchId from student's user profile document in Firestore (/users)
    try {
      const usersCol = collection(db, 'users');
      const userQ = isEmail
        ? query(usersCol, where('email', '==', cleanedContact))
        : query(usersCol, where('phone', '==', cleanedContact));
      const userSnap = await getDocs(userQ);
      for (const uDoc of userSnap.docs) {
        await updateDoc(doc(db, 'users', uDoc.id), {
          enrolledBatchIds: arrayRemove(batchId),
          updatedAt: now,
        }).catch(() => {});
      }
    } catch (userErr) {
      console.warn('Student user doc batch revocation notice:', userErr);
    }
  } catch (error) {
    console.warn('Failed to revoke enrollment in Firestore:', error);
  }
}

/**
 * 6. Fetch student enrollments from Cloud Firestore by email or phone (1 Read Query)
 */
export async function fetchStudentEnrollmentsFromFirestore(
  email?: string | null,
  phone?: string | null
): Promise<{ batchIds: string[]; enrollments: BatchEnrollment[] }> {
  const cleanEmail = email ? email.toLowerCase().trim() : null;
  const cleanPhone = phone ? phone.trim() : null;

  if (!cleanEmail && !cleanPhone) {
    return { batchIds: [], enrollments: [] };
  }

  try {
    const batchEnrollmentsCol = collection(db, 'batch_enrollments');
    const matchedEnrollments: BatchEnrollment[] = [];
    const matchedBatchIds = new Set<string>();

    if (cleanEmail) {
      const qEmail = query(
        batchEnrollmentsCol,
        where('studentEmail', '==', cleanEmail),
        where('status', '==', 'active')
      );
      const snap = await getDocs(qEmail);
      snap.forEach((d) => {
        const data = d.data();
        matchedBatchIds.add(data.batchId);
        matchedEnrollments.push({
          id: d.id,
          batchId: data.batchId,
          userId: data.userId || `usr_${cleanKeyForFirestore(cleanEmail)}`,
          studentName: data.studentName || cleanEmail.split('@')[0],
          studentEmail: data.studentEmail || cleanEmail,
          studentPhone: data.studentPhone,
          enrolledAt: data.enrolledAt || new Date().toISOString(),
          expiresAt: data.expiresAt,
          status: 'active',
        });
      });
    }

    if (cleanPhone) {
      const qPhone = query(
        batchEnrollmentsCol,
        where('studentPhone', '==', cleanPhone),
        where('status', '==', 'active')
      );
      const snap = await getDocs(qPhone);
      snap.forEach((d) => {
        const data = d.data();
        matchedBatchIds.add(data.batchId);
        matchedEnrollments.push({
          id: d.id,
          batchId: data.batchId,
          userId: data.userId || `usr_${cleanKeyForFirestore(cleanPhone)}`,
          studentName: data.studentName || cleanPhone,
          studentEmail: data.studentEmail,
          studentPhone: data.studentPhone || cleanPhone,
          enrolledAt: data.enrolledAt || new Date().toISOString(),
          expiresAt: data.expiresAt,
          status: 'active',
        });
      });
    }

    return {
      batchIds: Array.from(matchedBatchIds),
      enrollments: matchedEnrollments,
    };
  } catch (error) {
    console.warn('Error reading student enrollments from Firestore:', error);
    return { batchIds: [], enrollments: [] };
  }
}

/**
 * 6b. Fetch ALL active enrollments across all batches for Master Admin
 */
export async function fetchAllEnrollmentsFromFirestore(): Promise<BatchEnrollment[]> {
  try {
    const snap = await getDocs(collection(db, 'batch_enrollments'));
    const result: BatchEnrollment[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === 'active') {
        result.push({
          id: d.id,
          batchId: data.batchId,
          userId: data.userId || d.id,
          studentName: data.studentName || 'Student',
          studentEmail: data.studentEmail,
          studentPhone: data.studentPhone,
          enrolledAt: data.enrolledAt || new Date().toISOString(),
          expiresAt: data.expiresAt,
          status: 'active',
        });
      }
    });
    return result;
  } catch (err) {
    console.warn('Failed to fetch all enrollments from Firestore:', err);
    return [];
  }
}

/**
 * 7. Fetch all active enrollments for a specific batch:
 * First attempts 1-read fetch from /batches/{batchId}/access/roster,
 * then falls back to /batches/{batchId}/enrollments subcollection.
 */
export async function fetchBatchEnrollmentsFromFirestore(batchId: string): Promise<BatchEnrollment[]> {
  if (!batchId) return [];
  try {
    // 1. Try reading the authoritative roster document first (1 Document Read)
    try {
      const rosterRef = doc(db, 'batches', batchId, 'access', 'roster');
      const rosterSnap = await getDoc(rosterRef);
      if (rosterSnap.exists()) {
        const rData = rosterSnap.data();
        if (rData && rData.students && typeof rData.students === 'object') {
          const list: BatchEnrollment[] = [];
          Object.values(rData.students).forEach((s: any) => {
            if (s && s.status === 'active') {
              list.push({
                id: s.id || `enr_${batchId}_${s.studentEmail || s.studentPhone}`,
                batchId,
                userId: s.userId || s.id || `usr_${s.studentEmail || s.studentPhone}`,
                studentName: s.studentName || 'Student',
                studentEmail: s.studentEmail || undefined,
                studentPhone: s.studentPhone || undefined,
                enrolledAt: s.enrolledAt || new Date().toISOString(),
                expiresAt: s.expiresAt,
                status: 'active',
              });
            }
          });
          if (list.length > 0) return list;
        }
      }
    } catch (rosterErr) {
      console.warn(`Roster read fallback for batch ${batchId}:`, rosterErr);
    }

    // 2. Subcollection fallback
    const enrollmentsCol = collection(db, 'batches', batchId, 'enrollments');
    const snap = await getDocs(enrollmentsCol);
    const result: BatchEnrollment[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === 'active') {
        result.push({
          id: d.id,
          batchId: data.batchId || batchId,
          userId: data.userId || d.id,
          studentName: data.studentName || 'Student',
          studentEmail: data.studentEmail,
          studentPhone: data.studentPhone,
          enrolledAt: data.enrolledAt || new Date().toISOString(),
          expiresAt: data.expiresAt,
          status: 'active',
        });
      }
    });
    return result;
  } catch (error) {
    console.warn(`Error fetching enrollments for batch ${batchId}:`, error);
    return [];
  }
}

/**
 * 8. Sync Batch Chapters & Lectures to Cloud Firestore:
 * /batches/{batchId}/chapters and /batches/{batchId}/lectures
 */
export async function syncChapterToFirestore(batchId: string, chapter: Chapter): Promise<void> {
  if (!batchId || !chapter?.id) return;
  try {
    await setDoc(doc(db, 'batches', batchId, 'chapters', chapter.id), sanitizeForFirestore(chapter), { merge: true });
  } catch (error) {
    console.warn(`Failed to sync chapter ${chapter.id} for batch ${batchId}:`, error);
  }
}

export async function deleteChapterFromFirestore(batchId: string, chapterId: string): Promise<void> {
  if (!batchId || !chapterId) return;
  try {
    await deleteDoc(doc(db, 'batches', batchId, 'chapters', chapterId));
  } catch (error) {
    console.warn(`Failed to delete chapter ${chapterId} for batch ${batchId}:`, error);
  }
}

export async function syncLectureToFirestore(batchId: string, lecture: Lecture): Promise<void> {
  if (!batchId || !lecture?.id) return;
  try {
    await setDoc(doc(db, 'batches', batchId, 'lectures', lecture.id), sanitizeForFirestore(lecture), { merge: true });
  } catch (error) {
    console.warn(`Failed to sync lecture ${lecture.id} for batch ${batchId}:`, error);
  }
}

export async function deleteLectureFromFirestore(batchId: string, lectureId: string): Promise<void> {
  if (!batchId || !lectureId) return;
  try {
    await deleteDoc(doc(db, 'batches', batchId, 'lectures', lectureId));
  } catch (error) {
    console.warn(`Failed to delete lecture ${lectureId} for batch ${batchId}:`, error);
  }
}

/**
 * 9. Fetch curriculum (chapters and lectures) for a specific batch from Cloud Firestore
 */
export async function fetchBatchCurriculumFromFirestore(
  batchId: string
): Promise<{ chapters: Chapter[]; lectures: Lecture[] }> {
  if (!batchId) return { chapters: [], lectures: [] };
  try {
    const chaptersSnap = await getDocs(collection(db, 'batches', batchId, 'chapters'));
    const cloudChapters: Chapter[] = [];
    chaptersSnap.forEach((d) => {
      const data = d.data();
      cloudChapters.push({
        id: d.id,
        batchId,
        subjectId: data.subjectId || 'sub_math_01',
        title: data.title || 'Chapter',
        description: data.description || '',
        order: Number(data.order) || 1,
        testIds: data.testIds || [],
      });
    });

    const lecturesSnap = await getDocs(collection(db, 'batches', batchId, 'lectures'));
    const cloudLectures: Lecture[] = [];
    lecturesSnap.forEach((d) => {
      const data = d.data();
      cloudLectures.push({
        id: d.id,
        batchId,
        subjectId: data.subjectId || 'sub_math_01',
        chapterId: data.chapterId || '',
        title: data.title || 'Lecture',
        description: data.description || '',
        durationMinutes: Number(data.durationMinutes) || 45,
        videoSourceType: data.videoSourceType || 'youtube',
        encryptedVideoId: data.encryptedVideoId || '',
        thumbnailUrl: data.thumbnailUrl || '',
        order: Number(data.order) || 1,
        isFreePreview: !!data.isFreePreview,
        pdfNotes: data.pdfNotes || [],
        notes: data.notes || [],
        milestones: data.milestones || [],
        faculty: data.faculty,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    });

    // Detect any lectures with unmapped chapter IDs and auto-synthesize their folders
    const existingChapterIds = new Set(cloudChapters.map((c) => c.id));
    const missingChapterIds = new Set<string>();
    cloudLectures.forEach((l) => {
      if (l.chapterId && !existingChapterIds.has(l.chapterId)) {
        missingChapterIds.add(l.chapterId);
      }
    });

    if (missingChapterIds.size > 0) {
      let nextOrder = cloudChapters.length + 1;
      for (const missingId of missingChapterIds) {
        const matchingLecs = cloudLectures.filter((l) => l.chapterId === missingId);
        const folderTitle = matchingLecs[0]?.title
          ? `Chapter 0${nextOrder}: ${matchingLecs[0].title}`
          : `Chapter 0${nextOrder}: Core Lessons & Problem Solving`;

        const fallbackChapter: Chapter = {
          id: missingId,
          batchId,
          subjectId: 'sub_math_01',
          title: folderTitle,
          description: `Curriculum module and video lessons for this batch.`,
          order: nextOrder++,
          testIds: [],
        };
        cloudChapters.push(fallbackChapter);
        // Persist to Cloud Firestore so it is permanently synchronized
        syncChapterToFirestore(batchId, fallbackChapter).catch(() => {});
      }
    }

    return {
      chapters: cloudChapters.sort((a, b) => a.order - b.order),
      lectures: cloudLectures.sort((a, b) => a.order - b.order),
    };
  } catch (error) {
    console.warn(`Failed to fetch curriculum for batch ${batchId}:`, error);
    return { chapters: [], lectures: [] };
  }
}

/**
 * 10. Sync Batch Test Card to Cloud Firestore:
 * /batches/{batchId}/tests/{testId}
 */
export async function syncBatchTestToFirestore(batchId: string, testCard: any): Promise<void> {
  if (!batchId || !testCard?.testId) return;
  try {
    const testRef = doc(db, 'batches', batchId, 'tests', testCard.testId);
    await setDoc(testRef, sanitizeForFirestore(testCard), { merge: true });
  } catch (err) {
    console.warn('Failed to sync batch test:', err);
  }
}

/**
 * 11. Fetch All Tests authored for a specific batch from Cloud Firestore
 */
export async function fetchBatchTestsFromFirestore(batchId: string): Promise<any[]> {
  if (!batchId) return [];
  try {
    const snap = await getDocs(collection(db, 'batches', batchId, 'tests'));
    const list: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        testId: d.id,
        batchId,
        title: data.title || 'Batch Assessment Test',
        topic: data.topic || 'Curriculum Practice',
        questionCount: Number(data.questionCount) || 30,
        timeLimitMinutes: Number(data.timeLimitMinutes) || 60,
        difficulty: data.difficulty || 'medium',
        passingScorePercentage: Number(data.passingScorePercentage) || 40,
        catalogChunkId: data.catalogChunkId || 'chunk_1',
        chunkEstimatedBytes: Number(data.chunkEstimatedBytes) || 1024,
        publishedAt: data.publishedAt || new Date().toISOString(),
      });
    });
    return list;
  } catch (err) {
    console.warn(`Failed to fetch tests for batch ${batchId}:`, err);
    return [];
  }
}

export async function syncBatchCurriculumToFirestore(
  batchId: string,
  chapters: Chapter[],
  lectures: Lecture[]
): Promise<void> {
  if (!batchId) return;
  try {
    // Sync chapters
    for (const chap of chapters.filter((c) => c.batchId === batchId)) {
      await syncChapterToFirestore(batchId, chap);
    }
    // Sync lectures
    for (const lec of lectures.filter((l) => l.batchId === batchId)) {
      await syncLectureToFirestore(batchId, lec);
    }
  } catch (error) {
    console.warn(`Failed to sync curriculum for batch ${batchId}:`, error);
  }
}
