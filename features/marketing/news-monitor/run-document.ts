/**
 * Pure readers over one news monitor run's documents (NEWS-ENGINE-SPEC §6).
 *
 * A run is the "News monitor run" workflow; its last step's output carries the
 * whole `news_monitor_run` document. The run view reads only the subtrees it
 * shows (see `data.ts`), and every reader here is defensive: a run that stopped
 * early, a stage that was skipped, or a performer that is not bound leaves a
 * part absent — and the screen says so instead of inventing it.
 *
 * `__kind` markers stay on every value (the kind law); readers ignore them.
 */

export type Json = unknown;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** A kind marker identifies a record; every other own key is readable content. */
export function hasContentFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).length - (Object.hasOwn(value, "__kind") ? 1 : 0) > 0;
}

export interface FailedStage {
  stage: string;
  reason: string;
}

/**
 * Failure detail is display-derived, never a rewritten copy of the source
 * kind. Future stage names and deliberately empty details remain visible.
 */
export function readFailedStages(value: unknown): FailedStage[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([stage, reason]) =>
    stage === "__kind" || typeof reason !== "string" ? [] : [{ stage, reason }],
  );
}

export function counts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ── the run's parts, as the run view receives them ─────────────────────────

export interface RunNotice {
  code: string;
  message: string;
  remedy: string;
}

export function readNotices(value: unknown): RunNotice[] {
  return records(value).map((n) => ({
    code: str(n.code),
    message: str(n.message),
    remedy: str(n.remedy),
  }));
}

export interface SourceHealth {
  source: string;
  status: string;
  items: number;
  error: string | null;
}

/** Source health from the summary's `source_status` map (or the digest's list). */
export function readSourceHealth(summary: unknown, digest: unknown): SourceHealth[] {
  const fromSummary = isRecord(summary) && isRecord(summary.source_status)
    ? Object.entries(summary.source_status)
        .filter(([, value]) => isRecord(value))
        .map(([source, v]) => {
          const entry = v as Record<string, unknown>;
          return {
            source,
            status: str(entry.status) || "unknown",
            items: num(entry.items),
            error: str(entry.error) || null,
          };
        })
    : [];
  if (fromSummary.length) return fromSummary;
  return isRecord(digest)
    ? records(digest.source_health).map((h) => ({
        source: str(h.source_kind) || str(h.kind),
        status: str(h.status) || "unknown",
        items: num(h.items),
        error: str(h.error) || null,
      }))
    : [];
}

export interface SignalSummaryView {
  id: string;
  title: string;
  reason: string | null;
  rationale: string | null;
  urls: string[];
  sources: string[];
}

export function readSignalSummaries(value: unknown): SignalSummaryView[] {
  return records(value).map((s) => ({
    id: str(s.signal_id),
    title: str(s.signal_title) || str(s.title),
    reason:
      str(s.reason) ||
      str(s.pre_gate_reason) ||
      (isRecord(s.withheld) ? str(s.withheld.reason) : "") ||
      null,
    rationale:
      str(s.rationale) ||
      str(s.pre_gate_rationale) ||
      (isRecord(s.withheld) ? str(s.withheld.detail) : "") ||
      str(s.detail) ||
      null,
    // Each address once: a URL list keys its links, and an engine list can repeat an address.
    urls: [...new Set(strings(s.evidence_urls).length ? strings(s.evidence_urls) : strings(s.urls))],
    sources: strings(s.sources),
  }));
}

/**
 * The six set-aside lists (spec §6.3/§6.5/§6.6 and the 2026-09-27 rulings).
 * Each carries its count and, where the run recorded one, its list. A list the
 * run did not record says so (`listed: false`) — a count alone is hiding only
 * when a list exists and is not offered.
 */
export type SetAsideListId =
  | "rejected"
  | "withheld"
  | "pre_gated"
  | "below_floor"
  | "over_limit"
  | "url_overlap"
  | "s2_dropped"
  | "seen_skipped";

