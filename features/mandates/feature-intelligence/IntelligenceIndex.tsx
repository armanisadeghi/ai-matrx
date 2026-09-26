"use client";

// features/mandates/feature-intelligence/IntelligenceIndex.tsx
//
// /intelligence — every feature's AI jobs, one row per feature, with how many
// jobs it has and how many places they run. Each row opens that feature's
// intelligence page. Features with jobs but no declared places still appear
// (their jobs read "Not recorded yet" on their page), so nothing is hidden.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { featureIntelligenceHref } from "./hrefs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  DECLARED_FEATURES,
  featureDisplayName,
  featureForKey,
  isFixtureFeature,
} from "./registry";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface IndexRow {
  feature: string;
  label: string;
  jobs: number;
  places: number;
  declared: boolean;
  /** A test/parity fixture prefix — admins only, labeled as such. */
  fixture: boolean;
}

export function buildIndexRows(mandateKeys: readonly string[]): IndexRow[] {
  const counts = new Map<string, number>();
  for (const key of mandateKeys) {
    const feature = featureForKey(key);
    counts.set(feature, (counts.get(feature) ?? 0) + 1);
  }
  const declared: IndexRow[] = DECLARED_FEATURES.map((entry) => ({
    feature: entry.feature,
    label: entry.label,
    jobs: counts.get(entry.feature) ?? 0,
    places: entry.places.length,
    declared: true,
    fixture: false,
  }));
  const known = new Set(declared.map((row) => row.feature));
  const others: IndexRow[] = [...counts.entries()]
    .filter(([feature]) => !known.has(feature))
    .map(([feature, jobs]) => ({
      feature,
      label: featureDisplayName(feature),
      jobs,
      places: 0,
      declared: false,
      fixture: isFixtureFeature(feature),
    }))
    .sort((a, b) => b.jobs - a.jobs || a.label.localeCompare(b.label));
  return [...declared, ...others];
}

function IndexRowLink({ row }: { row: IndexRow }) {
  return (
    <li>
      <Link
        href={featureIntelligenceHref(row.feature)}
        className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
          {row.label}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {row.jobs} {row.jobs === 1 ? "job" : "jobs"}
          {row.places > 0 ? ` · ${row.places} ${row.places === 1 ? "place" : "places"}` : ""}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

export function IntelligenceIndex() {
  const [rows, setRows] = useState<IndexRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useAppSelector(selectIsAdmin);

  useEffect(() => {
    let cancelled = false;
    readAllRows(
      ({ from, to }) =>
        mandateDefinitions(createClient())
          .select("mandate_key", { count: "exact" })
          .is("deleted_at", null)
          .order("mandate_key", { ascending: true })
          .range(from, to),
      { label: "mandate definitions for the intelligence index" },
    )
      .then((defs) => {
        if (!cancelled) setRows(buildIndexRows(defs.map((row) => row.mandate_key)));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const declared = rows?.filter((row) => row.declared) ?? [];
  const others = rows?.filter((row) => !row.declared && !row.fixture) ?? [];
  const fixtures = isAdmin ? (rows?.filter((row) => row.fixture) ?? []) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 lg:py-7">
      <p className="mb-4 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        Every part of the app that uses AI, with how many jobs it runs. Open one to see what runs
        each job for you, where it runs, and to duplicate it or use your own.
      </p>
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
          The features could not be read: {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : rows === null ? (
        <div className="flex min-h-[30dvh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading features" />
        </div>
      ) : (
        <>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {declared.map((row) => <IndexRowLink key={row.feature} row={row} />)}
          </ul>
          {others.length > 0 ? (
            <section className="mt-6" aria-labelledby="intelligence-more">
              <h2
                id="intelligence-more"
                className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                More features
              </h2>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {others.map((row) => <IndexRowLink key={row.feature} row={row} />)}
              </ul>
            </section>
          ) : null}
          {fixtures.length > 0 ? (
            <section className="mt-6" aria-labelledby="intelligence-fixtures">
              <h2
                id="intelligence-fixtures"
                className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Test fixtures · admins only
              </h2>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {fixtures.map((row) => <IndexRowLink key={row.feature} row={row} />)}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
