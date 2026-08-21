"use client";

/**
 * Shell-header controls for the /marketing/content-plan/[siteId] WORKSPACE —
 * injected into the PageHeader center zone (never an in-body toolbar).
 * Back-to-list + site picker + view switcher + refresh; state rides the URL
 * via usePlanWorkspaceParams so the body workbench stays in sync. The list
 * page has its own quieter header (ContentPlanListHeader).
 */
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type LucideIcon,
  History,
  LayoutTemplate,
  ListTree,
  Loader2,
  Map as MapIcon,
  Radar,
  RefreshCw,
  Table2,
  Users,
} from "lucide-react";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  EntityModeHeader,
  type EntityHeaderAction,
  type EntityOption,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";

import { planKeys } from "../data/hooks";
import { usePlanReality } from "../hooks/usePlanReality";
import {
  usePlanWorkspaceParams,
  type PlanView,
} from "../hooks/usePlanWorkspaceParams";

/**
 * The view vocabulary as RouteModeNav items carry it: an icon COMPONENT, not
 * an element. Every item has one — RouteModeNav skips its icon-only stage
 * entirely if even one is missing, which is how a nav jumps straight from
 * full text to a dropdown.
 */
const VIEW_ITEMS: { view: PlanView; label: string; icon: LucideIcon }[] = [
  { view: "setup", label: "Setup", icon: LayoutTemplate },
  { view: "tree", label: "Tree", icon: ListTree },
  { view: "table", label: "Table", icon: Table2 },
  { view: "map", label: "Map", icon: MapIcon },
  { view: "entities", label: "Entities", icon: Users },
  // Every paid AI run this site has ever had, openable in full.
  { view: "ai-runs", label: "AI runs", icon: History },
];

/**
 * Sites for the picker. RLS already scopes to everything the caller can
 * administer (`listSiteOptions` is a deliberate org-browse surface). Active
 * org sites sort first; the full list stays available so a plan applied to
 * another of the user's orgs (e.g. Titanium while the shell is on AI Matrx)
 * is still reachable from the dropdown.
 */
export function useContentPlanSites() {
  const orgId = useAppSelector(selectEffectiveOrganizationId);
  // access-errors: ok — site options for the plan switcher; a failed read only empties the dropdown, the selected plan surface owns its own record errors
  const sites = useSiteOptions();
  const all = sites.data ?? [];
  const scopedSites = useMemo(
    () => (orgId ? all.filter((site) => site.organization_id === orgId) : all),
    [all, orgId],
  );
  const orgSites = useMemo(() => {
    if (!orgId || scopedSites.length === 0) return all;
    const inOrgIds = new Set(scopedSites.map((site) => site.id));
    return [...scopedSites, ...all.filter((site) => !inOrgIds.has(site.id))];
  }, [all, orgId, scopedSites]);
  return { sites, orgSites, scopedSites };
}

export function ContentPlanHeader() {
  const { siteId, view } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const queryClient = useQueryClient();
  // Shares the workbench's query-cache entry — running here lights up the
  // overlay there.
  const reality = usePlanReality(siteId);

  // Keep a ?site= target in the list even if options are still loading /
  // briefly empty so the picker doesn't blank out.
  const pickerSites = useMemo(() => {
    if (!siteId) return orgSites;
    if (orgSites.some((site) => site.id === siteId)) return orgSites;
    const orphan = (sites.data ?? []).find((site) => site.id === siteId);
    return orphan ? [orphan, ...orgSites] : orgSites;
  }, [orgSites, siteId, sites.data]);

  const activeSite = pickerSites.find((site) => site.id === siteId) ?? null;

  // Sibling sites as REAL hrefs — the template's dropdown navigates, so a
  // site is reachable by keyboard, cmd-click and share, not just by a
  // controlled Select. Each keeps the current view.
  const entityOptions = useMemo<EntityOption[]>(
    () =>
      pickerSites.map((site) => ({
        label: `${site.domain ?? site.name}${site.brand_id ? "" : " — no brand"}`,
        href: marketingRoutes.contentPlanSite(site.id, view),
        active: site.id === siteId,
      })),
    [pickerSites, siteId, view],
  );

  const modes = useMemo<RouteNavItem[]>(
    () =>
      siteId
        ? VIEW_ITEMS.map((item) => ({
            name: item.label,
            href: marketingRoutes.contentPlanSite(siteId, item.view),
            icon: item.icon,
          }))
        : [],
    [siteId],
  );

  // Both actions ride the template's action list, so below `sm` they collapse
  // into the SAME one-tap drawer as the views instead of clipping off the
  // right edge (review rejection 681d0da9) or vanishing.
  const actions = useMemo<EntityHeaderAction[]>(
    () => [
      {
        label: reality.isRunning
          ? "Reality check running…"
          : "Reality check — which planned pages are actually live?",
        icon: reality.isRunning ? Loader2 : Radar,
        disabled: reality.isRunning,
        onPress: () => void reality.run(),
      },
      {
        label: "Refresh plan",
        icon: RefreshCw,
        onPress: () =>
          void queryClient.invalidateQueries({ queryKey: planKeys.all }),
      },
    ],
    [queryClient, reality],
  );

  // The routed site resolved to nothing the caller can read (same settled
  // condition as the workbench body, which renders the AccessGate). A full
  // picker labelled "Pick a site" over a gated record is a lie — the user DID
  // pick one — and its view tabs all lead into the same refusal. Mirror the
  // MarketingSiteLayoutClient FallbackHeader: a back door and nothing else;
  // the gate below owns the explanation.
  if (siteId && !sites.isPending && !activeSite) {
    return (
      <RouteHeader
        left={
          <ChevronLeftTapButton
            href={marketingRoutes.contentPlan()}
            ariaLabel="All content plans"
          />
        }
      />
    );
  }

  return (
    <EntityModeHeader
      backHref={marketingRoutes.contentPlan()}
      entityLabel={
        activeSite
          ? (activeSite.domain ?? activeSite.name)
          : sites.isLoading
            ? "Loading sites…"
            : "Pick a site"
      }
      // NOT `entityStatus`: that renders INSIDE the entity dropdown's trigger
      // button, and the lens chip is itself a button — React reported the
      // nested-button hydration error immediately. `right` is a sibling slot.
      right={<ActiveContextLensChip className="shrink-0" />}
      entityOptions={entityOptions}
      modes={modes}
      // The views differ ONLY by `?view=` — pathname matching cannot tell them
      // apart, which is exactly what this prop exists for.
      activeModeHref={
        siteId ? marketingRoutes.contentPlanSite(siteId, view) : undefined
      }
      actions={actions}
    />
  );
}
