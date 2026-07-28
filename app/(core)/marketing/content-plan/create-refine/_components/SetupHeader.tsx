"use client";

/**
 * Shell-header chrome for /marketing/content-plan/create-refine — the same
 * grammar as the workspace header (context chip · site picker · view switch ·
 * refresh) so Setup reads as a fourth view of the SAME workspace, not a
 * separate tool. The view buttons navigate between the two routes; `?site=`
 * rides along so switching views never loses the site.
 */
import { useEffect, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ListTree, Map as MapIcon, RefreshCw, Rocket, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContentPlanSites } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { planKeys } from "@/features/marketing/content-plan/data/hooks";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";

import { setupKeys } from "../_lib/hooks";

const WORKSPACE = "/marketing/content-plan";
const SETUP = "/marketing/content-plan/create-refine";

const VIEWS = [
  { key: "setup", label: "Setup", icon: Rocket, href: SETUP },
  { key: "tree", label: "Tree", icon: ListTree, href: WORKSPACE },
  { key: "map", label: "Map", icon: MapIcon, href: `${WORKSPACE}?view=map` },
  {
    key: "entities",
    label: "Entities",
    icon: Users,
    href: `${WORKSPACE}?view=entities`,
  },
] as const;

export function SetupHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const siteId = searchParams.get("site");
  const { sites, orgSites, scopedSites } = useContentPlanSites();

  useEffect(() => {
    if (!siteId && scopedSites.length > 0) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("site", scopedSites[0].id);
      router.replace(`${SETUP}?${params.toString()}`, { scroll: false });
    }
  }, [router, searchParams, siteId, scopedSites]);

  const pickerSites = useMemo(() => {
    if (!siteId) return orgSites;
    if (orgSites.some((site) => site.id === siteId)) return orgSites;
    const orphan = (sites.data ?? []).find((site) => site.id === siteId);
    return orphan ? [orphan, ...orgSites] : orgSites;
  }, [orgSites, siteId, sites.data]);

  const go = (href: string) => {
    if (isPending) return;
    const target = new URL(href, "https://local");
    if (siteId) target.searchParams.set("site", siteId);
    const next = `${target.pathname}${target.search}`;
    startTransition(() => router.push(next));
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <ActiveContextLensChip className="shrink-0" />
      <Select
        value={siteId ?? ""}
        onValueChange={(next) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("site", next);
          router.replace(`${SETUP}?${params.toString()}`, { scroll: false });
        }}
      >
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
        {VIEWS.map((item) => {
          const Icon = item.icon;
          const active = item.key === "setup";
          return (
            <Button
              key={item.key}
              variant={active ? "secondary" : "ghost"}
              size="sm"
              disabled={isPending}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => (active ? undefined : go(item.href))}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{item.label}</span>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Refresh plan and archetypes"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: planKeys.all });
            void queryClient.invalidateQueries({ queryKey: setupKeys.all });
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
