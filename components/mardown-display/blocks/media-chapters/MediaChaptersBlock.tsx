"use client";

/**
 * MediaChaptersBlock — THE renderer for the `media_chapters` kind. There is
 * no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component: this one renders a chapter
 * index in the live run window, in chat, and on the podcast studio's
 * persisted-chapters panel — the same pixels in all three. Need one row on
 * its own? Import `MediaChapterRow`. Need a verb on it? Pass `actions`. Need
 * seeking? Pass `onSeek` — chapters become buttons that jump the player.
 * **Do not build a second chapter list.**
 *
 * Streaming-first by construction: the component mounts the instant the
 * discriminator parses and each chapter appears as its object closes, so an
 * empty list is a normal readable state, never a spinner and never raw JSON.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/media-chapters.ts`.
 */

import type { ReactNode } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import type {
  MediaChapterData,
  MediaChaptersData,
} from "@/features/content-ir/kinds/media-chapters";
import { readChapterList } from "@/features/content-ir/kinds/media-chapters";
import { cn } from "@/lib/utils";

export interface MediaChaptersBlockProps {
  serverData?: unknown;
  /**
   * Seek handler in SECONDS. Supplied by a surface that owns a player;
   * without it the rows render as static text (correct in chat, where there
   * is nothing to seek).
   */
  onSeek?: (seconds: number, chapter: MediaChapterData) => void;
  /** Verbs that act on THIS chapter set, rendered in the component's header. */
  actions?: ReactNode;
  /** Copy shown when the set is empty and nothing is streaming. */
  emptyHint?: string;
  /** Hide the header row — for a host frame that already draws its own. */
  hideHeader?: boolean;
  className?: string;
}

/**
 * `MM:SS` / `HH:MM:SS` → seconds. Returns null for anything else, which is
 * what makes a malformed offset render as plain text instead of a button
 * that seeks to the wrong place.
 */
export function chapterStartSeconds(startHint: string): number | null {
  const parts = startHint.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d{1,2}$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps, so stale/foreign `serverData` renders
 * nothing rather than throwing inside the stream.
 */
export function readMediaChaptersData(
  serverData: unknown,
): MediaChaptersData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<MediaChaptersData>;
  if (!Array.isArray(candidate.chapters)) return null;
  return {
    chapters: readChapterList(candidate.chapters),
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS — importable on their own so a surface can render one row without
// re-implementing it. This is the ONLY sanctioned way to render part of a
// shape.
// ---------------------------------------------------------------------------

export function MediaChapterRow({
  chapter,
  onSeek,
}: {
  chapter: MediaChapterData;
  onSeek?: (seconds: number, chapter: MediaChapterData) => void;
}) {
  const seconds = chapterStartSeconds(chapter.start_hint);
  const seekable = onSeek != null && seconds != null;

  const body = (
    <>
      <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {chapter.start_hint || "—"}
      </span>
      <span className="min-w-0 text-left text-sm">
        <span className="font-medium text-foreground">{chapter.title}</span>
        {chapter.summary && (
          <span className="text-muted-foreground"> — {chapter.summary}</span>
        )}
      </span>
    </>
  );

  if (!seekable) {
    return (
      <li className="animate-in fade-in flex items-start gap-2.5">{body}</li>
    );
  }

  return (
    <li className="animate-in fade-in">
      <button
        type="button"
        onClick={() => onSeek(seconds, chapter)}
        title={`Jump to ${chapter.start_hint}`}
        className="flex w-full items-start gap-2.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {body}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts. Nothing here that a part could own.
// ---------------------------------------------------------------------------

export default function MediaChaptersBlock({
  serverData,
  onSeek,
  actions,
  emptyHint,
  hideHeader = false,
  className,
}: MediaChaptersBlockProps) {
  const data = readMediaChaptersData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Chapters</span>
          {data.chapters.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {data.chapters.length}
            </span>
          )}
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Segmenting
            </span>
          )}
          {actions && <div className="ml-auto">{actions}</div>}
        </div>
      )}

      {data.chapters.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {data.isComplete
            ? (emptyHint ?? "No chapters.")
            : "Reading the script…"}
        </p>
      ) : (
        <ol className="space-y-2">
          {data.chapters.map((chapter, index) => (
            <MediaChapterRow
              key={`${chapter.start_hint}-${index}`}
              chapter={chapter}
              onSeek={onSeek}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
