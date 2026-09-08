"use client";

/**
 * MediaAssetBlock — THE renderer for the `media_asset` kind. There is no
 * other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (`features/content-ir/FEATURE.md`). This is a
 * THIN WRAPPER over `<InlineMediaRef>` — the canonical media renderer that
 * already serves `podcast_episode`, `generated_audio`,
 * `generated_image_set` and `generated_video_set`. It forks no player, mints
 * no URL, and writes no raw `src`.
 *
 * 🚨 `media_type: "unknown"` IS THE NORMAL CASE, not an error. A bare durable
 * CDN URL carries no extension and no mime, so most real instances arrive
 * untyped. An untyped asset renders a WORKING LINK — never a guessed `<img>`
 * that would show a broken-image glyph for a PDF.
 *
 * 🚨 NO DEAD CONTROLS (platform law: a screen is absent or honest, never dead
 * or lying). Every branch ends in something that works: an embed, a link, an
 * "Open file" button for a `file_id`-only asset, or a plain sentence saying
 * why there is nothing to open. The one thing it will never do is render an
 * expiring signed URL with no recoverable identity — `buildMediaSource`
 * refuses that upstream (it would leak a bearer credential and break the
 * moment the signature expires) and this component says so out loud.
 */

import {
  AudioLines,
  FileText,
  Film,
  ImageIcon,
  Link2,
  Loader2,
  Paperclip,
} from "lucide-react";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { formatDurationMs, formatFileSize } from "@ai-matrx/kit/format";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import YouTubeEmbed from "@/features/files/blocks/youtube/YouTubeEmbed";
import {
  readMediaAsset,
  type MediaAssetData,
  type MediaAssetType,
} from "@/features/content-ir/kinds/media-asset";
import { cn } from "@/lib/utils";

export interface MediaAssetBlockProps {
  serverData?: unknown;
  hideHeader?: boolean;
  className?: string;
}

/**
 * The bridge already produced this shape; re-reading it is how the component
 * stays honest about foreign `serverData` (the sibling media blocks all do
 * the same). `mediaRef` is the bridge's own derived field — its presence,
 * even as `null`, is what distinguishes this shape.
 */
export function readMediaAssetData(serverData: unknown): MediaAssetData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  if (!("mediaRef" in serverData)) return null;
  const data = readMediaAsset(serverData as Record<string, unknown>);
  const candidate = serverData as Partial<MediaAssetData>;
  return { ...data, isComplete: candidate.isComplete === true };
}

const TYPE_ICON: Record<MediaAssetType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: AudioLines,
  document: FileText,
  youtube: Film,
  unknown: Paperclip,
};

const TYPE_LABEL: Record<MediaAssetType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  youtube: "YouTube video",
  unknown: "File",
};

function factsOf(data: MediaAssetData): string[] {
  return [
    data.size_bytes !== null ? formatFileSize(data.size_bytes) : null,
    data.duration_ms !== null ? formatDurationMs(data.duration_ms) : null,
    data.width !== null && data.height !== null
      ? `${data.width}×${data.height}`
      : null,
    data.page_count !== null
      ? `${data.page_count} page${data.page_count === 1 ? "" : "s"}`
      : null,
  ].filter((fact): fact is string => fact !== null);
}

// ---------------------------------------------------------------------------
// PARTS — importable alone. The ONLY sanctioned way to render part of this
// shape.
// ---------------------------------------------------------------------------

/**
 * The always-available door. Renders a real anchor when the asset has a
 * durable href, an "Open file" button when it only has a `file_id`, and
 * nothing at all when neither exists (the caller states the reason instead —
 * a disabled-looking control that does nothing is banned).
 */
