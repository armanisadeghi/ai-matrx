/**
 * message-citations — the settle-time citation layer for persisted messages.
 *
 * `cx_message.content` text parts carry a `citations` array (canonical
 * NormalizedCitation shape ratified 2026-07-17 — see
 * docs/handoffs/citations-system.md "Canonical citation schema"). This module
 * is the ONE place that:
 *
 *   1. Parses that boundary (`TextPart.citations` is `unknown[]` until the
 *      backend type regen lands) into validated `NormalizedCitation`s.
 *      Malformed items are skipped LOUDLY (console.warn) — never thrown.
 *   2. Builds the per-message citation index: a deduped, numbered source
 *      list + per-text-part marker positions.
 *   3. Inserts / strips the inline render markers (`<matrxcite n="…" />`).
 *
 * Both content walkers (`extractFlatText` and
 * `selectMessageInterleavedContent` in messages.selectors.ts) consume THESE
 * functions — the marker logic must never be re-implemented per walker (the
 * repo's known parallel-walker bug class).
 *
 * TYPE SOURCE OF TRUTH: `NormalizedCitation` is aliased FROM the generated
 * wire type (`types/python-generated/stream-events.ts`, regenerated from
 * aidream Pydantic 2026-07-17) — never hand-mirrored. The runtime guard
 * stays: DB rows predate the contract and the wire fields are optional;
 * `parseNormalizedCitation` normalizes to the fully-populated shape.
 *
 * Live-stream half (this file is the ONE core for both): process-stream's
 * `isCitationEvent` branch parses each `CitationPayload.citation` through
 * `parseNormalizedCitation` and accumulates `LiveCitationEntry` rows on the
 * active request; `buildLiveCitationIndex` (below) derives the SAME numbered
 * source list + per-render-block markers, and the SAME
 * `insertCitationMarkers` stamps the streamed text — renderer + footer are
 * index-shape-agnostic.
 */

import type { NormalizedCitation as WireNormalizedCitation } from "@/types/python-generated/stream-events";

/**
 * Canonical per-text-block citation — the generated wire schema with every
 * field REQUIRED (nullability preserved). This is what
 * `parseNormalizedCitation` guarantees at runtime; storage/wire values with
 * omitted fields are normalized into it.
 */
export type NormalizedCitation = Required<WireNormalizedCitation>;

export type CitationKind = NormalizedCitation["kind"];
export type CitationProvider = NormalizedCitation["provider"];

export const CITATION_KINDS = [
  "document_char",
  "document_page",
  "document_block",
  "search_result",
  "web",
  "grounding",
] as const satisfies readonly CitationKind[];

export const CITATION_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "xai",
] as const satisfies readonly CitationProvider[];

// Compile-time completeness guards: if the generated union grows, these
// error until the runtime lists above are extended.
type _AssertAllKinds = [CitationKind] extends [(typeof CITATION_KINDS)[number]]
  ? true
  : never;
type _AssertAllProviders = [CitationProvider] extends [
  (typeof CITATION_PROVIDERS)[number],
]
  ? true
  : never;
const _allKindsListed: _AssertAllKinds = true;
const _allProvidersListed: _AssertAllProviders = true;
void _allKindsListed;
void _allProvidersListed;

const CITATION_KIND_SET: ReadonlySet<string> = new Set(CITATION_KINDS);
const CITATION_PROVIDER_SET: ReadonlySet<string> = new Set(CITATION_PROVIDERS);

/** One deduped, numbered source for a message (footer chips + markers). */
export interface MessageCitationSource {
  /** 1-based display number, first-appearance order. */
  number: number;
  kind: CitationKind;
  provider: string;
  title: string | null;
  url: string | null;
  fileId: string | null;
  page: number | null;
  endPage: number | null;
  /** First non-empty cited excerpt for this source. */
  citedText: string | null;
  /** How many citations collapsed into this source. */
  count: number;
}

