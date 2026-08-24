"use client";

/**
 * THE SERVICE FILTER — "I wanna know what maps to e-waste recycling, what maps
 * to ITAD, and what maps to data destruction."
 *
 * It is a SERVER filter (`topic` in the shared GSC filter dialect, `tp=` in the
 * URL), so it intersects with every other filter and pages honestly: a paged
 * table sieved in the browser tells you "12 of 4,471" and means "12 of the 50 I
 * happened to fetch".
 *
 * Choosing a service means that service AND everything under it — a person
 * filtering "ITAD" is asking about the branch, not the root node's three direct
 * keywords. "Not placed yet" is a first-class choice: it is the work queue.
 *
 * It lives here rather than in the shared `FilterBar` because only this surface
 * holds the topic catalog, and a chip that reads `tp: 47a36caa-…` is not a
 * filter a person can understand. The dialect is shared; the control is local
 * (P22 — shared machinery never obligates a shared UI).
 */

import { Network, X } from "lucide-react";

import type { SiteServices } from "../hooks/useSiteServices";
import { ServicePicker, SERVICE_UNPLACED } from "./ServicePicker";

export function ServiceFilterControl({
  siteId,
  services,
  value,
  onChange,
}: {
  siteId: string;
  services: SiteServices;
  /** A topic id, `SERVICE_UNPLACED`, or undefined for "no service filter". */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const active = value
    ? value === SERVICE_UNPLACED
      ? "Not placed yet"
      : (services.byId.get(value)?.name ?? "That service")
    : null;

  if (active) {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground sm:max-w-72">
        <Network className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">
          Service:
        </span>
        <span className="min-w-0 truncate whitespace-nowrap font-medium" title={active}>
          {active}
        </span>
        <button
          type="button"
          aria-label="Remove Service filter"
          className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onChange(undefined)}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <div className="w-44">
      <ServicePicker
        siteId={siteId}
        services={services}
        value={null}
        onSelect={(next) => onChange(next)}
        placeholder="Filter by service"
        unplacedLabel="Not placed yet"
        ariaLabel="Filter by service"
        className="h-7 text-xs"
      />
    </div>
  );
}
