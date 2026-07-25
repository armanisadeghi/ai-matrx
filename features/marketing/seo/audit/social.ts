/**
 * Social share card evaluation — deterministic checks for Open Graph +
 * Twitter card metadata. Mirror of `matrx_scraper/audit_metrics.py`
 * `evaluate_social_card` (thresholds + issue strings byte-identical).
 */

import type { AuditIssue } from "./types";
import { issuesOk } from "./types";

/** Platforms truncate share titles around this many characters. */
export const SOCIAL_TITLE_MAX_CHARS = 70;
/** Platforms truncate share descriptions around this many characters. */
export const SOCIAL_DESCRIPTION_MAX_CHARS = 200;

export const KNOWN_TWITTER_CARDS = [
  "summary",
  "summary_large_image",
  "app",
  "player",
] as const;

/** Normalized (trimmed, empty→null) tag values — the evaluator's input. */
export interface SocialCardInput {
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  ogUrl: string | null;
  ogType: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
}

export interface SocialCardEvaluation {
  /** No error-severity issues (warnings allowed). */
  ok: boolean;
  /** What a share actually renders, og-first like the platforms resolve it. */
  title: string | null;
  titleSource: "og" | "twitter" | null;
  titleLength: number;
  description: string | null;
  descriptionSource: "og" | "twitter" | null;
  descriptionLength: number;
  image: string | null;
  imageSource: "og" | "twitter" | null;
  siteName: string | null;
  url: string | null;
  ogType: string | null;
  cardType: string | null;
  hasImage: boolean;
  issues: AuditIssue[];
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

function resolve(
  og: string | null,
  twitter: string | null,
): { value: string | null; source: "og" | "twitter" | null } {
  if (og) return { value: og, source: "og" };
  if (twitter) return { value: twitter, source: "twitter" };
  return { value: null, source: null };
}

export function evaluateSocialCard(input: SocialCardInput): SocialCardEvaluation {
  const title = resolve(input.ogTitle, input.twitterTitle);
  const description = resolve(input.ogDescription, input.twitterDescription);
  const image = resolve(input.ogImage, input.twitterImage);
  const titleLength = title.value ? codePointCount(title.value) : 0;
  const descriptionLength = description.value
    ? codePointCount(description.value)
    : 0;

  const issues: AuditIssue[] = [];
  if (!title.value)
    issues.push({
      severity: "error",
      message:
        "No social title — add og:title (or twitter:title) so shares don't render as a bare link",
    });
  if (!image.value)
    issues.push({
      severity: "error",
      message:
        "No share image — add og:image (or twitter:image); image posts get dramatically higher engagement",
    });
  if (!description.value)
    issues.push({
      severity: "warning",
      message:
        "No social description — add og:description (or twitter:description)",
    });
  if (!input.twitterCard)
    issues.push({
      severity: "warning",
      message: "No twitter:card tag — X falls back to a small summary card",
    });
  else if (!(KNOWN_TWITTER_CARDS as readonly string[]).includes(input.twitterCard))
    issues.push({
      severity: "warning",
      message: `Unknown twitter:card value "${input.twitterCard}" — expected summary, summary_large_image, app, or player`,
    });
  if (titleLength > SOCIAL_TITLE_MAX_CHARS)
    issues.push({
      severity: "warning",
      message: `Social title is long (${titleLength} chars) — platforms truncate around ${SOCIAL_TITLE_MAX_CHARS}`,
    });
  if (descriptionLength > SOCIAL_DESCRIPTION_MAX_CHARS)
    issues.push({
      severity: "warning",
      message: `Social description is long (${descriptionLength} chars) — platforms truncate around ${SOCIAL_DESCRIPTION_MAX_CHARS}`,
    });
  if (!input.ogUrl)
    issues.push({
      severity: "warning",
      message: "No og:url — platforms may mis-attribute the canonical link",
    });
  if (!input.ogType)
    issues.push({
      severity: "warning",
      message: 'No og:type — defaults to "website" on most platforms',
    });
  if (image.value && image.value.startsWith("http://"))
    issues.push({
      severity: "warning",
      message:
        "Share image is not HTTPS — many platforms refuse mixed-content images",
    });

  return {
    ok: issuesOk(issues),
    title: title.value,
    titleSource: title.source,
    titleLength,
    description: description.value,
    descriptionSource: description.source,
    descriptionLength,
    image: image.value,
    imageSource: image.source,
    siteName: input.ogSiteName,
    url: input.ogUrl,
    ogType: input.ogType,
    cardType: input.twitterCard,
    hasImage: Boolean(image.value),
    issues,
  };
}

/** Trim a raw tag value; empty/whitespace → null. Mirrors the Python `_clean`. */
export function cleanTagValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
