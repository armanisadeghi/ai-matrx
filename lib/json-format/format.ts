// lib/json-format/format.ts
//
// The JSON writer. Three styles over one recursive printer:
//
//   minify  — one line, no optional whitespace.
//   compact — width-aware FILL. Any subtree whose flat form fits the remaining
//             columns is inlined; a subtree that does not fit expands, but its
//             children are then PACKED onto shared lines while they fit. This
//             is what turns an 11-line reference blob into 3 lines without
//             turning it into an unreadable one-liner.
//   pretty  — one entry per line (classic 2-space JSON).
//
// Why not `JSON.stringify(v, null, 2)`: it cannot inline, cannot pack, and
// cannot sort keys. All three are the point.
//
// Pure: no React / DOM. Never throws — a parse failure comes back as a result
// with `ok: false` and the input text unchanged.

import type { JsonObject, JsonValue } from "@/types/json";
import { isJsonArray, isJsonObject } from "@/types/json";
import { detectJson } from "./detect";
import type {
  JsonDetection,
  JsonFormatOptions,
  JsonFormatResult,
  JsonTextSize,
} from "./types";

export const DEFAULT_JSON_INDENT = 2;
export const DEFAULT_JSON_WIDTH = 100;

interface WriterConfig {
  indent: number;
  /** Target line width; `-1` disables inlining entirely (pretty). */
  width: number;
  /** Pack sibling entries onto shared lines (compact only). */
  pack: boolean;
  /** Spaces inside braces/brackets and after colons/commas. */
  spaced: boolean;
  sortKeys: boolean;
}

function orderedKeys(obj: JsonObject, sortKeys: boolean): string[] {
  // `undefined` values are not JSON — JSON.stringify drops them, so do we.
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  return sortKeys ? [...keys].sort((a, b) => a.localeCompare(b)) : keys;
}

/** Serialize a scalar exactly as JSON does. */
function writeScalar(value: JsonValue): string {
  // NaN / Infinity stringify to "null", matching JSON.stringify.
  return JSON.stringify(value) ?? "null";
}

