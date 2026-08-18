/**
 * The Newsroom Desk — ranking and derivation.
 *
 * Everything here is a PURE function of generated DB rows plus `now`. No
 * component computes its own ordering, so the ranking can be unit-tested and
 * — crucially — EXPLAINED: `rankReasons()` is what the rank chip's tooltip
 * renders, because a ranked work queue the user cannot interrogate is just an
 * opinion with a number on it.
 */

import type {
  CoverageMentionRow,
  DeskItem,
  DeskLane,
  DeskSite,
  DeskSort,
  SourceRequestRow,
  StoryAngleRow,
} from "../types";

/* ── vocabulary ────────────────────────────────────────────────────────── */

export const ENDOWMENT_LABEL: Record<string, string> = {
  data: "Data",
  expertise: "Expertise",
  media: "Media",
  process: "Process",
  people: "People",
  place: "Place",
  capital: "Capital",
  demand: "Demand",
  code: "Code",
};

export const ANGLE_TYPE_LABEL: Record<string, string> = {
  data_story: "Data story",
  expertise: "Expertise",
  milestone: "Milestone",
  trend_commentary: "Trend commentary",
  contrarian: "Contrarian",
  customer_impact: "Customer impact",
  process: "Process",
  people: "People",
  seasonal: "Seasonal",
  research: "Research",
  local_impact: "Local impact",
};

export const ACTION_LABEL: Record<string, string> = {
  pitch_now: "Pitch now",
  develop_evidence: "Develop evidence",
  hold_for_timing: "Hold for timing",
  needs_expert_input: "Needs your input",
  park: "Parked",
};

export const OUTLET_KIND_LABEL: Record<string, string> = {
  trade: "Trade",
  national: "National",
  regional: "Regional",
  local: "Local",
  podcast: "Podcast",
  newsletter: "Newsletter",
  broadcast: "Broadcast",
  blog: "Blog",
};

export const PLATFORM_LABEL: Record<string, string> = {
  haro: "HARO",
  qwoted: "Qwoted",
  featured: "Featured",
  sourcebottle: "SourceBottle",
  source_of_sources: "Source of Sources",
  journorequest: "#JournoRequest",
  mentionmatch: "MentionMatch",
  responsesource: "ResponseSource",
  other: "Other",
};

export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

/* ── time ──────────────────────────────────────────────────────────────── */

export interface Countdown {
  /** Milliseconds remaining; negative once the window has closed. */
  msLeft: number;
  expired: boolean;
  /** "6h 12m", "3d", "closed 2h ago" */
  label: string;
  /**
   * Urgency band. `critical` is the ONLY thing on this desk allowed to use
   * the destructive colour — proof gaps are work, not errors.
   */
  band: "critical" | "urgent" | "soon" | "later" | "expired";
}

export function countdownTo(
  deadline: string | null,
  now: number,
): Countdown | null {
  if (!deadline) return null;
  const at = new Date(deadline).getTime();
  if (!Number.isFinite(at)) return null;
  const msLeft = at - now;
  if (msLeft <= 0) {
    return {
      msLeft,
      expired: true,
      label: `closed ${formatSpan(-msLeft)} ago`,
      band: "expired",
    };
  }
  const hours = msLeft / 3_600_000;
  const band: Countdown["band"] =
    hours <= 3 ? "critical" : hours <= 12 ? "urgent" : hours <= 48 ? "soon" : "later";
  return { msLeft, expired: false, label: formatSpan(msLeft), band };
}

function formatSpan(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours && days < 3 ? `${days}d ${restHours}h` : `${days}d`;
}

/* ── readiness ─────────────────────────────────────────────────────────── */

export interface ReadinessSegment {
  key: string;
  label: string;
  value: number;
  /** One-line explanation of what the number means, for the tooltip. */
  meaning: string;
}

/**
 * FOUR scores per row rendered as four numbers is noise. They are rendered as
 * ONE four-bar meter instead, and `priority` is not a bar at all — it is the
 * row's POSITION and its rank chip. Exact values live in the tooltip and the
 * brief, where a decision is actually being made.
 */