export function MediaAssetLink({
  data,
  label,
  className,
}: {
  data: MediaAssetData;
  label?: string;
  className?: string;
}) {
  const openFilePreview = useOpenFilePreviewWindow();
  const text = label ?? data.file_name ?? data.source_label ?? "Open";

  if (data.linkHref) {
    return (
      <a
        href={data.linkHref}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded text-xs text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{text}</span>
      </a>
    );
  }

  if (data.file_id) {
    return (
      <button
        type="button"
        onClick={() => openFilePreview({ fileId: data.file_id as string })}
        className={cn(
          "inline-flex items-center gap-1.5 rounded text-xs text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{text} file</span>
      </button>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// The parent.
// ---------------------------------------------------------------------------

export default function MediaAssetBlock({
  serverData,
  hideHeader = false,
  className,
}: MediaAssetBlockProps) {
  const data = readMediaAssetData(serverData);
  if (!data) return null;

  const type = data.effectiveMediaType;
  const Icon = TYPE_ICON[type];
  const title = data.file_name ?? data.source_label ?? TYPE_LABEL[type];
  const facts = factsOf(data);

  // A media value arrives whole, so the only pre-value state is "the region
  // has not closed yet" — a fixed-aspect skeleton, never a partial player.
  const skeleton = data.isComplete ? undefined : ("skeleton" as const);

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">
            {title}
          </span>
          {facts.length > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {facts.join(" · ")}
            </span>
          )}
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading
            </span>
          )}
        </div>
      )}

      <MediaAssetBody data={data} skeleton={skeleton} />

      {data.transcript && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-foreground">
            Transcript
          </summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-2 pb-2 text-xs text-muted-foreground">
            {data.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}

function MediaAssetBody({
  data,
  skeleton,
}: {
  data: MediaAssetData;
  skeleton: "skeleton" | undefined;
}) {
  const type = data.effectiveMediaType;

  // A YouTube address is a declared third-party page, not our bytes — the one
  // embed component owns it.
  if (type === "youtube" && data.youtubeId) {
    return (
      <YouTubeEmbed
        videoId={data.youtubeId}
        title={data.file_name ?? data.source_label ?? undefined}
      />
    );
  }

  // Nothing safely renderable. Say why, and still offer whatever door exists.
  if (!data.mediaRef) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {data.unresolvable
            ? "This media's only address expires and carries no file id, so it is not shown here — the producer must supply a file_id or a permanent URL."
            : data.isComplete
              ? "No media address was provided."
              : "Waiting for the media…"}
        </p>
        <MediaAssetLink data={data} />
      </div>
    );
  }

  if (type === "image") {
    return (
      <div className="space-y-1.5">
        <InlineMediaRef
          ref={data.mediaRef}
          as="img"
          size="fill"
          fit="contain"
          rounded="md"
          alt={data.file_name ?? data.source_label ?? "Image"}
          fallback={skeleton ?? "icon"}
          className="max-h-[70vh] w-full"
        />
        <MediaAssetLink data={data} label="Open image" />
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className="space-y-1.5">
        <div className="aspect-video w-full">
          <InlineMediaRef
            ref={data.mediaRef}
            as="video"
            size="fill"
            rounded="md"
            controls
            preload="metadata"
            fallback={skeleton ?? "icon"}
          />
        </div>
        <MediaAssetLink data={data} label="Open video" />
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className="space-y-1.5">
        {/* The wrapper is a HEIGHT, not chrome: `size="fill"` means `h-full`,
            and a parent with auto height renders the player at 0px. */}
        <div className="h-[54px] w-full">
          <InlineMediaRef
            ref={data.mediaRef}
            as="audio"
            size="fill"
            rounded="md"
            controls
            preload="metadata"
            fallback={skeleton ?? "icon"}
          />
        </div>
        <MediaAssetLink data={data} label="Open audio" />
      </div>
    );
  }

  // DOCUMENT and UNKNOWN — the normal case. A working link, never a guessed
  // embed. `MediaAssetLink` always returns something here: `mediaRef` is
  // non-null, so there is either a durable href or a file_id.
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <MediaAssetLink
        data={data}
        label={data.file_name ?? data.source_label ?? "Open media"}
      />
      {data.mime_type && (
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {data.mime_type}
        </p>
      )}
    </div>
  );
}
