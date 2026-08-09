"use client";

// features/flashcards/data/useGenerateCards.ts
//
// The reusable "run the generateCards agent → get structured cards back" hook,
// built on the canonical `useHeadlessAgentJson` primitive (D126): a direct,
// auto-running agent launch with JSON extraction on; this hook owns only the
// variables and the card-set coercion.
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

import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
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
  const { run, isRunning, error, activeRequestId } = useHeadlessAgentJson();

  async function generate(
    agentId: string,
    vars: GenerateCardsVariables | GenerateFromSourceVariables,
  ): Promise<GeneratedCardSet> {
    const fromSource = isFromSourceVars(vars);
    return run<GeneratedCardSet>({
      agentId,
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
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The flashcard agent failed before returning any cards",
        noJson: "Agent finished but produced no structured JSON",
        timeout: "Timed out waiting for the flashcard agent to respond",
      },
      coerce: coerceGeneratedSet,
    });
  }

  return { generate, isGenerating: isRunning, error, activeRequestId };
}
