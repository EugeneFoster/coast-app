/**
 * Offline queue for markups, comments, and photos (IndexedDB).
 * Optimistic local IDs sync when back online.
 */

const DB_NAME = "coast-markup-queue";
const STORE = "pending";
const DB_VERSION = 1;

export type QueueOp =
  | {
      type: "create_markup";
      clientId: string;
      payload: {
        drawingId: string;
        version: number;
        pageNo: number;
        kind: "pin" | "area";
        x: number;
        y: number;
        w?: number | null;
        h?: number | null;
        title: string;
        commentBody: string;
        projectId: string;
      };
    }
  | {
      type: "add_comment";
      clientId: string;
      payload: {
        markupId: string;
        body: string;
        projectId: string;
      };
    }
  | {
      type: "upload_photo";
      clientId: string;
      payload: {
        markupId: string;
        filePath: string;
        projectId: string;
        blob: Blob;
        fileName: string;
        commentId?: string | null;
      };
    };

export type QueueItem = QueueOp & {
  id: string;
  createdAt: number;
  retries: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueMarkupOp(op: QueueOp): Promise<string> {
  const db = await openDb();
  const id = op.clientId;
  const item: QueueItem = { ...op, id, createdAt: Date.now(), retries: 0 };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function listPendingOps(): Promise<QueueItem[]> {
  const db = await openDb();
  const items = await new Promise<QueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueueItem[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingOp(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function onConnectivityChange(cb: (online: boolean) => void) {
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}
