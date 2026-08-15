/**
 * Link-change vocabulary and verdicts — the pure core of the Link changes
 * view (`seo.backlink_change_event`, written nightly by the server).
 *
 * TWO rules from the surrounding code, both load-bearing here:
 *
 * 1. The jsonb `previous_value` / `current_value` columns are read through a
 *    NARROWER (`parseBacklinkChangeValue`), exactly as `lib/extras.ts` reads
 *    the provider `extras`. Components never poke raw jsonb.
 * 2. PLAIN LANGUAGE IS THE CONTRACT (`lib/vocab.ts`). The person reading a row
 *    is world-best at something that is very probably not SEO, so a row states
 *    the VERDICT — what happened, in the words a person would use — and never
 *    a diff dump. "dofollow_lost" is a machine value; "publisher.com switched
 *    your link to nofollow" is the row.
 *
 * Keys are machine values from the server and never change; labels and
 * verdicts are written for a smart person who has never heard of a rel
 * attribute.
 */

import type { Json } from "@/types/database.types";

/**
 * The severity at or above which the server raises an alert
 * (`seo.backlink_change_event.alerted_at`). Mirrored here so the UI's
 * "Needs your attention" lens is the SAME set the alerting uses — two
 * different floors would mean the page disagrees with the email.
 */
export const CHANGE_ALERT_SEVERITY_FLOOR = 60;

/** Above this a change is genuinely bad news, not merely worth a look. */
export const CHANGE_SEVERITY_BAD_MIN = 80;

/**
 * Every change the nightly comparison can record, in the order a person cares
 * about them. Same const-array shape as `BACKLINK_LENSES` / `BACKLINK_STATES`
 * in `lib/vocab.ts`: one entry per kind, rendering is a `.map()`.
 */
export const BACKLINK_CHANGE_KINDS = [
  {
    key: "lost",
    label: "Link removed",
    description: "The site took your link off the page.",
  },
  {
    key: "dofollow_lost",
    label: "Stopped counting for SEO",
    description:
      "The link is still on the page, but it no longer passes ranking value.",
  },
  {
    key: "source_page_dead",
    label: "Linking page gone",
    description: "The page that carried your link no longer works.",
  },
  {
    key: "source_page_redirected",
    label: "Linking page redirects",
    description: "The page that carried your link now sends visitors onward.",
  },
  {
    key: "target_changed",
    label: "Points somewhere else",
    description: "The link now points at a different page of yours.",
  },
  {
    key: "anchor_changed",
    label: "Wording changed",
    description: "The words the link is written with changed.",
  },
  {
    key: "appeared",
    label: "New link",
    description: "A link to your site we had not seen before.",
  },
  {
    key: "restored",
    label: "Link is back",
    description: "A link that had disappeared is live again.",
  },
  {
    key: "dofollow_gained",
    label: "Now counts for SEO",
    description: "The link started passing ranking value.",
  },
  {
    key: "source_page_recovered",
    label: "Linking page works again",
    description: "The page that carries your link is readable again.",
  },
] as const;

export type BacklinkChangeKind = (typeof BACKLINK_CHANGE_KINDS)[number]["key"];

export const CHANGE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  BACKLINK_CHANGE_KINDS.map((kind) => [kind.key, kind.label]),
);

export function backlinkChangeKindLabel(value: string | null): string {
  if (!value) return "Something changed";
  return CHANGE_KIND_LABELS[value] ?? value.replaceAll("_", " ");
}

export function isBacklinkChangeKind(
  value: string | null,
): value is BacklinkChangeKind {
  return BACKLINK_CHANGE_KINDS.some((kind) => kind.key === value);
}

/** The tone vocabulary shared by `MetricCell` and the badge mapping below. */
export type ChangeTone = "good" | "warning" | "bad" | "default";

/**
 * Severity (0–100) → tone, on the SAME two cut points the server alerts on.
 * This is severity only: a low-severity change can still be good news, so a
 * row's own tone comes from `changeVerdict`, not from here.
 */
export function severityTone(severity: number | null | undefined): ChangeTone {
  if (severity === null || severity === undefined) return "default";
  if (severity >= CHANGE_SEVERITY_BAD_MIN) return "bad";
  if (severity >= CHANGE_ALERT_SEVERITY_FLOOR) return "warning";
  return "default";
}

/**
 * Tone → the machine status token `StatusBadge` reads. `StatusBadge` decides
 * its variant from the VALUE (never the wording), so a tone reaches it as one
 * of the status words `statusBadgeVariant` already knows.
 */
export const CHANGE_TONE_STATUS: Record<ChangeTone, string> = {
  good: "complete",
  warning: "warning",
  bad: "critical",
  default: "",
};

/**
 * One side of a change, as the server stored it. Every field is defensive:
 * a nightly writer that skips a key must produce a readable row, never a
 * crash or the string "undefined" on screen.
 */
export interface BacklinkChangeValue {
  anchorText: string | null;
  /** Every distinct anchor when one page links more than once. */
  anchorTexts: string[];
  isDofollow: boolean | null;
  isLive: boolean | null;
  targetUrl: string | null;
  instanceCount: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lostAt: string | null;
  observationId: string | null;
  runKey: string | null;
}

function record(value: Json | null | undefined): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }
  return null;
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: Json | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function strList(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}

