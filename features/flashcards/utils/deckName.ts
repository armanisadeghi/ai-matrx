// features/flashcards/utils/deckName.ts
//
// THE NAME OF A DECK MADE FROM CHAT FLASHCARDS.
//
// Why this exists: the `<flashcards>` text format (---/Front:/Back:) had no
// title slot, while the `flashcard_set` kind REQUIRES `title` — so the platform
// itself filled in the word "Flashcards" (features/content-ir/surfaces/
// flashcards-legacy-text.ts and the server's `adapt_block_data`), and that
// placeholder became the permanent `education.fc_set.name`. Every deck a
// student made from chat was called "Flashcards" (conversation 10d796b4…,
// 2026-09-30: a 39-card polyatomic-ions deck).
//
// Two layers:
//   • the format now carries an optional `Title:` line (flashcard-parser.ts),
//     so an agent can name its own deck; and
//   • this module is the floor for every agent that still does not: a
//     PLACEHOLDER title is never treated as a name. A real name is derived
//     from what the set and the request that produced it actually say.
//
// A title the agent or the person actually chose is never rewritten — only the
// platform's own placeholders are. PURE: no I/O, no React.

/** The placeholder the platform writes when a flashcard set carries no title. */
export const GENERIC_FLASHCARD_TITLE = "Flashcards";

const GENERIC_TITLES = new Set([
  "flashcards",
  "flashcard",
  "flash cards",
  "flash card",
  "flashcard set",
  "flashcards set",
  "flashcard deck",
  "flashcards deck",
  "study cards",
  "cards",
  "deck",
  "new deck",
  "untitled",
  "untitled deck",
  "untitled set",
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * True when `title` names nothing: empty, one of the platform's placeholders,
 * or a placeholder plus a position ("Flashcards 2" — planMaterialization's
 * `titleFor`). "Spanish Flashcards" is a real name and returns false.
 */
export function isGenericFlashcardTitle(title: unknown): boolean {
  if (typeof title !== "string") return true;
  const normalized = normalizeTitle(title);
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  return GENERIC_TITLES.has(normalized.replace(/\s+\d+$/, ""));
}

// ---------------------------------------------------------------------------
// Subject of a request ("Make flashcards for all of the polyatomic ions
// covered in these notes" → "Polyatomic Ions").
// ---------------------------------------------------------------------------

const MAX_NAME_CHARS = 60;
const MAX_NAME_WORDS = 8;

/** Small words that stay lowercase inside a title. */
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor",
  "of", "on", "or", "the", "to", "vs", "via", "with",
]);

/** "flashcards <link> <subject>" — the subject follows the word. */
const SUBJECT_AFTER =
  /\bflash\s?cards?\s+(?:for|on|about|of|covering|over|regarding|to\s+(?:help\s+me\s+)?(?:learn|study|memori[sz]e|review|practi[cs]e))\s+(.+)/i;

/** "make me 20 <subject> flashcards" — the subject precedes the word. */
const SUBJECT_BEFORE =
  /\b(?:make|create|generate|build|write|give|need|want|prepare|produce)\s+(?:(?:me|us|up|some|a\s+few|a\s+set\s+of|a\s+deck\s+of|\d+|an?|the)\s+)*(.+?)\s+flash\s?cards?\b/i;

/** Where the subject ends and the rest of the sentence begins. */
const SUBJECT_END = new RegExp(
  [
    "[,;:(\\n]",
    "[.!?](?:\\s|$)",
    "\\s+(?:covered|mentioned|discussed|described|listed|found|included|contained|shown|used|taught|presented|that|which|who|including|using|based\\s+on|so\\s+that|please)\\b",
    "\\s+(?:in|from|within|for|on)\\s+(?:these|this|those|that|the|my|our|me|an?|attached|tomorrow)\\b",
    "\\s+with\\s+(?:\\d+|definitions|answers|examples|explanations)\\b",
    // A reduced relative clause: "…ions a first-year student must know".
    "\\s+(?:an?|the|every|each|you|we|i|they|students?|learners?)\\s+(?:[^\\s,.;:!?]+\\s+){0,5}?(?:must|should|needs?|ought|have\\s+to|has\\s+to|will|would|can)\\b",
  ].join("|"),
  "i",
);

/** Quantifiers and determiners in front of the subject. */
const SUBJECT_LEAD =
  /^(?:(?:all|each|every|any|some|both)\s+(?:of\s+)?)?(?:(?:the|these|those|this|that|my|our|an?)\s+)?/i;

/** A "subject" that only points at the material ("these notes", "it"). */
const POINTS_AT_MATERIAL =
  /^(?:(?:attached|above|below|following|uploaded|provided|given|whole|entire)\s+)?(?:notes?|documents?|docs?|files?|pdfs?|text|materials?|content|contents|pages?|slides?|transcripts?|videos?|articles?|study\s+guide|lecture|chapter|it|them|this|that|everything)\b/i;