/** A marker to render inside one text part. */
export interface BlockCitationMarker {
  sourceNumber: number;
  /**
   * Char offset into the part's text where the marker belongs
   * (OpenAI/Gemini answer offsets). Null → append at the part's end
   * (Anthropic: the cited span IS the block).
   */
  answerEnd: number | null;
}

export interface MessageCitationIndex {
  sources: MessageCitationSource[];
  /** Markers keyed by the part's index in `record.content`. */
  markersByPartIndex: Record<number, BlockCitationMarker[]>;
}

/** Stable empty index — referential equality for the no-citation fast path. */
export const EMPTY_CITATION_INDEX: MessageCitationIndex = {
  sources: [],
  markersByPartIndex: {},
};

// ---------------------------------------------------------------------------
// Boundary parsing (unknown[] → NormalizedCitation)
// ---------------------------------------------------------------------------

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Validate one raw citation against the canonical shape. Returns null for
 * malformed items — the CALLER warns (with part context), keeping this pure.
 */
export function parseNormalizedCitation(
  raw: unknown,
): NormalizedCitation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== "string" || !CITATION_KIND_SET.has(kind)) return null;
  // Provider is part of the ratified contract (a closed union in the
  // generated schema). An unlisted provider is a contract violation — the
  // caller warns loudly; extending the contract means regenerating the wire
  // types, which fails the compile-time completeness guard above until
  // CITATION_PROVIDERS is updated.
  const provider = o.provider;
  if (typeof provider !== "string" || !CITATION_PROVIDER_SET.has(provider)) {
    return null;
  }
  return {
    kind: kind as CitationKind,
    provider: provider as CitationProvider,
    cited_text: asStringOrNull(o.cited_text),
    title: asStringOrNull(o.title),
    url: asStringOrNull(o.url),
    source_index: asNumberOrNull(o.source_index) ?? 0,
    file_id: asStringOrNull(o.file_id),
    page: asNumberOrNull(o.page),
    end_page: asNumberOrNull(o.end_page),
    source_start: asNumberOrNull(o.source_start),
    source_end: asNumberOrNull(o.source_end),
    answer_start: asNumberOrNull(o.answer_start),
    answer_end: asNumberOrNull(o.answer_end),
    raw:
      o.raw && typeof o.raw === "object" && !Array.isArray(o.raw)
        ? (o.raw as Record<string, unknown>)
        : {},
  };
}

// ---------------------------------------------------------------------------
// Display-kind mapping (icon / visual treatment)
// ---------------------------------------------------------------------------

/**
 * How a source should READ in the UI: as a document (file icon) or a web
 * source (globe icon). Kind-first, ratified 2026-08-08:
 *  - `search_result` is ALWAYS a document — it is a citable tool-result block
 *    (RAG / document_search over OUR files, carrying `file_id` + `page`), not
 *    a web hit, even when a `url` happens to be present.
 *  - `document_*` kinds are documents.
 *  - `web` / `grounding` are web sources — unless the capture layer resolved
 *    them to one of our files (`fileId` set), in which case the document
 *    click-through wins and the chip should read as a document.
 */
export function citationSourceDisplayKind(
  source: Pick<MessageCitationSource, "kind" | "url" | "fileId">,
): "document" | "web" {
  if (source.kind === "web" || source.kind === "grounding") {
    return source.fileId ? "document" : "web";
  }
  return "document";
}

// ---------------------------------------------------------------------------
// Index building
// ---------------------------------------------------------------------------

/** Loose part shape — `record.content` items before full narrowing. */
interface LoosePart {
  type?: string;
  text?: string;
  citations?: unknown;
}

/** Fast check: does any text part carry a non-empty citations array? */
export function partsHaveCitations(parts: ReadonlyArray<unknown>): boolean {
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const { type, citations } = p as LoosePart;
    if (type !== "text" && type !== undefined) continue;
    if (Array.isArray(citations) && citations.length > 0) return true;
  }
  return false;
}

