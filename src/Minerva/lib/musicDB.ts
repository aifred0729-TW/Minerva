/**
 * IndexedDB storage for uploaded music tracks.
 * Audio blobs are too large for localStorage, so we use IndexedDB.
 */

const DB_NAME = 'minerva-music';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export interface MusicTrackRecord {
    id: string;
    name: string;
    blob: Blob;
    mimeType: string;
}

/** Save an audio blob under the given id. */
export async function saveTrack(record: MusicTrackRecord): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Retrieve an audio blob by id. Returns null if not found. */
export async function getTrack(id: string): Promise<MusicTrackRecord | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

/** Delete a track by id. */
export async function deleteTrack(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** List all track ids and names (without loading blobs into memory). */
export async function listTracks(): Promise<Array<{ id: string; name: string; mimeType: string }>> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
            const records: MusicTrackRecord[] = req.result;
            resolve(records.map(r => ({ id: r.id, name: r.name, mimeType: r.mimeType })));
        };
        req.onerror = () => reject(req.error);
    });
}
