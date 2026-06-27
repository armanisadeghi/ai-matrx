/**
 * features/files/components/core/FilePreview/previewers/SvgPreview.tsx
 *
 * Dedicated SVG previewer. SVG is unique among image formats because it's
 * text under the hood (XML), so we give it two views:
 *
 *   1. Rendered — `<img src={signedUrl}>` on a checkerboard transparency
 *      grid so the user can actually see the alpha channel that an opaque
 *      `bg-muted/20` would hide.
 *   2. Source — the raw XML markup, fetched lazily via `useFileBlob` only
 *      when the user toggles to it. Read-only here; the Edit tab is where
 *      live editing happens (Monaco with XML highlighting).
 *
 * The signed URL is sufficient for the rendered view (no CORS preflight on
 * `<img>` tags), so we don't fetch bytes unless the user asks for source.
 * That keeps the default-case bundle and network costs identical to the
 * plain `<ImagePreview>` it replaces.
 */

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Code2, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import { useRemintableSrc } from "@/features/files/handler/hooks/useRemintableSrc";

type View = "rendered" | "source";

export interface SvgPreviewProps {
  /** Signed URL for the SVG bytes. Streams directly into the `<img>` tag. */
  url: string | null;
  fileName: string;
  /** Required for the Source view, which pulls bytes via the Python download
   *  endpoint (sidesteps the S3-CORS block that signed URLs hit on `fetch`). */
  fileId: string;
  className?: string;
}

export function SvgPreview({
  url,
  fileName,
  fileId,
  className,
}: SvgPreviewProps) {
  const [view, setView] = useState<View>("rendered");

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-h-0 flex-col bg-background",
        className,
      )}
    >
      <SvgViewToggle view={view} onChange={setView} />

      {view === "rendered" ? (
        <SvgRenderedView url={url} fileName={fileName} />
      ) : (
        <SvgSourceView fileId={fileId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 1: rendered (default)
// ---------------------------------------------------------------------------

interface SvgRenderedViewProps {
  url: string | null;
  fileName: string;
}

function SvgRenderedView({ url, fileName }: SvgRenderedViewProps) {
  // Media durability: an SVG served by a signed (expiring) S3 URL must
  // re-mint from its file_id on an in-view load failure rather than show a
  // terminal error — a user's own file never just "expires". `useRemintableSrc`
  // recovers the file_id from the URL and re-mints; for a durable/foreign URL
  // it's a transparent passthrough. `failed` flips only after re-mint is
  // exhausted. Hook called unconditionally (before the early returns) to respect
  // the rules of hooks.
  const { src, onError, failed } = useRemintableSrc(url);

  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">SVG could not be rendered.</span>
        <span className="text-[11px] text-muted-foreground/80">
          Try the Source view to inspect the markup.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-checkerboard p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={fileName}
        className="max-h-full max-w-full object-contain drop-shadow-sm"
        onError={onError}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 2: source (XML)
// ---------------------------------------------------------------------------

interface SvgSourceViewProps {
  fileId: string;
}

function SvgSourceView({ fileId }: SvgSourceViewProps) {
  const { blob, loading, error } = useFileBlob(fileId);
  const [source, setSource] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    setSource(null);
    setReadError(null);
    if (!blob) return;
    let cancelled = false;
    blob
      .text()
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (loading || (!source && !error && !readError)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const message = error ?? readError;
  if (message) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">Could not load source.</span>
        <span className="text-[11px] text-muted-foreground/80">{message}</span>
      </div>
    );
  }

  return (
    <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-muted/20 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
      {source}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Toggle: floating top-right segmented control
// ---------------------------------------------------------------------------

interface SvgViewToggleProps {
  view: View;
  onChange: (next: View) => void;
}

function SvgViewToggle({ view, onChange }: SvgViewToggleProps) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
      <ToggleButton
        active={view === "rendered"}
        onClick={() => onChange("rendered")}
        icon={<ImageIcon className="h-3.5 w-3.5" />}
        label="Rendered"
      />
      <ToggleButton
        active={view === "source"}
        onClick={() => onChange("source")}
        icon={<Code2 className="h-3.5 w-3.5" />}
        label="Source"
      />
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ToggleButton({ active, onClick, icon, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default SvgPreview;
