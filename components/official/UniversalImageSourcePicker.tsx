"use client";

/**
 * UniversalImageSourcePicker
 * ─────────────────────────────────────────────────────────────────────────
 * 4-source image picker that satisfies the full image ownership contract:
 *
 *   1. Upload    — drag-drop / click / paste a local file → asset pipeline
 *   2. Library   — pick an existing cloud file → detect/attach variants, generate missing
 *   3. URL       — paste a public URL → try fetch+upload for variants, fall back to direct use
 *   4. Generate  — AI image generation (placeholder; pipeline wired separately)
 *
 * When `currentUrl` is truthy the component renders a compact preview with a
 * "Change" button. When null/undefined it shows the 4-source tab picker.
 * Callers manage the selected state and pass it back as `currentUrl`.
 *
 * Output shape: `ImageUploaderResult` (same as `ImageAssetUploader`) so any
 * existing `onComplete` handler works without changes.
 */

import React, { useCallback, useState } from "react";
import {
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  AlertCircle,
  Sparkles,
  Upload,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  openFilePicker,
  useFileUpload,
  getAssetForFile,
  addAssetVariants,
  InlineMediaRef,
  type AssetPreset,
  type Visibility,
  type Asset,
} from "@/features/files";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
  type ImageAssetUploaderProps,
} from "@/components/official/ImageAssetUploader";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ────────────────────────────────────────────────────────────────────

type SourceTab = "upload" | "library" | "url" | "generate";

export interface UniversalImageSourcePickerProps
  extends Pick<
    ImageAssetUploaderProps,
    | "onComplete"
    | "onError"
    | "preset"
    | "folder"
    | "visibility"
    | "currentUrl"
    | "label"
    | "compact"
    | "disabled"
    | "className"
    | "enableViewerAction"
    | "hideVariantBadges"
    | "enablePaste"
  > {
  /** Show the Generate tab. Default false until the pipeline is wired. */
  enableGenerate?: boolean;
  /** Tab to open by default when no currentUrl is set. Default "upload". */
  defaultTab?: SourceTab;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function assetToResult(asset: Asset): ImageUploaderResult {
  const v = asset.variants;
  return {
    file_id: asset.file_id,
    primary_url: asset.primary_url,
    preset: asset.preset,
    asset,
    variants: asset.variants,
    image_url: asset.primary_url ?? v.original?.url ?? null,
    og_image_url: v.og_url?.url ?? null,
    thumbnail_url: v.thumbnail_url?.url ?? null,
    tiny_url: v.tiny_url?.url ?? null,
  };
}

function buildSyntheticResult(
  url: string,
  preset: AssetPreset,
  folder: string | undefined,
  visibility: Visibility,
): ImageUploaderResult {
  const synthAsset: Asset = {
    file_id: "",
    visibility,
    folder: folder ?? "",
    preset,
    primary_key: "original",
    primary_url: url,
    variants: {
      original: {
        key: "original",
        file_id: "",
        file_path: "",
        width: null,
        height: null,
        mime_type: null,
        file_size: null,
        url,
        cdn_url: null,
        signed_url: null,
        download_url: null,
        metadata: {},
      },
    },
    metadata: { _source: "pasted-url" },
  };
  return {
    file_id: "",
    primary_url: url,
    preset,
    asset: synthAsset,
    variants: synthAsset.variants,
    image_url: url,
    og_image_url: null,
    thumbnail_url: null,
    tiny_url: null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface TabBarProps {
  active: SourceTab;
  onChange: (tab: SourceTab) => void;
  showGenerate: boolean;
  disabled?: boolean;
}

const TAB_DEFS: { id: SourceTab; label: string; Icon: React.ElementType }[] = [
  { id: "upload", label: "Upload", Icon: Upload },
  { id: "library", label: "Library", Icon: FolderOpen },
  { id: "url", label: "URL", Icon: LinkIcon },
  { id: "generate", label: "Generate", Icon: Sparkles },
];

function TabBar({ active, onChange, showGenerate, disabled }: TabBarProps) {
  const tabs = showGenerate
    ? TAB_DEFS
    : TAB_DEFS.filter((t) => t.id !== "generate");

  return (
    <div className="flex gap-1 rounded-lg bg-muted/40 p-0.5 border border-border/50">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            active === id
              ? "bg-background shadow-sm text-foreground border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Library tab ──────────────────────────────────────────────────────────────

interface LibraryTabProps {
  preset: AssetPreset;
  onComplete: (result: ImageUploaderResult) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

function LibraryTab({ preset, onComplete, onError, disabled }: LibraryTabProps) {
  const [state, setState] = useState<"idle" | "resolving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    const selected = await openFilePicker({
      title: "Choose Image",
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"],
    });
    if (!selected?.length) return;

    const fileId = selected[0];
    setState("resolving");
    setErrorMsg(null);
    try {
      // Ensure asset record exists, then ensure all preset variants exist.
      // addAssetVariants is idempotent — existing variants are not re-rendered.
      await getAssetForFile(fileId);
      const { data: ensured } = await addAssetVariants(fileId, { preset });
      onComplete(assetToResult(ensured));
      setState("idle");
    } catch (err) {
      const msg = extractErrorMessage(err);
      setErrorMsg(msg);
      setState("error");
      onError?.(msg);
    }
  }, [preset, onComplete, onError]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleBrowse}
        disabled={disabled || state === "resolving"}
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors",
          disabled || state === "resolving"
            ? "border-border opacity-60 cursor-not-allowed"
            : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer",
        )}
      >
        {state === "resolving" ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
        )}
        <div className="text-center px-3">
          <p className="text-sm font-medium text-foreground">
            {state === "resolving" ? "Attaching variants…" : "Browse your library"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {state === "resolving"
              ? "Detecting existing variants, generating any that are missing"
              : "Pick an existing cloud file — missing variants are auto-generated"}
          </p>
        </div>
      </button>
      {state === "error" && errorMsg && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg}
        </p>
      )}
    </div>
  );
}

