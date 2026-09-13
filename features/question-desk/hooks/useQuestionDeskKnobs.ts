"use client";

// features/question-desk/hooks/useQuestionDeskKnobs.ts
//
// The three `question_desk` knobs, ladder-resolved for the signed-in person
// (system → organization → user), through the ONE runtime read
// `platform.knob_resolve`.
//
// 🚨 NO CODE FALLBACK. A knob's default lives in `platform.feature_knob`, not
// here — that is what makes it a knob and not taste. So this hook has exactly
// three states and the screen must honour all three:
//   loading  — nothing decided yet; the surface waits (it does NOT guess)
//   ready    — the resolved values
//   failed   — the read failed; the surface SAYS so with the reason and the
//              remedy, because a screen that quietly picks a default while the
//              setting is unreadable is a screen that lies.
//
// `useEffectiveKnob` deliberately swallows its own failures (a cosmetic
// consumer must never take a document down), which is why this hook drives
// `ensureEffectiveKnob` itself: on this surface a knob decides what a button
// SAYS ("Skip — ship it anyway" vs "Skip — defer"), and a wrong sentence there
// ships a ruling he did not make.

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

export const KNOB_DEFAULT_VIEW = "question_desk.default_view";
export const KNOB_SKIP_SHIPS = "question_desk.skip_ships_recommendation";
export const KNOB_READ_ALOUD_PARTS = "question_desk.read_aloud_parts";

/** Parts the read-aloud knob may name, in the order it names them. */
export type ReadAloudPart =
  | "title"
  | "question"
  | "background"
  | "recommendation"
  | "ruled_before"
  | "the_best_do"
  | "today"
  | "implications";

export type QuestionDeskKnobs =
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | {
      state: "ready";
      defaultView: "one" | "table";
      skipShipsRecommendation: boolean;
      readAloudParts: ReadAloudPart[];
    };

const READ_ALOUD_PARTS: readonly string[] = [
  "title",
  "question",
  "background",
  "recommendation",
  "ruled_before",
  "the_best_do",
  "today",
  "implications",
];

export function useQuestionDeskKnobs(): QuestionDeskKnobs {
  const organizationId = useAppSelector(
    (s) => s.appContext?.organization_id ?? null,
  );
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const [knobs, setKnobs] = useState<QuestionDeskKnobs>({ state: "loading" });

  useEffect(() => {
    if (!organizationId) {
      setKnobs({ state: "loading" });
      return undefined;
    }
    let live = true;
    setKnobs({ state: "loading" });
    void (async () => {
      try {
        const [view, skip, parts] = await Promise.all([
          ensureEffectiveKnob(organizationId, userId, KNOB_DEFAULT_VIEW),
          ensureEffectiveKnob(organizationId, userId, KNOB_SKIP_SHIPS),
          ensureEffectiveKnob(organizationId, userId, KNOB_READ_ALOUD_PARTS),
        ]);
        if (!live) return;
        setKnobs({
          state: "ready",
          defaultView: view === "table" ? "table" : "one",
          skipShipsRecommendation: skip === true,
          readAloudParts: readParts(parts),
        });
      } catch (error) {
        if (!live) return;
        setKnobs({
          state: "failed",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [organizationId, userId]);

  return knobs;
}

function readParts(value: unknown): ReadAloudPart[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `question_desk.read_aloud_parts resolved to ${JSON.stringify(value)} — it must be a list of part names.`,
    );
  }
  const parts = value.filter(
    (part): part is ReadAloudPart =>
      typeof part === "string" && READ_ALOUD_PARTS.includes(part),
  );
  if (parts.length !== value.length) {
    const unknown = value.filter((part) => !parts.includes(part as ReadAloudPart));
    throw new Error(
      `question_desk.read_aloud_parts names parts this screen cannot read: ${unknown.join(", ")}.`,
    );
  }
  return parts;
}