/**
 * What a count on the run view opens. Every count is a door (spec §7.5, "a
 * count alone is hiding"): a watch group or a freshness status opens its
 * watch-list group; a set-aside reason opens its set-aside list.
 */
export type OpenTarget =
  | { kind: "surfaced" }
  | { kind: "watch"; group: string }
  | { kind: "set_aside"; list: SetAsideListId | "all" };

const SET_ASIDE_IDS: SetAsideListId[] = [
  "rejected",
  "withheld",
  "pre_gated",
  "below_floor",
  "over_limit",
  "url_overlap",
  "s2_dropped",
  "seen_skipped",
];

/** The set-aside list a digest reason key belongs to (`digest.watch_groups[set_aside].reasons`). */
export function setAsideListOf(reason: string): SetAsideListId | "all" {
  if (reason.startsWith("withheld_")) return "withheld";
  if (reason === "coarse_rejected") return "rejected";
  if (reason === "pre_gated_stale") return "pre_gated";
  if (reason === "older_than_max_age" || reason === "no_title_or_excerpt") return "s2_dropped";
  return (SET_ASIDE_IDS as string[]).includes(reason) ? (reason as SetAsideListId) : "all";
}

/** `?open=` in a run link: `surfaced`, `watch:<group>` or `set_aside[:<list>]`. */
export function parseOpenTarget(value: string | null): OpenTarget | null {
  if (!value) return null;
  if (value === "surfaced") return { kind: "surfaced" };
  const [kind, rest] = value.split(":", 2);
  if (kind === "watch" && rest) return { kind: "watch", group: rest };
  if (kind === "set_aside") {
    const list = rest && (SET_ASIDE_IDS as string[]).includes(rest) ? (rest as SetAsideListId) : "all";
    return { kind: "set_aside", list };
  }
  return null;
}

export function openTargetParam(target: OpenTarget): string {
  if (target.kind === "surfaced") return "surfaced";
  if (target.kind === "watch") return `watch:${target.group}`;
  return target.list === "all" ? "set_aside" : `set_aside:${target.list}`;
}

/** The engine's `candidates.diagnostics.set_aside_items` for the given reasons (older runs have none). */
export function readSetAsideItems(diagnostics: Record<string, unknown>, reasons: string[]): SignalSummaryView[] {
  return records(diagnostics.set_aside_items)
    .filter((i) => reasons.includes(str(i.reason)))
    .map((i) => ({
      id: str(i.id),
      title: str(i.title),
      reason: str(i.reason) || null,
      rationale: str(i.detail) || null,
      // An item can name one address several times (one per source that saw it): each once.
      urls: [...new Set(strings(i.urls))],
      sources: [],
    }));
}

export interface SetAsideList {
  id: SetAsideListId;
  label: string;
  explain: string;
  count: number;
  byReason: Record<string, number>;
  items: SignalSummaryView[];
  /** Ids the run recorded without a title (resolved against the monitor's own stories where possible). */
  ids: string[];
  listed: boolean;
}

export interface RunParts {
  runId: string;
  nodeId: string;
  summary: Record<string, unknown> | null;
  digest: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  triage: Record<string, unknown> | null;
  angleSets: Record<string, unknown>[];
  verdicts: Record<string, Record<string, unknown>>;
  clientContext: Record<string, unknown> | null;
  withheld: unknown;
  diagnostics: Record<string, unknown> | null;
  rejected: unknown;
  preGated: unknown;
  notices: RunNotice[];
  stages: Record<string, unknown>[];
}

