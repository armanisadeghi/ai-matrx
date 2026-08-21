"use client";

/**
 * The receipt — every keyword's value rendered as an itemized bill. This is
 * the load-bearing promise of the whole system: a tier without its why never
 * renders. Each reason line carries a plain-English sentence and, where it
 * applies, the arithmetic it contributed.
 */

import { Gavel, HelpCircle, Sigma } from "lucide-react";
import type { ValueBandDef, ValueReason, ValueSource } from "../../types";
import { bandColorClasses, bandLabel, reasonMath, reasonSentence } from "./lib";

export function ReasonReceipt({
  reasons,
  band,
  score,
  source,
  vocab,
  dense = false,
}: {
  reasons: ValueReason[];
  band: string;
  score: number | null;
  source: ValueSource;
  vocab: ValueBandDef[];
  dense?: boolean;
}) {
  const color = bandColorClasses(band, vocab);

  if (source === "unvalued" || reasons.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 p-3">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nothing you&apos;ve told the system applies to this keyword yet — no topic
          worth reaches it and none of your rules match. It stays honestly{" "}
          <span className="font-medium text-foreground">Unvalued</span> until you
          rule on it or give its topic a worth.
        </p>
      </div>
    );
  }

  return (
    <div className={dense ? "space-y-1.5" : "space-y-2"}>
      <ol className="space-y-1.5">
        {reasons.map((r, i) => {
          const math = reasonMath(r);
          return (
            <li key={i} className="flex items-baseline gap-2.5 text-sm">
              {r.kind === "override" ? (
                <Gavel className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-primary" />
              ) : (
                <span className="w-3.5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {i + 1}.
                </span>
              )}
              <span className="min-w-0 flex-1 text-foreground/90">
                {reasonSentence(r)}
              </span>
              {math && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {math}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2.5 border-t border-border pt-2 text-sm">
        <Sigma className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          {source === "override" ? "Your ruling" : "Adds up to"}
        </span>
        {score !== null && source !== "override" && (
          <span className="font-mono text-xs text-muted-foreground">
            score {Math.round(score * 10) / 10}
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${color.chip}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${color.swatch}`} />
          {bandLabel(band, vocab)}
        </span>
      </div>
    </div>
  );
}
