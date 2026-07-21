"use client";

/**
 * useScanSession — the zero-data-loss core of the phone scanner.
 *
 * Durability model (see features/pdf/FEATURE.md → Scanner):
 * - Every capture/pick uploads IMMEDIATELY via `fileHandler.upload` to the
 *   hidden `system-files/scanner/{sessionId}` folder — durable server-side
 *   the moment the upload resolves, invisible in the user's tree/Recents
 *   (established `system-files/` provenance convention).
 * - The session manifest (ordered items, crops, rotations, label) syncs
 *   to localStorage whenever it changes. Reopening the scanner with an
 *   unsaved manifest offers "Resume previous scan".
 * - The only loss window is capture → upload-complete; per-item status
 *   with retry makes it visible, and Save blocks until everything is
 *   `uploaded`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { CloudFolders, fileHandler } from "@/features/files";
import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";

import type {
  Quad,
  ScanEnhanceMode,
  ScanItem,
  ScanItemSource,
  ScanManifestItem,
  ScanRotation,
  ScanSessionManifest,
} from "./types";

const STORAGE_KEY = "pdf-scanner:active-session";

function readManifest(): ScanSessionManifest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanSessionManifest;
    if (parsed?.version !== 1 || !parsed.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeManifest(manifest: ScanSessionManifest | null) {
  if (typeof window === "undefined") return;
  try {
    if (!manifest) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
    }
  } catch {
    // Quota/private-mode failures degrade resume, never capture.
  }
}

function toManifestItems(items: ScanItem[]): ScanManifestItem[] {
  return items
    .filter((i): i is ScanItem & { fileId: string } => Boolean(i.fileId))
    .map((i) => ({
      itemId: i.itemId,
      fileId: i.fileId,
      kind: i.kind,
      source: i.source,
      fileName: i.fileName,
      label: i.label,
      mimeType: i.mimeType,
      quad: i.quad,
      rotation: i.rotation,
      enhance: i.enhance,
      enhancedFileId: i.enhancedFileId,
    }));
}

export interface UseScanSessionResult {
  sessionId: string;
  items: ScanItem[];
  label: string;
  setLabel: (label: string) => void;
  /** Unsaved manifest from a previous visit, if any — offer resume. */
  resumable: ScanSessionManifest | null;
  resume: () => void;
  dismissResume: () => void;
  /** Add picked/dropped files (photos, PDFs, anything the pipeline takes). */
  addFiles: (files: File[]) => void;
  /** Add a camera shot (JPEG Blob from the capture pipeline). */
  addCapture: (blob: Blob) => void;
  retryItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  /** dnd-kit reorder: move item `activeId` to `overId`'s position. */
  moveItem: (activeId: string, overId: string) => void;
  setQuad: (itemId: string, quad: Quad | null | undefined) => void;
  setRotation: (itemId: string, rotation: ScanRotation) => void;
  /** Rename an item (display label; persisted in the manifest). */
  setItemLabel: (itemId: string, itemLabel: string) => void;
  /** Record an enhance result (mode undefined = back to original). */
  setEnhance: (
    itemId: string,
    enhance: ScanEnhanceMode | undefined,
    enhancedFileId?: string,
  ) => void;
  /** All items durable — Save may proceed. */
  allUploaded: boolean;
  uploadingCount: number;
  errorCount: number;
  /** Wipe the session after a successful save (files belong to the PDF now). */
  clearAfterSave: () => void;
  /** Discard the session AND delete its hidden uploads. */
  discard: () => Promise<void>;
}

