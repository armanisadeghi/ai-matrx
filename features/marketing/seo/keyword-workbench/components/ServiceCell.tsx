"use client";

/**
 * THE OFFERING CELL — "the first thing I wanna know is what service they map
 * to" (Arman, 2026-08-24).
 *
 * The cell IS the control, the same doctrine as `ClassCell`: click the value
 * you are reading and place the keyword, one gesture, no dialog. It shows the
 * offering by NAME with its root beside it, because "Data Destruction Services"
 * only means something once you can see it sits under ITAD; where the worth is
 * inherited from an ancestor offering it still shows the offering itself, with
 * the ancestor named in the tooltip.
 *
 * Every placement shown is THIS site's own (`seo.site_keyword_offering`) — there
 * is no inherited rung to disclose (brand-offerings cutover D4, D10). What the
 * cell still says is whether a person or the AI placed it.
 *
 * Unplaced reads "Not placed yet". A dash would be a shrug; that sentence is
 * an invitation, and it is also the exact thing the Offering filter can select.
 */

import { Filter } from "lucide-react";

import { cn } from "@/styles/themes/utils";
import type { KeywordOfferingPlacement } from "../data";
import type { SiteOfferings } from "../hooks/useSiteOfferings";
import { OfferingPicker, OFFERING_UNPLACED } from "./OfferingPicker";

/** Whose ruling this is, in words a non-technical reader can act on. */
function sourceHint(assignedBy: string | null): string | null {
  if (!assignedBy || assignedBy === "human") return null; // yours — no badge needed
  return "AI";
}

export function ServiceCell({
  siteId,
  offerings,
  placement,
  disabled,
  onPlace,
  onFilter,
  onNotOffered,
  triggerClassName,
  filterClassName,
}: {
  siteId: string;
  offerings: SiteOfferings;
  placement: KeywordOfferingPlacement | undefined;
  disabled?: boolean;
  /** `null` takes the keyword off every offering. */
  onPlace: (offeringId: string | null) => void;
  /** Show everything that maps to this offering — the pattern-spotting door. */
  onFilter?: (offeringId: string) => void;
  /**
   * "It isn't an offering we offer" — a traffic class, so the cell only carries
   * the door; the caller writes it through the one class path.
   */
  onNotOffered?: () => void;
  /** Responsive sizing only; the picker and write path stay canonical. */
  triggerClassName?: string;
  /** Responsive discoverability only; the filter action stays canonical. */
  filterClassName?: string;
}) {
  const hint = sourceHint(placement?.assignedBy ?? null);
  const title = placement
    ? [
        placement.lineage
          ? `${placement.lineage} › ${placement.offeringName}`
          : placement.offeringName,
        placement.rootName && placement.rootName !== placement.offeringName
          ? `Root: ${placement.rootName}`
          : null,
        placement.hasOwnWorth
          ? "This offering carries this site's own worth."
          : placement.worthFromName
            ? `Worth inherited from ${placement.worthFromName}.`
            : "No worth set on this branch yet — it counts from the baseline.",
        placement.notes ? `Why: ${placement.notes}` : null,
        hint ? "Placed by AI — change it and it becomes your ruling." : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Not placed on any offering yet. Click to place it.";

  return (
    <span
      className="group/cell flex min-w-0 items-center gap-1"
      title={title}
      onClick={(event) => event.stopPropagation()}
    >
      <OfferingPicker
        siteId={siteId}
        offerings={offerings}
        value={placement?.offeringId ?? null}
        onSelect={(next) => onPlace(next === OFFERING_UNPLACED ? null : next)}
        disabled={disabled}
        unplacedLabel={placement ? "Take it off every offering" : undefined}
        placeholder="Not placed yet"
        ariaLabel="Offering this keyword maps to"
        onNotOffered={onNotOffered}
        className={cn(
          "h-auto min-h-6 border-0 px-1 py-0.5 shadow-none hover:bg-accent",
          triggerClassName,
        )}
        renderSelected={
          placement ? (
            // TWO LINES, deliberately: the offering gets the width; the root sits
            // under it in the size of a footnote.
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="flex min-w-0 max-w-full items-baseline gap-1">
                <span className="min-w-0 truncate text-[11px] text-foreground">
                  {placement.offeringName}
                </span>
                {hint ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>
                ) : null}
              </span>
              {placement.rootName && placement.rootName !== placement.offeringName ? (
                <span className="min-w-0 max-w-full truncate text-[10px] text-muted-foreground">
                  {placement.rootName}
                </span>
              ) : null}
            </span>
          ) : undefined
        }
      />
      {onFilter && placement ? (
        <button
          type="button"
          aria-label={`Show everything that maps to ${placement.offeringName}`}
          title={`Show everything that maps to ${placement.offeringName}`}
          onClick={() => onFilter(placement.offeringId)}
          className={cn(
            "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity",
            "hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/cell:opacity-100",
            filterClassName,
          )}
        >
          <Filter className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
