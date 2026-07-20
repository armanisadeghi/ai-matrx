"use client";

import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketingSite } from "@/features/marketing/types";
import {
  siteConnectionStatuses,
  type SiteConnectionState,
} from "@/features/marketing/lib/site-status";

const stateDotClass: Record<SiteConnectionState, string> = {
  connected: "bg-emerald-500",
  attention: "bg-amber-500",
  off: "bg-muted-foreground/30",
};

const stateTextClass: Record<SiteConnectionState, string> = {
  connected: "text-foreground",
  attention: "text-foreground",
  off: "text-muted-foreground/60",
};

/**
 * The five big-picture connection chips (Init / GSC / GA4 / PSI / CMS),
 * derived exclusively through lib/site-status.ts so every surface agrees.
 */
export function SiteConnectionChips({
  site,
  className,
}: {
  site: Pick<
    MarketingSite,
    "initialized_at" | "initialization" | "integrations" | "gsc_synced_at"
  >;
  className?: string;
}) {
  const statuses = siteConnectionStatuses(site);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {statuses.map((status) => (
        <span
          key={status.key}
          title={`${status.name}: ${status.detail}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            stateTextClass[status.state],
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              stateDotClass[status.state],
            )}
          />
          {status.label}
        </span>
      ))}
    </div>
  );
}

/** Favicon-or-logo identity mark with a neutral fallback. */
export function SiteIdentityMark({
  site,
  size = 28,
  className,
}: {
  site: Pick<MarketingSite, "favicon_url" | "logo_url" | "name">;
  size?: number;
  className?: string;
}) {
  const src = site.favicon_url || site.logo_url;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // Site identity marks are the site's own public URLs, not our media.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Globe2
          className="text-muted-foreground/50"
          style={{ width: size * 0.55, height: size * 0.55 }}
        />
      )}
    </span>
  );
}
