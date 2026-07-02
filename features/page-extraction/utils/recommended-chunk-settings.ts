/**
 * features/page-extraction/utils/recommended-chunk-settings.ts
 *
 * Heuristic chunk-size / overlap recommender for the PDF Extractor Chunker
 * template editor. Uses document-level character totals (raw or clean,
 * whichever matches the wired source variations) to pick a target chunk
 * count, then splits the in-scope page list into equal parts.
 *
 * Imperfect by design — logs a structured debug payload for tuning.
 */

import { MAX_CHUNK_SIZE } from "@/features/page-extraction/constants";
import type { SourceVariationKind } from "@/features/page-extraction/types";
import { clampChunkSize, formatPageRange } from "./chunk-preview";

const LOG_PREFIX = "[page-extraction:recommended-chunk]";

export interface RecommendedChunkInput {
  availablePages: number[];
  scopePages: number[];
  rawCharacters: number;
  cleanCharacters: number;
  /** `{ surface_value_name: agent_var_name }` — drives which char total to use. */
  variableMapping: Record<string, string>;
  sourceVariations: SourceVariationKind[];
}

export interface RecommendedChunkDebug {
  effectiveCharCount: number;
  charCountSource:
    | "clean_text"
    | "raw_text"
    | "estimated_from_pages"
    | "none";
  targetChunkCount: number;
  pageCountInScope: number;
  chunkSize: number;
  chunkOverlap: number;
  scopePagesInputRaw: string;
  rules: string;
  notes: string[];
}

export interface RecommendedChunkSettings {
  scopePages: number[];
  scopePagesInputRaw: string;
  chunkSize: number;
  chunkOverlap: number;
  debug: RecommendedChunkDebug;
}

/** Target chunk count from total character volume (page-level estimate). */
export function targetChunkCountFromChars(totalChars: number): number {
  if (totalChars <= 0) return 1;
  if (totalChars <= 10_000) return 1;
  if (totalChars <= 20_000) return 2;
  if (totalChars <= 50_000) return 3;
  if (totalChars <= 100_000) return 5;
  return Math.ceil(totalChars / 20_000);
}

function scaleCharsToScope(
  totalChars: number,
  scopePageCount: number,
  documentPageCount: number,
): { scaled: number; note: string | null } {
  if (documentPageCount <= 0 || scopePageCount >= documentPageCount) {
    return { scaled: totalChars, note: null };
  }
  const scaled = Math.round((totalChars * scopePageCount) / documentPageCount);
  return {
    scaled,
    note: `Scoped to ${scopePageCount}/${documentPageCount} pages → scaled chars ${totalChars}→${scaled}`,
  };
}

function pickEffectiveCharCount(
  input: RecommendedChunkInput,
  scopePageCount: number,
): {
  chars: number;
  source: RecommendedChunkDebug["charCountSource"];
  notes: string[];
} {
  const notes: string[] = [];
  const docPages = input.availablePages.length;
  const rawMapped = Object.prototype.hasOwnProperty.call(
    input.variableMapping,
    "raw_text",
  );
  const cleanMapped = Object.prototype.hasOwnProperty.call(
    input.variableMapping,
    "clean_text",
  );

  if (rawMapped) {
    const { scaled, note } = scaleCharsToScope(
      input.rawCharacters,
      scopePageCount,
      docPages,
    );
    notes.push("raw_text is wired — using raw character total.");
    if (note) notes.push(note);
    return { chars: scaled, source: "raw_text", notes };
  }
  if (cleanMapped) {
    const { scaled, note } = scaleCharsToScope(
      input.cleanCharacters,
      scopePageCount,
      docPages,
    );
    notes.push("clean_text is wired — using clean character total.");
    if (note) notes.push(note);
    return { chars: scaled, source: "clean_text", notes };
  }

  const estimated = scopePageCount * 2_500;
  notes.push(
    "No text variation wired — estimating ~2,500 chars/page for chunk count.",
  );
  return { chars: estimated, source: "estimated_from_pages", notes };
}

/**
 * Compute recommended scope, chunk size, and overlap for an extraction
 * template draft. Returns null when there are no pages to chunk.
 */
export function computeRecommendedChunkSettings(
  input: RecommendedChunkInput,
): RecommendedChunkSettings | null {
  const scopePages =
    input.scopePages.length > 0
      ? [...input.scopePages].sort((a, b) => a - b)
      : [...input.availablePages].sort((a, b) => a - b);

  if (scopePages.length === 0) return null;

  const { chars, source, notes: charNotes } = pickEffectiveCharCount(
    input,
    scopePages.length,
  );
  const targetChunks = targetChunkCountFromChars(chars);
  const pageCount = scopePages.length;

  let chunkSize = Math.ceil(pageCount / targetChunks);
  chunkSize = clampChunkSize(Math.min(chunkSize, MAX_CHUNK_SIZE));

  const chunkOverlap =
    targetChunks <= 1
      ? 0
      : Math.max(1, Math.round(chunkSize * 0.15));

  const overlapClamped = Math.min(chunkOverlap, Math.max(0, chunkSize - 1));
  const scopePagesInputRaw = formatPageRange(scopePages);

  let rules: string;
  if (chars <= 10_000) rules = "≤10k chars → 1 chunk (all pages)";
  else if (chars <= 20_000) rules = "10–20k chars → 2 equal page groups";
  else if (chars <= 50_000) rules = "20–50k chars → 3 equal page groups";
  else if (chars <= 100_000) rules = "50–100k chars → 5 equal page groups";
  else rules = "100k+ chars → ~20k chars/chunk target";

  const debug: RecommendedChunkDebug = {
    effectiveCharCount: chars,
    charCountSource: source,
    targetChunkCount: targetChunks,
    pageCountInScope: pageCount,
    chunkSize,
    chunkOverlap: overlapClamped,
    scopePagesInputRaw,
    rules,
    notes: [
      ...charNotes,
      `targetChunks=${targetChunks} → chunkSize=ceil(${pageCount}/${targetChunks})=${chunkSize}`,
      targetChunks <= 1
        ? "Single chunk → overlap=0"
        : `Multi chunk → overlap=max(1, round(${chunkSize}×0.15))=${overlapClamped}`,
    ],
  };

  const result: RecommendedChunkSettings = {
    scopePages,
    scopePagesInputRaw,
    chunkSize,
    chunkOverlap: overlapClamped,
    debug,
  };

  if (typeof console !== "undefined") {
    console.info(LOG_PREFIX, result.debug, {
      input: {
        availablePageCount: input.availablePages.length,
        scopePageCount: input.scopePages.length,
        rawCharacters: input.rawCharacters,
        cleanCharacters: input.cleanCharacters,
        sourceVariations: input.sourceVariations,
      },
      output: {
        scopePagesInputRaw: result.scopePagesInputRaw,
        chunkSize: result.chunkSize,
        chunkOverlap: result.chunkOverlap,
      },
    });
  }

  return result;
}
