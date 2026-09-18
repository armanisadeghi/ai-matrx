"use client";

/**
 * THE REFUSAL SHOWS ON EVERY DEPENDENT RECORD (google-native PLAN §5.3: "a
 * refusal anywhere … shows on every dependent record's health strip with the
 * same Reconnect"). This is the marketing-site half of that rule for the one
 * refusal the site itself owns: a Search Console property bound to a DIFFERENT
 * site.
 *
 * Why it exists (zero-authorship verification 2026-09-17, defect B-4): site
 * `d7c4aeb1-…` (`ga4-oauth-qa-00fb6a62a3.invalid`) is bound to the property
 * `http://bhrcenter.com/` and nothing outside the Integrations editor said so.
 * From every list, card and dashboard the site simply looked quiet — which is
 * exactly what a wrong binding looks like, because Search Console answers 200
 * with zero rows for it.
 *
 * ONE judge (`judgeGscBindingWrite`) decides; this only prints its sentence and
 * the door that fixes it, beside the freshness line the same cards carry.
 */

import Link from "next/link";
import { Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { judgeGscBindingWrite } from "@/features/marketing/google/gsc-property";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { Json } from "@/types/database.types";

export interface GscBindingRefusalLineProps {
  site: {
    id: string;
    brand_id: string | null;
    domain: string;
    root_url?: string | null;
    integrations: Json;
  };
  /** `full` prints the whole refusal; `short` prints the headline only. */
  variant?: "full" | "short";
  className?: string;
}

/**
 * The refusal for a site's stored Search Console binding, or null when the
 * binding is fine, absent, or has no property picked.
 */
export function gscBindingRefusalForSite(site: {
  domain: string;
  root_url?: string | null;
  integrations: Json;
}): { headline: string; detail: string } | null {
  const stored = parseSiteIntegrations(site.integrations).googleSearchConsole;
  const judgement = judgeGscBindingWrite(stored, {
    root_url: site.root_url,
    domain: site.domain,
  });
  if (judgement.allowed || !judgement.refusal) return null;
  return {
    headline: judgement.refusal.headline,
    detail: judgement.refusal.detail,
  };
}

export function GscBindingRefusalLine({
  site,
  variant = "full",
  className,
}: GscBindingRefusalLineProps) {
  const refusal = gscBindingRefusalForSite(site);
  if (!refusal) return null;
  const href = marketingRoutes.siteSettings(
    site.brand_id,
    site.id,
    "integrations",
  );
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5",
        className,
      )}
    >
      <p className="min-w-0 flex-1 text-[11px] leading-4 text-foreground">
        <span className="font-medium">
          Search Console property does not match this site.
        </span>{" "}
        {refusal.headline}
        {variant === "full" ? ` ${refusal.detail}` : ""}
      </p>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/50 px-2 py-0.5 text-[11px] font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Wrench className="h-3 w-3" aria-hidden />
        Fix
      </Link>
    </div>
  );
}
