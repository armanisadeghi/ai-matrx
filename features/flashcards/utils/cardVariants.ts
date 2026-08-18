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
  formula: "formula",
} as const;
export type CardKind = (typeof CARD_KIND)[keyof typeof CARD_KIND];

export function asCardKind(value: string | null | undefined): CardKind {
  return value === CARD_KIND.cloze ||
    value === CARD_KIND.matching ||
    value === CARD_KIND.formula
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

// ─── Formula (VISION §17) ────────────────────────────────────────────────────
//
//   • formula — a STEM formula with its variable definitions and a worked
//     example (VISION §17). Same no-parallel-table rule: `front` is the
//     question/name ("What is the quadratic formula?"), the structure lives in
//     `fc_card.dynamic_content.formula`, `back` holds optional extra notes.
//     Studied as a flip: the back face is COMPOSED as markdown+LaTeX, so it
//     renders through the same pipeline as every other face (CardFaceContent /
//     ConfigurableMarkdownContent — display math via $$…$$).

/** One variable in the formula, with what it means. */
export interface FormulaVariable {
  symbol: string;
  meaning: string;
}

/** The formula payload, stored on `fc_card.dynamic_content.formula`. */
export interface FormulaContent {
  /** LaTeX body WITHOUT delimiters (e.g. `x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}`). */
  latex: string;
  variables: FormulaVariable[];
  /** A worked example, markdown+LaTeX. */
  example: string | null;
}

/**
 * Read the formula payload off a card's `dynamic_content` jsonb (never throws).
 * Returns null when the card isn't a well-formed formula card.
 */
export function formulaContent(
  card: Pick<FcCardRow, "dynamic_content">,
): FormulaContent | null {
  const dc = card.dynamic_content;
  if (!dc || typeof dc !== "object" || Array.isArray(dc)) return null;
  const raw = (dc as Record<string, unknown>).formula;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const latex = asString(r.latex);
  if (!latex) return null;
  const variables: FormulaVariable[] = [];
  if (Array.isArray(r.variables)) {
    for (const entry of r.variables) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const v = entry as Record<string, unknown>;
      const symbol = asString(v.symbol);
      const meaning = asString(v.meaning);
      if (symbol && meaning) variables.push({ symbol, meaning });
    }
  }
  const example = asString(r.example);
  return { latex, variables, example: example || null };
}

/** Build the `dynamic_content` jsonb payload for a formula card. */
export function formulaDynamicContent(content: FormulaContent): {
  formula: FormulaContent;
} {
  return {
    formula: {
      latex: content.latex.trim(),
      variables: content.variables
        .map((v) => ({ symbol: v.symbol.trim(), meaning: v.meaning.trim() }))
        .filter((v) => v.symbol && v.meaning),
      example: content.example?.trim() || null,
    },
  };
}

/**
 * Compose a formula card's back face as markdown+LaTeX: the formula as display
 * math, the variable definitions, the worked example, then any extra notes.
 * Pure text-in/text-out so every renderer (desktop, mobile, peek) gets it free.
 */
export function formulaBack(
  content: FormulaContent,
  extraNotes?: string | null,
): string {
  // Inline math MUST use \(…\): the markdown engine deliberately disables
  // single-$ inline math (currency safety), so `$x$` renders literally.
  const parts: string[] = [`$$${content.latex}$$`];
  if (content.variables.length > 0) {
    parts.push(
      content.variables
        .map((v) => `- \\(${v.symbol}\\) — ${v.meaning}`)
        .join("\n"),
    );
  }
  if (content.example) {
    parts.push(`**Worked example**\n\n${content.example}`);
  }
  if (extraNotes?.trim()) parts.push(extraNotes.trim());
  return parts.join("\n\n");
}

// ─── Faces bridge (what the study deck renders) ───────────────────────────────

/**
 * The flip faces to render for a card in study. `basic` and `cloze` are flip
 * cards; `matching` is NOT a flip (the deck branches to MatchingCardPlayer) —
 * this returns its prompt on both faces as a graceful fallback if it ever hits
 * the flip path.
 */
export function studyFaces(
  card: Pick<FcCardRow, "front" | "back" | "card_kind" | "dynamic_content">,
): { front: string; back: string } {
  const kind = asCardKind(card.card_kind);
  if (kind === CARD_KIND.cloze) {
    const faces = clozeFaces(card.front);
    const extra = card.back?.trim() ? `\n\n${card.back.trim()}` : "";
    return { front: faces.front, back: `${faces.back}${extra}` };
  }
  if (kind === CARD_KIND.formula) {
    const formula = formulaContent(card);
    // A mistagged formula card with no payload still renders as basic.
    if (formula) {
      return { front: card.front, back: formulaBack(formula, card.back) };
    }
  }
  return { front: card.front, back: card.back ?? "" };
}
