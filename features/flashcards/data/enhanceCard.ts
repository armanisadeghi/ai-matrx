// features/flashcards/data/enhanceCard.ts
//
// "Make this deeper" — the depth-on-demand consumer surface for flashcards.
// Two Redux thunks driving the LIVE enrichCard / expandCard agents (ids in
// data/agents.ts), mirroring the assessment `deepenItem` pattern
// (launchAgentExecution → wait for extracted JSON → destroy the ephemeral
// instance). Each returns a coerced, persist-ready result or null on any
// skip/failure (the caller shows a toast, never a hard block).
//
//   • enrichCard → adds fc_detail LAYERS (helper / example / mnemonic / …) to
//     ONE card, written at the chosen depth tier.
//   • expandCard → splits ONE card into atomic sub-cards, linked to the parent
//     by an `expands_into` edge, generated at the chosen depth tier.
//
// The depth tier (recall → applied → exam) is the SAME vocabulary P1's
// assessment engine uses (`Depth`) so a card and a quiz item mean the same
// thing by "applied" — the agents have no native depth variable, so we thread
// the tier through the variables they DO declare (enrich: difficulty + kinds;
// expand: struggle_signal).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import type { Depth } from "@/features/education/assessment/data/types";
import { FC_AGENTS } from "./agents";
import type { CardWithDetails } from "./types";

/** The depth tiers, low → high, with the learner-facing label + one-line intent. */
export const DEPTH_TIERS: { value: Depth; label: string; blurb: string }[] = [
  { value: "recall", label: "Recall", blurb: "Grasp & remember the basics" },
  { value: "applied", label: "Applied", blurb: "Use it to solve problems" },
  { value: "exam", label: "Exam-level", blurb: "Exam-rigor depth & nuance" },
];

/** A generated detail layer, ready to persist as an `fc_detail` row. */
export interface EnrichedDetail {
  kind: string;
  text: string;
}

/** A generated atomic sub-card, ready to persist + link via `expands_into`. */
export interface ExpandedSubCard {
  front: string;
  back: string;
}

/** fc_detail kinds the enrich agent is allowed to emit (mirrors AGENT_SPECS §3). */
const VALID_DETAIL_KINDS = [
  "helper",
  "example",
  "detailed",
  "hint",
  "mnemonic",
  "simplified",
] as const;

/**
 * The detail kinds to emphasize per depth tier. Recall favors grasp aids
 * (simplified/mnemonic/helper); applied favors worked examples; exam favors
 * nuanced detail + traps.
 */
const KINDS_BY_DEPTH: Record<Depth, string[]> = {
  recall: ["helper", "simplified", "mnemonic"],
  applied: ["example", "detailed", "helper"],
  exam: ["detailed", "example", "hint"],
};

/** A cognitive-level descriptor passed as the enrich agent's `difficulty`. */
const DIFFICULTY_BY_DEPTH: Record<Depth, string> = {
  recall: "foundational recall",
  applied: "applied / problem-solving",
  exam: "exam-level rigor",
};

/** The depth-framed instruction handed to the expand agent's `struggle_signal`. */
const EXPAND_SIGNAL_BY_DEPTH: Record<Depth, string> = {
  recall:
    "Break this into the smallest atomic recall facts a learner must know first.",
  applied:
    "Break this into sub-cards that each require APPLYING the concept to a concrete case, not just recalling it.",
  exam:
    "Break this into exam-level sub-cards covering the nuances, edge cases, and common traps an exam would test.",
};

const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

function coerceDetails(raw: unknown): EnrichedDetail[] {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const arr = Array.isArray(obj.details) ? obj.details : [];
  const out: EnrichedDetail[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const text = asString(r.text);
    if (!text) continue;
    const rawKind = asString(r.kind);
    const kind = (VALID_DETAIL_KINDS as readonly string[]).includes(rawKind)
      ? rawKind
      : "helper";
    out.push({ kind, text });
  }
  return out;
}

function coerceSubCards(raw: unknown): ExpandedSubCard[] {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const arr = Array.isArray(obj.sub_cards)
    ? obj.sub_cards
    : Array.isArray(obj.subCards)
      ? obj.subCards
      : [];
  const out: ExpandedSubCard[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const front = asString(r.front);
    const back = asString(r.back);
    if (!front && !back) continue;
    out.push({ front, back });
  }
  return out;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 60_000,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    if (selectRequestStatus(requestId)(state) === "error") {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/**
 * Enrich ONE card with new detail layers at the chosen depth tier. Returns the
 * generated details (empty array if the agent produced none), or null on
 * launch/timeout failure.
 */
export function enrichCard(args: { card: CardWithDetails; depth: Depth }) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<EnrichedDetail[] | null> => {
    const { card, depth } = args;
    let conversationId: string | null = null;
    try {
      const existing = card.details.map((d) => ({ kind: d.kind, text: d.text }));
      const launch = await dispatch(
        launchAgentExecution({
          agentId: FC_AGENTS.enrichCard,
          surfaceKey: "flashcards-enrich-card",
          sourceFeature: "education-flashcards",
          isEphemeral: false,
          runtime: {
            variables: {
              front: card.front,
              back: card.back,
              topic: card.topic ?? "",
              difficulty: DIFFICULTY_BY_DEPTH[depth],
              kinds: KINDS_BY_DEPTH[depth],
              existing_details: existing,
            },
          },
          config: { autoRun: true, displayMode: "direct" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;
      return coerceDetails(await waitForObject(getState, requestId));
    } catch (err) {
      console.error("[flashcards.enrichCard] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}

/**
 * Expand ONE card into atomic sub-cards at the chosen depth tier. Returns the
 * generated sub-cards (empty array if the agent produced none), or null on
 * launch/timeout failure. Persisting them (+ the `expands_into` link) is the
 * caller's job via `fcService.addSubCards`.
 */
export function expandCard(args: { card: CardWithDetails; depth: Depth }) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ExpandedSubCard[] | null> => {
    const { card, depth } = args;
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: FC_AGENTS.expandCard,
          surfaceKey: "flashcards-expand-card",
          sourceFeature: "education-flashcards",
          isEphemeral: false,
          runtime: {
            variables: {
              front: card.front,
              back: card.back,
              topic: card.topic ?? "",
              struggle_signal: EXPAND_SIGNAL_BY_DEPTH[depth],
            },
          },
          config: { autoRun: true, displayMode: "direct" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;
      return coerceSubCards(await waitForObject(getState, requestId));
    } catch (err) {
      console.error("[flashcards.expandCard] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
