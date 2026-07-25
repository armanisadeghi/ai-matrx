"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SocialCard — the canonical "how this link renders when shared" visual.
 *
 * One platform-faithful preview card per social platform:
 *   - "x"        — X/Twitter. `cardType` decides large (image + overlay title)
 *                  vs small summary (thumbnail row).
 *   - "facebook" — image on top, gray meta band (UPPERCASE domain, title,
 *                  one-line description).
 *   - "linkedin" — image on top, white band with title + domain.
 *
 * Purely presentational + self-contained image error handling. The image is
 * the brand's own public URL (never our storage) — a raw img with a loud
 * broken state is correct here.
 */
export type SocialPlatform = "x" | "facebook" | "linkedin";

export interface SocialCardProps {
  platform: SocialPlatform;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  /** Bare host shown as the source line (e.g. "aimatrx.com"). */
  domain?: string | null;
  /** twitter:card value — only affects the "x" platform (summary = small). */
  cardType?: string | null;
  className?: string;
}

export function parseSocialDomain(url?: string | null): string {
  if (!url) return "example.com";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return url;
  }
}

function CardImage({
  image,
  alt,
  aspectClass,
  roundedClass,
  onBrokenChange,
}: {
  image: string | null | undefined;
  alt: string;
  aspectClass: string;
  roundedClass?: string;
  onBrokenChange?: (broken: boolean) => void;
}) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={alt}
        className={cn("w-full bg-muted/40 object-cover", aspectClass, roundedClass)}
        onError={() => {
          setBroken(true);
          onBrokenChange?.(true);
        }}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center gap-2 bg-muted/40 text-xs text-muted-foreground",
        aspectClass,
        roundedClass,
      )}
    >
      <ImageOff className="h-4 w-4" />
      {image ? "Image failed to load" : "No share image"}
    </div>
  );
}

export function SocialCard({
  platform,
  title,
  description,
  image,
  domain,
  cardType,
  className,
}: SocialCardProps) {
  const host = domain || "example.com";
  const shownTitle = title?.trim() || "No social title";
  const shownDescription = description?.trim() || "";

  if (platform === "x") {
    const small = cardType === "summary";
    if (small) {
      return (
        <div
          className={cn(
            "flex overflow-hidden rounded-2xl border border-border bg-background",
            className,
          )}
        >
          <div className="w-[96px] shrink-0 border-r border-border sm:w-[120px]">
            <CardImage
              image={image}
              alt={shownTitle}
              aspectClass="aspect-square h-full"
            />
          </div>
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <p className="truncate text-xs text-muted-foreground">{host}</p>
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
              {shownTitle}
            </p>
            {shownDescription ? (
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {shownDescription}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <div className={cn("min-w-0", className)}>
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <CardImage image={image} alt={shownTitle} aspectClass="aspect-[1.91/1]" />
          <span className="absolute bottom-2 left-2 max-w-[85%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            {shownTitle}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">From {host}</p>
      </div>
    );
  }

  if (platform === "facebook") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-md border border-border bg-background",
          className,
        )}
      >
        <CardImage image={image} alt={shownTitle} aspectClass="aspect-[1.91/1]" />
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {host}
          </p>
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
            {shownTitle}
          </p>
          {shownDescription ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {shownDescription}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // linkedin
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background shadow-sm",
        className,
      )}
    >
      <CardImage image={image} alt={shownTitle} aspectClass="aspect-[1.91/1]" />
      <div className="px-3 py-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
          {shownTitle}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{host}</p>
      </div>
    </div>
  );
}
