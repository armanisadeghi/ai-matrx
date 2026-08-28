"use client";

/**
 * useProductCaptureSession — the zero-data-loss engine of product capture.
 *
 * Durability model:
 * - Items are DB rows from the moment they carry anything (first shot, code,
 *   note, or voice note) — created lazily so "Next item" can never mint
 *   empties. Everything autosaves; there is no explicit save anywhere.
 * - Every artifact uploads IMMEDIATELY via the feature's one cloud boundary
 *   (`uploads.ts` → `fileHandler.upload`) into the item's own org-visible
 *   folder, then links back as a `product_capture_file` row.
 * - Notes autosave debounced through a version-guarded CAS
 *   (`service.setItemNotes`), and are flushed on every item switch. Voice
 *   notes transcribe in the background; a transcript for the item still on
 *   screen lands in the textarea (and rides the same autosave), one for an
 *   item the user already left appends server-side (`appendToItemNotes`).
 * - The current item id persists in localStorage per org, so a reload
 *   resumes mid-item instead of splitting a product across two items.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";
import { toast } from "@/lib/toast";
import { toAudioFile } from "@/features/audio/utils/audio-mime";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";

import type {
  CaptureItem,
  PendingArtifact,
  ProductCaptureCodeSource,
  ProductCaptureFileKind,
} from "../types";
import {
  appendToItemNotes,
  closeItem,
  createItem,
  listItemFiles,
  loadItem,
  reopenItem,
  setItemCode,
  setItemNotes,
} from "../service";
import { removeItemFile, uploadItemFile } from "../uploads";

const NOTES_AUTOSAVE_MS = 800;

function resumeKey(orgId: string) {
  return `product-capture:current-item:${orgId}`;
}

export interface UseProductCaptureSessionResult {
  /** Effective org — null only before the org bootstrap resolves. */
  organizationId: string | null;
  currentItem: CaptureItem | null;
  /** 1-based label number for the current item within this session. */
  currentItemSeq: number;
  /** Current item's artifacts, capture order (uploading + uploaded). */
  artifacts: PendingArtifact[];
  uploadingCount: number;
  errorCount: number;
  transcribingCount: number;
  /** Current item's notes as the textarea should show them. */
  notes: string;
  notesSaving: boolean;

  addPhoto: (blob: Blob) => void;
  addVideo: (blob: Blob, fileName: string) => void;
  /** Voice note: upload + background transcription into the notes. */
  addAudioNote: (blob: Blob) => void;
  setNotes: (text: string) => void;
  /** Type/edit the SKU / product number on the current item. */
  setCode: (code: string) => void;
  /** QR scanned: assign to the (empty) current item or auto-switch to a new
   *  item carrying the code. Returns "assigned" | "switched". */
  onQrCode: (code: string) => Promise<"assigned" | "switched">;
  /** Mode 1's button: finish this item, next capture starts a fresh one. */
  nextItem: () => void;
  /** Reopen an existing item (from the review sheet). */
  resumeItem: (itemId: string) => Promise<void>;
  removeArtifact: (localId: string) => void;
}

export interface UseProductCaptureSessionOptions {
  /** Open with this item current (the `?item=` deep link from the list /
   *  detail pages). Wins over the localStorage mid-item resume. */
  initialItemId?: string | null;
}

