"use client";

/**
 * SEARCH EVERYTHING THIS SITE MEANS — one box over every dimension, every
 * answer, and every matcher on the site.
 *
 * THE ASK (Arman, 2026-08-24): *"I wanna see if a particular term comes up in
 * any of the matches that we've created… right now for data destruction, I
 * wanna see if we're doing anything with, say, e-stewards but I don't have a
 * quick and easy way of doing that."*
 *
 * WHY IT IS A RESULT LIST AND NOT A FILTER OVER THE PAGE. The thing you are
 * looking for is usually a MATCHER, and a matcher lives one interaction deep —
 * inside a value's matcher door, inside a dimension card. Narrowing the cards
 * would still leave the answer hidden behind a click, and auto-expanding
 * everything turns the page into a wall. So a query replaces the catalogue with
 * the hits themselves, each stating its full address (`Dimension › Answer`) and
 * each a door to the exact editor row — the `?dimension=&value=&matcher=`
 * deep link the value receipts already use (no-dead-ends: the explanation IS
 * the navigation).
 *
 * REFERENCE PRODUCT: GitHub's in-repo search results — the matched text shown
 * in place with the term highlighted, the path above it, and the row itself the
 * link. Borrowed for the same reason it works there: you recognise the hit
 * before you decide to open it.
 *
 * THE EMPTY STATE COUNTS WHAT IT SEARCHED. "Nothing mentions X" is only worth
 * anything if you know the search was complete, so the empty state names how
 * many matchers, answers and dimensions it looked through. A silent no-results
 * is indistinguishable from a broken query.
 */

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Layers, Search, Tag, X } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { dimensionValueHref } from "@/features/marketing/seo/value-system/reason-links";
import { kindMeta } from "./MatcherEditor";
import { getSiteMatchers, type FacetDimension } from "./data";

/** Below this a query matches half the site and the list is noise, not an answer. */
const MIN_QUERY = 2;

