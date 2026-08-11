/**
 * `media_chapters` (+ child `media_chapter`) — a timestamped chapter index for
 * a piece of timed media, as a Shape.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"media_chapters", "chapters": [
 *       { "__kind":"media_chapter", "start_hint":"00:00",
 *         "title":"…", "summary":"…" } ] }
 *
 * WHY THIS IS NOT `timeline`. `timeline` is a two-level ROADMAP —
 * `periods[] → events[]` with `status` completion tracking — rendered by
 * TimelineBlock as a progress visualization whose ids key per-event
 * completion state. A chapter index is flat, strictly increasing, gapless,
 * and has exactly one consumer semantic: SEEK THE PLAYER TO THIS OFFSET.
 * Mapping chapters onto timeline would require inventing a fake period level
 * and overloading `date` as a playback offset, and would then render roadmap
 * UI that cannot seek. That is a near-duplicate, not reuse — so this is its
 * own kind. (Reuse was checked first, per the reuse-first ladder.)
 *
 * FIELD PARITY is with `PcEpisodeChapter` (`features/podcasts/types.ts`) and
 * the shape `parseChapters` reads back off `pc_episodes.metadata.chapters` —
 * `start_hint` / `title` / `summary`, no more, no less. The kind is named
 * generically (`media_chapters`, not `podcast_chapters`) because the same
 * index serves video and any other timed media; nothing here is
 * podcast-specific.
 *
 * The bridge is STREAMING (page-brief / keyword-research precedent, NOT
 * makeCompleteEnvelopeBridge): `chapters` is an array of a CHILD KIND, so the
 * kernel commits it element-by-element and each chapter appears in the live
 * run window as it parses. An empty list is a NORMAL mid-stream state the
 * component renders — never a spinner, never raw JSON.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas — the single source the storage rows (`data[]` + kind_edge) and the
// emitted JSON Schemas are GENERATED from (kindSchemaToStorage /
// kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const mediaChapterKindSchema: KindSchema = {
  kind: "media_chapter",
  fields: {
    start_hint: {
      type: "string",
      required: true,
      description:
        "Start offset as MM:SS or HH:MM:SS. The first chapter is always 00:00; offsets strictly increase and never reach the media's total duration.",
    },
    title: {
      type: "string",
      required: true,
      description:
        "Short player-chip chapter title, no trailing punctuation.",
    },
    summary: {
      type: "string",
      description: "One sentence describing what this chapter covers.",
    },
  },
};

export const mediaChaptersKindSchema: KindSchema = {
  kind: "media_chapters",
  fields: {
    chapters: {
      type: "array",
      itemKinds: ["media_chapter"],
      required: true,
      description:
        "The chapters, in playback order — contiguous, gapless, strictly increasing.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const MEDIA_CHAPTERS_KIND_SCHEMAS: KindSchema[] = [
  mediaChaptersKindSchema,
  mediaChapterKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING: a partial envelope maps to partial data.
// ---------------------------------------------------------------------------

/** One chapter as the component consumes it. Mirrors `PcEpisodeChapter`. */
export interface MediaChapterData {
  start_hint: string;
  title: string;
  summary: string;
}

export interface MediaChaptersData {
  chapters: MediaChapterData[];
  isComplete: boolean;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Mid-stream a chapter object exists before its fields close, so a
 * title-less entry is normal — it is dropped rather than rendered as a blank
 * row, exactly as `parseChapters` drops it on the persistence side. Keeping
 * the two readers identical is what lets the same component render a live run
 * and a reloaded episode.
 */
export function readChapterList(value: unknown): MediaChapterData[] {
  if (!Array.isArray(value)) return [];
  const out: MediaChapterData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const title = stringOr(entry.title, "");
    if (!title) continue;
    out.push({
      start_hint: stringOr(entry.start_hint, ""),
      title,
      summary: stringOr(entry.summary, ""),
    });
  }
  return out;
}

export function mediaChaptersServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (MediaChaptersData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "media_chapters") return undefined;
  return {
    chapters: readChapterList(envelope.root.value.chapters),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the chapter index as a readable list.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["chapters"];

export function mediaChaptersMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const chapters = readChapterList(value.chapters);
  const lines =
    chapters.length > 0
      ? chapters
          .map((ch) => {
            const stamp = ch.start_hint || "—";
            const summary = ch.summary ? ` — ${ch.summary}` : "";
            return `- \`${stamp}\` **${ch.title}**${summary}`;
          })
          .join("\n")
      : "_(no chapters yet)_";

  return joinBlocks([
    "# Chapters",
    lines,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const MEDIA_CHAPTERS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "media_chapters",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "media_chapters",
    toLegacyServerData: mediaChaptersServerDataFromEnvelope,
    toMarkdown: mediaChaptersMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: mediaChaptersKindSchema,
  },
  {
    kind: "media_chapter",
    schemaSource: "system",
    tier: "eager",
    schema: mediaChapterKindSchema,
  },
];
