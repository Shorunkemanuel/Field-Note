import type { AIExtraction, LocalCapture } from "../types";

const DATABASE_NAME = "field-note-local";
const DATABASE_VERSION = 1;
const CAPTURES_STORE = "captures";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CAPTURES_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local capture storage."));
    request.onblocked = () => reject(new Error("Local capture storage is blocked by another tab."));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local capture storage transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local capture storage transaction failed."));
  });
}

export async function saveLocalCapture(capture: LocalCapture): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CAPTURES_STORE, "readwrite");
    const completion = waitForTransaction(transaction);
    transaction.objectStore(CAPTURES_STORE).put(capture);
    await completion;
  } finally {
    database.close();
  }
}

export async function getLocalCapture(id: string): Promise<LocalCapture | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CAPTURES_STORE, "readonly");
    const completion = waitForTransaction(transaction);
    const request = transaction.objectStore(CAPTURES_STORE).get(id) as IDBRequest<LocalCapture | undefined>;
    const [capture] = await Promise.all([
      new Promise<LocalCapture | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Could not read the local capture."));
      }),
      completion,
    ]);
    return capture ?? null;
  } finally {
    database.close();
  }
}

export async function saveLocalExtraction(
  id: string,
  extraction: AIExtraction,
): Promise<LocalCapture> {
  const capture = await getLocalCapture(id);
  if (!capture) {
    throw new Error("The saved field note could not be found.");
  }
  const updated = { ...capture, ai_extraction: extraction };
  await saveLocalCapture(updated);
  return updated;
}

export async function listLocalCaptures(): Promise<LocalCapture[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(CAPTURES_STORE, "readonly");
    const completion = waitForTransaction(transaction);
    const request = transaction.objectStore(CAPTURES_STORE).getAll() as IDBRequest<LocalCapture[]>;
    const [captures] = await Promise.all([
      new Promise<LocalCapture[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Could not read local captures."));
      }),
      completion,
    ]);
    return captures.sort((left, right) => right.created_at.localeCompare(left.created_at));
  } finally {
    database.close();
  }
}
