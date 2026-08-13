"use client";

/**
 * URL-backed workspace state for /marketing/content-plan/[siteId]: the site
 * is a ROUTED path segment (the workspace is a real record page under the
 * list at /marketing/content-plan), the view rides `?view=tree|table|map|
 * entities|setup`. The shell header controls and the body workbench both
 * read/write through this ONE hook, so the header can live in the PageHeader
 * center zone (core-route doctrine: no in-body toolbar) while the body stays
 * in sync — and the URL stays shareable.
 */
import { useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";

export type PlanView =
  | "tree"
  | "table"
  | "map"
  | "entities"
  | "setup"
  | "ai-runs";

/**
 * THE view vocabulary. Exported so runtime validators — the surface
 * client-tool handlers in ContentPlanWorkbench — check an agent-supplied view
 * against this list instead of re-typing the literals.
 */
export const PLAN_VIEWS: readonly PlanView[] = [
  "tree",
  "table",
  "map",
  "entities",
  "setup",
  "ai-runs",
];

export function usePlanWorkspaceParams() {
  const router = useRouter();
  const params = useParams<{ siteId?: string }>();
  const searchParams = useSearchParams();

  const siteId = params.siteId ?? null;
  const viewParam = searchParams.get("view");
  const view: PlanView = PLAN_VIEWS.includes(viewParam as PlanView)
    ? (viewParam as PlanView)
    : "tree";

  // Switching sites is NAVIGATION between records (push — back returns to
  // the previous site); switching views is state on the same record (replace).
  const setSiteId = useCallback(
    (next: string) => {
      router.push(marketingRoutes.contentPlanSite(next, view), {
        scroll: false,
      });
    },
    [router, view],
  );
  const setView = useCallback(
    (next: PlanView) => {
      if (!siteId) return;
      router.replace(marketingRoutes.contentPlanSite(siteId, next), {
        scroll: false,
      });
    },
    [router, siteId],
  );

  return { siteId, view, setSiteId, setView };
}
