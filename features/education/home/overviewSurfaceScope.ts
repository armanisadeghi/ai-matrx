// features/education/home/overviewSurfaceScope.ts
//
// Builds the `matrx-user/education-overview` scope from the snapshot the
// Education home already holds in render state. Synchronous and fetch-free:
// the Surface Context window polls getScope every 400 ms.
//
// Honesty rule: every value belongs to one snapshot lane. While the snapshot
// is loading everything but `dashboard_state` is omitted; a lane that failed
// omits its values (the page hides those counts too) instead of reporting 0.

import {
  createEducationOverviewScope,
  type OverviewToolCount,
} from "@/features/surfaces/manifests/education-overview.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { educationLibraryHref } from "../library/types";
import { kitHref } from "../kits/kitService";
import { missingFormatsFor } from "./nudges";
import type { EducationSnapshot, EducationSnapshotLane } from "./types";

const RECENT_TIER = 5;

export interface OverviewToolInput {
  key: string;
  label: string;
  href: string;
  value?: number | string;
  state?: "ready" | "loading" | "unavailable";
  availability?: string;
}

export function buildEducationOverviewScope(input: {
  snapshot: EducationSnapshot | null;
  visibleBlocks: string[];
  tools: OverviewToolInput[];
}): SurfaceScopePayload {
  const { snapshot } = input;
  if (!snapshot) return createEducationOverviewScope({ dashboard_state: "loading" });

  const ready = (lane: EducationSnapshotLane) =>
    snapshot.availability[lane].state === "ready";
  const unavailable = (
    Object.keys(snapshot.availability) as EducationSnapshotLane[]
  ).filter((lane) => !ready(lane));
  const { study, library, kits } = snapshot;

  const tool_counts: OverviewToolCount[] = input.tools.map((t) => ({
    slug: t.key,
    label: t.label,
    count: typeof t.value === "number" && t.state === "ready" ? t.value : null,
    href: t.href,
    coming_soon: t.availability === "coming-soon",
  }));

  const nextActions = snapshot.nextActions.map((a) => ({
    id: a.key,
    title: a.label,
    why: a.why,
    minutes: a.minutes,
    href: a.href,
  }));

  return createEducationOverviewScope({
    dashboard_state: unavailable.length === 0 ? "ready" : "partial",
    unavailable_sections: unavailable,
    visible_blocks: input.visibleBlocks,
    tool_counts,
    ...(ready("plan")
      ? {
          active_plan: study.plan
            ? {
                id: study.plan.plan.id,
                title: study.plan.plan.title,
                start_date: study.plan.plan.start_date,
                end_date: study.plan.plan.end_date,
                daily_minutes: study.plan.plan.daily_minutes,
              }
            : null,
          is_rest_day: study.isRestDay,
          today_plan_block_count: study.todayBlocks.length,
        }
      : {}),
    ...(ready("streak") ? { study_streak_days: study.streakDays } : {}),
    ...(ready("mastery")
      ? {
          total_due: study.totalDue,
          total_weak: study.totalWeak,
          has_studied: study.hasStudied,
          due_by_mode: study.modes
            .filter((m) => m.due > 0 || m.weak > 0)
            .map((m) => ({
              mode: m.itemType,
              label: m.label,
              due: m.due,
              weak: m.weak,
            })),
        }
      : {}),
    ...(ready("goals")
      ? {
          active_goals: study.goals.map((g) => ({
            id: g.id,
            title: g.title,
            target_date: g.target_date,
          })),
        }
      : {}),
    // Next actions are synthesized from plan + mastery + goals; any of those
    // missing makes the list unknown, not empty.
    ...(ready("plan") && ready("mastery") && ready("goals")
      ? {
          next_actions_brief: nextActions.map(({ id, title }) => ({ id, title })),
          next_actions: nextActions,
          next_actions_total_minutes: nextActions.reduce(
            (sum, a) => sum + (a.minutes ?? 0),
            0,
          ),
        }
      : {}),
    ...(ready("library")
      ? {
          library_total: library.total,
          recent_items: library.recent
            .slice(0, RECENT_TIER)
            .map((r) => ({ id: r.id, title: r.title })),
          recent_items_detail: library.recent.map((r) => ({
            id: r.id,
            title: r.title,
            kind: r.kind,
            subtype: r.subtype ?? null,
            item_count: r.item_count ?? null,
            due_count: r.due_count ?? null,
            accuracy_pct: r.accuracy_pct ?? null,
            last_studied_at: r.last_studied_at ?? null,
            updated_at: r.updated_at,
            href: educationLibraryHref(r),
          })),
        }
      : {}),
    ...(ready("kits")
      ? {
          kit_total: kits.total,
          recent_kits: kits.recent
            .slice(0, RECENT_TIER)
            .map((k) => ({ id: k.sourceId, title: k.title })),
          kits_detail: kits.recent.map((k) => ({
            id: k.sourceId,
            title: k.title,
            created_at: k.createdAt,
            href: kitHref(k.sourceType, k.sourceId),
            formats: Array.from(
              new Set(k.artifacts.map((a) => a.targetKind ?? a.artifactType)),
            ),
            missing_formats: missingFormatsFor(k).map((m) => m.target),
            item_count: k.artifacts.length,
          })),
        }
      : {}),
  });
}
