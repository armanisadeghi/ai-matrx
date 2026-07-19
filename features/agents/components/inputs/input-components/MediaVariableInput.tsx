"use client";

/**
 * MediaVariableInput
 *
 * Shared embedded picker for image/audio/video/document variable inputs.
 * The persisted value is a canonical file_id when a library file is selected,
 * otherwise a URL. When substituted into an agent message's media block,
 * matrx-ai re-routes a UUID to `file_id` and resolves it through the normal
 * MediaRef boundary. This is what makes a document variable safe for agent
 * calls, workflow calls, and a saved agent default — never persist a signed
 * URL as the identity of an owned file.
 *
 * Library selection reuses `FilesResourcePicker` — the same Cloud Files /
 * "Stored Files" UI as Smart Agent Input (search, type filter, sort,
 * list/grid, recents, folder tree). Upload + paste-URL lanes stay local;
 * uploads go through `useFileUpload` with `visibility: "private"` +
 * `createShareLink: true` — same contract as `UploadResourcePicker`.
 *
 * The five wrappers (Image/Audio/Video/Document) parameterize this with
 * a `mediaKind`. YouTube is its own component — paste-only, no upload.
 */

import { useCallback, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  FileText,
  Upload,
  FolderOpen,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  FileRagBadge,
  FileResourceChip,
  InlineMediaRef,
  useFileDocument,
  useFileSrc,
  useFileUpload,
} from "@/features/files";
import {
  FilesResourcePicker,
  type FilesResourcePickerFilter,
} from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import { cn } from "@/lib/utils";
import type { VariableResourceContextConfig } from "@/features/agents/types/agent-definition.types";
import { ResourceFamilyPolicyEditor } from "@/features/agents/components/inputs/resources/ResourceFamilyPolicyEditor";

// 36-char canonical UUID — what cld_files file_ids look like.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MediaKind = "image" | "audio" | "video" | "document";

const KIND_META: Record<
  MediaKind,
  {
    label: string;
    Icon: typeof ImageIcon;
    /** HTML `accept` for the native file picker. Empty string = anything. */
    accept: string;
    /** Folder path on cld_files (organizes uploads). */
    folderPath: string;
    /** URL placeholder for the paste lane. */
    urlPlaceholder: string;
    /** True when an `<img>` preview makes sense for the picked URL. */
    canThumbnail: boolean;
    /** Initial Cloud Files type filter (user can still change it). */
    libraryFilter: FilesResourcePickerFilter;
  }
> = {
  image: {
    label: "image",
    Icon: ImageIcon,
    accept: "image/*",
    folderPath: "Shared Assets/agent-variables/images",
    urlPlaceholder: "https://example.com/image.png",
    canThumbnail: true,
    libraryFilter: "photos",
  },
  audio: {
    label: "audio",
    Icon: Mic,
    accept: "audio/*",
    folderPath: "Shared Assets/agent-variables/audio",
    urlPlaceholder: "https://example.com/audio.mp3",
    canThumbnail: false,
    libraryFilter: "audio",
  },
  video: {
    label: "video",
    Icon: VideoIcon,
    accept: "video/*",
    folderPath: "Shared Assets/agent-variables/video",
    urlPlaceholder: "https://example.com/video.mp4",
    canThumbnail: false,
    libraryFilter: "videos",
  },
  document: {
    label: "document",
    Icon: FileText,
    accept:
      ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,application/pdf",
    folderPath: "Shared Assets/agent-variables/documents",
    urlPlaceholder: "https://example.com/document.pdf",
    canThumbnail: false,
    libraryFilter: "all",
  },
};

function readValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    // Runtime values may already be a MediaRef (for example an upstream
    // agent/workflow node). Keep its durable identity instead of collapsing
    // it to a transient URL or an empty field.
    if (typeof o.file_id === "string") return o.file_id;
    if (typeof o.fileId === "string") return o.fileId;
    if (typeof o.resource_id === "string") return o.resource_id;
    if (typeof o.url === "string") return o.url;
  }
  return "";
}

function describeValue(value: string): string {
  if (UUID_PATTERN.test(value))
    return `From your library · ${value.slice(0, 8)}…`;
  try {
    const u = new URL(value);
    const path =
      u.pathname.length > 30 ? `…${u.pathname.slice(-28)}` : u.pathname;
    return u.host + path;
  } catch {
    return value;
  }
}

export interface MediaVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  mediaKind: MediaKind;
  compact?: boolean;
  resourceContext?: VariableResourceContextConfig;
}

