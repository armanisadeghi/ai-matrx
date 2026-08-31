"use client";

// features/bindings/HolderInputsColumn.tsx
//
// THE CONSUMING SIDE — the other standing inventory (UI-STANDARD P1). The
// holder's complete input list is on screen the whole time, grouped the way the
// agent↔surface workspace groups it: VARIABLES then CONTEXT POLICIES, with
// `Required` marked here and again on the row (D18.3 — a context slot is a
// first-class target, and the author is entitled to know which channel they
// chose, because a value delivered to a context slot behaves differently from
// one substituted into a prompt).
//
// Every state this column can be in says something: loading, unreadable,
// nothing chosen yet, or a holder that genuinely declares no inputs.

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { ConsumptionEntry } from "@/features/mandates/provision-shapes";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { feedSentence, isFed } from "./words";
import { RAIL_MAX_HEIGHT } from "./rail-height";
import type { HolderInputs } from "./useHolderInputs";

export interface HolderInputsColumnProps {
  inputs: HolderInputs;
  /**
   * Holder input name → the ORDERED SOURCES feeding it right now.
   *
   * 🚨 Sources, never a count. The rail states what feeds an input, and a count
   * cannot know a KIND — that is exactly how it came to print "Fed by 1 offered
   * value." over a stored literal, over a question, and over a pick nobody had
   * made yet (V1 F2). `feedSentence` reads the sources themselves.
   */
  fedBy: ReadonlyMap<string, readonly ConsumptionEntry[]>;
  holderKind: "agent" | "workflow";
}

export function HolderInputsColumn({
  inputs,
  fedBy,
  holderKind,
}: HolderInputsColumnProps) {
  const variables = inputs.targets.filter((t) => !inputs.contextKeys.has(t.name));
  const contextSlots = inputs.targets.filter((t) =>
    inputs.contextKeys.has(t.name),
  );

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
            This holder needs
          </h3>
          {inputs.status === "ready" ? (
            <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
              {inputs.targets.length}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          Everything the {holderKind} declares. Each one is a row in the middle.
        </p>
      </header>

      {inputs.status === "none" ? (
        <p className="px-3 py-6 text-[11.5px] leading-relaxed text-muted-foreground">
          No holder chosen yet — pick one above and its inputs appear here.
        </p>
      ) : inputs.status === "loading" ? (
        <p className="px-3 py-6 text-[11.5px] text-muted-foreground">
          Reading the {holderKind}&apos;s inputs…
        </p>
      ) : inputs.status === "error" ? (
        <p className="flex items-start gap-1.5 px-3 py-6 text-[11.5px] leading-relaxed text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {inputs.message}
        </p>
      ) : inputs.targets.length === 0 ? (
        <p className="px-3 py-6 text-[11.5px] leading-relaxed text-muted-foreground">
          This {holderKind} declares no inputs — it runs on the job&apos;s user
          text alone. There is nothing to map, and that is a complete answer.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <InputGroup
            title="Variables"
            emptyWords="None — this holder takes everything as context."
            items={variables}
            fedBy={fedBy}
          />
          <InputGroup
            title="Context policies"
            emptyWords="None — this holder has no context slots."
            items={contextSlots}
            fedBy={fedBy}
          />
        </div>
      )}
    </section>
  );
}

function InputGroup({
  title,
  emptyWords,
  items,
  fedBy,
}: {
  title: string;
  emptyWords: string;
  items: readonly BindingTarget[];
  fedBy: ReadonlyMap<string, readonly ConsumptionEntry[]>;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">{emptyWords}</p>
      ) : (
        items.map((item) => {
          const sources = fedBy.get(item.name);
          const fed = isFed(sources);
          return (
            <div
              key={item.name}
              className={cn(
                "rounded-md border px-2 py-1.5",
                fed ? "border-primary/40 bg-primary/5" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-[12px] font-medium text-foreground">
                  {item.label ?? formatVariableDisplayName(item.name)}
                </span>
                {item.required ? (
                  <span className="rounded bg-amber-500/10 px-1 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    Required
                  </span>
                ) : null}
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                {item.name}
              </p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/80">
                {feedSentence(sources)}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
