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
// Returns the RAW agent JSON ({ set_title, cards[] } for FC_AGENTS.generateCards)
// coerced into a normalized shape so callers never touch `any`. Persisting the
// result (fc_set + fc_card rows) is the CALLER's job — this hook only owns the
// agent round-trip, so the same primitive serves from-topic, from-source, and
// future quiz flows.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
import type { NewCardInput } from "./types";

/** The agent's documented response shape: `{ set_title, cards[] }`. */
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

export interface GenerateCardsResult {
  generate: (
    agentId: string,
    vars: GenerateCardsVariables,
  ) => Promise<GeneratedCardSet>;
  isGenerating: boolean;
  error: string | null;
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

  return {
    front,
    back,
    card_kind: optional("card_kind") ?? "basic",
    difficulty: optional("difficulty"),
    topic: optional("topic"),
  };
}

/**
 * Coerce the extracted object into a GeneratedCardSet. Accepts the canonical
 * `{ set_title, cards[] }` and is tolerant of a couple of plausible drift
 * shapes (a bare array of cards, or a `title`/`flashcards` key) so a prompt
 * tweak doesn't break the flow silently. Throws (caught by the caller) only
 * when no cards can be recovered at all.
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
    (typeof obj.set_title === "string" && obj.set_title.trim()) ||
    (typeof obj.title === "string" && obj.title.trim()) ||
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

  /**
   * Poll the active-requests slice until JSON extraction finalizes, then read
   * the first extracted object. Mirrors useImageStudio's `waitForExtraction`,
   * with an added fast-fail on a fatal request error so a dead stream doesn't
   * burn the full timeout.
   */
  async function waitForExtraction(requestId: string): Promise<GeneratedCardSet> {
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
    vars: GenerateCardsVariables,
  ): Promise<GeneratedCardSet> {
    setIsGenerating(true);
    setError(null);
    try {
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: "flashcards-create-from-topic",
          agentId,
          sourceFeature: "flashcards",
          // The agent already has its response schema baked in — extraction is
          // enabled here so the streaming JSON tracker captures the object (the
          // direct-agentId launch path does NOT inherit extraction from the
          // agent definition the way a shortcut row would).
          jsonExtraction: { enabled: true },
          runtime: {
            variables: {
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

  return { generate, isGenerating, error };
}
