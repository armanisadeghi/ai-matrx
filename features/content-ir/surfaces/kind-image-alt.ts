/**
 * A KIND AS AN IMAGE'S ALT TEXT (P9, round 4): `![{"__kind":…}](url)`. The
 * prose split lifted the object out and left `!` and `(url)` behind as two
 * stray prose blocks after reload (and live). The model meant the kind: the
 * image wrapper is chrome — `![` before the object and `](url)` after it are
 * dropped, the object stays where it was and renders as its kind. A kindless
 * object in alt text (first key decided not `__kind`) is left as written.
 *
 * ONE transform, both hosts (like `quoted-kind-lift.ts`): the live accumulator
 * pushes every delta through a `KindImageAltUnwrap`; the static splitter runs
 * `unwrapKindImageAlt` on the whole text. Character-driven and chunk-invariant.
 */

import { jsonKindSignal } from "./json-kind-signal";

type Mode = "scan" | "head" | "body" | "tail";

/** Past this, an alt text whose first key never arrived is left as written. */
const HEAD_LIMIT = 2000;

export class KindImageAltUnwrap {
  private mode: Mode = "scan";
  /** Held: `!` / `![` (scan), the object so far (head), `](…` (tail). */
  private held = "";
  private depth = 0;
  private inString = false;
  private escape = false;

  push(text: string): string {
    let out = "";
    for (const ch of text) out += this.pushChar(ch);
    return out;
  }

  flush(): string {
    const out = this.mode === "head" ? `![${this.held}` : this.held;
    this.mode = "scan";
    this.held = "";
    this.depth = 0;
    this.inString = false;
    this.escape = false;
    return out;
  }

  /** Track JSON structure; returns true when the object just closed. */
  private track(ch: string): boolean {
    if (this.escape) {
      this.escape = false;
      return false;
    }
    if (this.inString) {
      if (ch === "\\") this.escape = true;
      else if (ch === '"') this.inString = false;
      return false;
    }
    if (ch === '"') this.inString = true;
    else if (ch === "{" || ch === "[") this.depth += 1;
    else if (ch === "}" || ch === "]") {
      this.depth -= 1;
      return this.depth === 0;
    }
    return false;
  }

  private pushChar(ch: string): string {
    switch (this.mode) {
      case "scan": {
        if (this.held === "" && ch === "!") {
          this.held = "!";
          return "";
        }
        if (this.held === "!" && ch === "[") {
          this.held = "![";
          return "";
        }
        if (this.held === "![" && ch === "{") {
          this.mode = "head";
          this.held = "{";
          this.depth = 1;
          this.inString = false;
          this.escape = false;
          return "";
        }
        if (this.held === "") return ch;
        const out = this.held;
        this.held = "";
        return out + this.pushChar(ch);
      }
      case "head": {
        this.held += ch;
        const closed = this.track(ch);
        const signal = jsonKindSignal(this.held);
        if (signal === "kind") {
          const out = this.held;
          this.held = "";
          if (closed) {
            this.mode = "tail";
            return out;
          }
          this.mode = "body";
          return out;
        }
        if (signal === "not_kind" || closed || this.held.length > HEAD_LIMIT) {
          const out = `![${this.held}`;
          this.held = "";
          this.mode = "scan";
          return out;
        }
        return "";
      }
      case "body": {
        if (this.track(ch)) this.mode = "tail";
        return ch;
      }
      case "tail": {
        this.held += ch;
        if (/^\]\([^)\n]*\)$/.test(this.held)) {
          this.held = "";
          this.mode = "scan";
          return "";
        }
        if (/^\](?:\([^)\n]*)?$/.test(this.held)) return "";
        // Not an image tail: hand it on as written.
        const out = this.held;
        this.held = "";
        this.mode = "scan";
        return out;
      }
    }
  }
}

/** The whole-text form, for the static splitter (identical bytes to any streaming of `source`). */
export function unwrapKindImageAlt(source: string): string {
  if (!source.includes("![{")) return source;
  const transform = new KindImageAltUnwrap();
  return transform.push(source) + transform.flush();
}
