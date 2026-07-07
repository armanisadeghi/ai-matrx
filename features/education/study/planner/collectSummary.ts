// features/education/study/planner/collectSummary.ts
//
// Collects the live study snapshot (`PlanSummary`) the planner generators
// distribute — due count, weak count, and a per-topic weak breakdown — from the
// shared study spine via studyService. Mode-agnostic; the topic breakdown is
// only resolved for item types that have a topic concept (fc_card today, via a
// dynamic import so this stays infrastructure).

import { studyService } from "../service/studyService";
import { displayMasteryPct } from "../utils/masteryFsrs";
import type { PlanSummary, WeakTopic } from "./buildPlan";
import type { ItemMasteryRow } from "../types";

/** Build the study snapshot for one item_type. Never throws — returns zeros on error. */
export async function collectPlanSummary(
  itemType: string,
): Promise<PlanSummary> {
  const now = new Date();
  const [dueRes, weakRes, masteryRes] = await Promise.all([
    studyService.listDue(itemType, 500),
    studyService.listWeakest(itemType),
    studyService.listMastery(itemType),
  ]);

  const dueCount = dueRes.data?.length ?? 0;
  const weak = weakRes.data ?? [];
  const weakCount = weak.length;
  const studiedCount = masteryRes.data?.length ?? 0;

  let weakTopics: WeakTopic[] | undefined;
  if (itemType === "fc_card" && weak.length > 0) {
    weakTopics = await resolveWeakTopics(weak, now);
  }

  return { dueCount, weakCount, weakTopics, studiedCount };
}

/** Group weak fc_card mastery rows into per-topic tallies (weakest-first). */
async function resolveWeakTopics(
  weak: ItemMasteryRow[],
  now: Date,
): Promise<WeakTopic[]> {
  const { fcService } = await import("@/features/flashcards/data/fcService");
  const res = await fcService.getTopicsForCardIds(weak.map((m) => m.item_id));
  const topicsById = res.data ?? {};
  const byTopic = new Map<string, number>();
  for (const m of weak) {
    // Only count rows that are genuinely weak right now (recompute live FSRS).
    const pct = displayMasteryPct(m, now) ?? 0;
    if (!m.struggle_flag && pct >= 0.4) continue;
    const topic = topicsById[m.item_id]?.trim();
    if (!topic) continue;
    byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
  }
  return Array.from(byTopic.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}