export function MediaVariableInput({
  value,
  onChange,
  variableName,
  mediaKind,
  compact = false,
  resourceContext,
}: MediaVariableInputProps) {
  const meta = KIND_META[mediaKind];
  const Icon = meta.Icon;
  const stored = readValue(value);
  const isFileId = !!stored && UUID_PATTERN.test(stored);

  // Resolve a renderable URL when the stored value is a cld_files UUID.
  // Returns null while loading; we hide the thumbnail in that case.
  const resolvedSrc = useFileSrc(
    isFileId ? { kind: "file_id", fileId: stored } : null,
  );

  // Pick what goes into <img src>. file_id values resolve via the handler;
  // URL values render directly. Don't try to render URL paths through
  // useFileSrc — only file_ids belong there.
  const previewSrc = isFileId ? resolvedSrc : stored;
  const { state: documentState } = useFileDocument(
    mediaKind === "document" && isFileId ? stored : null,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { upload, uploading, error } = useFileUpload();

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath: meta.folderPath,
            visibility: "private",
            createShareLink: true,
            shareLinkPermissionLevel: "viewer",
          },
        );
        // Prefer file_id over URL on the wire — it's the canonical
        // identifier; backend's coerce_to_media_ref routes a 36-char
        // UUID straight to MediaRef.file_id without a URL→share-link
        // resolution hop. Falls back to URL only when fileId is absent
        // (e.g. external-URL ingestion paths).
        const next = normalized.fileId ?? normalized.url ?? "";
        if (next) onChange(next);
      } catch {
        // useFileUpload exposes the error on `error`; UI shows it below.
      }
    },
    [upload, onChange, meta.folderPath],
  );

  const onPickFile = () => fileInputRef.current?.click();

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onClear = () => onChange("");

  const openLibrary = () => setLibraryOpen(true);

  // Decide whether we render an <img> thumbnail. Images and resolved
  // file_id thumbnails get one; URLs without an http(s) prefix don't.
  const hasThumbnail =
    meta.canThumbnail && !!previewSrc && /^https?:\/\//.test(previewSrc);

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      {/* Filled state — preview + clear */}
      {stored && isFileId && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <FileResourceChip
              fileId={stored}
              onRemove={onClear}
              className="min-w-0 max-w-full"
            />
            {mediaKind === "document" ? (
              <FileRagBadge
                fileId={stored}
                showRagStatus
                iconOnly={false}
                className="shrink-0"
              />
            ) : null}
          </div>
          {mediaKind === "document" ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {documentState.status === "loading"
                ? "Checking processed document…"
                : documentState.status === "found"
                  ? "Processed document detected — existing clean/raw text, RAG, pages, and derivations are discoverable by the agent automatically."
                  : documentState.status === "absent"
                    ? "Original file selected. Process it for RAG to add clean/raw text, search, pages, and derivations."
                    : documentState.status === "unavailable"
                      ? "File selected; processed-document status is temporarily unavailable."
                      : "File selected by file_id."}
            </p>
          ) : null}
          <ResourceFamilyPolicyEditor
            fileId={stored}
            value={resourceContext}
            compact={compact}
          />
        </div>
      )}

      {stored && !isFileId && (
        <div className="flex items-stretch gap-2 px-2 py-1.5 rounded-md border border-border bg-muted/40">
          {hasThumbnail ? (
            <InlineMediaRef
              // For an owned file pass the file_id (bare UUID) — not the
              // already-resolved signed URL — so InlineMediaRef can re-mint on
              // expiry. URL-valued inputs pass through as-is.
              ref={isFileId ? stored : previewSrc}
              size={{ width: 40, height: 40 }}
              fit="cover"
              rounded="none"
              alt={variableName}
              className="rounded border border-border shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0 border border-border">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <span
              className="text-xs font-medium text-foreground truncate"
              title={stored}
            >
              {describeValue(stored)}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {meta.label}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0 self-start"
            onClick={onClear}
            title={`Clear ${meta.label}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Selecting from Cloud Files must be first-class for every media
          variable — same picker as Smart Agent Input → Stored Files. */}
      {stored && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={openLibrary}
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
          Choose a different file
        </Button>
      )}

      {/* Empty state — drop zone + library + paste URL */}
      {!stored && (
        <>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={onPickFile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPickFile();
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-3 rounded-md border border-dashed cursor-pointer transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-foreground/40 hover:bg-muted/40",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground">
                {uploading
                  ? `Uploading ${meta.label}…`
                  : `Drop ${meta.label} here or click to upload`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Files are uploaded privately to your library
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={meta.accept}
              onChange={onFileInputChange}
              className="hidden"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-xs"
            disabled={uploading}
            onClick={openLibrary}
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Choose from Files
          </Button>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="flex-1 border-t border-border" />
            <span>or paste URL</span>
            <span className="flex-1 border-t border-border" />
          </div>

          <Input
            value={stored}
            onChange={(e) => onChange(e.target.value)}
            placeholder={meta.urlPlaceholder}
            className="h-8 text-xs font-mono"
            aria-label={`${meta.label} URL for ${variableName}`}
            style={{ fontSize: "16px" }}
          />
        </>
      )}

      {error && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-destructive/10 text-destructive">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="text-[11px]">{error.message}</span>
        </div>
      )}

      {/* Same Cloud Files picker as Smart Agent Input → Stored Files.
          Persist file_id only — never the short-lived signed URL. */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden [&>button]:hidden">
          <DialogTitle className="sr-only">
            Choose {meta.label} from Cloud Files
          </DialogTitle>
          {libraryOpen && (
            <FilesResourcePicker
              onBack={() => setLibraryOpen(false)}
              initialFilter={meta.libraryFilter}
              onSelect={(selection) => {
                if (selection.fileId) onChange(selection.fileId);
                setLibraryOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
