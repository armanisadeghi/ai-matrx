// features/flashcards/data/enhanceCard.ts
//
// "Make this deeper" — the depth-on-demand consumer surface for flashcards.
// Two Redux thunks driving the LIVE enrichCard / expandCard agents (ids in
// data/mandates.ts), running through the canonical headless primitive
// (`runHeadlessAgentJson`, D126). Each returns a coerced, persist-ready result or null on any
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
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { Depth } from "@/features/education/assessment/data/types";
import { FC_MANDATES } from "./mandates";
import type { CardWithDetails } from "./types";

/** The depth tiers, low → high, with the learner-facing label + one-line intent. */
export const DEPTH_TIERS: { value: Depth; label: string; blurb: string }[] = [
  { value: "recall", label: "Recall", blurb: "Grasp & remember the basics" },
  { value: "applied", label: "Applied", blurb: "Use it to solve problems" },
  { value: "exam", label: "Exam-level", blurb: "Exam-rigor depth & nuance" },
];

// ─── Generation-time depth (VISION §1 — "every AI generation path supports
// tiered depth", WP3 gap 8) ─────────────────────────────────────────────────
//
// The generation agents' declared variables carry the tier through their
// free-text focus channel (`user_request` / `focus`) — declared variables are
// the ONLY way values reach a bound agent (variable-binding doctrine), and
// this needs no agent edit. When a `depth` variable is later declared on the
// agents, this fold collapses to a plain pass-through.

/** What each tier asks the GENERATOR to do — one directive sentence. */
export const DEPTH_DIRECTIVES: Record<Depth, string> = {
  recall:
    "Depth tier: RECALL — foundational cards that build and test remembering " +
    "the core facts, terms, and definitions.",
  applied:
    "Depth tier: APPLIED — cards that make the learner USE the material: " +
    "solve, compute, predict, or apply it to a scenario, not just restate it.",
  exam:
    "Depth tier: EXAM-LEVEL — exam-rigor cards probing nuance, edge cases, " +
    "distinctions between similar concepts, and multi-step application.",
};

/**
 * Fold the chosen depth tier into a free-text agent variable, preserving
 * whatever the learner already typed there. Undefined depth = unchanged.
 */
export function foldDepthIntoRequest(
  depth: Depth | undefined,
  existing?: string,
): string | undefined {
  if (!depth) return existing?.trim() || undefined;
  const directive = DEPTH_DIRECTIVES[depth];
  const rest = existing?.trim();
  return rest ? `${directive}\n\n${rest}` : directive;
}

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

/**
 * 🚨 FOUND_DEFECTS D151 — where an UN-SAVED enhancement preview lives.
 *
 * Quota is committed the moment the agent answers (`enrichGuard.commit()`), so
 * a preview the user never got round to saving was billed and then destroyed by
 * a refresh, a closed dialog, or a route change. The proposal now lands on the
 * card itself the instant it arrives, exactly like the content-plan brief
 * writer's `ai_brief_draft`: it PROPOSES (the user still confirms), but the
 * proposal is durable, so nothing the user does — or fails to do — loses it.
 */
export const PENDING_ENHANCEMENT_KEY = "pending_enhancement";

export interface PendingEnhancement {
  mode: "enrich" | "deepen";
  depth: Depth;
  details: EnrichedDetail[];
  subCards: ExpandedSubCard[];
  generated_at: string;
}

/** Read a card's un-saved enhancement preview (null when there is none). */
export function readPendingEnhancement(
  metadata: unknown,
): PendingEnhancement | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>)[PENDING_ENHANCEMENT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const mode = row.mode === "deepen" ? "deepen" : "enrich";
  const details = coerceDetails({ details: row.details });
  const subCards = coerceSubCards({ sub_cards: row.subCards });
  if (mode === "enrich" ? details.length === 0 : subCards.length === 0) {
    return null;
  }
  const depthRaw = row.depth;
  return {
    mode,
    depth:
      depthRaw === "recall" || depthRaw === "applied" || depthRaw === "exam"
        ? depthRaw
        : "applied",
    details,
    subCards,
    generated_at: typeof row.generated_at === "string" ? row.generated_at : "",
  };
}

