// features/admin/spend/SpendExplorer.tsx
//
// THE SPEND EXPLORER — the multidimensional half of /administration/billing/spend.
//
// Arman, 2026-09-12: "where do I go where I can see a line item and then click
// it and then see that data with the other dimensions?" This is that place.
// One window (today / yesterday / 24h / 7d / 30d / any two days), the ledger
// cut by every dimension it has, an 80/20 view of each, the "dig here"
// signals, the timeline, and the most expensive individual requests. Click
// anything and every panel re-cuts to that value. Window and filters live in
// the URL, so a view survives a reload and can be handed to someone.
//
// Every number is `runtime.global_execution.cost` — the same ledger as the
// headline — through `public.admin_spend_breakdown`. The five "dig here" lines
// are knobs the client resolves and passes in.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  ListOrdered,
  Percent,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";

import { Button } from "@ai-matrx/design-system";

import { useIsMounted } from "@/hooks/use-is-mounted";

import { DigHerePanel } from "./explorer/DigHerePanel";
import { DimensionTables } from "./explorer/DimensionTables";
import { FilterChips } from "./explorer/FilterChips";
import { ParetoPanel } from "./explorer/ParetoPanel";
import { SeriesBars } from "./explorer/SeriesBars";
import { TopRequestsTable } from "./explorer/TopRequestsTable";
import { TotalsStrip } from "./explorer/TotalsStrip";
import { WindowPicker } from "./explorer/WindowPicker";
import { zoneLabel } from "./format";
import { fetchSpendBreakdown, viewerTimezone } from "./service";
import type { SpendBreakdown, SpendDimension, SpendFilters } from "./types";
import { useSpendExplorerKnobs } from "./useSpendExplorerKnobs";
import {
  describeWindow,
  readExplorerUrlState,
  resolveWindow,
  writeExplorerUrlState,
  type ExplorerUrlState,
} from "./windows";

/** Mirrors the database's cap in `admin_spend_breakdown`. */
const DATABASE_WINDOW_DAY_CAP = 92;

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Compass;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 self-center text-muted-foreground"
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function SpendExplorer() {
  // The explorer derives its default window and its IANA timezone from the
  // viewer's browser. Rendering either on the server creates text that can
  // differ from the browser's first render (for example around midnight or
  // when the deployment host is in another zone), which makes React abandon
  // hydration. Keep this browser-derived surface out of the server paint.
  const mounted = useIsMounted();

  return mounted ? <MountedSpendExplorer /> : null;
}

function MountedSpendExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [timezone] = useState(() => viewerTimezone());
  const knobs = useSpendExplorerKnobs();

  const urlState = readExplorerUrlState(
    new URLSearchParams(searchParams.toString()),
  );
  const window = resolveWindow(
    urlState.preset,
    new Date(),
    urlState.fromDay,
    urlState.toDay,
  );
  const filters = urlState.filters;
  // The database caps a window at 92 days; say so here in words rather than
  // surfacing its refusal as a raw error after a round trip.
  const windowDays = (window.to.getTime() - window.from.getTime()) / 86_400_000;
  const windowTooWide = windowDays > DATABASE_WINDOW_DAY_CAP;

  const [data, setData] = useState<SpendBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // The identity of a read: window instants + filters + thresholds. Anything
  // else changing must not refetch (the URL carries table sort state too).
  const readKey = JSON.stringify({
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    filters,
    thresholds: knobs.thresholds,
    reloadTick,
  });

  useEffect(() => {
    if (!knobs.thresholds || windowTooWide) return;
    const thresholds = knobs.thresholds;
    const parsed = JSON.parse(readKey) as {
      from: string;
      to: string;
      filters: SpendFilters;
    };
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await fetchSpendBreakdown({
          from: new Date(parsed.from),
          to: new Date(parsed.to),
          timezone,
          filters: parsed.filters,
          thresholds,
        });
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setData(null);
        setError(
          cause instanceof Error
            ? cause
            : new Error(
                "The spend breakdown read failed for an unknown reason.",
              ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readKey, knobs.thresholds, timezone, windowTooWide]);

  const pushState = (next: ExplorerUrlState) => {
    const params = writeExplorerUrlState(
      new URLSearchParams(searchParams.toString()),
      next,
    );
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const drill = (dim: SpendDimension, key: string) => {
    pushState({ ...urlState, filters: { ...filters, [dim]: key } });
  };

  const removeFilter = (dim: SpendDimension) => {
    const next: SpendFilters = { ...filters };
    delete next[dim];
    pushState({ ...urlState, filters: next });
  };

  const clearFilters = () => pushState({ ...urlState, filters: {} });

  const hourly = data?.series.hour;
  const seriesPoints =
    hourly && hourly.length > 0 ? hourly : (data?.series.day ?? []);
  const granularity: "hour" | "day" =
    hourly && hourly.length > 0 ? "hour" : "day";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <WindowPicker
          preset={urlState.preset}
          fromDay={urlState.fromDay}
          toDay={urlState.toDay}
          onChange={(next) => pushState({ ...urlState, ...next })}
        />
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title={`Day boundaries use ${zoneLabel(data?.timezone ?? timezone)}.`}
        >
          {describeWindow(window)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {data
              ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : loading
                ? "Loading"
                : "Not loaded"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            {loading ? "Reading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <FilterChips
        filters={filters}
        data={data}
        onRemove={removeFilter}
        onClear={clearFilters}
      />

      {knobs.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          The explorer's "dig here" lines could not be read (
          {knobs.error.message}), so nothing below is computed — the breakdown
          refuses to guess where a line sits. Seed the five
          <span className="font-mono"> platform.spend_explorer.* </span>
          knobs to restore it.
        </div>
      ) : null}

      {windowTooWide ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          Max {DATABASE_WINDOW_DAY_CAP} days — this range is {Math.round(windowDays)}.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">
            The breakdown read failed — no numbers are shown.
          </div>
          <div className="mt-1 text-xs">
            {error.message}
            {" · "}
            This needs a Super Admin account; the read is refused at the
            database, not hidden in the UI. Use Refresh to try again.
          </div>
        </div>
      ) : null}

      {data ? (
        <div
          className={
            loading ? "opacity-60 transition-opacity" : "transition-opacity"
          }
          aria-busy={loading}
        >
          <div className="flex flex-col gap-4">
            <TotalsStrip data={data} />

            <SeriesBars
              points={seriesPoints}
              granularity={granularity}
              onPickDay={(day) => drill("day", day)}
            />

            <Section icon={Search} title="Dig here">
              <DigHerePanel data={data} onDrill={drill} />
            </Section>

            <Section icon={Percent} title="80% of spend">
              <ParetoPanel data={data} onDrill={drill} />
            </Section>

            <Section icon={Table2} title="Every dimension">
              <DimensionTables data={data} onDrill={drill} />
            </Section>

            <Section icon={ListOrdered} title="Costliest requests">
              <TopRequestsTable rows={data.topRequests} onDrill={drill} />
            </Section>
          </div>
        </div>
      ) : loading && !error && !knobs.error ? (
        <div
          className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          aria-busy
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