/** Dedupe key per the ratified contract: (kind, url ?? file_id ?? title, page). */
function sourceKey(c: NormalizedCitation): string {
  // Identity-less citations (no url/file_id/title — a documented capture gap
  // on some provider paths) must NOT collapse into one bogus source just
  // because source_index defaults to 0: include a cited_text prefix so
  // genuinely different quotes stay distinct sources.
  const target =
    c.url ??
    c.file_id ??
    c.title ??
    `idx:${c.source_index}|${(c.cited_text ?? "").slice(0, 80)}`;
  return `${c.kind}|${target}|${c.page ?? ""}`;
}

/**
 * THE dedupe + numbering core, shared by the settle-time index
 * (`buildMessageCitationIndex`) and the live-stream index
 * (`buildLiveCitationIndex`). Adds `c` to `sources` (first-appearance
 * numbering) or folds it into its existing source (count + field backfill).
 * Returns the source's 1-based display number. Mutates its inputs — callers
 * own fresh accumulators per build.
 */
export function addCitationToSources(
  sources: MessageCitationSource[],
  numberByKey: Map<string, number>,
  c: NormalizedCitation,
): number {
  const key = sourceKey(c);
  let number = numberByKey.get(key);
  if (number === undefined) {
    number = sources.length + 1;
    numberByKey.set(key, number);
    sources.push({
      number,
      kind: c.kind,
      provider: c.provider,
      title: c.title,
      url: c.url,
      fileId: c.file_id,
      page: c.page,
      endPage: c.end_page,
      citedText: c.cited_text,
      count: 1,
    });
    return number;
  }
  const src = sources[number - 1];
  src.count += 1;
  // Backfill fields the first occurrence lacked.
  if (!src.title && c.title) src.title = c.title;
  if (!src.url && c.url) src.url = c.url;
  if (!src.fileId && c.file_id) src.fileId = c.file_id;
  if (src.page == null && c.page != null) src.page = c.page;
  if (!src.citedText && c.cited_text) src.citedText = c.cited_text;
  return number;
}

/**
 * Build the per-message citation index: deduped numbered sources +
 * per-part markers. Malformed citation items are skipped with ONE loud
 * console.warn per call (never throws). Returns the stable
 * `EMPTY_CITATION_INDEX` when the message carries no citations.
 */
export function buildMessageCitationIndex(
  parts: ReadonlyArray<unknown>,
): MessageCitationIndex {
  if (!partsHaveCitations(parts)) return EMPTY_CITATION_INDEX;

  const sources: MessageCitationSource[] = [];
  const numberByKey = new Map<string, number>();
  const markersByPartIndex: Record<number, BlockCitationMarker[]> = {};
  const malformed: Array<{ partIndex: number; item: unknown }> = [];

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const p = parts[partIndex];
    if (!p || typeof p !== "object") continue;
    const { type, citations } = p as LoosePart;
    if (type !== "text" && type !== undefined) continue;
    if (!Array.isArray(citations) || citations.length === 0) continue;

    for (const item of citations) {
      const c = parseNormalizedCitation(item);
      if (!c) {
        malformed.push({ partIndex, item });
        continue;
      }

      const number = addCitationToSources(sources, numberByKey, c);

      const answerEnd =
        c.answer_end != null && c.answer_end > 0 ? c.answer_end : null;
      const markers = (markersByPartIndex[partIndex] ??= []);
      // Dedupe identical markers (same source at same position).
      if (
        !markers.some(
          (m) => m.sourceNumber === number && m.answerEnd === answerEnd,
        )
      ) {
        markers.push({ sourceNumber: number, answerEnd });
      }
    }
  }

  if (malformed.length > 0) {
    // Loud, single warn per build — a malformed citation means a producer
    // violated the ratified contract. Never throw: the message still renders.
    console.warn(
      `[message-citations] Skipped ${malformed.length} malformed citation item(s) — producer violates the NormalizedCitation contract (docs/handoffs/citations-system.md).`,
      malformed,
    );
  }

  if (sources.length === 0) return EMPTY_CITATION_INDEX;
  return { sources, markersByPartIndex };
}