/** Filler the "subject before" form can capture ("make me more flashcards"). */
const FILLER = new Set([
  "me", "us", "some", "more", "new", "good", "great", "study", "these",
  "those", "the", "a few", "several", "many",
]);

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      // A word that already carries a capital is a name or an acronym the
      // person typed (DNA, pH, McCarthy) — never flatten it.
      if (word !== word.toLowerCase()) return word;
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase() + word.slice(1);
    })
    .join(" ");
}

function usableName(candidate: string): boolean {
  if (candidate.length < 2 || candidate.length > MAX_NAME_CHARS) return false;
  if (candidate.split(/\s+/).length > MAX_NAME_WORDS) return false;
  if (!/\p{L}/u.test(candidate)) return false;
  return !isGenericFlashcardTitle(candidate);
}

/**
 * The subject a flashcard request names, as a title — or null when the
 * request names none ("make flashcards from these notes"). Deliberately
 * conservative: a wrong name is worse than the next fallback.
 */
export function subjectFromRequest(request: unknown): string | null {
  if (typeof request !== "string") return null;
  const text = request.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const after = text.match(SUBJECT_AFTER);
  let raw = after?.[1] ?? null;
  if (raw === null) {
    const before = text.match(SUBJECT_BEFORE)?.[1]?.trim() ?? null;
    if (before !== null && !FILLER.has(before.toLowerCase())) raw = before;
  }
  if (raw === null) return null;

  let subject = raw.replace(SUBJECT_LEAD, "");
  if (POINTS_AT_MATERIAL.test(subject)) return null;
  const end = subject.search(SUBJECT_END);
  if (end !== -1) subject = subject.slice(0, end);
  subject = subject.replace(/["'“”‘’]+/g, "").trim();
  if (!subject) return null;

  const name = titleCase(subject);
  return usableName(name) ? name : null;
}

// ---------------------------------------------------------------------------
// Name from the set itself.
// ---------------------------------------------------------------------------

export interface DeckNameCard {
  front?: string | null;
  topic?: string | null;
}

/** The one topic the cards share — null when they carry none or disagree. */
function sharedTopic(cards: readonly DeckNameCard[]): string | null {
  const topics = cards
    .map((card) => (typeof card.topic === "string" ? card.topic.trim() : ""))
    .filter(Boolean);
  if (topics.length === 0 || topics.length * 2 < cards.length) return null;
  const first = topics[0];
  const agree = topics.every(
    (topic) => topic.toLowerCase() === first.toLowerCase(),
  );
  return agree && usableName(first) ? first : null;
}

/** "Nitrate, Sulfate, Ammonium and more" — from short, term-like fronts. */
function nameFromFronts(cards: readonly DeckNameCard[]): string | null {
  const terms: string[] = [];
  let length = 0;
  for (const card of cards) {
    const front = typeof card.front === "string" ? card.front.trim() : "";
    // A term, not a question or a sentence.
    if (!front || front.length > 32 || /[?.!:]/.test(front)) continue;
    if (!/\p{L}/u.test(front)) continue;
    if (length + front.length > 40 || terms.length === 3) break;
    terms.push(front);
    length += front.length + 2;
  }
  if (terms.length === 0) return null;
  const listed = terms.join(", ");
  return cards.length > terms.length ? `${listed} and more` : listed;
}

export type DeckNameSource =
  | "title"
  | "topic"
  | "request"
  | "cards"
  | "placeholder";

export interface DeckName {
  name: string;
  /** Where the name came from — "placeholder" means nothing better existed. */
  source: DeckNameSource;
}

/**
 * The name a deck made from a flashcard set gets.
 *
 * A real title always wins. Only a placeholder is replaced, by the first of:
 * the topic the cards share, the subject of the request that produced them,
 * the cards' own terms. With none of those the placeholder stands.
 */
export function deriveFlashcardDeckName(input: {
  title?: string | null;
  cards?: readonly DeckNameCard[];
  /** The person's message that asked for the cards, when known. */
  request?: string | null;
}): DeckName {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title && !isGenericFlashcardTitle(title)) {
    return { name: title, source: "title" };
  }
  const cards = input.cards ?? [];

  const topic = sharedTopic(cards);
  if (topic) return { name: topic, source: "topic" };

  const subject = subjectFromRequest(input.request);
  if (subject) return { name: subject, source: "request" };

  const fronts = nameFromFronts(cards);
  if (fronts) return { name: fronts, source: "cards" };

  return { name: title || GENERIC_FLASHCARD_TITLE, source: "placeholder" };
}
