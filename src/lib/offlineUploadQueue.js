// src/lib/offlineUploadQueue.js
//
// IndexedDB-backed offline queue for prescription photo uploads.
// When online  → uploads directly to Supabase Storage bucket "prescriptions".
// When offline → saves { file (as ArrayBuffer), fileName, userId, timestamp }
//                into IndexedDB. A `window 'online'` listener drains the queue.

import { supabase } from "./supabaseClient";

const DB_NAME = "smriti_offline_queue";
const DB_VERSION = 1;
const STORE_NAME = "pending_uploads";

// ── Open (or create) the IndexedDB database ──────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Save a file to IndexedDB ──────────────────────────────────────────
async function saveToIndexedDB(file, userId, patientId = null, extraData = {}) {
  const db = await openDB();
  const arrayBuffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record = {
      fileName: file.name,
      fileType: file.type,
      fileData: arrayBuffer, // stored as ArrayBuffer in IDB
      userId,
      patientId,
      extraData,
      timestamp: Date.now(),
    };

    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
  });
}

// ── Upload a single file to Supabase Storage ──────────────────────────
async function uploadToSupabase(fileData, fileName, fileType, userId, patientId = null) {
  // Ensure we use the active authenticated user ID if available
  let activeUserId = userId;
  try {
    const { data: authData } = await supabase.auth.getSession();
    if (authData?.session?.user?.id) {
      activeUserId = authData.session.user.id;
    }
  } catch (err) {
    console.warn("[OfflineQueue] Could not inspect auth session:", err);
  }

  const userFolder = activeUserId || "public";
  const patientFolder = patientId ? `${patientId}/` : "";
  const sanitizedFileName = (fileName || "rx_image.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userFolder}/${patientFolder}${Date.now()}_${sanitizedFileName}`;

  // Reconstruct a Blob from the ArrayBuffer (or accept a raw File/Blob)
  const blob =
    fileData instanceof Blob
      ? fileData
      : new Blob([fileData], { type: fileType || "image/jpeg" });

  console.log(`[OfflineQueue] Attempting Supabase Storage upload to bucket 'prescriptions' at path: ${storagePath}`);

  const { data, error } = await supabase.storage
    .from("prescriptions")
    .upload(storagePath, blob, {
      contentType: fileType || "image/jpeg",
      upsert: true,
    });

  if (error) {
    console.error("[OfflineQueue] Supabase Storage upload error details:", {
      message: error.message,
      statusCode: error.statusCode,
      error: error.error,
      details: error.details,
      hint: error.hint,
      storagePath,
      bucket: "prescriptions",
    });
    throw error;
  }

  console.log("[OfflineQueue] Supabase Storage upload succeeded:", data);
  return data;
}

// ── Get all pending records from IndexedDB ────────────────────────────
async function getAllPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
  });
}

// ── Delete a single record by id ──────────────────────────────────────
async function deletePendingById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
  });
}

// ── Process the offline queue ─────────────────────────────────────────
// Called automatically when the browser comes online or manually.
// Returns { synced: number, failed: number, errors: Array }
export async function processOfflineQueue(onProgress) {
  const pending = await getAllPending();
  if (pending.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const record of pending) {
    try {
      await uploadToSupabase(
        record.fileData,
        record.fileName,
        record.fileType,
        record.userId,
        record.patientId
      );
      await deletePendingById(record.id);
      synced++;
      if (onProgress) onProgress({ synced, failed, total: pending.length });
    } catch (err) {
      console.error(`[OfflineQueue] Failed to sync record id=${record.id} (${record.fileName}):`, {
        error: err,
        message: err?.message,
        statusCode: err?.statusCode || err?.status,
        details: err?.details || err?.error,
      });
      errors.push({ id: record.id, fileName: record.fileName, error: err?.message || "Upload failed" });
      failed++;
    }
  }

  return { synced, failed, errors };
}

// ── Get count of pending uploads ──────────────────────────────────────
export async function getPendingCount() {
  const pending = await getAllPending();
  return pending.length;
}

// ── Main entry point: upload or queue ─────────────────────────────────
// Returns { status: "uploaded" | "queued", error?: string }
export async function uploadOrQueue(file, userId, patientId = null, extraData = {}) {
  if (!file) {
    return { status: "error", error: "Missing file" };
  }

  let effectiveUserId = userId;
  if (!effectiveUserId) {
    try {
      const { data: authData } = await supabase.auth.getSession();
      effectiveUserId = authData?.session?.user?.id;
    } catch (e) {
      console.warn("[OfflineQueue] Could not retrieve session userId:", e);
    }
  }

  if (navigator.onLine) {
    try {
      await uploadToSupabase(file, file.name, file.type, effectiveUserId, patientId);
      return { status: "uploaded" };
    } catch (err) {
      // Upload failed even though online — fall through to queue
      console.warn("[OfflineQueue] Online upload failed, saving to local queue instead:", {
        message: err.message,
        statusCode: err.statusCode,
        error: err.error,
      });
      try {
        await saveToIndexedDB(file, effectiveUserId, patientId, extraData);
        return { status: "queued", error: err.message };
      } catch (idbErr) {
        console.error("[OfflineQueue] Failed to save to IndexedDB fallback:", idbErr);
        return { status: "error", error: idbErr.message };
      }
    }
  } else {
    try {
      await saveToIndexedDB(file, effectiveUserId, patientId, extraData);
      return { status: "queued" };
    } catch (err) {
      console.error("[OfflineQueue] Failed to save offline item to IndexedDB:", err);
      return { status: "error", error: err.message };
    }
  }
}
