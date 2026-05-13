"use client";

/**
 * EmbeddedImageStudio
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in image-input component for any form that needs ONE source image
 * turned into N predefined platform variants — all with permanent
 * Cloudflare CDN URLs.
 *
 * Pipeline:
 *   1. Drop / paste / pick a file       → InitialCropWindow opens
 *   2. User crops (or skips)            → file is queued in a private studio
 *   3. User confirms the filename       → Sharp generates every preset
 *   4. Variants auto-upload as PUBLIC   → cloud-files returns CDN URLs
 *   5. Caller's `onSaved` receives      → { byPreset, primary, ... }
 *
 * The host form just plumbs the resulting URL(s) into its state. The
 * variants live in `Images/Generated/<rootSegment>/<filenameBase>/` so
 * everything for one source ships in one folder.
 *
 * Why this exists (not just `<ImageAssetUploader>`):
 *   - Auto-generates EVERY caller-requested preset, not just the one the
 *     UI surfaces. SavePageTab needs `og-image`, but the user gets a
 *     1400², 400², 128² as well — for free.
 *   - Always uploads via the cloud-files thunk → permanent CDN URLs that
 *     never expire. No more base64 data URLs in clipboards.
 *   - Per-source subfolders so 30 variants for one image stay grouped.
 *   - Filename-rename gate before mass variant creation.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useImageStudio } from "../hooks/useImageStudio";
import { getPresetById } from "../presets";
import { slugifyFilename } from "../utils/slugify-filename";
import { formatBytes, formatDimensions } from "../utils/format-bytes";
import type { ImagePosition, StudioSourceFile } from "../types";
import dynamic from "next/dynamic";
import { StudioDropZone } from "./StudioDropZone";
import { useFilePicker } from "@/features/files";

// InitialCropWindow renders <WindowPanel> as styling chrome — keep it
// out of EmbeddedImageStudio's static graph so the parent's chunk
// doesn't pull the whole window-panels system. See ImageStudioShell.tsx
// for the same rationale; this is the second consumer.
const InitialCropWindow = dynamic(
  () =>
    import("./InitialCropWindow").then((m) => ({
      default: m.InitialCropWindow,
    })),
  { ssr: false, loading: () => null },
);
import { useAppStore } from "@/lib/redux/hooks";
import { getSignedUrl } from "@/features/files/api/files";

// ── Public surface ───────────────────────────────────────────────────────

export interface EmbeddedImageStudioResult {
  /** Map of presetId → permanent public CDN URL for that variant. */
  byPreset: Record<string, string>;
  /**
   * The single "primary" URL the host cares about. Falls back to the
   * first preset id in `presetIds` if `primaryPresetId` wasn't set.
   */
  primary: { presetId: string; publicUrl: string } | null;
  /** What the user named the source — also the per-source subfolder. */
  filenameBase: string;
  /** Cloud-files folder id where everything was written. */
  parentFolderId: string;
}

export interface EmbeddedImageStudioProps {
  /**
   * Preset ids to auto-generate. Pulled from `presets.ts`. The component
   * pre-selects them on mount and generates them all the moment the user
   * clicks Generate.
   */
  presetIds: string[];

  /**
   * Folder segment under `Images/Generated/`. Defaults to the host
   * feature's identifier (e.g. "html-pages", "agent-apps"). Variants
   * land in `Images/Generated/<rootFolderSegment>/<filenameBase>/`.
   */
  rootFolderSegment?: string;

  /**
   * Default value for the source-file slug. The user can rename inline
   * before generating. Strongly recommended: pass the host's primary
   * label (e.g. the page title). Falls back to the original filename.
   */
  defaultFilenameBase?: string;

  /**
   * The preset whose URL the host cares about most. The result's
   * `primary` will be set to this one's public URL. Defaults to
   * `presetIds[0]`.
   */
  primaryPresetId?: string;

  /** Disable the whole component. */
  disabled?: boolean;

  /** Pre-existing public URL — shown as a thumbnail with a Replace CTA. */
  initialUrl?: string | null;

