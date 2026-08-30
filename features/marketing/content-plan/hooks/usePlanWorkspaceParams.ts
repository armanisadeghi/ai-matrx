"use client";

/**
 * URL-backed workspace state for one site's Content Plan.
 *
 * Canonical home (agency restructure, 2026-08-29):
 *   /marketing/[brandId]/content/plan/[siteId]           → tree (the index)
 *   /marketing/[brandId]/content/plan/[siteId]/<view>    → table|map|entities|setup|ai-runs
 *
 * A view is a ROUTE now, not `?view=` — every screen a user can be ON is a
 * route. The legacy flat address (/marketing/content-plan/[siteId]?view=…) is
 * still read here because the resolver shim that redirects it renders this
 * workspace on the way through, and 18 call sites still build it.
 *
 * Both dynamic segments up there are dual-mode (key or UUID), so the ROUTE
 * PARAMS ARE ADDRESSES: the site UUID and the canonical segments come from
 * `MarketingSiteProvider`/`MarketingBrandProvider`, which the layout resolved
 * server-side. The shell header controls and the body workbench both read and
 * write through this ONE hook, so the header can live in the PageHeader centre
 * zone (core-route doctrine: no in-body toolbar) while the body stays in sync.
 */
import { useCallback } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  useMarketingBrandOptional,
  useMarketingSiteOptional,
} from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export type PlanView =
  "tree" | "table" | "map" | "entities" | "setup" | "ai-runs";

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

/**
 * The active view read from the path when we are on the brand-tree address
 * (`/marketing/<brand>/content/plan/<site>[/<view>]`), otherwise null. Pure and
 * exported so the mapping is testable without a router.
 */
export function planViewFromPath(pathname: string): PlanView | "tree" | null {
  const segments = pathname.split("/").filter(Boolean);
  const onBrandTree =
    segments[0] === "marketing" &&
    segments[2] === "content" &&
    segments[3] === "plan" &&
    Boolean(segments[4]);
  if (!onBrandTree) return null;
  const segment = segments[5];
  if (!segment) return "tree";
  return PLAN_VIEWS.includes(segment as PlanView) ? (segment as PlanView) : "tree";
}

export function usePlanWorkspaceParams() {
  const router = useRouter();
  const params = useParams<{ siteId?: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const brand = useMarketingBrandOptional();
  const site = useMarketingSiteOptional();

  // The resolved UUID wins over the param: on the brand tree the param is a
  // key most of the time, and every query below it needs the id.
  const siteId = site?.id ?? params.siteId ?? null;
  /** The canonical path segment for this site (key when it has one). */
  const siteSeg = site?.seg ?? params.siteId ?? null;

  const pathView = pathname ? planViewFromPath(pathname) : null;
  const queryView = searchParams.get("view");
  const view: PlanView =
    pathView ??
    (PLAN_VIEWS.includes(queryView as PlanView) ? (queryView as PlanView) : "tree");

  const nodeId = searchParams.get("node");
  const researchTopicReturnId = searchParams.get("researchTopic");

  /** This site's address for `next`, brand-scoped when we know the brand. */
  const viewHref = useCallback(
    (next: PlanView) =>
      brand && siteSeg
        ? marketingRoutes.brandContentPlanSite(brand.seg, siteSeg, next)
        : marketingRoutes.contentPlanSite(siteSeg ?? "", next),
    [brand, siteSeg],
  );

  // Switching sites is NAVIGATION between records; switching views is state
  // on the same record. BOTH are discrete user decisions, so both push: Back
  // is the undo affordance for a view switch, not an exit from the page.
  //
  // A site switch goes through the agency-level resolver door on purpose: the
  // picker is org-wide, so the target may belong to a DIFFERENT brand, and
  // only the door knows which. It resolves the site's brand and lands on the
  // canonical brand address.
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
      router.push(viewHref(next), { scroll: false });
    },
    [router, siteId, viewHref],
  );

  /**
   * The Research intake returns the approved topic in the URL. Once Setup has
   * durably linked it, remove the one-shot handoff param without adding a
   * second history entry.
   */
  const clearResearchTopicReturn = useCallback(() => {
    if (!siteId || !researchTopicReturnId) return;
    router.replace(viewHref(view), { scroll: false });
  }, [researchTopicReturnId, router, siteId, view, viewHref]);

  /** The list this workspace sits under — brand-scoped when we know the brand. */
  const listHref = brand
    ? marketingRoutes.brandContentPlan(brand.seg)
    : marketingRoutes.contentPlan();

  return {
    siteId,
    siteSeg,
    view,
    viewHref,
    listHref,
    nodeId,
    researchTopicReturnId,
    setSiteId,
    setView,
    clearResearchTopicReturn,
  };
}
