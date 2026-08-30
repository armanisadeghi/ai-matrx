"use client";

/**
 * Host for the identity rooms that are still SITE-scoped underneath.
 *
 * Knowledge (business discovery), Offerings (the topic tree) and Guidelines are
 * brand truth the user thinks about once per client, but their tables and their
 * canonical components hang off ONE site row. So the brand route owns the URL
 * and this component resolves the site: `?site=` (key or UUID) when the user
 * picked one, otherwise the brand's first site. When the brand has more than
 * one site a small picker appears — a single client with two websites must not
 * silently edit the wrong one.
 *
 * It supplies exactly what the old site layout supplied — the site context and
 * the site surface — so the canonical workbenches mount unchanged. The header
 * offset lives here too, matching `MarketingSiteLayoutClient`.
 */

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { useSiteCrawlActivity } from "@/features/marketing/data/useSiteCrawlActivity";
import { MarketingSiteProvider } from "@/features/marketing/components/site/MarketingSiteContext";
import { MarketingSiteSurfaceProvider } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";

export function BrandIdentitySiteSurface({ children }: { children: ReactNode }) {
  const brand = useMarketingBrand();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const requested = searchParams.get("site");
  const sites = useBrandSites(brand.id);
  const rows = useMemo(() => sites.data ?? [], [sites.data]);

  const site = useMemo(() => {
    if (rows.length === 0) return null;
    if (requested) {
      const match = rows.find(
        (row) => row.id === requested || marketingSeg(row) === requested,
      );
      if (match) return match;
    }
    return rows[0] ?? null;
  }, [rows, requested]);

  // Hooks run unconditionally; an empty id simply keeps the subscription idle.
  const crawlActivity = useSiteCrawlActivity(site?.id ?? "");

  if (sites.isPending) return <LoadingSurface label="Loading websites…" />;
  if (sites.isError) {
    return <QueryError error={sites.error} onRetry={() => void sites.refetch()} />;
  }

  if (!site) {
    return (
      <div className="flex h-full items-center justify-center p-6 pt-[var(--shell-header-h)]">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-base font-semibold text-foreground">
            {brand.name} has no website yet
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This room reads a website cold to propose what the business is, what
            it sells, and how it must be written about. Add the client&apos;s
            website and it fills in.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href={marketingRoutes.newSite(brand.id)}>Add a website</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MarketingSiteProvider
      value={{
        site,
        sitePath: marketingRoutes.website(brand.seg, marketingSeg(site)),
        brandId: brand.id,
        crawlActivity,
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
        {rows.length > 1 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Website</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                >
                  <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[16rem] truncate">
                    {site.name ?? site.domain}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {brand.name} websites
                </DropdownMenuLabel>
                {rows.map((row) => (
                  <DropdownMenuItem
                    key={row.id}
                    asChild
                    className={cn(row.id === site.id && "bg-accent/60")}
                  >
                    <Link
                      href={`${pathname}?site=${encodeURIComponent(marketingSeg(row))}`}
                      className="truncate"
                    >
                      {row.name ?? row.domain}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <MarketingSiteSurfaceProvider>{children}</MarketingSiteSurfaceProvider>
        </div>
      </div>
    </MarketingSiteProvider>
  );
}
