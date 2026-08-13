/**
 * Content-volume classification for CMS pages — the honest "what's actually
 * there" read behind the pages-list indicator.
 *
 * The DB measures (PostgREST computed field `content_stats`, CMS migration
 * 0036); this module judges — conservatively. Arman's rule (2026-08-12): the
 * system claims pages "exist" that are placeholders, so show the volume of
 * code, guess the stage intelligently, and NEVER over-assume — a tiny
 * legitimate informational page must not be lumped with an empty shell. That
 * is why the measured number is always part of the label: the stage word can
 * be wrong at the margins, the character count cannot.
 *
 * A page's content lives on two sides (published columns + `_draft` twins).
 * The indicator answers "what exists anywhere on this page", so it grades the
 * side with MORE html — a realized-but-unpublished page is judged by its
 * draft, a published page with an in-progress draft by whichever is larger.
 */

import type { PageContentStats } from "@/features/cms/types";

export type ContentVolumeStage = "empty" | "stub" | "light" | "full";

export interface ContentVolume {
  stage: ContentVolumeStage;
  /** Short UI word for the stage. */
  label: string;
  /** e.g. "8.0k" — html chars of the graded side, human-formatted. */
  htmlDisplay: string;
  /** The graded side. */
  source: "published" | "draft";
  htmlLen: number;
  textLen: number;
  /** Full sentence for the tooltip — both sides, both measures. */
  detail: string;
}

/** 1234 → "1.2k", 987 → "987", 15600 → "16k" */
export function formatChars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

const STAGE_LABELS: Record<ContentVolumeStage, string> = {
  empty: "Empty",
  stub: "Stub",
  light: "Light",
  full: "Full",
};

/**
 * Thresholds, deliberately generous toward small-but-real pages:
 * - empty: literally nothing stored on either side.
 * - stub: too small to be a page — under 500 chars of html OR under 60 chars
 *   of visible text (a "coming soon" line, a realize placeholder). Even a
 *   half-screen informational page clears both bars easily.
 * - light: real markup but under ~600 chars of visible text — styled shells,
 *   hero-only pages, thin drafts.
 * - full: everything else.
 */
export function classifyContentVolume(
  stats: PageContentStats | null | undefined,
): ContentVolume | null {
  if (!stats) return null; // older cached row without the computed field — show nothing, claim nothing

  const publishedHtml = stats.html_len ?? 0;
  const draftHtml = stats.draft_html_len ?? 0;
  const source: "published" | "draft" =
    draftHtml > publishedHtml ? "draft" : "published";
  const htmlLen = source === "draft" ? draftHtml : publishedHtml;
  const textLen = source === "draft" ? stats.draft_text_len ?? 0 : stats.text_len ?? 0;

  let stage: ContentVolumeStage;
  if (publishedHtml === 0 && draftHtml === 0) stage = "empty";
  else if (htmlLen < 500 || textLen < 60) stage = "stub";
  else if (textLen < 600) stage = "light";
  else stage = "full";

  const side = (label: string, html: number, text: number) =>
    `${label}: ${html.toLocaleString()} chars html, ${text.toLocaleString()} text`;
  const detail =
    stage === "empty"
      ? "No content stored — published and draft are both empty."
      : [
          side("Published", publishedHtml, stats.text_len ?? 0),
          side("Draft", draftHtml, stats.draft_text_len ?? 0),
        ].join(" · ");

  return {
    stage,
    label: STAGE_LABELS[stage],
    htmlDisplay: formatChars(htmlLen),
    source,
    htmlLen,
    textLen,
    detail,
  };
}
