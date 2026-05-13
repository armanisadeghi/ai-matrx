"use client";

/**
 * useCropStudioController
 * ─────────────────────────────────────────────────────────────────────────
 * Tabbed-mode controller for CropStudioWindow. Holds an array of
 * "entries" (one per dropped file), each with its own crop rectangle,
 * natural size, and save status. Exposes a `CropViewportPort` /
 * `CropAspectPort` for the active entry so the existing
 * `<InitialCropViewport>` and `<InitialCropAspectBar>` components can be
 * dropped in without modification.
 *
 * Differences from useInitialCropController (queue mode):
 *   • Files are added incrementally via `addFiles` (dropzone) instead of
 *     coming in as a fixed array prop.
 *   • The user picks which entry to work on (`selectEntry`) — there is
 *     no auto-advance.
 *   • A single shared aspect lock applies across all entries — easier to
 *     batch-crop a set to the same ratio.
 *   • "Apply this rect to all" copies the active rect to every entry
 *     where the rect still fits the natural size.
 *   • Save flow uploads to a user-picked cloud folder via
 *     `cloudUploadMany` from the cloud-files pipeline.
 *
 * The controller does NOT own the cloud folder picker UI — it just holds
 * `folderId` / `folderPath` / `folderName` state and a `pickFolder()`
 * thunk that delegates to the global `openFolderPicker()` host.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { openFolderPicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { useFileUpload, useFolderNode } from "@/features/files";
import { extractErrorMessage } from "@/utils/errors";
import { cropFileToFile } from "../utils/crop-file";
import {
  applyDragToRect,
  clampRectInImage,
  fitAspectInImage,
  type CropAspectPort,
  type CropRect,
  type CropViewportPort,
  type DragState,
  type Handle,
  type ImageDisplay,
  type RectDisplay,
} from "./InitialCropPanel";

// ── Types ───────────────────────────────────────────────────────────────────

export type CropStudioEntryStatus = "pending" | "saving" | "saved" | "error";

export interface CropStudioEntry {
  /** Stable per-entry id — used as React key and as `activeId`. */
  id: string;
  file: File;
  /** Object URL for the file. Revoked when the entry is removed. */
  imageUrl: string;
  /** Populated once the image element fires `onLoad`. */
  naturalSize: { w: number; h: number } | null;
  /** Crop rect in natural pixel coordinates. Defaults to full image. */
  cropRect: CropRect | null;
  /**
   * `true` when the rect differs from "full image" by more than half a
   * pixel on any side. Drives the "Apply Crop" vs "OK" label and skips
   * the canvas re-encode when no actual cropping is needed.
   */
  cropIsModified: boolean;
  status: CropStudioEntryStatus;
  /** Cloud file id once successfully uploaded. */
  savedFileId?: string;
  /** Backend share URL once successfully uploaded. */
  savedShareUrl?: string;
  errorMessage?: string;
}

export interface CropStudioController extends CropViewportPort, CropAspectPort {
  // ── Tabs / entries ──────────────────────────────────────────────────────
  entries: CropStudioEntry[];
  activeId: string | null;
  active: CropStudioEntry | null;
  /** True when at least one entry exists but the dropzone is still empty. */
  hasEntries: boolean;
  selectEntry: (id: string) => void;
  removeEntry: (id: string) => void;
  addFiles: (files: File[]) => void;
  clearAll: () => void;

  // ── Per-active-entry helpers ────────────────────────────────────────────
  cropIsModified: boolean;

  // ── Bulk crop ───────────────────────────────────────────────────────────
  applyActiveCropToAll: () => void;

  // ── Cloud folder ────────────────────────────────────────────────────────
  folderId: string | null;
  folderName: string;
  folderPath: string;
  pickFolder: () => Promise<void>;

