/**
 * The vocabulary and the reading of the site-wide competitor link gap — the
 * prospect list ("who links to my competitors and not to me?").
 *
 * PURE module on purpose: the Matrx Authority Score is OUR metric (we may not
 * republish a provider's DR), so the one thing that makes it trustworthy is
 * that the surface can always show its parts. Parsing that explanation, and
 * deciding what "not measured" means, are decisions that must be testable
 * without a browser.
 *
 * THE UNMEASURED RULE. `priority_score = NULL` means we could not measure this
 * domain — it is NOT a zero, it is NOT the worst prospect, and it must never
 * sort as if it were either. Every reader here keeps null as null, every
 * renderer says "not measured", and every sort pushes nulls LAST in both
 * directions (a nulls-first ascending sort would open the list on the rows we
 * know least about).
 */

import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

/** Where a link-gap domain stands with the human who has to decide. */
export const LINK_GAP_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "snoozed",
] as const;

export type LinkGapReviewStatus = (typeof LINK_GAP_REVIEW_STATUSES)[number];

export function isLinkGapReviewStatus(
  value: string,
): value is LinkGapReviewStatus {
  return (LINK_GAP_REVIEW_STATUSES as readonly string[]).includes(value);
}

/** The words the user reads. "Approved" is what makes a row CRM-eligible. */
export const LINK_GAP_REVIEW_LABELS: Record<LinkGapReviewStatus, string> = {
  pending: "Waiting on you",
  approved: "Approved",
  rejected: "Not for us",
  snoozed: "Later",
};

export function linkGapReviewLabel(value: string | null): string {
  return value && isLinkGapReviewStatus(value)
    ? LINK_GAP_REVIEW_LABELS[value]
    : "Waiting on you";
}

/** What we say when we could not measure a domain. Never a 0, never a dash. */
export const UNMEASURED_LABEL = "Not measured";

export const AUTHORITY_EXPLAINER =
  "The Matrx Authority Score is our own 0-100 read of how much a link from this site is worth. Open a row to see every part of it and what each one contributed.";

export const MATCH_COUNT_EXPLAINER =
  "How many of your confirmed competitors already get a link from this site. The more of them it links to, the more likely it links to you too.";

/** One measured component of the Matrx Authority Score. */
export interface AuthorityComponent {
  key: string;
  label: string;
  raw: number | string | null;
  normalized: number | null;
  contribution: number | null;
  why: string | null;
}

/**
 * The full explanation behind one domain's score. `value === null` means the
 * score was never computed — the caller must say so rather than render 0.
 */
export interface MatrxAuthority {
  value: number | null;
  band: string | null;
  confidence: string | null;
  components: AuthorityComponent[];
  missing: string[];
  why: string | null;
}

const EMPTY_AUTHORITY: MatrxAuthority = {
  value: null,
  band: null,
  confidence: null,
  components: [],
  missing: [],
  why: null,
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item ? [item] : []))
    : [];
}

/**
 * Read `metadata.matrx_authority` off a stored row.
 *
 * Tolerant by design — the score gains components over time and an older row
 * simply carries fewer. What it never does is invent a number: an absent value
 * stays null all the way to the screen.
 */
export function parseMatrxAuthority(metadata: Json | null): MatrxAuthority {
  if (!isJsonRecord(metadata)) return EMPTY_AUTHORITY;
  const authority = metadata.matrx_authority;
  if (!isJsonRecord(authority)) return EMPTY_AUTHORITY;
  const rawComponents = Array.isArray(authority.components)
    ? authority.components
    : [];
  return {
    value: numberOrNull(authority.value),
    band: stringOrNull(authority.band),
    confidence: stringOrNull(authority.confidence),
    components: rawComponents.flatMap((entry) => {
      if (!isJsonRecord(entry)) return [];
      const key = stringOrNull(entry.key);
      if (!key) return [];
      const raw = entry.raw;
      return [
        {
          key,
          label: stringOrNull(entry.label) ?? key,
          raw:
            typeof raw === "number" || typeof raw === "string"
              ? raw
              : null,
          normalized: numberOrNull(entry.normalized),
          contribution: numberOrNull(entry.contribution),
          why: stringOrNull(entry.why),
        },
      ];
    }),
    missing: stringList(authority.missing),
    why: stringOrNull(authority.why),
  };
}

export type AuthorityTone = "strong" | "solid" | "weak" | "unmeasured";

/** Score band → a semantic tone. Unmeasured is its OWN tone, never "weak". */
export function authorityTone(value: number | null): AuthorityTone {
  if (value === null) return "unmeasured";
  if (value >= 70) return "strong";
  if (value >= 40) return "solid";
  return "weak";
}

export const AUTHORITY_TONE_CLASS: Record<AuthorityTone, string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  solid: "text-foreground",
  weak: "text-muted-foreground",
  unmeasured: "text-muted-foreground italic",
};

/** Spam score → tone. Higher is worse; null is unknown, not clean. */
export function spamToneForScore(
  value: number | null,
): "clean" | "watch" | "toxic" | "unknown" {
  if (value === null) return "unknown";
  if (value >= 60) return "toxic";
  if (value >= 30) return "watch";
  return "clean";
}

/**
 * The sentence a prospect row earns its place with. Uses the stored
 * `priority_reason` when the server wrote one, and otherwise states the plain
 * fact the row exists for.
 */
export function prospectHeadline(input: {
  displayDomain: string;
  matchCount: number;
  priorityReason: string | null;
}): string {
  if (input.priorityReason?.trim()) return input.priorityReason.trim();
  return `${input.displayDomain} links to ${input.matchCount} of your competitors and not to you.`;
}

/** "links to 3 of your competitors" — the industry's primary sort, in words. */
export function matchCountLabel(matchCount: number): string {
  return `Links to ${matchCount} of your competitor${matchCount === 1 ? "" : "s"}`;
}

/** How a seeded competitor qualified, in the user's words. */
export function seededCompetitorLabel(input: {
  entity_role: string | null;
  business_overlap: string | null;
  market_overlap: string | null;
  explicitly_enabled: boolean;
}): string {
  const parts: string[] = [];
  if (input.business_overlap) parts.push(`${input.business_overlap} overlap`);
  if (input.market_overlap) parts.push(`${input.market_overlap} market`);
  if (input.entity_role) parts.push(input.entity_role);
  const derived = parts.join(" · ");
  if (input.explicitly_enabled) {
    return derived ? `You included it · ${derived}` : "You included it";
  }
  return derived || "Confirmed competitor";
}

/**
 * The stages the run reports, in the words a user understands. An event kind
 * with no entry here leaves the current stage alone — a run must never go
 * backwards to a blank label because the server added an event we don't know.
 */
export const SITE_LINK_GAP_STAGES: Record<string, string> = {
  "seo.command_run": "Starting the comparison",
  "seo.site_link_gap_seeded": "Checking which competitors qualify",
  "seo.site_link_gap_fetching": "Asking who links to your competitors",
  "seo.site_link_gap_scoring": "Scoring every site we found",
  "seo.site_link_gap_persisting": "Saving your prospect list",
  "seo.site_link_gap_completed": "Prospect list ready",
};
