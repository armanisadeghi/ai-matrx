/**
 * The Socials pages' saves that both a button AND an agent write run — ONE function each, so the
 * agent's approved write and the person's click can never drift apart:
 *
 *   - `saveKpiGoal`            New goal / Edit goal dialog          (KPIs)
 *   - `saveLinkToSwipe`        Save link dialog                     (Swipe file)
 *   - `trackAdvertiserFromAd`  Track on an ad card                  (Ad library)
 *
 * Simple one-call saves (pause a goal, archive a collection, stop tracking) call `service.ts` /
 * `server.ts` directly from both places; they need no wrapper.
 */

import { AD_LIBRARY_LABELS, isAdLibrary, type AdCardModel } from "./types";
import { goalMetricId, measureGoal, metricDefOf, type KpiAccount, type KpiMetricId } from "./kpi";
import { addToCollection, createCollection, ingestPost } from "./server";
import { createKpiGoal, saveTrackedAdvertiser, updateKpiGoal } from "./service";
import type { BrandPost, KpiGoalRow, TrackedAdvertiser } from "./types";

// -- KPI goals ------------------------------------------------------------------

export interface KpiGoalSave {
  metric: KpiMetricId;
  target: number;
  period: string;
  /** "all" | "platform:<id>" | "account:<tracked_account_id>". */
  scope: string;
}

/**
 * Create a goal (goal = null) or edit one. The baseline is where the number stands today, so a
 * cumulative goal's pace is progress since the goal was set; an edit re-baselines only when what
 * is measured changed. Returns the goal id.
 */
export async function saveKpiGoal(args: {
  goal: KpiGoalRow | null;
  save: KpiGoalSave;
  organizationId: string;
  brandId: string;
  kpiAccounts: KpiAccount[];
  posts: BrandPost[];
  now: number;
}): Promise<string> {
  const { goal, save, organizationId, brandId, kpiAccounts, posts, now } = args;
  const def = metricDefOf(save.metric);
  const accountId = save.scope.startsWith("account:") ? save.scope.slice(8) : null;
  const platform = save.scope.startsWith("platform:") ? save.scope.slice(9) : null;
  const draft = {
    tracked_account_id: accountId,
    platform,
    period: save.period,
    starts_on: new Date(now).toISOString().slice(0, 10),
    ends_on: null,
  };
  const baseline = def.cumulative
    ? measureGoal({ goal: draft, metric: save.metric, accounts: kpiAccounts, posts, now }).value
    : null;
  if (goal) {
    const sameSubject =
      goalMetricId(goal) === save.metric && goal.platform === platform && goal.tracked_account_id === accountId;
    await updateKpiGoal(goal.id, {
      metric: def.db,
      metricLabel: def.dbLabel,
      targetValue: save.target,
      baselineValue: sameSubject ? goal.baseline_value : save.metric === "outlier_count" ? 0 : baseline,
      period: save.period,
      platform,
      trackedAccountId: accountId,
    });
    return goal.id;
  }
  return createKpiGoal({
    organizationId,
    brandId,
    metric: def.db,
    metricLabel: def.dbLabel,
    targetValue: save.target,
    baselineValue: save.metric === "outlier_count" ? 0 : baseline,
    period: save.period,
    startsOn: draft.starts_on,
    endsOn: null,
    platform,
    trackedAccountId: accountId,
  });
}

/** The scope a stored goal row is set to, in `KpiGoalSave.scope` form. */
export function goalScopeOf(goal: Pick<KpiGoalRow, "tracked_account_id" | "platform">): string {
  return goal.tracked_account_id ? `account:${goal.tracked_account_id}` : goal.platform ? `platform:${goal.platform}` : "all";
}

// -- Swipe file -----------------------------------------------------------------

/** Fetch one post by its link (spends points), then file it in a collection (an existing one or a new one). */
export async function saveLinkToSwipe(args: {
  url: string;
  collectionId: string | null;
  newCollectionName: string | null;
  note: string;
  tags: string[];
  brandId: string;
  organizationId: string;
  onProgress?: (p: { message: string; step?: number; total?: number }) => void;
}): Promise<{ postId: string; collectionId: string }> {
  const { organizationId } = args;
  const result = await ingestPost({ url: args.url.trim() }, { organizationId, onProgress: args.onProgress });
  let collectionId = args.collectionId;
  if (!collectionId) {
    const made = await createCollection({ name: (args.newCollectionName ?? "").trim(), brandId: args.brandId }, { organizationId });
    collectionId = made.collection_id;
  }
  await addToCollection(
    collectionId,
    {
      itemType: "social_post",
      itemId: result.post_id,
      ...(args.note.trim() ? { note: args.note.trim() } : {}),
      ...(args.tags.length ? { tags: args.tags } : {}),
    },
    { organizationId },
  );
  return { postId: result.post_id, collectionId };
}

// -- Ad library -----------------------------------------------------------------

/** Follow an ad's advertiser (a saved view; spends nothing). Returns the tracked advertiser id. */
export async function trackAdvertiserFromAd(ad: AdCardModel, ctx: { organizationId: string }): Promise<TrackedAdvertiser> {
  if (!isAdLibrary(ad.library)) throw new Error(`${ad.library} is not an ad library this page follows.`);
  return saveTrackedAdvertiser({
    organizationId: ctx.organizationId,
    name: `${ad.advertiser} · ${AD_LIBRARY_LABELS[ad.library]}`,
    definition: {
      version: 1,
      library: ad.library,
      advertiser: ad.advertiser,
      advertiserPlatformId: ad.advertiserPlatformId,
      lastLookAt: new Date().toISOString(),
    },
  });
}
