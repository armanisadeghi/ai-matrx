"use client";

/**
 * Header site picker — every site the caller can administer (the same
 * deliberate org-browse read the sites portfolio uses), searchable, with the
 * bound-GSC state visible at a glance.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSiteOptions } from "@/features/marketing/data/service";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import type { MarketingSite } from "@/features/marketing/types";
import { cn } from "@/lib/utils";

export function useSiteOptions() {
  return useQuery({
    queryKey: ["marketing", "gsc", "site-options"],
    queryFn: ({ signal }) => listSiteOptions(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function siteHasGscBinding(site: MarketingSite): boolean {
  try {
    const integrations = parseSiteIntegrations(site.integrations);
    return Boolean(integrations.googleSearchConsole?.enabled);
  } catch {
    return false;
  }
}

export function SiteSwitcher({
  sites,
  selectedSiteId,
  onSelect,
}: {
  sites: MarketingSite[];
  selectedSiteId: string | null;
  onSelect: (siteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = sites.find((s) => s.id === selectedSiteId) ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sites;
    return sites.filter(
      (s) =>
        (s.name ?? "").toLowerCase().includes(term) ||
        (s.domain ?? "").toLowerCase().includes(term),
    );
  }, [sites, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 max-w-56 justify-between gap-1.5 border-border bg-card px-2 text-xs"
          aria-label="Select site"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? (selected.name ?? selected.domain) : "Select a site"}
            </span>
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sites…"
          className="mb-1.5 h-8 text-xs"
          aria-label="Search sites"
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No sites match.
            </p>
          ) : (
            filtered.map((site) => {
              const bound = siteHasGscBinding(site);
              return (
                <button
                  key={site.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                    site.id === selectedSiteId && "bg-muted",
                  )}
                  onClick={() => {
                    onSelect(site.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {site.name ?? site.domain ?? site.id}
                    </span>
                    {site.domain ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {site.domain}
                      </span>
                    ) : null}
                  </span>
                  {!bound ? (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      No GSC
                    </span>
                  ) : null}
                  {site.id === selectedSiteId ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
