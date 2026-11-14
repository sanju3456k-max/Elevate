import { type ActiveTab } from '../types';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'lecture' | 'test' | 'ai' | 'notes' | 'system';
  timestamp: string;
  read: boolean;
  actionTab?: ActiveTab;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

const STORAGE_KEY = 'elevate_user_notifications_v1';
const NOTIFICATIONS_EVENT = 'elevate-notifications-updated';

const DEFAULT_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: 'New Video Lecture Available',
    message: 'Lecture 02: Core Formulas & Derivation Workshop is now live in your curriculum batch.',
    category: 'lecture',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45m ago
    read: false,
    actionTab: 'batches',
    actionLabel: 'Watch Lecture',
  },
  {
    id: 'notif-2',
    title: 'Live CBT Mock Assessment Active',
    message: 'JEE Advanced Full Mock Assessment (Mathematics) is ready. Timed mode and auto-analysis enabled.',
    category: 'test',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3h ago
    read: false,
    actionTab: 'tests',
    actionLabel: 'Start Mock Test',
  },
  {
    id: 'notif-3',
    title: 'Formula Study Repository Synced',
    message: 'Calculus and Coordinate Geometry quick-revision formula sheets synced to your Notes Studio.',
    category: 'notes',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(), // 18h ago
    read: true,
    actionTab: 'notes-repository',
    actionLabel: 'Open Notes Studio',
  },
  {
    id: 'notif-4',
    title: 'Theta AI Concept Recommendation',
    message: 'Strengthen Integration by Parts! Ask Theta AI to generate step-by-step practice variations.',
    category: 'ai',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), // Yesterday
    read: true,
    actionTab: 'chatbot',
    actionLabel: 'Ask Theta AI',
  },
  {
    id: 'notif-5',
    title: 'Offline OMR & Print Studio Upgrade',
    message: 'New high-contrast printable bubble sheets and instant camera grading available in OMR Studio.',
    category: 'system',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    read: true,
    actionTab: 'bulk-print',
    actionLabel: 'Explore OMR Studio',
  },
];

export function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NOTIFICATIONS));
      return DEFAULT_NOTIFICATIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_NOTIFICATIONS;
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export function saveNotifications(notifications: AppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
  } catch (err) {
    console.warn('Failed to save notifications to storage:', err);
  }
}

export function markNotificationAsRead(id: string): void {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
}

export function markAllNotificationsAsRead(): void {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
}

export function deleteNotification(id: string): void {
  const current = getStoredNotifications();
  const updated = current.filter((n) => n.id !== id);
  saveNotifications(updated);
}

export function clearAllNotifications(): void {
  saveNotifications([]);
}

export function resetDefaultNotifications(): void {
  saveNotifications(DEFAULT_NOTIFICATIONS);
}

export function getUnreadNotificationsCount(): number {
  const current = getStoredNotifications();
  return current.filter((n) => !n.read).length;
}

export { NOTIFICATIONS_EVENT };
