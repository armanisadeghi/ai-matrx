"use client";

/**
 * useImageStudio — central state hook for the Image Studio tool.
 *
 * Tracks:
 *   - The source files the user has dropped
 *   - The set of selected preset ids (applied to all files)
 *   - Global format + quality + background colour overrides
 *   - The processing/save lifecycle
 *
 * Side effects:
 *   - Creates + revokes object URLs for the original previews
 *   - Calls /api/images/studio/process per file when the user clicks "Generate"
 *   - Dispatches cloud-files thunks when the user clicks "Save to library" —
 *     variants land under `Images/Generated/image-studio/{folder}` and are
 *     addressable by `fileId` from the cloudFiles slice thereafter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ImageFit,
  ImageMetadata,
  ImagePosition,
  OutputFormat,
  ProcessStudioRequestBody,
  ProcessStudioResponse,
  ProcessedVariant,
  StudioMetadataStatus,
  StudioSourceFile,
} from "../types";
import { slugifyFilename } from "../utils/slugify-filename";
import { buildDescribePreview } from "../utils/build-describe-preview";
import { DESCRIBE_TEMP_FOLDER_PATH } from "../constants/describe";
import { getSystemShortcut } from "@/features/agents/constants/system-shortcuts";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { uploadFiles, ensureFolderPath } from "@/features/files/redux/thunks";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { ensureShortcutLoaded } from "@/features/agents/redux/agent-shortcuts/thunks";
import type { Visibility } from "@/features/files";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

/**
 * Folder-segment sanitizer. Cloud-files folder names tolerate spaces, but
 * we strip them anyway so per-file subfolders look clean in the tree and
 * sort alongside the variants inside.
 */
function sanitizePathSegment(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const DEFAULT_QUALITY = 88;
const DEFAULT_FORMAT: OutputFormat = "webp";
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_FIT: ImageFit = "cover";
const DEFAULT_POSITION: ImagePosition = "center";

export interface UseImageStudioOptions {
  /** Default folder path inside the Supabase bucket when saving. */
  defaultFolder?: string;
}

export interface UseImageStudioResult {
  files: StudioSourceFile[];
  selectedPresetIds: string[];
  format: OutputFormat;
  quality: number;
  backgroundColor: string;
  fit: ImageFit;
  position: ImagePosition;
  isProcessing: boolean;
  isSaving: boolean;
  lastSaveResult: import("../types").SaveStudioResult | null;
  error: string | null;

  // File management
  addFiles: (incoming: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearAll: () => void;
  setFilenameBase: (fileId: string, base: string) => void;

  // Preset management
  togglePreset: (presetId: string) => void;
  selectPresets: (presetIds: string[]) => void;
  deselectAllPresets: () => void;
  applyBundle: (presetIds: string[]) => void;

  // Global controls
  setFormat: (format: OutputFormat) => void;
  setQuality: (quality: number) => void;
  setBackgroundColor: (color: string) => void;
  setFit: (fit: ImageFit) => void;
  setPosition: (position: ImagePosition) => void;

  // Actions
  generate: () => Promise<void>;
  /**
   * Save every generated variant to the user's cloud-files library.
   * Visibility defaults to `"private"` — the user opts in to `"public"`
   * via the Save panel toggle when they want a CDN-served URL safe to
   * share publicly.
   */
  saveAll: (
    folder?: string,
    options?: { visibility?: Visibility },
  ) => Promise<void>;

  // AI describe
  describeFile: (fileId: string, contextHint?: string) => Promise<void>;
  describeAll: (contextHint?: string) => Promise<void>;
  isDescribing: boolean;
  describingFileIds: ReadonlySet<string>;
  updateImageMetadata: (fileId: string, patch: Partial<ImageMetadata>) => void;
  clearImageMetadata: (fileId: string) => void;

  // Derived
  totalVariantCount: number;
  generatedVariantCount: number;
  totalOutputBytes: number;
}

let fileIdCounter = 0;
const nextFileId = () => `studio-file-${Date.now()}-${++fileIdCounter}`;

/**
 * Coerce arbitrary unknown JSON into an ImageMetadata. Missing fields fall
 * back to safe defaults so the UI can still render even if the agent skipped
 * a key. Returns null only when the input isn't an object at all.
 */
function coerceImageMetadata(raw: unknown): ImageMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const stringField = (key: string) => {
    const v = r[key];
    return typeof v === "string" ? v : "";
  };
  const stringArray = (key: string): string[] => {
    const v = r[key];
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string")
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return [];
  };
  return {
    filename_base: stringField("filename_base"),
    alt_text: stringField("alt_text"),
    caption: stringField("caption"),
    title: stringField("title"),
    description: stringField("description"),
    keywords: stringArray("keywords"),
    dominant_colors: stringArray("dominant_colors"),
  };
}

async function decodeDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const objectUrl = URL.createObjectURL(file);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        URL.revokeObjectURL(objectUrl);
        resolve({ width: w, height: h });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch {
    return null;
  }
}