/** Persist (or clear) a card's pending enhancement preview. */
export async function writePendingEnhancement(
  cardId: string,
  pending: PendingEnhancement | null,
): Promise<void> {
  const { fcService } = await import("./fcService");
  const saved = await fcService.mergeCardJson(cardId, "metadata", (current) => {
    if (!pending) {
      const next = { ...current };
      delete next[PENDING_ENHANCEMENT_KEY];
      return next;
    }
    return {
      ...current,
      [PENDING_ENHANCEMENT_KEY]: {
        mode: pending.mode,
        depth: pending.depth,
        details: pending.details,
        subCards: pending.subCards,
        generated_at: pending.generated_at,
      },
    };
  });
  if (saved.error) {
    console.error(
      "[flashcards.enhanceCard] preview generated but NOT saved:",
      saved.error,
    );
  }
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

export function coerceDetails(raw: unknown): EnrichedDetail[] {
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

/**
 * Enrich ONE card with new detail layers at the chosen depth tier. Returns the
 * generated details (empty array if the agent produced none), or null on
 * launch/timeout failure.
 */
export function enrichCard(args: {
  card: CardWithDetails;
  depth: Depth;
  /**
   * Fires the moment the run's conversation exists — BEFORE the stream. The
   * caller mounts `<LiveRunDisplay conversationId>` on it so the user watches
   * the layers arrive instead of a spinner, and OWNS destroying the instance
   * (`destroyInstanceIfAllowed`) once done with the display.
   */
  onConversationCreated?: (conversationId: string) => void;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<EnrichedDetail[] | null> => {
    const { card, depth } = args;
    try {
      const existing = card.details.map((d) => ({ kind: d.kind, text: d.text }));
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey: FC_MANDATES.enrichCard,
        surfaceKey: "flashcards-enrich-card",
        sourceFeature: "education-flashcards",
        surfaceName: "matrx-user/education-flashcards",
        variables: {
          front: card.front,
          back: card.back,
          topic: card.topic ?? "",
          difficulty: DIFFICULTY_BY_DEPTH[depth],
          kinds: KINDS_BY_DEPTH[depth],
          existing_details: existing,
        },
        timeoutMs: 60_000,
        pollIntervalMs: 150,
        // Live posture (no spinner while AI works): the request survives the
        // run so the caller's LiveRunDisplay can bind it. The caller destroys
        // the instance when it is done showing the output.
        displayMode: "direct",
        keepInstance: true,
        ...(args.onConversationCreated
          ? { onConversationCreated: args.onConversationCreated }
          : {}),
        // D151 — quota is committed the moment this answers; the preview must
        // outlive the dialog that asked for it.
        onResult: async (run) => {
          const details = coerceDetails(run.data);
          if (details.length === 0) return;
          await writePendingEnhancement(card.id, {
            mode: "enrich",
            depth,
            details,
            subCards: [],
            generated_at: new Date().toISOString(),
          });
        },
      });
      return coerceDetails(result.data);
    } catch (err) {
      console.error("[flashcards.enrichCard] failed:", err);
      return null;
    }
  };
}

/**
 * Expand ONE card into atomic sub-cards at the chosen depth tier. Returns the
 * generated sub-cards (empty array if the agent produced none), or null on
 * launch/timeout failure. Persisting them (+ the `expands_into` link) is the
 * caller's job via `fcService.addSubCards`.
 */
export function expandCard(args: {
  card: CardWithDetails;
  depth: Depth;
  /** See `enrichCard` — the live-render handle; the caller owns cleanup. */
  onConversationCreated?: (conversationId: string) => void;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ExpandedSubCard[] | null> => {
    const { card, depth } = args;
    try {
      const result = await runHeadlessAgentJson(dispatch, getState, {
        mandateKey: FC_MANDATES.expandCard,
        surfaceKey: "flashcards-expand-card",
        sourceFeature: "education-flashcards",
        surfaceName: "matrx-user/education-flashcards",
        variables: {
          front: card.front,
          back: card.back,
          topic: card.topic ?? "",
          struggle_signal: EXPAND_SIGNAL_BY_DEPTH[depth],
        },
        timeoutMs: 60_000,
        pollIntervalMs: 150,
        // Live posture — see enrichCard.
        displayMode: "direct",
        keepInstance: true,
        ...(args.onConversationCreated
          ? { onConversationCreated: args.onConversationCreated }
          : {}),
        // D151 — see enrichCard: the proposal is durable the instant it lands.
        onResult: async (run) => {
          const subCards = coerceSubCards(run.data);
          if (subCards.length === 0) return;
          await writePendingEnhancement(card.id, {
            mode: "deepen",
            depth,
            details: [],
            subCards,
            generated_at: new Date().toISOString(),
          });
        },
      });
      return coerceSubCards(result.data);
    } catch (err) {
      console.error("[flashcards.expandCard] failed:", err);
      return null;
    }
  };
}
