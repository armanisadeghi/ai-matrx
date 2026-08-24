"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Database, Gauge, Globe2, SearchCheck } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  siteSeoCapabilities,
  type SeoCapabilityGroup,
} from "@/features/marketing/seo/capabilities/capabilities";

const groupCopy: Record<
  SeoCapabilityGroup,
  { title: string; description: string; icon: typeof Gauge }
> = {
  snapshot: {
    title: "Snapshot audit",
    description:
      "Checks stored directly on each captured page. These appear as soon as pages are crawled; they are not the catalogue findings system.",
    icon: Gauge,
  },
  catalogue: {
    title: "Catalogue analysis",
    description:
      "Checks executed over stored evidence. Their results feed site scores, the priority queue, and the findings register.",
    icon: SearchCheck,
  },
  provider: {
    title: "Provider intelligence",
    description:
      "Measurements imported from external systems. Missing data here usually means a connection or collection gap, not a failed crawl check.",
    icon: Database,
  },
};

export function SeoCapabilitiesWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const sites = useSiteOptions();
  const [isNavigating, startTransition] = useTransition();

  if (sites.isPending) {
    return <LoadingSurface label="Loading SEO capabilities…" />;
  }
  if (sites.isError) {
    return (
      <QueryError error={sites.error} onRetry={() => void sites.refetch()} />
    );
  }
  const options = sites.data ?? [];
  const selectedId = params.get("site");
  const site = options.find((item) => item.id === selectedId) ?? options[0];
  if (!site) {
    return (
      <main className="flex h-full items-center justify-center bg-textured p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-base font-semibold">Add a site first</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The catalogue is shared, but its evidence doors open a managed
            website workspace.
          </p>
          <Link
            href={marketingRoutes.newSite()}
            className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
          >
            Add a site
          </Link>
        </div>
      </main>
    );
  }
  const sitePath = marketingRoutes.site(site.brand_id, site.id);
  const capabilities = siteSeoCapabilities(sitePath);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 lg:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          SEO capabilities
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The shared catalogue of what Marketing can measure, where each result
          lives, and which system produces it. Choose a website only to open
          that capability's evidence.
        </p>
        <Select
          value={site.id}
          onValueChange={(siteId) =>
            // Discrete site switch — Back returns to the previous site.
            startTransition(() =>
              router.push(marketingRoutes.capabilities(siteId)),
            )
          }
          disabled={isNavigating}
        >
          <SelectTrigger
            className="mt-3 h-8 w-full sm:w-80"
            aria-label="Website for evidence links"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name} · {option.domain || option.root_url}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {(["snapshot", "catalogue", "provider"] as const).map((group) => {
        const copy = groupCopy[group];
        const Icon = copy.icon;
        return (
          <section
            key={group}
            className="overflow-hidden rounded-lg border bg-card"
          >
            <div className="flex gap-3 border-b px-4 py-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">{copy.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {copy.description}
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3">
              {capabilities
                .filter((capability) => capability.group === group)
                .map((capability) => {
                  return (
                    <Link
                      key={capability.key}
                      href={capability.destination}
                      className="group flex min-h-36 flex-col border-b p-4 transition-colors hover:bg-muted/40 md:border-r"
                    >
                      <h3 className="text-sm font-medium group-hover:underline">
                        {capability.label}
                      </h3>
                      <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">
                        {capability.description}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {capability.evidenceLabel}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
