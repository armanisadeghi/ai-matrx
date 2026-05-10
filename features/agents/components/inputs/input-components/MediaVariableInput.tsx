"use client";

/**
 * MediaVariableInput
 *
 * Shared embedded picker for image/audio/video/document variable inputs.
 * The variable value is a plain URL string — same shape as a directly
 * attached media block on an agent message. When substituted at runtime,
 * `{{var}}` becomes the URL inside the matching block's `url` field.
 *
 * Visibility contract: uploads go through `useFileUpload` with
 * `visibility: "private"` + `createShareLink: true` — same as the
 * generic `UploadResourcePicker`. We do NOT use the public-CDN
 * image uploader window (that one's the right tool when an agent
 * author hard-codes an image into the prompt; for runtime variable
 * fills the user's file shouldn't be auto-public).
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
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload";
import { cn } from "@/lib/utils";

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
  }
> = {
  image: {
    label: "image",
    Icon: ImageIcon,
    accept: "image/*",
    folderPath: "Shared Assets/agent-variables/images",
    urlPlaceholder: "https://example.com/image.png",
    canThumbnail: true,
  },
  audio: {
    label: "audio",
    Icon: Mic,
    accept: "audio/*",
    folderPath: "Shared Assets/agent-variables/audio",
    urlPlaceholder: "https://example.com/audio.mp3",
    canThumbnail: false,
  },
  video: {
    label: "video",
    Icon: VideoIcon,
    accept: "video/*",
    folderPath: "Shared Assets/agent-variables/video",
    urlPlaceholder: "https://example.com/video.mp4",
    canThumbnail: false,
  },
  document: {
    label: "document",
    Icon: FileText,
    accept: ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,application/pdf",
    folderPath: "Shared Assets/agent-variables/documents",
    urlPlaceholder: "https://example.com/document.pdf",
    canThumbnail: false,
  },
};

function readUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
  }
  return "";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? `…${u.pathname.slice(-28)}` : u.pathname;
    return u.host + path;
  } catch {
    return url;
  }
}

interface MediaVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  mediaKind: MediaKind;
  compact?: boolean;
}

export function MediaVariableInput({
  value,
  onChange,
  variableName,
  mediaKind,
  compact = false,
}: MediaVariableInputProps) {
  const meta = KIND_META[mediaKind];
  const Icon = meta.Icon;
  const url = readUrl(value);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
            shareLinkPermissionLevel: "read",
          },
        );
        if (normalized.url) onChange(normalized.url);
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

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      {/* Filled state — preview + clear */}
      {url && (
        <div className="flex items-stretch gap-2 px-2 py-1.5 rounded-md border border-border bg-muted/40">
          {meta.canThumbnail && /^https?:\/\//.test(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={variableName}
              className="h-10 w-10 object-cover rounded border border-border shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0 border border-border">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <span
              className="text-xs font-medium text-foreground truncate"
              title={url}
            >
              {shortenUrl(url)}
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

      {/* Empty state — drop zone + paste URL */}
      {!url && (
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

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="flex-1 border-t border-border" />
            <span>or paste URL</span>
            <span className="flex-1 border-t border-border" />
          </div>

          <Input
            value={url}
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
    </div>
  );
}
