// features/marketing/pr/calendar/calendar-model.ts
//
// THE PR CALENDAR, READ. Two sources, both straight from the database
// (BRIEFS-STRATEGY-AND-ORG-CHART §3):
//   - `seo.pr_moment`   — the brand's verified moment feed: every date with its source;
//   - `web.brand.metadata.pr_calendar_plan` — the planner's latest plan, written by
//     aidream `services/pr_calendar/plan.py::persist_plan` (a `pr_calendar_plan` kind
//     plus the tier windows, could-not-verify list and notices code computed around it).
// Code computed every date on the plan; this file only reads and arranges them. Refreshing
// is `POST /pr-calendar/brands/{brand_id}/run` (see ./api.ts).

import type { Database, Json } from "@/types/database.types";

export type PrMomentRow = Database["seo"]["Tables"]["pr_moment"]["Row"];

export type PrBucket = "pitch_ready" | "watch" | "avoid";
export type PitchStatus = "pitch_now" | "window_opens" | "deadline_passed" | "event_imminent";

export interface PlannedMoment {
  momentId: string;
  bucket: PrBucket;
  standing: "strong" | "partial" | "none";
  standingReason: string;
  proofNeeded: string[];
  angleSeed: string;
  safetyReason: string;
  coveragePattern: string;
  outletTiers: string[];
  pitchStatus: PitchStatus | null;
  startsOn: string;
  windowOpensOn: string;
  deadlineOn: string;
}

export interface TierWindow {
  tier: string;
  label: string;
  windowOpensOn: string;
  deadlineOn: string;
  pitchStatus: PitchStatus | null;
}

export interface CalendarNotice {
  code: string;
  message: string;
  remedy: string | null;
}

export interface CalendarPlan {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  horizonEnd: string;
  feedSize: number;
  moments: PlannedMoment[];
  actThisWeek: string[];
  gapsAndClusters: string[];
  coveragePatterns: string[];
  droppedCount: number;
  tierWindows: Record<string, TierWindow[]>;
  couldNotVerify: { title: string; url: string; reason: string }[];
  notices: CalendarNotice[];
}

export const BUCKET_LABEL: Record<PrBucket, string> = {
  pitch_ready: "Pitch-ready",
  watch: "Watch",
  avoid: "Avoid",
};

export const PITCH_STATUS_LABEL: Record<PitchStatus, string> = {
  pitch_now: "Pitch now",
  window_opens: "Window opens",
  deadline_passed: "Deadline passed",
  event_imminent: "Event imminent",
};

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}
function pitchStatus(value: unknown): PitchStatus | null {
  return value === "pitch_now" || value === "window_opens" || value === "deadline_passed" || value === "event_imminent"
    ? value
    : null;
}

/** The stored plan, or null when the brand has never been planned. Unknown shapes are dropped, never invented. */
export function readCalendarPlan(metadata: Json | null | undefined): CalendarPlan | null {
  const stored = obj(obj(metadata)?.pr_calendar_plan);
  const plan = obj(stored?.plan);
  if (!stored || !plan) return null;
  const moments: PlannedMoment[] = [];
  for (const raw of Array.isArray(plan.moments) ? plan.moments : []) {
    const m = obj(raw);
    const bucket = m?.bucket;
    if (!m || (bucket !== "pitch_ready" && bucket !== "watch" && bucket !== "avoid")) continue;
    const standing = m.standing === "strong" || m.standing === "partial" ? m.standing : "none";
    moments.push({
      momentId: text(m.moment_id),
      bucket,
      standing,
      standingReason: text(m.standing_reason),
      proofNeeded: texts(m.proof_needed),
      angleSeed: text(m.angle_seed),
      safetyReason: text(m.safety_reason),
      coveragePattern: text(m.coverage_pattern),
      outletTiers: texts(m.outlet_tiers),
      pitchStatus: pitchStatus(m.pitch_status),
      startsOn: text(m.starts_on),
      windowOpensOn: text(m.window_opens_on),
      deadlineOn: text(m.deadline_on),
    });
  }
  const tierWindows: Record<string, TierWindow[]> = {};
  for (const [id, list] of Object.entries(obj(stored.tier_windows) ?? {})) {
    tierWindows[id] = (Array.isArray(list) ? list : []).flatMap((raw) => {
      const w = obj(raw);
      return w
        ? [
            {
              tier: text(w.tier),
              label: text(w.label) || text(w.tier),
              windowOpensOn: text(w.window_opens_on),
              deadlineOn: text(w.deadline_on),
              pitchStatus: pitchStatus(w.pitch_status),
            },
          ]
        : [];
    });
  }
  return {
    generatedAt: text(stored.generated_at),
    windowStart: text(stored.window_start),
    windowEnd: text(stored.window_end),
    horizonEnd: text(stored.horizon_end),
    feedSize: typeof stored.feed_size === "number" ? stored.feed_size : 0,
    moments,
    actThisWeek: texts(plan.act_this_week),
    gapsAndClusters: texts(plan.gaps_and_clusters),
    coveragePatterns: texts(plan.coverage_patterns),
    droppedCount: typeof plan.dropped_count === "number" ? plan.dropped_count : 0,
    tierWindows,
    couldNotVerify: (Array.isArray(stored.could_not_verify) ? stored.could_not_verify : []).flatMap((raw) => {
      const c = obj(raw);
      return c ? [{ title: text(c.title), url: text(c.url), reason: text(c.reason) }] : [];
    }),
    notices: (Array.isArray(stored.notices) ? stored.notices : []).flatMap((raw) => {
      const n = obj(raw);
      return n && text(n.message)
        ? [{ code: text(n.code), message: text(n.message), remedy: text(n.remedy) || null }]
        : [];
    }),
  };
}

/** `YYYY-MM-DD` → the local calendar date (never shifted by a time zone). */
export function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Six weeks of days (Sunday first) covering the month that contains `month`. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Spans up to this many days are drawn on every day they cover. */
export const MAX_SPREAD_DAYS = 7;

/** Which day each planned moment sits on (its start), including short multi-day spans from the feed. */
export function momentsByDay(
  moments: readonly PlannedMoment[],
  feed: ReadonlyMap<string, PrMomentRow>,
): Map<string, PlannedMoment[]> {
  const byDay = new Map<string, PlannedMoment[]>();
  for (const m of moments) {
    const row = feed.get(m.momentId);
    const start = parseDay(m.startsOn || row?.starts_on || "");
    if (!start) continue;
    const end = parseDay(row?.ends_on ?? "") ?? start;
    // A short span (an event, a week) sits on every day it covers; a long one (an awareness
    // month, a season) sits on its first day only, or it would bury every other moment.
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const last = spanDays > MAX_SPREAD_DAYS || end < start ? start : end;
    for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      byDay.set(key, [...(byDay.get(key) ?? []), m]);
    }
  }
  return byDay;
}

/** The ask the "Draft angles" action puts to the PR Director for one moment. */
export function draftAnglesAsk(moment: PlannedMoment, row: PrMomentRow | undefined): string {
  const title = row?.title ?? "this calendar moment";
  const parts = [
    `Draft story angles for the calendar moment "${title}" (${moment.startsOn || row?.starts_on || "date on the calendar"}).`,
  ];
  if (moment.angleSeed) parts.push(`The planner's seed: ${moment.angleSeed}`);
  if (moment.proofNeeded.length) parts.push(`Proof it still needs: ${moment.proofNeeded.join("; ")}.`);
  return parts.join(" ");
}
