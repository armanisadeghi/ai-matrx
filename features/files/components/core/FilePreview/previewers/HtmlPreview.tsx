/**
 * features/files/components/core/FilePreview/previewers/HtmlPreview.tsx
 *
 * Renders saved HTML files. Two modes — Rendered (default) and Source — so
 * the user sees the actual web page first, with a one-click escape into the
 * raw markup. Mirrors the SVG previewer's pattern.
 *
 * **Rendered** mode mounts a sandboxed `<iframe src={signedUrl}>`. The
 * iframe is `sandbox="allow-scripts"` — scripts can run (most saved pages
 * need them to look right), but `allow-same-origin` is intentionally
 * omitted so the iframe cannot read cookies / localStorage / etc. of
 * aimatrx.com. Top-frame navigation is also blocked (`allow-top-navigation`
 * not granted), so a hostile page cannot bounce the user off the app.
 *
 * **Source** mode fetches the bytes through `useFileBlob` (Python
 * `/files/{id}/download`) and renders the raw markup in a read-only
 * `<pre>`. This is intentionally minimal — actual source editing happens
 * in the Edit tab via Monaco.
 *
 * **Control rail integration**: when mounted inside `SingleFileShell`'s
 * `FileViewerControlsProvider`, this previewer reads the `htmlMode`,
 * `htmlViewport`, and `htmlReloadKey` from the context (driven by the
 * `HtmlPreviewControls` rail). When mounted standalone (PreviewPane),
 * it falls back to local state with a Rendered/Source toggle in the
 * header strip.
 */

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Code as CodeIcon, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import {
  useFileViewerControls,
  type HtmlMode,
  type HtmlViewport,
} from "@/features/files/components/surfaces/FileViewerControlsContext";

export interface HtmlPreviewProps {
  url: string | null;
  fileId: string;
  fileName: string;
  className?: string;
}

// Viewport widths — match the breakpoints we hand-tune for elsewhere in the
// app. Heights aren't constrained; the iframe takes the host's full height.
const VIEWPORT_WIDTH: Record<Exclude<HtmlViewport, "auto">, number> = {
  mobile: 390, // iPhone 14 / 15
  tablet: 768, // iPad mini portrait
  desktop: 1280,
};

export function HtmlPreview({
  url,
  fileId,
  fileName,
  className,
}: HtmlPreviewProps) {
  const controls = useFileViewerControls();
  const [localMode, setLocalMode] = useState<HtmlMode>("rendered");
  const mode = controls?.htmlMode ?? localMode;
  const setMode = controls?.setHtmlMode ?? setLocalMode;
  const viewport: HtmlViewport = controls?.htmlViewport ?? "auto";
  const reloadKey = controls?.htmlReloadKey ?? 0;

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      {/* Local toolbar — only renders when no rail provider is mounted (i.e.
       * we're in PreviewPane, not SingleFileShell). The shell takes those
       * controls into the left rail. */}
      {!controls ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-3 py-1.5 text-xs">
          <span className="truncate font-medium text-foreground">
            {fileName}
          </span>
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<Eye className="h-3 w-3" />}
              label="Rendered"
              active={mode === "rendered"}
              onClick={() => setMode("rendered")}
            />
            <ToolbarButton
              icon={<CodeIcon className="h-3 w-3" />}
              label="Source"
              active={mode === "source"}
              onClick={() => setMode("source")}
            />
          </div>
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        {mode === "rendered" ? (
          <RenderedView
            url={url}
            viewport={viewport}
            reloadKey={reloadKey}
            fileName={fileName}
          />
        ) : (
          <SourceView fileId={fileId} />
        )}
      </div>
    </div>
  );
}

export default HtmlPreview;

// ---------------------------------------------------------------------------
// Rendered view — sandboxed iframe driven by the signed URL.
// ---------------------------------------------------------------------------

function RenderedView({
  url,
  viewport,
  reloadKey,
  fileName,
}: {
  url: string | null;
  viewport: HtmlViewport;
  reloadKey: number;
  fileName: string;
}) {
  const [errored, setErrored] = useState(false);

  // Reset error state when the user explicitly reloads.
  useEffect(() => {
    setErrored(false);
  }, [reloadKey, url]);

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30">
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">Preview unavailable.</span>
      </div>
    );
  }

  const constrained = viewport !== "auto";
  const width = constrained ? VIEWPORT_WIDTH[viewport] : undefined;

  return (
    <div
      className={cn(
        "h-full w-full overflow-auto bg-muted/10",
        constrained && "flex items-start justify-center",
      )}
    >
      <div
        className={cn(
          "h-full bg-background",
          constrained
            ? "my-4 shadow-lg border border-border/60 rounded-md overflow-hidden"
            : "w-full",
        )}
        style={constrained ? { width } : undefined}
      >
        <iframe
          // `reloadKey` in the key forces a clean re-mount on reload.
          key={`${reloadKey}-${url}`}
          src={url}
          title={fileName}
          // No `allow-same-origin` → the iframe cannot read/write our
          // cookies, localStorage, or talk to our APIs. Scripts are allowed
          // because most saved web pages need them to look right.
          // `allow-popups` so on-page links to other tabs still work; nav
          // inside the iframe is contained.
          sandbox="allow-scripts allow-popups allow-forms"
          referrerPolicy="no-referrer"
          className="h-full w-full border-0 bg-white"
          onError={() => setErrored(true)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source view — raw markup as plain text. Edits live in the Edit tab.
// ---------------------------------------------------------------------------

function SourceView({ fileId }: { fileId: string }) {
  const { blob, loading, error } = useFileBlob(fileId);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setText(null);
      return;
    }
    let cancelled = false;
    blob.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-destructive">
        Couldn&apos;t load source: {error}
      </div>
    );
  }

  if (loading || text === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <pre className="h-full w-full overflow-auto bg-muted/10 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Local toolbar button — only shown when no control rail is mounted.
// ---------------------------------------------------------------------------

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
