/**
 * The plain-language layer over a coverage mention.
 *
 * A row in the coverage feed must SAY WHAT HAPPENED — "You are in the headline,
 * positively, and it links to you" — because the person reading it is a
 * brilliant expert in their own field and not in PR measurement. Enum chips are
 * for the person who wants the raw call; the sentence is the product.
 *
 * The other job here is honesty about what we have NOT done: a story we have
 * not opened yet, or one on a source whose terms forbid crawling, must read as
 * a real state with a reason, never as an error and never as a zero.
 */

import type {
  CoverageCaptureStatus,
  CoverageMentionRow,
} from "@/features/marketing/data/coverage-types";

export const MEDIUM_LABEL: Record<string, string> = {
  news: "News",
  blog: "Blog",
  podcast: "Podcast",
  newsletter: "Newsletter",
  video: "Video",
  forum: "Forum",
  other: "Other",
};

export const CAPTURE_STATUS_LABEL: Record<string, string> = {
  captured: "Read",
  pending: "Not yet",
  blocked: "Not allowed",
  failed: "Could not read",
  skipped: "Nothing to read",
};

/** Why a row is in the capture state it is in — always a reason, never a code. */
export function captureExplainer(status: CoverageCaptureStatus | string): string {
  switch (status) {
    case "captured":
      return "We opened this page ourselves and read it, which is where the byline, the date and the scores come from.";
    case "pending":
      return "We found this story and have not opened it yet. Scores appear once we have read the page.";
    case "blocked":
      return "This source's terms do not allow us to crawl it, so we keep the headline and never the page. That is a deliberate limit, not a failure.";
    case "failed":
      return "We could not open this page — it may need a login, be offline, or block automated readers. The headline is still real.";
    case "skipped":
      return "We opened the page but there was no readable text on it (a video, a PDF, or a page that builds itself in the browser).";
    default:
      return "We have not recorded what happened when we tried to read this page.";
  }
}

export const SENTIMENT_STATUS: Record<string, string> = {
  positive: "success",
  neutral: "neutral",
  mixed: "warning",
  negative: "error",
};

const PROMINENCE_PHRASE: Record<string, string> = {
  headline: "You are in the headline",
  lede: "You are in the opening",
  body: "You are in the body of the piece",
  passing: "You get a passing mention",
};

const TONE_PHRASE: Record<string, string> = {
  positive: "and the tone toward you is positive",
  neutral: "and the tone toward you is neutral",
  mixed: "and the tone toward you is mixed",
  negative: "and the tone toward you is negative",
};

export interface CoverageVerdict {
  headline: string;
  detail: string;
  tone: "good" | "bad" | "default";
}

/** One sentence about what happened, one about what it means. */
export function coverageVerdict(row: CoverageMentionRow): CoverageVerdict {
  const who = row.is_competitor
    ? (row.competitor_key ?? "a rival")
    : "you";
  const outlet = row.domain;

  if (row.analyzed_at === null) {
    return {
      headline: row.is_competitor
        ? `${outlet} wrote about ${who}`
        : `${outlet} wrote about you`,
      detail: captureExplainer(row.capture_status),
      tone: "default",
    };
  }

  const prominence = PROMINENCE_PHRASE[row.prominence ?? ""] ?? "You are mentioned";
  const tonePhrase = TONE_PHRASE[row.sentiment ?? ""] ?? "";
  const linked = row.links_to_site
    ? ", and it links to your site"
    : ", but it does not link to you";

  const headline = row.is_competitor
    ? `${outlet} covered ${who}`
    : `${prominence} on ${outlet}${linked}`;

  const detail = [
    row.title ? `“${row.title}”` : null,
    row.author_name ? `by ${row.author_name}` : null,
    tonePhrase && !row.is_competitor ? tonePhrase.replace(/^and /, "") : null,
    row.hit_reason,
  ]
    .filter(Boolean)
    .join(" · ");

  const tone: CoverageVerdict["tone"] = row.is_competitor
    ? "default"
    : row.sentiment === "negative"
      ? "bad"
      : row.sentiment === "positive" || row.links_to_site
        ? "good"
        : "default";

  return { headline, detail, tone };
}
