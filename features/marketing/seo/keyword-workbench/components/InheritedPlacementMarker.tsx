"use client";

/**
 * THE INHERITED-PLACEMENT MARKER — who decided this keyword's Offering, and
 * how to take it over.
 *
 * Almost every placement on screen was decided ABOVE the person reading it
 * (15,008 rows at the platform tier against 1 site's own ruling, live
 * 2026-09-12), and until now nothing said so: a platform default and a ruling
 * this site made itself looked identical, so a user could not tell what was
 * safe to change or why an Offering looked wrong.
 *
 * PRESENTATION is Arman's standing ruling, said of the same kind of field
 * (2026-08-25): "The 'Why this tier' is good information, but it's completely
 * useless when in a table… have that as a little tiny (i) symbol." So this is
 * NOT a column of tier badges. It is one muted glyph beside the value, and
 * only where the value is inherited — a site's own placement is the normal
 * case and wears nothing. Same form as `WhyScoreHint`, the (i) this feature
 * already uses for the value receipt; Linear and Notion mark an inherited or
 * overridden value the same way, with the explanation one click away rather
 * than spent on every row.
 *
 * NO DEAD ENDS: the explanation ends in the action. "Make it this site's own"
 * writes this same Offering at `scope_tier='site'` through
 * `setKeywordService` — THE one placement write, the same call the opt-in diff
 * queue's "Keep mine" makes — so the site owns the ruling and higher tiers
 * stop deciding for it. Changing to a different Offering through the picker
 * beside this marker does exactly the same thing.
 */

import { useState } from "react";
import { Info, Loader2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import type { KeywordServicePlacement } from "../data";
import {
  SCOPE_TIER_HEADLINE,
  SCOPE_TIER_MEANING,
  SCOPE_TIER_SOURCE,
  isInheritedTier,
} from "../scope-tiers";

export function InheritedPlacementMarker({
  placement,
  onAdopt,
  disabled,
  className,
}: {
  placement: KeywordServicePlacement;
  /**
   * Take the inherited ruling over for this site. The caller already owns the
   * one placement write (its `onPlace`), so this never opens a second door —
   * it hands back the SAME topic, which is what "make it mine" means.
   */
  onAdopt?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const tier = placement.scopeTier;

  // A site's own ruling is the case the user expects — it earns no decoration.
  // An unknown rung says nothing rather than naming the wrong decision-maker.
  if (!isInheritedTier(tier)) return null;

  const source = SCOPE_TIER_SOURCE[tier];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${placement.topicName} was placed by ${source} — see why`}
          title={`Placed by ${source} — click to see why and to take it over`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded",
            "text-muted-foreground/70 transition-colors hover:text-foreground",
            className,
          )}
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[20rem] max-w-[90vw] p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold text-foreground">
          {SCOPE_TIER_HEADLINE[tier]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {placement.topicName}
          </span>{" "}
          is what {source} says &ldquo;this keyword&rdquo; is about. This site
          has never ruled on it.
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {SCOPE_TIER_MEANING[tier]}
        </p>
        {placement.notes ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Why: {placement.notes}
          </p>
        ) : null}
        {onAdopt ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="mt-2.5 h-7 w-full gap-1.5 text-xs"
              disabled={disabled || adopting}
              onClick={() => {
                setAdopting(true);
                try {
                  onAdopt();
                } finally {
                  setAdopting(false);
                  setOpen(false);
                }
              }}
            >
              {adopting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Make it this site&rsquo;s own
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Keeps the same Offering and writes it as this site&rsquo;s
              ruling, so later changes by {source} stop reaching this keyword.
              Picking a different Offering beside this does the same thing.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Pick a different Offering beside this to make the ruling this
            site&rsquo;s own.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
