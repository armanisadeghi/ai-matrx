"use client";

/**
 * useIntakeSession — the zero-data-loss engine of the intake capture app
 * (W4), over the C1 `commerce` schema.
 *
 * Durability model (the proven prototype flow, rebuilt properly):
 * - Assets are DB rows from the moment they carry anything (first shot, QR,
 *   or note) — created lazily so "Next" can never mint an empty row.
 * - Every artifact uploads IMMEDIATELY through the one cloud boundary
 *   (`uploads.ts` → `fileHandler.upload`) and lands as an
 *   `commerce.intake_artifact` row with a monotonic per-batch
 *   `sequence_index`. Voice/video artifacts are stored with
 *   `transcript = null` — the PIPELINE transcribes and converges notes onto
 *   `intake_asset.notes` (§2 policy 1; no second notes store here).
 * - Notes autosave debounced through the guarded CAS, force-flushed on item
 *   switch, `visibilitychange` (phone into pocket) and unmount — and ALWAYS
 *   flushed BEFORE the close write (§2 policy 4), so the
 *   `pipeline_state = 'captured'` transition is the last write of the item's
 *   capture life. That status write is the ONLY handoff (§2 policy 3).
 * - Mid-item resume (P12): batch + asset ids persist in localStorage per
 *   org; a reload lands back in the open batch on the open item, with the
 *   sequence counter continued from the DB, never restarted.
 *
 * Two capture modes, matching `intake_batch.capture_mode`:
 * - `serialized` (QR mode): a scan closes the current asset and opens a new
 *   one keyed by an `asset_identifier` row (`our_qr`, primary). QR dedupe is
 *   BY ABSENCE (4 s out of frame, in `useQrAutoScan`), so shooting a burst
 *   with no QR in frame continues the same item, and deliberately
 *   re-scanning the same code after absence starts the NEXT UNIT of that
 *   product as a new asset.
 * - `untracked`: no asset rows — artifacts attach to the BATCH in
 *   `sequence_index` order and delineator frames (`is_delineator`) mark the
 *   item boundaries for downstream segmentation. Typed/voice-note text
 *   appends to the batch notes (the convergence point until segmentation
 *   mints the assets).
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

import type {
  ArtifactKind,
  BatchCaptureMode,
  IntakeAsset,
  IntakeBatch,
  PendingIntakeArtifact,
} from "../types";
import {
  addIdentifier,
  appendToBatchNotes,
  createAsset,
  deleteArtifact,
  ensureOpenBatch,
  finishAsset,
  listAssetArtifacts,
  loadAsset,
  loadBatch,
  maxSequenceIndex,
  reopenAsset,
  setAssetNotes,
} from "../service";
import { uploadIntakeArtifact } from "../uploads";

const NOTES_AUTOSAVE_MS = 800;

function resumeKey(orgId: string) {
  return `commerce-intake:session:${orgId}`;
}

interface ResumeState {
  batchId: string;
  assetId: string | null;
  mode: BatchCaptureMode;
}

export interface UseIntakeSessionResult {
  organizationId: string | null;
  captureMode: BatchCaptureMode;
  setCaptureMode: (mode: BatchCaptureMode) => void;
  batch: IntakeBatch | null;
  currentAsset: IntakeAsset | null;
  /** 1-based label number for the current item within this session. */
  currentAssetSeq: number;
  artifacts: PendingIntakeArtifact[];
  uploadingCount: number;
  errorCount: number;
  notes: string;
  notesSaving: boolean;

  addPhoto: (blob: Blob, opts?: { isDelineator?: boolean }) => void;
  addVideo: (blob: Blob, fileName: string, durationMs: number) => void;
  /** Voice note artifact — transcript stays null; the pipeline fills it. */
  addAudioNote: (blob: Blob, durationMs: number) => void;
  setNotes: (text: string) => void;
  /** Type a serial / asset tag onto the current item (identifier row). */
  addManualIdentifier: (value: string) => void;
  /** QR scanned (serialized mode). Returns "assigned" | "switched". */
  onQrCode: (code: string) => Promise<"assigned" | "switched">;
  /** Finish this item: notes flush, then the `captured` status write. */
  nextItem: () => void;
  /** Reopen an existing asset (review drawer / deep link). */
  resumeAsset: (assetId: string) => Promise<void>;
  removeArtifact: (localId: string) => void;
}

export interface UseIntakeSessionOptions {
  /** Open with this asset current (the `?asset=` deep link). Wins over the
   *  localStorage mid-item resume. */
  initialAssetId?: string | null;
}

