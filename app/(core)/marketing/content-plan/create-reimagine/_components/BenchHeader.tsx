"use client";

/**
 * Shell-header controls for the Blueprint Bench. Site picker + a way back to
 * the plan views. State rides the URL through the SAME hook the existing
 * content-plan header uses, so `?site=` is shared across every plan surface.
 */
import Link from "next/link";
import { useEffect } from "react";
import { ListTree, Map as MapIcon, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { usePlanWorkspaceParams } from "@/features/marketing/content-plan/hooks/usePlanWorkspaceParams";

export function BenchHeader() {
  const { siteId, setSiteId } = usePlanWorkspaceParams();
  const { sites, orgSites, scopedSites } = useContentPlanSites();

  useEffect(() => {
    if (!siteId && scopedSites.length > 0) setSiteId(scopedSites[0].id);
  }, [siteId, scopedSites, setSiteId]);

  const pickerSites = (() => {
    if (!siteId) return orgSites;
    if (orgSites.some((site) => site.id === siteId)) return orgSites;
    const orphan = (sites.data ?? []).find((site) => site.id === siteId);
    return orphan ? [orphan, ...orgSites] : orgSites;
  })();

  const back = (view: string) => {
    const params = new URLSearchParams();
    if (siteId) params.set("site", siteId);
    if (view !== "tree") params.set("view", view);
    const query = params.toString();
    return `/marketing/content-plan${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        Blueprint
      </span>
      <Select value={siteId ?? ""} onValueChange={setSiteId}>
        <SelectTrigger className="h-7 w-48 truncate border-none bg-transparent text-sm font-medium shadow-none sm:w-64">
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

      <div className="ml-auto flex items-center">
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Link href={back("tree")}>
            <ListTree className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tree</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Link href={back("map")}>
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Map</span>
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Link href={back("entities")}>
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Entities</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
