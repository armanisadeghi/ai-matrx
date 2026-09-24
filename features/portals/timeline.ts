// features/portals/timeline.ts — WHERE HER JOB STANDS, AS A LINE SHE CAN READ (lane S6, U12).
//
// The champion is the Stripe customer portal's status line and every parcel tracker since: the
// stages in the order the business declared them, the ones already passed with the moment each
// was reached, the current one marked, the rest still ahead. Two facts, from two doors, and this
// module invents neither:
//
//   · the STAGES come from `custom.portal_me()` (`table.stage`, S6): the stage Field's own
//     choices in declared order, each with the KEY a record stores and the LABEL a person reads.
//     It is present only when the portal SHOWS that Field — a stage the owner hid is not a
//     timeline she is owed.
//   · the MOMENTS come from the existing history door (`custom.record_history`), called as her,
//     which masks every field the portal did not open. So the line can never say more than she
//     may read: it only ever looks at the stage Field's own changes.
//
// Pure, no I/O, so the rules are tested without a browser (`__tests__/timeline.test.ts`).

import type { PortalHistoryEntry, PortalStage } from "./service";

export type TimelineState = "done" | "current" | "ahead";

export interface TimelineStep {
  key: string;
  label: string;
  state: TimelineState;
  /** When the record reached this stage, from its history. Null when the history does not say. */
  reachedAt: string | null;
}

export interface Timeline {
  /** The stage Field's own label ("Status"). */
  label: string;
  steps: TimelineStep[];
  /**
   * The record's stage when it is NOT one of the declared live stages (a retired choice, or a
   * value typed before the stages were declared). Said on screen, never silently dropped.
   */
  offList: string | null;
}

/** A change's value as the history door writes it: a bare value, or `{ value }`. */
function changedTo(after: unknown): string | null {
  if (after === null || after === undefined) return null;
  if (typeof after === "string") return after;
  if (typeof after === "number" || typeof after === "boolean") return String(after);
  if (typeof after === "object" && after !== null && "value" in after) {
    return changedTo((after as { value: unknown }).value);
  }
  return null;
}

/** The store keeps a choice as its key; an older record may hold the label. Both match. */
function sameStage(stage: { key: string; label: string }, value: string): boolean {
  const v = value.trim().toLowerCase();
  return stage.key.toLowerCase() === v || stage.label.trim().toLowerCase() === v;
}

/**
 * The timeline for one record, or null when the portal shows no stage for its Table.
 *
 * `current` is the record's stage value as `read_records` returned it; `history` is what
 * `record_history` returned (any order). A stage is "done" when the record has moved past it in
 * the declared order, "current" when it is there now, "ahead" otherwise. Each step's moment is the
 * LAST time the history says the record entered that stage, so a job that went back a step and
 * forward again shows when it truly got there.
 */
export function buildTimeline(
  stage: PortalStage | null | undefined,
  current: unknown,
  history: readonly PortalHistoryEntry[],
): Timeline | null {
  if (!stage || !Array.isArray(stage.stages)) return null;
  const live = stage.stages.filter((s) => !s.retired);
  if (live.length === 0) return null;

  const reached = new Map<string, string>();
  const ordered = [...history].sort((a, b) => a.version - b.version);
  for (const entry of ordered) {
    for (const change of entry.changes ?? []) {
      if (change.key !== stage.field) continue;
      const to = changedTo(change.after);
      if (!to) continue;
      const match = live.find((s) => sameStage(s, to));
      if (match) reached.set(match.key, entry.occurred_at);
    }
  }

  const now = changedTo(current);
  const at = now ? live.findIndex((s) => sameStage(s, now)) : -1;
  const retired = now && at < 0 ? stage.stages.find((s) => sameStage(s, now)) : undefined;

  const steps: TimelineStep[] = live.map((s, index) => ({
    key: s.key,
    label: s.label,
    state: at < 0 ? "ahead" : index < at ? "done" : index === at ? "current" : "ahead",
    reachedAt: at >= 0 && index <= at ? (reached.get(s.key) ?? null) : null,
  }));

  return {
    label: stage.label,
    steps,
    offList: now && at < 0 ? (retired?.label ?? now) : null,
  };
}

/** A stage VALUE as a person reads it: its declared label, or the value itself when unknown. */
export function stageLabel(stage: PortalStage | null | undefined, value: unknown): string {
  const v = changedTo(value);
  if (!v) return "";
  const match = stage?.stages?.find((s) => sameStage(s, v));
  return match?.label ?? v;
}
