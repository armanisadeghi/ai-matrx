/**
 * Layer 4 — Text Scanner
 *
 * High-level "feed me text, hand me back the text plus any JSON I found"
 * façade over the rest of the json/ stack. Designed to be the default
 * choice for callers who don't want to think about modes, fuzzy flags,
 * or stateful trackers.
 *
 * Two entry points:
 *
 *   scanText(text)              — one-shot: full text already in hand
 *   new TextScanner()           — streaming: chunks arrive over time
 *
 * Both return the same shape:
 *
 *   { text, data: ScannedJson[] }
 *
 *   - `text` is returned **untouched** (verbatim — never trimmed, never
 *     normalized, never had fences stripped).
 *   - `data` is a list of every JSON value detected, regardless of whether
 *     it was wrapped in ```json fences or sitting bare in the prose. Each
 *     entry carries `isComplete`: `true` for a balanced/parseable value,
 *     `false` for a partial value that the auto-closer reconstructed so
 *     consumers always have something to render mid-stream.
 *
 * Detection strategies (run in order, all opt-out via `ScanOptions`):
 *   1. Triple-backtick fenced blocks (with or without `json` language tag).
 *   2. Bare top-level `{...}` or `[...]` — handles "raw JSON" that the
 *      model emits without fences.
 *   3. Whole-string parse — when the entire input *is* the JSON.
 *
 * In streaming mode the trailing partial value is auto-closed by
 * `extractAllJson({ isStreaming: true })` so the latest chunk renders
 * something sensible:
 *
 *   `{ "title":` → `{ "title": "" }` (isComplete: false)
 *
 * Once the closing punctuation arrives the value flips to
 * `isComplete: true` automatically on the next call.
 */

import {
  extractAllJson,
  type ExtractedJson,
  type JsonSource,
  type JsonValueType,
} from "@ai-matrx/content-ir/json-extract";
import { StreamingJsonTracker } from "@ai-matrx/content-ir/json-extract";

// =============================================================================
// Public Types
// =============================================================================

export interface ScannedJson {
  /** Parsed JSON value. Auto-closed if `isComplete: false`. */
  value: unknown;
  /** True if the source bytes were balanced; false if auto-closed for preview. */
  isComplete: boolean;
  /** `"object" | "array" | "primitive"` — quick discriminator. */
  type: JsonValueType;
  /** Where in the input the value came from (fenced / bare-block / whole-string). */
  source: JsonSource;
  /** True when repair (trailing commas, Python `True`/`False`/`None`) was applied. */
  repairApplied: boolean;
  /** Byte offsets into the **original** text. */
  startIndex: number;
  endIndex: number;
  /** Non-fatal notes from the extractor (auto-closed, repair applied, etc.). */
  warnings: string[];
}

export interface ScanResult {
  /** Original text — never modified. */
  text: string;
  /** Every JSON value detected, in document order. Empty when none found. */
  data: ScannedJson[];
}

export interface ScanOptions {
  /**
   * When false, only fenced blocks are considered. Default true — the whole
   * point of this façade is "find JSON wherever it shows up."
   */
  allowBare?: boolean;
  /**
   * Apply repair (trailing commas, Python `True`/`False`/`None`). Default true.
   */
  repairEnabled?: boolean;
  /**
   * Cap on number of detected JSON values. Default Infinity.
   */
  maxResults?: number;
}

// =============================================================================
// One-shot API
// =============================================================================

/**
 * Scan a complete string for JSON. Use this when you already have the full
 * text in hand (database row, clipboard paste, completed AI response, etc.).
 *
 * For streaming text use {@link TextScanner} instead.
 *
 * ```ts
 * const { text, data } = scanText(aiResponse);
 * if (data.length > 0 && data[0].isComplete) {
 *   applyConfig(data[0].value);
 * }
 * console.log(text); // prose preserved verbatim — render it as-is
 * ```
 */
export function scanText(text: string, options?: ScanOptions): ScanResult {
  if (typeof text !== "string") {
    return { text: "", data: [] };
  }

  const opts = normalizeOptions(options);
  const results = extractAllJson(text, {
    isStreaming: false,
    allowFuzzy: opts.allowBare,
    repairEnabled: opts.repairEnabled,
    maxResults: opts.maxResults,
  });

  return { text, data: results.map(toScannedJson) };
}

