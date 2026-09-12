"use client";

// features/mandates/MandateGoalBlock.tsx
//
// THE ONE BLOCK THAT PRINTS A MANDATE'S GOAL — or says it has none.
//
// 🚨 THE SENTENCE THIS FILE EXISTS TO CONTROL (FIX-Q9, 2026-09-11):
//
//     "No goal declared for <key>."
//
// It used to be printed on the strength of the CODE CATALOGUE alone, so a
// Mandate created in the UI — stored goal present, no code declaration — was
// told it had no goal while its own workspace printed that goal three clicks
// away. The block now resolves through the ONE reader (`./goal`), which asks
// the stored row first and the catalogue second, and the sentence appears only
// when BOTH came back empty. A goal that could not be READ is a different fact
// again and says so verbatim; absence is never used to report a failure.

import React from "react";

import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";

import { useMandateGoal } from "./useMandateGoal";

export function MandateGoalBlock({
  mandateKey,
  /** The stored `agent.mandate.goal` — pass it whenever the row is in hand. */
  storedGoal = null,
  description,
}: {
  mandateKey: string;
  storedGoal?: string | null;
  description: string | null;
}) {
  const { goal, source, loading, error, loaded } = useMandateGoal(
    mandateKey,
    storedGoal,
  );
  return (
    <div className="space-y-1 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Goal
      </div>
      {goal ? (
        <>
          <p className="text-[13.5px] font-medium leading-snug text-foreground">
            {goal}
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            {source === "catalogue"
              ? "Declared in code — edited where the Mandate is declared, not here."
              : "Edited in this Mandate's workspace, in its Goal section."}
          </p>
        </>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">Reading the goal…</p>
      ) : error ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The goal could not be read: <TextWithDoors text={error} />
        </p>
      ) : loaded ? (
        <p className="text-xs italic text-muted-foreground">
          No goal declared for {mandateKey}.
        </p>
      ) : null}
      {description && description !== goal ? (
        <p className="pt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
