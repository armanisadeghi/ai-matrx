"use client";

// features/education/study/planner/plannerSnapshot.ts
//
// A module snapshot store for the `matrx-user/education-planner` surface.
//
// Why a store and not a fetch: the Surface Context window polls the provider's
// `getScope()` every 400ms while it is open (see
// features/surfaces/runtime/useLiveSurfaceScope.ts), so `getScope` has to be
// synchronous and cheap. The views that already loaded this data publish it
// here as they load it, and the emitter reads it back with no network at all —
// the same pattern the agent-slot bench and the tool-registry surfaces use.
//
// Each publisher CLEARS its slice on unmount, so an unmounted tab never leaves
// stale data being emitted as if it were live. The manifest declares every
// value fed from here `alwaysAvailable: false` for exactly that reason.

import type { Weekday } from "./types";
import type { PlanWithDays } from "./types";

/** What the PLAN tab (StudyPlanView) has loaded, while it is mounted. */
export interface PlannerPlanSnapshot {
  plan: PlanWithDays | null;
  error: string | null;
  /** ISO timestamp of the learner's most recent study session, when known. */
  lastSessionAt: string | null;
}

/** The generation form's live field values, while that form is on screen. */
export interface PlanSetupDraftSnapshot {
  title: string;
  examDate: string;
  dailyMinutes: number;
  restDays: Weekday[];
  dailyItemCap: number | null;
}

let planSnapshot: PlannerPlanSnapshot | null = null;
let planSetupDraft: PlanSetupDraftSnapshot | null = null;

export function publishPlannerPlanSnapshot(
  next: PlannerPlanSnapshot | null,
): void {
  planSnapshot = next;
}

export function readPlannerPlanSnapshot(): PlannerPlanSnapshot | null {
  return planSnapshot;
}

export function publishPlanSetupDraft(
  next: PlanSetupDraftSnapshot | null,
): void {
  planSetupDraft = next;
}

export function readPlanSetupDraft(): PlanSetupDraftSnapshot | null {
  return planSetupDraft;
}