export function readSetAside(parts: RunParts): SetAsideList[] {
  const d = parts.diagnostics ?? {};
  const summaryCounts = isRecord(parts.summary?.counts) ? parts.summary.counts : {};
  const rejected = readSignalSummaries(parts.rejected);
  const withheld = readSignalSummaries(parts.withheld);
  const preGated = readSignalSummaries(parts.preGated);
  const belowFloorIds = strings(d.below_floor);
  const belowFloorByLane = counts(d.below_floor_by_lane ?? summaryCounts.below_floor_by_lane);
  const s2 = counts(d.s2_dropped ?? summaryCounts.s2_dropped);
  const seenSkipped = strings(d.seen_skipped);
  const belowFloorItems = readSetAsideItems(d, ["below_floor"]);
  const overLimitItems = readSetAsideItems(d, ["over_limit"]);
  const overlapItems = readSetAsideItems(d, ["url_overlap"]);
  const s2Items = readSetAsideItems(d, ["older_than_max_age", "no_title_or_excerpt"]);
  const seenItems = readSetAsideItems(d, ["seen_skipped"]);
  const total = (m: Record<string, number>) =>
    Object.values(m).reduce((a, b) => a + b, 0);
  return [
    {
      id: "rejected",
      label: "Rejected as not relevant",
      explain:
        "The relevance judge (after the code floors and recall guards) said these do not bear on this client.",
      count: Math.max(rejected.length, num(summaryCounts.coarse_rejected)),
      byReason: tally(rejected.map((r) => r.reason ?? "unspecified")),
      items: rejected,
      ids: [],
      listed: true,
    },
    {
      id: "withheld",
      label: "Withheld for hygiene or brand safety",
      explain:
        "Only hygiene and brand safety withhold a story. Each can be surfaced anyway.",
      count: Math.max(
        withheld.length,
        num(summaryCounts.hygiene_withheld) + num(summaryCounts.safety_withheld),
      ),
      byReason: tally(withheld.map((w) => w.reason ?? "unspecified")),
      items: withheld,
      ids: [],
      listed: true,
    },
    {
      id: "pre_gated",
      label: "Pre-gated as stale",
      explain:
        "Small stories whose evidence was already older than the freshness window before origin was checked.",
      count: Math.max(preGated.length, num(summaryCounts.pre_gated_stale)),
      byReason: tally(preGated.map((p) => p.reason ?? "stale")),
      items: preGated,
      ids: [],
      listed: true,
    },
    {
      id: "below_floor",
      label: "Below the selection floor",
      explain:
        "Scored stories under the minimum relevance or major-news floor — newsjack drops these too; we count and list them.",
      count: Math.max(belowFloorIds.length, total(belowFloorByLane)),
      byReason: belowFloorByLane,
      items: belowFloorItems,
      ids: belowFloorItems.length ? [] : belowFloorIds,
      listed: belowFloorItems.length > 0 || belowFloorIds.length > 0,
    },
    {
      id: "over_limit",
      label: "Over the run's story limit",
      explain: "Stories above the floor that the per-run story limit cut, lowest priority first.",
      count: Math.max(overLimitItems.length, strings(d.over_limit).length),
      byReason: {},
      items: overLimitItems,
      ids: overLimitItems.length ? [] : strings(d.over_limit),
      listed: overLimitItems.length > 0 || strings(d.over_limit).length > 0,
    },
    {
      id: "url_overlap",
      label: "Same link as a kept story",
      explain: "Lower-priority stories whose article link a kept story already carries.",
      count: Math.max(overlapItems.length, strings(d.url_overlap_dropped).length),
      byReason: {},
      items: overlapItems,
      ids: overlapItems.length ? [] : strings(d.url_overlap_dropped),
      listed: overlapItems.length > 0 || strings(d.url_overlap_dropped).length > 0,
    },
    {
      id: "s2_dropped",
      label: "Dropped before scoring",
      explain: "Articles removed at the age and completeness filter, each with its reason.",
      count: Math.max(total(s2), s2Items.length),
      byReason: s2,
      items: s2Items,
      ids: [],
      listed: s2Items.length > 0,
    },
    {
      id: "seen_skipped",
      label: "Already surfaced before",
      explain:
        "Stories this monitor already brought you, skipped because nothing about them is newer than the last time.",
      count: seenSkipped.length,
      byReason: {},
      items: seenItems,
      ids: seenItems.length ? [] : seenSkipped,
      listed: seenSkipped.length > 0,
    },
  ];
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** The report exists only when the report job ran and produced something a person can read. */
export function reportIsReadable(report: Record<string, unknown> | null): boolean {
  if (!report) return false;
  const md = str(report.rendered_markdown).trim();
  const sections = isRecord(report.sections) ? report.sections : {};
  const listed = ["pitch_ready", "big_stories", "watch"].some(
    (section) => records(sections[section]).some(hasContentFields),
  );
  return md.length > 0 || listed;
}

/** Stage names from the run document, in order, with their status. */
export function readStages(stages: unknown): { name: string; status: string; detail: string }[] {
  return records(stages).map((s) => ({
    name: str(s.name),
    status: str(s.status),
    detail: str(s.detail),
  }));
}

// ── one watch-list count; every funnel count a door; a readable report (2026-10-05) ──

/**
 * How many stories are on the run's watch list — THE one count, read from the
 * digest (its listed entries plus what its cap left off). The report's
 * "Today's read" and the digest's heading both use it, so they cannot disagree.
 */
export function watchListCount(digest: Record<string, unknown> | null): number | null {
  if (!digest) return null;
  return records(digest.watch).length + num(digest.watch_overflow);
}

/** A funnel stage's door: the list it counts, or the run's own step view (`run_steps`). */
export type FunnelTarget = OpenTarget | { kind: "run_steps" };

/**
 * What a funnel count opens (`collected`, `s2_dropped: older_than_max_age`,
 * `unverified_by_status: unverified_no_timestamp`, …). Stages with a list on
 * this page open it; stages whose items live only in the run's step outputs
 * (collected, scored, emitted, …) open the run step by step.
 */
export function funnelOpenTarget(stage: string): FunnelTarget {
  const [key, detail] = stage.split(":").map((part) => part.trim());
  if (key === "surfaced") return { kind: "surfaced" };
  if (key === "stale") return { kind: "watch", group: "stale" };
  if (key === "watching_unverified") return { kind: "watch", group: "freshness_unverified" };
  if (key === "unverified_by_status" && detail) return { kind: "watch", group: detail };
  if (key === "hygiene_withheld" || key === "safety_withheld") return { kind: "set_aside", list: "withheld" };
  if (key === "below_floor_by_lane") return { kind: "set_aside", list: "below_floor" };
  if (key === "url_overlap_dropped") return { kind: "set_aside", list: "url_overlap" };
  const list = setAsideListOf(key);
  if (list !== "all") return { kind: "set_aside", list };
  return { kind: "run_steps" };
}

const ISO_DATETIME = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const MD_LINK = /\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)\)/g;

