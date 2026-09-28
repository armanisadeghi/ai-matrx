"use client";

// features/mandates/feature-intelligence/IntelligenceSearch.tsx
//
// THE ONE SEARCH at the top of every Intelligence page — the /intelligence
// directory, every /intelligence/<feature> page and the research topic's
// page (Arman, 2026-09-26). The query lives in the URL (`?q=`), so Back keeps
// it. On the directory it filters everything; on a feature page this page's
// own jobs are filtered in place and, under an "Everywhere else" divider, the
// matching jobs of every other feature follow automatically (the Linear /
// Notion pattern), each opening its own page with that job focused. Both read
// the directory's one index (`useIntelligenceDirectory`), so it is instant
// after the first page.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Workflow } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { SearchInput } from "@/components/official/SearchInput";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { featureIntelligenceHref } from "./hrefs";
import { featureIcon } from "./feature-icons";
import { useIntelligenceDirectory } from "./useIntelligenceDirectory";
import type { DirectoryFeature, DirectoryJob } from "./index-model";
import type { FeatureIntelligenceRow, IntelligenceContext, ResolvedPlace } from "./types";

export const INTELLIGENCE_QUERY_PARAM = "q";

/** The words of a query, lower-cased; every one must appear somewhere. */
export function queryTokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function hasAll(haystack: string, tokens: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

/** Does one of THIS page's jobs match: name, what it does, who runs it, where it runs? */
export function rowMatches(
  row: FeatureIntelligenceRow,
  tokens: readonly string[],
  places: readonly ResolvedPlace[],
): boolean {
  if (tokens.length === 0) return true;
  const where = places
    .filter((place) => place.mandateKeys.includes(row.mandateKey))
    .map((place) => `${place.label} ${place.trigger}`);
  return hasAll(
    [row.shortName, row.name, row.description, row.goal, row.holderName, row.mandateKey, ...where]
      .filter(Boolean)
      .join(" "),
    tokens,
  );
}

/**
 * The query, from and to the URL. Typing updates the address in place
 * (`history.replaceState` — no navigation, no server render), so Back and a
 * shared link keep the search.
 */
export function useIntelligenceQuery(): [string, (next: string) => void] {
  const params = useSearchParams();
  const fromUrl = params.get(INTELLIGENCE_QUERY_PARAM) ?? "";
  const [query, setQuery] = useState(fromUrl);
  // Back/Forward to another query brings it back into the box.
  useEffect(() => setQuery(fromUrl), [fromUrl]);
  const update = (next: string) => {
    setQuery(next);
    const url = new URL(window.location.href);
    if (next.trim()) url.searchParams.set(INTELLIGENCE_QUERY_PARAM, next);
    else url.searchParams.delete(INTELLIGENCE_QUERY_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  };
  return [query, update];
}

/** The bar itself: the search box, and the page's own controls beside it. */
export function IntelligenceSearchBar({
  value,
  onChange,
  placeholder = "Search jobs, agents, workflows, screens",
  summary,
  children,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** A short count beside the box ("12 jobs"). */
  summary?: string | null;
  /** The page's own controls (the For me / organization seat). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 bg-background/95 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <SearchInput
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          aria-label="Search intelligence"
          className="w-full min-w-0 sm:max-w-md"
          inputClassName="text-base sm:text-sm"
        />
        {summary ? (
          <p className="shrink-0 truncate text-[12.5px] tabular-nums text-muted-foreground">{summary}</p>
        ) : null}
        {children ? <div className="flex min-w-0 shrink-0 items-center sm:ml-auto">{children}</div> : null}
      </div>
    </div>
  );
}

interface ElsewhereHit {
  feature: DirectoryFeature;
  job: DirectoryJob;
}

const ELSEWHERE_LIMIT = 30;

/**
 * "Everywhere else" — the matching jobs of every OTHER Intelligence page,
 * under a labelled divider. Nothing renders without a query.
 */
export function EverywhereElse({
  query,
  excludeTarget,
  context,
}: {
  query: string;
  /** This page's own target; its jobs are shown above, never repeated here. */
  excludeTarget: string;
  context?: IntelligenceContext;
}) {
  const { domains, error } = useIntelligenceDirectory();
  const isAdmin = useAppSelector(selectIsAdmin);
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;

  const hits: ElsewhereHit[] = [];
  for (const domain of domains ?? []) {
    for (const feature of domain.features) {
      if (feature.feature === excludeTarget || (feature.fixture && !isAdmin)) continue;
      for (const job of feature.jobs) {
        const text = [job.name, job.description, job.goal, job.holderName, feature.label].filter(Boolean).join(" ");
        if (hasAll(text, tokens)) hits.push({ feature, job });
      }
    }
  }

  return (
    <section className="mt-6" aria-labelledby="intelligence-elsewhere">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="intelligence-elsewhere" className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Everywhere else
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
        {domains ? (
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {hits.length} {hits.length === 1 ? "match" : "matches"}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="truncate text-[13px] text-destructive" title={error}>
          Other features could not be searched: {error}
          <ErrorAlchemyMenu error={error} size="xs" />
        </p>
      ) : !domains ? (
        <div className="space-y-1.5" aria-label="Searching other features">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : hits.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No other feature has a job matching &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
          {hits.slice(0, ELSEWHERE_LIMIT).map(({ feature, job }) => {
            const Icon = featureIcon(feature.feature, feature.domain);
            const HolderIcon = job.holderType === "workflow" ? Workflow : AGENT_ICON;
            return (
              <li key={`${feature.feature}:${job.key}`} className="min-w-0">
                <Link
                  href={featureIntelligenceHref(feature.feature, { mandateKey: job.key, context })}
                  className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 hover:bg-accent/30 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,16rem)_auto]"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-foreground" title={job.name}>
                      {job.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground" title={feature.label}>
                      {feature.label}
                    </span>
                  </span>
                  <span className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground md:flex">
                    {job.holderName ? (
                      <>
                        <HolderIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate" title={job.holderName}>{job.holderName}</span>
                      </>
                    ) : null}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hits.length > ELSEWHERE_LIMIT ? (
        <Link
          href={`/intelligence?${INTELLIGENCE_QUERY_PARAM}=${encodeURIComponent(query.trim())}`}
          className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline"
        >
          All {hits.length} in the directory
        </Link>
      ) : null}
    </section>
  );
}
