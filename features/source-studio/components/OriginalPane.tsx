"use client";

/**
 * The Source screen's Original pane (SOURCE-CONVERGENCE §8.2): the thing the
 * Source was taken from, shown by the viewer that already exists for it —
 * the PDF studio's PDF viewer, the file previewers' seekable video / audio
 * players, the stored web snapshot (sandboxed, no scripts) or the live
 * address opened at the passage. Nothing here invents a viewer; it routes.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Globe, Mic } from "lucide-react";
import { useMediaResolution } from "@ai-matrx/media/core";
import { PdfCldFileViewer } from "@/features/pdf-extractor/studio/PdfStudioReader";
import { VideoPreview } from "@/features/files/components/core/FilePreview/previewers/VideoPreview";
import { AudioPreview } from "@/features/files/components/core/FilePreview/previewers/AudioPreview";
import { fetchFileBlob } from "@/features/files/hooks/useFileBlob";
import { rememberFileOrganization } from "@/features/files/api/fileOrganization";
import {
  snapshotDocument,
  snapshotHtml,
  textFragmentUrl,
  type OriginalView,
  type SeekRequest,
} from "@/features/source-studio/sourceStudioModel";

export interface OriginalPaneProps {
  view: OriginalView;
  name: string;
  /** The active portion's page (PDF) — the viewer follows it. */
  pageNumber: number | null;
  onPageChange?: (page: number) => void;
  /** The latest seek (portion or chunk click) for players. */
  seek: SeekRequest | null;
  /** The active portion's text — the live page opens at it. */
  passage: string | null;
  /**
   * The Source's organization. Its original bytes were stored for that
   * organization, so every file read names it (never the active workspace).
   */
  organizationId: string;
}

export function OriginalPane({
  view,
  name,
  pageNumber,
  onPageChange,
  seek,
  passage,
  organizationId,
}: OriginalPaneProps) {
  // Idempotent: tells the file client which organization reads this file, so
  // the download never asks "which workspace?" for a Source it already names.
  if ("fileId" in view) rememberFileOrganization(view.fileId, organizationId);
  switch (view.kind) {
    case "pdf":
      return (
        <PdfCldFileViewer
          fileId={view.fileId}
          fileName={name}
          pageNumber={pageNumber ?? undefined}
          onPageChange={onPageChange}
        />
      );
    case "video":
      return <MediaPlayer fileId={view.fileId} kind="video" name={name} seek={seek} />;
    case "audio":
      return <MediaPlayer fileId={view.fileId} kind="audio" name={name} seek={seek} />;
    case "youtube":
      return <YouTubeOriginal videoId={view.videoId} url={view.url} seek={seek} />;
    case "transcript-no-media":
      return (
        <Notice icon={<Mic className="h-5 w-5" />} title="No recording on file">
          This transcript was saved without its audio or video, so there is
          nothing to play. Its segments, with their times, are in the list on
          the left and in the text panes.
        </Notice>
      );
    case "web-snapshot":
      return <WebSnapshot fileId={view.fileId} url={view.url} passage={passage} />;
    case "web-live":
      return <LivePage url={view.url} passage={passage} />;
    case "file":
      return (
        <Notice icon={<FileText className="h-5 w-5" />} title="Original file">
          This Source was read from a file.{" "}
          <Link
            href={`/files/f/${view.fileId}`}
            target="_blank"
            className="text-primary hover:underline"
          >
            Open the file
          </Link>
          .
        </Notice>
      );
    case "text":
      return (
        <Notice icon={<FileText className="h-5 w-5" />} title="The text is the original">
          This Source was added as text, so there is no separate original to
          show. Its text is in the Raw and Clean panes.
        </Notice>
      );
  }
}

function MediaPlayer({
  fileId,
  kind,
  name,
  seek,
}: {
  fileId: string;
  kind: "video" | "audio";
  name: string;
  seek: SeekRequest | null;
}) {
  const src = useMediaResolution(fileId).resolution?.src ?? null;
  return kind === "video" ? (
    <VideoPreview url={src} mimeType={null} label={name} seek={seek} className="h-full" />
  ) : (
    <div className="flex h-full items-center justify-center p-4">
      <AudioPreview url={src} fileName={name} mimeType={null} seek={seek} />
    </div>
  );
}

function YouTubeOriginal({
  videoId,
  url,
  seek,
}: {
  videoId: string;
  url: string;
  seek: SeekRequest | null;
}) {
  // A seek re-mounts the embed at `start` (the embed's own time parameter);
  // no player API script is loaded.
  const start = seek ? Math.floor(seek.seconds) : 0;
  const autoplay = seek ? 1 : 0;
  return (
    <div className="flex h-full flex-col bg-black">
      <iframe
        key={seek?.nonce ?? "initial"}
        title="Video"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&autoplay=${autoplay}`}
        className="min-h-0 w-full flex-1"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 bg-card px-3 py-1.5 text-xs text-primary hover:underline"
      >
        Open on YouTube <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

async function gunzipIfNeeded(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return blob.text();
}

function WebSnapshot({
  fileId,
  url,
  passage,
}: {
  fileId: string;
  url: string | null;
  passage: string | null;
}) {
  const [state, setState] = useState<{
    forId: string | null;
    html: string | null;
    error: string | null;
  }>({ forId: null, html: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${fileId}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    const k = `${fileId}:${attempt}`;
    void (async () => {
      try {
        const text = await gunzipIfNeeded(await fetchFileBlob(fileId));
        if (cancelled) return;
        const html = snapshotHtml(text);
        setState({
          forId: k,
          html,
          error: html
            ? null
            : "The stored capture holds the page's data, not a copy of the page itself.",
        });
      } catch (err) {
        if (!cancelled)
          setState({
            forId: k,
            html: null,
            error: `The stored copy of this page could not be opened (${
              err instanceof Error ? err.message : String(err)
            }).`,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, attempt]);

  const settled = state.forId === key;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0">As captured</span>
        {url && (
          <a
            href={textFragmentUrl(url, passage)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
          >
            <span className="truncate">Open the live page at this part</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )}
      </div>
      {!settled ? (
        <div className="m-3 h-40 animate-pulse rounded-md bg-muted/50" />
      ) : state.html ? (
        // No scripts, no same-origin: the captured page can never act as us.
        <iframe
          title="Captured page"
          sandbox=""
          srcDoc={snapshotDocument(state.html, url)}
          className="min-h-0 w-full flex-1 bg-white"
        />
      ) : (
        <Notice icon={<Globe className="h-5 w-5" />} title="Stored copy unavailable">
          {state.error}{" "}
          {url
            ? "Use “Open the live page” above to read it where it lives."
            : "The captured text is in the Raw and Clean panes."}{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Try again
          </button>
        </Notice>
      )}
    </div>
  );
}

function LivePage({ url, passage }: { url: string; passage: string | null }) {
  return (
    <Notice icon={<Globe className="h-5 w-5" />} title="Live page">
      A copy of this page was not stored when it was captured, and most sites
      refuse to be shown inside another site.{" "}
      <a
        href={textFragmentUrl(url, passage)}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary hover:underline"
      >
        Open {url} at this part
      </a>
      .
    </Notice>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm space-y-2 text-center text-sm text-muted-foreground">
        <div className="flex justify-center text-muted-foreground/80">{icon}</div>
        <p className="font-medium text-foreground">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}
