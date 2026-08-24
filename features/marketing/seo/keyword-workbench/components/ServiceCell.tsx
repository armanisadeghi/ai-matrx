"use client";

/**
 * THE OFFERING CELL — "the first thing I wanna know is what service they map
 * to" (Arman, 2026-08-24).
 *
 * The cell IS the control, the same doctrine as `ClassCell`: click the value
 * you are reading and place the keyword, one gesture, no dialog. It shows the
 * offering by NAME with its root beside it, because "Data Destruction Services"
 * only means something once you can see it sits under ITAD; and where the
 * worth is inherited from an ancestor it still shows the offering itself, with
 * the ancestor named in the tooltip — never a blank, and never a keyword whose
 * placement looks like no placement.
 *
 * Unplaced reads "Not placed yet". A dash would be a shrug; that sentence is
 * an invitation, and it is also the exact thing the Offering filter can select.
 */

import { Filter } from "lucide-react";

import { cn } from "@/styles/themes/utils";
import type { KeywordServicePlacement } from "../data";
import type { SiteServices } from "../hooks/useSiteServices";
import { OfferingPicker, OFFERING_UNPLACED } from "./OfferingPicker";

/** Whose ruling this is, in words a non-technical reader can act on. */
function sourceHint(assignedBy: string | null): string | null {
  if (!assignedBy) return null;
  if (assignedBy === "human") return null; // yours — no badge needed
  if (assignedBy === "agent") return "AI";
  return "AI"; // a model token (`topicassign-v1`) is still the machine
}

export function ServiceCell({
  siteId,
  services,
  placement,
  disabled,
  onPlace,
  onFilter,
}: {
  siteId: string;
  services: SiteServices;
  placement: KeywordServicePlacement | undefined;
  disabled?: boolean;
  /** `null` takes the keyword off the tree. */
  onPlace: (topicId: string | null) => void;
  /** Show everything that maps to this offering — the pattern-spotting door. */
  onFilter?: (topicId: string) => void;
}) {
  const hint = sourceHint(placement?.assignedBy ?? null);
  const title = placement
    ? [
        placement.lineage
          ? `${placement.lineage} › ${placement.topicName}`
          : placement.topicName,
        placement.rootType
          ? `Root: ${placement.rootName}`
          : null,
        placement.hasOwnWorth
          ? "This offering carries this site's own worth ruling."
          : placement.worthFromName
            ? `Worth inherited from ${placement.worthFromName}.`
            : "No worth ruling on this branch yet — it uses the default.",
        placement.notes ? `Why: ${placement.notes}` : null,
        hint ? "Placed by AI — change it and it becomes your ruling." : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Not placed on any offering yet. Click to place it.";

  return (
    <span className="group/cell flex min-w-0 items-center gap-1" title={title}>
      <OfferingPicker
        siteId={siteId}
        services={services}
        value={placement?.topicId ?? null}
        onSelect={(next) =>
          onPlace(next === OFFERING_UNPLACED ? null : next)
        }
        disabled={disabled}
        unplacedLabel={placement ? "Take it off the tree" : undefined}
        placeholder="Not placed yet"
        ariaLabel="Offering this keyword maps to"
        className="h-auto min-h-6 border-0 px-1 py-0.5 shadow-none hover:bg-accent"
        renderSelected={
          placement ? (
            // TWO LINES, deliberately: the offering is the first thing Arman
            // reads, and three pieces of text on one line truncated all three
            // to "Data Dest… IT Asset Di… AI". The name gets the width; the
            // root sits under it in the size of a footnote.
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="flex min-w-0 max-w-full items-baseline gap-1">
                <span className="min-w-0 truncate text-[11px] text-foreground">
                  {placement.topicName}
                </span>
                {hint ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {hint}
                  </span>
                ) : null}
              </span>
              {placement.rootName && placement.rootName !== placement.topicName ? (
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
          aria-label={`Show everything that maps to ${placement.topicName}`}
          title={`Show everything that maps to ${placement.topicName}`}
          onClick={() => onFilter(placement.topicId)}
          className={cn(
            "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity",
            "hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/cell:opacity-100",
          )}
        >
          <Filter className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