export function angleReadiness(angle: StoryAngleRow): ReadinessSegment[] {
  return [
    {
      key: "news",
      label: "Newsworthy",
      value: angle.newsworthiness,
      meaning: "Would a newsroom care at all?",
    },
    {
      key: "time",
      label: "Timely",
      value: angle.timeliness,
      meaning: "Is there a reason to run it NOW?",
    },
    {
      key: "proof",
      label: "Provable",
      value: angle.evidence_quality,
      meaning: "Can we back it up on request?",
    },
    {
      key: "conf",
      label: "Confident",
      value: angle.confidence,
      meaning: "How sure is the analysis itself?",
    },
  ];
}

export function scoreTone(value: number): "strong" | "fair" | "weak" {
  if (value >= 70) return "strong";
  if (value >= 40) return "fair";
  return "weak";
}

/* ── lanes ─────────────────────────────────────────────────────────────── */

export const CLOSED_ANGLE_STATUSES = new Set(["dismissed"]);
export const CLOSED_REQUEST_STATUSES = new Set(["passed", "expired"]);

export function isClosed(item: DeskItem, now: number): boolean {
  if (item.kind === "angle") return CLOSED_ANGLE_STATUSES.has(item.row.status);
  if (item.kind === "request") {
    if (CLOSED_REQUEST_STATUSES.has(item.row.status)) return true;
    const countdown = countdownTo(item.row.deadline_at, now);
    return Boolean(
      countdown?.expired &&
        !["submitted", "won"].includes(item.row.status),
    );
  }
  return false;
}

export function laneOf(item: DeskItem, now: number): Exclude<DeskLane, "all"> {
  if (item.kind === "coverage") return "landed";
  if (item.kind === "request") {
    if (item.row.status === "won") return "landed";
    if (item.row.status === "submitted") return "pitch";
    return "deadline";
  }
  const angle = item.row;
  if (angle.status === "landed") return "landed";
  if (angle.status === "pitched") return "pitch";
  if (angle.status === "developing") return "proof";
  const gaps = Array.isArray(angle.missing_evidence)
    ? angle.missing_evidence.length
    : 0;
  if (gaps > 0 || angle.requires_human_review) return "proof";
  return "deadline";
}

export const LANE_LABEL: Record<DeskLane, string> = {
  all: "All work",
  proof: "Needs proof",
  deadline: "Ready to move",
  pitch: "In pitch",
  landed: "Landed",
};

export const LANE_HINT: Record<DeskLane, string> = {
  all: "Every live story on the desk, ranked by what to do next.",
  proof: "Real stories that need one more fact before a journalist believes them.",
  deadline: "Provable and pitchable now — including journalist requests on the clock.",
  pitch: "Sent. Waiting on a newsroom.",
  landed: "Coverage that ran, tied back to the story that produced it.",
};

/* ── pressure (the "Next up" ordering) ─────────────────────────────────── */

const ACTION_WEIGHT: Record<string, number> = {
  pitch_now: 30,
  needs_expert_input: 12,
  develop_evidence: 10,
  hold_for_timing: 5,
  park: 0,
};

export function missingCount(angle: StoryAngleRow): number {
  return Array.isArray(angle.missing_evidence) ? angle.missing_evidence.length : 0;
}

export function anglePressure(angle: StoryAngleRow): number {
  if (angle.status === "landed" || angle.status === "dismissed") return 0;
  return (
    angle.priority * 0.4 +
    angle.timeliness * 0.25 +
    angle.newsworthiness * 0.2 +
    angle.evidence_quality * 0.15 +
    (ACTION_WEIGHT[angle.recommended_action] ?? 0)
  );
}