/**
 * Convenience — scan a single chunk of text and immediately auto-close any
 * incomplete trailing JSON. Equivalent to `new TextScanner().append(text)`
 * but stateless. Use this for "I have a partial buffer right now and want
 * the best snapshot I can show" use cases.
 */
export function scanTextStreaming(
  text: string,
  options?: ScanOptions,
): ScanResult {
  if (typeof text !== "string") {
    return { text: "", data: [] };
  }

  const opts = normalizeOptions(options);
  const results = extractAllJson(text, {
    isStreaming: true,
    allowFuzzy: opts.allowBare,
    repairEnabled: opts.repairEnabled,
    maxResults: opts.maxResults,
  });

  return { text, data: results.map(toScannedJson) };
}

// =============================================================================
// Streaming API
// =============================================================================

/**
 * Stateful text scanner. Accumulates chunks internally and re-extracts on
 * every `append`. The trailing partial JSON is auto-closed so consumers
 * always have a renderable preview.
 *
 * ```ts
 * const scanner = new TextScanner();
 *
 * for await (const chunk of stream) {
 *   const { text, data } = scanner.append(chunk);
 *   render(text);                   // full prose so far, untouched
 *   if (data[0]?.isComplete) {      // ← flips true once balanced
 *     onJsonReady(data[0].value);
 *   }
 * }
 *
 * const { data } = scanner.finalize(); // final pass with full strategies
 * ```
 *
 * Internally this wraps {@link StreamingJsonTracker} so revision tracking
 * + change detection are done for you. Cheap to call repeatedly: hashing
 * is O(results), not O(text).
 */
export class TextScanner {
  private text = "";
  private tracker: StreamingJsonTracker;
  private opts: Required<ScanOptions>;

  constructor(options?: ScanOptions) {
    this.opts = normalizeOptions(options);
    this.tracker = new StreamingJsonTracker({
      maxResults: this.opts.maxResults,
      repairEnabled: this.opts.repairEnabled,
      fuzzyOnFinalize: this.opts.allowBare,
    });
  }

  /**
   * Append a chunk and re-extract. Returns the full accumulated text plus
   * the latest extraction snapshot.
   */
  append(chunk: string): ScanResult {
    if (typeof chunk === "string" && chunk.length > 0) {
      this.text += chunk;
      this.tracker.append(chunk);
    }
    return this.snapshot(this.tracker.getState());
  }

  /**
   * Replace the entire accumulated text in one shot. Useful when you manage
   * accumulation externally (e.g. you already have a buffer and just want
   * the scan output).
   */
  setFullText(text: string): ScanResult {
    this.text = typeof text === "string" ? text : "";
    return this.snapshot(this.tracker.setFullText(this.text));
  }

  /**
   * Run a final extraction pass using the full (non-streaming) strategy
   * stack. Call once after the stream ends to catch JSON that only became
   * detectable at end-of-input (e.g. whole-string parses).
   */
  finalize(): ScanResult {
    return this.snapshot(this.tracker.finalize());
  }

  /** Current accumulated text. */
  getText(): string {
    return this.text;
  }

  /** Reset for reuse. */
  reset(): void {
    this.text = "";
    this.tracker.reset();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private snapshot(
    state: ReturnType<StreamingJsonTracker["getState"]>,
  ): ScanResult {
    return {
      text: this.text,
      data: state.results.map(toScannedJson),
    };
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

const DEFAULTS: Required<ScanOptions> = {
  allowBare: true,
  repairEnabled: true,
  maxResults: Infinity,
};

function normalizeOptions(options?: ScanOptions): Required<ScanOptions> {
  return {
    allowBare: options?.allowBare ?? DEFAULTS.allowBare,
    repairEnabled: options?.repairEnabled ?? DEFAULTS.repairEnabled,
    maxResults: options?.maxResults ?? DEFAULTS.maxResults,
  };
}

function toScannedJson(extracted: ExtractedJson): ScannedJson {
  return {
    value: extracted.value,
    isComplete: extracted.isComplete,
    type: extracted.type,
    source: extracted.source,
    repairApplied: extracted.repairApplied,
    startIndex: extracted.startIndex,
    endIndex: extracted.endIndex,
    warnings: extracted.warnings,
  };
}
