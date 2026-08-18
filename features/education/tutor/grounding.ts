// features/education/tutor/grounding.ts
//
// Assembles the context policies that ground a tutor conversation in the
// learner's OWN material + cross-session memory (VISION §4, P2). The
// mandate-held tutor receives them on every turn, so it opens already knowing
// who the learner is and can cite passages retrieved for the current question.
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
// feature. Retrieval failures stay explicit in `retrieval`; the send boundary
// refuses and preserves the learner's draft rather than widening the corpus.

import { assembleLearnerMemory } from "./learnerMemory";
import { getTutorSettings } from "./settings";
import type {
  SourceCitation,
  TrustEnvelope,
} from "@/features/education/trust/types";
import {
  retrieveGroundedPassages,
  serializeGroundedPassages,
  type GroundingResult,
} from "@/features/rag/api/grounding";

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
  response_language: string;
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
  /** Exact same-turn RAG result; null when no question was supplied. */
  retrieval: GroundingResult | null;
}

export interface AssembleTutorGroundingOptions {
  seed?: TutorGroundingSeed;
  /** Max weak cards to fold into the material digest (default 12). */
  maxCards?: number;
  itemType?: string;
  /** Current learner question. When present, retrieval happens before send. */
  query?: string;
  /** Required with query so learner_owned corpus selection is exact. */
  userId?: string;
  /** Canonical generated-text language preference from Settings. */
  responseLanguage?: string;
}

/** Request-only evidence and its compact durable citation-coordinate ledger. */
export const TUTOR_CITATION_CONTEXT_PREFIX = "tutor_grounding_citation_";
export const TUTOR_RETRIEVED_EVIDENCE_KEY = "tutor_retrieved_evidence";
export const TUTOR_MAX_CITATION_POINTERS = 4;

export interface TutorCitationPointer {
  key: string;
  value: string;
}

/**
 * Compact coordinates persisted beside the deferred evidence. Each value stays
 * below the platform's 200-character default inline ceiling, so the completed
 * user turn retains enough canonical identity to validate/open citations after
 * reload without duplicating the full passage or rerunning retrieval.
 */
export function tutorCitationPointers(
  retrieval: GroundingResult | null,
): TutorCitationPointer[] {
  const passages = retrieval?.status === "retrieved" ? retrieval.passages : [];
  return Array.from({ length: TUTOR_MAX_CITATION_POINTERS }, (_, index) => {
    const passage = passages[index];
    if (!passage) {
      return {
        key: `${TUTOR_CITATION_CONTEXT_PREFIX}${index + 1}`,
        value: "",
      };
    }
    const tuple = [
      passage.chunkId,
      passage.fileId ?? "",
      passage.documentId ?? "",
      passage.page ?? null,
      passage.title.slice(0, 60),
    ];
    let value = JSON.stringify(tuple);
    if (value.length > 199) {
      tuple[2] = "";
      tuple[4] = passage.title.slice(0, 24);
      value = JSON.stringify(tuple);
    }
    if (value.length > 199) {
      tuple[1] = "";
      tuple[2] = "";
      tuple[4] = "";
      value = JSON.stringify(tuple);
    }
    return {
      key: `${TUTOR_CITATION_CONTEXT_PREFIX}${index + 1}`,
      value,
    };
  });
}

export function parseTutorCitationPointer(
  value: string,
): SourceCitation | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 5) return null;
    const [chunkId, fileId, documentId, page, title] = parsed;
    if (
      typeof chunkId !== "string" ||
      !chunkId ||
      typeof fileId !== "string" ||
      typeof documentId !== "string" ||
      (page !== null &&
        (typeof page !== "number" || !Number.isInteger(page) || page < 1)) ||
      typeof title !== "string"
    ) {
      return null;
    }
    return {
      sourceId: chunkId,
      sourceKind: "chunk",
      title: title || "Uploaded study material",
      locator: page !== null ? `p. ${page}` : "Retrieved passage",
      ...(fileId ? { fileId } : {}),
      ...(documentId ? { documentId } : {}),
      ...(page !== null ? { page } : {}),
    };
  } catch {
    return null;
  }
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
  retrieval: GroundingResult | null,
): TrustEnvelope {
  const citations: SourceCitation[] = [...(retrieval?.trust.citations ?? [])];
  if (seed?.material) {
    citations.push({
      sourceId: "tutor-seed",
      sourceKind: "scope",
      title: seed.title || "The item you're on",
      excerpt: seed.material,
    });
  }
  for (const c of weakCards) {
    citations.push({
      sourceId: c.id,
      sourceKind: "scope",
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

  const retrieval = opts.query?.trim()
    ? await retrieveGroundedPassages(
        { query: opts.query, corpus: { mode: "learner_owned" }, limit: 4 },
        { userId: opts.userId },
      )
    : null;

  const materialParts: string[] = [];
  if (retrieval?.status === "retrieved") {
    materialParts.push(serializeGroundedPassages(retrieval.passages));
  } else if (retrieval?.status === "empty") {
    materialParts.push(
      "No supporting passage was found in the learner's uploaded materials for this question. Say that plainly; do not silently answer from general knowledge.",
    );
  }
  if (opts.seed?.material) {
    const label = opts.seed.title
      ? `${opts.seed.title}`
      : "The item the learner is on";
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
    response_language: opts.responseLanguage?.trim() || "English",
    trust: deriveGroundingTrust(opts.seed, weakCards, retrieval),
    retrieval,
  };
}
