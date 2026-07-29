"use client";

/**
 * Shell-header controls for the /marketing/content-plan/[siteId] WORKSPACE —
 * injected into the PageHeader center zone (never an in-body toolbar).
 * Back-to-list + site picker + view switcher + refresh; state rides the URL
 * via usePlanWorkspaceParams so the body workbench stays in sync. The list
 * page has its own quieter header (ContentPlanListHeader).
 */
import { useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  LayoutTemplate,
  ListTree,
  Map as MapIcon,
  RefreshCw,
  Table2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";

import { planKeys } from "../data/hooks";
import {
  usePlanWorkspaceParams,
  type PlanView,
} from "../hooks/usePlanWorkspaceParams";

const VIEW_ITEMS: { view: PlanView; label: string; icon: React.ReactNode }[] = [
  {
    view: "setup",
    label: "Setup",
    icon: <LayoutTemplate className="h-3.5 w-3.5" />,
  },
  { view: "tree", label: "Tree", icon: <ListTree className="h-3.5 w-3.5" /> },
  { view: "table", label: "Table", icon: <Table2 className="h-3.5 w-3.5" /> },
  { view: "map", label: "Map", icon: <MapIcon className="h-3.5 w-3.5" /> },
  {
    view: "entities",
    label: "Entities",
    icon: <Users className="h-3.5 w-3.5" />,
  },
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
  const { siteId, view, setSiteId, setView } = usePlanWorkspaceParams();
  const { sites, orgSites } = useContentPlanSites();
  const queryClient = useQueryClient();

  // Keep a ?site= target in the list even if options are still loading /
  // briefly empty so the Select doesn't blank out.
  const pickerSites = useMemo(() => {
    if (!siteId) return orgSites;
    if (orgSites.some((site) => site.id === siteId)) return orgSites;
    const orphan = (sites.data ?? []).find((site) => site.id === siteId);
    return orphan ? [orphan, ...orgSites] : orgSites;
  }, [orgSites, siteId, sites.data]);

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1 px-1.5 text-xs text-muted-foreground"
      >
        <Link href={marketingRoutes.contentPlan()} aria-label="All plans">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Plans</span>
        </Link>
      </Button>
      <ActiveContextLensChip className="shrink-0" />
      <Select value={siteId ?? ""} onValueChange={setSiteId}>
        <SelectTrigger
          data-surface-value="site_domain"
          className="h-7 w-48 truncate border-none bg-transparent text-sm font-medium shadow-none sm:w-64"
        >
          <SelectValue
            placeholder={sites.isLoading ? "Loading sites…" : "Pick a site"}
          />
        </SelectTrigger>
        <SelectContent>
          {pickerSites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.domain ?? site.name}
              {!site.brand_id ? " — no brand" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Five views + refresh do not fit beside the site picker at 375px.
        The group scrolls rather than crushing every button to zero width —
        shrink-0 is what stops the flex parent from doing that. */}
      <div
        data-surface-value="view"
        className="ml-auto flex min-w-0 items-center overflow-x-auto scrollbar-none"
      >
        {VIEW_ITEMS.map((item) => (
          <Button
            key={item.view}
            variant={view === item.view ? "secondary" : "ghost"}
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            onClick={() => setView(item.view)}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          aria-label="Refresh plan"
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: planKeys.all })
          }
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