/** The matched run, rendered in place — you recognise a hit by seeing it. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-primary/20 px-0.5 text-foreground">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

function Address({
  dimension,
  value,
}: {
  dimension: string;
  value?: string | undefined;
}) {
  return (
    <p className="truncate text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
      {dimension}
      {value ? <span className="mx-1 opacity-60">›</span> : null}
      {value}
    </p>
  );
}

function ResultRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-1.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {title} <span className="tabular-nums opacity-70">{count}</span>
      </h2>
      {children}
    </section>
  );
}

export function DimensionSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search answers and matches…"
        aria-label="Search this site's dimensions, answers and matches"
        className="h-8 pl-8 pr-8 text-xs"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
          onClick={() => onChange("")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function DimensionSearchResults({
  query,
  dimensions,
  brandId,
  siteId,
}: {
  query: string;
  /** The catalogue the screen already loaded — never re-fetched to search it. */
  dimensions: FacetDimension[];
  brandId: string | null | undefined;
  siteId: string;
}) {
  const trimmed = query.trim();
  const matchers = useQuery({
    queryKey: ["marketing", "seo", "site-matchers", siteId],
    queryFn: ({ signal }) => getSiteMatchers(siteId, signal),
    staleTime: 60_000,
    enabled: trimmed.length >= MIN_QUERY,
  });

  // The value_id → its address, built once. A matcher row knows the value it
  // hangs on and nothing else; a hit is useless without its full address.
  const valueIndex = useMemo(() => {
    const index = new Map<
      string,
      { dimension: FacetDimension; valueLabel: string; valueKey: string }
    >();
    for (const dimension of dimensions) {
      for (const value of dimension.values) {
        index.set(value.value_id, {
          dimension,
          valueLabel: value.label,
          valueKey: value.key,
        });
      }
    }
    return index;
  }, [dimensions]);

  const hits = useMemo(() => {
    const needle = trimmed.toLowerCase();
    if (needle.length < MIN_QUERY) {
      return { matchers: [], values: [], dimensions: [] };
    }
    const has = (text: string | null | undefined) =>
      Boolean(text && text.toLowerCase().includes(needle));

    const matcherHits = (matchers.data ?? [])
      .filter((matcher) => has(matcher.pattern) || has(matcher.notes))
      .map((matcher) => ({ matcher, address: valueIndex.get(matcher.valueId) }))
      // A matcher whose value this site cannot see is not a result we can
      // address, and a row that cannot say where it lives is worse than absent.
      .filter(
        (hit): hit is { matcher: (typeof hit)["matcher"]; address: NonNullable<(typeof hit)["address"]> } =>
          Boolean(hit.address),
      )
      // Working matchers first, then by how much traffic they actually reach —
      // a disabled duplicate should never outrank the one doing the work.
      .sort(
        (a, b) =>
          Number(b.matcher.enabled) - Number(a.matcher.enabled) ||
          (b.matcher.matchCount ?? 0) - (a.matcher.matchCount ?? 0),
      );

    const valueHits = dimensions.flatMap((dimension) =>
      dimension.values
        .filter(
          (value) =>
            has(value.label) || has(value.key) || has(value.description),
        )
        .map((value) => ({ dimension, value })),
    );

    const dimensionHits = dimensions.filter(
      (dimension) =>
        has(dimension.label) ||
        has(dimension.slug) ||
        has(dimension.description),
    );

    return { matchers: matcherHits, values: valueHits, dimensions: dimensionHits };
  }, [trimmed, matchers.data, dimensions, valueIndex]);

  if (trimmed.length < MIN_QUERY) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[11px] text-muted-foreground">
        Type at least {MIN_QUERY} characters to search every dimension, answer
        and match on this site.
      </p>
    );
  }

  if (matchers.isError && !matchers.data) {
    return (
      <InlineQueryError
        what="this site's matches — answers and dimensions below are still searchable"
        error={matchers.error}
        onRetry={() => void matchers.refetch()}
      />
    );
  }

  const total =
    hits.matchers.length + hits.values.length + hits.dimensions.length;
  const searchedMatchers = matchers.data?.length ?? 0;
  const searchedValues = dimensions.reduce(
    (sum, dimension) => sum + dimension.values.length,
    0,
  );

  if (matchers.isPending) {
    return (
      <p className="px-1 text-[11px] text-muted-foreground">
        Searching this site's matches…
      </p>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4">
        <p className="text-xs font-semibold text-foreground">
          Nothing on this site mentions “{trimmed}”
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          Searched {formatCount(searchedMatchers)} matches,{" "}
          {formatCount(searchedValues)} answers and{" "}
          {formatCount(dimensions.length)} dimensions — this site does not use
          that term to mean anything yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="px-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatCount(total)} {total === 1 ? "result" : "results"}
        </span>{" "}
        for “{trimmed}” — searched {formatCount(searchedMatchers)} matches,{" "}
        {formatCount(searchedValues)} answers and{" "}
        {formatCount(dimensions.length)} dimensions.
      </p>

      <Group title="Matches" count={hits.matchers.length}>
        <div className="space-y-1.5">
          {hits.matchers.map(({ matcher, address }) => {
            const meta = kindMeta(matcher.kind);
            const Icon = meta.icon;
            const matchCount = matcher.matchCount ?? 0;
            return (
              <ResultRow
                key={matcher.id}
                href={dimensionValueHref(
                  { brandId, siteId },
                  address.dimension.slug,
                  matcher.valueId,
                  matcher.id,
                )}
              >
                <Address
                  dimension={address.dimension.label}
                  value={address.valueLabel}
                />
                <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Icon className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    {meta.label}
                  </span>
                  <span className="min-w-0 break-words text-xs font-medium text-foreground">
                    {matcher.pattern ? (
                      <Highlight text={matcher.pattern} query={trimmed} />
                    ) : (
                      <span className="italic text-muted-foreground">
                        no pattern — read live from the brand
                      </span>
                    )}
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                  {matcher.enabled ? (
                    <span className="text-foreground">On</span>
                  ) : (
                    // The single most useful thing this search surfaces: a rule
                    // that exists, looks right, and is doing nothing.
                    <span className="rounded border border-warning/50 bg-warning/10 px-1 text-warning">
                      Off — matching nothing
                    </span>
                  )}
                  <span className="tabular-nums">
                    {matchCount > 0
                      ? `${formatCount(matchCount)} keywords matched`
                      : "never matched"}
                  </span>
                  {matcher.origin ? <span>from {matcher.origin}</span> : null}
                  {matcher.notes ? (
                    <span className="min-w-0 truncate italic">
                      <Highlight text={matcher.notes} query={trimmed} />
                    </span>
                  ) : null}
                </p>
              </ResultRow>
            );
          })}
        </div>
      </Group>

      <Group title="Answers" count={hits.values.length}>
        <div className="space-y-1.5">
          {hits.values.map(({ dimension, value }) => (
            <ResultRow
              key={value.value_id}
              href={dimensionValueHref(
                { brandId, siteId },
                dimension.slug,
                value.value_id,
              )}
            >
              <Address dimension={dimension.label} />
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <Tag className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  <Highlight text={value.label} query={trimmed} />
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatCount(value.keyword_count)} keywords
                </span>
              </p>
              {value.description ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  <Highlight text={value.description} query={trimmed} />
                </p>
              ) : null}
            </ResultRow>
          ))}
        </div>
      </Group>

      <Group title="Dimensions" count={hits.dimensions.length}>
        <div className="space-y-1.5">
          {hits.dimensions.map((dimension) => (
            <ResultRow
              key={dimension.dimension_id}
              href={dimensionValueHref(
                { brandId, siteId },
                dimension.slug,
                dimension.values[0]?.value_id,
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Layers className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  <Highlight text={dimension.label} query={trimmed} />
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {dimension.scope === "site" ? "Yours" : "Shared"} ·{" "}
                  {formatCount(dimension.value_count)} answers
                </span>
              </p>
              {dimension.description ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  <Highlight text={dimension.description} query={trimmed} />
                </p>
              ) : null}
            </ResultRow>
          ))}
        </div>
      </Group>
    </div>
  );
}