/** The whole subtree on one line. */
function flatten(value: JsonValue, cfg: WriterConfig): string {
  if (isJsonArray(value)) {
    if (value.length === 0) return "[]";
    const parts = value.map((v) => flatten(v ?? null, cfg));
    return cfg.spaced ? `[${parts.join(", ")}]` : `[${parts.join(",")}]`;
  }
  if (isJsonObject(value)) {
    const keys = orderedKeys(value, cfg.sortKeys);
    if (keys.length === 0) return "{}";
    const colon = cfg.spaced ? ": " : ":";
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}${colon}${flatten(value[k] ?? null, cfg)}`,
    );
    return cfg.spaced ? `{ ${parts.join(", ")} }` : `{${parts.join(",")}}`;
  }
  return writeScalar(value);
}

/**
 * Lay out `entries` (already-rendered child texts) inside a container.
 * Single-line entries are packed together while they fit; a multi-line entry
 * always occupies its own line(s). Returns the body lines, unindented-prefixed
 * with `pad` already applied.
 */
function layoutEntries(
  entries: string[],
  pad: string,
  cfg: WriterConfig,
): string[] {
  if (!cfg.pack) return entries.map((e) => pad + e);

  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const isLast = i === entries.length - 1;
    const piece = isLast ? entry : `${entry},`;

    if (entry.includes("\n")) {
      // Multi-line child: flush whatever is buffered, then stand alone.
      if (current !== "") {
        lines.push(pad + current);
        current = "";
      }
      lines.push(pad + piece);
      continue;
    }

    if (current === "") {
      current = piece;
      continue;
    }
    const merged = `${current} ${piece}`;
    if (pad.length + merged.length <= cfg.width) {
      current = merged;
    } else {
      lines.push(pad + current);
      current = piece;
    }
  }
  if (current !== "") lines.push(pad + current);
  return lines;
}

/**
 * Render `value` starting at column `used` on its current line, at nesting
 * `level`. `used` includes the indentation AND any key prefix already written,
 * so the width budget is honest about `"items": [` style prefixes.
 */
function renderNode(
  value: JsonValue,
  level: number,
  used: number,
  cfg: WriterConfig,
): string {
  const isContainer = isJsonArray(value) || isJsonObject(value);
  if (!isContainer) return writeScalar(value);

  const flat = flatten(value, cfg);
  if (flat === "[]" || flat === "{}") return flat;
  if (cfg.width >= 0 && used + flat.length <= cfg.width) return flat;

  const pad = " ".repeat((level + 1) * cfg.indent);
  const closePad = " ".repeat(level * cfg.indent);

  if (isJsonArray(value)) {
    const entries = value.map((v) =>
      renderNode(v ?? null, level + 1, pad.length, cfg),
    );
    const body = layoutEntries(entries, pad, cfg);
    const joined = cfg.pack ? body.join("\n") : body.join(",\n");
    return `[\n${joined}\n${closePad}]`;
  }

  const keys = orderedKeys(value, cfg.sortKeys);
  const entries = keys.map((k) => {
    const prefix = `${JSON.stringify(k)}: `;
    const rendered = renderNode(
      value[k] ?? null,
      level + 1,
      pad.length + prefix.length,
      cfg,
    );
    return prefix + rendered;
  });
  const body = layoutEntries(entries, pad, cfg);
  const joined = cfg.pack ? body.join("\n") : body.join(",\n");
  return `{\n${joined}\n${closePad}}`;
}

/**
 * Serialize a JSON value in one of the three styles. This is the entry point
 * for callers that already HAVE a value (a DB JSONB blob, an API frame) and
 * just want it laid out; text callers want {@link formatJsonText}.
 */
export function stringifyJson(
  value: JsonValue,
  options: JsonFormatOptions,
): string {
  const indent = options.indent ?? DEFAULT_JSON_INDENT;
  const sortKeys = options.sortKeys ?? false;

  if (options.style === "minify") {
    return flatten(value, { indent, width: -1, pack: false, spaced: false, sortKeys });
  }

  const cfg: WriterConfig = {
    indent,
    width: options.style === "pretty" ? -1 : (options.width ?? DEFAULT_JSON_WIDTH),
    pack: options.style === "compact",
    spaced: true,
    sortKeys,
  };
  return renderNode(value, 0, 0, cfg);
}

function sizeOf(text: string): JsonTextSize {
  let lines = text === "" ? 0 : 1;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lines++;
  return { lines, chars: text.length };
}

/** Re-assemble the full text: leading + fence + formatted payload + trailing. */
function reassemble(
  detection: JsonDetection,
  payload: string,
  mode: NonNullable<JsonFormatOptions["fence"]>,
): string {
  const { fence, leading, trailing } = detection;

  const keepFence =
    mode === "add" || (mode === "preserve" && fence !== null);
  if (!keepFence) {
    return leading + payload + trailing;
  }

  const marker = fence?.marker ?? "```";
  const lang = fence?.lang && fence.lang !== "" ? fence.lang : "json";
  const indent = fence?.indent ?? "";
  const body = indent
    ? payload
        .split("\n")
        .map((l) => (l === "" ? l : indent + l))
        .join("\n")
    : payload;

  // An unterminated source fence stays unterminated — inventing a closing fence
  // would change the surrounding document's structure, not just this block's.
  const close = fence !== null && !fence.closed ? "" : `\n${indent}${marker}`;
  return `${leading}${indent}${marker}${lang}\n${body}${close}${trailing}`;
}

/**
 * Format the JSON found in `text`, preserving everything around it.
 *
 * Never throws. When the text does not parse, the result is `ok: false`,
 * `changed: false`, and `text` is the input verbatim — a formatter that
 * mangles text it did not understand is a data-loss bug.
 */
export function formatJsonText(
  text: string,
  options: JsonFormatOptions,
): JsonFormatResult {
  const detection = detectJson(text);
  const before = sizeOf(text);

  if (!detection.ok || detection.value === undefined) {
    return {
      ok: false,
      text,
      error: detection.error ?? "Selection is not JSON.",
      changed: false,
      detection,
      before,
      after: before,
    };
  }

  const payload = stringifyJson(detection.value, options);
  const next = reassemble(detection, payload, options.fence ?? "preserve");

  return {
    ok: true,
    text: next,
    changed: next !== text,
    detection,
    before,
    after: sizeOf(next),
  };
}
