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
}

export interface AssembleTutorGroundingOptions {
  seed?: TutorGroundingSeed;
  /** Max weak cards to fold into the material digest (default 12). */
  maxCards?: number;
  itemType?: string;
}

/** Pull the front/back of specific fc_card ids via a dynamic import. */
async function fetchWeakCardDigest(cardIds: string[]): Promise<string> {
  if (cardIds.length === 0) return "";
  try {
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getCardsByIds(cardIds);
    const cards = res.data ?? [];
    if (cards.length === 0) return "";
    const lines = cards.map((c) => {
      const topic = c.topic ? ` [${c.topic}]` : "";
      return `- Card${topic}: "${c.front}" → "${c.back}"`;
    });
    return `The learner's weakest flashcards right now:\n${lines.join("\n")}`;
  } catch {
    return "";
  }
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
  const weakDigest = await fetchWeakCardDigest(weakIds);
  if (weakDigest) materialParts.push(weakDigest);

  return {
    learner_memory: memory.summaryText,
    study_material: materialParts.join("\n\n"),
    teaching_mode: settings.teachingMode,
    personality_style: settings.personalityStyle,
  };
}
