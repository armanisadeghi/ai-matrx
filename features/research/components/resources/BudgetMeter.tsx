"use client";

/**
 * BUDGET METER — "will this fit, what does it cost, and what gets left out?"
 *
 * Every number is an ESTIMATE and says so. It comes from measured character
 * counts through the one shared estimator (`lib/tokens/estimate.ts`), which is
 * also what the resolver truncates with — so the bar you read and the cut the
 * run makes are the same arithmetic.
 *
 * THE RULE THIS COMPONENT EXISTS TO ENFORCE: a budget that silently eats part
 * of a selection is worse than no budget. So the ceiling is labelled (not a
 * bare number in a box), it explains where the default came from, and when it
 * bites it names exactly which resources lose how many items — BEFORE the run,
 * not in a post-hoc report nobody reads.
 */

import { AlertTriangle, Info, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatChars, formatTokens } from "@/lib/tokens/estimate";
import { kindDef } from "../../resources/catalog";
import type { PreviewKind } from "../../resources/resolve";

/** The default ceiling, named so the UI can explain itself rather than
 *  presenting an unexplained number the user has to reverse-engineer. */
export const DEFAULT_BUDGET_TOKENS = 120_000;

interface BudgetMeterProps {
  chars: number;
  tokens: number;
  budgetTokens: number | null;
  onBudgetChange: (tokens: number | null) => void;
  perKind: PreviewKind[];
  droppedByBudget: number;
}

export function BudgetMeter({
  chars,
  tokens,
  budgetTokens,
  onBudgetChange,
  perKind,
  droppedByBudget,
}: BudgetMeterProps) {
  const pct = budgetTokens ? Math.min(100, (tokens / budgetTokens) * 100) : 0;
  const over = budgetTokens !== null && tokens > budgetTokens;
  const contributing = perKind
    .filter((k) => k.items > 0 || k.droppedByBudget > 0)
    .sort((a, b) => b.tokens - a.tokens);
  const losers = perKind.filter((k) => k.droppedByBudget > 0);
  const isDefault = budgetTokens === DEFAULT_BUDGET_TOKENS;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-lg font-semibold tabular-nums text-foreground leading-none">
            ~{formatTokens(tokens)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            estimated tokens · {formatChars(chars)} characters
          </div>
        </div>
        <div className="text-right">
          <label className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            Token budget
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 opacity-70" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                The ceiling for everything sent in one run. Resources are kept
                in the order below and anything past the ceiling is dropped —
                you will see exactly what, here, before you run. Clear the box
                to send everything with no cap.
                {isDefault && (
                  <span className="mt-1 block opacity-80">
                    {formatTokens(DEFAULT_BUDGET_TOKENS)} is this app&apos;s
                    default, not a model limit.
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
            <input
              type="number"
              min={0}
              step={10_000}
              value={budgetTokens ?? ""}
              placeholder="no cap"
              onChange={(e) =>
                onBudgetChange(e.target.value ? Number(e.target.value) : null)
              }
              className="h-6 w-24 rounded border border-border/60 bg-transparent px-1.5 text-[11px] tabular-nums text-foreground"
            />
          </label>
          {isDefault && (
            <div className="pt-0.5 text-[9px] text-muted-foreground/80">
              app default
            </div>
          )}
        </div>
      </div>

      {budgetTokens !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over || droppedByBudget > 0 ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${over ? 100 : pct}%` }}
          />
        </div>
      )}

      {/* The loud, specific, PRE-RUN answer to "what am I losing?" */}
      {droppedByBudget > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.08] px-2 py-1.5 text-left text-[11px] text-amber-700 hover:bg-amber-500/[0.14] dark:text-amber-400"
            >
              <Scissors className="mt-px h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                <span className="font-medium">
                  {droppedByBudget} item{droppedByBudget === 1 ? "" : "s"} will
                  NOT be sent
                </span>{" "}
                — the budget cuts them. Click to see which.
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2">
            <div className="text-xs font-medium text-foreground">
              Dropped by the {formatTokens(budgetTokens ?? 0)} budget
            </div>
            <div className="space-y-1">
              {losers.map((k) => (
                <div
                  key={k.kind}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-muted-foreground">
                    {kindDef(k.kind)?.label ?? k.kind}
                  </span>
                  <span className="shrink-0 tabular-nums text-amber-700 dark:text-amber-400">
                    −{k.droppedByBudget} of {k.items + k.droppedByBudget}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Resources are kept in the order shown in the breakdown, so earlier
              ones survive. Raise the budget, or narrow a selection (Top N, a
              tighter filter) to choose what stays.
            </p>
          </PopoverContent>
        </Popover>
      )}

      {over && droppedByBudget === 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            One resource is larger than the whole {formatTokens(budgetTokens ?? 0)}{" "}
            budget. It is still sent — the run is never left empty — so the
            request will exceed the ceiling.
          </span>
        </div>
      )}

      {contributing.length > 0 && (
        <div className="space-y-0.5 pt-0.5">
          {contributing.map((k) => {
            const def = kindDef(k.kind);
            const share = tokens > 0 ? (k.tokens / tokens) * 100 : 0;
            return (
              <div key={k.kind} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                  {def?.label ?? k.kind}
                </span>
                {k.droppedByBudget > 0 && (
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 border-amber-500/40 px-1 text-[9px] text-amber-700 dark:text-amber-400"
                  >
                    −{k.droppedByBudget}
                  </Badge>
                )}
                <span className="tabular-nums text-muted-foreground/80">
                  {k.items}
                </span>
                <div className="hidden sm:block h-1 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/50"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <span className="w-14 text-right tabular-nums font-medium text-foreground/90">
                  {formatTokens(k.tokens)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {contributing.length === 0 && (
        <div className="text-[11px] text-muted-foreground">
          Nothing selected yet.
        </div>
      )}
    </div>
  );
}
