// features/education/spoken-practice/data/reviewPracticeSession.ts
//
// The end-of-session examiner's / interviewer's / debate-judge's review for
// Spoken Practice. Runs the DEDICATED, MODE-AWARE review agent
// (SPOKEN_PRACTICE_AGENTS.reviewSession) over a properly SERIALIZED transcript
// (the prompt + the student's spoken answer + the per-answer verdict, per turn),
// then persists it to `study_session.session_review` and returns the parsed
// review for inline display.
//
// This REPLACES the reuse of the flashcard `reviewSession` tutor lane for this
// feature: that lane runs `fc_review_batch`, which (a) is framed for card drills
// and (b) received object-typed variables it expected as JSON strings, found no
// usable data, and narrated hunting the DB — persisting garbled, flashcard-framed
// reviews (adversarial-review GAP 1). The new agent has tools disabled and reads
// a real transcript, so the review is coherent and on-topic. Output is the SAME
// `ReviewSessionResult` shape the summary renderer already consumes.
//
// Same execution discipline as generateSession: the canonical headless
// primitive (`runHeadlessAgentJson`, D126). Never throws.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { studyService } from "@/features/education/study/service/studyService";
import type {
  ReviewAggregate,
  ReviewAttempt,
} from "@/features/education/tutor/lanes/learnerContext";
import type { ReviewSessionResult } from "@/features/education/tutor/lanes/reviewSession";
import { SPOKEN_PRACTICE_AGENTS } from "../agents";
import type { SpokenPracticeMode } from "../types";

export interface ReviewPracticeSessionArgs {
  sessionId: string | null;
  mode: SpokenPracticeMode;
  attempts: ReviewAttempt[];
  aggregate: ReviewAggregate;
}

/**
 * Serialize the attempts into a readable, on-topic transcript the reviewer reasons
 * over — the fix for the object-as-variable bug that made the old agent hunt the DB.
 */
function buildTranscript(attempts: ReviewAttempt[]): string {
  return attempts
    .map((a, i) => {
      const verdict = a.result ?? "not answered";
      const score = a.score != null ? ` (score ${a.score.toFixed(2)})` : "";
      const said = a.transcript.trim() || "(no answer captured)";
      return `Turn ${i + 1}\nPrompt: ${a.front}\nStudent answer: ${said}\nVerdict: ${verdict}${score}`;
    })
    .join("\n\n");
}

/**
 * Run the mode-aware review AND persist it to `study_session.session_review`.
 * Returns the parsed result for inline display, or null on a clean skip/failure —
 * the session is already completed by the caller, so this is a value-add, never a
 * blocker.
 */
export function reviewPracticeSession(args: ReviewPracticeSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ReviewSessionResult | null> => {
    if (args.attempts.length === 0) return null; // nothing to review

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        agentId: SPOKEN_PRACTICE_AGENTS.reviewSession,
        surfaceKey: "education-spoken-practice-review",
        sourceFeature: "education-tutor",
        variables: {
          mode: args.mode,
          transcript: buildTranscript(args.attempts),
          aggregate: `total: ${args.aggregate.total}, graded: ${args.aggregate.graded}, correct: ${args.aggregate.correct}, accuracy: ${args.aggregate.accuracy.toFixed(2)}`,
        },
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });

      const raw = result.data;
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const summary = typeof r.summary === "string" ? r.summary : "";
      if (!summary) return null;

      if (args.sessionId) {
        await studyService.updateSession(args.sessionId, {
          session_review: raw as never,
        });
      }

      return {
        summary,
        strengths: Array.isArray(r.strengths)
          ? r.strengths.filter((x): x is string => typeof x === "string")
          : [],
        weaknesses: Array.isArray(r.weaknesses)
          ? r.weaknesses.filter((x): x is string => typeof x === "string")
          : [],
      };
    } catch (err) {
      console.error("[spoken-practice.reviewPracticeSession] failed:", err);
      return null;
    }
  };
}
