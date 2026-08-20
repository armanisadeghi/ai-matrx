"use client";

/**
 * Shared visual primitives for the search kind family — the convergence of
 * the platform's best search renderers (Inventory Law survey, 2026-08-20):
 * URL/domain/favicon/site-name/breadcrumb/date logic comes from the canonical
 * `parseSearch.ts` (tool-call-visualization search renderer — never
 * re-implemented), and the favicon fallback uses the 3-stage pattern from
 * `features/research/components/results/SourceFavicon.tsx` (source-supplied
 * icon → Google favicon service → Globe).
 *
 * Provider thumbnails/favicons are EXTERNAL media (not ours): a plain <img>
 * with an onError fallback is the correct treatment (media-durability law
 * applies to OUR files only).
 */

import React, { useState } from "react";
import { Globe, Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFaviconUrl,
  getBreadcrumbParts,
} from "@/features/tool-call-visualization/renderers/search/parseSearch";

/**
 * 3-stage favicon: explicit provider-supplied icon URL → Google favicon
 * service (derived from the result URL) → Globe. Never a broken image.
 */
export const SearchFavicon: React.FC<{
  /** Provider-supplied icon URL (favicon / source_logo), when it sent one. */
  iconUrl?: string | null;
  /** The result URL — feeds the favicon-service fallback. */
  url?: string | null;
  className?: string;
}> = ({ iconUrl, url, className }) => {
  const serviceUrl = url ? getFaviconUrl(url, 64) : "";
  // Providers stream: the URLs can arrive/change after first mount, so the
  // failure record is keyed to the inputs and reset during render when they
  // change (the sanctioned adjust-state-on-prop-change pattern — no effect).
  const key = `${iconUrl ?? ""}|${serviceUrl}`;
  const [failed, setFailed] = useState({ key, icon: false, service: false });
  if (failed.key !== key) {
    setFailed({ key, icon: false, service: false });
  }

  const stage: 0 | 1 | 2 =
    iconUrl && !failed.icon ? 0 : serviceUrl && !failed.service ? 1 : 2;
  const src = stage === 0 ? iconUrl : stage === 1 ? serviceUrl : null;
  if (!src) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        <Globe className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
     
    <img
      src={src}
      alt=""
      loading="lazy"
      className={cn("object-contain", className)}
      onError={() =>
        setFailed((f) =>
          stage === 0 ? { ...f, icon: true } : { ...f, service: true },
        )
      }
    />
  );
};

/** Google-style `origin › segment › segment` line. */
export const BreadcrumbLine: React.FC<{
  url?: string | null;
  /** Provider's own "site › path" display form — preferred verbatim. */
  displayedUrl?: string | null;
  className?: string;
}> = ({ url, displayedUrl, className }) => {
  if (displayedUrl) {
    return (
      <div className={cn("truncate text-xs text-muted-foreground", className)}>
        {displayedUrl}
      </div>
    );
  }
  if (!url) return null;
  const { origin, segments } = getBreadcrumbParts(url);
  return (
    <div className={cn("truncate text-xs text-muted-foreground", className)}>
      <span className="text-success">{origin}</span>
      {segments.map((segment, i) => (
        <span key={i}>
          <span className="mx-1 opacity-60">›</span>
          {segment}
        </span>
      ))}
    </div>
  );
};

/**
 * THE canonical inline renderer for the `rating` primitive kind — stars
 * scaled to `best_possible`, the numeric value, and the review count.
 * `RatingBlock` (standalone dispatch) and every parent kind (web_result,
 * local_place, entity_card) compose this one component.
 */
export const RatingStars: React.FC<{
  value: number;
  bestPossible?: number | null;
  count?: number | null;
  className?: string;
}> = ({ value, bestPossible, count, className }) => {
  const scale = bestPossible && bestPossible > 0 ? bestPossible : 5;
  const onFive = Math.max(0, Math.min(5, (value / scale) * 5));
  const full = Math.floor(onFive + 0.25);
  const half = onFive - full >= 0.25;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", className)}
      title={`${value} / ${scale}`}
    >
      <span className="inline-flex text-warning" aria-hidden>
        {Array.from({ length: 5 }, (_, i) =>
          i < full ? (
            <Star key={i} className="h-3.5 w-3.5 fill-current" />
          ) : i === full && half ? (
            <StarHalf key={i} className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Star key={i} className="h-3.5 w-3.5 opacity-25" />
          ),
        )}
      </span>
      <span className="font-medium text-foreground">
        {Number.isInteger(value) ? value : value.toFixed(1)}
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="text-muted-foreground">
          ({Intl.NumberFormat().format(count)})
        </span>
      )}
    </span>
  );
};

/** Small muted chip (tags, categories, related searches). */
export const SearchChip: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <span
    className={cn(
      "inline-flex max-w-full items-center truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground",
      className,
    )}
  >
    {children}
  </span>
);

/** Section heading inside the collection. */
export const SectionHeading: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}> = ({ icon: Icon, label, count }) => (
  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    <Icon className="h-3.5 w-3.5" />
    <span>{label}</span>
    {typeof count === "number" && count > 0 && (
      <span className="rounded-full bg-muted px-1.5 text-[10px]">{count}</span>
    )}
  </div>
);
