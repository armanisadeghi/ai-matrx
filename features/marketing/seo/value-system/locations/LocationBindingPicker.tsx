"use client";

/**
 * BIND A SERVICE AREA TO A BUSINESS LOCATION (C10).
 *
 * P16: "it's not just about knowing that something's local. It's also about
 * knowing WHICH location that one belongs to."
 *
 * A human binding is the STRONGEST signal the attribution walk has — it
 * outranks city matching, state matching, distance and the single-location
 * fallback, because a person said so. That is why this control sits in the
 * area editor and not in a settings page: the moment somebody defines "Orange
 * County" is the moment they know which branch serves it.
 *
 * P23 — every picker takes new input. A brand with no locations gets a form,
 * not a wall, and the location it creates is selected immediately.
 *
 * Binding is OPTIONAL and says so. Leaving it empty is a real answer: the
 * resolver then matches the detected place against the locations themselves.
 * A control that implied it was required would make every single-location
 * business do busywork.
 */

import { useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Plus, Search } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useBusinessLocations } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { BusinessLocation } from "@/features/marketing/types";
import { AddLocationDialog } from "./AddLocationDialog";

/** "Irvine, CA" · "Irvine" · "no city or state yet" — never a bare blank. */
export function locationPlace(location: {
  locality: string | null;
  region: string | null;
}): string {
  const parts = [location.locality?.trim(), location.region?.trim()].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : "no city or state yet";
}

/** Above this many, the list gets a filter box rather than a longer scroll. */
const FILTER_THRESHOLD = 6;

export function LocationBindingPicker({
  brandId,
  organizationId,
  value,
  onChange,
}: {
  brandId: string;
  organizationId: string;
  /** `web.business_location` ids this area is bound to. */
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const locations = useBusinessLocations(brandId);

  const all = locations.data ?? [];
  const needle = query.trim().toLowerCase();
  const visible =
    needle.length === 0
      ? all
      : all.filter(
          (location) =>
            location.name.toLowerCase().includes(needle) ||
            locationPlace(location).toLowerCase().includes(needle),
        );

  const selected = new Set(value);
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);

  const addButton = (label: string) => (
    <button
      type="button"
      onClick={() => setAdding(query.trim())}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary"
    >
      <Plus className="h-3 w-3" aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="space-y-1.5">
      {locations.isPending ? (
        <div className="space-y-1">
          <Skeleton className="h-7 rounded-md" />
          <Skeleton className="h-7 rounded-md" />
        </div>
      ) : locations.isError ? (
        <InlineQueryError
          what="this brand's locations"
          error={locations.error}
          onRetry={() => void locations.refetch()}
        />
      ) : all.length === 0 ? (
        // Not a wall — the thing that is missing, and the way to make it.
        <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2">
          <p className="text-[11px] leading-4 text-muted-foreground">
            This brand has no business locations yet, so there is nothing to bind
            this area to. Add one and every local search this area catches can be
            attributed to it.
          </p>
          {addButton("Add a location")}
        </div>
      ) : (
        <>
          {all.length > FILTER_THRESHOLD ? (
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter locations"
                className="h-8 pl-7 text-sm"
              />
            </div>
          ) : null}

          <ul className="max-h-44 divide-y divide-border overflow-y-auto overscroll-contain rounded-md border border-border scrollbar-thin">
            {visible.map((location) => {
              const on = selected.has(location.id);
              return (
                <li key={location.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(location.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                      on ? "bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                      aria-hidden
                    >
                      {on ? (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                          <path
                            d="M2.5 6.2 4.8 8.5 9.5 3.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <Building2
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">
                        {location.name}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-[10px]",
                          location.locality || location.region
                            ? "text-muted-foreground"
                            : "text-warning",
                        )}
                      >
                        {locationPlace(location)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="px-2.5 py-2 text-[11px] text-muted-foreground">
                No location matches “{query.trim()}”.
              </li>
            ) : null}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            {addButton(
              query.trim() ? `Add “${query.trim()}” as a location` : "Add a location",
            )}
            <Link
              href={marketingRoutes.brandLocal(brandId)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              Manage every location
            </Link>
          </div>
        </>
      )}

      {adding !== null ? (
        <AddLocationDialog
          brandId={brandId}
          organizationId={organizationId}
          initialName={adding}
          onCancel={() => setAdding(null)}
          onCreated={(location: BusinessLocation) => {
            setAdding(null);
            setQuery("");
            // Selected immediately — P23: typed text becomes a real value and
            // is chosen, never handed back as one more thing to go find.
            onChange([...value, location.id]);
          }}
        />
      ) : null}
    </div>
  );
}
