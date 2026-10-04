/**
 * The pure half of the board's feature item types (`feature-items.tsx`):
 * source shape, matching, picker ordering, and batching several picks into
 * one placement. No React, no Supabase — unit-tested in
 * `__tests__/feature-items.logic.test.ts`.
 */

import type { NodeSource } from "../board/document";
import type { PlacedItem } from "./types";

/** The item type keys this file owns. For entity sources `key === source.entity`. */
export const FEATURE_ENTITY = {
  task: "task",
  warRoom: "war-room",
  meeting: "meeting",
  workflowRun: "workflow-run",
  research: "research",
  project: "project",
} as const;

export type FeatureEntityKey = (typeof FEATURE_ENTITY)[keyof typeof FEATURE_ENTITY];

/** `{ kind: "entity", entity, id }` — a reference, never a copy. */
export function entitySource(entity: FeatureEntityKey, id: string | null): NodeSource {
  return { kind: "entity", entity, id };
}

/** Does this saved source belong to that item type? */
export function matchesEntity(entity: FeatureEntityKey) {
  return (source: NodeSource): boolean => source.kind === "entity" && source.entity === entity;
}

/** The record id a source refers to, or null (a draft, or another kind). */
export function entityIdOf(source: NodeSource): string | null {
  return source.kind === "entity" ? source.id : null;
}

/** `href` builder: the page for the record, null while there is none yet. */
export function hrefFor(entity: FeatureEntityKey, build: (id: string) => string | null | undefined) {
  return (source: NodeSource): string | null => {
    if (source.kind !== "entity" || source.entity !== entity || !source.id) return null;
    return build(source.id) ?? null;
  };
}

/**
 * The record's own name, when the tile should adopt it: the record was renamed
 * where it lives, or the tile was placed before its name was known. Blank
 * names never replace a title.
 */
export function titleToAdopt(tileTitle: string, recordTitle: string | null | undefined): string | null {
  const next = recordTitle?.trim();
  if (!next || next === tileTitle) return null;
  return next;
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export interface MeetingLike {
  id: string;
  title: string;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recurrenceRule?: string | null;
  cancelledAt?: string | null;
  deletedAt?: string | null;
}

export type MeetingPhase = "live" | "upcoming" | "ended" | "cancelled" | "archived" | "unscheduled";

/** Where a meeting is in its life — the same order of truth `/meetings` uses. */
export function meetingPhase(m: MeetingLike, now: number = Date.now()): MeetingPhase {
  if (m.deletedAt) return "archived";
  if (m.cancelledAt) return "cancelled";
  if (m.startedAt && !m.endedAt) return "live";
  if (m.endedAt && !m.recurrenceRule) return "ended";
  if (m.scheduledFor) return Date.parse(m.scheduledFor) >= now || m.recurrenceRule ? "upcoming" : "ended";
  return m.endedAt ? "ended" : "unscheduled";
}

export const MEETING_PHASE_LABEL: Record<MeetingPhase, string> = {
  live: "Live now",
  upcoming: "Upcoming",
  ended: "Ended",
  cancelled: "Cancelled",
  archived: "Archived",
  unscheduled: "Not scheduled",
};

const PHASE_RANK: Record<MeetingPhase, number> = {
  live: 0,
  upcoming: 1,
  unscheduled: 2,
  ended: 3,
  cancelled: 4,
  archived: 5,
};

/**
 * Picker order: live first, then upcoming soonest-first, then past meetings
 * most-recent-first, cancelled and archived last. Duplicates (a meeting read
 * twice, as host and as invitee) collapse to one row.
 */
export function orderMeetingsForPicker<T extends MeetingLike>(meetings: readonly T[], now: number = Date.now()): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const m of meetings) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
  }
  const when = (m: MeetingLike) => Date.parse(m.scheduledFor ?? m.startedAt ?? m.endedAt ?? "") || 0;
  return unique.sort((a, b) => {
    const pa = meetingPhase(a, now);
    const pb = meetingPhase(b, now);
    if (pa !== pb) return PHASE_RANK[pa] - PHASE_RANK[pb];
    return pa === "upcoming" ? when(a) - when(b) : when(b) - when(a);
  });
}

// ─── Picks ───────────────────────────────────────────────────────────────────

/**
 * A picker that reports one record per call (a multi-select "Add (3)" loops
 * `onSelect`) must still place them all: the board closes the picker on the
 * first `onPick`. The batcher collects every pick made in the same task and
 * hands them over once, deduplicated by source.
 */
export function createPickBatcher(
  onPick: (items: PlacedItem[]) => void,
  schedule: (flush: () => void) => void = queueMicrotask,
) {
  let pending: PlacedItem[] = [];
  return (item: PlacedItem) => {
    const first = pending.length === 0;
    const key = JSON.stringify(item.source);
    if (!pending.some((p) => JSON.stringify(p.source) === key)) pending.push(item);
    if (!first) return;
    schedule(() => {
      const items = pending;
      pending = [];
      if (items.length > 0) onPick(items);
    });
  };
}
