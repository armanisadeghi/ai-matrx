"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import type { MarketingSite } from "@/features/marketing/types";
import { secureImageUrl } from "@/features/marketing/lib/website-url";
import type { SiteConnectionState } from "@/features/marketing/lib/site-status";
import { useSiteConnectionStatuses } from "@/features/marketing/tracking/hooks";

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
 * The six big-picture connection chips (Init / GSC / GA4 / PSI / CMS / Tracking),
 * derived exclusively through `useSiteConnectionStatuses` so every surface agrees.
 *
 * 🚨 THE COMPONENT READS THE TRACKING INPUT ITSELF — there is no prop for it, so no host can
 * forget it. Three of the four hosts did (V-28 NEW-1), and on those the staleness knob's
 * failure reason was `null` by construction: an unreadable knob meant nothing was called stale
 * and nothing said so. The reads are keyed queries, so several chips over one site make one
 * request.
 *
 * 🚨 EVERY CHIP IS A CONTROL, NOT A LABEL WITH A `title` (V-29 NEW-3). The detail used to live
 * in the native `title` attribute alone, which only a mouse can reach: on the phone card — the
 * surface with no hover at all — and for anyone on a keyboard or a screen reader, the reason a
 * chip is amber could not be reached by any means. Each chip is a focusable button whose press
 * or tap opens the same words in the platform's Popover, and the `title` is kept as the mouse's
 * shortcut to the identical string. One change here covers every host, which is the point of
 * there being one chip component: SitePeekBody, the site table's Connections cell, the phone
 * card's footer and the brand workspace's site list all render THIS.
 */
export function SiteConnectionChips({
  site,
  className,
}: {
  // `domain` / `root_url` are part of the status derivation now: a Search
  // Console property is judged against the site it is bound to, so the chip
  // can say "does not match this site" instead of "Connected".
  site: Pick<
    MarketingSite,
    | "id"
    | "organization_id"
    | "initialized_at"
    | "initialization"
    | "integrations"
    | "gsc_synced_at"
    | "domain"
    | "root_url"
  >;
  className?: string;
}) {
  const statuses = useSiteConnectionStatuses(site);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {statuses.map((status) => (
        <Popover key={status.key}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={`${status.name}: ${status.detail}`}
              aria-label={`${status.name} — ${status.label}. Open the detail.`}
              // The chip lives inside rows and cards that navigate on click; opening the
              // detail must never also open the record behind it.
              onClick={(event) => {
                event.stopPropagation();
              }}
              className={cn(
                "inline-flex touch-manipulation items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-1 text-[10px] font-medium tabular-nums outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
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
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 max-w-[calc(100vw-2rem)] p-3"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <p className="text-xs font-semibold text-foreground">{status.name}</p>
            {/* The SAME words the mouse gets, as text a screen reader reads and a thumb
                reaches — never a second, shorter sentence. */}
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {status.detail}
            </p>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

/**
 * Favicon-or-logo identity mark with a neutral fallback. Small marks default
 * to favicon-first (crisp at 28px); hero-sized marks pass `prefer="logo"` so
 * the real logo wins when the brand has one. A URL that fails to load falls
 * through to the next candidate and finally the neutral globe — never a
 * blank box.
 */
export function SiteIdentityMark({
  site,
  size = 28,
  prefer = "favicon",
  className,
}: {
  site: Pick<MarketingSite, "favicon_url" | "logo_url" | "name">;
  size?: number;
  prefer?: "favicon" | "logo";
  className?: string;
}) {
  const [failed, setFailed] = useState<Record<string, true>>({});
  const ordered =
    prefer === "logo"
      ? [site.logo_url, site.favicon_url]
      : [site.favicon_url, site.logo_url];
  const src = ordered
    .filter((url): url is string => Boolean(url))
    .map((url) => secureImageUrl(url))
    .find((url) => !failed[url]);
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
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          onError={() => {
            setFailed((state) => ({ ...state, [src]: true }));
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
