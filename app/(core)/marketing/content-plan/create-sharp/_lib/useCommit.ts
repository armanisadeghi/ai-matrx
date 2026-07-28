"use client";

/**
 * app/(core)/marketing/content-plan/create-sharp/_lib/useCommit.ts
 *
 * Turn the previewed shape into real `plan.node` rows.
 *
 * Rules that make this safe to press twice:
 *  • A route that already exists is NEVER recreated — it is adopted (its id
 *    becomes the parent for the children below it).
 *  • The archetype stamp is (re)written onto adopted nodes too, so adjusting
 *    "services × 8 → × 12" updates the promise the checklist measures against.
 *  • Writes are sequential and parent-first because the DB computes `route`
 *    from the parent — there is no id to hand a child until its parent lands.
 *  • A failure inside one family does NOT abort the others; every failure is
 *    collected and reported verbatim (the DB trigger message IS the contract).
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  createPlanNode,
  updatePlanNode,
} from "@/features/marketing/content-plan/data/service";
import { planKeys } from "@/features/marketing/content-plan/data/hooks";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import { extractErrorMessage } from "@/utils/errors";

import { archetypeStampFor, NODE_ATTR_KEY } from "./archetypes";
import type { PreviewRow } from "./model";

export interface CommitFailure {
  route: string;
  label: string;
  message: string;
}

export interface CommitProgress {
  running: boolean;
  done: number;
  total: number;
  /** The route currently being written — real progress, not a spinner. */
  current: string | null;
  created: number;
  adopted: number;
  failures: CommitFailure[];
  /** Set once a run finishes, so the UI can show a result instead of nothing. */
  finishedAt: number | null;
}

const IDLE: CommitProgress = {
  running: false,
  done: 0,
  total: 0,
  current: null,
  created: 0,
  adopted: 0,
  failures: [],
  finishedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the node already carries exactly this stamp (no write needed). */
function stampMatches(node: PlanNodeRow, stamp: Record<string, unknown>): boolean {
  const attributes = isRecord(node.attributes) ? node.attributes : {};
  const current = attributes[NODE_ATTR_KEY];
  return JSON.stringify(current) === JSON.stringify(stamp[NODE_ATTR_KEY]);
}

export function useCommitShape(args: {
  siteId: string | null;
  organizationId: string | null;
  /** slug → platform.categories id for the `plan_page_type` dimension. */
  pageTypeIdBySlug: Map<string, string>;
  /** The `planned` status id, when the seed category has loaded. */
  plannedStatusId: string | null;
  nodesByRoute: Map<string, PlanNodeRow>;
}) {
  const {
    siteId,
    organizationId,
    pageTypeIdBySlug,
    plannedStatusId,
    nodesByRoute,
  } = args;
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<CommitProgress>(IDLE);

  const reset = useCallback(() => setProgress(IDLE), []);

  const commit = useCallback(
    async (rows: PreviewRow[], archetypeKey: string) => {
      if (!siteId || !organizationId) {
        throw new Error("Pick a site before creating pages.");
      }
      const failures: CommitFailure[] = [];
      let created = 0;
      let adopted = 0;
      let done = 0;

      // route → node id, seeded with what already exists so adopted branches
      // can parent new children immediately.
      const idByRoute = new Map<string, string>();
      for (const [route, node] of nodesByRoute) idByRoute.set(route, node.id);
      // Routes whose parent failed — their children are skipped with a reason
      // instead of firing a write the DB is guaranteed to reject.
      const blocked = new Set<string>();

      setProgress({
        ...IDLE,
        running: true,
        total: rows.filter((row) => row.state === "new").length,
      });

      for (const row of rows) {
        const stamp = archetypeStampFor(row, archetypeKey);

        if (row.state === "in-plan" && row.existingNodeId) {
          idByRoute.set(row.route, row.existingNodeId);
          const existing = nodesByRoute.get(row.route);
          if (existing && !stampMatches(existing, stamp)) {
            try {
              const merged = isRecord(existing.attributes)
                ? { ...existing.attributes, ...stamp }
                : stamp;
              await updatePlanNode(existing.id, { attributes: merged });
              adopted += 1;
            } catch (error) {
              failures.push({
                route: row.route,
                label: row.label,
                message: extractErrorMessage(error),
              });
            }
          }
          continue;
        }

        if (row.parentRoute && blocked.has(row.parentRoute)) {
          blocked.add(row.route);
          failures.push({
            route: row.route,
            label: row.label,
            message: `Skipped — its parent ${row.parentRoute} could not be created.`,
          });
          done += 1;
          setProgress((prev) => ({ ...prev, done, current: row.route }));
          continue;
        }

        const parentId = row.parentRoute
          ? (idByRoute.get(row.parentRoute) ?? null)
          : null;
        if (row.parentRoute && !parentId) {
          blocked.add(row.route);
          failures.push({
            route: row.route,
            label: row.label,
            message: `Skipped — no node exists at the parent route ${row.parentRoute}.`,
          });
          done += 1;
          setProgress((prev) => ({ ...prev, done, current: row.route }));
          continue;
        }

        setProgress((prev) => ({ ...prev, current: row.route }));
        try {
          const node = await createPlanNode({
            site_id: siteId,
            organization_id: organizationId,
            parent_id: parentId,
            node_type: row.nodeType,
            label: row.label,
            slug: row.slug,
            brief: row.brief,
            page_type_id: row.pageType
              ? (pageTypeIdBySlug.get(row.pageType) ?? null)
              : null,
            status_id: plannedStatusId,
            attributes: stamp,
          });
          idByRoute.set(node.route ?? row.route, node.id);
          created += 1;
        } catch (error) {
          blocked.add(row.route);
          failures.push({
            route: row.route,
            label: row.label,
            message: extractErrorMessage(error),
          });
        }
        done += 1;
        setProgress((prev) => ({ ...prev, done, created, adopted, failures }));
      }

      await queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      const result: CommitProgress = {
        running: false,
        done,
        total: done,
        current: null,
        created,
        adopted,
        failures,
        finishedAt: Date.now(),
      };
      setProgress(result);
      return result;
    },
    [
      siteId,
      organizationId,
      pageTypeIdBySlug,
      plannedStatusId,
      nodesByRoute,
      queryClient,
    ],
  );

  return { commit, progress, reset };
}