export function requestPressure(
  request: SourceRequestRow,
  now: number,
): number {
  const countdown = countdownTo(request.deadline_at, now);
  if (!countdown || countdown.expired) return 0;
  if (["submitted", "won", "passed"].includes(request.status)) return 0;
  const hoursLeft = countdown.msLeft / 3_600_000;
  // A journalist request is the only thing here that evaporates. Urgency
  // saturates fast: under 6h it outranks nearly any angle.
  const urgency = Math.max(0, Math.min(100, 105 - hoursLeft * 1.4));
  return urgency * 0.62 + request.match_score * 0.55;
}

function coveragePressure(mention: CoverageMentionRow, now: number): number {
  const at = new Date(mention.published_at ?? mention.discovered_at).getTime();
  if (!Number.isFinite(at)) return 0;
  const days = (now - at) / 86_400_000;
  // Landed work never competes with live work — it just stays fresh-first.
  return Math.max(0, 12 - days);
}

export function pressureOf(item: DeskItem, now: number): number {
  if (item.kind === "angle") return anglePressure(item.row);
  if (item.kind === "request") return requestPressure(item.row, now);
  return coveragePressure(item.row, now);
}

/** The rank chip's tooltip. Never rank without saying why. */
export function rankReasons(item: DeskItem, now: number): string[] {
  if (item.kind === "request") {
    const countdown = countdownTo(item.row.deadline_at, now);
    const reasons: string[] = [
      `${PLATFORM_LABEL[item.row.platform] ?? humanise(item.row.platform)} request`,
    ];
    if (countdown) {
      reasons.push(
        countdown.expired
          ? `Window ${countdown.label}`
          : `Closes in ${countdown.label} — deadlines outrank everything`,
      );
    }
    reasons.push(`Match ${item.row.match_score}/100 against this business`);
    if (item.row.match_reason) reasons.push(item.row.match_reason);
    return reasons;
  }
  if (item.kind === "coverage") {
    return [
      "Already landed — ranked below live work",
      item.row.prominence
        ? `${humanise(item.row.prominence)} placement`
        : "Placement prominence not scored",
    ];
  }
  const angle = item.row;
  const reasons = [
    `${ACTION_LABEL[angle.recommended_action] ?? humanise(angle.recommended_action)} — the analyzer's call`,
    `Priority ${angle.priority} · newsworthy ${angle.newsworthiness} · timely ${angle.timeliness}`,
  ];
  if (angle.action_reason) reasons.push(angle.action_reason);
  const gaps = missingCount(angle);
  if (gaps > 0) {
    reasons.push(
      gaps === 1
        ? "One fact away from pitchable"
        : `${gaps} facts away from pitchable`,
    );
  }
  return reasons;
}

/* ── sorting ───────────────────────────────────────────────────────────── */

export const SORT_LABEL: Record<DeskSort, string> = {
  "next-up": "Next up",
  deadline: "Deadline",
  newsworthy: "Newsworthy",
  "nearly-provable": "Nearly provable",
  recent: "Newest",
};

export const SORT_HINT: Record<DeskSort, string> = {
  "next-up":
    "One fused order: the analyzer's recommended action, the scores, and how fast a journalist window is closing.",
  deadline: "Soonest closing window first. Everything without a clock falls to the bottom.",
  newsworthy: "Purely how much a newsroom would care, ignoring whether we can prove it yet.",
  "nearly-provable":
    "Stories with the FEWEST missing facts first — the shortest walk from idea to pitchable.",
  recent: "Whatever the desk learned about most recently.",
};

function newsworthyOf(item: DeskItem): number {
  if (item.kind === "angle") return item.row.newsworthiness;
  if (item.kind === "request") return item.row.match_score;
  return item.row.hit_score ?? item.row.prominence_score ?? 0;
}

