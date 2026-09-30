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

export function counts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "__kind") continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** A readable label for an engine code (`unverified_no_corroboration` → "Unverified no corroboration"). */
export function humanize(code: string): string {
  const text = code.replace(/[._]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : text;
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
        .filter(([k, v]) => k !== "__kind" && isRecord(v))
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
    urls: strings(s.evidence_urls).length ? strings(s.evidence_urls) : strings(s.urls),
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
      urls: strings(i.urls),
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
    (k) => records(sections[k]).some((entry) => Object.keys(entry).some((key) => key !== "__kind")),
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
