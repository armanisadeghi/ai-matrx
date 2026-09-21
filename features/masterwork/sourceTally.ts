// features/masterwork/sourceTally.ts
//
// THE ONE TALLY of what a Rulebook was built from — one identity, one set of
// nouns, one sentence, for every surface that answers the question.
//
// ## The screen this closes (cold walk 18, defect 2 — 2026-09-21)
//
// On `/masterwork/all`, SIX rows printed **"Nothing yet"** under SOURCE while
// the Rulebook behind each one plainly held an interview and a pasted
// document, and listed eighteen rules built out of them. On the walker's own
// Rulebook the same column printed a DIFFERENT falsehood: she added two pasted
// documents, its Sources panel went to **5**, and the cell stayed
// **"1 interview · 3 documents"**.
//
// ## The root cause, verified against the live rows
//
// A Rulebook's material lives in TWO stores, and `sourceLinks.ts` has said so
// since 2026-09-18:
//
//   KEPT      `platform.masterwork_source` — material we HOLD, in the
//             person's own words. Written by `raw_material.keep`.
//   ATTACHED  `platform.associations`, role `distillation_source` (a thing
//             pointed at) and role `interview` (the conversation a sitting
//             happened in), plus the URLs staged on
//             `rulebook.metadata.dump_url_sources`.
//
// The SOURCE column read the kept store ONLY. Live rows for the walk's own
// fixture, `walk18-Drain and Heater Verdict`
// (`3b12f1fd-526b-45c4-a201-1c47c9063e81`): four kept rows (one
// `interview:…`/`turns`, three `file:…`/`document`) and ten edges — three
// `distillation_source` → `file` that are the same three uploads, one
// `interview` → `conversation` that is the same sitting, and **two
// `distillation_source` → `udt_document`**, the two pasted documents, which
// have no kept row at all. Four counted, six present.
//
// And for the six "Nothing yet" rows the kept store is EMPTY. Census over
// `platform.associations` (2026-09-21): 17 live `distillation_source` → `note`
// edges and 53 `interview` → `conversation` edges, on Rulebooks whose
// `masterwork_source` count is zero — e.g. `e2fb516f-4708-493a-9650-…`, one
// interview plus one pasted note, kept rows: none. A column reading half the
// answer printed "Nothing yet" over an Expert's own recorded interview.
//
// ## What is overturned here, on purpose
//
// `browse/sourceSummary.ts` used to say, in so many words, that a merely
// ATTACHED source "has not built anything, so it is not in this sentence".
// That reasoning is dead: the six Rulebooks it silenced had produced up to 18
// rules FROM the material it refused to name. The column is headed SOURCE and
// its question is "what was this built from" — both stores answer it, and the
// union is taken by IDENTITY so nothing is counted twice.
//
// ## The nouns are not coined here
//
// A kept row's word comes from `MEDIUM_LABELS`, the map the kept-sources list
// renders. An attached edge's word comes from `ENTITY_TYPE_METADATA[token]
// .label`, the platform's own registry label. An interview is its own noun
// because that is what the product is for. Only the PLURALS are spelled out,
// because no map on the platform holds them — explicitly, never as a bare
// `+ "s"`, and a guard proves every token and medium the readers know about
// has one.
//
// Groups merge by their WORD, not by their key: a kept `document` row and an
// attached `udt_document` edge are both "documents", and a sentence reading
// "3 documents · 2 documents" would be the defect one layer down.

import { ENTITY_TYPE_METADATA, isEntityTypeToken } from "@ai-matrx/associations";

import { MEDIUM_LABELS } from "./kept-sources/columns";
import { KEPT_SOURCE_MEDIA, type KeptSourceMedium } from "./kept-sources/types";
import { isInterviewMaterial } from "./sourceIdentity";

/** One kind of raw material, in the Expert's own words. */
export interface SourceNouns {
  /** The stored word this group came from — `interview`, a medium, a token. */
  key: string;
  one: string;
  many: string;
}

/** An interview is its own noun, never its medium's ("conversation"). */
export const INTERVIEW_NOUNS = { one: "interview", many: "interviews" } as const;

/** A kind we have no word for is still named honestly, never by its key. */
export const UNKNOWN_NOUNS = { one: "source", many: "sources" } as const;

/**
 * Plural of each Expert-facing medium word. The SINGULAR is `MEDIUM_LABELS`
 * lower-cased, so there is exactly ONE vocabulary and a word changed in the
 * kept-sources list changes here in the same edit.
 */
const MEDIUM_PLURALS: Record<KeptSourceMedium, string> = {
  turns: "conversations",
  document: "documents",
  text: "texts",
  exchange: "exchanges",
};

/**
 * Plural of each attachable source token's registry label, lower-cased. The
 * SINGULAR is `ENTITY_TYPE_METADATA[token].label`, never repeated here.
 *
 * `conversation` is listed because an interview edge that has NOT been kept
 * still has to be named; it resolves to {@link INTERVIEW_NOUNS} when the edge
 * carries the interview role, and to this only otherwise.
 */
