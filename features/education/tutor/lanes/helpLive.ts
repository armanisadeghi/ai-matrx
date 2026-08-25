// features/education/tutor/lanes/helpLive.ts
//
// Phase 4 (Flashcards Competitive Parity Push) — the mode-agnostic "I'm
// confused" live help lane (FC_MANDATES.helpLive, AGENT_SPECS.md §6),
// generalized out of Fast Fire so EVERY study surface (classic set study,
// adaptive due review, weak-area drill, Fast Fire) can offer the same AI
// tutor with real learner context, not a stub. The lane resolves through the
// mandate — swap the agent behind it at /agents/mandates (the old
// localStorage agent-id override is RETIRED; bindings replaced it).
//
// The agent round-trip runs through the canonical headless primitive
// (`runHeadlessAgentJson`, D126) — this lane owns context variables, result
// coercion, and (D151) PERSISTENCE: given a `sessionId`, the answer is written
// to the session's AI journal by the primitive's `onResult` seam the instant it
// lands, so advancing the card can no longer destroy a paid tutor answer.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  livePosture,
  runHeadlessAgentJson,
} from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { studyService } from "@/features/education/study/service/studyService";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import {
  coerceTrustEnvelope,
  type TrustEnvelope,
} from "@/features/education/trust/types";

export interface HelpLiveContext {
  front: string;
  back: string;
  /** The learner's question; defaults to a generic "I'm confused" prompt. */
  question?: string;
  /** 0..1 session accuracy so far, or null before anything is graded. */
  sessionScore?: number | null;
  /** Front text of recently-correct cards THIS session, most-recent-first. */
  recentCorrect?: string[];
  /** Front text of recently-missed cards THIS session, most-recent-first. */
  recentWrong?: string[];
  /** Distinct topics the learner is currently struggling with. */
  struggledTopics?: string[];
  /** How many items are due for review right now, across the learner's sets. */
  dueCount?: number;
  /** Milliseconds spent on this card before asking. */
  timeOnCardMs?: number;
  /** This learner's past attempts on THIS card (newest first). */
  cardHistory?: unknown[];
  /** Override the help mandate (rare — testing only). */
  mandateKey?: string | null;
  /** Live handle — the tutor's answer streams where the caller mounts it. */
  onConversationCreated?: (conversationId: string) => void;
  /** The card being asked about — the key the answer is journalled under. */
  cardId?: string | null;
  /**
   * The open `study_session`. With it, the tutor's answer is written to
   * `study_session.metadata.ai.helpAnswers` the instant it arrives (D151).
   * This is the most expensive single-card lane in the product — it is built
   * from a DB round-trip for the due count plus this card's attempt history —
   * and it used to be erased by the next card with no trace anywhere.
   */
  sessionId?: string | null;
}

export interface HelpLiveResult {
  answer: string;
  hintLevel: "nudge" | "partial" | "full";
  followups: string[];
  /** P0 TrustEnvelope — how grounded this answer is; null on refusal render
   *  the honest-refusal presentation instead of a normal answer bubble. */
  trust: TrustEnvelope | null;
}

/**
 * Narrow the agent's raw JSON (the `live_help_answer` kind — `__kind` keys at
 * every level are ignored) to the lane's contract. Shared by the awaited
 * return AND the persistence seam so the row we store and the object we render
 * can never be two different readings of the same run.
 */
export function readHelp(data: unknown): HelpLiveResult | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const answer = typeof r.answer === "string" ? r.answer : "";
  if (!answer) return null;
  const hintLevel =
    r.hint_level === "nudge" ||
    r.hint_level === "partial" ||
    r.hint_level === "full"
      ? r.hint_level
      : "partial";
  return {
    answer,
    hintLevel,
    followups: Array.isArray(r.followups)
      ? r.followups.filter((x): x is string => typeof x === "string")
      : [],
    trust: coerceTrustEnvelope(r.trust),
  };
}

/** The registered kind this lane's answer renders as. */
export const LIVE_HELP_ANSWER_KIND = "live_help_answer" as const;

/**
 * Re-assemble the canonical `live_help_answer` kind value from the lane's
 * normalized result — so a live answer AND one read back from the session
 * journal render through the SAME kind component (KindInstanceRender).
 */
export function liveHelpAnswerValue(
  result: HelpLiveResult,
): Record<string, unknown> {
  return {
    __kind: LIVE_HELP_ANSWER_KIND,
    answer: result.answer,
    hint_level: result.hintLevel,
    followups: result.followups,
    trust: result.trust
      ? {
          __kind: "trust_envelope",
          citations: result.trust.citations.map((c) => ({
            __kind: "citation",
            ...c,
          })),
          confidence: result.trust.confidence,
          groundedIn: result.trust.groundedIn ?? null,
        }
      : null,
  };
}

/** Returns help, or null when the run failed. */
export function helpLive(ctx: HelpLiveContext) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<HelpLiveResult | null> => {
    const mandateKey = ctx.mandateKey ?? FC_MANDATES.helpLive;

    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey,
        surfaceKey: "flashcards-help-live",
        // NOT ephemeral (see /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/EPHEMERAL-RUNS.md); kept out of
        // normal chats via a distinct system source_feature (source-registry.ts).
        sourceFeature: "education-flashcards",
        ...livePosture(ctx.onConversationCreated),
        userInput:
          ctx.question?.trim() || "I'm confused — help me with this card.",
        variables: {
          front: ctx.front,
          back: ctx.back,
          session_score: ctx.sessionScore ?? 0,
          recent_correct: ctx.recentCorrect ?? [],
          recent_wrong: ctx.recentWrong ?? [],
          struggled_topics: ctx.struggledTopics ?? [],
          due_count: ctx.dueCount ?? 0,
          time_on_card_ms: ctx.timeOnCardMs ?? 0,
          card_history: ctx.cardHistory ?? [],
        },
        timeoutMs: 60_000,
        pollIntervalMs: 150,
        // 🚨 D151 — persist on arrival, not on the caller's `.then`. The learner
        // routinely advances the card while this is in flight; the answer must
        // outlive the component that asked for it.
        ...(ctx.sessionId
          ? {
              onResult: async (run) => {
                const help = readHelp(run.data);
                if (!help) return;
                const saved = await studyService.appendSessionArtifact(
                  ctx.sessionId as string,
                  {
                    kind: "helpAnswer",
                    entry: {
                      cardId: ctx.cardId ?? "",
                      question: ctx.question?.trim() ?? "",
                      answer: help.answer,
                      hintLevel: help.hintLevel,
                      followups: help.followups,
                      trust: help.trust,
                      at: new Date().toISOString(),
                    },
                  },
                );
                if (saved.error) {
                  console.error(
                    "[flashcards.helpLive] answer generated but NOT saved:",
                    saved.error,
                  );
                }
              },
            }
          : {}),
      });

      // Partial-tolerant: an errored stream may still carry a usable object.
      return readHelp(result.data);
    } catch (err) {
      console.error("[flashcards.helpLive] failed:", err);
      return null;
    }
  };
}
