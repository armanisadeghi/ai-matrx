// lib/json-format/detect.ts
//
// "Is this text JSON, and where exactly does the JSON start and stop?"
//
// The answer has to survive real-world selections: a fenced ```json block, a
// bare pasted object, an object with a stray blank line above it, a fence the
// user only half-selected. So detection splits the text into three parts —
// leading / payload / trailing — and only the payload is ever re-formatted.
// Everything outside it is restored verbatim, because a formatter that eats
// the prose around the JSON is worse than no formatter at all.
//
// Two parse tiers: `JSON.parse` first (strict — what the value really is), then
// JSON5 (tolerant — trailing commas, comments, unquoted keys, single quotes),
// because the JSON people paste out of logs and code is frequently not legal
// JSON. Tolerant parsing is reported, never hidden: a consumer that re-emits a
// tolerantly-parsed value is normalizing it, and the caller can say so.
//
// Pure: no React / DOM. Never throws.

import JSON5 from "json5";
import type { JsonValue } from "@/types/json";
import type {
  JsonDetection,
  JsonFence,
  JsonParser,
  JsonRootKind,
} from "./types";

/** Opening fence line: optional indent, 3+ backticks or tildes, optional info. */
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

/** Languages we treat as "this fence contains JSON". */
const JSON_FENCE_LANGS = new Set(["json", "jsonc", "json5", "geojson", "jsonl"]);

interface Split {
  leading: string;
  payload: string;
  trailing: string;
  fence: JsonFence | null;
}

/** Peel a markdown code fence off the text, if the text IS a fenced block. */
function splitFence(text: string): Split | null {
  const lines = text.split("\n");

  // The fence may sit anywhere in the selection (a user highlighting a block
  // plus the sentence above it is the common case) — but there must be exactly
  // ONE block. Two fenced blocks in one selection is not a single JSON payload,
  // and spanning them would splice unrelated content together.
  const openIdx = lines.findIndex((l) => FENCE_OPEN.test(l));
  if (openIdx === -1) return null;

  const open = FENCE_OPEN.exec(lines[openIdx] ?? "");
  if (!open) return null;
  const [, indent = "", marker = "```", lang = ""] = open;
  const fenceChar = marker[0] ?? "`";
  const closeRe = new RegExp(`^[ \\t]*\\${fenceChar}{${marker.length},}[ \\t]*$`);

  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (closeRe.test(lines[i] ?? "")) {
      closeIdx = i;
      break;
    }
  }

  const afterClose = closeIdx === -1 ? [] : lines.slice(closeIdx + 1);
  if (afterClose.some((l) => FENCE_OPEN.test(l))) return null;

  const bodyEnd = closeIdx === -1 ? lines.length : closeIdx;
  // The line separators bordering the fence belong to leading/trailing, so
  // reassembly is a plain concatenation and blank lines survive it.
  return {
    leading: openIdx > 0 ? `${lines.slice(0, openIdx).join("\n")}\n` : "",
    payload: lines.slice(openIdx + 1, bodyEnd).join("\n"),
    trailing: afterClose.length > 0 ? `\n${afterClose.join("\n")}` : "",
    fence: {
      marker,
      lang: lang.toLowerCase(),
      indent,
      closed: closeIdx !== -1,
    },
  };
}

/** Split bare (unfenced) text into surrounding whitespace + payload. */
function splitBare(text: string): Split {
  const payload = text.trim();
  if (payload === "") {
    return { leading: text, payload: "", trailing: "", fence: null };
  }
  const start = text.indexOf(payload);
  return {
    leading: text.slice(0, start),
    payload,
    trailing: text.slice(start + payload.length),
    fence: null,
  };
}

function rootKindOf(value: JsonValue): JsonRootKind {
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && value !== null) return "object";
  return "scalar";
}

/** Bracket-shaped: opens and closes with a matching container delimiter. */
function isBracketShaped(payload: string): boolean {
  const first = payload[0];
  const last = payload[payload.length - 1];
  if (payload.length < 2) return false;
  return (first === "{" && last === "}") || (first === "[" && last === "]");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Invalid JSON";
}

function countLines(s: string): number {
  if (s === "") return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

/**
 * Detect JSON in `text`. Never throws; a non-JSON string comes back with
 * `ok: false` and `looksLikeJson: false`, which is the signal to offer nothing.
 */
export function detectJson(text: string): JsonDetection {
  const split = splitFence(text) ?? splitBare(text);
  // A fenced block's body still carries its own indentation/blank lines.
  const payload = split.fence ? split.payload.trim() : split.payload;

  const fenceSaysJson =
    split.fence !== null &&
    (split.fence.lang === "" || JSON_FENCE_LANGS.has(split.fence.lang));

  const base = {
    fence: split.fence,
    leading: split.leading,
    trailing: split.trailing,
    payload,
    lineCount: countLines(payload),
    charCount: payload.length,
  };

  if (payload === "") {
    return { ...base, ok: false, looksLikeJson: false };
  }

  // A fence declaring a NON-JSON language is a hard no, even if the body would
  // parse — reformatting the inside of a ```python block is not our business.
  if (split.fence !== null && !fenceSaysJson) {
    return { ...base, ok: false, looksLikeJson: false };
  }

  const shaped = isBracketShaped(payload);

  let value: JsonValue | undefined;
  let parser: JsonParser | undefined;
  let error: string | undefined;
  try {
    value = JSON.parse(payload) as JsonValue;
    parser = "strict";
  } catch (strictErr) {
    try {
      value = JSON5.parse(payload) as JsonValue;
      parser = "tolerant";
    } catch {
      error = errorMessage(strictErr);
    }
  }

  if (value === undefined || parser === undefined) {
    // Unparseable. Still "looks like JSON" when it is bracket-shaped, so a
    // surface can show the actions and report the parse error on click rather
    // than pretending the selection is ordinary prose.
    return { ...base, ok: false, looksLikeJson: shaped, error };
  }

  const root = rootKindOf(value);
  // A bare scalar ("hello", 42, true) parses but is not worth offering JSON
  // actions on — every prose word that happens to be a number would qualify.
  const worthOffering = root !== "scalar" || fenceSaysJson;

  return { ...base, ok: true, looksLikeJson: worthOffering, value, parser, root };
}