// ---------------------------------------------------------------------------
// Inline markers
// ---------------------------------------------------------------------------

/**
 * The inline marker rendered into DISPLAY text only (never persisted; the
 * inline-edit commit path strips it). Rendered as a numbered superscript
 * chip by `remarkMatrxCite` + `CitationMarkerInline`
 * (components/mardown-display/chat-markdown/citations/).
 */
export function citationMarkerTag(sourceNumber: number): string {
  return `<matrxcite n="${sourceNumber}" />`;
}

/** Matches every rendered citation marker. Fresh lastIndex per use. */
export const CITATION_MARKER_RE = /<matrxcite\s+n="(\d+)"\s*\/>/g;

/** Remove render-only citation markers (used before any persistence). */
export function stripCitationMarkers(text: string): string {
  if (!text.includes("<matrxcite")) return text;
  return text.replace(/<matrxcite\s+n="\d+"\s*\/>/g, "");
}

/**
 * Markdown code regions of a text: `[start, end)` half-open UTF-16 ranges
 * covering fenced code blocks (``` / ~~~, opening delimiter through the char
 * just after the closing run — unclosed fences run to end-of-text) and inline
 * code spans (a backtick run paired with the next run of the SAME length,
 * per CommonMark; unpaired runs are literal text, not regions). A citation
 * marker inserted strictly inside a region renders as literal garbage, so
 * `insertCitationMarkers` snaps such offsets to the region's end.
 *
 * Deliberately cheap: one line scan for fences + one char scan for inline
 * runs, no markdown parser. Inline spans with backticks INSIDE the span
 * content (``a ` b``) pair conservatively on run length, which matches
 * CommonMark for the cases streamed model output actually produces.
 * Fences are recognized behind blockquote markers (`> ```js`) and at ANY
 * indentation — models routinely quote/indent code, and an unrecognized
 * open fence would let a marker land inside streaming code (the one case
 * with no self-healing fallback). Known remaining gap: pure 4-space
 * indented code blocks with no fence delimiters are not detected.
 *
 * Results are memoized (bounded FIFO) — the streaming render path calls
 * this on every Redux update, usually with an unchanged string.
 */
const _codeRegionsCache = new Map<string, ReadonlyArray<readonly [number, number]>>();
const _CODE_REGIONS_CACHE_MAX = 32;

