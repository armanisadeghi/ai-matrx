// features/education/convert/steering.ts
//
// How a person steers one generation run beyond count and difficulty — the
// living-kit plan's W2: a free-text instruction, the card or question types they
// want, the outline sections to cover, and what already exists so nothing is
// made twice. Pure functions: every generator (deck, quiz, practice test, the
// deck page's "Add more", the kit chat) folds steering the SAME way, into the
// free-text slot its agent already declares (`focus` for decks, `user_request`
// for assessments) — no new agent variable, no structured data as user input.

import type { CardKind } from "@/features/flashcards/utils/cardVariants";
import type { QuestionType } from "@/features/education/assessment/data/types";
import type { OutlineSection } from "@/features/education/kits/outline/types";

/** Everything a person can steer a run with. Every field is optional. */
export interface GenerationSteer {
  /** What the person typed ("cards about isotopes", "harder, exam style"). */
  instruction?: string;
  /** Flashcard variants wanted; empty = the agent's own mix. */
  cardKinds?: CardKind[];
  /** Question types wanted; empty = the agent's own mix. */
  questionTypes?: QuestionType[];
  /** Outline sections this run must cover first (gaps or a picked section). */
  sections?: (Pick<OutlineSection, "title" | "facts"> & { id?: string })[];
  /** What already exists (card fronts or question prompts) — never repeat these. */
  existing?: string[];
}

/** The most existing items listed to the agent, and the most characters the fold may use. */
export const STEER_EXISTING_LIMIT = 80;
export const STEER_MAX_CHARS = 4_000;

const CARD_KIND_WORDS: Record<CardKind, string> = {
  basic: "basic question/answer cards (card_kind \"basic\")",
  cloze: "cloze deletion cards using {{c1::answer}} syntax (card_kind \"cloze\")",
  matching: "matching-pairs cards (card_kind \"matching\")",
  formula: "formula cards (card_kind \"formula\")",
};

const QUESTION_TYPE_WORDS: Record<QuestionType, string> = {
  multiple_choice: "multiple choice",
  true_false: "true/false",
  fill_blank: "fill in the blank",
  short_answer: "short answer",
  written_response: "written response",
};

/** One line naming the card kinds asked for, or null for "any". */
export function cardKindsLine(kinds: readonly CardKind[] | undefined): string | null {
  if (!kinds?.length) return null;
  return `Write only these card types: ${kinds.map((k) => CARD_KIND_WORDS[k]).join("; ")}.`;
}

/** The comma list the quiz agents read in `question_types` ("" = any). */
export function questionTypesValue(types: readonly QuestionType[] | undefined): string {
  return types?.length ? types.join(",") : "";
}

function sectionsBlock(sections: GenerationSteer["sections"]): string | null {
  if (!sections?.length) return null;
  const lines = sections.map((s) => {
    const facts = s.facts
      .slice(0, 6)
      .map((f) => `  - ${f.statement}`)
      .join("\n");
    return facts ? `- ${s.title}\n${facts}` : `- ${s.title}`;
  });
  return `Cover these sections first:\n${lines.join("\n")}`;
}

function existingBlock(existing: string[] | undefined, noun: string): string | null {
  const shown = (existing ?? []).map((e) => e.trim()).filter(Boolean).slice(0, STEER_EXISTING_LIMIT);
  if (shown.length === 0) return null;
  return `These ${noun} already exist — write different ones:\n${shown.map((e) => `- ${e}`).join("\n")}`;
}

/**
 * Fold steering into the agent's free-text slot. Order is priority: the
 * person's own words, then types, then sections, then the do-not-repeat list
 * (cut first when the fold is over budget — the post-filter still drops repeats).
 */
export function foldSteer(
  steer: GenerationSteer,
  kind: "cards" | "questions",
  base?: string,
): string {
  const head = [
    base?.trim() || null,
    steer.instruction?.trim() || null,
    kind === "cards" ? cardKindsLine(steer.cardKinds) : null,
    sectionsBlock(steer.sections),
  ].filter((p): p is string => Boolean(p));
  const headText = head.join("\n\n");
  const tail = existingBlock(steer.existing, kind);
  if (!tail) return headText.slice(0, STEER_MAX_CHARS);
  const room = STEER_MAX_CHARS - headText.length - 2;
  if (room <= 0) return headText.slice(0, STEER_MAX_CHARS);
  const cut = tail.length <= room ? tail : `${tail.slice(0, room).replace(/\n[^\n]*$/, "")}`;
  return headText ? `${headText}\n\n${cut}` : cut;
}

/**
 * The sections a "focus on gaps" run should cover: those holding fewer items
 * than the per-section average (rounded down), fewest first. When every
 * section is at or above the average, the least-covered third is returned so a
 * gap run always has somewhere to go.
 */
export function gapSections<S extends { id: string }>(
  sections: readonly S[],
  countBySection: ReadonlyMap<string, number>,
): S[] {
  if (sections.length === 0) return [];
  const counts = sections.map((s) => countBySection.get(s.id) ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const share = Math.floor(total / sections.length);
  const ranked = sections
    .map((s, i) => ({ s, n: counts[i], i }))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const below = ranked.filter((r) => r.n < share || r.n === 0);
  const picked = below.length > 0 ? below : ranked.slice(0, Math.max(1, Math.ceil(sections.length / 3)));
  return picked.map((r) => r.s);
}

/** A new id that groups the items one run adds, so "Undo last add" can find them. */
export function newBatchId(): string {
  return crypto.randomUUID();
}

/** The ids of the steered sections that carry one (empty = not aimed at sections). */
export function steeredSectionIds(steer: GenerationSteer | undefined): string[] {
  return (steer?.sections ?? []).map((s) => s.id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** A deck run's default size, matching the interactive deck creator's default. */
export const DEFAULT_DECK_CARD_COUNT = 10;

/**
 * THE OUTLINE-RUN SIZE LAW (2026-10-09: a "Focus on gaps" quiz over a six-section
 * outline made 84 questions). Over outline sections the planner would otherwise
 * scale the total by the number of sections; sections decide WHERE items go,
 * never HOW MANY. With no count typed, an outline run takes the kind's default
 * size. Without an outline (a plain source) the count stays source-scaled, so a
 * 77-slide deck still gets covered (convert/coverage.ts).
 */
export function outlineRunCount(
  typed: number | undefined,
  outlineRun: boolean,
  defaultCount: number,
): number | undefined {
  if (typed !== undefined && typed > 0) return typed;
  return outlineRun ? defaultCount : undefined;
}
