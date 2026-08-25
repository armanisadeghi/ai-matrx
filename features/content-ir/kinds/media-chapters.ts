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

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";
import type { MaterializedKind } from "./kind-payload";
import type { MediaChapter } from "./generated/kinds.generated";

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
    // NO `additionalDetails`. Under a bound output schema every declared
    // property becomes REQUIRED (OpenAI strict / Anthropic both enforce it),
    // so declaring the residue channel would force the model to emit an empty
    // object on every run for nothing. Unknown keys still survive — they ride
    // the parser's residue channel and `collectExtras` renders them.
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
/** THE SHAPE COMES FROM THE REGISTRY (`pnpm shape:types`). */
export type MediaChapterData = Omit<MaterializedKind<MediaChapter>, "__kind">;

export type MediaChaptersData = {
  chapters: MediaChapterData[];
  isComplete: boolean;
};

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * THE one chapter reader. Mid-stream a chapter object exists before its
 * fields close, so a title-less entry is normal — it is dropped rather than
 * rendered as a blank row. The persistence side's `parseChapters`
 * (features/podcasts/types.ts) WRAPS this function (duplicate collapsed
 * 2026-08-23), so a live run and a reloaded episode can never parse
 * differently.
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

/**
 * `MM:SS` / `HH:MM:SS` → seconds. Returns null for anything else, which is
 * what makes a malformed offset render as plain text instead of a button that
 * seeks to the wrong place — and what keeps a bad row out of the RSS chapters
 * document.
 *
 * Lives HERE, next to `readChapterList`, rather than in the renderer: the
 * `podcast:chapters` JSON endpoint and the RSS feed are server modules and
 * cannot import a `"use client"` component just to read a timestamp. One kind,
 * one parser, both sides.
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

const MD_KNOWN_KEYS = ["chapters", KIND_KEY];

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