export function computeCodeRegions(
  text: string,
): ReadonlyArray<readonly [number, number]> {
  if (!text.includes("`") && !text.includes("~")) return [];
  const cached = _codeRegionsCache.get(text);
  if (cached) return cached;
  const regions: Array<readonly [number, number]> = [];

  // --- Fenced blocks (line-based) ---
  const fenceRe = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})/;
  let fenceStart = -1;
  let fenceChar = "";
  let fenceLen = 0;
  let lineStart = 0;
  const textLen = text.length;
  while (lineStart <= textLen) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? textLen : nl;
    const line = text.slice(lineStart, lineEnd);
    const m = fenceRe.exec(line);
    if (m) {
      const run = m[1];
      if (fenceStart === -1) {
        // Opening fence.
        fenceStart = lineStart;
        fenceChar = run[0];
        fenceLen = run.length;
      } else if (
        run[0] === fenceChar &&
        run.length >= fenceLen &&
        line.slice(m[0].length).trim() === ""
      ) {
        // Closing fence: region ends just after the closing run.
        regions.push([fenceStart, lineStart + m[0].length] as const);
        fenceStart = -1;
      }
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  if (fenceStart !== -1) regions.push([fenceStart, textLen] as const);

  // --- Inline code spans (outside fence regions) ---
  // Fence regions are sorted and non-overlapping by construction; binary
  // search keeps the char scan O(n log k) (the previous `.some` over a
  // growing array was quadratic on backtick-dense pathological texts).
  const fenceRegions = regions.slice();
  const insideFence = (i: number) => {
    let lo = 0;
    let hi = fenceRegions.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [s, e] = fenceRegions[mid];
      if (i < s) hi = mid - 1;
      else if (i >= e) lo = mid + 1;
      else return true;
    }
    return false;
  };
  let i = 0;
  while (i < textLen) {
    if (text[i] !== "`" || insideFence(i)) {
      i += 1;
      continue;
    }
    let runEnd = i;
    while (runEnd < textLen && text[runEnd] === "`") runEnd += 1;
    const runLen = runEnd - i;
    // Find the next run of EXACTLY this length (the CommonMark closer).
    let j = runEnd;
    let closed = false;
    while (j < textLen) {
      if (text[j] !== "`" || insideFence(j)) {
        j += 1;
        continue;
      }
      let jEnd = j;
      while (jEnd < textLen && text[jEnd] === "`") jEnd += 1;
      if (jEnd - j === runLen) {
        regions.push([i, jEnd] as const);
        i = jEnd;
        closed = true;
        break;
      }
      j = jEnd;
    }
    if (!closed) i = runEnd; // Unpaired run — literal backticks.
  }

  if (_codeRegionsCache.size >= _CODE_REGIONS_CACHE_MAX) {
    const oldest = _codeRegionsCache.keys().next().value;
    if (oldest !== undefined) _codeRegionsCache.delete(oldest);
  }
  _codeRegionsCache.set(text, regions);
  return regions;
}

/**
 * Insert this part's markers into its text:
 *  - markers WITH an `answerEnd` offset go at that char offset (clamped),
 *    inserted in descending offset order so earlier offsets stay valid;
 *  - an offset landing between the halves of a UTF-16 surrogate pair is
 *    nudged past the pair (provider offsets are code points, JS slices are
 *    code units — never split a glyph);
 *  - an offset landing strictly inside a markdown code region (fenced block
 *    or inline code span — see `computeCodeRegions`) snaps to just after the
 *    closing delimiter, so the marker never renders as literal code text;
 *  - markers WITHOUT an offset append at the part's end, BEFORE any trailing
 *    whitespace — cited blocks routinely end mid-sentence (", and ") and the
 *    marker must hug the cited text, not the following word.
 */