export function parseBacklinkChangeValue(
  value: Json | null | undefined,
): BacklinkChangeValue {
  const rec = record(value) ?? {};
  const anchorTexts = strList(rec.anchor_texts);
  const anchorText = str(rec.anchor_text);
  return {
    anchorText: anchorText ?? anchorTexts[0] ?? null,
    // A single `anchor_text` with no list still describes one anchor — the
    // multi-anchor renderer must not read that as "no anchors at all".
    anchorTexts: anchorTexts.length
      ? anchorTexts
      : anchorText
        ? [anchorText]
        : [],
    isDofollow: bool(rec.is_dofollow),
    isLive: bool(rec.is_live),
    targetUrl: str(rec.target_url),
    instanceCount: num(rec.instance_count),
    firstSeenAt: str(rec.first_seen_at),
    lastSeenAt: str(rec.last_seen_at),
    lostAt: str(rec.lost_at),
    observationId: str(rec.observation_id),
    runKey: str(rec.run_key),
  };
}

/**
 * The minimum a row needs to state its verdict. Structural on purpose: the
 * verdict is the same whether it is built from a stored row, a preview, or a
 * test fixture.
 */
export interface BacklinkChangeVerdictInput {
  change_kind: string;
  source_domain: string;
  target_url: string | null;
  previous_value: Json;
  current_value: Json;
}

export interface BacklinkChangeVerdict {
  /** One sentence: what happened, named by who did it. */
  headline: string;
  /** One sentence: what it means for the user, or what to do about it. */
  detail: string;
  tone: ChangeTone;
}

/** A page address as a person would say it — origin dropped when it adds nothing. */
function pageLabel(url: string | null): string {
  if (!url) return "another page";
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return path === "/" || path === "" ? parsed.hostname : path;
  } catch {
    return url;
  }
}

function quoted(value: string | null): string {
  return value ? `“${value}”` : "nothing at all";
}

/** "the link" / "both links" / "all 4 links" — one page can link many times. */
function linkNoun(count: number): string {
  if (count > 2) return `all ${count} links`;
  if (count === 2) return "both links";
  return "the link";
}

/**
 * THE ROW. Every change states its verdict in plain language — never a field
 * name, never a diff dump, never a machine value. An unrecognized kind still
 * produces an honest sentence rather than a blank cell.
 */
export function changeVerdict(
  row: BacklinkChangeVerdictInput,
): BacklinkChangeVerdict {
  const site = row.source_domain || "The linking site";
  const previous = parseBacklinkChangeValue(row.previous_value);
  const current = parseBacklinkChangeValue(row.current_value);

  switch (row.change_kind) {
    case "appeared":
      return {
        headline: `${site} added a link to your site`,
        detail:
          current.isDofollow === false
            ? "It is marked so search engines ignore it, but it can still send you visitors."
            : "It passes ranking value to your page.",
        tone: "good",
      };

    case "lost":
      return {
        headline: `${site} removed your link`,
        detail:
          previous.isDofollow === false
            ? "It was a link that did not pass ranking value, so the loss is mostly in visitors. They linked to you once, which makes them a good site to ask again."
            : "It was a link that passed ranking value. They linked to you once, which makes them one of the best sites to ask again.",
        tone: previous.isDofollow === false ? "warning" : "bad",
      };

    case "restored":
      return {
        headline: `${site} put your link back`,
        detail: "It had disappeared earlier and is live on the page again.",
        tone: "good",
      };

    case "anchor_changed": {
      const before = previous.anchorTexts;
      const after = current.anchorTexts;
      if (before.length > 1 || after.length > 1) {
        return {
          headline: `${site} changed the words your links are written with`,
          detail: `That page carries ${linkNoun(Math.max(before.length, after.length))} to you. The wording went from ${before.map(quoted).join(", ")} to ${after.map(quoted).join(", ")}.`,
          tone: "warning",
        };
      }
      return {
        headline: `${site} changed the words your link is written with`,
        detail: `It used to read ${quoted(previous.anchorText)} and now reads ${quoted(current.anchorText)}.`,
        tone: "warning",
      };
    }

    case "dofollow_lost":
      return {
        headline: `${site} switched your link to nofollow`,
        detail:
          "Still on the page, but it no longer passes ranking value. Worth asking them to change it back.",
        tone: "bad",
      };

    case "dofollow_gained":
      return {
        headline: `${site} switched your link to a normal link`,
        detail: "It now passes ranking value to your page.",
        tone: "good",
      };

    case "target_changed":
      return {
        headline: `${site} pointed your link at a different page`,
        detail: `It used to send people to ${pageLabel(previous.targetUrl)} and now sends them to ${pageLabel(current.targetUrl ?? row.target_url)}.`,
        tone: "warning",
      };

    case "source_page_dead":
      return {
        headline: `The page on ${site} that linked to you is gone`,
        detail:
          "Your link went with it. Ask them to bring the page back, or to add the link somewhere that still works.",
        tone: "bad",
      };

    case "source_page_redirected":
      return {
        headline: `The page on ${site} that linked to you now redirects`,
        detail:
          "Your link may have survived the move, or may not have. Worth opening the page to check.",
        tone: "warning",
      };

    case "source_page_recovered":
      return {
        headline: `The page on ${site} that linked to you is working again`,
        detail: "Your link is readable again — nothing to do.",
        tone: "good",
      };

    default:
      return {
        headline: `Something about your link on ${site} changed`,
        detail:
          "We recorded a change we do not have plain wording for yet. Open the page to see it.",
        tone: "default",
      };
  }
}
