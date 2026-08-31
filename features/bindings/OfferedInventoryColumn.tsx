"use client";

// features/bindings/OfferedInventoryColumn.tsx
//
// THE OFFERED SIDE — one of the two standing inventories (UI-STANDARD P1).
// It is never behind a click, a fold or a dropdown: what the job offers is on
// the screen the whole time the match is being made.
//
// Each value is priced at the point of choice (P6): the human label, the kind,
// whether it is always there, and its own description. A value already feeding
// a holder input says which one — so "what is left" is readable without
// counting, and an unconsumed value stays CALM (Arman, 2026-08-22: unused
// offered values are normal, never a warning).

import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { OfferedValue } from "@/features/mandates/provision-shapes";
import { RAIL_MAX_HEIGHT, scrollHint } from "./rail-height";

export interface OfferedInventoryColumnProps {
  values: readonly OfferedValue[];
  /** Offered value name → the holder inputs it currently feeds. */
  consumedBy: ReadonlyMap<string, string[]>;
  /** Values the platform delivers automatically — shown, never hidden (P8). */
  pinnedContext: readonly string[];
  /** One sentence naming where this inventory came from. */
  sourceLine: string;
  /** Honest words for an offer that is still loading or genuinely empty. */
  status?: "loading" | "ready";
  emptyRemedy?: string;
}

export function OfferedInventoryColumn({
  values,
  consumedBy,
  pinnedContext,
  sourceLine,
  status = "ready",
  emptyRemedy,
}: OfferedInventoryColumnProps) {
  const pinned = new Set(pinnedContext);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        RAIL_MAX_HEIGHT,
      )}
    >
      <header className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12.5px] font-semibold text-foreground">
            This job offers
          </h3>
          {/* A count is a settled fact. While the offer is still being read
              there IS no count, and printing 0 would be the screen lying for a
              second — which is the same defect as lying for an hour. */}
          {status === "ready" ? (
            <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
              {values.length}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {sourceLine}
        </p>
        {/* P1 — the rail is CAPPED so both inventories stay on screen together
            (V2 G4: 27 values used to stretch the workspace to 4,502px). A
            scrollbar alone would be a silent limit, so the count says it. */}
        {status === "ready" && scrollHint(values.length) ? (
          <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/70">
            {scrollHint(values.length)}
          </p>
        ) : null}
      </header>

      {status === "loading" ? (
        <p className="px-3 py-6 text-[11.5px] text-muted-foreground">
          Reading what this job offers…
        </p>
      ) : values.length === 0 ? (
        <p className="px-3 py-6 text-[11.5px] leading-relaxed text-muted-foreground">
          {emptyRemedy ??
            "This job offers nothing yet. Describe its inputs in the INPUT section above and they become the values you map here."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {values.map((value) => {
            const feeds = consumedBy.get(value.name) ?? [];
            const isPinned = pinned.has(value.name);
            return (
              <li
                key={value.name}
                className={cn("px-3 py-2", feeds.length > 0 && "bg-primary/5")}
              >
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-[12px] font-medium text-foreground">
                    {formatVariableDisplayName(value.name)}
                  </span>
                  <span className="rounded border border-border px-1 font-mono text-[9px] text-muted-foreground">
                    {value.kind}
                  </span>
                  {!value.guaranteed ? (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      · sometimes
                    </span>
                  ) : null}
                  {value.lazy ? (
                    <span className="text-[10px] text-muted-foreground">
                      · fetched when used
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {value.name}
                </p>
                {value.description ? (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {value.description}
                  </p>
                ) : null}
                {/* P5 / D2 — THE REAL THING ON THE SCREEN. A description tells
                    you what a value MEANS; one example tells you what it IS,
                    and choosing where a value should land is much easier with
                    both. Static, declared with the provision, never read at run
                    time — so it is labelled as an example and can never be
                    mistaken for the value this run will carry. Absent means the
                    declaration gave none: say nothing, never invent one.
                    🚨 NOT `truncate`: the example exists so the reader can SEE
                    what a value is, and a one-line clip on an 18rem rail turned
                    "Looks like: Q3 planning sync" into an ellipsis — the P5
                    mechanic paying nothing. Two lines, and long words break
                    rather than push the rail wide. */}
                {value.example ? (
                  <p className="mt-1 line-clamp-2 break-words text-[10.5px] leading-snug text-muted-foreground/80">
                    <span className="text-muted-foreground/60">Looks like: </span>
                    <span className="font-mono">{value.example}</span>
                  </p>
                ) : null}
                {isPinned ? (
                  <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-muted-foreground">
                    <Lock className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    Delivered automatically by the platform — it arrives whether
                    or not you map it.
                  </p>
                ) : feeds.length > 0 ? (
                  <p className="mt-1 text-[10.5px] leading-snug text-primary">
                    Feeds {feeds.join(", ")}
                  </p>
                ) : (
                  <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/70">
                    Available, unused — that is normal.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
