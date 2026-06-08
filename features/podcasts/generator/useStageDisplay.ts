"use client";

// features/podcasts/generator/useStageDisplay.ts
//
// Turns the raw stage list into the render-ready timeline the rail shows, and
// solves the "first step sits dead for a minute" problem: while the long
// prepare/research stage runs, it shows synthetic sub-steps that auto-advance on
// RANDOMIZED timers so the user feels real motion. The last sub-step holds until
// the REAL stage actually finishes — at which point ALL synthetic steps snap to
// done with no lag. Each display stage also carries a `kind` so the rail can show
// a domain-specific icon instead of an identical green check.

import { useEffect, useState } from "react";
import { stageKind, type StageKind } from "./constants";
import type { PodcastRunState } from "./types";

export interface DisplayStage {
  key: string;
  label: string;
  status: "running" | "done" | "failed";
  kind: StageKind;
  synthetic?: boolean;
}

export interface StageDisplay {
  stages: DisplayStage[];
  doneCount: number;
  total: number;
  featuredLabel: string;
  progress: number;
}

const PREPARE_KEYS = new Set([
  "prepare_content",
  "prepare_content_researcher",
  "prepare_content_extractor",
]);

const RESEARCH_SUBSTEPS = [
  "Analyzing the topic",
  "Searching the web for sources",
  "Reading the most relevant results",
  "Synthesizing the findings",
];
const PREPARE_SUBSTEPS = [
  "Analyzing your content",
  "Cleaning and structuring it",
  "Extracting the key points",
  "Shaping the outline",
];

interface SynthStep {
  label: string;
  kind: StageKind;
}

// Deterministic plan (content is fixed; only the *timing* is randomized, in the
// timer effect) — so it can be computed during render without impurity.
function planFor(parentStage: string): SynthStep[] {
  const research = parentStage.includes("research");
  const labels = research ? RESEARCH_SUBSTEPS : PREPARE_SUBSTEPS;
  const kind: StageKind = research ? "research" : "prepare";
  return labels.map((label) => ({ label, kind }));
}

export function useStageDisplay(state: PodcastRunState): StageDisplay {
  const [plan, setPlan] = useState<{ key: string; steps: SynthStep[] } | null>(
    null,
  );
  const [doneCount, setDoneCount] = useState(0);

  const activePrepare = state.stages.find(
    (s) => PREPARE_KEYS.has(s.stage) && s.status === "running",
  );
  const prepareSettled = state.stages.some(
    (s) => PREPARE_KEYS.has(s.stage) && s.status !== "running",
  );
  const activePrepareKey = activePrepare?.stage ?? null;

  // Adjust state during render (React's documented escape hatch, not an effect):
  // the first time a prepare stage goes running, build its synthetic plan. The
  // guard makes this fire exactly once per prepare stage — no render loop. The
  // plan persists after the stage settles so its sub-steps stay visible as done.
  if (activePrepareKey && plan?.key !== activePrepareKey) {
    setPlan({ key: activePrepareKey, steps: planFor(activePrepareKey) });
    setDoneCount(0);
  }

  // Advance one sub-step on a randomized 4–11s timer; hold the LAST one until
  // the real stage finishes. setState lives in an async callback (allowed).
  useEffect(() => {
    if (!plan || prepareSettled) return;
    if (doneCount >= plan.steps.length - 1) return;
    // Snappy: ~2.2–5.5s per sub-step (the first ones especially shouldn't dwell)
    // so the phase feels brisk, while the LAST step still holds for the real
    // stage to finish.
    const id = setTimeout(
      () => setDoneCount((c) => c + 1),
      2200 + Math.random() * 3300,
    );
    return () => clearTimeout(id);
  }, [plan, prepareSettled, doneCount]);

  // When the real stage finished, ALL sub-steps are done (derived — no setState).
  const synthDone = prepareSettled ? (plan?.steps.length ?? 0) : doneCount;

  // ── Build the display timeline ──────────────────────────────────────────
  const stages: DisplayStage[] = [];
  let insertedSynthetic = false;
  for (const s of state.stages) {
    if (PREPARE_KEYS.has(s.stage) && plan) {
      if (!insertedSynthetic) {
        insertedSynthetic = true;
        plan.steps.forEach((step, i) => {
          if (i > synthDone) return; // not revealed yet
          stages.push({
            key: `synth-${i}`,
            label: step.label,
            kind: step.kind,
            status: i < synthDone ? "done" : "running",
            synthetic: true,
          });
        });
      }
      continue; // the real prepare row is represented by the synthetic steps
    }
    stages.push({
      key: s.stage,
      label: s.label,
      status: s.status,
      kind: stageKind(s.stage),
    });
  }

  const completed = stages.filter((s) => s.status !== "running").length;
  const runningCount = stages.length - completed;
  const denom = Math.max(stages.length, state.totalSteps, 12);
  const progress =
    state.status === "done"
      ? 100
      : state.status === "error"
        ? Math.round(state.progress)
        : Math.min(
            99,
            Math.round(((completed + runningCount * 0.5) / denom) * 100),
          );

  const running = stages.filter((s) => s.status === "running");
  const featuredLabel =
    state.status === "done"
      ? "Episode ready"
      : state.status === "error"
        ? "Finished with errors"
        : running.length > 0
          ? running.length > 1
            ? `${running[0].label} · +${running.length - 1} more`
            : running[0].label
          : state.currentLabel || "Starting up…";

  return {
    stages,
    doneCount: completed,
    total: stages.length,
    featuredLabel,
    progress,
  };
}
