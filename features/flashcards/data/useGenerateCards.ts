"use client";

// features/flashcards/data/useGenerateCards.ts
//
// The reusable "run the generateCards agent → get structured cards back" hook.
// Mirrors the production consumer pattern in
// features/image-studio/hooks/useImageStudio.ts (launchAgentExecution +
// waitForExtraction): dispatch a direct, auto-running agent launch with JSON
// extraction on, poll the active-requests slice until extraction finalizes,
// then read the first extracted object.
//
// Returns the RAW agent JSON ({ title, cards[] } for FC_AGENTS.generateCards;
// the OLD set_title key is tolerated as a transition alias) coerced into a
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

import { useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectConversationRequestIds,
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { NewCardInput } from "./types";

/**
 * The normalized generation result. The agent's canonical response shape is
 * `{ title, cards[] }`; the field keeps its historical `set_title` name
 * internally (persistence consumers read it as the set's name).
 */
export interface GeneratedCardSet {
  set_title: string;
  cards: NewCardInput[];
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
}

/**
 * Variables the generateFromSource agent declares (Phase 5 — RAG-sourced
 * generation). `source_content` is the concatenated text of the chunks the
 * user curated (checklist UI), NOT a whole document — the agent never sees
 * anything the user didn't explicitly include.
 */
export interface GenerateFromSourceVariables {
  source_content: string;
  document_id: string;
  count: number;
  difficulty: string;
}

function isFromSourceVars(
  vars: GenerateCardsVariables | GenerateFromSourceVariables,
): vars is GenerateFromSourceVariables {
  return "source_content" in vars;
}

export interface GenerateCardsResult {
  generate: (
    agentId: string,
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
 * Coerce one raw card object (unknown JSON from the model) into a NewCardInput.
 * Drops cards missing both front and back; everything else floors to safe
 * defaults so a slightly-off agent payload still yields usable cards rather
 * than throwing. Returns null for an unusable entry.
 */
function coerceCard(raw: unknown): NewCardInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (key: string): string =>
    typeof r[key] === "string" ? (r[key] as string).trim() : "";
  const front = str("front");
  const back = str("back");
  if (!front && !back) return null;

  const optional = (key: string): string | null => {
    const v = r[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // Phase 5 (from-source): the agent echoes which passage a card came from
  // as `source: { processed_document_id, chunk_id, page }` per
  // AGENT_SPECS.md §2 — `file_id` is NOT something the agent knows (it's our
  // cld_file id, not a RAG identifier), so it's left blank here for the
  // from-source caller to backfill from the document the user picked before
  // persisting (fcService.addCards skips lineage entirely on an empty id).
  const rawSource = r.source;
  const source =
    rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
      ? (() => {
          const s = rawSource as Record<string, unknown>;
          const processedDocumentId =
            typeof s.processed_document_id === "string"
              ? s.processed_document_id
              : undefined;
          const chunkId =
            typeof s.chunk_id === "string" ? s.chunk_id : undefined;
          const page = typeof s.page === "number" ? s.page : undefined;
          return {
            file_id: "",
            processed_document_id: processedDocumentId,
            chunk_id: chunkId,
            page,
          };
        })()
      : undefined;

  return {
    front,
    back,
    card_kind: optional("card_kind") ?? "basic",
    difficulty: optional("difficulty"),
    topic: optional("topic"),
    source,
    // P0 TrustEnvelope — citations + confidence the agent emitted for this card
    // (null when the agent produced no envelope; ungrounded topic-gen omits it).
    trust: coerceTrustEnvelope(r) ?? undefined,
  };
}

/**
 * Coerce the extracted object into a GeneratedCardSet. Accepts the canonical
 * `{ title, cards[] }` and is tolerant of the transition/drift shapes (the
 * OLD `set_title` key, a bare array of cards, or a `flashcards` key) so a
 * prompt tweak doesn't break the flow silently. Throws (caught by the
 * caller) only when no cards can be recovered at all.
 */
function coerceGeneratedSet(value: unknown): GeneratedCardSet {
  // Bare array → treat as the cards list with no title.
  if (Array.isArray(value)) {
    const cards = value
      .map(coerceCard)
      .filter((c): c is NewCardInput => c !== null);
    if (cards.length === 0) throw new Error("Agent returned no usable cards");
    return { set_title: "", cards };
  }

  if (!value || typeof value !== "object") {
    throw new Error("Agent did not return a JSON object");
  }
  const obj = value as Record<string, unknown>;

  const set_title =
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.set_title === "string" && obj.set_title.trim()) ||
    "";

  const rawCards = Array.isArray(obj.cards)
    ? obj.cards
    : Array.isArray(obj.flashcards)
      ? obj.flashcards
      : [];
  const cards = rawCards
    .map(coerceCard)
    .filter((c): c is NewCardInput => c !== null);

  if (cards.length === 0) {
    throw new Error("Agent returned no usable cards");
  }
  return { set_title, cards };
}

export function useGenerateCards(): GenerateCardsResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The in-flight generation's conversation id — set by onConversationCreated
  // BEFORE the stream starts (the launch thunk itself only resolves after the
  // direct-mode stream fully completes; see the activeRequestId doc above).
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  // Live derivation: executeInstance dispatches createRequest at connection
  // time, which pushes the requestId onto byConversationId — this selector
  // fires the moment that happens, mid-stream. Last id wins (a re-generate on
  // the same conversation tracks its newest turn). Primitive return — safe
  // without createSelector.
  const activeRequestId = useAppSelector((state) => {
    if (!activeConversationId) return null;
    const ids = selectConversationRequestIds(activeConversationId)(state);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  });

  /**
   * Poll the active-requests slice until JSON extraction finalizes, then read
   * the first extracted object. Mirrors useImageStudio's `waitForExtraction`,
   * with an added fast-fail on a fatal request error so a dead stream doesn't
   * burn the full timeout.
   */
  async function waitForExtraction(
    requestId: string,
  ): Promise<GeneratedCardSet> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;

      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot) {
          throw new Error("Agent finished but produced no structured JSON");
        }
        return coerceGeneratedSet(snapshot.value);
      }

      // Fatal stream error — bail out loudly instead of waiting the full window.
      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "The flashcard agent failed before returning any cards",
        );
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the flashcard agent to respond");
  }

  async function generate(
    agentId: string,
    vars: GenerateCardsVariables | GenerateFromSourceVariables,
  ): Promise<GeneratedCardSet> {
    setIsGenerating(true);
    setError(null);
    setActiveConversationId(null); // a fresh run must not feed off the last one
    try {
      const fromSource = isFromSourceVars(vars);
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: fromSource
            ? "flashcards-create-from-source"
            : "flashcards-create-from-topic",
          agentId,
          sourceFeature: "education-flashcards",
          // The agent already has its response schema baked in — extraction is
          // enabled here so the streaming JSON tracker captures the object (the
          // direct-agentId launch path does NOT inherit extraction from the
          // agent definition the way a shortcut row would).
          jsonExtraction: { enabled: true },
          // Fires BEFORE the stream runs — this is what lets consumers watch
          // the request (and its content-ir envelopes) LIVE. The awaited
          // unwrap below only resolves after the direct-mode stream fully
          // completes, so it can never drive streaming UI.
          onConversationCreated: (conversationId) =>
            setActiveConversationId(conversationId),
          runtime: {
            surfaceName: "matrx-user/education-flashcards",
            variables: fromSource
              ? {
                  source_content: vars.source_content,
                  document_id: vars.document_id,
                  count: String(vars.count),
                  difficulty: vars.difficulty,
                }
              : {
                  topic: vars.topic,
                  count: String(vars.count),
                  difficulty: vars.difficulty,
                  grade_level: vars.grade_level ?? "",
                  user_request: vars.user_request ?? "",
                },
          },
          config: {
            autoRun: true,
            displayMode: "direct",
          },
        }),
      ).unwrap();

      if (!requestId) {
        throw new Error("Agent launch did not return a request id");
      }

      return await waitForExtraction(requestId);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate flashcards";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error, activeRequestId };
}
