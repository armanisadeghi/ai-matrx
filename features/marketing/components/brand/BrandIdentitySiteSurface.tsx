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

import { useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useBrandSites, useCreateSite } from "@/features/marketing/data/hooks";
import { useSiteCrawlActivity } from "@/features/marketing/data/useSiteCrawlActivity";
import { MarketingSiteProvider } from "@/features/marketing/components/site/MarketingSiteContext";
import { MarketingSiteSurfaceProvider } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { normalizeWebsiteUrl } from "@/features/marketing/lib/website-url";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

export function BrandIdentitySiteSurface({
  children,
}: {
  children: ReactNode;
}) {
  const brand = useMarketingBrand();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const requested = searchParams.get("site");
  const sites = useBrandSites(brand.id);
  const createSite = useCreateSite();
  const rows = sites.data ?? [];
  const requestedSite = requested
    ? rows.find(
        (row) => row.id === requested || marketingSeg(row) === requested,
      )
    : null;
  const site = requestedSite ?? rows[0] ?? null;

  const options: CreatableOption[] = rows.map((row) => ({
    value: row.id,
    label: row.name ?? row.domain,
    keywords: `${row.domain} ${row.root_url}`,
    hint: row.domain,
  }));

  const selectSite = (siteId: string) => {
    const selected = rows.find((row) => row.id === siteId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("site", selected ? marketingSeg(selected) : siteId);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  const createWebsite = async (typed: string): Promise<string | null> => {
    try {
      const parsed = normalizeWebsiteUrl(typed);
      const created = await createSite.mutateAsync({
        organizationId: brand.organizationId,
        name: parsed.hostname,
        rootUrl: parsed.toString(),
        domain: parsed.hostname.toLowerCase(),
        brandId: brand.id,
      });
      // useCreateSite invalidates the full Marketing root; await this scoped
      // read too so the newly selected id cannot momentarily fall back to the
      // brand's first website while the active picker is still stale.
      await sites.refetch();
      toast.success(`Created “${created.name ?? created.domain}”`, {
        description: `It is selected here and lives with ${brand.name}'s websites.`,
        action: toastDoor("web_site", created.id, { label: "Open website" }),
      });
      return created.id;
    } catch (error) {
      toast.error("Could not add website", {
        description: extractErrorMessage(error),
      });
      return null;
    }
  };

  // Hooks run unconditionally; an empty id simply keeps the subscription idle.
  const crawlActivity = useSiteCrawlActivity(site?.id ?? "");

  if (sites.isPending) return <LoadingSurface label="Loading websites…" />;
  if (sites.isError) {
    return (
      <QueryError error={sites.error} onRetry={() => void sites.refetch()} />
    );
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
        {rows.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Website</span>
            <CreatablePicker
              value={site.id}
              options={options}
              onSelect={selectSite}
              onCreate={createWebsite}
              noun="website"
              placeholder="Choose a website"
              searchPlaceholder="Search or type a website address…"
              emptyLabel="No website matches that address."
              disabled={isNavigating || createSite.isPending}
              loading={sites.isFetching}
              ariaLabel={`Website for ${brand.name}`}
              className="max-w-[18rem]"
              renderSelected={
                <span className="flex min-w-0 items-center gap-1.5">
                  <Globe2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{site.name ?? site.domain}</span>
                </span>
              }
              manageAction={{
                label: `Manage ${brand.name} websites`,
                href: marketingRoutes.brandWebsites(brand.seg),
              }}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <MarketingSiteSurfaceProvider>
            {children}
          </MarketingSiteSurfaceProvider>
        </div>
      </div>
    </MarketingSiteProvider>
  );
}
