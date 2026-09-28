// features/education/convert/coverage.ts
//
// THE coverage engine. It answers the one question every generator in this
// feature was getting wrong: "how much of the student's material does this
// artifact actually have to cover, and how big does that make it?"
//
// The defect it exists to end (2026-08-21, reported on a real run): a 77-slide
// chemistry deck (23.5k characters, every slide with speaker notes) was sent to
// each generator as ONE blob with a fixed count. The result was 10 flashcards,
// 5 key points, 16 mind-map nodes, 10 quiz questions and 4 mnemonics. Every
// artifact was drawn from the front of the document, because that is what a
// model does when you hand it a whole textbook and ask for ten of something.
// Nothing scaled with the source, and nothing let the student ask for more.
//
// The fix has two halves and both are load-bearing:
//
//   1. SEGMENT the source at its own natural boundaries (slides, headings,
//      pages) and generate PER SEGMENT. This is what actually buys coverage:
//      segment 7 gets its own call, so slide 62 cannot be quietly skipped
//      because the model already had enough material by slide 12.
//   2. SCALE the count to the source. Items-per-segment times segments, bounded
//      by knobs, adjusted by the student's chosen depth. A one-page paste still
//      yields a tight artifact; a 77-slide deck yields one that covers it.
//
// THE COVERAGE LAW: a generator that produces a LIST (cards, questions,
// mnemonics, key points, nodes) runs per segment. A generator that produces one
// prose DOCUMENT (notes) writes one section per segment and stitches them. No
// generator may send the whole source in one call with a fixed count again.
//
// Every ceiling here is a knob (`platform.feature_knob`, feature
// `education.study_kit`), never a constant: common-docs/policies/
// limits-are-knobs-agents-set-them.md.

import { knobInt } from "@/lib/knobs/featureKnobs";
import type { TargetKind } from "./types";

export const KIT_KNOB_FEATURE = "education.study_kit";

/** How dense a kit the student asked for. Maps to a multiplier on every count. */
export type CoverageDepth = "quick" | "standard" | "thorough";

export const COVERAGE_DEPTHS: readonly CoverageDepth[] = [
  "quick",
  "standard",
  "thorough",
] as const;

export function isCoverageDepth(v: unknown): v is CoverageDepth {
  return v === "quick" || v === "standard" || v === "thorough";
}

const DEPTH_MULTIPLIER: Record<CoverageDepth, number> = {
  quick: 0.45,
  standard: 1,
  thorough: 1.75,
};

/** One slice of the source a generator is responsible for covering. */
export interface SourceSegment {
  /** Stable id within this plan ("s1"), used in labels and merge bookkeeping. */
  id: string;
  /** Human label drawn from the source's own headings ("Slides 14-21"). */
  label: string;
  /** The segment's text, chunk-marked for grounding. */
  text: string;
  /** 1-based position. */
  index: number;
  /** How many segments the source was split into. */
  total: number;
  /** Items this segment should contribute (0 for prose targets). */
  items: number;
}

