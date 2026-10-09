"use client";

/**
 * The Social entry on /marketing/reports: a summary line and the one door into the cross-brand
 * social roll-up (/marketing/social). The roll-up itself lives on that one page; this never
 * repeats its tables.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { useAgencySocial } from "../hooks";

export function SocialReportsLink() {
  const agency = useAgencySocial();
  const accounts = agency.data?.accounts ?? [];
  const brands = new Set(accounts.map((a) => a.brandId ?? "org")).size;
  const outliers = agency.data?.outliers.length ?? 0;
  const summary = agency.isLoading
    ? "Loading tracked accounts…"
    : agency.isError
      ? "Social accounts could not be loaded."
      : accounts.length === 0
        ? "No tracked accounts yet. Track one from a brand's Socials."
        : `${accounts.length} tracked account${accounts.length === 1 ? "" : "s"} across ${brands} brand${brands === 1 ? "" : "s"} · ${outliers} recent outlier${outliers === 1 ? "" : "s"}`;
  return (
    <SectionCard title="Social" action={{ label: "Open social roll-up", href: marketingRoutes.social() }}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="text-sm text-muted-foreground" data-testid="reports-social-summary">{summary}</p>
        <Button variant="outline" asChild>
          <Link href={marketingRoutes.social()}>Open social roll-up</Link>
        </Button>
      </div>
    </SectionCard>
  );
}
