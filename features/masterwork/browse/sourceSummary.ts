// features/masterwork/browse/sourceSummary.ts
//
// WHAT THIS RULEBOOK WAS BUILT FROM, in one line, for the column called SOURCE.
//
// ## The screen this closes (cold walk 16, defect F — also walk 15's I and
// ## walk 14's E, unchanged across three walks)
//
// `/masterwork/all` printed `—` under **SOURCE** on all twelve rows read,
// including a Rulebook built forty minutes earlier from one interview and five
// named files. Three cold walks recorded it and it never moved.
//
// ## The root cause, which is not a missing query
//
// Nothing was broken. The column READ THE WRONG FIELD. It rendered
// `rulebook.source.author` — a bibliographic jsonb blob (`title`, `author`,
// `year`, `license`, `provenance_url`) that only the book-import lane ever
// fills. Every Rulebook built the way the product actually teaches people to
// build one — talk it through, dump what you have, upload a recording — has
// `source = {}` and always did. So a column headed SOURCE was answering
// "who WROTE the book this came from", a question almost no row has, and
// saying `—` to the twelve that were built from something else.
//
// The raw material was never missing. `platform.masterwork_source` holds one
// row per captured source per Rulebook — the chokepoint every acquisition door
// writes through — and the list page had simply never asked it anything.
//
// ## What the column says now
//
// The kept material, counted and named: "1 interview · 5 documents". The
// bibliographic author survives as the fallback for the rows that genuinely
// have one, so nothing a book import used to show is lost.
//
// THE NOUNS ARE NOT COINED HERE. The medium's Expert-facing word comes from
// `MEDIUM_LABELS`, the same map the kept-sources list renders, and the
// interview split comes from `sourceIdentity.isInterviewMaterial` — the module
// that already decided what one source IS, mirroring the server's
// `source_identity.py`. A second, cosmetic vocabulary on this side would be
// the same defect one layer up.
//
// ## What it counts, said plainly
//
// KEPT material only — the sources we HOLD, in the person's own words. A
// source merely ATTACHED (an `associations` edge pointing at something we have
// not read yet) has not built anything, so it is not in this sentence.
// `../sourceLinks.ts` owns the union for the GATE ("does this Rulebook have
// material at all"), which is a different question from "what was this built
// from".

import { MEDIUM_LABELS } from "../kept-sources/columns";
import { KEPT_SOURCE_MEDIA, type KeptSourceMedium } from "../kept-sources/types";
import { isInterviewMaterial } from "../sourceIdentity";

/** The two fields the tally needs off a `platform.masterwork_source` row. */
export interface SourceTallyRow {
  rulebook_id: string;
  approach_key: string | null;
  medium: string;
}

/** One kind of raw material, and how many of it this Rulebook holds. */
export interface SourceGroup {
  /** The stored word this group came from — `interview`, or a medium. */
  key: string;
  one: string;
  many: string;
  count: number;
}

/**
 * What the SOURCE cell knows about one Rulebook.
 *
 * `unavailable` is a real state and it is SAID on screen, never drawn as `—`:
 * the tally read failing is not the same fact as a Rulebook having no sources,
 * and a column that renders both as a dash is the defect this file closes,
 * wearing a different hat (law 4).
 */
export type RulebookSourcesRead =
  | {
      state: "read";
      groups: SourceGroup[];
      total: number;
      /**
       * True when the scan hit its cap, so these counts are a FLOOR. The cell
       * then says so with a `+` rather than printing a number it cannot stand
       * behind.
       */
      partial: boolean;
    }
  | { state: "unavailable" };

/** A medium we have no word for is still named honestly, never by its key. */
const UNKNOWN_MEDIUM = { one: "source", many: "sources" };

/**
 * An interview is its own noun, not its medium's.
 *
 * Its kept row is `medium = "turns"`, which `MEDIUM_LABELS` calls a
 * Conversation — true, and useless here: "1 conversation · 5 documents" hides
 * the single most important thing about how this Rulebook was built. The
 * Approach that captured it is the authority, exactly as
 * `isInterviewMaterial` says.
 */
