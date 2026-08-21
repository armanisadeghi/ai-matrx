"use client";

/**
 * The "why" chain — a tier without its why must never render (value-system
 * SoR, law 3). Inline: a compact chain of steps. Popover: the full arithmetic
 * spelled out in plain language for a non-technical expert.
 */

import { ChevronRight, Gavel, Globe2, Network, Scale, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ValueReason, ValueSource } from "../../types";
import { fmtMultiplier, fmtScore } from "./lib";

function reasonIcon(kind: ValueReason["kind"]) {
  switch (kind) {
    case "override":
      return Gavel;
    case "topic":
      return Network;
    case "default_base":
      return Scale;
    case "rule":
      return SlidersHorizontal;
    case "geo":
      return Globe2;
  }
}

/** Plain-language sentence for one step — for the popover. */
function reasonSentence(reason: ValueReason): string {
  switch (reason.kind) {
    case "override":
      return "You (or a teammate) ruled this keyword's worth directly. An expert ruling beats every computed number.";
    case "topic":
      if (reason.negative_guard) {
        return `Its topic "${reason.topic}" is marked as something the business avoids — that guard forces Negative no matter the arithmetic.`;
      }
      return `Its topic "${reason.topic}" carries a worth of ${reason.weight} out of 100${reason.root ? ` (under the ${reason.root.replace(/_/g, " ")} root)` : ""}. That is the starting score.`;
    case "default_base":
      return `No topic worth was set, so the neutral starting score of ${reason.weight} applies.`;
    case "rule":
      return `The rule "${reason.name}" matched and multiplied the score by ${reason.multiplier}.`;
    case "geo":
      return `The searcher's location matched "${reason.area}" — your ${reason.band} area — multiplying the score by ${reason.multiplier}.`;
  }
}

function reasonShort(reason: ValueReason): string {
  switch (reason.kind) {
    case "override":
      return "expert ruling";
    case "topic":
      return reason.negative_guard ? `${reason.topic} · avoid` : `${reason.topic} ${reason.weight}`;
    case "default_base":
      return `base ${reason.weight}`;
    case "rule":
      return `${reason.name} ${fmtMultiplier(reason.multiplier)}`;
    case "geo":
      return `${reason.band} ${fmtMultiplier(reason.multiplier)}`;
  }
}

const UNVALUED_EXPLANATION =
  "No topic worth reaches this keyword and no rule fired. The system will not guess a middle tier — tell it what this keyword is worth, or give its topic a worth.";

export function ReasonChain({
  reasons,
  source,
  score,
  bandLabel,
  keyword,
}: {
  reasons: ValueReason[];
  source: ValueSource;
  score: number | null;
  bandLabel: string;
  keyword: string;
}) {
  if (source === "unvalued" || reasons.length === 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="max-w-full truncate text-left text-xs italic text-amber-700 hover:underline dark:text-amber-400"
          >
            no meaning expressed yet
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <p className="text-xs font-semibold text-foreground">
            Why &ldquo;{keyword}&rdquo; is unvalued
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {UNVALUED_EXPLANATION}
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-full items-center gap-0.5 overflow-hidden text-left hover:underline"
          title="See the full arithmetic"
        >
          {reasons.map((reason, i) => {
            const Icon = reasonIcon(reason.kind);
            return (
              <span key={i} className="flex min-w-0 shrink items-center gap-0.5">
                {i > 0 ? (
                  <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                ) : null}
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1 text-xs",
                    reason.kind === "override"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate tabular-nums">{reasonShort(reason)}</span>
                </span>
              </span>
            );
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-xs font-semibold text-foreground">&ldquo;{keyword}&rdquo;</p>
          <p className="text-[11px] text-muted-foreground">
            {source === "override" ? "Ruled by hand" : "Computed"} · {bandLabel}
            {score !== null ? ` · score ${fmtScore(score)}` : ""}
          </p>
        </div>
        <ol className="max-h-72 overflow-y-auto px-3 py-2 scrollbar-thin">
          {reasons.map((reason, i) => {
            const Icon = reasonIcon(reason.kind);
            return (
              <li key={i} className="flex items-start gap-2 py-1.5">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-foreground">{reasonSentence(reason)}</p>
              </li>
            );
          })}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
