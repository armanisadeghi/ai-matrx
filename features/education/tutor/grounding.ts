// features/education/tutor/grounding.ts
//
// Assembles the launch variables that ground a tutor conversation in the
// learner's OWN material + cross-session memory (VISION §4, P2). The tutor
// agent (features/education/tutor/agents.ts) substitutes these into its system
// prompt at launch, so it opens already knowing who the learner is and what
// they've studied — and can cite it.
//
//   learner_memory   — the cross-session snapshot (assembleLearnerMemory)
//   study_material   — a compact, citable digest of the learner's own content:
//                      an optional SEED (the exact card/item a surface handed
//                      us, e.g. AskTutor from a flashcard) plus a digest of
//                      their weakest cards, so a standalone tutor session is
//                      grounded in real decks the learner is struggling with.
//   teaching_mode / personality_style — from the learner's tutor settings.
//
// Mode-agnostic: flashcard content is pulled via a DYNAMIC import of fcService,
// so this foundational module never statically depends on the flashcards
// feature. Never throws — grounding failures degrade to empty material and the
// tutor honestly says it has nothing loaded yet.

import { assembleLearnerMemory } from "./learnerMemory";
import { getTutorSettings } from "./settings";
import type {
  SourceCitation,
  TrustEnvelope,
} from "@/features/education/trust/types";

/** A specific item a surface wants the tutor grounded in (AskTutor entry). */
export interface TutorGroundingSeed {
  /** Display label for the source (set name, note title, "this flashcard"). */
  title?: string;
  /** The verbatim item content to ground in (e.g. "Front: … / Back: …"). */
  material: string;
}

export interface TutorLaunchGrounding {
  learner_memory: string;
  study_material: string;
  teaching_mode: string;
  personality_style: string;
  /**
   * P0 TrustEnvelope for the conversation surface — derived from the KNOWN
   * grounding sources (the seed item + the learner's weak-card digest), NOT
   * fabricated. Confidence floors at `inferred` (the tutor reasons from this
   * corpus; a launch envelope can't promise per-claim `grounded`), and drops to
   * `not_in_material` when there's no corpus at all so the surface can show the
   * honest "answers are general knowledge" notice. The agent prompt still does
   * per-answer inline citation + honest refusal; this is the visible, structured
   * companion (citations + confidence + refusal) the P0 mandate requires on the
   * tutor surface. Null only if trust derivation itself is impossible.
   */
  trust: TrustEnvelope | null;
}

export interface AssembleTutorGroundingOptions {
  seed?: TutorGroundingSeed;
  /** Max weak cards to fold into the material digest (default 12). */
  maxCards?: number;
  itemType?: string;
}

interface WeakCard {
  id: string;
  front: string;
  back: string;
  topic: string | null;
}

/** Pull the front/back of specific fc_card ids via a dynamic import. */
async function fetchWeakCards(cardIds: string[]): Promise<WeakCard[]> {
  if (cardIds.length === 0) return [];
  try {
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getCardsByIds(cardIds);
    return (res.data ?? []).map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      topic: c.topic ?? null,
    }));
  } catch {
    return [];
  }
}

function weakCardDigest(cards: WeakCard[]): string {
  if (cards.length === 0) return "";
  const lines = cards.map((c) => {
    const topic = c.topic ? ` [${c.topic}]` : "";
    return `- Card${topic}: "${c.front}" → "${c.back}"`;
  });
  return `The learner's weakest flashcards right now:\n${lines.join("\n")}`;
}

/**
 * Build the surface TrustEnvelope from the KNOWN grounding sources. Real
 * citations (the seed + weak cards), an honest `inferred` floor, and
 * `not_in_material` when there's nothing loaded — never a fabricated
 * `grounded`. See `TutorLaunchGrounding.trust`.
 */
function deriveGroundingTrust(
  seed: TutorGroundingSeed | undefined,
  weakCards: WeakCard[],
): TrustEnvelope {
  const citations: SourceCitation[] = [];
  if (seed?.material) {
    citations.push({
      sourceId: "tutor-seed",
      sourceKind: "chunk",
      title: seed.title || "The item you're on",
      excerpt: seed.material,
    });
  }
  for (const c of weakCards) {
    citations.push({
      sourceId: c.id,
      sourceKind: "chunk",
      title: c.front,
      excerpt: `${c.front} → ${c.back}`,
      locator: c.topic ?? undefined,
    });
  }
  const groundedIn = seed?.title || "your studied material";
  return {
    citations,
    confidence: citations.length > 0 ? "inferred" : "not_in_material",
    groundedIn,
  };
}

/**
 * Assemble the tutor launch grounding (memory + citable material + teaching
 * prefs). Safe to call at conversation start; never throws.
 */
export async function assembleTutorGrounding(
  opts: AssembleTutorGroundingOptions = {},
): Promise<TutorLaunchGrounding> {
  const maxCards = opts.maxCards ?? 12;
  const settings = getTutorSettings();

  const memory = await assembleLearnerMemory({ itemType: opts.itemType });

  const materialParts: string[] = [];
  if (opts.seed?.material) {
    const label = opts.seed.title ? `${opts.seed.title}` : "The item the learner is on";
    materialParts.push(`${label}:\n${opts.seed.material}`);
  }

  const weakIds = memory.weakAreas
    .filter((w) => w.itemType === "fc_card")
    .map((w) => w.itemId)
    .slice(0, maxCards);
  const weakCards = await fetchWeakCards(weakIds);
  const weakDigest = weakCardDigest(weakCards);
  if (weakDigest) materialParts.push(weakDigest);

  return {
    learner_memory: memory.summaryText,
    study_material: materialParts.join("\n\n"),
    teaching_mode: settings.teachingMode,
    personality_style: settings.personalityStyle,
    trust: deriveGroundingTrust(opts.seed, weakCards),
  };
}
