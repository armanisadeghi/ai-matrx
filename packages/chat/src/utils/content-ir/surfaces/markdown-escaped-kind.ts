/**
 * THE MARKDOWN-ESCAPED KIND (P8, round 4). A model that escapes markdown in
 * its whole answer writes `{"\_\_kind":"flashcard\_set",…}`. No JSON reader
 * sees a kind there (`\_` is not even a JSON escape), but the markdown
 * renderer un-escapes it, so the reader saw `{"__kind":…}` drawn raw.
 *
 * THE RULE: the key `"\_\_kind"` IS the key `"__kind"` (the detector reads it
 * in text contexts, `hasKindKey(…, { markdown: true })`), and inside the JSON
 * object that holds it every `\_` is `_`. ONE transform, both hosts: the live
 * accumulator pushes every delta through a `MarkdownEscapedKindJson` before
 * its line machine; the static splitter runs `unescapeMarkdownKindJson` on the
 * whole text first. Character-driven and chunk-invariant, so live = reload.
 *
 * Also here (decided, round 4): a DOUBLE-ENCODED kind — the whole answer is a
 * JSON string literal whose value is kind JSON (`"{\"__kind\":…}"`) — reads as
 * that kind (`decodeDoubleEncodedKindText`, whole text, settled readers only).
 */

import { isKindJsonText, withoutZeroWidth } from "./json-kind-signal";

const TARGET = '"\\_\\_kind"';
const KEY = '"__kind"';
const HAS_ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/;

/**
 * A ZERO-WIDTH character inside the key (`"__\u200Bkind"`, round 8): the
 * screen reads `"__kind"`, so the key is rewritten as `"__kind"` before
 * anything else reads the text, and the normal kind route (fence, standalone,
 * prose) takes it. Only a complete key is rewritten — a zero-width character
 * anywhere else stays. Character-driven and chunk-invariant (live = reload).
 */
export class ZeroWidthKindKey {
  /** Bytes that may still become the key — held, never shown. */
  private pending = "";

  push(text: string): string {
    let out = "";
    for (const ch of text) out += this.pushChar(ch);
    return out;
  }

  flush(): string {
    const out = this.pending;
    this.pending = "";
    return out;
  }

  private pushChar(ch: string): string {
    let candidate = this.pending + ch;
    let out = "";
    while (candidate && !(candidate.startsWith('"') && KEY.startsWith(withoutZeroWidth(candidate)))) {
      const next = candidate.indexOf('"', 1);
      if (next < 0) {
        out += candidate;
        candidate = "";
      } else {
        out += candidate.slice(0, next);
        candidate = candidate.slice(next);
      }
    }
    if (withoutZeroWidth(candidate) === KEY) {
      this.pending = "";
      return out + KEY;
    }
    this.pending = candidate;
    return out;
  }
}

export class MarkdownEscapedKindJson {
  /** The zero-width key spelling is read first (round 8) — one transform, both hosts. */
  private zeroWidth = new ZeroWidthKindKey();
  /** Bytes that may still become the escaped key — held, never shown. */
  private pending = "";
  /** Inside the object holding a rewritten key: bracket depth (0 = outside). */
  private depth = 0;
  private inString = false;
  /** A held backslash inside the object (its fate depends on the next char). */
  private escape = false;

  push(text: string): string {
    return this.pushUnescape(this.zeroWidth.push(text));
  }

  private pushUnescape(text: string): string {
    let out = "";
    for (const ch of text) out += this.pushChar(ch);
    return out;
  }

  flush(): string {
    const held = this.pushUnescape(this.zeroWidth.flush());
    const out = held + this.pending + (this.escape ? "\\" : "");
    this.pending = "";
    this.escape = false;
    this.depth = 0;
    this.inString = false;
    return out;
  }

  private pushChar(ch: string): string {
    if (this.depth > 0) return this.insideObject(ch);
    let candidate = this.pending + ch;
    let out = "";
    // A zero-width character inside the escaped key reads through (L-1, round 9).
    while (candidate && !(candidate.startsWith('"') && TARGET.startsWith(withoutZeroWidth(candidate)))) {
      const next = candidate.indexOf('"', 1);
      if (next < 0) {
        out += candidate;
        candidate = "";
      } else {
        out += candidate.slice(0, next);
        candidate = candidate.slice(next);
      }
    }
    if (withoutZeroWidth(candidate) === TARGET) {
      this.pending = "";
      this.depth = 1;
      this.inString = false;
      return out + KEY;
    }
    this.pending = candidate;
    return out;
  }

  private insideObject(ch: string): string {
    if (this.escape) {
      this.escape = false;
      return ch === "_" ? "_" : `\\${ch}`;
    }
    if (ch === "\\") {
      this.escape = true;
      return "";
    }
    if (this.inString) {
      if (ch === '"') this.inString = false;
      return ch;
    }
    if (ch === '"') this.inString = true;
    else if (ch === "{" || ch === "[") this.depth += 1;
    else if (ch === "}" || ch === "]") this.depth -= 1;
    return ch;
  }
}

/** The whole-text form, for the static splitter (identical bytes to any streaming of `source`). */
export function unescapeMarkdownKindJson(source: string): string {
  if (!source.includes(TARGET) && !HAS_ZERO_WIDTH.test(source)) return source;
  const transform = new MarkdownEscapedKindJson();
  return transform.push(source) + transform.flush();
}

/**
 * A whole answer that is a JSON STRING literal holding kind JSON → that kind
 * JSON; anything else unchanged.
 */
export function decodeDoubleEncodedKindText(source: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"') || !trimmed.includes('\\"__kind\\"')) return source;
  try {
    const inner: unknown = JSON.parse(trimmed);
    return typeof inner === "string" && isKindJsonText(inner.trim()) ? inner.trim() : source;
  } catch {
    return source;
  }
}
