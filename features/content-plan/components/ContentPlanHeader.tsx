"use client";

/**
 * Shell-header controls for /content-plan — injected into the PageHeader
 * center zone (never an in-body toolbar). Site picker + view switcher +
 * refresh; state rides the URL via usePlanWorkspaceParams so the body
 * workbench stays in sync.
 */
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ListTree, Map as MapIcon, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { planKeys } from "../data/hooks";
import {
  usePlanWorkspaceParams,
  type PlanView,
} from "../hooks/usePlanWorkspaceParams";

const VIEW_ITEMS: { view: PlanView; label: string; icon: React.ReactNode }[] = [
  { view: "tree", label: "Tree", icon: <ListTree className="h-3.5 w-3.5" /> },
  { view: "map", label: "Map", icon: <MapIcon className="h-3.5 w-3.5" /> },
  {
    view: "entities",
    label: "Entities",
    icon: <Users className="h-3.5 w-3.5" />,
  },
];

/** Sites for the picker: active org's first, all visible as fallback. */
export function useContentPlanSites() {
  const orgId = useAppSelector(selectEffectiveOrganizationId);
  const sites = useSiteOptions();
  const scopedSites = useMemo(() => {
    const all = sites.data ?? [];
    return orgId ? all.filter((site) => site.organization_id === orgId) : all;
  }, [sites.data, orgId]);
  const orgSites = useMemo(
    () => (scopedSites.length > 0 ? scopedSites : (sites.data ?? [])),
    [scopedSites, sites.data],
  );
  return { sites, orgSites, scopedSites };
}

export function ContentPlanHeader() {
  const { siteId, view, setSiteId, setView } = usePlanWorkspaceParams();
  const { sites, orgSites, scopedSites } = useContentPlanSites();
  const queryClient = useQueryClient();

  // Default only to a site of the ACTIVE org — never silently drop another
  // org's site into the URL. Orgs without sites get the full labeled list
  // in the picker, but the user chooses explicitly.
  useEffect(() => {
    if (!siteId && scopedSites.length > 0) setSiteId(scopedSites[0].id);
  }, [siteId, scopedSites, setSiteId]);

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <Select value={siteId ?? ""} onValueChange={setSiteId}>
        <SelectTrigger className="h-7 w-40 truncate border-none bg-transparent text-sm font-medium shadow-none sm:w-56">
          <SelectValue
            placeholder={sites.isLoading ? "Loading sites…" : "Pick a site"}
          />
        </SelectTrigger>
        <SelectContent>
          {orgSites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.domain ?? site.name}
              {!site.brand_id ? " — no brand" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center">
        {VIEW_ITEMS.map((item) => (
          <Button
            key={item.view}
            variant={view === item.view ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setView(item.view)}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
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
