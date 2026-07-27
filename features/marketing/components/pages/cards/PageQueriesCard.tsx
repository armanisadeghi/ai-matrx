"use client";

/**
 * PageQueriesCard — the real Search Console queries already reaching this
 * canonical page (aggregated from `seo.search_performance_daily` by the
 * canonical keyword primitive's `usePageTopQueries`), each adoptable as the
 * page's target keyword in one click and openable in Keyword Intelligence.
 *
 * This is evidence, not guesswork: these are the exact phrases Google already
 * shows this URL for.
 */

import { useState } from "react";
import { Crosshair, Loader2, BrainCircuit, SearchCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useUpdatePageIntent } from "@/features/marketing/data/hooks";
import { usePageTopQueries } from "@/features/marketing/seo/keyword/hooks";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import type { MarketingPage } from "@/features/marketing/types";

export function PageQueriesCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const { brandId } = useMarketingSiteSurfaceBase();
  const queries = usePageTopQueries(page.id);
  const mutation = useUpdatePageIntent();
  const openKeywordWindow = useOpenKeywordWindow();
  const [adopting, setAdopting] = useState<string | null>(null);

  const rows = queries.data ?? [];

  const adopt = async (query: string) => {
    setAdopting(query);
    try {
      await mutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        targetKeyword: query,
        desiredMetaTitle: page.meta_title_desired,
        desiredMetaDescription: page.meta_description_desired,
      });
      toast.success(`Target keyword set to “${query}”`);
    } catch (error) {
      toast.error("Could not set target keyword", {
        description: extractErrorMessage(error),
      });
    } finally {
      setAdopting(null);
    }
  };

  const copy = webCopy({
    kind: "web-page-search-queries",
    label: "Queries reaching this page",
    description:
      "Aggregated Search Console queries this canonical page already appears for (clicks, impressions, weighted position).",
    surface: `Search queries — ${page.url}`,
    data: rows,
    lines: [
      ["URL", page.url],
      ["Queries", rows.length],
      ...rows.map((row): [string, string] => [
        row.query,
        `${row.clicks} clicks · ${row.impressions} impressions${
          row.position === null ? "" : ` · pos ${row.position.toFixed(1)}`
        }`,
      ]),
    ],
    attributes: { page_id: page.id, count: rows.length },
  });

  let body: React.ReactNode;
  if (queries.isLoading) {
    body = (
      <div className="m-3 h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (queries.isError) {
    body = (
      <QueryError error={queries.error} onRetry={() => void queries.refetch()} />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <SearchCheck className="h-4 w-4" />
        No stored Search Console queries for this page yet — run a GSC sync
        from site integrations to capture what it already ranks for.
      </p>
    );
  } else {
    const isCurrent = (query: string) =>
      (page.target_keyword ?? "").trim().toLowerCase() ===
      query.trim().toLowerCase();
    body = (
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.query}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
          >
            <span className="min-w-0 flex-1 basis-52 truncate text-xs text-foreground">
              {row.query}
            </span>
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {row.clicks} clicks · {row.impressions.toLocaleString()} impr
              {row.position === null ? "" : ` · pos ${row.position.toFixed(1)}`}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Open Keyword Intelligence"
                aria-label={`Open Keyword Intelligence for ${row.query}`}
                onClick={() =>
                  openKeywordWindow({
                    phrase: row.query,
                    organizationId: site.organization_id,
                    siteId: site.id,
                    pageId: page.id,
                    brandId,
                  })
                }
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <BrainCircuit className="h-3.5 w-3.5" />
              </button>
              {isCurrent(row.query) ? (
                <Badge variant="success" className="text-[9px]">
                  Target
                </Badge>
              ) : (
                <button
                  type="button"
                  title="Set as this page's target keyword"
                  aria-label={`Set ${row.query} as target keyword`}
                  disabled={adopting !== null}
                  onClick={() => void adopt(row.query)}
                  className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {adopting === row.query ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Crosshair className="h-3 w-3" />
                  )}
                  Adopt
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <SectionCard
      title="Queries reaching this page"
      copy={copy}
      collapsible
      anchor="page_search_queries"
    >
      {body}
    </SectionCard>
  );
}
