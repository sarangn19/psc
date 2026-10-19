// Offline storage for Pocket mode.
//
// A dealt batch and its answers live here so a dead connection mid-session
// never loses work. Deliberately IndexedDB with no Service Worker: the app
// shell still needs the network once, but the session itself survives.

const DB_NAME = 'psc-pocket';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_QUEUE = 'queue';

export interface PocketQuestion {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  explanation?: string | null;
  difficulty?: string;
  tags?: string[];
  chapter: { name: string; subject: string };
  concept?: { id: number; level?: string; nameEnglish?: string } | null;
}

export interface PocketItem {
  id: string;
  order: number;
  clientId: string;
  question: PocketQuestion;
  answeredAt?: string | null;
  selectedOption?: number | null;
  isCorrect?: boolean | null;
}

export interface StoredSession {
  id: string;
  startedAt: string;
  batchSize: number;
  quota: number;
  tiers?: { preferred: number; fallback: number };
  items: PocketItem[];
  ended?: boolean;
}

export interface QueuedAnswer {
  clientId: string;
  sessionId: string;
  questionId: string;
  selectedOption: number;
  timeTaken: number;
  queuedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'clientId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null; // allow a retry rather than caching the failure
      reject(req.error ?? new Error('IndexedDB open failed.'));
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB open blocked.'));
    };
  });
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error(`${store} request failed.`));
      })
  );
}

// ---------- sessions ----------

export const saveSession = (session: StoredSession) =>
  request<undefined>(STORE_SESSIONS, 'readwrite', (s) => s.put(session));

export const loadSession = (id: string) =>
  request<StoredSession | undefined>(STORE_SESSIONS, 'readonly', (s) => s.get(id));

export const loadAnySession = () =>
  request<StoredSession[]>(STORE_SESSIONS, 'readonly', (s) => s.getAll()).then((all) =>
    (all ?? []).filter((s) => !s.ended).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  );

export const deleteSession = (id: string) =>
  request<undefined>(STORE_SESSIONS, 'readwrite', (s) => s.delete(id));

// ---------- answer queue ----------

export const enqueue = (entry: QueuedAnswer) =>
  request<undefined>(STORE_QUEUE, 'readwrite', (s) => s.put(entry));

export const loadQueue = () => request<QueuedAnswer[]>(STORE_QUEUE, 'readonly', (s) => s.getAll());

export const dequeue = (clientIds: string[]) =>
  openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        for (const id of clientIds) store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('queue cleanup failed.'));
      })
  );

export const queueSize = () => request<number>(STORE_QUEUE, 'readonly', (s) => s.count());
