// features/education/spoken-practice/data/grounding.ts
//
// Turns a chosen grounding source into (a) the `study_material` text handed to
// the session designer agent, and (b) the per-prompt TrustEnvelope the runner
// renders. Grounding is the headline capability — an oral exam on the student's
// OWN deck — so this reuses the flashcard service to read deck content (dynamic
// import so spoken-practice never statically depends on flashcards).

import type {
  SourceCitation,
  TrustConfidence,
  TrustEnvelope,
} from "@/features/education/trust/types";
import type { PracticeSource } from "../types";

/** Cap how much deck text we send as grounding (keeps the prompt lean). */
const MAX_GROUNDING_CARDS = 40;

/**
 * Build a grounding source from one of the student's decks. Reads the deck's
 * cards and flattens them into a compact study-material digest. Returns null if
 * the deck can't be loaded or has no cards (caller falls back to topic-only).
 */
export async function buildDeckSource(
  setId: string,
): Promise<PracticeSource | null> {
  const { fcService } = await import("@/features/flashcards/data/fcService");
  const res = await fcService.getSetWithCards(setId);
  if (res.error || !res.data || res.data.cards.length === 0) return null;

  const { set, cards } = res.data;
  const material = cards
    .slice(0, MAX_GROUNDING_CARDS)
    .map((c, i) => `${i + 1}. ${c.front.trim()} — ${c.back.trim()}`)
    .join("\n");

  return {
    kind: "set",
    setId: set.id,
    title: `${set.name} deck`,
    material,
  };
}

/** Build a topic/paste source. `material` may be empty (pure-topic session). */
export function buildTopicSource(
  focus: string,
  pastedMaterial: string,
): PracticeSource | null {
  const material = pastedMaterial.trim();
  if (!material) return null; // no material to ground in — leave source null
  return {
    kind: "topic",
    title: "your pasted material",
    material,
  };
}

/**
 * Assemble the per-prompt TrustEnvelope from the agent's honest `confidence` and
 * the known source. Carries a real citation when the prompt is grounded in a
 * concrete source; drops citations for `not_in_material` (the honest-refusal
 * signal). This is the "attach source refs at persist time" pattern — the agent
 * judges confidence, we attach the citation to the source we actually handed it.
 */
export function promptTrust(
  confidence: TrustConfidence,
  source: PracticeSource | null,
): TrustEnvelope {
  const citations: SourceCitation[] = [];
  if (source && source.material && confidence !== "not_in_material") {
    citations.push({
      sourceId: source.setId ?? source.title,
      sourceKind: source.kind === "set" ? "section" : "document",
      title: source.title,
    });
  }
  return {
    citations,
    confidence,
    groundedIn: source?.title,
  };
}