// ── URL tab ───────────────────────────────────────────────────────────────────

interface UrlTabProps {
  preset: AssetPreset;
  folder?: string;
  visibility: Visibility;
  onComplete: (result: ImageUploaderResult) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

function UrlTab({ preset, folder, visibility, onComplete, onError, disabled }: UrlTabProps) {
  const { upload } = useFileUpload();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "processing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setState("processing");
    setErrorMsg(null);

    try {
      // Attempt to fetch the image and upload through the asset pipeline to
      // generate preset variants. Falls back to direct URL use on CORS errors.
      const response = await fetch(trimmed, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("URL does not point to an image");
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const file = new File([blob], `url-import-${Date.now()}.${ext}`, { type: blob.type });
      const normalized = await upload(
        { kind: "file", file },
        { preset, folderPath: folder, visibility },
      );
      if (!normalized.asset) throw new Error("No asset returned");
      onComplete(assetToResult(normalized.asset));
      setUrl("");
      setState("idle");
    } catch (err) {
      if (err instanceof TypeError) {
        // CORS block — silently fall back to direct URL (no variants).
        onComplete(buildSyntheticResult(trimmed, preset, folder, visibility));
        setUrl("");
        setState("idle");
      } else {
        const msg = extractErrorMessage(err);
        setErrorMsg(msg);
        setState("error");
        onError?.(msg);
      }
    }
  }, [url, upload, preset, folder, visibility, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-xs text-muted-foreground px-0.5">
        Paste any public image URL. If accessible, variants will be auto-generated; otherwise the URL is used directly.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/image.jpg"
          disabled={disabled || state === "processing"}
          className="flex-1 h-8 text-xs font-mono"
          style={{ fontSize: "16px" }}
          aria-label="Image URL"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!url.trim() || disabled || state === "processing"}
          className="h-8 px-3 text-xs shrink-0"
        >
          {state === "processing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Use URL"
          )}
        </Button>
      </div>
      {state === "error" && errorMsg && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {errorMsg}
        </p>
      )}
    </div>
  );
}

// ── Generate tab ──────────────────────────────────────────────────────────────

function GenerateTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Sparkles className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">Generate with AI</p>
      <p className="text-xs text-muted-foreground max-w-[220px]">
        AI image generation is available — connect a pipeline from the Generate tab in the Image Manager.
      </p>
    </div>
  );
}

// ── Preview (filled state shared across all sources) ─────────────────────────

interface PreviewBarProps {
  imageUrl: string;
  label: string;
  onClear: () => void;
  disabled?: boolean;
}

function PreviewBar({ imageUrl, label, onClear, disabled }: PreviewBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-card">
      <div className="w-14 h-14 rounded-lg overflow-hidden border border-border/50 shrink-0 bg-muted flex items-center justify-center">
        <InlineMediaRef
          ref={imageUrl}
          size={{ width: 56, height: 56 }}
          fit="cover"
          rounded="none"
          alt={label}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.visibility = "hidden";
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">Image set</p>
        <p className="text-[10px] text-muted-foreground truncate">{imageUrl}</p>
        {!disabled && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Use the tabs below to change
          </p>
        )}
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={onClear}
          title="Remove image"
          className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UniversalImageSourcePicker({
  onComplete,
  onError,
  preset = "social",
  folder,
  visibility = "public",
  currentUrl,
  label = "Image",
  compact = false,
  disabled = false,
  className,
  enableGenerate = false,
  defaultTab = "upload",
  enableViewerAction,
  hideVariantBadges,
  enablePaste = true,
}: UniversalImageSourcePickerProps) {
  const [activeTab, setActiveTab] = useState<SourceTab>(defaultTab);

  const handleClear = useCallback(() => {
    onComplete?.(null);
  }, [onComplete]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Preview strip — shown when an image is set */}
      {currentUrl && (
        <PreviewBar
          imageUrl={currentUrl}
          label={label}
          onClear={handleClear}
          disabled={disabled}
        />
      )}

      {/* Tab bar — always visible so user can switch sources even with a preview */}
      {!disabled && (
        <>
          <TabBar
            active={activeTab}
            onChange={setActiveTab}
            showGenerate={enableGenerate}
          />

          {/* Tab content */}
          {activeTab === "upload" && (
            <ImageAssetUploader
              onComplete={onComplete}
              onError={onError}
              preset={preset}
              folder={folder}
              visibility={visibility}
              label={label}
              compact={compact}
              allowUrlPaste={false}
              enablePaste={enablePaste}
              enableViewerAction={enableViewerAction}
              hideVariantBadges={hideVariantBadges}
            />
          )}

          {activeTab === "library" && (
            <LibraryTab
              preset={preset}
              onComplete={(result) => onComplete?.(result)}
              onError={onError}
            />
          )}

          {activeTab === "url" && (
            <UrlTab
              preset={preset}
              folder={folder}
              visibility={visibility}
              onComplete={(result) => onComplete?.(result)}
              onError={onError}
            />
          )}

          {activeTab === "generate" && enableGenerate && <GenerateTab />}
        </>
      )}
    </div>
  );
}

export default UniversalImageSourcePicker;