export function useIntakeSession(
  options: UseIntakeSessionOptions = {},
): UseIntakeSessionResult {
  const { initialAssetId = null } = options;
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const [captureMode, setCaptureModeState] =
    useState<BatchCaptureMode>("serialized");
  const [batch, setBatch] = useState<IntakeBatch | null>(null);
  const [currentAsset, setCurrentAsset] = useState<IntakeAsset | null>(null);
  const [artifacts, setArtifacts] = useState<PendingIntakeArtifact[]>([]);
  const [notes, setNotesState] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [sessionSeq, setSessionSeq] = useState(0);

  const batchRef = useRef<IntakeBatch | null>(null);
  const modeRef = useRef<BatchCaptureMode>("serialized");
  const currentAssetRef = useRef<IntakeAsset | null>(null);
  const notesRef = useRef("");
  const notesDirtyRef = useRef(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureAssetPromiseRef = useRef<Promise<IntakeAsset> | null>(null);
  const ensureBatchPromiseRef = useRef<Promise<IntakeBatch> | null>(null);
  const previewUrlsRef = useRef(new Map<string, string>());
  /** Monotonic per-batch capture ordinal (continued from the DB on resume). */
  const sequenceRef = useRef(0);
  const artifactsCountRef = useRef(0);

  const persistResume = useCallback(
    (state: Partial<ResumeState>) => {
      if (!organizationId) return;
      try {
        const prevRaw = window.localStorage.getItem(resumeKey(organizationId));
        const prev = prevRaw ? (JSON.parse(prevRaw) as ResumeState) : null;
        const next: ResumeState = {
          batchId: state.batchId ?? prev?.batchId ?? "",
          assetId:
            state.assetId !== undefined ? state.assetId : (prev?.assetId ?? null),
          mode: state.mode ?? prev?.mode ?? modeRef.current,
        };
        window.localStorage.setItem(
          resumeKey(organizationId),
          JSON.stringify(next),
        );
      } catch {
        // Private mode degrades resume, never capture.
      }
    },
    [organizationId],
  );

  // ── Batch ─────────────────────────────────────────────────────────────────

  const ensureBatch = useCallback(async (): Promise<IntakeBatch> => {
    const existing = batchRef.current;
    if (existing && existing.captureMode === modeRef.current) return existing;
    if (ensureBatchPromiseRef.current) return ensureBatchPromiseRef.current;
    if (!organizationId) {
      throw new Error("No organization resolved yet — try again in a moment.");
    }
    const create = ensureOpenBatch({
      organizationId,
      captureMode: modeRef.current,
    })
      .then(async (b) => {
        batchRef.current = b;
        setBatch(b);
        sequenceRef.current = await maxSequenceIndex(b.id);
        persistResume({ batchId: b.id, mode: b.captureMode });
        return b;
      })
      .finally(() => {
        ensureBatchPromiseRef.current = null;
      });
    ensureBatchPromiseRef.current = create;
    return create;
  }, [organizationId, persistResume]);

  // ── Notes autosave (policy 1: ONE writer for visible text) ────────────────

  const flushNotes = useCallback(async (asset: IntakeAsset | null) => {
    if (!notesDirtyRef.current) return;
    // Untracked mode: the note draft appends onto the batch notes.
    if (!asset) {
      const b = batchRef.current;
      const text = notesRef.current.trim();
      if (!b || modeRef.current !== "untracked" || !text) return;
      notesDirtyRef.current = false;
      setNotesSaving(true);
      try {
        await appendToBatchNotes(b.id, text);
        notesRef.current = "";
        setNotesState("");
      } catch (err) {
        notesDirtyRef.current = true;
        console.error("[commerce-intake] batch note flush failed", err);
        toast.error("Notes could not be saved — check your connection.");
      } finally {
        setNotesSaving(false);
      }
      return;
    }
    notesDirtyRef.current = false;
    setNotesSaving(true);
    try {
      const saved = await setAssetNotes(asset, notesRef.current);
      if (currentAssetRef.current?.id === saved.id) {
        currentAssetRef.current = saved;
        setCurrentAsset(saved);
      }
    } catch (err) {
      notesDirtyRef.current = true;
      console.error("[commerce-intake] notes autosave failed", err);
      toast.error("Notes could not be saved — check your connection.");
    } finally {
      setNotesSaving(false);
    }
  }, []);

  const scheduleNotesSave = useCallback(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      void flushNotes(currentAssetRef.current);
    }, NOTES_AUTOSAVE_MS);
  }, [flushNotes]);

  const setNotes = useCallback(
    (text: string) => {
      notesRef.current = text;
      notesDirtyRef.current = true;
      setNotesState(text);
      // Untracked batch notes flush on break/close only (append semantics);
      // serialized asset notes ride the debounce.
      if (modeRef.current === "serialized") scheduleNotesSave();
    },
    [scheduleNotesSave],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void flushNotes(currentAssetRef.current);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flushNotes]);

  // ── Asset lifecycle ───────────────────────────────────────────────────────

  const adoptAsset = useCallback(
    (asset: IntakeAsset, assetArtifacts: PendingIntakeArtifact[]) => {
      currentAssetRef.current = asset;
      setCurrentAsset(asset);
      setArtifacts(assetArtifacts);
      notesRef.current = asset.notes;
      notesDirtyRef.current = false;
      setNotesState(asset.notes);
      setSessionSeq((n) => n + 1);
      persistResume({ batchId: asset.batchId, assetId: asset.id });
    },
    [persistResume],
  );

  /** The current asset, created on first use (never an empty row). */
  const ensureAsset = useCallback(
    async (seed?: { qrCode: string }): Promise<IntakeAsset> => {
      const existing = currentAssetRef.current;
      if (existing) return existing;
      if (ensureAssetPromiseRef.current) return ensureAssetPromiseRef.current;
      const create = (async () => {
        const b = await ensureBatch();
        if (!organizationId) {
          throw new Error("No organization resolved yet.");
        }
        const asset = await createAsset({
          batchId: b.id,
          organizationId,
          qrCode: seed?.qrCode ?? null,
        });
        adoptAsset(asset, []);
        return asset;
      })().finally(() => {
        ensureAssetPromiseRef.current = null;
      });
      ensureAssetPromiseRef.current = create;
      return create;
    },
    [ensureBatch, organizationId, adoptAsset],
  );

  /**
   * Finish the current item. Policy 4 then policy 3, in that exact order:
   * the notes flush lands FIRST, then the `pipeline_state='captured'` status
   * write — and NOTHING else — is the pipeline handoff.
   */
  const finishCurrentAsset = useCallback(() => {
    const asset = currentAssetRef.current;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    void (async () => {
      await flushNotes(asset);
      if (!asset) return;
      try {
        await finishAsset(asset);
      } catch (err) {
        console.error("[commerce-intake] item close failed", err);
        toast.error("Item saved, but could not be marked captured.");
      }
    })();
    persistResume({ assetId: null });
    previewUrlsRef.current.forEach((url) => revokeTrackedObjectUrl(url));
    previewUrlsRef.current.clear();
    currentAssetRef.current = null;
    setCurrentAsset(null);
    setArtifacts([]);
    notesRef.current = "";
    notesDirtyRef.current = false;
    setNotesState("");
  }, [flushNotes, persistResume]);

  const nextItem = useCallback(() => {
    finishCurrentAsset();
  }, [finishCurrentAsset]);

  const resumeAsset = useCallback(
    async (assetId: string) => {
      const asset = await loadAsset(assetId);
      if (!asset) {
        toast.error("That item no longer exists.");
        return;
      }
      finishCurrentAsset();
      const b = batchRef.current;
      if (!b || b.id !== asset.batchId) {
        const loaded = await loadBatch(asset.batchId);
        if (loaded) {
          batchRef.current = loaded;
          setBatch(loaded);
          modeRef.current = loaded.captureMode;
          setCaptureModeState(loaded.captureMode);
          sequenceRef.current = await maxSequenceIndex(loaded.id);
        }
      }
      const stored = await listAssetArtifacts(asset.id);
      adoptAsset(
        asset,
        stored.map((a) => ({
          localId: a.id,
          assetId: a.assetId,
          kind: a.kind,
          isDelineator: a.isDelineator,
          fileId: a.fileId ?? undefined,
          artifactId: a.id,
          status: "uploaded" as const,
        })),
      );
      // Back on the capture surface = mid-capture again; finishing later
      // re-fires the same status transition (more photos ARE a reprocess).
      void reopenAsset(asset)
        .then((saved) => {
          if (currentAssetRef.current?.id === saved.id) {
            currentAssetRef.current = { ...saved, notes: notesRef.current };
            setCurrentAsset(currentAssetRef.current);
          }
        })
        .catch((err: unknown) => {
          console.error("[commerce-intake] asset reopen failed", err);
        });
    },
    [finishCurrentAsset, adoptAsset],
  );

  // Resume on mount (once per org resolution): an explicit `?asset=` deep
  // link wins; otherwise the localStorage mid-item state after a reload.
  const resumeTriedRef = useRef(false);
  useEffect(() => {
    if (!organizationId || resumeTriedRef.current) return;
    resumeTriedRef.current = true;
    let stored: ResumeState | null = null;
    try {
      const raw = window.localStorage.getItem(resumeKey(organizationId));
      stored = raw ? (JSON.parse(raw) as ResumeState) : null;
    } catch {
      stored = null;
    }
    const targetAsset = initialAssetId ?? stored?.assetId ?? null;
    const targetBatch = stored?.batchId || null;
    const targetMode = stored?.mode ?? null;
    const timer = setTimeout(() => {
      void (async () => {
        if (targetMode) {
          modeRef.current = targetMode;
          setCaptureModeState(targetMode);
        }
        if (targetAsset) {
          await resumeAsset(targetAsset);
          return;
        }
        if (targetBatch) {
          const b = await loadBatch(targetBatch);
          if (b && b.status === "open") {
            batchRef.current = b;
            setBatch(b);
            modeRef.current = b.captureMode;
            setCaptureModeState(b.captureMode);
            sequenceRef.current = await maxSequenceIndex(b.id);
          }
        }
      })().catch((err: unknown) => {
        console.error("[commerce-intake] resume failed", err);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [organizationId, resumeAsset, initialAssetId]);

  // ── Mode switch ───────────────────────────────────────────────────────────

  const setCaptureMode = useCallback(
    (mode: BatchCaptureMode) => {
      if (mode === modeRef.current) return;
      // Finish the open item; the next artifact resolves the right batch.
      finishCurrentAsset();
      modeRef.current = mode;
      setCaptureModeState(mode);
      batchRef.current = null;
      setBatch(null);
      persistResume({ batchId: "", assetId: null, mode });
    },
    [finishCurrentAsset, persistResume],
  );

  // ── Identifiers / QR ──────────────────────────────────────────────────────

  const isCurrentAssetEmpty = useCallback(() => {
    const asset = currentAssetRef.current;
    if (!asset) return true;
    return (
      !asset.qrCode &&
      notesRef.current.trim() === "" &&
      artifactsCountRef.current === 0
    );
  }, []);

  useEffect(() => {
    artifactsCountRef.current = artifacts.length;
  }, [artifacts]);

  const onQrCode = useCallback(
    async (code: string): Promise<"assigned" | "switched"> => {
      const trimmed = code.trim();
      if (!trimmed) return "assigned";
      const asset = currentAssetRef.current;
      // An untouched, code-less current item just takes the code.
      if (isCurrentAssetEmpty() && (!asset || !asset.qrCode)) {
        if (!asset) {
          await ensureAsset({ qrCode: trimmed });
        } else if (organizationId) {
          await addIdentifier({
            assetId: asset.id,
            organizationId,
            kind: "our_qr",
            value: trimmed,
            isPrimary: true,
            isMachineReadable: true,
          });
          const next = { ...asset, qrCode: trimmed };
          currentAssetRef.current = next;
          setCurrentAsset(next);
        }
        return "assigned";
      }
      // Anything else — including a deliberate re-scan of the SAME code
      // after 4 s out of frame (the next unit of the same product) — closes
      // the current item and opens a new one carrying the code.
      finishCurrentAsset();
      await ensureAsset({ qrCode: trimmed });
      return "switched";
    },
    [
      isCurrentAssetEmpty,
      ensureAsset,
      finishCurrentAsset,
      organizationId,
    ],
  );

  const addManualIdentifier = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      void (async () => {
        try {
          const asset = await ensureAsset();
          if (!organizationId) return;
          await addIdentifier({
            assetId: asset.id,
            organizationId,
            kind: "manufacturer_serial",
            value: trimmed,
          });
          toast.success("Identifier added.");
        } catch (err) {
          console.error("[commerce-intake] identifier save failed", err);
          toast.error("Could not save the identifier.");
        }
      })();
    },
    [ensureAsset, organizationId],
  );

  // ── Artifacts ─────────────────────────────────────────────────────────────

  const patchArtifact = useCallback(
    (localId: string, patch: Partial<PendingIntakeArtifact>) => {
      setArtifacts((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  const startArtifact = useCallback(
    async (
      file: File,
      kind: ArtifactKind,
      opts: {
        previewUrl?: string;
        isDelineator?: boolean;
        durationMs?: number | null;
      } = {},
    ) => {
      const localId = crypto.randomUUID();
      let b: IntakeBatch;
      let asset: IntakeAsset | null = null;
      try {
        if (modeRef.current === "serialized") {
          asset = await ensureAsset();
          b = batchRef.current ?? (await ensureBatch());
        } else {
          b = await ensureBatch();
        }
      } catch (err) {
        if (opts.previewUrl) revokeTrackedObjectUrl(opts.previewUrl);
        toast.error(
          err instanceof Error ? err.message : "Could not start the item.",
        );
        throw err;
      }
      if (!organizationId) throw new Error("No organization resolved yet.");
      if (opts.previewUrl) previewUrlsRef.current.set(localId, opts.previewUrl);
      sequenceRef.current += 1;
      const sequenceIndex = sequenceRef.current;
      setArtifacts((prev) => [
        ...prev,
        {
          localId,
          assetId: asset?.id ?? null,
          kind,
          isDelineator: opts.isDelineator ?? false,
          previewUrl: opts.previewUrl,
          status: "uploading",
        },
      ]);
      try {
        const { artifact } = await uploadIntakeArtifact({
          organizationId,
          batchId: b.id,
          assetId: asset?.id ?? null,
          folderLeaf: asset?.id ?? b.id,
          file,
          kind,
          sequenceIndex,
          isDelineator: opts.isDelineator,
          durationMs: opts.durationMs ?? null,
        });
        patchArtifact(localId, {
          fileId: artifact.fileId ?? undefined,
          artifactId: artifact.id,
          status: "uploaded",
        });
        return { asset, artifact };
      } catch (err) {
        console.error("[commerce-intake] upload failed", err);
        patchArtifact(localId, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
        throw err;
      }
    },
    [ensureAsset, ensureBatch, organizationId, patchArtifact],
  );

  const addPhoto = useCallback(
    (blob: Blob, opts: { isDelineator?: boolean } = {}) => {
      const file = new File(
        [blob],
        `intake-${Date.now()}-${sequenceRef.current + 1}.jpg`,
        { type: blob.type || "image/jpeg" },
      );
      const previewUrl = createTrackedObjectUrl(file);
      void startArtifact(file, "photo", {
        previewUrl,
        isDelineator: opts.isDelineator,
      }).catch(() => {
        // Surfaced on the artifact chip; nothing further to do here.
      });
    },
    [startArtifact],
  );

  const addVideo = useCallback(
    (blob: Blob, fileName: string, durationMs: number) => {
      const file = new File([blob], fileName, { type: blob.type });
      const previewUrl = createTrackedObjectUrl(file);
      void startArtifact(file, "video", {
        previewUrl,
        durationMs: Math.max(1, Math.round(durationMs)),
      }).catch(() => {
        // Surfaced on the artifact chip.
      });
    },
    [startArtifact],
  );

  const addAudioNote = useCallback(
    (blob: Blob, durationMs: number) => {
      const file = toAudioFile(blob, {
        prefix: `voice-note-${Date.now()}`,
      });
      // The artifact row keeps `transcript = null` — the pipeline transcribes
      // and routes the text onto the asset notes (§2 policy 1). No client
      // transcription, no second notes store.
      void startArtifact(file, "audio", {
        durationMs: Math.max(1, Math.round(durationMs)),
      }).catch(() => {
        // Surfaced on the artifact chip.
      });
    },
    [startArtifact],
  );

  const removeArtifact = useCallback((localId: string) => {
    setArtifacts((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target?.artifactId) {
        void deleteArtifact(target.artifactId).catch((err: unknown) => {
          console.warn("[commerce-intake] artifact delete failed", err);
        });
      }
      const url = previewUrlsRef.current.get(localId);
      if (url) {
        revokeTrackedObjectUrl(url);
        previewUrlsRef.current.delete(localId);
      }
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  // On unmount: flush notes still inside the debounce window (an SPA route
  // change fires no visibilitychange), then release preview URLs.
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
      void flushNotes(currentAssetRef.current);
      urls.forEach((url) => revokeTrackedObjectUrl(url));
      urls.clear();
    };
  }, [flushNotes]);

  const uploadingCount = artifacts.filter(
    (a) => a.status === "uploading",
  ).length;
  const errorCount = artifacts.filter((a) => a.status === "error").length;

  return {
    organizationId,
    captureMode,
    setCaptureMode,
    batch,
    currentAsset,
    currentAssetSeq: sessionSeq,
    artifacts,
    uploadingCount,
    errorCount,
    notes,
    notesSaving,
    addPhoto,
    addVideo,
    addAudioNote,
    setNotes,
    addManualIdentifier,
    onQrCode,
    nextItem,
    resumeAsset,
    removeArtifact,
  };
}
