"use client";

/**
 * ResultFile — a compact download card for a NON-media tool-result file
 * (docx / pptx / xlsx / pdf / zip / …). The counterpart to {@link ResultMedia}:
 * where media renders inline via `<InlineMediaRef>`, a document can't be shown
 * inline, so we render an attachment card with a download + open action.
 *
 * Reuses the canonical file infrastructure rather than hand-rolling URLs:
 *   - `FileIcon`        — file-type glyph derived from name + mime
 *   - `formatFileSize`  — human byte size
 *   - `useFileActions`  — the canonical download (streams bytes through Python
 *                         so the saved filename/extension is correct, and a
 *                         dead signed URL self-heals — same as images)
 *   - `useFileSrc`      — resolves a live URL from a `file_id` for "open"
 *
 * When only a `url`/`download_url` is present (no owned `file_id`), it falls
 * back to those directly.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { formatFileSize } from "@/features/files/utils/format";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { FileSource } from "@/features/files/handler/types";
import type { ResultFileRef } from "./shape";

export interface ResultFileProps {
  file: ResultFileRef;
  density?: "inline" | "full";
  className?: string;
}

/** Best-effort display name: explicit name → last URL path segment → "Document". */
function deriveName(file: ResultFileRef): string {
  if (file.file_name && file.file_name.trim().length > 0)
    return file.file_name.trim();
  const src = file.download_url ?? file.url;
  if (src) {
    try {
      const base = new URL(src).pathname.split("/").filter(Boolean).pop();
      if (base) return decodeURIComponent(base);
    } catch {
      // Not a parseable URL — fall through.
    }
  }
  return "Document";
}

/** A short uppercase type label (extension, else the mime subtype). */
function deriveTypeLabel(file: ResultFileRef, name: string): string | null {
  const extMatch = /\.([a-z0-9]{1,6})$/i.exec(name);
  if (extMatch) return extMatch[1].toUpperCase();
  if (file.mime_type) {
    const sub = file.mime_type.split("/")[1];
    if (sub) {
      // e.g. "vnd.openxmlformats-officedocument.wordprocessingml.document" → skip noise.
      const clean = sub.split(/[.+-]/).pop();
      if (clean && clean.length <= 8) return clean.toUpperCase();
    }
  }
  return null;
}

function triggerAnchorDownload(href: string, name: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const ResultFile: React.FC<ResultFileProps> = ({
  file,
  density = "inline",
  className,
}) => {
  const [busy, setBusy] = useState(false);
  const fileId = file.file_id;
  const actions = useFileActions(fileId ?? "");

  // Resolve a live URL for "open" — from the owned file_id (self-healing,
  // CDN/signed/share aware) or the raw url the tool handed us.
  const source = useMemo<FileSource | null>(() => {
    if (fileId) return { kind: "file_id", fileId };
    if (file.url) return { kind: "external_url", url: file.url };
    return null;
  }, [fileId, file.url]);
  const resolvedSrc = useFileSrc(source);

  const name = useMemo(() => deriveName(file), [file]);
  const typeLabel = useMemo(() => deriveTypeLabel(file, name), [file, name]);
  const openHref = resolvedSrc ?? file.download_url ?? file.url ?? null;

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (fileId) {
        setBusy(true);
        try {
          await actions.download();
        } catch (err) {
          console.error(
            "[ResultFile] owned-file download failed, falling back to direct URL",
            err,
          );
          const href = file.download_url ?? file.url;
          if (href) triggerAnchorDownload(href, name);
        } finally {
          setBusy(false);
        }
        return;
      }
      const href = file.download_url ?? file.url;
      if (href) triggerAnchorDownload(href, name);
    },
    [actions, fileId, file.download_url, file.url, name],
  );

  const iconSize = density === "full" ? 32 : 22;
  const metaParts = [typeLabel, formatFileSize(file.byte_size ?? null)].filter(
    Boolean,
  ) as string[];

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2",
        className,
      )}
    >
      <FileIcon
        fileName={name}
        mimeType={file.mime_type ?? null}
        size={iconSize}
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-foreground"
          title={name}
        >
          {name}
        </p>
        {metaParts.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {metaParts.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open in new tab"
            title="Open in new tab"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          aria-label="Download"
          title="Download"
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground",
            "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>Download</span>
        </button>
      </div>
    </div>
  );
};

export default ResultFile;
