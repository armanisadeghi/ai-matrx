"use client";

/**
 * The SEO section's front door for one client: the list of that client's
 * websites, each opening the SEO practice on it.
 *
 * The practice is always ABOUT a site (keywords, rankings, links, findings all
 * hang off one property), so the section root is a LIST, never a forced
 * workspace — canonical entry-list doctrine. Rows say only what the row knows:
 * the site's name and its domain. No score, no counts, nothing this page has
 * not read.
 */

import Link from "next/link";
import { ArrowRight, Globe, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { KeywordIntelligenceHub } from "@/features/marketing/seo/hub/KeywordIntelligenceHub";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export default function MarketingBrandSeoPage() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);

  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground">SEO</h1>
            <p className="text-xs text-muted-foreground">
              Pick a website to work on — keywords, rankings, technical health,
              links, and the programs that run them.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={marketingRoutes.newSite(brand.id)}>
              <Plus className="h-3.5 w-3.5" />
              Add website
            </Link>
          </Button>
        </div>

        {sites.isPending ? (
          <LoadingSurface label="Loading websites…" />
        ) : sites.isError ? (
          <QueryError
            error={sites.error}
            onRetry={() => void sites.refetch()}
          />
        ) : (sites.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <Globe className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              {brand.name} has no websites yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              SEO work starts from a property. Add one and its keyword, rank,
              and link workspaces open with it.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href={marketingRoutes.newSite(brand.id)}>Add website</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {(sites.data ?? []).map((site) => (
              <li key={site.id}>
                <Link
                  href={marketingRoutes.siteKeywords(
                    brand.seg,
                    marketingSeg(site),
                  )}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {site.name ?? site.domain}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {site.domain}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {(sites.data ?? []).length > 0 ? (
          // The Keyword Intelligence hub — every keyword screen per website,
          // scoped to this client. Re-doored here after the agency-model
          // restructure orphaned its flat route (audit, 2026-08-30).
          <div className="rounded-lg border border-border bg-card">
            <KeywordIntelligenceHub brandId={brand.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