  /**
   * Fires once the public CDN URLs are available (after save completes).
   * Re-fires when the user replaces the image.
   */
  onSaved?: (result: EmbeddedImageStudioResult) => void;

  /** Fires when the user clears the image. */
  onCleared?: () => void;

  /** Optional UI label shown above the component. */
  label?: string;

  /**
   * When `true`, suppresses the `label` heading rendered by the component's
   * own `Wrapper`. Use this when the host already shows its own title
   * (e.g. a sidebar route header) and you want to avoid duplicating it.
   * Default `false` — the label renders if provided.
   */
  hideTitle?: boolean;

  /** Extra wrapper class names. */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────

export function EmbeddedImageStudio({
  presetIds,
  rootFolderSegment = "image-studio",
  defaultFilenameBase,
  primaryPresetId,
  disabled = false,
  initialUrl = null,
  onSaved,
  onCleared,
  label,
  hideTitle = false,
  className,
}: EmbeddedImageStudioProps) {
  const effectiveLabel = hideTitle ? undefined : label;
  const studio = useImageStudio({ defaultFolder: rootFolderSegment });
  const store = useAppStore();
  const filePicker = useFilePicker();

  // ── Local UI state ────────────────────────────────────────────────────
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [renamingNow, setRenamingNow] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [showInitial, setShowInitial] = useState(Boolean(initialUrl));
  const [autoFlowError, setAutoFlowError] = useState<string | null>(null);

  // External URL — populated when the user pastes a URL or picks a file
  // from their library. The host receives this URL via `onSaved` directly,
  // without any pipeline run. We track it locally so we can render the
  // "current" preview + Replace controls.
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [externalSource, setExternalSource] = useState<
    "url" | "library" | null
  >(null);
  const [externalLabel, setExternalLabel] = useState<string | null>(null);
  const [pasteUrlInput, setPasteUrlInput] = useState("");
  const [intakeMode, setIntakeMode] = useState<"choose" | "drop" | "url">(
    "choose",
  );

  // Pipeline lifecycle — used only when the user goes through the
  // drop→crop→generate→save path. URL/library picks skip this entirely.
  const [pipelineState, setPipelineState] = useState<
    "idle" | "ready-to-generate" | "generating" | "saving" | "done" | "error"
  >("idle");

  // Always read the latest studio mid-flight. After `await studio.generate()`
  // the studio object has rotated and our closure-captured `studio.saveAll`
  // would otherwise close over the pre-generate snapshot.
  const studioRef = useRef(studio);
  studioRef.current = studio;

  // The component manages a single source file at a time. If the user
  // drops something while a previous result is showing, we clear and
  // start fresh.
  const sourceFile: StudioSourceFile | undefined = studio.files[0];

  // Pre-select the requested presets the moment the studio is ready.
  useEffect(() => {
    if (presetIds.length === 0) return;
    // Only set if different to avoid feedback loops.
    const same =
      studio.selectedPresetIds.length === presetIds.length &&
      studio.selectedPresetIds.every((id, i) => id === presetIds[i]);
    if (!same) studio.applyBundle(presetIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetIds]);

  // ── Drop / crop queue ─────────────────────────────────────────────────
  const queueForCrop = useCallback(
    (incoming: File[]) => {
      if (disabled) return;
      const images = incoming.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      // Replace existing source — single-file scope.
      studio.clearAll();
      setPipelineState("idle");
      setAutoFlowError(null);
      setShowInitial(false);
      setPendingFiles(images.slice(0, 1));
    },
    [disabled, studio],
  );

  const handleCropComplete = useCallback(
    async (results: File[]) => {
      setPendingFiles([]);
      await studio.addFiles(results);
      // Apply the default filename base IF the original-name slug
      // would override a more meaningful caller-provided default.
      const dropped = results[0];
      if (dropped && defaultFilenameBase) {
        const desired = slugifyFilename(defaultFilenameBase);
        if (desired) {
          // The store's addFiles already auto-set filenameBase
          // to the original name's slug — overwrite to the
          // caller's preference if they bothered to set one.
          queueMicrotask(() => {
            const f = studio.files[0];
            if (f) studio.setFilenameBase(f.id, desired);
          });
        }
      }
      setPipelineState("ready-to-generate");
    },
    [studio, defaultFilenameBase],
  );

  const handleCropCancel = useCallback(() => {
    setPendingFiles([]);
  }, []);

  // ── Rename ────────────────────────────────────────────────────────────
  const startRename = useCallback(() => {
    if (!sourceFile) return;
    setRenameDraft(sourceFile.filenameBase);
    setRenamingNow(true);
  }, [sourceFile]);

  const commitRename = useCallback(() => {
    if (!sourceFile) return;
    const next = slugifyFilename(renameDraft);
    if (next) studio.setFilenameBase(sourceFile.id, next);
    setRenamingNow(false);
  }, [sourceFile, renameDraft, studio]);

  // ── Pipeline: Generate → Save (auto) ──────────────────────────────────
  // Always read through `studioRef.current` because the closure-captured
  // `studio` rotates on every render. Calling the OLD studio.saveAll
  // after `await studio.generate()` would close over the pre-generate
  // files snapshot — every variant's dataUrl/publicUrl missing.
  const runPipeline = useCallback(async () => {
    const live = studioRef.current;
    if (!live.files[0]) return;
    setAutoFlowError(null);
    setPipelineState("generating");
    try {
      await studioRef.current.generate();
      // Yield to let React commit the generated state before we read.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const errored = studioRef.current.files.some((f) => f.status === "error");
      if (errored) {
        throw new Error("One or more variants failed to generate");
      }
      setPipelineState("saving");
      await studioRef.current.saveAll(rootFolderSegment, {
        visibility: "public",
      });
      setPipelineState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pipeline failed";
      setAutoFlowError(msg);
      setPipelineState("error");
      toast.error(msg);
    }
  }, [rootFolderSegment]);

  // After saveAll resolves we fold the public URLs back to the host.
  useEffect(() => {
    if (pipelineState !== "done") return;
    const f = studio.files[0];
    if (!f) return;
    const byPreset: Record<string, string> = {};
    for (const presetId of presetIds) {
      const v = f.variants[presetId];
      if (v?.publicUrl) byPreset[presetId] = v.publicUrl;
    }
    const primaryId = primaryPresetId ?? presetIds[0] ?? null;
    const primaryUrl = primaryId ? byPreset[primaryId] : null;
    const result: EmbeddedImageStudioResult = {
      byPreset,
      primary:
        primaryId && primaryUrl
          ? { presetId: primaryId, publicUrl: primaryUrl }
          : null,
      filenameBase: f.filenameBase,
      parentFolderId: studio.lastSaveResult?.parentFolderId ?? "",
    };
    onSaved?.(result);
  }, [
    pipelineState,
    studio.files,
    studio.lastSaveResult,
    presetIds,
    primaryPresetId,
    onSaved,
  ]);

  // ── Reset / replace ───────────────────────────────────────────────────
  const handleReplace = useCallback(() => {
    studio.clearAll();
    setPipelineState("idle");
    setShowInitial(false);
    setAutoFlowError(null);
  }, [studio]);

  const handleClear = useCallback(() => {
    studio.clearAll();
    setPipelineState("idle");
    setShowInitial(false);
    setAutoFlowError(null);
    setExternalUrl(null);
    setExternalSource(null);
    setExternalLabel(null);
    setIntakeMode("choose");
    onCleared?.();
  }, [studio, onCleared]);

  // ── URL / Library intake ──────────────────────────────────────────────
  // Both paths set `externalUrl` and emit onSaved with that URL as primary
  // — no Sharp pipeline runs. The user explicitly chose this URL; the
  // host gets the URL it asked for and the studio stays out of the way.
  const emitExternalSaved = useCallback(
    (url: string, sourceLabel: string) => {
      const primaryId = primaryPresetId ?? presetIds[0] ?? null;
      const byPreset: Record<string, string> = {};
      if (primaryId) byPreset[primaryId] = url;
      const result: EmbeddedImageStudioResult = {
        byPreset,
        primary:
          primaryId !== null ? { presetId: primaryId, publicUrl: url } : null,
        filenameBase: slugifyFilename(sourceLabel || "image"),
        parentFolderId: "",
      };
      onSaved?.(result);
    },
    [presetIds, primaryPresetId, onSaved],
  );

  const validateImageUrl = useCallback((raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      new URL(withScheme);
      return withScheme;
    } catch {
      return null;
    }
  }, []);

  const handleCommitUrl = useCallback(() => {
    const cleaned = validateImageUrl(pasteUrlInput);
    if (!cleaned) {
      toast.error("Please enter a valid image URL");
      return;
    }
    // Take it as-is, no pipeline. The user told us to use this URL.
    studio.clearAll();
    setShowInitial(false);
    setPipelineState("idle");
    setExternalUrl(cleaned);
    setExternalSource("url");
    setExternalLabel("Pasted URL");
    setIntakeMode("choose");
    emitExternalSaved(cleaned, "external-url");
    toast.success("Using pasted URL");
  }, [pasteUrlInput, validateImageUrl, studio, emitExternalSaved]);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const result = await filePicker.open({
        multi: false,
        title: "Pick an image from your library",
        allowedExtensions: ["jpg", "jpeg", "png", "webp", "avif", "gif"],
      });
      if (!result || result.length === 0) return;
      const fileId = result[0];
      const cloudFile = store.getState().cloudFiles.filesById[fileId];
      if (!cloudFile) {
        toast.error("Could not load that file");
        return;
      }
      // Prefer the permanent CDN URL — fall back to a fresh signed
      // URL if the file is private (still good for ~1h, host-side
      // copy will paste it as-is).
      let url = cloudFile.publicUrl;
      if (!url) {
        try {
          const signed = await getSignedUrl(fileId, {
            expiresIn: 3600,
          });
          url = signed.data.url;
        } catch {
          toast.error("Could not generate URL for that file");
          return;
        }
      }
      studio.clearAll();
      setShowInitial(false);
      setPipelineState("idle");
      setExternalUrl(url);
      setExternalSource("library");
      setExternalLabel(cloudFile.fileName);
      setIntakeMode("choose");
      emitExternalSaved(url, cloudFile.fileName);
      toast.success(`Using ${cloudFile.fileName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pick cancelled";
      toast.error(msg);
    }
  }, [filePicker, store, studio, emitExternalSaved]);

  // ── Render ────────────────────────────────────────────────────────────

  // 1) Pre-existing initial URL — show as a thumbnail with a Replace CTA.
  if (showInitial && initialUrl && !sourceFile && !externalUrl) {
    return (
      <Wrapper label={effectiveLabel} className={className}>
        <InitialUrlBanner
          url={initialUrl}
          onReplace={() => {
            setShowInitial(false);
            setIntakeMode("choose");
          }}
          onClear={handleClear}
          disabled={disabled}
        />
        {filePicker.element}
      </Wrapper>
    );
  }

  // 2a) URL / library pick succeeded — show preview + replace controls.
  if (externalUrl && !sourceFile) {
    return (
      <Wrapper label={effectiveLabel} className={className}>
        <ExternalUrlBanner
          url={externalUrl}
          sourceLabel={externalLabel ?? externalUrl}
          sourceKind={externalSource ?? "url"}
          onReplace={() => {
            setExternalUrl(null);
            setExternalSource(null);
            setExternalLabel(null);
            setIntakeMode("choose");
          }}
          onClear={handleClear}
          disabled={disabled}
        />
        {filePicker.element}
      </Wrapper>
    );
  }

  // 2b) No file yet → three-way intake chooser.
  if (!sourceFile) {
    return (
      <Wrapper label={effectiveLabel} className={className}>
        <IntakeChooser
          mode={intakeMode}
          onSelectMode={setIntakeMode}
          onFilesAdded={queueForCrop}
          pasteUrlInput={pasteUrlInput}
          onPasteUrlChange={setPasteUrlInput}
          onCommitUrl={handleCommitUrl}
          onOpenLibrary={handlePickFromLibrary}
          disabled={disabled}
        />
                <InitialCropWindow
                    files={pendingFiles}
                    onComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                />
        {filePicker.element}
      </Wrapper>
    );
  }

  // 3) Source file present — render the full pipeline UI.
  return (
    <Wrapper label={effectiveLabel} className={className}>
      <SourceHeader
        file={sourceFile}
        renaming={renamingNow}
        renameDraft={renameDraft}
        onRenameStart={startRename}
        onRenameCommit={commitRename}
        onRenameCancel={() => setRenamingNow(false)}
        onRenameDraftChange={setRenameDraft}
        onReplace={handleReplace}
        onClear={handleClear}
        disabled={disabled || pipelineState === "saving"}
      />

      {/* Pipeline status / Generate trigger */}
      {pipelineState === "ready-to-generate" && (
        <ReadyToGenerateBar
          onGenerate={runPipeline}
          presetCount={presetIds.length}
          disabled={disabled}
        />
      )}
      {pipelineState === "generating" && (
        <PipelineStatusBar
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
          label="Generating variants…"
          description={`Sharp is producing ${presetIds.length} sizes from your image.`}
        />
      )}
      {pipelineState === "saving" && (
        <PipelineStatusBar
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
          label="Uploading to library…"
          description="Each variant gets its permanent Cloudflare CDN URL."
        />
      )}
      {pipelineState === "done" && (
        <PipelineStatusBar
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          label="All variants saved with public CDN URLs"
          description="Copy a URL below — they never expire."
          success
        />
      )}
      {pipelineState === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Pipeline failed</p>
            <p className="text-xs">{autoFlowError ?? "Unknown error"}</p>
          </div>
          <button
            type="button"
            onClick={runPipeline}
            className="text-xs rounded-md border border-destructive/40 hover:bg-destructive/10 px-2 py-1"
          >
            Retry
          </button>
        </div>
      )}

      {/* Variants grid */}
      <VariantGrid
        file={sourceFile}
        presetIds={presetIds}
        primaryPresetId={primaryPresetId ?? presetIds[0]}
        pipelineState={pipelineState}
      />
      {filePicker.element}
    </Wrapper>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Wrapper({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {label && (
        <p className="text-sm font-medium flex items-center gap-1.5 text-foreground">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function InitialUrlBanner({
  url,
  onReplace,
  onClear,
  disabled,
}: {
  url: string;
  onReplace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Current image"
        className="h-16 w-16 rounded-lg object-cover border border-border shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">Current image</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground underline truncate block"
          title={url}
        >
          {url}
        </a>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Drop a new image to regenerate every size, or click Replace.
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReplace}
          disabled={disabled}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Replace
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive p-1.5 disabled:opacity-50"
          title="Clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── IntakeChooser — three paths into the studio ─────────────────────────
//
// Drop, paste a URL, or pick from the user's existing library. Picking
// the URL or library path emits onSaved straight away with that URL —
// no Sharp pipeline, no re-upload. The studio stays out of the way when
// the user already has what they need.

function IntakeChooser({
  mode,
  onSelectMode,
  onFilesAdded,
  pasteUrlInput,
  onPasteUrlChange,
  onCommitUrl,
  onOpenLibrary,
  disabled,
}: {
  mode: "choose" | "drop" | "url";
  onSelectMode: (mode: "choose" | "drop" | "url") => void;
  onFilesAdded: (files: File[]) => void;
  pasteUrlInput: string;
  onPasteUrlChange: (next: string) => void;
  onCommitUrl: () => void;
  onOpenLibrary: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Three-way mode pills */}
      <div className="grid grid-cols-3 gap-1.5">
        <ModePill
          icon={<Upload className="h-3.5 w-3.5" />}
          label="Drop / Browse"
          description="New image"
          active={mode === "drop"}
          onClick={() => onSelectMode("drop")}
          disabled={disabled}
        />
        <ModePill
          icon={<LinkIcon className="h-3.5 w-3.5" />}
          label="Paste URL"
          description="External link"
          active={mode === "url"}
          onClick={() => onSelectMode("url")}
          disabled={disabled}
        />
        <ModePill
          icon={<FolderOpen className="h-3.5 w-3.5" />}
          label="From library"
          description="Already saved"
          active={false}
          onClick={onOpenLibrary}
          disabled={disabled}
        />
      </div>

      {/* Active surface — Drop or URL paste */}
      {mode === "url" ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Image URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={pasteUrlInput}
              onChange={(e) => onPasteUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCommitUrl();
                }
              }}
              placeholder="https://example.com/image.jpg"
              disabled={disabled}
              className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={onCommitUrl}
              disabled={disabled || !pasteUrlInput.trim()}
              className="h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Use
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Paste any public image URL — it&apos;ll be used as-is. No re-upload,
            no resize.
          </p>
        </div>
      ) : (
        <StudioDropZone onFilesAdded={onFilesAdded} />
      )}
    </div>
  );
}

function ModePill({
  icon,
  label,
  description,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "shrink-0",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-[10px] text-muted-foreground leading-tight">
        {description}
      </span>
    </button>
  );
}

// ── ExternalUrlBanner — shown after a URL paste / library pick ──────────

function ExternalUrlBanner({
  url,
  sourceLabel,
  sourceKind,
  onReplace,
  onClear,
  disabled,
}: {
  url: string;
  sourceLabel: string;
  sourceKind: "url" | "library";
  onReplace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };
  return (
    <div className="rounded-xl border border-success/40 bg-success/5 p-3 flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={sourceLabel}
        className="h-16 w-16 rounded-lg object-cover border border-border bg-muted shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {sourceKind === "library" ? (
            <FolderOpen className="h-3 w-3 text-success" />
          ) : (
            <LinkIcon className="h-3 w-3 text-success" />
          )}
          <p className="text-xs font-medium text-foreground">
            {sourceKind === "library"
              ? "Using from library"
              : "Using pasted URL"}
          </p>
        </div>
        <p
          className="text-[11px] font-mono text-muted-foreground truncate mt-0.5"
          title={sourceLabel}
        >
          {sourceLabel}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground underline truncate block mt-0.5"
          title={url}
        >
          {url}
        </a>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "rounded-md border px-2 py-1 text-xs flex items-center gap-1",
            copied
              ? "border-success/40 bg-success/10 text-success"
              : "border-border hover:bg-muted",
          )}
          title="Copy URL"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onReplace}
          disabled={disabled}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          title="Replace with a different image"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Replace
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive p-1.5 disabled:opacity-50"
          title="Clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SourceHeader({
  file,
  renaming,
  renameDraft,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onRenameDraftChange,
  onReplace,
  onClear,
  disabled,
}: {
  file: StudioSourceFile;
  renaming: boolean;
  renameDraft: string;
  onRenameStart: () => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameDraftChange: (next: string) => void;
  onReplace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.objectUrl}
        alt={file.originalName}
        className="h-14 w-14 rounded-lg object-cover border border-border shrink-0"
      />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameCommit();
                if (e.key === "Escape") onRenameCancel();
              }}
              placeholder="my-clean-filename"
              className="h-7 flex-1 text-sm font-mono rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={onRenameCommit}
              className="text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onRenameCancel}
              className="text-xs rounded-md hover:bg-muted px-2 py-1 text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-sm truncate" title={file.filenameBase}>
              {file.filenameBase}
            </p>
            <button
              type="button"
              onClick={onRenameStart}
              disabled={disabled}
              className="h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center disabled:opacity-50"
              title="Rename — variants will inherit this slug"
            >
              <Edit3 className="h-3 w-3" />
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {file.originalName} · {formatDimensions(file.width, file.height)} ·{" "}
          {formatBytes(file.size)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onReplace}
          disabled={disabled}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          title="Replace with a different image"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Replace
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive p-1.5 disabled:opacity-50"
          title="Clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ReadyToGenerateBar({
  onGenerate,
  presetCount,
  disabled,
}: {
  onGenerate: () => void;
  presetCount: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Wand2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Ready to generate</p>
        <p className="text-xs text-muted-foreground">
          {presetCount} preset{presetCount === 1 ? "" : "s"} will be created and
          uploaded with permanent CDN URLs.
        </p>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
      >
        <Zap className="h-3 w-3" />
        Generate &amp; save
      </button>
    </div>
  );
}

function PipelineStatusBar({
  icon,
  label,
  description,
  success = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  success?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        success
          ? "border-success/40 bg-success/5"
          : "border-border bg-muted/20",
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
          success ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function VariantGrid({
  file,
  presetIds,
  primaryPresetId,
  pipelineState,
}: {
  file: StudioSourceFile;
  presetIds: string[];
  primaryPresetId: string | undefined;
  pipelineState: string;
}) {
  if (presetIds.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {presetIds.map((presetId) => {
        const preset = getPresetById(presetId);
        const variant = file.variants[presetId];
        const isPrimary = presetId === primaryPresetId;
        return (
          <VariantCard
            key={presetId}
            presetId={presetId}
            presetName={preset?.name ?? presetId}
            presetUsage={preset?.usage}
            width={variant?.width ?? preset?.width ?? 0}
            height={variant?.height ?? preset?.height ?? 0}
            previewSrc={variant?.dataUrl}
            publicUrl={variant?.publicUrl ?? null}
            size={variant?.size ?? null}
            compressionRatio={variant?.compressionRatio ?? null}
            savedAt={variant?.savedAt ?? null}
            pending={
              !variant &&
              (pipelineState === "generating" || pipelineState === "saving")
            }
            isPrimary={isPrimary}
          />
        );
      })}
    </div>
  );
}

function VariantCard({
  presetId,
  presetName,
  presetUsage,
  width,
  height,
  previewSrc,
  publicUrl,
  size,
  compressionRatio,
  savedAt,
  pending,
  isPrimary,
}: {
  presetId: string;
  presetName: string;
  presetUsage?: string;
  width: number;
  height: number;
  previewSrc?: string;
  publicUrl: string | null;
  size: number | null;
  compressionRatio: number | null;
  savedAt: string | null;
  pending: boolean;
  isPrimary: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };

  const aspect = width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
  const saved = Boolean(savedAt && publicUrl);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card overflow-hidden transition-all",
        isPrimary ? "border-primary ring-1 ring-primary/20" : "border-border",
      )}
    >
      <div
        className="relative bg-muted/40 flex items-center justify-center border-b border-border"
        style={{ aspectRatio: aspect }}
      >
        {previewSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewSrc}
            alt={presetName}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        ) : pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
        )}
        {isPrimary && (
          <div className="absolute top-1 left-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
            Primary
          </div>
        )}
        {saved && (
          <div className="absolute top-1 right-1 rounded-full bg-success/15 border border-success/30 text-success px-1.5 py-0.5 text-[9px] font-semibold flex items-center gap-0.5">
            <CheckCircle2 className="h-2.5 w-2.5" />
            CDN
          </div>
        )}
      </div>
      <div className="p-2 text-xs space-y-1">
        <div className="flex items-baseline justify-between gap-1">
          <p className="font-medium truncate" title={presetName}>
            {presetName}
          </p>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDimensions(width, height)}
          </span>
        </div>
        {presetUsage && (
          <p
            className="text-[10px] text-muted-foreground line-clamp-2 leading-snug"
            title={presetUsage}
          >
            {presetUsage}
          </p>
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          {size != null ? (
            <span className="font-mono">{formatBytes(size)}</span>
          ) : (
            <span>—</span>
          )}
          {compressionRatio != null && compressionRatio > 0 && (
            <span className="text-success font-medium flex items-center gap-0.5">
              <Zap className="h-2.5 w-2.5" />−{compressionRatio}%
            </span>
          )}
        </div>

        {publicUrl ? (
          <div className="flex items-center gap-1 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
                copied
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border hover:bg-muted/40",
              )}
              title="Copy permanent CDN URL"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-2.5 w-2.5" />
                  Copy CDN
                </>
              )}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border hover:bg-muted/40 p-1 text-muted-foreground"
              title="Open public URL in a new tab"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        ) : pending ? (
          <p className="text-[10px] text-muted-foreground italic">
            Processing…
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            URL appears after save.
          </p>
        )}
      </div>
    </div>
  );
}

// Re-export the position type so callers building bespoke UIs stay typed.
export type { ImagePosition };