export function useScanSession(): UseScanSessionResult {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState<ScanItem[]>([]);
  const [label, setLabel] = useState("");
  // Read synchronously at mount (client-only surface, ssr:false) so the
  // persist effect below can never race the resume offer.
  const [resumable, setResumable] = useState<ScanSessionManifest | null>(() => {
    const existing = readManifest();
    return existing && existing.items.length > 0 ? existing : null;
  });

  // Raw File objects for retry — session-local (a reload loses them, which
  // is exactly the visible "error → gone after reload" loss window).
  const pendingFilesRef = useRef(new Map<string, File>());
  // Object URLs we created, revoked on remove/clear.
  const blobUrlsRef = useRef(new Map<string, string>());
  const shotCounterRef = useRef(0);

  // Sync the manifest to localStorage — the sanctioned external-system
  // effect. Writes only when the session has content; explicit clears
  // (save / discard) remove the key so an untouched visit can never
  // clobber a resumable manifest.
  useEffect(() => {
    if (items.length === 0) return;
    writeManifest({
      version: 1,
      sessionId,
      createdAt: new Date().toISOString(),
      label,
      items: toManifestItems(items),
    });
  }, [items, label, sessionId]);

  const resume = useCallback(() => {
    if (!resumable) return;
    setSessionId(resumable.sessionId);
    setLabel(resumable.label);
    setItems(
      resumable.items.map((m) => ({
        itemId: m.itemId,
        fileId: m.fileId,
        kind: m.kind,
        source: m.source ?? "file",
        fileName: m.fileName,
        label: m.label,
        mimeType: m.mimeType,
        status: "uploaded" as const,
        quad: m.quad,
        rotation: m.rotation,
        enhance: m.enhance,
        enhancedFileId: m.enhancedFileId,
      })),
    );
    setResumable(null);
  }, [resumable]);

  const dismissResume = useCallback(() => {
    // Dismiss = keep the manifest for next time; discard() is the
    // destructive path. Just stop showing the banner this visit.
    setResumable(null);
  }, []);

  const updateItem = useCallback((itemId: string, patch: Partial<ScanItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.itemId === itemId ? { ...i, ...patch } : i)),
    );
  }, []);

  const startUpload = useCallback(
    (itemId: string, file: File) => {
      pendingFilesRef.current.set(itemId, file);
      fileHandler
        .upload(
          { kind: "file", file },
          {
            folderPath: `${CloudFolders.SYSTEM_FILES}/scanner/${sessionId}`,
            fileName: file.name,
            metadata: {
              origin: "pdf-scanner",
              sessionId,
            },
          },
        )
        .then((normalized) => {
          pendingFilesRef.current.delete(itemId);
          updateItem(itemId, {
            fileId: normalized.fileId,
            status: "uploaded",
            error: undefined,
          });
        })
        .catch((err: unknown) => {
          updateItem(itemId, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
        });
    },
    [sessionId, updateItem],
  );

  const addOne = useCallback(
    (file: File, previewUrl?: string, source: ScanItemSource = "file") => {
      const itemId = crypto.randomUUID();
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      let preview = previewUrl;
      if (!preview && !isPdf) {
        preview = createTrackedObjectUrl(file);
        blobUrlsRef.current.set(itemId, preview);
      }
      const item: ScanItem = {
        itemId,
        kind: isPdf ? "pdf" : "image",
        source,
        fileName: file.name,
        mimeType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
        previewUrl: preview,
        status: "uploading",
        rotation: 0,
      };
      setItems((prev) => [...prev, item]);
      startUpload(itemId, file);
    },
    [startUpload],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      files.forEach((f) => addOne(f));
    },
    [addOne],
  );

  const addCapture = useCallback(
    (blob: Blob) => {
      shotCounterRef.current += 1;
      const fileName = `scan-${String(shotCounterRef.current).padStart(2, "0")}.jpg`;
      const file = new File([blob], fileName, {
        type: blob.type || "image/jpeg",
      });
      addOne(file, undefined, "camera");
    },
    [addOne],
  );

  const retryItem = useCallback(
    (itemId: string) => {
      const file = pendingFilesRef.current.get(itemId);
      if (!file) return;
      updateItem(itemId, { status: "uploading", error: undefined });
      startUpload(itemId, file);
    },
    [startUpload, updateItem],
  );

  const removeItem = useCallback((itemId: string) => {
    pendingFilesRef.current.delete(itemId);
    const url = blobUrlsRef.current.get(itemId);
    if (url) {
      revokeTrackedObjectUrl(url);
      blobUrlsRef.current.delete(itemId);
    }
    setItems((prev) => prev.filter((i) => i.itemId !== itemId));
    // The hidden upload is left in place — the session folder is cleaned
    // as a whole on discard; a removed item is simply not sent to save.
  }, []);

  const moveItem = useCallback((activeId: string, overId: string) => {
    setItems((prev) => {
      const from = prev.findIndex((i) => i.itemId === activeId);
      const to = prev.findIndex((i) => i.itemId === overId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const setQuad = useCallback(
    (itemId: string, quad: Quad | null | undefined) => {
      updateItem(itemId, { quad });
    },
    [updateItem],
  );

  const setRotation = useCallback(
    (itemId: string, rotation: ScanRotation) => {
      updateItem(itemId, { rotation });
    },
    [updateItem],
  );

  const setItemLabel = useCallback(
    (itemId: string, itemLabel: string) => {
      updateItem(itemId, { label: itemLabel });
    },
    [updateItem],
  );

  const setEnhance = useCallback(
    (
      itemId: string,
      enhance: ScanEnhanceMode | undefined,
      enhancedFileId?: string,
    ) => {
      updateItem(itemId, {
        enhance,
        enhancedFileId: enhance ? enhancedFileId : undefined,
      });
    },
    [updateItem],
  );

  const clearAfterSave = useCallback(() => {
    blobUrlsRef.current.forEach((url) => revokeTrackedObjectUrl(url));
    blobUrlsRef.current.clear();
    pendingFilesRef.current.clear();
    setItems([]);
    setLabel("");
    writeManifest(null);
  }, []);

  const discard = useCallback(async () => {
    const fileIds = items
      .map((i) => i.fileId)
      .filter((id): id is string => Boolean(id));
    clearAfterSave();
    setSessionId(crypto.randomUUID());
    if (fileIds.length > 0) {
      // Best-effort: hidden system files — orphans are harmless if this fails.
      try {
        const { bulkDeleteFiles } = await import("@/features/files/api/files");
        await bulkDeleteFiles({ file_ids: fileIds, hard_delete: true });
      } catch (err) {
        console.warn("[pdf-scanner] discard cleanup failed", err);
      }
    }
  }, [items, clearAfterSave]);

  const uploadingCount = items.filter((i) => i.status === "uploading").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const allUploaded =
    items.length > 0 && items.every((i) => i.status === "uploaded");

  return {
    sessionId,
    items,
    label,
    setLabel,
    resumable,
    resume,
    dismissResume,
    addFiles,
    addCapture,
    retryItem,
    removeItem,
    moveItem,
    setQuad,
    setRotation,
    setItemLabel,
    setEnhance,
    allUploaded,
    uploadingCount,
    errorCount,
    clearAfterSave,
    discard,
  };
}
