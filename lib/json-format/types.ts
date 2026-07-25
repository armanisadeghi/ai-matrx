// lib/json-format/types.ts
//
// Pure, framework-agnostic types for the JSON formatting primitive. No React,
// Redux, DOM, or Supabase — a consumer hands in text, gets back a detection or
// a formatted result, and writes it wherever it likes.
//
// The engine's whole job is "this text is (or might be) JSON — re-shape it":
// condense it, blow it back open, or squeeze it onto one line, with or without
// the markdown code fence it arrived in.

import type { JsonValue } from "@/types/json";

/**
 * How the JSON is laid out.
 *
 * - `minify`  — one line, zero optional whitespace. The smallest legal form.
 * - `compact` — width-aware: any subtree that fits within `width` is inlined,
 *               and sibling entries that fit are packed onto shared lines.
 *               Readable AND small; this is the "scrunch it down" default.
 * - `pretty`  — classic one-entry-per-line indentation.
 */
export type JsonFormatStyle = "minify" | "compact" | "pretty";

/** What to do with the markdown code fence around the JSON. */
export type JsonFenceMode =
  /** Keep the fence exactly as it arrived (and add none if there was none). */
  | "preserve"
  /** Remove the fence, leaving bare JSON. */
  | "strip"
  /** Ensure a ```json fence, adding one if the source was bare. */
  | "add";

/** A markdown code fence wrapping the JSON payload. */
export interface JsonFence {
  /** The opening marker as written, e.g. "```" or "~~~~". */
  marker: string;
  /** Info string after the marker, e.g. "json" (empty when the fence was bare). */
  lang: string;
  /** Whitespace the opening fence line was indented by. */
  indent: string;
  /** False when the source ran out before a closing fence (unterminated). */
  closed: boolean;
}

/** Which JSON container sits at the root of the payload. */
export type JsonRootKind = "object" | "array" | "scalar";

/** How permissively the payload had to be parsed. */
export type JsonParser =
  /** Valid JSON — `JSON.parse` accepted it verbatim. */
  | "strict"
  /** Only JSON5 accepted it: trailing commas, comments, unquoted keys, … */
  | "tolerant";

export interface JsonDetection {
  /** The payload parsed (strictly or tolerantly) into a value. */
  ok: boolean;
  /**
   * The text is JSON-SHAPED even if it did not parse — it opens with `{`/`[`
   * and closes with the matching bracket, or it arrived in a ```json fence.
   * This is the gate for OFFERING json actions; `ok` is the gate for running
   * them.
   */
  looksLikeJson: boolean;
  /** The parsed value. Present only when `ok`. */
  value?: JsonValue;
  parser?: JsonParser;
  /** Human-readable parse failure. Present only when `!ok`. */
  error?: string;
  /** The fence that was stripped before parsing, when the source had one. */
  fence: JsonFence | null;
  /** Text before the payload (fence excluded) — preserved verbatim on format. */
  leading: string;
  /** Text after the payload (fence excluded) — preserved verbatim on format. */
  trailing: string;
  /** The JSON text itself: fence and surrounding whitespace removed. */
  payload: string;
  root?: JsonRootKind;
  /** Lines the payload currently occupies. */
  lineCount: number;
  /** Characters the payload currently occupies. */
  charCount: number;
}

export interface JsonFormatOptions {
  style: JsonFormatStyle;
  /** Spaces per indent level for `compact` / `pretty`. Default 2. */
  indent?: number;
  /** Target line width for `compact`. Default 100. Ignored otherwise. */
  width?: number;
  /** Sort object keys alphabetically at every depth. Default false. */
  sortKeys?: boolean;
  /** Fence handling. Default "preserve". */
  fence?: JsonFenceMode;
}

/** Size of a chunk of text, for before/after reporting. */
export interface JsonTextSize {
  lines: number;
  chars: number;
}

export interface JsonFormatResult {
  /** False when the text could not be parsed; `text` is then the input, unchanged. */
  ok: boolean;
  /** The re-formatted text (full input: leading + fence + payload + trailing). */
  text: string;
  error?: string;
  /** True when `text` differs from the input. */
  changed: boolean;
  detection: JsonDetection;
  before: JsonTextSize;
  after: JsonTextSize;
}
