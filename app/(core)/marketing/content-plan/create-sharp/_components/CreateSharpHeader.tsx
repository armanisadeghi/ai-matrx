"use client";

/**
 * Shell-header chrome for /marketing/content-plan/create-sharp — the site
 * picker (the SAME `useContentPlanSites` the workspace header uses, so the
 * two surfaces can never disagree about which sites exist) plus the way back
 * into the tree. Core-route doctrine: chrome goes in the PageHeader, never an
 * in-body toolbar. `pr-14` clears the fixed shell avatar.
 */
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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

export function CreateSharpHeader() {
  const { siteId, setSiteId } = usePlanWorkspaceParams();
  const { sites, orgSites, scopedSites } = useContentPlanSites();

  // Same auto-select as the workspace header: land on a site of the ACTIVE
  // org so the surface has something real to show. A ?site= already in the
  // URL always wins, even when it points outside that org.
  useEffect(() => {
    if (!siteId && scopedSites.length > 0) setSiteId(scopedSites[0].id);
  }, [siteId, scopedSites, setSiteId]);

  const pickerSites = (() => {
    if (!siteId) return orgSites;
    if (orgSites.some((site) => site.id === siteId)) return orgSites;
    const orphan = (sites.data ?? []).find((site) => site.id === siteId);
    return orphan ? [orphan, ...orgSites] : orgSites;
  })();

  return (
    <div className="flex w-full min-w-0 items-center gap-2 pr-14">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
      >
        <Link
          href={
            siteId
              ? `/marketing/content-plan?site=${siteId}`
              : "/marketing/content-plan"
          }
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Plan</span>
        </Link>
      </Button>

      <span className="hidden shrink-0 text-sm font-semibold text-foreground sm:inline">
        Site shape
      </span>

      <Select value={siteId ?? ""} onValueChange={setSiteId}>
        <SelectTrigger
          data-surface-value="site_domain"
          className="ml-auto h-7 w-48 truncate border-none bg-transparent text-sm font-medium shadow-none sm:w-64"
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
    </div>
  );
}