const ENTITY_TOKEN_PLURALS: Record<string, string> = {
  note: "notes",
  transcript: "transcripts",
  studio_session: "audio sessions",
  file: "files",
  udt_document: "documents",
  fc_set: "flashcard sets",
  research_topic: "research topics",
  pc_show: "podcast shows",
  pc_episode: "podcast episodes",
  pc_studio_run: "podcast studio runs",
  conversation: "conversations",
};

/** Exported so the guard can prove no token the panel attaches is missing. */
export const ENTITY_TOKEN_NOUN_KEYS = Object.keys(ENTITY_TOKEN_PLURALS);

/** The Expert's own word for a kept medium, in a sentence. */
export function mediumSentenceWord(medium: KeptSourceMedium): string {
  return MEDIUM_LABELS[medium].toLowerCase();
}

/** Words for a kept row's medium, or null when this reader cannot render it. */
export function mediumNouns(medium: string): SourceNouns | null {
  if (!KEPT_SOURCE_MEDIA.includes(medium as KeptSourceMedium)) return null;
  const known = medium as KeptSourceMedium;
  return {
    key: known,
    one: mediumSentenceWord(known),
    many: MEDIUM_PLURALS[known],
  };
}

/** Words for an attached entity token, or null when the platform has none. */
export function entityTokenNouns(token: string): SourceNouns | null {
  const plural = ENTITY_TOKEN_PLURALS[token];
  if (!plural) return null;
  if (!isEntityTypeToken(token)) return null;
  return {
    key: token,
    one: ENTITY_TYPE_METADATA[token].label.toLowerCase(),
    many: plural,
  };
}

/**
 * One piece of a Rulebook's material, reduced to what a tally needs.
 *
 * `sourceKey` is the platform's ONE source identity (`sourceIdentity.ts`,
 * mirroring `aidream/services/distillation/source_identity.py`). It is what
 * makes the union a union: the same upload arrives as a kept `file:<id>` row
 * AND as a `distillation_source` edge, and both are one source.
 */
export interface TallyableSource {
  sourceKey: string;
  /** `platform.approach.key` on a kept row. */
  approachKey?: string | null;
  /** `platform.masterwork_source.medium` on a kept row. */
  medium?: string | null;
  /** The entity token on an attached edge (`note`, `udt_document`, `file`…). */
  entityToken?: string | null;
  /** True when this edge is the `interview` role, or the row an interview kept. */
  interview?: boolean;
  /**
   * True for a row out of the KEPT store. On an identity collision the kept
   * side wins: it knows what the material turned out to BE ("document"),
   * where the edge only knows what it was pointed at ("file").
   */
  kept?: boolean;
}

/** One kind of raw material, and how many of it this Rulebook holds. */
export interface SourceGroup extends SourceNouns {
  count: number;
}

/** The words for one piece's kind. */
export function sourceNounsFor(item: TallyableSource): SourceNouns {
  if (item.interview || isInterviewMaterial({ approach_key: item.approachKey })) {
    return { key: "interview", ...INTERVIEW_NOUNS };
  }
  if (item.medium) {
    return mediumNouns(item.medium) ?? { key: item.medium, ...UNKNOWN_NOUNS };
  }
  if (item.entityToken) {
    return (
      entityTokenNouns(item.entityToken) ?? {
        key: item.entityToken,
        ...UNKNOWN_NOUNS,
      }
    );
  }
  return { key: "", ...UNKNOWN_NOUNS };
}

/**
 * THE tally: every piece counted ONCE under its identity, grouped by the word
 * an Expert would use for it.
 *
 * The interview LEADS however few turns it holds — it is the thing the product
 * is actually for — and everything else follows by how much of it there is.
 */
export function tallySourceGroups(items: readonly TallyableSource[]): {
  groups: SourceGroup[];
  total: number;
} {
  const distinct = new Map<string, TallyableSource>();
  for (const item of items) {
    const key = String(item.sourceKey ?? "").trim();
    if (!key) continue;
    const seen = distinct.get(key);
    if (!seen) distinct.set(key, item);
    else if (item.kept && !seen.kept) distinct.set(key, item);
  }

  const byWord = new Map<string, SourceGroup>();
  for (const item of distinct.values()) {
    const words = sourceNounsFor(item);
    const existing = byWord.get(words.one);
    if (existing) existing.count += 1;
    else byWord.set(words.one, { ...words, count: 1 });
  }

  const groups = [...byWord.values()].sort(
    (a, b) =>
      Number(b.key === "interview") - Number(a.key === "interview") ||
      b.count - a.count ||
      a.key.localeCompare(b.key),
  );
  return { groups, total: groups.reduce((n, g) => n + g.count, 0) };
}

/** "1 interview · 3 documents · 2 notes" — every kind present, named. */
export function formatSourceGroups(groups: readonly SourceGroup[]): string {
  return groups
    .map((g) => `${g.count} ${g.count === 1 ? g.one : g.many}`)
    .join(" · ");
}