/**
 * The report job's markdown, made readable without changing what it says:
 * an empty table cell written as `None`/`null` reads "unknown"; a `|` inside a
 * link's text in a table row is escaped (unescaped, it split the cell and the
 * link rendered as raw text); and every ISO timestamp is shown in the app's
 * date format (`formatDate`).
 */
export function cleanReportMarkdown(markdown: string, formatDate: (iso: string) => string): string {
  return markdown
    .split("\n")
    .map((line) => {
      let out = line;
      if (out.trimStart().startsWith("|")) {
        out = out.replace(MD_LINK, (_m, text: string, url: string) =>
          `[${text.replace(/(?<!\\)\|/g, "\\|")}](${url})`,
        );
        out = out.replace(/\|\s*(?:None|null|undefined)\s*(?=\|)/g, "| unknown ");
      }
      // Never rewrite a date inside a link address.
      return out.replace(ISO_DATETIME, (match, offset: number, whole: string) => {
        const before = whole.slice(0, offset);
        const openParen = before.lastIndexOf("](");
        if (openParen !== -1 && before.indexOf(")", openParen) === -1) return match;
        return formatDate(match);
      });
    })
    .join("\n");
}

/** The report's markdown already carries a section with this heading. */
export function markdownHasSection(markdown: string, heading: string): boolean {
  return new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "im").test(markdown);
}