export interface CoveragePlan {
  segments: SourceSegment[];
  /** Total items the plan targets across the whole source. */
  total: number;
  /** True when the source was small enough to stay a single call. */
  singlePass: boolean;
  /**
   * One honest sentence about what this plan does, for the UI. The student is
   * told what coverage they are getting instead of discovering it by counting.
   */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

/**
 * A line that starts a new unit of the source. Ingest hands us markdown from
 * several pipelines, so we recognize all of their boundary shapes:
 *   - `## Slide 12: Title`      (office/pptx extract)
 *   - `# ` / `## ` / `### `     (markdown headings, scrape, paste)
 *   - `### Chunk c4`            (already chunk-marked, e.g. re-convert)
 *   - `--- Page 4 ---` / `Page 4` (pdf extract)
 */
const BOUNDARY_RE =
  /^(?:#{1,3}\s+\S|-{2,}\s*page\s+\d+|page\s+\d+\s*$|\[GROUNDING_PASSAGE\s)/i;

/** Split the source into its smallest natural units, in order. */
function splitUnits(text: string): string[] {
  const lines = text.split("\n");
  const units: string[] = [];
  let buf: string[] = [];
  let sawBoundary = false;
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) units.push(t);
    buf = [];
  };
  for (const line of lines) {
    if (BOUNDARY_RE.test(line.trim())) {
      sawBoundary = true;
      if (buf.length > 0) flush();
    }
    buf.push(line);
  }
  flush();
  if (sawBoundary) return units;
  // No headings at all (a plain paste): fall back to paragraphs so a long
  // unstructured source still segments instead of collapsing to one unit.
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A page, paragraph, or OCR stream can itself be larger than one coverage
 * segment. Natural-boundary detection is a preference, not permission to hand
 * an arbitrarily large unit to one agent call. Split an oversized unit near a
 * readable boundary and preserve every character, including the tail.
 */
function splitOversizedUnit(unit: string, targetChars: number): string[] {
  const clean = unit.trim();
  if (clean.length <= targetChars) return clean ? [clean] : [];

  const pieces: string[] = [];
  let remaining = clean;
  while (remaining.length > targetChars) {
    const window = remaining.slice(0, targetChars + 1);
    const floor = Math.max(1, Math.floor(targetChars * 0.6));
    const candidates = [
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
      window.lastIndexOf(" "),
    ].filter((at) => at >= floor);
    const cut =
      candidates.length > 0 ? Math.max(...candidates) + 1 : targetChars;
    const piece = remaining.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.trim()) pieces.push(remaining.trim());
  return pieces;
}

/** A real grounding header from the Source resolver: `### Chunk <id> (page N)`. */
const CHUNK_HEADER_RE = /^### Chunk \S+(?: \(page \d+\))?[ \t]*$/;
const MARKED_TEXT_RE = /(^|\n)### Chunk \S/;

/**
 * An oversized unit that starts with a real `### Chunk <id>` header is split
 * into pieces; every continuation piece carries the same header so the agent
 * can still cite the real id (a headerless piece could cite nothing).
 */
function withChunkHeader(unit: string, pieces: string[]): string[] {
  if (pieces.length < 2) return pieces;
  const header = unit.trim().split("\n", 1)[0]?.trim() ?? "";
  if (!CHUNK_HEADER_RE.test(header)) return pieces;
  return pieces.map((piece, i) =>
    i === 0 || piece.startsWith(header) ? piece : `${header}\n${piece}`,
  );
}

/** The first heading-ish line of a unit, cleaned up for a label. */
function unitLabel(unit: string): string {
  const first = unit.split("\n", 1)[0]?.trim() ?? "";
  // A resolver chunk header names a page, never a heading worth showing: say
  // "Page 12", not "Chunk b93ab938-… (page 12)".
  const chunk = /^### Chunk \S+(?: \(page (\d+)\))?/.exec(first);
  if (chunk) return chunk[1] ? `Page ${chunk[1]}` : "";
  const cleaned = first
    .replace(/^#{1,6}\s*/, "")
    .replace(/^-{2,}\s*/, "")
    .replace(/\s*-{2,}$/, "")
    .trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

function packSegments(
  units: string[],
  targetChars: number,
  maxSegments: number,
) {
  const packed: { text: string; first: string; last: string }[] = [];
  let buf: string[] = [];
  let labels: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    packed.push({
      text: buf.join("\n\n"),
      first: labels[0] ?? "",
      last: labels[labels.length - 1] ?? "",
    });
    buf = [];
    labels = [];
  };
  for (const rawUnit of units) {
    const pieces = withChunkHeader(
      rawUnit,
      splitOversizedUnit(rawUnit, targetChars),
    );
    const baseLabel = unitLabel(rawUnit);
    for (const [pieceIndex, unit] of pieces.entries()) {
      const projected = buf.reduce((n, u) => n + u.length + 2, 0) + unit.length;
      if (buf.length > 0 && projected > targetChars) flush();
      buf.push(unit);
      labels.push(
        pieces.length > 1
          ? `${baseLabel || "Part"} (${pieceIndex + 1}/${pieces.length})`
          : baseLabel,
      );
    }
  }
  flush();

  // A pathological source (thousands of tiny units) must not fan out to
  // thousands of agent calls: re-pack evenly into the ceiling instead of
  // truncating, because dropping the tail is the very bug this file fixes.
  return foldPacked(packed, maxSegments);
}

type Packed = { text: string; first: string; last: string };

/**
 * Fold neighbouring packed sections into at most `ceiling` groups. Nothing is
 * dropped: every section's text still reaches exactly one agent call.
 */
function foldPacked(packed: Packed[], ceiling: number): Packed[] {
  const limit = Math.max(1, ceiling);
  if (packed.length <= limit) return packed;
  const per = Math.ceil(packed.length / limit);
  const merged: Packed[] = [];
  for (let i = 0; i < packed.length; i += per) {
    const group = packed.slice(i, i + per);
    merged.push({
      text: group.map((g) => g.text).join("\n\n"),
      first: group[0].first,
      last: group[group.length - 1].last,
    });
  }
  return merged;
}

/**
 * Split `total` across sections in proportion to their size, every section at
 * least one, and the shares summing to EXACTLY `total` (largest remainder).
 * Callers guarantee `sizes.length <= total`.
 */
export function apportionItems(sizes: number[], total: number): number[] {
  const n = sizes.length;
  if (n === 0) return [];
  const shares = new Array<number>(n).fill(1);
  const spare = total - n;
  if (spare <= 0) return shares;
  const sum = sizes.reduce((a, b) => a + Math.max(1, b), 0);
  const exact = sizes.map((s) => (Math.max(1, s) / sum) * spare);
  let handed = 0;
  exact.forEach((x, i) => {
    const whole = Math.floor(x);
    shares[i] += whole;
    handed += whole;
  });
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < spare - handed; k++) shares[byRemainder[k % n].i] += 1;
  return shares;
}

// ---------------------------------------------------------------------------
// Grounding markers
// ---------------------------------------------------------------------------

/**
 * The from-source agents ground and cite against `### Chunk <id>` markers and
 * return NOTHING for an unmarked blob. Marking happens HERE, once, so every
 * generator gets the same grounded text and `deck.ts` stops owning a private
 * copy of the rule.
 *
 * No page number is emitted: ingest hands us a flat text blob with no per-chunk
 * page mapping, and any page we stamped would be echoed straight into the
 * citation locator as a lie.
 */
export function markForGrounding(text: string, idPrefix: string): string {
  // IC-3 passages already carry durable chunk ids. Re-chunking that payload
  // would replace real citation ids with local markers and make the resulting
  // citation unable to open the retrieved passage.
  if (text.includes("[GROUNDING_PASSAGE ")) return text;
  // Text the Source resolver already grounded (`### Chunk <real id>`) is
  // never re-chunked either: its ids are what make a citation open the page.
  if (MARKED_TEXT_RE.test(text)) return text;
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > 1000) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  if (chunks.length === 0) chunks.push(text.trim());
  return chunks
    .map((c, i) => `### Chunk ${idPrefix}${i + 1}\n${c}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Items each segment should contribute, per target kind. These are the
 * agent-set starting values behind the `items_per_segment_*` knobs; the knob is
 * the live authority and this map only names which knob a kind reads.
 */
const ITEMS_KNOB: Partial<Record<TargetKind, string>> = {
  deck: "items_per_segment_deck",
  quiz: "items_per_segment_quiz",
  practice_test: "items_per_segment_practice_test",
  memory_aid: "items_per_segment_memory_aid",
  summary: "items_per_segment_summary",
  mind_map: "items_per_segment_mind_map",
};

export interface PlanCoverageInput {
  text: string;
  targetKind: TargetKind;
  depth?: CoverageDepth;
  /**
   * An explicit total the student asked for. When set it WINS over the scaled
   * count and is distributed evenly across the segments, so "give me 40 cards"
   * still means 40 cards spread over the whole document rather than 40 cards
   * about chapter one.
   */
  requestedTotal?: number;
}

export async function planCoverage({
  text,
  targetKind,
  depth = "standard",
  requestedTotal,
}: PlanCoverageInput): Promise<CoveragePlan> {
  const [segmentChars, maxSegments, maxItems, minItems, perSegmentDefault] =
    await Promise.all([
      knobInt(KIT_KNOB_FEATURE, "segment_target_chars"),
      knobInt(KIT_KNOB_FEATURE, "max_segments"),
      knobInt(KIT_KNOB_FEATURE, "max_items_total"),
      knobInt(KIT_KNOB_FEATURE, "min_items_total"),
      knobInt(
        KIT_KNOB_FEATURE,
        ITEMS_KNOB[targetKind] ?? "items_per_segment_deck",
      ),
    ]);

  const clean = text.trim();
  const natural = packSegments(splitUnits(clean), segmentChars, maxSegments);

  const multiplier = DEPTH_MULTIPLIER[depth];
  const scaled = Math.round(
    perSegmentDefault * multiplier * Math.max(1, natural.length),
  );
  const targetTotal = requestedTotal
    ? Math.max(1, Math.min(requestedTotal, maxItems))
    : Math.max(minItems, Math.min(scaled, maxItems));

  // THE COUNT LAW: an explicit ask is handed out EXACTLY. More sections than
  // items ("5 cards" over 10 sections) used to give every section at least one
  // and ship 10 cards (verify-1, 2026-09-28). Neighbouring sections are folded
  // together instead, so every part of the material still gets a pass and each
  // pass earns at least one item. (A source-scaled count has no ask to honour;
  // its sections stay as the material split them.)
  const packed = requestedTotal ? foldPacked(natural, targetTotal) : natural;
  const total = Math.max(1, packed.length);

  // Distribute by segment SIZE, not evenly: a dense 6k-character section earns
  // more cards than a 400-character title slide, and an even split is how you
  // get four flashcards about a section header.
  const items = apportionItems(
    packed.map((p) => p.text.length),
    Math.max(targetTotal, packed.length),
  );

  const segments: SourceSegment[] = packed.map((p, i) => ({
    id: `s${i + 1}`,
    label:
      p.first && p.last && p.first !== p.last
        ? `${p.first} - ${p.last}`
        : p.first || `Part ${i + 1}`,
    text: markForGrounding(p.text, `${i + 1}_`),
    index: i + 1,
    total,
    items: items[i] ?? 1,
  }));

  const actualTotal = segments.reduce((a, s) => a + s.items, 0);
  return {
    segments,
    total: actualTotal,
    singlePass: segments.length === 1,
    rationale:
      segments.length === 1
        ? `Covering the whole source in one pass (${actualTotal} items).`
        : `Covering all ${segments.length} sections of your material (${actualTotal} items, ${depth} depth).`,
  };
}

// ---------------------------------------------------------------------------
// Bounded fan-out
// ---------------------------------------------------------------------------

/**
 * Run `worker` over every segment with a bounded number in flight, preserving
 * segment order in the result.
 *
 * A segment that FAILS resolves to null rather than sinking the artifact: eight
 * sections of real cards plus one rate-limited section is a good deck with a
 * gap, and throwing the whole thing away over one failed call is worse for the
 * student than the gap. The caller reports the gap honestly (see
 * `SegmentedOutcome.missedSegments`).
 */
export async function runOverSegments<T>(
  segments: SourceSegment[],
  worker: (segment: SourceSegment) => Promise<T>,
  concurrency: number,
): Promise<{ results: (T | null)[]; missed: SourceSegment[] }> {
  const results: (T | null)[] = new Array(segments.length).fill(null);
  const missed: SourceSegment[] = [];
  let cursor = 0;

  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, segments.length)) },
    async () => {
      for (;;) {
        const i = cursor++;
        if (i >= segments.length) return;
        try {
          results[i] = await worker(segments[i]);
        } catch (e) {
          missed.push(segments[i]);
          console.error(
            `[convert/coverage] segment ${segments[i].id} (${segments[i].label}) failed:`,
            e,
          );
        }
      }
    },
  );
  await Promise.all(lanes);
  return { results, missed };
}

/** The concurrency ceiling for a segmented run (a knob, never a constant). */
export async function segmentConcurrency(): Promise<number> {
  return knobInt(KIT_KNOB_FEATURE, "segment_concurrency");
}

/**
 * Fold a per-segment gap list into the one honest sentence a surface shows.
 * Null when nothing was missed.
 */
export function describeGaps(missed: SourceSegment[]): string | null {
  if (missed.length === 0) return null;
  const names = missed
    .slice(0, 3)
    .map((m) => m.label)
    .join(", ");
  const more = missed.length > 3 ? ` and ${missed.length - 3} more` : "";
  return `${missed.length} section${missed.length === 1 ? "" : "s"} could not be covered (${names}${more}). Use "Add more" to fill the gap.`;
}