export function useProductCaptureSession(
  options: UseProductCaptureSessionOptions = {},
): UseProductCaptureSessionResult {
  const { initialItemId = null } = options;
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const [currentItem, setCurrentItem] = useState<CaptureItem | null>(null);
  const [artifacts, setArtifacts] = useState<PendingArtifact[]>([]);
  const [notes, setNotesState] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [transcribingCount, setTranscribingCount] = useState(0);
  const [sessionSeq, setSessionSeq] = useState(0);

  // Refs mirror the state the async pipelines need without stale closures.
  const currentItemRef = useRef<CaptureItem | null>(null);
  const notesRef = useRef("");
  const notesDirtyRef = useRef(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureItemPromiseRef = useRef<Promise<CaptureItem> | null>(null);
  const previewUrlsRef = useRef(new Map<string, string>());
  const artifactSeqRef = useRef(0);
  // Artifact count for the empty-item test without re-subscribing state.
  const artifactsCountRef = useRef(0);

  const setCurrent = useCallback((item: CaptureItem | null) => {
    currentItemRef.current = item;
    setCurrentItem(item);
    if (item) {
      try {
        window.localStorage.setItem(resumeKey(item.organizationId), item.id);
      } catch {
        // Private mode degrades resume, never capture.
      }
    }
  }, []);

  const clearResumeKey = useCallback((orgId: string) => {
    try {
      window.localStorage.removeItem(resumeKey(orgId));
    } catch {
      // ignore
    }
  }, []);

  // ── Notes autosave ────────────────────────────────────────────────────────

  const flushNotes = useCallback(async (item: CaptureItem | null) => {
    if (!item || !notesDirtyRef.current) return;
    notesDirtyRef.current = false;
    setNotesSaving(true);
    try {
      const saved = await setItemNotes(item, notesRef.current);
      // Adopt the saved version so the next CAS starts from it — but only if
      // the user is still on this item.
      if (currentItemRef.current?.id === saved.id) {
        currentItemRef.current = saved;
        setCurrentItem(saved);
      }
    } catch (err) {
      notesDirtyRef.current = true;
      console.error("[product-capture] notes autosave failed", err);
      toast.error("Notes could not be saved — check your connection.");
    } finally {
      setNotesSaving(false);
    }
  }, []);

  const scheduleNotesSave = useCallback(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      void flushNotes(currentItemRef.current);
    }, NOTES_AUTOSAVE_MS);
  }, [flushNotes]);

  const setNotes = useCallback(
    (text: string) => {
      notesRef.current = text;
      notesDirtyRef.current = true;
      setNotesState(text);
      scheduleNotesSave();
    },
    [scheduleNotesSave],
  );

  // Flush pending notes when the tab hides (the mobile pocket case).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void flushNotes(currentItemRef.current);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flushNotes]);

  // ── Item lifecycle ────────────────────────────────────────────────────────

  const adoptItem = useCallback(
    (item: CaptureItem, itemArtifacts: PendingArtifact[]) => {
      setCurrent(item);
      setArtifacts(itemArtifacts);
      notesRef.current = item.notes;
      notesDirtyRef.current = false;
      setNotesState(item.notes);
      setSessionSeq((n) => n + 1);
      // An item back on the capture surface is mid-capture again: flip a
      // closed/processed item to `capturing` so the close on leaving re-fires
      // the workflow handoff transition (more photos = a reprocess). Freshly
      // created items are born `capturing` — no write.
      if (item.status !== "capturing") {
        void reopenItem(item)
          .then((saved) => {
            if (currentItemRef.current?.id === saved.id) {
              currentItemRef.current = { ...saved, notes: notesRef.current };
              setCurrentItem(currentItemRef.current);
            }
          })
          .catch((err: unknown) => {
            console.error("[product-capture] item reopen failed", err);
          });
      }
    },
    [setCurrent],
  );

  /** The current item, created on first use (never an empty row). */
  const ensureItem = useCallback(
    async (seed?: {
      code: string;
      source: ProductCaptureCodeSource;
    }): Promise<CaptureItem> => {
      const existing = currentItemRef.current;
      if (existing) return existing;
      if (ensureItemPromiseRef.current) return ensureItemPromiseRef.current;
      if (!organizationId) {
        throw new Error(
          "No organization resolved yet — try again in a moment.",
        );
      }
      const create = createItem({
        organizationId,
        code: seed?.code ?? null,
        codeSource: seed?.source,
      })
        .then((item) => {
          adoptItem(item, []);
          return item;
        })
        .finally(() => {
          ensureItemPromiseRef.current = null;
        });
      ensureItemPromiseRef.current = create;
      return create;
    },
    [organizationId, adoptItem],
  );

  const finishCurrentItem = useCallback(() => {
    const item = currentItemRef.current;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    // Notes flush FIRST, close write LAST: the `capturing → captured` DB
    // transition is the workflow handoff (the table's event trigger fires on
    // it), so it must be the final write of the item's capture session. A
    // stale version after the flush is fine — closeItem rides the guarded
    // CAS and retries once against the row that landed.
    void (async () => {
      await flushNotes(item);
      if (!item) return;
      try {
        await closeItem(item);
      } catch (err) {
        console.error("[product-capture] item close failed", err);
        toast.error(
          "Item saved, but could not be marked ready for processing.",
        );
      }
    })();
    if (item) clearResumeKey(item.organizationId);
    // Preview URLs belong to the finished item's filmstrip — release them.
    previewUrlsRef.current.forEach((url) => revokeTrackedObjectUrl(url));
    previewUrlsRef.current.clear();
    currentItemRef.current = null;
    setCurrentItem(null);
    setArtifacts([]);
    notesRef.current = "";
    notesDirtyRef.current = false;
    setNotesState("");
  }, [flushNotes, clearResumeKey]);

  const nextItem = useCallback(() => {
    finishCurrentItem();
  }, [finishCurrentItem]);

  const resumeItem = useCallback(
    async (itemId: string) => {
      const item = await loadItem(itemId);
      if (!item) {
        toast.error("That item no longer exists.");
        return;
      }
      finishCurrentItem();
      const files = await listItemFiles(item.id);
      adoptItem(
        item,
        files.map((f) => ({
          localId: f.id,
          itemId: f.itemId,
          kind: f.kind,
          fileId: f.fileId,
          status: "uploaded" as const,
        })),
      );
    },
    [finishCurrentItem, adoptItem],
  );

  // Resume on mount (once per org resolution): an explicit `?item=` deep
  // link wins; otherwise the localStorage mid-item state after a reload.
  const resumeTriedRef = useRef(false);
  useEffect(() => {
    if (!organizationId || resumeTriedRef.current) return;
    resumeTriedRef.current = true;
    let stored: string | null = initialItemId;
    if (!stored) {
      try {
        stored = window.localStorage.getItem(resumeKey(organizationId));
      } catch {
        return;
      }
    }
    if (!stored) return;
    const storedId = stored;
    // Deferred a tick: resume swaps several pieces of state at once and must
    // never run synchronously inside this effect (cascading-render lint).
    const timer = setTimeout(() => {
      void resumeItem(storedId).catch((err: unknown) => {
        console.error("[product-capture] resume failed", err);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [organizationId, resumeItem, initialItemId]);

  // ── Codes ─────────────────────────────────────────────────────────────────

  const applyCode = useCallback(
    async (code: string, source: ProductCaptureCodeSource) => {
      const item = currentItemRef.current;
      if (!item) {
        await ensureItem({ code, source });
        return;
      }
      try {
        const saved = await setItemCode(item, code, source);
        if (currentItemRef.current?.id === saved.id) {
          // Keep the freshest version for the next CAS; notes stay local.
          currentItemRef.current = { ...saved, notes: notesRef.current };
          setCurrentItem(currentItemRef.current);
        }
      } catch (err) {
        console.error("[product-capture] code save failed", err);
        toast.error("Could not save the product number.");
      }
    },
    [ensureItem],
  );

  const setCode = useCallback(
    (code: string) => {
      void applyCode(code, "manual");
    },
    [applyCode],
  );

  const isCurrentItemEmpty = useCallback(() => {
    const item = currentItemRef.current;
    if (!item) return true;
    return (
      !item.code &&
      notesRef.current.trim() === "" &&
      artifactsCountRef.current === 0
    );
  }, []);

  useEffect(() => {
    artifactsCountRef.current = artifacts.length;
  }, [artifacts]);

  const onQrCode = useCallback(
    async (code: string): Promise<"assigned" | "switched"> => {
      // An untouched current item just takes the code — the scan-first flow.
      if (isCurrentItemEmpty()) {
        await applyCode(code, "qr");
        if (!currentItemRef.current) await ensureItem({ code, source: "qr" });
        return "assigned";
      }
      finishCurrentItem();
      await ensureItem({ code, source: "qr" });
      return "switched";
    },
    [isCurrentItemEmpty, applyCode, ensureItem, finishCurrentItem],
  );

  // ── Artifacts ─────────────────────────────────────────────────────────────

  const patchArtifact = useCallback(
    (localId: string, patch: Partial<PendingArtifact>) => {
      setArtifacts((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  const startArtifact = useCallback(
    async (file: File, kind: ProductCaptureFileKind, previewUrl?: string) => {
      const localId = crypto.randomUUID();
      let item: CaptureItem;
      try {
        item = await ensureItem();
      } catch (err) {
        if (previewUrl) revokeTrackedObjectUrl(previewUrl);
        toast.error(
          err instanceof Error ? err.message : "Could not start the item.",
        );
        throw err;
      }
      if (previewUrl) previewUrlsRef.current.set(localId, previewUrl);
      setArtifacts((prev) => [
        ...prev,
        { localId, itemId: item.id, kind, previewUrl, status: "uploading" },
      ]);
      try {
        const { link } = await uploadItemFile({ item, file, kind });
        patchArtifact(localId, { fileId: link.fileId, status: "uploaded" });
        return { item, fileId: link.fileId };
      } catch (err) {
        console.error("[product-capture] upload failed", err);
        patchArtifact(localId, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
        throw err;
      }
    },
    [ensureItem, patchArtifact],
  );

  const addPhoto = useCallback(
    (blob: Blob) => {
      artifactSeqRef.current += 1;
      const file = new File(
        [blob],
        `photo-${Date.now()}-${artifactSeqRef.current}.jpg`,
        { type: blob.type || "image/jpeg" },
      );
      const previewUrl = createTrackedObjectUrl(file);
      void startArtifact(file, "photo", previewUrl).catch(() => {
        // Surfaced on the artifact chip; nothing further to do here.
      });
    },
    [startArtifact],
  );

  const addVideo = useCallback(
    (blob: Blob, fileName: string) => {
      const file = new File([blob], fileName, { type: blob.type });
      const previewUrl = createTrackedObjectUrl(file);
      void startArtifact(file, "video", previewUrl).catch(() => {
        // Surfaced on the artifact chip.
      });
    },
    [startArtifact],
  );

  const addAudioNote = useCallback(
    (blob: Blob) => {
      artifactSeqRef.current += 1;
      const file = toAudioFile(blob, {
        prefix: `voice-note-${Date.now()}-${artifactSeqRef.current}`,
      });
      setTranscribingCount((n) => n + 1);
      void (async () => {
        try {
          const { item, fileId } = await startArtifact(file, "audio");
          const result = await transcribeCloudFile({
            fileId,
            organizationId: item.organizationId,
          });
          const text = result.text.trim();
          if (!text) {
            toast.info("Voice note saved — no speech detected to transcribe.");
            return;
          }
          if (currentItemRef.current?.id === item.id) {
            // Still on this item: land it in the textarea and let the normal
            // autosave persist it (keeps one writer for the visible text).
            const next = notesRef.current
              ? `${notesRef.current}\n\n${text}`
              : text;
            setNotes(next);
          } else {
            await appendToItemNotes(item.id, text);
          }
        } catch (err) {
          console.error("[product-capture] voice note failed", err);
          toast.error(
            "Voice note could not be transcribed — the recording is saved on the item.",
          );
        } finally {
          setTranscribingCount((n) => Math.max(0, n - 1));
        }
      })();
    },
    [startArtifact, setNotes],
  );

  const removeArtifact = useCallback((localId: string) => {
    setArtifacts((prev) => {
      const target = prev.find((a) => a.localId === localId);
      const fileId = target?.fileId;
      if (target && fileId) {
        // Best-effort: unlink + drop the cloud file.
        void removeItemFile({ itemId: target.itemId, fileId }).catch(
          (err: unknown) => {
            console.warn("[product-capture] artifact cleanup failed", err);
          },
        );
      }
      const url = previewUrlsRef.current.get(localId);
      if (url) {
        revokeTrackedObjectUrl(url);
        previewUrlsRef.current.delete(localId);
      }
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  // Release preview URLs on unmount (uploads already ran their course).
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => revokeTrackedObjectUrl(url));
      urls.clear();
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  const uploadingCount = artifacts.filter(
    (a) => a.status === "uploading",
  ).length;
  const errorCount = artifacts.filter((a) => a.status === "error").length;

  return {
    organizationId,
    currentItem,
    currentItemSeq: sessionSeq,
    artifacts,
    uploadingCount,
    errorCount,
    transcribingCount,
    notes,
    notesSaving,
    addPhoto,
    addVideo,
    addAudioNote,
    setNotes,
    setCode,
    onQrCode,
    nextItem,
    resumeItem,
    removeArtifact,
  };
}
