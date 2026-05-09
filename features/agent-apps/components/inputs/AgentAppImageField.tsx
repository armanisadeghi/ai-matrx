"use client";

/**
 * AgentAppImageField
 *
 * Click-to-pick or drag-to-drop image upload via the universal file
 * handler. Uploaded files get a public share link, and the resulting
 * URL is what's saved to `aga_apps.favicon_url` / `preview_image_url`.
 *
 * No raw URL inputs — the user clicks a tile and picks a file. If a
 * value already exists, the tile shows a thumbnail with a small "Replace"
 * action and a "Remove" action.
 */

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";

interface AgentAppImageFieldProps {
  value: string | null;
  onChange: (next: string | null) => void;
  /** Aspect ratio class for the preview tile, e.g. "aspect-square". */
  aspect?: string;
  /** Folder path for uploads. */
  folder?: string;
  disabled?: boolean;
  /** Short label for accessibility. */
  ariaLabel?: string;
}

export function AgentAppImageField({
  value,
  onChange,
  aspect = "aspect-square",
  folder = "agent-apps/branding",
  disabled,
  ariaLabel = "Upload image",
}: AgentAppImageFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { upload, uploading } = useFileUpload();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported here.");
        return;
      }
      try {
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath: folder,
            visibility: "public",
            createShareLink: true,
          },
        );
        const url = normalized.url ?? null;
        if (!url) {
          toast.error("Upload finished but no URL was returned.");
          return;
        }
        onChange(url);
        toast.success("Uploaded.");
      } catch (err) {
        toast.error(
          err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed",
        );
      }
    },
    [upload, folder, onChange],
  );

  const handleClick = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onDragOver={(e) => {
        if (disabled || uploading) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled || uploading) return;
        void handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative group rounded-md border border-dashed border-border overflow-hidden cursor-pointer transition-colors",
        aspect,
        "w-32 max-w-full",
        dragOver && "border-primary bg-primary/5",
        disabled && "opacity-60 cursor-not-allowed",
        !value && !uploading && "hover:bg-muted/40",
      )}
    >
      {uploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : value ? (
        <>
          <img
            src={value}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-background text-foreground text-xs font-medium">
              <RotateCcw className="w-3 h-3" /> Replace
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center justify-center w-6 h-6 rounded bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] uppercase tracking-wide">Upload</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
