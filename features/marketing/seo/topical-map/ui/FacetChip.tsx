"use client";

/**
 * features/marketing/seo/topical-map/ui/FacetChip.tsx — one facet value on a topic.
 *
 * INHERITED IS DRAWN DIFFERENTLY, ALWAYS. A facet a topic carries itself and a
 * facet it inherited from an ancestor look identical in the data and mean
 * completely different things to the person editing the map: clearing the first
 * is an edit to this topic, clearing the second is impossible from here. So an
 * inherited chip is dashed, says where it came from, and never offers a clear
 * control even when the host passed one.
 */

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FacetChipProps {
  facetKey: string;
  valueSlug: string;
  inherited?: boolean;
  /** The ancestor the value came from. Shown on an inherited chip. */
  fromSlug?: string;
  onClear?: () => void;
}

export function FacetChip({
  facetKey,
  valueSlug,
  inherited,
  fromSlug,
  onClear,
}: FacetChipProps) {
  const title = inherited
    ? `${facetKey}: ${valueSlug} — inherited${fromSlug ? ` from ${fromSlug}` : ""}, change it on the topic that sets it`
    : `${facetKey}: ${valueSlug}`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] leading-none",
        inherited
          ? "border-dashed border-border text-muted-foreground"
          : "border-border bg-muted/60 text-foreground",
      )}
    >
      <span className="opacity-70">{facetKey}</span>
      <span>{valueSlug}</span>
      {onClear && !inherited ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${facetKey}`}
          className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