export function insertCitationMarkers(
  text: string,
  markers: ReadonlyArray<BlockCitationMarker>,
): string {
  if (markers.length === 0 || text.length === 0) return text;

  // Code regions are only needed for offset markers; computed lazily once.
  let codeRegions: ReadonlyArray<readonly [number, number]> | null = null;

  const atOffset = new Map<number, number[]>();
  const atEnd: number[] = [];
  for (const m of markers) {
    if (m.answerEnd != null) {
      let clamped = Math.max(0, Math.min(m.answerEnd, text.length));
      // Provider offsets are code POINTS (Python str); JS slices are UTF-16
      // code UNITS. Never split a surrogate pair — if the insertion point
      // lands on a low surrogate, nudge past it so the glyph stays intact.
      while (
        clamped > 0 &&
        clamped < text.length &&
        text.charCodeAt(clamped) >= 0xdc00 &&
        text.charCodeAt(clamped) <= 0xdfff
      ) {
        clamped += 1;
      }
      // A marker strictly inside a code fence / inline code span renders as
      // literal garbage — snap to just after the closing delimiter.
      codeRegions ??= computeCodeRegions(text);
      for (const [start, end] of codeRegions) {
        if (clamped > start && clamped < end) {
          clamped = end;
          break;
        }
      }
      const list = atOffset.get(clamped) ?? [];
      if (!list.includes(m.sourceNumber)) list.push(m.sourceNumber);
      atOffset.set(clamped, list);
    } else if (!atEnd.includes(m.sourceNumber)) {
      atEnd.push(m.sourceNumber);
    }
  }

  let out = text;

  // Offset markers first — their offsets refer to the ORIGINAL text, so they
  // must land before any end-append changes the string. Descending order keeps
  // earlier offsets valid.
  if (atOffset.size > 0) {
    const offsets = Array.from(atOffset.keys()).sort((a, b) => b - a);
    for (const offset of offsets) {
      const tags = (atOffset.get(offset) ?? []).map(citationMarkerTag).join("");
      out = out.slice(0, offset) + tags + out.slice(offset);
    }
  }

  if (atEnd.length > 0) {
    const trailing = /\s*$/.exec(out);
    const insertAt = trailing ? trailing.index : out.length;
    const tags = atEnd.map(citationMarkerTag).join("");
    out = out.slice(0, insertAt) + tags + out.slice(insertAt);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Live-stream index (active-request accumulation)
// ---------------------------------------------------------------------------

/**
 * One live citation captured from a `citation` stream event, as stored on
 * `ActiveRequest.liveCitations`. The anchor is a SNAPSHOT taken by
 * process-stream the moment the event arrived: the last client text render
 * block and its content length at that instant. Citation events trail the
 * text they cite (Anthropic emits `citations_delta` inside the block being
 * cited), so "end of streamed text at arrival" IS the answer position —
 * the marker hugs the cited span live, and the exact persisted offsets take
 * over after settle/reload.
 */
export interface LiveCitationEntry {
  /** Provider content-block index from the wire (`CitationPayload.block_index`). */
  providerBlockIndex: number | null;
  /** Client render block (`renderBlocks` key) the marker anchors to — null when no text block existed yet. */
  anchorBlockId: string | null;
  /** Char offset into that block's content at arrival. */
  anchorOffset: number | null;
  /** The validated canonical citation. */
  citation: NormalizedCitation;
}

export interface LiveCitationIndex {
  sources: MessageCitationSource[];
  /** Markers keyed by client render blockId (`ActiveRequest.renderBlocks`). */
  markersByBlockId: Record<string, BlockCitationMarker[]>;
}

/** Stable empty index — referential equality for the no-citation fast path. */
export const EMPTY_LIVE_CITATION_INDEX: LiveCitationIndex = {
  sources: [],
  markersByBlockId: {},
};

/**
 * Build the live citation index from a request's accumulated
 * `LiveCitationEntry` rows: SAME dedupe/numbering as the settle-time index
 * (`addCitationToSources`), markers keyed by client render blockId with the
 * arrival-snapshot offset as `answerEnd` (consumed by the SAME
 * `insertCitationMarkers`). Entries were validated at ingress
 * (process-stream), so no re-parse here.
 */
export function buildLiveCitationIndex(
  entries: ReadonlyArray<LiveCitationEntry>,
): LiveCitationIndex {
  if (entries.length === 0) return EMPTY_LIVE_CITATION_INDEX;

  const sources: MessageCitationSource[] = [];
  const numberByKey = new Map<string, number>();
  const markersByBlockId: Record<string, BlockCitationMarker[]> = {};

  for (const entry of entries) {
    const number = addCitationToSources(sources, numberByKey, entry.citation);
    if (entry.anchorBlockId === null) continue;
    const answerEnd =
      entry.anchorOffset != null && entry.anchorOffset > 0
        ? entry.anchorOffset
        : null;
    const markers = (markersByBlockId[entry.anchorBlockId] ??= []);
    if (
      !markers.some(
        (m) => m.sourceNumber === number && m.answerEnd === answerEnd,
      )
    ) {
      markers.push({ sourceNumber: number, answerEnd });
    }
  }

  if (sources.length === 0) return EMPTY_LIVE_CITATION_INDEX;
  return { sources, markersByBlockId };
}
