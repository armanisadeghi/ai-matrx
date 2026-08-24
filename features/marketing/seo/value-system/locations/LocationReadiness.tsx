"use client";

/**
 * THE READINESS GAUGE — what is stopping "which location does this keyword
 * belong to" from working, worst first, each row with the door to its fix.
 *
 * WHY IT LEADS THE PANEL: on real data today the honest answer for both test
 * sites is "almost nothing is attributable yet" — Data Destruction has no
 * business locations at all, Titanium has one location, no coordinates, and
 * 2,051 keywords never read for a place. A decomposition rendered above that
 * truth would read as "all your traffic is non-local", which is a confident
 * wrong answer. The gauge says why the numbers look the way they do BEFORE the
 * numbers.
 *
 * NO ROW IS A DEAD END. Every state carries a `door` key from the server (not a
 * string match on its own prose), and every door lands on the control that
 * fixes it: add a location right here, open the location list, run place
 * detection, bind an area.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleCheck,
  CirclePause,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { AddLocationDialog } from "./AddLocationDialog";
import { getLocationReadiness, locationReadinessQueryKey } from "./data";
import { READINESS_ORDER, type LocationReadinessRow } from "./types";

function StateIcon({ state }: { state: string }) {
  if (state === "ok")
    return <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden />;
  if (state === "inert")
    return <CirclePause className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  return <TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />;
}

const DOOR_LABEL: Record<string, string> = {
  add_location: "Add a location",
  manage_locations: "See your locations",
  fill_city_state: "Fill in city and state",
  add_coordinates: "Add coordinates",
  run_place_detection: "Run place detection",
  bind_area: "Bind an area to a location",
};

export function LocationReadiness({
  siteId,
  brandId,
  organizationId,
  /** Scrolls the place-detection strip on this page into view and flashes it. */
  onGoToPlaceDetection,
  /** Opens the first service area that is not bound to a location. */
  onBindArea,
  onChanged,
}: {
  siteId: string;
  brandId: string;
  organizationId: string | null;
  onGoToPlaceDetection?: () => void;
  onBindArea?: () => void;
  onChanged?: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);

  const readiness = useQuery({
    queryKey: locationReadinessQueryKey(siteId),
    staleTime: 60_000,
    queryFn: ({ signal }) => getLocationReadiness(siteId, signal),
  });

  if (readiness.isPending) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-9 rounded-md" />
        <Skeleton className="h-9 rounded-md" />
      </div>
    );
  }
  if (readiness.isError) {
    return (
      <InlineQueryError
        what="location readiness"
        error={readiness.error}
        onRetry={() => void readiness.refetch()}
      />
    );
  }

  // Worst first: what is switched off, then what is missing, then what works.
  const rows = [...(readiness.data ?? [])].sort(
    (a, b) => (READINESS_ORDER[a.state] ?? 9) - (READINESS_ORDER[b.state] ?? 9),
  );

  const door = (row: LocationReadinessRow) => {
    const label = DOOR_LABEL[row.door];
    if (!label) return null;
    const className =
      "inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary";

    if (row.door === "add_location") {
      if (!organizationId) return null;
      return (
        <button type="button" onClick={() => setAdding("")} className={className}>
          <Plus className="h-2.5 w-2.5" aria-hidden />
          {label}
        </button>
      );
    }
    if (row.door === "run_place_detection" && onGoToPlaceDetection) {
      return (
        <button type="button" onClick={onGoToPlaceDetection} className={className}>
          <ArrowRight className="h-2.5 w-2.5" aria-hidden />
          {label}
        </button>
      );
    }
    if (row.door === "bind_area" && onBindArea) {
      return (
        <button type="button" onClick={onBindArea} className={className}>
          <ArrowRight className="h-2.5 w-2.5" aria-hidden />
          {label}
        </button>
      );
    }
    // Everything about a location itself is edited on the location's own page.
    return (
      <Link href={marketingRoutes.brandLocal(brandId)} className={className}>
        <ArrowRight className="h-2.5 w-2.5" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {rows.map((row) => (
          <li
            key={`${row.state}-${row.headline}`}
            className={cn(
              "flex flex-wrap items-start gap-2 px-2.5 py-1.5",
              row.state === "gap" ? "bg-warning/5" : null,
            )}
          >
            <span className="mt-px shrink-0">
              <StateIcon state={row.state} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[11px] font-semibold",
                  row.state === "gap"
                    ? "text-warning"
                    : row.state === "inert"
                      ? "text-muted-foreground"
                      : "text-foreground",
                )}
              >
                {row.headline}
                {row.count_value > 0 &&
                !row.headline.includes(String(row.count_value)) ? (
                  <span className="ml-1 font-normal tabular-nums text-muted-foreground">
                    ({formatCount(Number(row.count_value))})
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                {row.detail}
              </p>
            </div>
            {door(row)}
          </li>
        ))}
      </ul>

      {adding !== null && organizationId ? (
        <AddLocationDialog
          brandId={brandId}
          organizationId={organizationId}
          initialName={adding}
          onCancel={() => setAdding(null)}
          onCreated={() => {
            setAdding(null);
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}
