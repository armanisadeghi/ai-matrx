// features/education/study/dashboard/studyTodaySnapshot.ts
//
// The Study-today snapshot, published once by the component that already loads
// it (`StudyTodayCard`) and read at agent-trigger time by the Education Hub's
// surface emitter (`EducationHubSurface`).
//
// Why a module store rather than props or a second fetch: the hub page
// (`EducationHub`) is a SERVER component, so it cannot pass a callback down,
// and re-reading the study spine inside the emitter would double every hub
// page load's DB round-trips (plan + mastery + goals + streak). StudyTodayCard
// is always mounted by the hub, loads exactly this data, and simply hands the
// derived result over.
//
// Deliberately NOT Redux: this is a render-free, single-writer/single-reader
// handoff inside one route, read imperatively at trigger time — putting it in
// the store would add a slice, a selector, and re-render pressure for state no
// component subscribes to.

import type { EducationNextAction } from "@/features/surfaces/manifests/education.manifest";

export interface StudyTodaySnapshot {
  has_active_plan: boolean;
  is_rest_day: boolean;
  streak_days: number;
  next_actions: EducationNextAction[];
  total_minutes: number;
}

/**
 * Null until StudyTodayCard has loaded AND found real study signal — which is
 * exactly the condition under which the card renders. Anonymous and brand-new
 * users therefore leave this null, and the surface reports
 * `study_snapshot_available: false` instead of inventing zeros.
 */
let snapshot: StudyTodaySnapshot | null = null;

export function setStudyTodaySnapshot(next: StudyTodaySnapshot | null): void {
  snapshot = next;
}

export function getStudyTodaySnapshot(): StudyTodaySnapshot | null {
  return snapshot;
}
