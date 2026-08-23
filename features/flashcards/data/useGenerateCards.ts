"use client";

// features/flashcards/data/useGenerateCards.ts
//
// The reusable "run the generateCards agent → get structured cards back" hook,
// built on the canonical `useHeadlessAgentJson` primitive (D126): a direct,
// auto-running agent launch with JSON extraction on; this hook owns only the
// variables and the card-set coercion.
//
// Returns the RAW agent JSON ({ title, cards[] } — the registered
// `flashcard_set` kind — for FC_MANDATES.generateCards) coerced into a
// normalized shape so callers never touch `any`. Persisting the result
// (fc_set + fc_card rows) is the CALLER's job — this hook only owns the
// agent round-trip, so the same primitive serves from-topic, from-source, and
// future quiz flows.
//
// NOTE: the content-ir envelope (generatedSetFromEnvelope) is now the PRIMARY
// persistence source in CreateFromTopic; this hook's extraction result is the
// transition fallback and the resolution trigger / timeout mechanism.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
import type { Depth } from "@/features/education/assessment/data/types";
import { foldDepthIntoRequest } from "./enhanceCard";
import { coerceCards, setTitleOf } from "./coerce-card";
import type { NewCardInput } from "./types";

/**
 * The normalized generation result. The agent's canonical response shape is
 * the `flashcard_set` kind `{ title, cards[] }`; `title` is the set's name
 * (persistence consumers read it as such).
 */
export interface GeneratedCardSet {
  title: string;
  cards: NewCardInput[];
  /**
   * The headless run's conversation id — the run's IDENTITY for the
   * single-writer dedupe contract (D-WP3). Persistence callers MUST pass it
   * to `fcService.createGeneratedSetForConversation` so the surface save and
   * the chat-materialization adapter converge on ONE fc_set.
   */
  conversationId: string | null;
}

/** Variables the generateCards agent declares (keys must match exactly). */
export interface GenerateCardsVariables {
  topic: string;
  count: number;
  difficulty: string;
  /** Optional — empty string is fine; the agent treats it as unset. */
  grade_level?: string;
  /** Optional freeform focus / emphasis. */
  user_request?: string;
  /**
   * VISION §1 (gap 8) — generation-time depth tier. Reaches the agent through
   * its declared `user_request` variable (foldDepthIntoRequest); becomes a
   * pass-through when the agents declare a `depth` variable.
   */
  depth?: Depth;
}

/**
 * Variables the generateFromSource agent declares (Phase 5 — Knowledge-sourced
 * generation). `source_content` is the concatenated text of the chunks the
 * user curated (checklist UI), NOT a whole document — the agent never sees
 * anything the user didn't explicitly include.
 */
export interface GenerateFromSourceVariables {
  source_content: string;
  /** The Knowledge document the chunks came from (echoed back in citations). */
  document_id?: string;
  count: number;
  difficulty: string;
  /** A name for the material — the agent titles the set from it. */
  title?: string;
  /** Freeform emphasis; the depth tier is folded in front of it. */
  focus?: string;
  /** Gap 8 — reaches this agent through its declared `focus` variable. */
  depth?: Depth;
}

function isFromSourceVars(
  vars: GenerateCardsVariables | GenerateFromSourceVariables,
): vars is GenerateFromSourceVariables {
  return "source_content" in vars;
}

export interface GenerateCardsResult {
  generate: (
    mandateKey: string,
    vars: GenerateCardsVariables | GenerateFromSourceVariables,
  ) => Promise<GeneratedCardSet>;
  isGenerating: boolean;
  error: string | null;
  /**
   * The live request id for the in-flight generation (null before the stream
   * connects). Consumers subscribe to it (selectKindEnvelope /
   * useLiveJsonRegion) to render the cards AS THEY STREAM instead of a
   * spinner.
   *
   * TIMING INVARIANT — this must be derived from Redux, never from the
   * launch thunk's resolution: for `displayMode: "direct"` + `autoRun`,
   * `launchAgentExecution` awaits the ENTIRE stream (executeInstance →
   * runAiStream → pollForCompletion) before resolving, so a requestId read
   * from `.unwrap()` only exists AFTER the generation is over — the exact
   * bug that starved the live preview. The conversationId arrives via the
   * pre-stream `onConversationCreated` hook; `createRequest` (dispatched by
   * executeInstance at connection time) then surfaces the requestId here
   * while the stream is still running.
   */
  activeRequestId: string | null;
}

// The agent is gemini-3.5-flash producing a full card set — generous ceiling.
const EXTRACTION_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 250;

/**
 * Coerce the extracted object into a GeneratedCardSet via THE ONE card reader
 * (`coerce-card.ts`). Accepts the canonical `flashcard_set` kind
 * `{ title, cards[] }` and the drift shapes (bare array / `flashcards` key).
 * Throws (caught by the caller) only when no cards can be recovered at all.
 */
function coerceGeneratedSet(value: unknown): Omit<GeneratedCardSet, "conversationId"> {
  if (!Array.isArray(value) && (!value || typeof value !== "object")) {
    throw new Error("Agent did not return a JSON object");
  }
  const cards = coerceCards(value);
  if (cards.length === 0) {
    throw new Error("Agent returned no usable cards");
  }
  return { title: setTitleOf(value), cards };
}

export function useGenerateCards(): GenerateCardsResult {
  const { run, isRunning, error, activeRequestId } = useHeadlessAgentJson();

  async function generate(
    mandateKey: string,
    vars: GenerateCardsVariables | GenerateFromSourceVariables,
  ): Promise<GeneratedCardSet> {
    const fromSource = isFromSourceVars(vars);
    return run<GeneratedCardSet>({
      mandateKey,
      surfaceKey: fromSource
        ? "flashcards-create-from-source"
        : "flashcards-create-from-topic",
      sourceFeature: "education-flashcards",
      surfaceName: "matrx-user/education-flashcards",
      // Live streaming preview owns the conversation — keep the instance so
      // consumers of activeRequestId (selectKindEnvelope readers) can render
      // the cards AS THEY STREAM and after completion.
      displayMode: "direct",
      keepInstance: true,
      variables: fromSource
        ? {
            // The provision's full offer (flashcards.generate_from_source):
            // every from-source caller sends this same superset.
            source_content: vars.source_content,
            document_id: vars.document_id ?? "",
            count: String(vars.count),
            difficulty: vars.difficulty,
            title: vars.title ?? "",
            // Gap 8 — the tier rides this agent's declared `focus` channel.
            focus: foldDepthIntoRequest(vars.depth, vars.focus) ?? "",
          }
        : {
            topic: vars.topic,
            count: String(vars.count),
            difficulty: vars.difficulty,
            grade_level: vars.grade_level ?? "",
            // Gap 8 — the tier leads; the learner's own request follows.
            user_request:
              foldDepthIntoRequest(vars.depth, vars.user_request) ?? "",
          },
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The flashcard agent failed before returning any cards",
        noJson: "Agent finished but produced no structured JSON",
        timeout: "Timed out waiting for the flashcard agent to respond",
      },
      coerce: (value, result) => ({
        ...coerceGeneratedSet(value),
        conversationId: result.conversationId ?? null,
      }),
    });
  }

  return { generate, isGenerating: isRunning, error, activeRequestId };
}
