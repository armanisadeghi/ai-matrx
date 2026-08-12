"use client";

/**
 * features/marketing/content-plan/hooks/usePlanDrift.ts
 *
 * THE drift state for the Content Plan workspace — one hook, one model, read
 * by the bar, the sheet, the tree, the table and the pillar map so no two
 * surfaces can ever disagree about what has drifted.
 *
 * It composes the two witnesses the workspace already loads:
 *   - the paired CMS site's pages (useCmsPageMap — auto, cached);
 *   - the crawl reconciler's report (usePlanReality — auto, read-only, cached).
 * Neither needs a human to press anything; see usePlanReality's header for why
 * "on view, cached" is the right refresh trigger and not a schedule.
 *
 * REPAIRS go through the ONE existing align seam (setup/bridge.ts →
 * `cms_align` realize / adopt / map, plus `cms_publish`). Every repair is
 * dry-run first and idempotent, and applying one invalidates both witnesses so
 * the drift re-derives itself immediately — the fix loop closes without a
 * refresh button.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";

import { planKeys } from "../data/hooks";
import {
  bridgeAdopt,
  bridgePublish,
  bridgeRealize,
  bridgeResolveConflict,
  type BridgeAlignResult,
} from "../setup/bridge";
import { computePlanDrift, type DriftItem, type PlanDriftModel } from "../lib/drift";
import type { PlanNodeRow } from "../types";
import { useCmsPageMap } from "./useCmsPageMap";
import { usePlanReality } from "./usePlanReality";

/** A repair the platform can actually perform. Follows the assists
 * intentional-action contract: a VERB, an explainer of what will happen
 * BEFORE it happens, and a receipt after. */
export interface DriftRepair {
  id: string;
  /** Verb-labeled button text. */
  label: string;
  /** One line: exactly what this will do. */
  explainer: string;
  /** Destructive-ish repairs (rewriting a published URL) are confirmed harder. */
  tone: "default" | "destructive";
  run: (dryRun: boolean) => Promise<RepairOutcome>;
}

export interface RepairOutcome {
  ok: boolean;
  /** The server's own per-item detail lines — shown verbatim, never invented. */
  lines: string[];
  changed: number;
}

function fromAlign(result: BridgeAlignResult): RepairOutcome {
  const lines = result.items.map((item) =>
    item.error ? `${item.action}: ${item.error}` : `${item.action}: ${item.detail}`,
  );
  return {
    ok: result.failed === 0 && result.errors.length === 0,
    lines: [...lines, ...result.errors],
    changed: result.applied,
  };
}

