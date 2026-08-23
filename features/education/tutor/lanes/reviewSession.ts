// features/education/tutor/lanes/reviewSession.ts
//
// Phase 4 (Flashcards Competitive Parity Push) — the mode-agnostic
// end-of-session "professor" review (FC_MANDATES.reviewBatch, AGENT_SPECS.md §7),
// generalized out of Fast Fire so it can run at the end of ANY completed
// study session (classic set study, adaptive due review, weak-area drill),
// not just Fast Fire — writing `study_session.session_review` the same way,
// so `CoachReviewPanel` + `SessionScorecard` on the session detail page
// display it for free everywhere, with zero per-surface UI work.
//
// DURABLE (2026-08-15): the run's conversation id is stamped on the session row
// (`metadata.ai.reviewRun`) the instant it exists, and stamped terminal on every
// exit path — so a learner who reloads, or who opens the session detail page
// after the drill finished, REATTACHES to the run and watches it in the
// floating window instead of a page polling the row for a result.
//
// The lane resolves through the mandate — swap the agent behind it at
// /agents/mandates (the old localStorage agent-id override is RETIRED;
// bindings replaced it). The agent round-trip runs through the canonical
// headless primitive (`runHeadlessAgentJson`, D126) — this lane only owns
// variables, coercion, and the session_review persist.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  livePosture,
  runHeadlessAgentJson,
} from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { studyService } from "@/features/education/study/service/studyService";
import {
  REVIEW_RUN_LABEL,
  stampReviewRun,
  studyReviewWindowId,
} from "@/features/education/study/reviewRun";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import {
  parseSessionReview,
  type ParsedSessionReview,
} from "@/features/education/study/utils/parseSessionReview";
import type { ReviewAggregate, ReviewAttempt } from "./learnerContext";

export interface ReviewSessionArgs {
  sessionId: string | null;
  attempts: ReviewAttempt[];
  aggregate: ReviewAggregate;
  /**
   * The segmented FULL-SESSION transcript (spec 26c): per-card, in presented
   * order, with question + grade per segment. When present it becomes the
   * `transcript` variable (instead of the flat per-attempt join) AND persists
   * to `study_session.session_transcript`, so the professor reviews the
   * SESSION — cross-card confusion, consistency, in-session improvement.
   */
  sessionTranscript?: string;
  /**
   * Front text of the cards the learner has NOT yet reached this session
   * (the reviewer can tell them what is still ahead). Omit/empty when the
   * session ran the whole deck or the caller reviews after the fact.
   */
  remainingCards?: string[];
  /** Override the review mandate (rare — testing only). */
  mandateKey?: string | null;
  /**
   * Live handle — the review streams where the caller mounts it. A caller that
   * passes one owns the window (`StudyDeck` does); when it is omitted this lane
   * floats the canonical `LiveRunWindow` itself, so a fire-and-forget review is
   * never invisible work behind a spinner.
   */
  onConversationCreated?: (conversationId: string) => void;
}

/**
 * The review as the ONE reader (`parseSessionReview`) narrows it — the same
 * object the session detail page reads back off `session_review`.
 */
export type ReviewSessionResult = ParsedSessionReview;

/**
 * Run the holistic review AND persist it to `study_session.session_review`.
 * Returns the parsed result for surfaces that want to show it inline (the
 * completion screen); returns null on a clean skip/failure — the session
 * still completed fine, this is a value-add, never a blocker.
 */
export function reviewSession(args: ReviewSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ReviewSessionResult | null> => {
    const mandateKey = args.mandateKey ?? FC_MANDATES.reviewBatch;
    if (args.attempts.length === 0) return null; // nothing to review

    const sessionId = args.sessionId;
    const startedAt = new Date().toISOString();

    /**
     * The moment the conversation exists, two things happen — and both must,
     * because the learner may never be looking at the surface that launched
     * this: the run's identity lands on the session row so ANY later page load
     * can reattach to it, and the run floats so the learner sees it write.
     */
    let boundConversationId: string | null = null;
    const bindRun = (conversationId: string) => {
      boundConversationId = conversationId;
      if (sessionId) {
        void stampReviewRun(sessionId, {
          conversationId,
          startedAt,
          status: "running",
        });
        // A caller with its own window binds it through the callback below;
        // otherwise this lane owns the float.
        if (!args.onConversationCreated) {
          dispatch(
            openLiveRunWindowAction({
              instanceId: studyReviewWindowId(sessionId),
              conversationId,
              label: REVIEW_RUN_LABEL,
            }),
          );
        }
      }
      args.onConversationCreated?.(conversationId);
    };

    /** The terminal stamp — what tells a cold page to stop watching. */
    const settleRun = async (
      conversationId: string | undefined,
      status: "complete" | "failed",
    ): Promise<void> => {
      if (!sessionId || !conversationId) return;
      await stampReviewRun(sessionId, {
        conversationId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status,
      });
    };

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey,
        surfaceKey: "flashcards-review-session",
        sourceFeature: "education-flashcards",
        // Fires automatically at end-of-session — not a user gesture.
        initiation: "auto",
        ...livePosture(args.onConversationCreated),
        onConversationCreated: bindRun,
        variables: {
          transcript:
            args.sessionTranscript ??
            args.attempts
              .map((a) => a.transcript)
              .filter(Boolean)
              .join("\n"),
          attempts: args.attempts,
          aggregate: args.aggregate,
          remaining_cards: args.remainingCards ?? [],
        },
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });

      // Partial-tolerant: an errored stream may still carry a usable object.
      const raw = result.data;
      const review = parseSessionReview(raw);
      if (!review) {
        // Terminal with nothing usable. Stamped as such so a page watching this
        // run stops watching and offers to run it again — never a dead spinner.
        await settleRun(result.conversationId, "failed");
        return null;
      }

      if (sessionId) {
        await studyService.updateSession(sessionId, {
          session_review: raw as never,
          // The transcript the review was grounded in persists beside it, so
          // the session detail page can show exactly what was reviewed.
          ...(args.sessionTranscript
            ? { session_transcript: args.sessionTranscript }
            : {}),
        });
      }
      await settleRun(result.conversationId, "complete");

      return review;
    } catch (err) {
      console.error("[flashcards.reviewSession] failed:", err);
      // Close the durable handle too — a page reattaching to this run must be
      // told it ended, not left watching a conversation that will never write.
      await settleRun(boundConversationId ?? undefined, "failed");
      return null;
    }
  };
}
