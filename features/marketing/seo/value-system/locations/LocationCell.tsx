"use client";

/**
 * THE LOCATION CELL — which branch this one keyword belongs to, on the ONE
 * keyword table.
 *
 * "It's not just about knowing that something's local. It's also about knowing
 * WHICH location that one belongs to." (P16) That answer was reachable only
 * from the Which-location panel, which meant the keyword table — the surface a
 * person actually works in — could not tell them. A fact that lives on one
 * screen is a fact nobody uses.
 *
 * THREE STATES, NEVER COLLAPSED INTO ONE DASH. A keyword that names no place,
 * a local search nothing could place, and a keyword attributed to a branch are
 * three different facts about the business, and the middle one is the whole
 * work list: those are the searches whose revenue nobody can route yet. A
 * single "—" for all three is how the gap stays invisible.
 *
 * The cell decides nothing. `seo.gsc_keyword_locations` walks the precedence
 * ladder and this renders its answer, including HOW it was decided — a claim
 * nobody can check is exactly what this product exists to replace.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import { Building2, MapPinOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/styles/themes/utils";
import { decidedByChip, explainDecidedBy, type KeywordLocationRow } from "./types";

export function LocationCell({
  /**
   * The server's row for this keyword, read with `includeUnplaced`. Absent
   * means the keyword names no place at all; present with
   * `decided_by === "unresolved"` means it names one and resolved to no
   * branch. The discriminator is the server's word, not a flag computed here.
   */
  attribution,
  /** False while the attribution read is still in flight. */
  ready,
  /** Filter the whole list to this location (or to the unresolved bucket). */
  onFilter,
}: {
  attribution: KeywordLocationRow | undefined;
  ready: boolean;
  onFilter?: (value: string) => void;
}) {
  // Waiting is not an answer. A dash rendered before the read lands reads as
  // "no location", and the reader has no way to tell it apart from the real one.
  if (!ready) {
    return <span className="text-[11px] text-muted-foreground/50">·</span>;
  }

  if (attribution && attribution.decided_by !== "unresolved") {
    const where = [attribution.locality, attribution.region]
      .filter(Boolean)
      .join(", ");
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onFilter?.(attribution.location_id)}
            className="inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-foreground transition-colors hover:bg-accent hover:text-primary"
          >
            <Building2 className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{attribution.location_name}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">
            {attribution.location_name}
            {where ? ` — ${where}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Attributed {decidedByChip(attribution.decided_by)}:{" "}
            {explainDecidedBy(
              attribution.decided_by,
              attribution.place_name,
              attribution.distance_km,
            )}
            .
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (attribution) {
    // THE WORK LIST. This search names a place and earns money somewhere, and
    // nothing in the system yet says where. Said in words, and clickable,
    // because it is the one state the reader can actually act on.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onFilter?.("unresolved")}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-colors",
              "text-warning hover:bg-warning/10",
            )}
          >
            <MapPinOff className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">No location</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-[11px]">
            {explainDecidedBy("unresolved", null, null)}. Add the branch that
            serves it, or bind the service area that caught it to one.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-[11px] text-muted-foreground">
          Not local
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-[11px]">{explainDecidedBy("not_local", null, null)}.</p>
      </TooltipContent>
    </Tooltip>
  );
}
