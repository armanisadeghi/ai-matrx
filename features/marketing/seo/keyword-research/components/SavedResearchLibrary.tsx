"use client";

/**
 * The org's saved keyword-research artifacts, as doors.
 *
 * Every run persists a `content_ir.kind_instance`, but until now the only way
 * back to one was to retype its exact phrase — the artifacts existed with no
 * surface listing them (a dead end by the Door Law). This popover lists them
 * newest-first and gives each row its two doors: open the full report
 * (`/shapes/instances/[id]`) and share it (the canonical ShareButton), which is
 * also the workbench's page-level share affordance.
 *
 * MSR-14 (Arman, 2026-08-25): "random research with random keywords… it
 * doesn't mean anything… filter these for the website or brand." Neither the
 * artifact (`content_ir.kind_instance`) nor `seo.keyword` carries a
 * site/brand column — a saved run is org-wide by construction, never scoped
 * at write time. The only REAL site binding in the data is derivative: does
 * any phrase in the run already have a `seo.site_keyword_value` row (a human
 * explicitly tracking that keyword on a site)? The Site filter below is
 * exactly that — an honest, batched-lookup filter, not a fabricated one. Text
 * search over the primary keyword is unconditionally real (no lookup
 * needed). Brand is not a separate filter: `web.site.brand_id` rolls sites
 * up to their brand in the same dropdown via optgroups, so "filter by brand"
 * means "any site under that brand".
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2, Search, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  getSiteIdsByKeywordPhrase,
  listSavedKeywordResearch,
  type SavedKeywordResearch,
} from "@/features/marketing/seo/keyword-research/data/queries";
import { keywordResearchPhrases } from "@/features/marketing/seo/keyword-research/data/artifact";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { listSiteOptions } from "@/features/marketing/data/service";
import { ShareButton } from "@/features/sharing/components/ShareButton";

export function savedKeywordResearchListQueryKey(
  organizationId: string | null,
) {
  return ["seo", "keyword-research", "saved-list", organizationId] as const;
}

const ALL_SITES = "__all__";

function useSiteBindings(saved: SavedKeywordResearch[] | undefined) {
  const rowIds = (saved ?? []).map((row) => row.id).join(",");
  return useQuery({
    queryKey: ["seo", "keyword-research", "saved-site-bindings", rowIds],
    queryFn: ({ signal }) => {
      const phrases = (saved ?? []).flatMap((row) =>
        keywordResearchPhrases(row.artifact),
      );
      return getSiteIdsByKeywordPhrase(phrases, signal);
    },
    enabled: Boolean(saved?.length),
    staleTime: 60 * 1000,
  });
}

export default function SavedResearchLibrary({
  organizationId: explicitOrganizationId,
}: {
  organizationId?: string | null;
}) {
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = explicitOrganizationId ?? effectiveOrgId ?? null;
  const [search, setSearch] = useState("");
  const [siteId, setSiteId] = useState<string>(ALL_SITES);

  const saved = useQuery({
    queryKey: savedKeywordResearchListQueryKey(organizationId),
    queryFn: ({ signal }) =>
      organizationId
        ? listSavedKeywordResearch(organizationId, { signal })
        : Promise.resolve([]),
    enabled: Boolean(organizationId),
  });

  const sites = useQuery({
    queryKey: ["marketing", "site-options", organizationId],
    queryFn: ({ signal }) => listSiteOptions(signal),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
  });

  const siteBindings = useSiteBindings(saved.data);

  // Roll sites up under their brand for the dropdown (brand_id null -> "No brand").
  const siteGroups = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; sites: { id: string; label: string }[] }
    >();
    for (const site of sites.data ?? []) {
      const groupKey = site.brand_id ?? "__no_brand__";
      const group = groups.get(groupKey) ?? {
        label: site.brand_id ? "Brand" : "No brand",
        sites: [],
      };
      group.sites.push({
        id: site.id,
        label: site.name ?? site.domain ?? site.id,
      });
      groups.set(groupKey, group);
    }
    return Array.from(groups.values());
  }, [sites.data]);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites.data ?? []) {
      map.set(site.id, site.name ?? site.domain ?? site.id);
    }
    return map;
  }, [sites.data]);

  function sitesForRow(row: SavedKeywordResearch): string[] {
    if (!siteBindings.data) return [];
    const phraseSet = new Set(
      keywordResearchPhrases(row.artifact).map(normalizeKeywordPhrase),
    );
    const found = new Set<string>();
    for (const phrase of phraseSet) {
      const rowSites = siteBindings.data.get(phrase);
      if (rowSites) for (const id of rowSites) found.add(id);
    }
    return Array.from(found);
  }

  const cleanedSearch = search.trim().toLowerCase();
  const filtered = (saved.data ?? []).filter((row) => {
    if (
      cleanedSearch &&
      !row.artifact.primary_keyword.toLowerCase().includes(cleanedSearch)
    ) {
      return false;
    }
    if (siteId !== ALL_SITES) {
      return sitesForRow(row).includes(siteId);
    }
    return true;
  });
  const isFiltering = Boolean(cleanedSearch) || siteId !== ALL_SITES;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          Saved research
          {saved.data?.length ? (
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
              {saved.data.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] p-0">
        <div className="space-y-2 border-b border-border px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              Saved keyword research
            </p>
            <p className="text-[11px] text-muted-foreground">
              Every run your organization has saved. Open the report or share
              it with a client.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search primary keyword…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="h-8 w-40 text-xs" size="sm">
                <SelectValue placeholder="Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SITES}>All sites</SelectItem>
                {siteGroups.map((group) => (
                  <SelectGroup key={group.label + group.sites[0]?.id}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {isFiltering ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setSearch("");
                  setSiteId(ALL_SITES);
                }}
                aria-label="Clear filters"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          {siteId !== ALL_SITES && siteBindings.isLoading ? (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Matching keywords already tracked on this site…
            </p>
          ) : siteId !== ALL_SITES ? (
            <p className="text-[10px] text-muted-foreground">
              Site is inferred from keywords this research already shares with
              the site's tracked keywords — a run with no overlap won't show
              here even if it's relevant to this site.
            </p>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {saved.isLoading ? (
            <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading saved research…
            </p>
          ) : saved.error ? (
            <p className="px-3 py-4 text-xs text-destructive">
              Could not load saved research:{" "}
              {saved.error instanceof Error
                ? saved.error.message
                : String(saved.error)}
            </p>
          ) : !saved.data?.length ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No saved research yet. Run research above and it is saved here
              automatically.
            </p>
          ) : !filtered.length ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No saved research matches this filter.
            </p>
          ) : (
            filtered.map((row) => {
              const rowSiteIds = sitesForRow(row);
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-0"
                >
                  <Link
                    href={`/shapes/instances/${row.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-medium text-foreground hover:underline">
                      {row.artifact.primary_keyword}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {(row.artifact.keyword_lists ?? []).reduce(
                        (total, list) => total + (list.keywords?.length ?? 0),
                        0,
                      )}{" "}
                      keywords · {new Date(row.createdAt).toLocaleDateString()}
                      {rowSiteIds.length ? (
                        <>
                          {" "}
                          ·{" "}
                          {rowSiteIds
                            .map((id) => siteNameById.get(id) ?? id)
                            .join(", ")}
                        </>
                      ) : null}
                    </p>
                  </Link>
                  <ShareButton
                    resourceType="content_ir_kind_instance"
                    resourceId={row.id}
                    resourceName={
                      row.title ??
                      `Keyword research: ${row.artifact.primary_keyword}`
                    }
                    size="sm"
                    variant="ghost"
                  />
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
