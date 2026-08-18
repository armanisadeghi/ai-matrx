"use client";

/**
 * THE DOOR LAW, applied to press.
 *
 * Inventory run before writing a line (`features/scopes/registry/entityRegistry.ts`):
 *   • `party`               → HAS `hrefFor` → `/crm/{id}`.  Journalists use it.
 *   • `crm_outreach_list`   → HAS `hrefFor` → `/crm/outreach-lists/{id}`.
 *   • `seo_coverage_mention`→ token EXISTS in generated metadata but has NO
 *                             overlay entry, therefore NO `hrefFor`. There is
 *                             no in-app route for a coverage mention today, so
 *                             the honest door is the published article itself,
 *                             passed as an explicit external href. Registering
 *                             a route belongs in the shared registry, which
 *                             this bake-off entry is not permitted to edit —
 *                             flagged in the report.
 *   • `outlet` / `journalist` → no such token. An outlet is not a record in our
 *                             system; the journalist IS (a `crm.party`).
 *
 * The rule that matters most here: a journalist we have not filed yet must
 * NOT render as a bare span. It renders as the un-filed state WITH the action
 * that files them.
 */

import Link from "next/link";
import { ExternalLink, UserPlus } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";

import type { DeskSite } from "../types";

export function JournalistRef({
  partyId,
  name,
  className,
}: {
  partyId: string | null;
  name: string | null;
  className?: string;
}) {
  if (partyId) {
    return (
      <EntityRef
        token="party"
        id={partyId}
        name={name ?? "Journalist"}
        className={className}
      />
    );
  }
  if (!name) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        No journalist named on this request
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-xs font-medium text-foreground">{name}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/crm/outreach-lists"
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
          >
            <UserPlus className="h-3 w-3" />
            Not in CRM
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          <p className="text-xs">
            This journalist has no <code className="font-mono">crm.party</code>{" "}
            record yet, so there is nothing to open. Open Media Lists to file
            them — then every future request from them carries their history.
          </p>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/** An outlet is not a record in our system — the door is the outlet's own page. */
export function OutletRef({
  outlet,
  url,
  className,
}: {
  outlet: string | null;
  url: string | null;
  className?: string;
}) {
  if (!outlet) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Outlet not stated
      </span>
    );
  }
  if (!url) {
    return (
      <span className={cn("text-xs font-medium text-foreground", className)}>
        {outlet}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:text-primary hover:underline",
        className,
      )}
    >
      {outlet}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </a>
  );
}

/** Coverage has no in-app route — the article is the door. */
export function CoverageRef({
  title,
  url,
  className,
}: {
  title: string;
  url: string;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-start gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:text-primary hover:underline",
        className,
      )}
    >
      <span className="min-w-0">{title}</span>
      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
  );
}

/**
 * The brand/site door. Rows carry only `site_id`; `marketingRoutes.site` takes
 * the brand when we know it and falls back to the flat path (which
 * server-redirects) when we do not.
 */
export function SiteRef({
  site,
  className,
}: {
  site: DeskSite | null;
  className?: string;
}) {
  if (!site) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        Unlinked site
      </span>
    );
  }
  return (
    <Link
      href={marketingRoutes.site(site.brandId, site.siteId)}
      className={cn(
        "truncate text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline",
        className,
      )}
    >
      {site.brandName}
    </Link>
  );
}