export function useImageStudio(
  options: UseImageStudioOptions = {},
): UseImageStudioResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const [files, setFiles] = useState<StudioSourceFile[]>([]);
  // Mirror `files` into a ref so async actions (saveAll, describeFile) can
  // read the LATEST state mid-flight. React's state-closure semantics mean
  // a saveAll() invoked immediately after `await generate()` would see the
  // pre-generate snapshot of `files` — every variant.dataUrl missing —
  // unless we read through this ref. Updated synchronously on every render
  // so the ref is fresh by the time React commits.
  const filesRef = useRef<StudioSourceFile[]>(files);
  filesRef.current = files;
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [format, setFormat] = useState<OutputFormat>(DEFAULT_FORMAT);
  const [quality, setQuality] = useState<number>(DEFAULT_QUALITY);
  const [backgroundColor, setBackgroundColor] =
    useState<string>(DEFAULT_BACKGROUND);
  const [fit, setFit] = useState<ImageFit>(DEFAULT_FIT);
  const [position, setPosition] = useState<ImagePosition>(DEFAULT_POSITION);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveResult, setLastSaveResult] = useState<
    import("../types").SaveStudioResult | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs on unmount
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const addFiles = useCallback(async (incoming: File[]) => {
    const imageFiles = incoming.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const added: StudioSourceFile[] = await Promise.all(
      imageFiles.map(async (file) => {
        const objectUrl = URL.createObjectURL(file);
        urlsRef.current.add(objectUrl);
        const dim = await decodeDimensions(file);
        const filenameBase = slugifyFilename(file.name);
        return {
          id: nextFileId(),
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          width: dim?.width ?? null,
          height: dim?.height ?? null,
          objectUrl,
          filenameBase,
          status: "idle" as const,
          error: null,
          variants: {},
          file,
          imageMetadata: null,
          metadataStatus: "idle" as const,
          metadataError: null,
          describePreviewFileId: null,
        };
      }),
    );

    setFiles((prev) => [...prev, ...added]);
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === fileId);
      if (target) {
        URL.revokeObjectURL(target.objectUrl);
        urlsRef.current.delete(target.objectUrl);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const clearAll = useCallback(() => {
    setFiles((prev) => {
      for (const f of prev) {
        URL.revokeObjectURL(f.objectUrl);
        urlsRef.current.delete(f.objectUrl);
      }
      return [];
    });
    setSelectedPresetIds([]);
    setLastSaveResult(null);
    setError(null);
  }, []);

  const setFilenameBase = useCallback((fileId: string, base: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, filenameBase: slugifyFilename(base) } : f,
      ),
    );
  }, []);

  const togglePreset = useCallback((presetId: string) => {
    setSelectedPresetIds((prev) =>
      prev.includes(presetId)
        ? prev.filter((id) => id !== presetId)
        : [...prev, presetId],
    );
  }, []);

  const selectPresets = useCallback((presetIds: string[]) => {
    setSelectedPresetIds((prev) => {
      const set = new Set(prev);
      for (const id of presetIds) set.add(id);
      return Array.from(set);
    });
  }, []);

  const deselectAllPresets = useCallback(() => {
    setSelectedPresetIds([]);
  }, []);

  const applyBundle = useCallback((presetIds: string[]) => {
    setSelectedPresetIds(presetIds);
  }, []);

  // The core action: for each file, send it + the selected variants to the
  // process API, then fold the returned dataUrls back into the file entry.
  const generate = useCallback(async () => {
    if (files.length === 0 || selectedPresetIds.length === 0) return;
    setIsProcessing(true);
    setError(null);

    // Mark all in-flight files as processing
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: "processing",
        error: null,
        variants: {},
      })),
    );

    await Promise.all(
      files.map(async (sourceFile) => {
        const spec: ProcessStudioRequestBody = {
          quality,
          defaultFormat: format,
          backgroundColor,
          defaultFit: fit,
          defaultPosition: position,
          filenameBase: sourceFile.filenameBase,
          variants: selectedPresetIds.map((presetId) => ({
            presetId,
            filenameBase: sourceFile.filenameBase,
          })),
        };

        const formData = new FormData();
        formData.append("file", sourceFile.file);
        formData.append("spec", JSON.stringify(spec));

        try {
          const res = await fetch("/api/images/studio/process", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              (body as { error?: string }).error ??
                `Process failed (${res.status})`,
            );
          }
          const data = (await res.json()) as ProcessStudioResponse;

          setFiles((prev) =>
            prev.map((f) => {
              if (f.id !== sourceFile.id) return f;
              const variants: Record<string, ProcessedVariant> = {};
              for (const v of data.variants) {
                if (v.error || !v.dataUrl) continue;
                variants[v.presetId] = {
                  presetId: v.presetId,
                  filename: v.filename,
                  width: v.width,
                  height: v.height,
                  format: v.format,
                  quality: v.quality,
                  size: v.size,
                  dataUrl: v.dataUrl,
                  compressionRatio: v.compressionRatio,
                  fit: v.fit,
                  position: v.position,
                  fileId: null,
                  savedAt: null,
                };
              }
              return {
                ...f,
                status: "processed",
                error: null,
                width: data.original.width || f.width,
                height: data.original.height || f.height,
                variants,
              };
            }),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to process";
          setFiles((prev) =>
            prev.map((f) =>
              f.id === sourceFile.id
                ? { ...f, status: "error", error: msg }
                : f,
            ),
          );
        }
      }),
    );

    setIsProcessing(false);
  }, [
    files,
    selectedPresetIds,
    quality,
    format,
    backgroundColor,
    fit,
    position,
  ]);

  const saveAll = useCallback(
    async (folder?: string, saveOptions?: { visibility?: Visibility }) => {
      // Default to PUBLIC so we get permanent Cloudflare CDN URLs on every
      // variant. The whole point of saving from the studio is to share the
      // result — private + signed-URL would mean every consumer paste
      // expires in an hour. Callers that need private can pass it explicitly.
      const visibility: Visibility = saveOptions?.visibility ?? "public";

      // Collect every variant that hasn't been saved yet. Read through
      // `filesRef.current` so we see variants that were just produced by a
      // sibling `await studio.generate()` — the closure-captured `files`
      // would still be the pre-generate snapshot.
      const liveFiles = filesRef.current;
      const pending: Array<{
        studioFileId: string;
        variantKey: string;
        filename: string;
        presetId: string;
        dataUrl: string;
      }> = [];
      for (const f of liveFiles) {
        for (const [key, v] of Object.entries(f.variants)) {
          if (v.savedAt) continue;
          pending.push({
            studioFileId: f.id,
            variantKey: key,
            filename: v.filename,
            presetId: v.presetId,
            dataUrl: v.dataUrl,
          });
        }
      }
      if (pending.length === 0) return;

      setIsSaving(true);
      setError(null);

      try {
        // Anchor the save under the canonical Images/Generated tree so
        // everything the studio produces is grouped and filterable.
        const rootSegment = (
          folder ??
          options.defaultFolder ??
          "image-studio"
        )
          .trim()
          .replace(/^\/+|\/+$/g, "");
        const rootFolderPath = rootSegment
          ? `${CloudFolders.IMAGES_GENERATED}/${rootSegment}`
          : CloudFolders.IMAGES_GENERATED;

        // Group pending variants by source file so each upload batch can
        // carry that file's specific AI-described metadata AND land in its
        // own per-source subfolder. Otherwise 30 variants from 5 different
        // sources would all jumble together in one folder.
        const pendingByFile = new Map<string, typeof pending>();
        for (const p of pending) {
          const arr = pendingByFile.get(p.studioFileId) ?? [];
          arr.push(p);
          pendingByFile.set(p.studioFileId, arr);
        }

        const fileIdByName = new Map<string, string>();
        const publicUrlByName = new Map<string, string | null>();
        const allUploaded: string[] = [];
        const allFailed: Array<{ name: string; error: string }> = [];
        let lastFolderPath = rootFolderPath;
        let lastParentFolderId: string | null = null;

        for (const [studioFileId, group] of pendingByFile) {
          const sourceFile = liveFiles.find((f) => f.id === studioFileId);
          if (!sourceFile) continue;

          // Each source file gets its own subfolder so all of its variants
          // live together. The leaf is the source's editable filenameBase
          // (which the AI describe agent or the user will have set to a
          // proper, descriptive name by the time Save runs).
          const perFileSegment = sanitizePathSegment(sourceFile.filenameBase) ||
            sanitizePathSegment(sourceFile.originalName) ||
            studioFileId;
          const folderPath = `${rootFolderPath}/${perFileSegment}`;

          const parentFolderId = await dispatch(
            ensureFolderPath({ folderPath, visibility: "private" }),
          ).unwrap();
          lastFolderPath = folderPath;
          lastParentFolderId = parentFolderId;

          const uploadables = await Promise.all(
            group.map(async (p) => {
              const blob = await fetch(p.dataUrl).then((r) => r.blob());
              return new File([blob], p.filename, {
                type: blob.type || "image/webp",
              });
            }),
          );

          const knownIdsBefore = new Set<string>(
            Object.keys(store.getState().cloudFiles.filesById),
          );

          const meta = sourceFile.imageMetadata;
          const result = await dispatch(
            uploadFiles({
              files: uploadables,
              parentFolderId,
              visibility,
              metadata: {
                source: "image-studio",
                folder_segment: rootSegment,
                source_filename_base: sourceFile.filenameBase,
                studio_file_id: studioFileId,
                requested_visibility: visibility,
                ...(meta
                  ? {
                      alt_text: meta.alt_text,
                      caption: meta.caption,
                      title: meta.title,
                      description: meta.description,
                      keywords: meta.keywords,
                      dominant_colors: meta.dominant_colors,
                    }
                  : {}),
              },
              concurrency: 3,
            }),
          ).unwrap();

          // Match new file ids back to variants by filename — and pick up
          // the publicUrl that the API wrote into the cloudFiles slice
          // (set by `apiFileRecordToCloudFile` from `row.public_url`). For
          // public uploads this is a Cloudflare CDN URL with a checksum
          // cache-buster; for private uploads it's null and the tile will
          // fall back to a signed URL on demand.
          const fresh = Object.values(
            store.getState().cloudFiles.filesById,
          ).filter((f) => !knownIdsBefore.has(f.id));
          for (const file of fresh) {
            fileIdByName.set(file.fileName, file.id);
            publicUrlByName.set(file.fileName, file.publicUrl ?? null);
          }

          allUploaded.push(...result.uploaded);
          allFailed.push(...result.failed);
        }

        const failedFilenamesSet = new Set<string>(
          allFailed.map((f) => f.name),
        );
        const savedAt = new Date().toISOString();

        setFiles((prev) =>
          prev.map((sourceFile) => {
            const nextVariants: Record<string, ProcessedVariant> = {};
            for (const [key, v] of Object.entries(sourceFile.variants)) {
              if (failedFilenamesSet.has(v.filename)) {
                nextVariants[key] = v;
                continue;
              }
              const fileId = fileIdByName.get(v.filename);
              if (!fileId) {
                nextVariants[key] = v;
                continue;
              }
              nextVariants[key] = {
                ...v,
                fileId,
                publicUrl: publicUrlByName.get(v.filename) ?? null,
                savedAt,
              };
            }
            return { ...sourceFile, variants: nextVariants };
          }),
        );

        setLastSaveResult({
          folderPath: lastFolderPath,
          parentFolderId: lastParentFolderId ?? "",
          savedCount: allUploaded.length,
          failedFilenames: allFailed.map((f) => f.name),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setError(msg);
      } finally {
        setIsSaving(false);
      }
    },
    [dispatch, files, options.defaultFolder, store],
  );

  // ── AI Describe ─────────────────────────────────────────────────────────

  const trigger = useShortcutTrigger();
  const [describingFileIds, setDescribingFileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const isDescribing = describingFileIds.size > 0;

  // Mutates the file at `fileId` in place via React state.
  const setMetadataState = useCallback(
    (
      fileId: string,
      patch: {
        metadataStatus?: StudioMetadataStatus;
        metadataError?: string | null;
        imageMetadata?: ImageMetadata | null;
        describePreviewFileId?: string | null;
        filenameBase?: string;
      },
    ) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  /** Wait until the active-requests slice flips `jsonExtractionComplete` true. */
  const waitForExtraction = useCallback(
    async (
      requestId: string,
      timeoutMs = 120_000,
      intervalMs = 200,
    ): Promise<ImageMetadata | null> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const state = store.getState();
        const complete = selectJsonExtractionComplete(requestId)(state);
        if (complete) {
          const snapshot = selectFirstExtractedObject(requestId)(state);
          if (!snapshot || snapshot.type !== "object") return null;
          // The agent's response is wrapped in { image_metadata: { ... } }
          // — accept either shape so future prompt tweaks stay compatible.
          const value = snapshot.value as Record<string, unknown>;
          const candidate =
            (value.image_metadata as Record<string, unknown> | undefined) ??
            value;
          return coerceImageMetadata(candidate);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return null;
    },
    [store],
  );

  const describeFile = useCallback(
    async (fileId: string, contextHint?: string) => {
      const file = store.getState() as never;
      void file;
      // Re-read the file from React state because closures may be stale.
      let snapshot: StudioSourceFile | undefined;
      setFiles((prev) => {
        snapshot = prev.find((f) => f.id === fileId);
        return prev;
      });
      if (!snapshot) return;

      // Already in flight — bail out.
      if (describingFileIds.has(fileId)) return;
      setDescribingFileIds((prev) => {
        const next = new Set(prev);
        next.add(fileId);
        return next;
      });

      const DESCRIBE = getSystemShortcut("image-studio-describe-01");

      try {
        await dispatch(ensureShortcutLoaded(DESCRIBE.id)).unwrap();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not load describe agent";
        setMetadataState(fileId, {
          metadataStatus: "error",
          metadataError: msg,
        });
        setDescribingFileIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        return;
      }

      setMetadataState(fileId, {
        metadataStatus: "uploading-source",
        metadataError: null,
      });

      let conversationId: string | null = null;

      try {
        // 1. Build a small WebP preview (≤1024px) — fast to upload, plenty
        //    for vision models.
        const preview = await buildDescribePreview(
          snapshot.file,
          snapshot.filenameBase,
        );

        // 2. Upload to a hidden temp folder under the user's cloud library.
        const parentFolderId = await dispatch(
          ensureFolderPath({
            folderPath: DESCRIBE_TEMP_FOLDER_PATH,
            visibility: "private",
          }),
        ).unwrap();

        const knownIds = new Set(
          Object.keys(store.getState().cloudFiles.filesById),
        );
        await dispatch(
          uploadFiles({
            files: [preview],
            parentFolderId,
            visibility: "private",
            metadata: {
              source: "image-studio-describe",
              studio_file_id: fileId,
            },
          }),
        ).unwrap();

        // Match the new file by name in the cloud-files slice.
        const fresh = Object.values(store.getState().cloudFiles.filesById).find(
          (f) => !knownIds.has(f.id) && f.fileName === preview.name,
        );
        if (!fresh) {
          throw new Error("Preview uploaded but its file id was not found");
        }
        const previewFileId = fresh.id;
        setMetadataState(fileId, {
          metadataStatus: "describing",
          describePreviewFileId: previewFileId,
        });

        // 3. Trigger the describe shortcut.
        //
        //    KNOWN ANTI-PATTERN — `autoRun: false` on a programmatic trigger.
        //    Per the agent-execution-redux skill, callers should NEVER override
        //    autoRun programmatically. autoRun: false exists to gate on a user
        //    typing into the variable panel — there's no user here.
        //
        //    We're forced into it because the launch payload has no way to
        //    carry an instance resource (the image), and resources can only
        //    be attached after the conversationId exists. Until the launcher
        //    accepts resources directly (or the shortcut row binds a scope
        //    key to a resource), we manually do create → attach → execute.
        //    TODO(arman): drop this once the launcher carries resources.
        //
        //    NOTE: `jsonExtraction` is intentionally NOT passed here — it
        //    now lives on the shortcut row (`agx_shortcut.json_extraction`)
        //    and the launch thunk reads it from there. If you ever see
        //    "did not return structured JSON" again, the row's column is
        //    null, not the call site's job.
        const launchResult = await trigger(DESCRIBE.id, {
          sourceFeature: "image-studio",
          config: { autoRun: false, displayMode: "background" },
          ...(contextHint?.trim()
            ? { runtime: { userInput: contextHint.trim() } }
            : {}),
        });
        conversationId = launchResult.conversationId;

        // 4. Attach the preview as an image resource.
        const resourceId = `studio-describe-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        dispatch(
          addResource({
            conversationId,
            blockType: "image",
            source: {
              file_id: previewFileId,
              mime_type: "image/webp",
            },
            resourceId,
          }),
        );
        // Marks status:"ready" so the launch waits no longer than necessary.
        dispatch(
          setResourcePreview({
            conversationId,
            resourceId,
            preview: snapshot.originalName,
          }),
        );

        // 5. Now actually run the agent and capture the requestId.
        const execResult = await dispatch(
          executeInstance({ conversationId }),
        ).unwrap();
        const requestId = execResult.requestId;
        if (!requestId) {
          throw new Error("Describe agent did not return a request id");
        }

        // 6. Wait for the JSON extractor to finalize, then fold metadata in.
        const metadata = await waitForExtraction(requestId);
        if (!metadata) {
          throw new Error("Describe agent did not return structured JSON");
        }

        const slugged = slugifyFilename(
          metadata.filename_base || snapshot.filenameBase,
        );
        setMetadataState(fileId, {
          metadataStatus: "ready",
          metadataError: null,
          imageMetadata: { ...metadata, filename_base: slugged },
          // Adopt the agent-suggested filename automatically. The user can
          // still edit it from the file card header.
          filenameBase: slugged,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Describe agent failed";
        setMetadataState(fileId, {
          metadataStatus: "error",
          metadataError: msg,
        });
      } finally {
        setDescribingFileIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        // Tear down the conversation so the slice doesn't grow unbounded
        // when users describe many files.
        if (conversationId) {
          dispatch(destroyInstanceIfAllowed(conversationId));
        }
      }
    },
    [
      dispatch,
      store,
      describingFileIds,
      setMetadataState,
      trigger,
      waitForExtraction,
    ],
  );

  const describeAll = useCallback(
    async (contextHint?: string) => {
      // Run sequentially — each describe is a real LLM call and parallel
      // requests would just rate-limit ourselves.
      const ids = files
        .filter(
          (f) =>
            f.metadataStatus !== "describing" &&
            f.metadataStatus !== "uploading-source",
        )
        .map((f) => f.id);
      for (const id of ids) {
        await describeFile(id, contextHint);
      }
    },
    [files, describeFile],
  );

  const updateImageMetadata = useCallback(
    (fileId: string, patch: Partial<ImageMetadata>) => {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== fileId) return f;
          const base = f.imageMetadata ?? {
            filename_base: f.filenameBase,
            alt_text: "",
            caption: "",
            title: "",
            description: "",
            keywords: [],
            dominant_colors: [],
          };
          const next: ImageMetadata = { ...base, ...patch };
          // Sync filename if the user edited filename_base directly.
          const filenameBase = patch.filename_base
            ? slugifyFilename(patch.filename_base)
            : f.filenameBase;
          return {
            ...f,
            imageMetadata: { ...next, filename_base: filenameBase },
            filenameBase,
          };
        }),
      );
    },
    [],
  );

  const clearImageMetadata = useCallback((fileId: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              imageMetadata: null,
              metadataStatus: "idle" as const,
              metadataError: null,
            }
          : f,
      ),
    );
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────

  const totalVariantCount = useMemo(
    () => files.length * selectedPresetIds.length,
    [files.length, selectedPresetIds.length],
  );

  const generatedVariantCount = useMemo(
    () => files.reduce((sum, f) => sum + Object.keys(f.variants).length, 0),
    [files],
  );

  const totalOutputBytes = useMemo(
    () =>
      files.reduce(
        (sum, f) =>
          sum + Object.values(f.variants).reduce((s, v) => s + v.size, 0),
        0,
      ),
    [files],
  );

  return {
    files,
    selectedPresetIds,
    format,
    quality,
    backgroundColor,
    fit,
    position,
    isProcessing,
    isSaving,
    lastSaveResult,
    error,

    addFiles,
    removeFile,
    clearAll,
    setFilenameBase,

    togglePreset,
    selectPresets,
    deselectAllPresets,
    applyBundle,

    setFormat,
    setQuality,
    setBackgroundColor,
    setFit,
    setPosition,

    generate,
    saveAll,

    describeFile,
    describeAll,
    isDescribing,
    describingFileIds,
    updateImageMetadata,
    clearImageMetadata,

    totalVariantCount,
    generatedVariantCount,
    totalOutputBytes,
  };
}
