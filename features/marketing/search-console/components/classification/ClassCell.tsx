"use client";

/**
 * The class cell — THE ruling control. The class chip itself is the
 * dropdown trigger (Linear-style property cell): click it, pick a class,
 * done. Scales with the class vocabulary (`GSC_TRAFFIC_CLASSES` drives the
 * menu — adding a class needs zero changes here) instead of a fixed button
 * row. Mismatch routes through the notes dialog upstream (a ruling must
 * carry its case); "Clear ruling" appears for any site-value row, including
 * legacy semantic-column rulings.
 *
 * Unconfirmed automatic rulings (rule auto-apply, imports the user never
 * eyeballed) render with a warning ring until confirmed — Arman's rule:
 * anything applied off-screen carries a visible flag until a human looks.
 *
 * P23 + P11 — the traffic classes are the ONE shared vocabulary every business,
 * every report and every model reads the same way (the GSC traffic-class
 * doctrine: never fork a second mapping), so this menu genuinely cannot take a
 * new one. That is not a licence to be a dead end: it SAYS why, and offers the
 * way forward — your own dimension, with your own values, on the same keywords.
 */

import { ChevronDown, Eraser, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/styles/themes/utils";
import type { GscClassRuling } from "@/features/marketing/search-console/data-classification";
import type { GscTrafficClass } from "@/features/marketing/search-console/types";
import { GSC_TRAFFIC_CLASSES } from "@/features/marketing/search-console/types";

export function ClassCell({
  trafficClass,
  classSource,
  confirmed,
  disabled,
  onRule,
  onAddOwnDimension,
}: {
  trafficClass: string | null;
  classSource: string | null;
  /** False only for automatic rulings a human has not yet eyeballed. */
  confirmed: boolean;
  disabled?: boolean;
  onRule: (ruling: GscClassRuling) => void;
  /** P11 door: the classes are shared, so offer a dimension of their own. */
  onAddOwnDimension?: () => void;
}) {
  const meta = GSC_TRAFFIC_CLASSES.find((c) => c.key === trafficClass);
  const isRuled = classSource === "site_value";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "group/class inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
            "border-border bg-card hover:border-primary/50 hover:bg-accent",
            meta?.tone ?? "text-muted-foreground",
            isRuled && !confirmed &&
              "border-warning/60 bg-warning/10 ring-1 ring-warning/40",
          )}
          title={
            isRuled && !confirmed
              ? `${meta?.description ?? ""}\nApplied automatically — not yet confirmed by a human. Pick a class (or the same one) to confirm.`
              : (meta?.description ?? "Click to classify")
          }
          aria-label={`Traffic class: ${meta?.label ?? "unclassified"}. Click to change.`}
        >
          {meta?.label ?? "—"}
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/class:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {GSC_TRAFFIC_CLASSES.filter((c) => c.key !== "unclassified").map(
          (c) => (
            <DropdownMenuItem
              key={c.key}
              className="flex flex-col items-start gap-0.5 py-1.5"
              onSelect={() => onRule(c.key as Exclude<GscTrafficClass, "unclassified">)}
            >
              <span className={cn("text-xs font-medium", c.tone)}>
                {c.label}
                {trafficClass === c.key && isRuled ? (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    (current ruling{confirmed ? "" : ", unconfirmed"})
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] leading-snug text-muted-foreground">
                {c.description}
              </span>
            </DropdownMenuItem>
          ),
        )}
        {onAddOwnDimension ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex-col items-start gap-0.5 py-1.5"
              onSelect={onAddOwnDimension}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Plus className="h-3.5 w-3.5" />
                None of these? Make it your own dimension
              </span>
              <span className="text-[10px] leading-snug text-muted-foreground">
                These four classes are shared by every business, so they are
                platform-governed. Your own dimension is yours to name and fill.
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
        {isRuled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-1.5 text-xs text-muted-foreground"
              onSelect={() => onRule("clear")}
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear ruling — let machine classification decide
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