  // ── Save ────────────────────────────────────────────────────────────────
  isSaving: boolean;
  /** Number of entries currently in `pending` status. */
  pendingCount: number;
  /** Number of entries currently in `saved` status. */
  savedCount: number;
  /** Save just the active entry. */
  saveActive: () => Promise<void>;
  /** Save every entry that hasn't already saved successfully. */
  saveAll: () => Promise<void>;
}

export interface CropStudioControllerOptions {
  /** Default folder path if the user never opens the picker. */
  defaultFolderPath?: string;
  /** Initial folder id (e.g. restored from window-session data). */
  initialFolderId?: string | null;
  /** Initial aspect lock. */
  initialAspect?: number;
}

// ── Hook ────────────────────────────────────────────────────────────────────

let entryCounter = 0;
function makeEntryId(): string {
  entryCounter += 1;
  return `crop-entry-${Date.now().toString(36)}-${entryCounter}`;
}

const DEFAULT_FOLDER_PATH = "Images/Crops";

export function useCropStudioController(
  options: CropStudioControllerOptions = {},
): CropStudioController {
  const { upload } = useFileUpload();

  // ── Entries ───────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<CropStudioEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const active = useMemo(
    () => entries.find((e) => e.id === activeId) ?? null,
    [entries, activeId],
  );

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const e of entriesRef.current) URL.revokeObjectURL(e.imageUrl);
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const next: CropStudioEntry[] = files.map((file) => ({
      id: makeEntryId(),
      file,
      imageUrl: URL.createObjectURL(file),
      naturalSize: null,
      cropRect: null,
      cropIsModified: false,
      status: "pending" as const,
    }));
    if (next.length === 0) return;
    setEntries((prev) => [...prev, ...next]);
    setActiveId((prev) => prev ?? next[0].id);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target) URL.revokeObjectURL(target.imageUrl);
      const next = prev.filter((e) => e.id !== id);
      return next;
    });
    setActiveId((current) => {
      if (current !== id) return current;
      const remaining = entriesRef.current.filter((e) => e.id !== id);
      return remaining[0]?.id ?? null;
    });
  }, []);

  const clearAll = useCallback(() => {
    for (const e of entriesRef.current) URL.revokeObjectURL(e.imageUrl);
    setEntries([]);
    setActiveId(null);
  }, []);

  const selectEntry = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  // ── Aspect (shared across all entries) ────────────────────────────────────
  const [aspect, setAspect] = useState<number | undefined>(
    options.initialAspect,
  );

  const handleSetAspect = useCallback(
    (next: number | undefined) => {
      setAspect(next);
      if (next !== undefined) {
        // Re-fit the active entry's rect to the new aspect, leaving
        // others alone (user can apply-to-all if they want).
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== activeId || !e.naturalSize) return e;
            const rect = fitAspectInImage(
              next,
              e.naturalSize.w,
              e.naturalSize.h,
            );
            const modified = isCropModified(rect, e.naturalSize);
            return { ...e, cropRect: rect, cropIsModified: modified };
          }),
        );
      }
    },
    [activeId],
  );

  const resetCrop = useCallback(() => {
    setAspect(undefined);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== activeId || !e.naturalSize) return e;
        const rect = { x: 0, y: 0, w: e.naturalSize.w, h: e.naturalSize.h };
        return { ...e, cropRect: rect, cropIsModified: false };
      }),
    );
  }, [activeId]);

  // ── Image load (per-active-entry) ─────────────────────────────────────────
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== activeId) return entry;
          if (entry.naturalSize) return entry; // already loaded
          const initialRect = aspect
            ? fitAspectInImage(aspect, w, h)
            : { x: 0, y: 0, w, h };
          const modified = isCropModified(initialRect, { w, h });
          return {
            ...entry,
            naturalSize: { w, h },
            cropRect: initialRect,
            cropIsModified: modified,
          };
        }),
      );
    },
    [activeId, aspect],
  );

  // ── Container measurement ────────────────────────────────────────────────
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setContainerSize({ w: rect.width, h: rect.height });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      setContainerSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    observerRef.current = ro;
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  // ── Display geometry (active entry only) ─────────────────────────────────
  const imageDisplay: ImageDisplay | null = useMemo(() => {
    if (!active?.naturalSize) return null;
    if (containerSize.w <= 0 || containerSize.h <= 0) return null;
    const naturalAspect = active.naturalSize.w / active.naturalSize.h;
    const containerAspect = containerSize.w / containerSize.h;
    let dW: number;
    let dH: number;
    if (containerAspect > naturalAspect) {
      dH = containerSize.h;
      dW = dH * naturalAspect;
    } else {
      dW = containerSize.w;
      dH = dW / naturalAspect;
    }
    return {
      x: (containerSize.w - dW) / 2,
      y: (containerSize.h - dH) / 2,
      w: dW,
      h: dH,
      scale: dW / active.naturalSize.w,
    };
  }, [active, containerSize]);

  const rectDisplay: RectDisplay | null = useMemo(() => {
    if (!imageDisplay || !active?.cropRect) return null;
    return {
      left: imageDisplay.x + active.cropRect.x * imageDisplay.scale,
      top: imageDisplay.y + active.cropRect.y * imageDisplay.scale,
      width: active.cropRect.w * imageDisplay.scale,
      height: active.cropRect.h * imageDisplay.scale,
    };
  }, [imageDisplay, active]);

  // ── Pointer interaction (active entry only) ──────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);

  const beginDrag = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      const current = entriesRef.current.find((entry) => entry.id === activeId);
      if (!current?.cropRect) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRect: current.cropRect,
      });
    },
    [activeId],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !imageDisplay) return;
      const current = entriesRef.current.find((entry) => entry.id === activeId);
      if (!current?.naturalSize) return;
      const deltaX = (e.clientX - drag.startClientX) / imageDisplay.scale;
      const deltaY = (e.clientY - drag.startClientY) / imageDisplay.scale;
      const proposed = applyDragToRect(drag, deltaX, deltaY, aspect);
      const clamped = clampRectInImage(
        proposed,
        aspect,
        current.naturalSize.w,
        current.naturalSize.h,
      );
      const modified = isCropModified(clamped, current.naturalSize);
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === activeId
            ? { ...entry, cropRect: clamped, cropIsModified: modified }
            : entry,
        ),
      );
    },
    [drag, imageDisplay, activeId, aspect],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDrag(null);
    },
    [drag],
  );

  const pointerHandlers = useMemo(
    () => ({
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    [onPointerMove, onPointerUp],
  );

  // ── Bulk crop ────────────────────────────────────────────────────────────
  const applyActiveCropToAll = useCallback(() => {
    const source = entriesRef.current.find((entry) => entry.id === activeId);
    if (!source?.cropRect || !source.naturalSize) {
      toast.error("No crop to apply yet");
      return;
    }
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id === source.id) return entry;
        if (!entry.naturalSize) return entry;
        // Project the source rect into this entry's natural-pixel space
        // using the same ratio (proportional). If aspect is locked, this
        // gives every image the exact same composition.
        const sx = entry.naturalSize.w / source.naturalSize!.w;
        const sy = entry.naturalSize.h / source.naturalSize!.h;
        const projected: CropRect = {
          x: source.cropRect!.x * sx,
          y: source.cropRect!.y * sy,
          w: source.cropRect!.w * sx,
          h: source.cropRect!.h * sy,
        };
        const clamped = clampRectInImage(
          projected,
          aspect,
          entry.naturalSize.w,
          entry.naturalSize.h,
        );
        const modified = isCropModified(clamped, entry.naturalSize);
        return { ...entry, cropRect: clamped, cropIsModified: modified };
      }),
    );
    const otherCount = entriesRef.current.filter(
      (e) => e.id !== source.id,
    ).length;
    toast.success(
      otherCount === 1
        ? "Applied crop to the other image"
        : `Applied crop to ${otherCount} other images`,
    );
  }, [activeId, aspect]);

  // ── Cloud folder ─────────────────────────────────────────────────────────
  const [folderId, setFolderId] = useState<string | null>(
    options.initialFolderId ?? null,
  );

  const { folder: folderRecord } = useFolderNode(folderId);
  const folderName =
    folderRecord?.folderName ??
    (options.defaultFolderPath || DEFAULT_FOLDER_PATH).split("/").pop() ??
    "Crops";
  const folderPath =
    folderRecord?.folderPath ??
    options.defaultFolderPath ??
    DEFAULT_FOLDER_PATH;

  const pickFolder = useCallback(async () => {
    try {
      const picked = await openFolderPicker({
        title: "Choose destination folder",
        description: "Cropped images will be saved here.",
        initialFolderId: folderId,
      });
      if (typeof picked === "string") setFolderId(picked);
      else if (picked === null) setFolderId(null); // Root
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }, [folderId]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  const buildOutputFile = useCallback(
    async (entry: CropStudioEntry): Promise<File> => {
      if (!entry.cropRect || !entry.naturalSize) return entry.file;
      // No-op crop → preserve original bytes, no re-encode.
      if (!entry.cropIsModified) return entry.file;
      return cropFileToFile(entry.file, {
        x: entry.cropRect.x,
        y: entry.cropRect.y,
        width: entry.cropRect.w,
        height: entry.cropRect.h,
      });
    },
    [],
  );

  const saveEntries = useCallback(
    async (idsToSave: string[]) => {
      if (idsToSave.length === 0) {
        toast.info("Nothing to save");
        return;
      }
      const targets = entriesRef.current.filter(
        (entry) => idsToSave.includes(entry.id) && entry.status !== "saving",
      );
      if (targets.length === 0) return;

      setIsSaving(true);

      // Mark selected entries as saving.
      setEntries((prev) =>
        prev.map((entry) =>
          targets.some((t) => t.id === entry.id)
            ? { ...entry, status: "saving" as const, errorMessage: undefined }
            : entry,
        ),
      );

      try {
        // Build cropped files (or pass-through originals).
        const built = await Promise.all(
          targets.map(async (entry) => {
            try {
              const file = await buildOutputFile(entry);
              return { entry, file, error: null as string | null };
            } catch (err) {
              return {
                entry,
                file: null as File | null,
                error: extractErrorMessage(err),
              };
            }
          }),
        );

        // Set entries that failed to crop into "error" state up front.
        const cropFailures = built.filter((b) => b.error !== null);
        if (cropFailures.length > 0) {
          setEntries((prev) =>
            prev.map((entry) => {
              const failed = cropFailures.find((f) => f.entry.id === entry.id);
              if (!failed) return entry;
              return {
                ...entry,
                status: "error" as const,
                errorMessage: failed.error ?? "Crop failed",
              };
            }),
          );
        }

        const uploadable = built.filter(
          (b): b is { entry: CropStudioEntry; file: File; error: null } =>
            b.file !== null,
        );

        if (uploadable.length === 0) {
          toast.error("Could not prepare any files for upload");
          return;
        }

        // Per-entry upload via the universal handler so each call returns
        // the rich NormalizedFile (fileId + share URL), avoiding the
        // filename/size matching dance the old cloudUploadMany required.
        // Uploads run in parallel; per-entry success/failure is collected
        // for the toast tally below.
        type EntryUploadOutcome =
          | { entryId: string; ok: true; fileId?: string; shareUrl: string }
          | { entryId: string; ok: false; error: string };

        const uploadResults: EntryUploadOutcome[] = await Promise.all(
          uploadable.map(async ({ entry, file }): Promise<EntryUploadOutcome> => {
            try {
              const normalized = await upload(
                { kind: "file", file },
                folderId
                  ? {
                      // The handler accepts folderPath today; folderId is
                      // resolved server-side from the persisted record's
                      // parent_folder_id, so passing the path keeps the
                      // wire surface identical.
                      folderPath,
                      visibility: "private",
                      createShareLink: true,
                      shareLinkPermissionLevel: "read",
                    }
                  : {
                      folderPath,
                      visibility: "private",
                      createShareLink: true,
                      shareLinkPermissionLevel: "read",
                    },
              );
              return {
                entryId: entry.id,
                ok: true,
                fileId: normalized.fileId,
                shareUrl: normalized.url ?? "",
              };
            } catch (err) {
              return {
                entryId: entry.id,
                ok: false,
                error: extractErrorMessage(err) || "Upload failed",
              };
            }
          }),
        );

        const outcomeById = new Map<string, EntryUploadOutcome>(
          uploadResults.map((r) => [r.entryId, r]),
        );

        setEntries((prev) =>
          prev.map((entry) => {
            const outcome = outcomeById.get(entry.id);
            if (!outcome) return entry;
            if (outcome.ok === true) {
              return {
                ...entry,
                status: "saved" as const,
                savedFileId: outcome.fileId,
                savedShareUrl: outcome.shareUrl,
                errorMessage: undefined,
              };
            } else {
              return {
                ...entry,
                status: "error" as const,
                errorMessage: outcome.error,
              };
            }
          }),
        );

        const successCount = uploadResults.filter((r) => r.ok).length;
        const failureCount = uploadResults.length - successCount;
        if (successCount > 0 && failureCount === 0) {
          toast.success(
            successCount === 1
              ? "Saved to cloud"
              : `Saved ${successCount} files to cloud`,
          );
        } else if (successCount > 0) {
          toast.warning(`Saved ${successCount}, ${failureCount} failed`);
        } else {
          toast.error("All uploads failed");
        }
      } catch (err) {
        toast.error(extractErrorMessage(err));
        setEntries((prev) =>
          prev.map((entry) =>
            targets.some((t) => t.id === entry.id) && entry.status === "saving"
              ? {
                  ...entry,
                  status: "error" as const,
                  errorMessage: extractErrorMessage(err),
                }
              : entry,
          ),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [buildOutputFile, upload, folderId, folderPath],
  );

  const saveActive = useCallback(async () => {
    if (!activeId) return;
    await saveEntries([activeId]);
  }, [activeId, saveEntries]);

  const saveAll = useCallback(async () => {
    const ids = entriesRef.current
      .filter((e) => e.status !== "saved" && e.status !== "saving")
      .map((e) => e.id);
    await saveEntries(ids);
  }, [saveEntries]);

  // ── Derived counters ─────────────────────────────────────────────────────
  const pendingCount = entries.filter(
    (e) => e.status === "pending" || e.status === "error",
  ).length;
  const savedCount = entries.filter((e) => e.status === "saved").length;

  // ── Final controller object ──────────────────────────────────────────────
  return {
    // CropViewportPort
    imageUrl: active?.imageUrl ?? null,
    naturalSize: active?.naturalSize ?? null,
    cropRect: active?.cropRect ?? null,
    imageDisplay,
    rectDisplay,
    setContainerRef,
    handleImageLoad,
    beginDrag,
    pointerHandlers,

    // CropAspectPort
    aspect,
    setAspect: handleSetAspect,
    resetCrop,

    // Tabs
    entries,
    activeId,
    active,
    hasEntries: entries.length > 0,
    selectEntry,
    removeEntry,
    addFiles,
    clearAll,

    // Active entry helpers
    cropIsModified: active?.cropIsModified ?? false,

    // Bulk crop
    applyActiveCropToAll,

    // Folder
    folderId,
    folderName,
    folderPath,
    pickFolder,

    // Save
    isSaving,
    pendingCount,
    savedCount,
    saveActive,
    saveAll,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isCropModified(
  rect: CropRect,
  natural: { w: number; h: number },
): boolean {
  return (
    rect.x > 0.5 ||
    rect.y > 0.5 ||
    rect.x + rect.w < natural.w - 0.5 ||
    rect.y + rect.h < natural.h - 0.5
  );
}