export function usePlanDrift(
  siteId: string | null,
  cmsSite: string | null,
  nodes: readonly PlanNodeRow[],
) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const cmsPages = useCmsPageMap(siteId, cmsSite);
  const reality = usePlanReality(siteId);
  const [busyRepairId, setBusyRepairId] = useState<string | null>(null);

  const model: PlanDriftModel = useMemo(
    () =>
      computePlanDrift({
        nodes,
        cmsPages: cmsPages.map?.pages ?? null,
        pagesByNodeId: cmsPages.pagesByNodeId,
        reality: reality.report,
      }),
    [nodes, cmsPages.map, cmsPages.pagesByNodeId, reality.report],
  );

  /** Both witnesses re-read after any repair — drift is never left stale. */
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: planKeys.cmsPages(siteId ?? "none"),
      }),
      queryClient.invalidateQueries({
        queryKey: planKeys.reality(siteId ?? "none"),
      }),
      queryClient.invalidateQueries({
        queryKey: planKeys.nodes(siteId ?? "none"),
      }),
    ]);
  }, [queryClient, siteId]);

  const repairsFor = useCallback(
    (item: DriftItem): DriftRepair[] => {
      if (!siteId) return [];
      if (item.kind === "conflict") {
        return [
          {
            id: `${item.key}:plan_yields`,
            label: `Move the plan to ${item.pageRoute}`,
            explainer: `Rewrites this planned page's route to ${item.pageRoute} — the URL the site already serves. The live page is untouched.`,
            tone: "default",
            run: async (dryRun) =>
              fromAlign(
                await bridgeResolveConflict(dispatch, siteId, {
                  nodeId: item.nodeId,
                  pageId: item.pageId,
                  resolve: "plan_yields",
                  dryRun,
                }),
              ),
          },
          {
            id: `${item.key}:cms_yields`,
            label: `Move the page to ${item.nodeRoute}`,
            explainer: item.isPublished
              ? `Moves the LIVE page to ${item.nodeRoute}. Its current URL changes — the site records a redirect from the old one.`
              : `Moves the draft page to ${item.nodeRoute}, the route the plan calls for.`,
            tone: item.isPublished ? "destructive" : "default",
            run: async (dryRun) =>
              fromAlign(
                await bridgeResolveConflict(dispatch, siteId, {
                  nodeId: item.nodeId,
                  pageId: item.pageId,
                  resolve: "cms_yields",
                  force: item.isPublished,
                  dryRun,
                }),
              ),
          },
        ];
      }
      if (item.kind === "orphan") {
        if (!item.adoptable || !item.cmsPageId) return [];
        return [
          {
            id: `${item.key}:adopt`,
            label: "Adopt into the plan",
            explainer: `Creates the planned page for ${item.route} and links it to the page that is already live there.`,
            tone: "default",
            run: async (dryRun) =>
              fromAlign(
                await bridgeAdopt(dispatch, siteId, [item.cmsPageId as string], {
                  dryRun,
                }),
              ),
          },
        ];
      }
      if (item.reason === "not_built") {
        return [
          {
            id: `${item.key}:realize`,
            label: "Create the page",
            explainer: `Creates a draft page at ${item.route} on the connected site and links it to this plan node. Nothing is published.`,
            tone: "default",
            run: async (dryRun) =>
              fromAlign(
                await bridgeRealize(dispatch, siteId, [item.nodeId], { dryRun }),
              ),
          },
        ];
      }
      // `not_published` is repaired in one bulk move (see publishPending) —
      // the server has no per-page publish on this seam, and offering a
      // per-row button that silently publishes the whole site would lie.
      return [];
    },
    [dispatch, siteId],
  );

  /** The bulk repair for the "Draft only" group. */
  const publishPending = useMemo<DriftRepair | null>(() => {
    if (!siteId) return null;
    const drafts = model.items.filter(
      (item) => item.kind === "ghost" && item.reason === "not_published",
    ).length;
    if (drafts === 0) return null;
    return {
      id: "publish-pending",
      label: "Publish pending pages",
      explainer:
        "Publishes every page on the connected site that has unpublished changes — including the drafts listed here. You see the exact list before anything goes live.",
      tone: "default",
      run: async (dryRun) => {
        const result = await bridgePublish(dispatch, siteId, { dryRun });
        return {
          ok: result.failed === 0,
          lines: [
            ...result.items.map((page) =>
              page.error
                ? `${page.route ?? page.slug}: ${page.error}`
                : `${page.route ?? page.slug} — ${page.reason ?? page.status}`,
            ),
            ...result.warnings,
          ],
          changed: dryRun ? result.wouldPublish : result.published,
        };
      },
    };
  }, [dispatch, siteId, model.items]);

  /** Dry-run a repair (never applies). Errors are returned, never thrown. */
  const preview = useCallback(async (repair: DriftRepair): Promise<RepairOutcome> => {
    try {
      return await repair.run(true);
    } catch (error) {
      return { ok: false, lines: [extractErrorMessage(error)], changed: 0 };
    }
  }, []);

  /** Apply a repair for real, then re-derive drift. */
  const apply = useCallback(
    async (repair: DriftRepair): Promise<RepairOutcome> => {
      setBusyRepairId(repair.id);
      try {
        const outcome = await repair.run(false);
        await invalidate();
        return outcome;
      } catch (error) {
        return { ok: false, lines: [extractErrorMessage(error)], changed: 0 };
      } finally {
        setBusyRepairId(null);
      }
    },
    [invalidate],
  );

  return {
    model,
    /** True only on FIRST load — a background refresh never blanks the badges.
     * usePlanReality is manual-run (enabled:false), so its first load is "a run
     * is in flight and no report exists yet". */
    isLoading: cmsPages.isLoading || (reality.isRunning && reality.report === null),
    /** A background re-check is in flight (badges stay on screen). */
    isRefreshing: reality.isRunning,
    isPaired: cmsPages.map !== null,
    error: cmsPages.error ?? reality.error ?? null,
    busyRepairId,
    repairsFor,
    publishPending,
    preview,
    apply,
    /** Explicit write-run: persists the `realizes` alignment edges. */
    syncAlignment: reality.run,
  };
}
