// features/flashcards/utils/cardVariants.ts
//
// Rich card VARIANTS — cloze deletions and matching pairs — modeled on the
// EXISTING fc_card columns, with NO parallel table (per the F1 brief). A card's
// `card_kind` selects the variant; `basic` (default) is the classic front/back.
//
//   • cloze    — the deletion source text lives in `fc_card.front` using Anki
//                syntax `{{c1::answer}}` / `{{c1::answer::hint}}`; `back` holds
//                optional extra notes. Studied as a flip: front shows the text
//                with blanks, back reveals the answers.
//   • matching — the pairs live in `fc_card.dynamic_content.pairs` (an existing
//                jsonb column); `front` is the prompt/title. Studied as a
//                tap-to-match mini-game (see MatchingCardPlayer).
//
// MCQ stays P1's (assessment) domain — not a flashcard variant.

import type { FcCardRow } from "../data/types";

/** The card_kind values this feature understands. Unknown kinds fall back to basic. */
export const CARD_KIND = {
  basic: "basic",
  cloze: "cloze",
  matching: "matching",
} as const;
export type CardKind = (typeof CARD_KIND)[keyof typeof CARD_KIND];

export function asCardKind(value: string | null | undefined): CardKind {
  return value === CARD_KIND.cloze || value === CARD_KIND.matching
    ? value
    : CARD_KIND.basic;
}

// ─── Cloze ────────────────────────────────────────────────────────────────────

/** One cloze deletion parsed out of the source text. */
export interface ClozeDeletion {
  /** Group number (Anki `c1`, `c2`, …); defaults to 1 when unnumbered. */
  group: number;
  answer: string;
  hint: string | null;
}

/** A cloze card's two studyable faces, derived from the deletion source text. */
export interface ClozeFaces {
  /** The prompt with each deletion replaced by a blank (or its hint). */
  front: string;
  /** The full text with every deletion revealed (answers emphasized). */
  back: string;
  deletions: ClozeDeletion[];
}

// {{c1::answer}} or {{c1::answer::hint}} or {{answer}} (implicit group 1).
const CLOZE_RE = /\{\{(?:c(\d+)::)?([^{}]*?)(?:::([^{}]*?))?\}\}/g;

/** True when the text contains at least one `{{…}}` cloze deletion. */
export function hasClozeMarkup(text: string): boolean {
  CLOZE_RE.lastIndex = 0;
  return CLOZE_RE.test(text);
}

/**
 * Parse a cloze source string into its studyable faces. Deletions are blanked
 * on the front (showing `[hint]` when a hint is present, else `[ … ]`) and
 * revealed (bolded) on the back. Text with no markup returns as-is on both
 * faces so a mistagged card still renders rather than showing an empty blank.
 */
export function clozeFaces(source: string): ClozeFaces {
  const deletions: ClozeDeletion[] = [];
  let hasAny = false;

  CLOZE_RE.lastIndex = 0;
  const front = source.replace(
    CLOZE_RE,
    (_m, groupRaw: string | undefined, answer: string, hint: string | undefined) => {
      hasAny = true;
      const group = groupRaw ? Number(groupRaw) : 1;
      const h = hint?.trim() ? hint.trim() : null;
      deletions.push({ group, answer: answer.trim(), hint: h });
      return h ? `**[${h}]**` : "**[ … ]**";
    },
  );

  CLOZE_RE.lastIndex = 0;
  const back = source.replace(
    CLOZE_RE,
    (_m, _g: string | undefined, answer: string) => `**${answer.trim()}**`,
  );

  return {
    front: hasAny ? front : source,
    back: hasAny ? back : source,
    deletions,
  };
}

// ─── Matching ───────────────────────────────────────────────────────────────

/** One left/right pair the learner must connect. */
export interface MatchingPair {
  left: string;
  right: string;
}

/** The full matching-card payload, stored on `fc_card.dynamic_content`. */
export interface MatchingContent {
  pairs: MatchingPair[];
}

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Read the matching pairs off a card's `dynamic_content` jsonb (never throws).
 * Returns an empty array when the card isn't a well-formed matching card.
 */
export function matchingPairs(
  card: Pick<FcCardRow, "dynamic_content">,
): MatchingPair[] {
  const dc = card.dynamic_content;
  if (!dc || typeof dc !== "object" || Array.isArray(dc)) return [];
  const rawPairs = (dc as Record<string, unknown>).pairs;
  if (!Array.isArray(rawPairs)) return [];
  const out: MatchingPair[] = [];
  for (const entry of rawPairs) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const left = asString(r.left);
    const right = asString(r.right);
    if (left && right) out.push({ left, right });
  }
  return out;
}

/** Build the `dynamic_content` jsonb payload for a matching card. */
export function matchingDynamicContent(pairs: MatchingPair[]): MatchingContent {
  return {
    pairs: pairs
      .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
      .filter((p) => p.left && p.right),
  };
}

// ─── Faces bridge (what the study deck renders) ───────────────────────────────

/**
 * The flip faces to render for a card in study. `basic` and `cloze` are flip
 * cards; `matching` is NOT a flip (the deck branches to MatchingCardPlayer) —
 * this returns its prompt on both faces as a graceful fallback if it ever hits
 * the flip path.
 */
export function studyFaces(
  card: Pick<FcCardRow, "front" | "back" | "card_kind">,
): { front: string; back: string } {
  const kind = asCardKind(card.card_kind);
  if (kind === CARD_KIND.cloze) {
    const faces = clozeFaces(card.front);
    const extra = card.back?.trim() ? `\n\n${card.back.trim()}` : "";
    return { front: faces.front, back: `${faces.back}${extra}` };
  }
  return { front: card.front, back: card.back ?? "" };
}
