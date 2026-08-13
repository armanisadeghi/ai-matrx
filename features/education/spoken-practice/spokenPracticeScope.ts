"use client";

// features/education/spoken-practice/spokenPracticeScope.ts
//
// Runtime scope builder for `matrx-user/education-practice-oral`. Called at
// trigger time by SpokenPracticeSurface's `getScope` — synchronously, from live
// render state plus the setup snapshot store (`setupSnapshot.ts`), never a
// fetch: the Surface Context window samples `getScope` every 400ms while it is
// open, so an async emitter here would hammer the database behind an
// idle-looking panel.
//
// Everything under the results group is EVIDENCE: it comes from grading a real
// recording of the learner speaking. It is emitted so an agent can coach from
// it, and it is deliberately absent from the manifest's writeTargets so no
// agent can forge it.

import {
  createEducationPracticeOralScope,
  type PracticeCurrentPromptScope,
  type PracticeModeScopeEntry,
  type PracticePromptScopeEntry,
  type PracticeResultScopeEntry,
} from "@/features/surfaces/manifests/education-practice-oral.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SpokenGrade } from "@/features/flashcards/fast-fire/agents/grading-core";
import type { ReviewSessionResult } from "@/features/education/tutor/lanes/reviewSession";
import { readPracticeSetupSnapshot } from "./setupSnapshot";
import { MODE_VOCABULARY } from "./vocabulary";
import { SPOKEN_PRACTICE_MODES } from "./types";
import type { PracticePlan, PromptResult, RunnerPhase } from "./types";

/** Static, so it is built once rather than on every 400ms poll. */
const AVAILABLE_MODES: PracticeModeScopeEntry[] = SPOKEN_PRACTICE_MODES.map(
  (mode) => {
    const cfg = MODE_VOCABULARY[mode];
    return {
      mode,
      label: cfg.label,
      tagline: cfg.tagline,
      persona: cfg.persona,
      focus_label: cfg.focusLabel,
      offers_deck_grounding: cfg.offersDeckGrounding,
    };
  },
);

/** The pronunciation dimensions the summary screen rolls up, in its order. */
const PRONUNCIATION_DIMS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "fluency", label: "Fluency" },
  { key: "intelligibility", label: "Clarity" },
  { key: "prosody", label: "Prosody" },
] as const;

function promptEntry(
  p: PracticePlan["prompts"][number],
): PracticePromptScopeEntry {
  return {
    id: p.id,
    prompt: p.prompt,
    focus_area: p.focusArea,
    reference_answer: p.referenceAnswer,
    rubric: p.rubric,
    confidence: p.confidence,
  };
}

/** The current prompt WITHOUT its reference answer or rubric — no answer leak. */
function currentPromptEntry(
  p: PracticePlan["prompts"][number],
): PracticeCurrentPromptScope {
  return {
    id: p.id,
    prompt: p.prompt,
    focus_area: p.focusArea,
    confidence: p.confidence,
  };
}

function resultEntry(r: PromptResult): PracticeResultScopeEntry {
  return {
    prompt_id: r.promptId,
    result: r.result,
    score: r.score,
    transcript: r.grade?.transcript ?? "",
    missing: r.grade?.missing ?? [],
  };
}

/**
 * The same rollup PracticeSummary renders, computed from the same inputs so the
 * numbers an agent reads are byte-for-byte the ones on the learner's screen.
 */
function scorecard(results: PromptResult[]) {
  const graded = results.filter((r) => r.result !== "skipped");
  const strong = results.filter((r) => r.result === "correct").length;
  const average =
    graded.length > 0
      ? Math.round(
          (graded.reduce((s, r) => s + r.score, 0) / graded.length) * 100,
        )
      : null;

  const scored = results.filter((r) => r.grade?.pronunciation != null);
  const pronunciation =
    scored.length > 0
      ? Object.fromEntries(
          PRONUNCIATION_DIMS.map((dim) => [
            dim.key,
            Math.round(
              (scored.reduce(
                (s, r) => s + (r.grade!.pronunciation![dim.key] ?? 0),
                0,
              ) /
                scored.length) *
                100,
            ),
          ]),
        )
      : null;

  return {
    answered: results.length,
    graded: graded.length,
    strong,
    average_score_pct: average,
    ...(pronunciation ? { pronunciation_rollup: pronunciation } : {}),
  };
}

function gradeValue(grade: SpokenGrade): Record<string, unknown> {
  return {
    verdict: grade.verdict,
    score: grade.score,
    rubric: grade.rubric,
    transcript: grade.transcript,
    missing: grade.missing,
    pronunciation: grade.pronunciation,
  };
}

export interface SpokenPracticeScopeInput {
  /** The mode the learner picked; null while the home screen is showing. */
  selectedMode: string | null;
  phase: RunnerPhase;
  plan: PracticePlan | null;
  index: number;
  sessionId: string | null;
  results: PromptResult[];
  grade: SpokenGrade | null;
  review: ReviewSessionResult | null;
  liveConversationId: string | null;
  error: string | null;
}

/**
 * Build the live scope. The session half comes from the surface's own live
 * state; the setup half comes from the snapshot store, so it is present only
 * while the setup form is mounted — which is exactly what the manifest
 * promises.
 */
export function buildSpokenPracticeScope(
  input: SpokenPracticeScopeInput,
): SurfaceScopePayload {
  const setup = readPracticeSetupSnapshot();
  const plan = input.plan;
  const current = plan?.prompts[input.index] ?? null;
  const started = plan !== null;

  return createEducationPracticeOralScope({
    available_modes: AVAILABLE_MODES,
    runner_phase: input.phase,
    ...(input.selectedMode ? { selected_mode: input.selectedMode } : {}),

    // Setup form — only while it is on screen.
    ...(setup
      ? {
          setup_draft: {
            mode: setup.mode,
            focus: setup.focus,
            difficulty: setup.difficulty,
            count: setup.count,
            deck_id: setup.deckId,
            source_text: setup.pasted,
          },
          setup_busy: setup.busy,
          ...(setup.offersDeckGrounding
            ? {
                available_decks: setup.decks.map((d) => ({
                  id: d.id,
                  name: d.name,
                })),
              }
            : {}),
        }
      : {}),

    // Live session.
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    ...(plan
      ? {
          session_plan: {
            session_title: plan.sessionTitle,
            intro: plan.intro,
            prompt_count: plan.prompts.length,
          },
          session_prompts: plan.prompts.map(promptEntry),
          current_prompt_index: input.index,
        }
      : {}),
    ...(current ? { current_prompt: currentPromptEntry(current) } : {}),
    ...(input.liveConversationId
      ? { live_conversation_id: input.liveConversationId }
      : {}),
    ...(input.error ? { practice_error: input.error } : {}),

    // Results — measured evidence, never writable.
    ...(started ? { prompt_results: input.results.map(resultEntry) } : {}),
    ...(input.grade ? { latest_grade: gradeValue(input.grade) } : {}),
    ...(input.results.length > 0
      ? { session_scorecard: scorecard(input.results) }
      : {}),
    ...(input.review
      ? {
          session_review: {
            summary: input.review.summary,
            strengths: input.review.strengths,
            weaknesses: input.review.weaknesses,
          },
        }
      : {}),
  });
}