export const INTERVIEW_GROUP = { one: "interview", many: "interviews" };

/**
 * Plural of each Expert-facing medium word. The SINGULAR is not listed: it is
 * `MEDIUM_LABELS` lower-cased, so there is exactly ONE vocabulary and a word
 * changed in the kept-sources list changes here in the same edit. Only the
 * plural, which no map on the platform holds, is spelled out — explicitly,
 * never as a bare `+ "s"`.
 */
const MEDIUM_PLURALS: Record<KeptSourceMedium, string> = {
  turns: "conversations",
  document: "documents",
  text: "texts",
  exchange: "exchanges",
};

/** The Expert's own word for a medium, in a sentence. */
export function mediumSentenceWord(medium: KeptSourceMedium): string {
  return MEDIUM_LABELS[medium].toLowerCase();
}

/**
 * The words for one row's kind. Exported so the guard can prove that every
 * medium the reader knows about has one — a medium added on the server must
 * surface as "source", never as a raw stored word on an Expert's screen.
 */
export function groupWordsFor(row: {
  approach_key: string | null;
  medium: string;
}): { key: string; one: string; many: string } {
  if (isInterviewMaterial(row)) {
    return { key: "interview", ...INTERVIEW_GROUP };
  }
  const medium = row.medium as KeptSourceMedium;
  if (!KEPT_SOURCE_MEDIA.includes(medium)) {
    return { key: row.medium, ...UNKNOWN_MEDIUM };
  }
  return {
    key: medium,
    one: mediumSentenceWord(medium),
    many: MEDIUM_PLURALS[medium],
  };
}

/** Every medium in `MEDIUM_LABELS` must have a sentence word. Guard reads it. */
export const MEDIUM_LABEL_KEYS = Object.keys(MEDIUM_LABELS);

/**
 * Fold a page's worth of `masterwork_source` rows into one read per Rulebook.
 *
 * `rulebookIds` is passed in because a Rulebook with NO kept rows must still
 * get an answer — "read, and there are none" is a fact, and leaving it out of
 * the map would make it indistinguishable from "we never asked".
 */
export function summarizeSources(
  rulebookIds: string[],
  rows: SourceTallyRow[],
  options: { partial?: boolean } = {},
): Map<string, RulebookSourcesRead> {
  const counts = new Map<string, Map<string, SourceGroup>>();
  for (const id of rulebookIds) counts.set(id, new Map());
  for (const row of rows) {
    const bucket = counts.get(row.rulebook_id);
    if (!bucket) continue; // A row for a Rulebook outside this page.
    const words = groupWordsFor(row);
    const existing = bucket.get(words.key);
    if (existing) existing.count += 1;
    else bucket.set(words.key, { ...words, count: 1 });
  }
  const out = new Map<string, RulebookSourcesRead>();
  for (const [id, bucket] of counts) {
    // THE INTERVIEW LEADS. It is the thing the product is actually for — the
    // Expert's own words, said out loud — so it reads first however few of
    // them there are; everything else follows by how much of it there is.
    const groups = [...bucket.values()].sort(
      (a, b) =>
        Number(b.key === "interview") - Number(a.key === "interview") ||
        b.count - a.count ||
        a.key.localeCompare(b.key),
    );
    out.set(id, {
      state: "read",
      groups,
      total: groups.reduce((n, g) => n + g.count, 0),
      partial: options.partial === true,
    });
  }
  return out;
}

/**
 * The sentence itself: "1 interview · 5 documents".
 *
 * Returns null when there is nothing kept — the CELL decides what to draw in
 * that case (the bibliographic author, if this Rulebook is a book import), so
 * this never invents a stand-in sentence.
 */
export function formatSourceSummary(read: RulebookSourcesRead): string | null {
  if (read.state !== "read" || read.total === 0) return null;
  if (read.partial) {
    // The scan stopped before the end, so every number here is a floor and the
    // line says so instead of printing a breakdown it cannot stand behind.
    return `${read.total}+ sources`;
  }
  return read.groups
    .map((g) => `${g.count} ${g.count === 1 ? g.one : g.many}`)
    .join(" · ");
}
