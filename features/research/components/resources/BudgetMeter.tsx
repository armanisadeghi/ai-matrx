"use client";

/**
 * BUDGET METER — "will this fit, and what does it cost?" before anything runs.
 *
 * Every number here is an ESTIMATE and says so. It is derived from measured
 * character counts through the one shared estimator (`lib/tokens/estimate.ts`),
 * which is also what the resolver truncates with — so the bar a user reads and
 * the cut the run makes are the same arithmetic.
 *
 * Over budget is stated in plain language, never a red bar with no explanation:
 * the user needs to know WHAT will be dropped, which is why the per-kind
 * breakdown sits directly underneath.
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatChars, formatTokens } from "@/lib/tokens/estimate";
import { kindDef } from "../../resources/catalog";
import type { ResourceKey } from "../../resources/types";

interface BudgetMeterProps {
  chars: number;
  tokens: number;
  budgetTokens: number | null;
  onBudgetChange: (tokens: number | null) => void;
  perKind: Array<{ kind: ResourceKey; items: number; chars: number; tokens: number }>;
}

export function BudgetMeter({
  chars,
  tokens,
  budgetTokens,
  onBudgetChange,
  perKind,
}: BudgetMeterProps) {
  const pct = budgetTokens ? Math.min(100, (tokens / budgetTokens) * 100) : 0;
  const over = budgetTokens !== null && tokens > budgetTokens;
  const contributing = perKind.filter((k) => k.items > 0).sort((a, b) => b.tokens - a.tokens);

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
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Budget
          <input
            type="number"
            min={0}
            step={10_000}
            value={budgetTokens ?? ""}
            placeholder="none"
            onChange={(e) =>
              onBudgetChange(e.target.value ? Number(e.target.value) : null)
            }
            className="h-6 w-24 rounded border border-border/60 bg-transparent px-1.5 text-[11px] tabular-nums text-foreground"
          />
        </label>
      </div>

      {budgetTokens !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${over ? 100 : pct}%` }}
          />
        </div>
      )}

      {over && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            Over the {formatTokens(budgetTokens)} budget. Resources are kept in
            the order below and the rest are dropped — the run reports exactly
            what was cut. Trim a selection or raise the budget to send it all.
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
