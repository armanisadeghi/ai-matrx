"use client";

/**
 * The site's saved keyword-research artifacts, as doors.
 *
 * Every run persists a `content_ir.kind_instance` and, since MSR-26, binds it
 * to the site it was researched for via `platform.associations`
 * (`content_ir_kind_instance` -> `web_site`) — so this popover lists exactly
 * one site's saved runs, newest-first, each with its two doors: open the
 * full report (`/shapes/instances/[id]`) and share it (the canonical
 * ShareButton), which is also the workbench's page-level share affordance.
 *
 * MSR-26 supersedes the MSR-14 "derive site from tracked keyword overlap"
 * heuristic this component used to run — the binding is now real and direct,
 * so there is no cross-site filter here: this list IS one site's library.
 */

import { useState } from "react";
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
  listSavedKeywordResearch,
  type SavedKeywordResearch,
} from "@/features/marketing/seo/keyword-research/data/queries";
import { ShareButton } from "@/features/sharing/components/ShareButton";

export function savedKeywordResearchListQueryKey(siteId: string | null) {
  return ["seo", "keyword-research", "saved-list", siteId] as const;
}

export default function SavedResearchLibrary({
  siteId,
}: {
  siteId: string | null;
}) {
  const [search, setSearch] = useState("");

  const saved = useQuery({
    queryKey: savedKeywordResearchListQueryKey(siteId),
    queryFn: ({ signal }) =>
      siteId ? listSavedKeywordResearch(siteId, { signal }) : Promise.resolve([]),
    enabled: Boolean(siteId),
  });

  const cleanedSearch = search.trim().toLowerCase();
  const filtered: SavedKeywordResearch[] = (saved.data ?? []).filter(
    (row) =>
      !cleanedSearch ||
      row.artifact.primary_keyword.toLowerCase().includes(cleanedSearch),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          disabled={!siteId}
          title={siteId ? undefined : "Select a site to see its saved research"}
        >
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
              Every run saved for this site. Open the report or share it with
              a client.
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
            {cleanedSearch ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
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
              No saved research is linked to this site yet. Run research
              above, or copy keywords from another site.
            </p>
          ) : !filtered.length ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No saved research matches this search.
            </p>
          ) : (
            filtered.map((row) => (
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
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
