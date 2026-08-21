"use client";

/**
 * Resolve the ONE SEO plan record for a PLAN NODE — and create it when the
 * node has none.
 *
 * A plan node's SEO plan lives where every page's SEO plan lives: on
 * `web.page` (content-planning invariant 9). Two ways a node reaches its row,
 * tried in that order, both already-loaded and neither a new join:
 *
 *   1. the durable CMS id join (`client_pages.web_page_id`) that
 *      `useNodeMeasurement` resolves for the panel — a node whose page is
 *      BUILT;
 *   2. the site's route index (`loadSitePlanIndex` / `planForRoute`, the ONE
 *      route→plan map, keyed by `pageRouteKey`) — a node whose page is only
 *      PLANNED. The panel already loads that index; this adds no read.
 *
 * Nothing yet? `web.page` rows are creatable at planning time, and the server
 * endpoint that mints them is the same one the whole-plan keyword strategist
 * uses (`ensurePlannedPages`) — never a second creation path.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  planForRoute,
  type SitePlanIndex,
} from "@/features/marketing/content-plan/page-seo-plan";
import { planKeys } from "@/features/marketing/content-plan/data/hooks";
import { ensurePlannedPages } from "@/features/marketing/content-plan/setup/bridge";
import {
  usePageLocation,
  usePageWorkspace,
} from "@/features/marketing/data/hooks";
import type { MarketingPage } from "@/features/marketing/types";
import { useAppDispatch } from "@/lib/redux/hooks";

export type NodeSeoPlanState =
  | "no-route" // nothing to plan against yet
  | "resolving" // the site's route index is still loading
  | "creatable" // no page record for this route yet
  | "loading" // record found; its row is loading
  | "error"
  | "ready";

export interface NodeSeoPlan {
  state: NodeSeoPlanState;
  page: MarketingPage | null;
  brandId: string | null;
  error: Error | null;
  creating: boolean;
  create: () => Promise<void>;
}

export function useNodeSeoPlan(args: {
  /** `plan.node.site_id` — which IS the `web.site` id. */
  siteId: string;
  /** `plan.node.route` (trigger-maintained). */
  route: string | null;
  /** The site's route→plan index, from `useSitePlanIndex`. */
  sitePlans: SitePlanIndex | null;
  /** True while that index is still loading — "resolving", not "creatable". */
  sitePlansLoading?: boolean;
  /** Already-resolved id from the CMS join, when the panel has one. */
  cmsJoinedWebPageId?: string | null;
}): NodeSeoPlan {
  const {
    siteId,
    route,
    sitePlans,
    sitePlansLoading = false,
    cmsJoinedWebPageId = null,
  } = args;
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);

  const webPageId =
    cmsJoinedWebPageId ?? planForRoute(sitePlans, route)?.webPageId ?? null;
  // access-errors: ok — brandId door metadata only; the workspace read below drives the plan's error state
  const location = usePageLocation(webPageId);
  const workspace = usePageWorkspace(siteId, webPageId ?? "");

  const state: NodeSeoPlanState = !route
    ? "no-route"
    : webPageId
      ? workspace.isError
        ? "error"
        : workspace.data
          ? "ready"
          : "loading"
      : sitePlansLoading
        ? "resolving"
        : "creatable";

  const create = async () => {
    if (!route || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await ensurePlannedPages(dispatch, siteId, [route]);
      if (result.pages.length === 0) {
        throw new Error(
          result.problems[0] ??
            "The website could not register a page record for this route.",
        );
      }
      // The site's route index is what resolves this node next render.
      await queryClient.invalidateQueries({
        queryKey: planKeys.seoPlans(siteId),
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setCreating(false);
    }
  };

  return {
    state,
    page: workspace.data?.page ?? null,
    brandId: location.data?.brandId ?? null,
    error: createError ?? ((workspace.error as Error | null) ?? null),
    creating,
    create,
  };
}
