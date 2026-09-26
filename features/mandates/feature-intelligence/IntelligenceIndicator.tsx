"use client";

// features/mandates/feature-intelligence/IntelligenceIndicator.tsx
//
// THE INTELLIGENCE ICON — the small mark, like an info "i", that any page or
// button running AI jobs places beside itself (Arman, 2026-09-25: "any page
// that has mandates under the hood shows it, and clicking takes you to where
// you manage them"). It opens a compact list of the jobs behind it, each one a
// door to its place on the feature's intelligence page.
//
// Minimal wiring: with no `mandateKeys` it lists what the page already
// registered through `useDeclaredSurfaceMandates` for this feature — a page
// that discloses its jobs only has to drop `<IntelligenceIndicator feature=… />`.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLiveSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { fetchMandateIdentities, type MandateIdentity } from "../service";
import { mandateDisplayName } from "../mandate-words";
import { featureIntelligenceHref, featureOfMandateKey } from "./hrefs";
import { canonicalFeature, declaredPlacesFor } from "./registry";
import { keyInFeature, shortMandateName } from "./service";
import type { IntelligenceContext } from "./types";

export interface IntelligenceIndicatorProps {
  /** The feature (mandate-key prefix). Defaults to the first key's feature. */
  feature?: string;
  /** The jobs behind this spot. Omit to use what the page registered. */
  mandateKeys?: readonly string[];
  /** Values the intelligence page's links need (`topicId`, `setId`, …). */
  context?: IntelligenceContext;
  /** What the jobs are for here, when the host has better words than "this page". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function IntelligenceIndicator({
  feature,
  mandateKeys,
  context,
  label,
  size = "sm",
  className,
}: IntelligenceIndicatorProps) {
  const live = useLiveSurfaceMandates();
  const resolvedFeature = feature
    ? canonicalFeature(feature)
    : mandateKeys?.[0] ? featureOfMandateKey(mandateKeys[0]) : null;
  const registered = mandateKeys
    ? [...mandateKeys]
    : live
        .map((ref) => ref.mandateKey as string)
        .filter((key) => (resolvedFeature ? keyInFeature(key, resolvedFeature) : true));
  // A door on a page that has not registered its jobs yet (the growth loop
  // before it starts) still lists the feature's jobs from its places map,
  // never an empty list under "the AI jobs behind this".
  const keys =
    registered.length > 0 || !resolvedFeature
      ? registered
      : [
          ...new Set(
            (declaredPlacesFor(resolvedFeature)?.places ?? []).flatMap(
              (place) => place.mandateKeys,
            ),
          ),
        ];
  const does = new Map(live.map((ref) => [ref.mandateKey as string, ref.does]));

  const [open, setOpen] = useState(false);
  const [identities, setIdentities] = useState<Record<string, MandateIdentity>>({});
  const keyList = keys.join("|");
  useEffect(() => {
    if (!open || !keyList) return;
    let cancelled = false;
    fetchMandateIdentities(keyList.split("|"))
      .then((next) => {
        if (!cancelled) setIdentities(next);
      })
      .catch((error: unknown) => {
        console.error("[intelligence-indicator] names could not be read", error);
      });
    return () => {
      cancelled = true;
    };
  }, [open, keyList]);

  if (!resolvedFeature) return null;
  const featureName =
    declaredPlacesFor(resolvedFeature)?.label ??
    resolvedFeature.charAt(0).toUpperCase() + resolvedFeature.slice(1).replace(/[_-]/g, " ");
  const pageHref = featureIntelligenceHref(resolvedFeature, { context });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label ? `Intelligence: ${label}` : `Intelligence: ${featureName}`}
              data-intelligence-indicator={resolvedFeature}
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/5 text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                size === "sm" ? "h-5 w-5" : "h-6 w-6",
                className,
              )}
            >
              <INTELLIGENCE_ICON className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Intelligence</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold text-foreground">Intelligence</p>
          <p className="text-[11.5px] text-muted-foreground">
            {label ?? "The AI jobs behind this"} — see what runs{" "}
            {keys.length === 1 ? "it" : "them"}, duplicate or use your own.
          </p>
        </div>
        {keys.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto py-1">
            {keys.map((key) => {
              const identity = identities[key];
              const name = shortMandateName(
                mandateDisplayName(key, identity?.label),
                featureName,
              );
              return (
                <li key={key}>
                  <Link
                    href={featureIntelligenceHref(resolvedFeature, { mandateKey: key, context })}
                    onClick={() => setOpen(false)}
                    className="group flex items-start gap-2 px-3 py-1.5 hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{name}</span>
                      {does.get(key) ?? identity?.description ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {does.get(key) ?? identity?.description}
                        </span>
                      ) : null}
                    </span>
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        <Link
          href={pageHref}
          onClick={() => setOpen(false)}
          className="flex items-center justify-between border-t border-border px-3 py-2 text-[12.5px] font-medium text-primary hover:bg-accent"
        >
          All {featureName.toLowerCase()} intelligence
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