function recencyOf(item: DeskItem): number {
  const value =
    item.kind === "angle"
      ? (item.row.analyzed_at ?? item.row.created_at)
      : item.kind === "request"
        ? item.row.created_at
        : (item.row.published_at ?? item.row.discovered_at);
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

/** Stories with no gaps sort AFTER gapped ones here — this lane is a to-do list. */
function provableDistance(item: DeskItem): number {
  if (item.kind !== "angle") return Number.POSITIVE_INFINITY;
  const gaps = missingCount(item.row);
  if (gaps === 0) return Number.POSITIVE_INFINITY;
  return gaps * 1000 - item.row.evidence_quality;
}

export function sortItems(
  items: DeskItem[],
  sort: DeskSort,
  now: number,
): DeskItem[] {
  const copy = [...items];
  switch (sort) {
    case "deadline":
      return copy.sort((a, b) => {
        const aMs = deadlineMs(a, now);
        const bMs = deadlineMs(b, now);
        if (aMs !== bMs) return aMs - bMs;
        return pressureOf(b, now) - pressureOf(a, now);
      });
    case "newsworthy":
      return copy.sort((a, b) => newsworthyOf(b) - newsworthyOf(a));
    case "nearly-provable":
      return copy.sort((a, b) => {
        const distance = provableDistance(a) - provableDistance(b);
        if (distance !== 0) return distance;
        return pressureOf(b, now) - pressureOf(a, now);
      });
    case "recent":
      return copy.sort((a, b) => recencyOf(b) - recencyOf(a));
    case "next-up":
    default:
      return copy.sort((a, b) => pressureOf(b, now) - pressureOf(a, now));
  }
}

function deadlineMs(item: DeskItem, now: number): number {
  if (item.kind === "request") {
    const countdown = countdownTo(item.row.deadline_at, now);
    if (countdown) return countdown.msLeft;
  }
  if (item.kind === "angle" && item.row.expires_at) {
    const countdown = countdownTo(item.row.expires_at, now);
    if (countdown) return countdown.msLeft;
  }
  return Number.POSITIVE_INFINITY;
}

/* ── text ──────────────────────────────────────────────────────────────── */

export function titleOf(item: DeskItem): string {
  if (item.kind === "angle") return item.row.headline;
  if (item.kind === "request") return item.row.query_title;
  return item.row.title ?? item.row.normalized_url;
}

export function subtitleOf(item: DeskItem): string | null {
  if (item.kind === "angle") return item.row.why_now ?? item.row.summary;
  if (item.kind === "request") return item.row.match_reason ?? item.row.query_body;
  return item.row.key_quote ?? null;
}

export function searchHaystack(item: DeskItem, site: DeskSite | null): string {
  const parts: string[] = [titleOf(item), subtitleOf(item) ?? ""];
  if (site) parts.push(site.brandName, site.domain);
  if (item.kind === "angle") {
    parts.push(item.row.summary, item.row.endowment, item.row.angle_type);
    if (item.row.target_beat) parts.push(item.row.target_beat);
  }
  if (item.kind === "request") {
    parts.push(item.row.platform, item.row.outlet ?? "", item.row.journalist_name ?? "");
    if (item.row.beat) parts.push(item.row.beat);
  }
  if (item.kind === "coverage") {
    parts.push(item.row.domain, item.row.author_name ?? "");
  }
  return parts.join(" ").toLowerCase();
}

export function siteOf(
  item: DeskItem,
  sites: DeskSite[],
): DeskSite | null {
  if (item.kind === "coverage") {
    return (
      sites.find((site) => site.siteId === item.row.site_id) ??
      sites.find((site) => site.brandKey === item.row.brand_key) ??
      null
    );
  }
  if (!item.siteId) return null;
  return sites.find((site) => site.siteId === item.siteId) ?? null;
}

/** Rows → desk items, once, at the top of the workspace. */
export function toDeskItems(input: {
  angles: StoryAngleRow[];
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
}): DeskItem[] {
  return [
    ...input.angles.map(
      (row): DeskItem => ({
        kind: "angle",
        id: row.id,
        siteId: row.site_id,
        row,
      }),
    ),
    ...input.requests.map(
      (row): DeskItem => ({
        kind: "request",
        id: row.id,
        siteId: row.site_id,
        row,
      }),
    ),
    ...input.coverage.map(
      (row): DeskItem => ({
        kind: "coverage",
        id: row.id,
        siteId: row.site_id,
        row,
      }),
    ),
  ];
}
