"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ConnectorDefinition } from "./types";

/** Narrower than this, a loaded icon is a placeholder or an unreadable favicon. */
const MIN_LEGIBLE_ICON_PX = 32;

/**
 * A placeholder globe or a 16px favicon "loads" fine and still reads as no
 * logo: a RASTER narrower than the floor is treated as missing. Vector artwork
 * is exempt — an SVG reports its declared width (often 24), not its quality.
 */
function isIllegibleRaster(image: HTMLImageElement, url: string): boolean {
  const vector = /\.svg(?:$|[?#])/i.test(url) || url.includes("cdn.simpleicons.org");
  return !vector && image.naturalWidth > 0 && image.naturalWidth < MIN_LEGIBLE_ICON_PX;
}

interface ConnectorMarkProps {
  connector: ConnectorDefinition;
  className?: string;
  colored?: boolean;
}

/**
 * One artwork renderer for every connector surface. MCP providers use the
 * catalogue's real brand asset; first-party providers use their local SVG.
 */
export function ConnectorMark({
  connector,
  className,
  colored = true,
}: ConnectorMarkProps) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const skip = (url: string) =>
    setFailedUrls((current) => (current.includes(url) ? current : [...current, url]));
  const iconUrl = [connector.iconUrl, ...(connector.fallbackIconUrls ?? [])]
    .map((url) => url?.trim())
    .find(
      (url): url is string =>
        typeof url === "string" && url.length > 0 && !failedUrls.includes(url),
    );

  if (iconUrl) {
    return (
      <img
        key={iconUrl}
        src={iconUrl}
        alt=""
        aria-hidden
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          "shrink-0 object-contain",
          !colored && "grayscale opacity-70",
          className,
        )}
        onError={() => skip(iconUrl)}
        onLoad={(event) => {
          if (isIllegibleRaster(event.currentTarget, iconUrl)) skip(iconUrl);
        }}
        // An image that failed (or loaded) before hydration never fires its
        // handler, which left a broken-image glyph on server-rendered pages:
        // judge an already-settled image the moment it mounts.
        // `decode()` rejects only for a broken image — an SVG sized in `em`
        // reports naturalWidth 0 and is still perfectly good artwork.
        ref={(element) => {
          if (!element || !element.complete) return;
          element.decode().then(
            () => {
              if (isIllegibleRaster(element, iconUrl)) skip(iconUrl);
            },
            () => skip(iconUrl),
          );
        }}
      />
    );
  }

  if (connector.logo) {
    const Logo = connector.logo;
    return <Logo colored={colored} className={className} />;
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm bg-primary text-[0.55rem] font-semibold leading-none text-primary-foreground",
        !colored && "grayscale opacity-70",
        className,
      )}
      style={
        connector.brandColor
          ? { backgroundColor: connector.brandColor }
          : undefined
      }
    >
      {connector.name.charAt(0).toLocaleUpperCase()}
    </span>
  );
}

const TILE_SIZES = {
  xs: { plate: "h-6 w-6 rounded-full p-1", mark: "h-4 w-4" },
  sm: { plate: "h-8 w-8 rounded-lg p-1.5", mark: "h-5 w-5" },
  md: { plate: "h-11 w-11 rounded-xl p-2", mark: "h-7 w-7" },
  lg: { plate: "h-12 w-12 rounded-xl p-2", mark: "h-8 w-8" },
} as const;

/**
 * A PROVIDER'S MARK ON ITS OWN PLATE — the one way a brand logo sits on a
 * card, row or chip. The plate is white in BOTH themes, like an app icon:
 * brand artwork is drawn for light backgrounds, and GitHub's, Notion's or
 * Vercel's black marks vanish on a dark tile. A hairline ring keeps the plate
 * from melting into a light card.
 */
export function ConnectorTile({
  connector,
  size = "md",
  colored = true,
  className,
}: {
  connector: ConnectorDefinition;
  size?: keyof typeof TILE_SIZES;
  colored?: boolean;
  className?: string;
}) {
  const geometry = TILE_SIZES[size];
  return (
    <span
      className={cn(
        // ui-exception: brand plate — artwork needs a light ground in both themes.
        "flex shrink-0 items-center justify-center bg-white text-black/75 shadow-xs ring-1 ring-black/10 dark:ring-white/15",
        geometry.plate,
        className,
      )}
    >
      <ConnectorMark
        connector={connector}
        colored={colored}
        className={cn("rounded-sm object-contain", geometry.mark)}
      />
    </span>
  );
}
