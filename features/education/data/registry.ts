// features/education/data/registry.ts
//
// Single access point mapping each axis id → its registry, plus lookup +
// static-param helpers used by the dynamic [segment] routes. Importing one
// registry module keeps the route files thin and avoids per-route barrels.

import type { AxisEntry, EduAxisId } from "../types";
import { SUBJECTS } from "./subjects";
import { LEVELS } from "./levels";
import { EXAMS } from "./exam-prep";
import { STUDY_AIDS } from "./study-aids";
import { FEATURES } from "./features";

const REGISTRY: Record<EduAxisId, AxisEntry[]> = {
  subjects: SUBJECTS,
  levels: LEVELS,
  "exam-prep": EXAMS,
  "study-aids": STUDY_AIDS,
  features: FEATURES,
};

/** All entries for an axis (including index-hidden leaves like grade pages). */
export function getAxisEntries(axisId: EduAxisId): AxisEntry[] {
  return REGISTRY[axisId] ?? [];
}

/** Resolve a single entry by slug, or undefined (→ notFound at the route). */
export function getAxisEntry(
  axisId: EduAxisId,
  slug: string,
): AxisEntry | undefined {
  return getAxisEntries(axisId).find((e) => e.slug === slug);
}
