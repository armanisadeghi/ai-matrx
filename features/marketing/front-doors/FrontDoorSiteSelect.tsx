"use client";

/**
 * Site scoping for a front door, shared by every front door that opens a
 * WEBSITE workspace (`/marketing/brands/[brandId]/sites/[siteId]/...`).
 *
 * Same contract as `/marketing/capabilities`: the choice lives in `?site=`, so
 * the page a user is looking at is the page they can send someone. Falls back
 * to the first site rather than forcing a choice — a front door that opens
 * nothing until you pick something is a dead end with extra steps.
 */

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe2, Plus } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export interface FrontDoorSiteState {
  /** Every site the caller can open, name-ordered. */
  options: MarketingSite[];
  /** The one the doors below are scoped to — `null` while loading or if none. */
  site: MarketingSite | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

export function useFrontDoorSite(): FrontDoorSiteState {
  const params = useSearchParams();
  const sites = useSiteOptions();
  const options = sites.data ?? [];
  const requested = params.get("site");
  const site = options.find((item) => item.id === requested) ?? options[0] ?? null;
  return {
    options,
    site,
    isPending: sites.isPending,
    isError: sites.isError,
    error: sites.error,
  };
}

/** The site path every site-scoped door on a front door is built from. */
export function frontDoorSitePath(site: MarketingSite): string {
  return marketingRoutes.site(site.brand_id, site.id);
}

export function FrontDoorSiteSelect({
  state,
  basePath,
  label,
}: {
  state: FrontDoorSiteState;
  /** The front door's own route, e.g. `/marketing/monitoring`. */
  basePath: string;
  label: string;
}) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  if (state.isPending) return null;

  if (!state.site) {
    // No sites at all. The honest door is the one that creates the first site,
    // not a disabled dropdown.
    return (
      <Link
        href={marketingRoutes.newSite()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-accent"
      >
        <Globe2 className="size-3.5 text-muted-foreground" aria-hidden />
        Add your first website
      </Link>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Select
        value={state.site.id}
        onValueChange={(siteId) =>
          // Discrete site switch — Back returns to the previous site.
          startTransition(() =>
            router.push(`${basePath}?site=${encodeURIComponent(siteId)}`),
          )
        }
        disabled={isNavigating}
      >
        <SelectTrigger className="h-8 w-full sm:w-80" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {state.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {option.domain || option.root_url}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        href={marketingRoutes.newSite()}
        aria-label="Add website"
        title="Add website"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
