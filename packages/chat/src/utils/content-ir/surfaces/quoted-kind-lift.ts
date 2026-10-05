/**
 * A JSON REGION INSIDE A BLOCKQUOTE leaves the quote (V1, the never-raw law).
 *
 * A model sometimes quotes its whole answer — `> ```json` / `> {"__kind":…}` —
 * and every line then starts with `>`. Neither host could see the region: the
 * live accumulator classifies a `>` line as prose, the static splitter keeps
 * the quote as one text block, so the kind was drawn as raw JSON inside a
 * blockquote in chat, on reload, on public shared pages and in tool results.
 *
 * THE RULE: a blockquote holds prose, never a data region. A JSON-family
 * fence (```json / ```jsonc / ```json5 / unlabelled, any case, ``` or ~~~)
 * opening on a quoted line, or a quoted line whose JSON could be a kind (the
 * first-key rule, `jsonKindSignal`), is LIFTED: its quote prefix is removed
 * from every line of the region, so the region becomes an ordinary top-level
 * fence / bare JSON object between two quotes. The quote before it renders as
 * a quote, the region as its kind, the quote after it as a new quote. Quoted
 * text that is not a JSON region is never touched — and a fence of another
 * language (```ts, ```xml, ```markdown, quoted or not) is the model quoting
 * SOURCE, so nothing inside it is lifted (the owner's ruling, 2026-09-30).
 *
 * ONE transform, both hosts: the live accumulator pushes every delta through
 * a `QuotedKindLift` before its line machine; the static splitter runs
 * `liftQuotedKindRegions` on the whole text first. The transform is
 * chunk-invariant (decisions are taken only at points every chunking reaches
 * with the same bytes), so live = reload byte for byte.
 */

import { FenceReader, fenceOpenerOf } from "@ai-matrx/content-ir/source";
import { jsonKindSignal } from "./json-kind-signal";

/** Fence languages whose body is a JSON region (an unlabelled fence included). */
const JSON_FENCE_LANGS = new Set(["", "json", "jsonc", "json5"]);

/** A blockquote prefix: up to three spaces, then one or more `>` (each with an optional space). */
const QUOTE_PREFIX = /^ {0,3}>(?: ?>)* ?/;

/** How deep a matched quote prefix nests (`> >` is 2). */
function quoteDepth(prefix: string): number {
  return (prefix.match(/>/g) ?? []).length;
}

/** A prefix of exactly `depth` levels, or null. */
function prefixOfDepth(line: string, depth: number): string | null {
  const match = new RegExp(`^ {0,3}>(?: ?>){${depth - 1}} ?`).exec(line);
  return match ? match[0] : null;
}

type Mode =
  /** Between regions. */
  | { kind: "none" }
  /** Inside an unquoted (or quoted, non-JSON) fence: everything passes as written. */
  | { kind: "source_fence"; reader: FenceReader; depth: number }
  /** Quoted JSON-ish lines held while the first key decides (multi-line `> {`). */
  | { kind: "candidate"; depth: number; raw: string[]; stripped: string[] }
  /** A lifted JSON-family fence: prefix stripped until its closing line. */
  | { kind: "lifted_fence"; reader: FenceReader; depth: number }
  /** A lifted bare JSON value: prefix stripped until its brackets balance. */
  | { kind: "lifted_bare"; depth: number; balance: number };

/** Structural bracket balance of one line (JSON strings are opaque; none spans a line). */
function bracketDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let escaped = false;
  for (const ch of line) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") delta++;
    else if (ch === "}" || ch === "]") delta--;
  }
  return delta;
}

/**
 * The streaming lift. `push` returns the bytes that are safe to hand on now;
 * a line whose fate is not known yet (a quoted line that may open a JSON
 * region) is held — never shown raw — until it is. `flush` releases what is
 * held, as written, at the end of the stream (or a hard boundary).
 */
export class QuotedKindLift {
  private mode: Mode = { kind: "none" };
  /** The current line's bytes not yet handed on (held while undecided). */
  private held = "";
  /** The current line's bytes so far (handed on or not), as received. */
  private line = "";
  /** Whether the rest of the current line passes straight through. */
  private passing = false;
  /** Prefix stripped from the current line's handed-on bytes (passing lines). */
  private stripping = 0;

  push(text: string): string {
    let out = "";
    for (const ch of text) out += this.pushChar(ch);
    return out;
  }

  flush(): string {
    let out = "";
    if (this.mode.kind === "candidate") {
      out += this.mode.raw.join("\n") + (this.mode.raw.length ? "\n" : "");
      this.mode = { kind: "none" };
    }
    out += this.held;
    this.held = "";
    this.line = "";
    this.passing = false;
    this.stripping = 0;
    return out;
  }

  private pushChar(ch: string): string {
    if (ch === "\n") return this.endLine();
    this.line += ch;
    if (this.passing) {
      if (this.stripping > 0) {
        // Still inside the prefix being removed.
        this.stripping--;
        return "";
      }
      return ch;
    }
    this.held += ch;
    return this.decideMidLine();
  }

  /** Try to decide the current line before it ends; returns bytes released. */
  private decideMidLine(): string {
    const mode = this.mode;
    if (mode.kind === "source_fence") {
      // Pass as written; the closer is judged at line end.
      return this.release(this.held, 0);
    }
    if (mode.kind === "lifted_fence" || mode.kind === "lifted_bare") {
      const prefix = prefixOfDepth(this.held, mode.depth);
      if (prefix !== null && (this.held.length > prefix.length || /> $/.test(prefix))) {
        // The prefix is known and complete: strip it, pass the rest live.
        // A lifted fence's closing line is judged at line end, so a fragment
        // that may be that closer (it opens with a backtick or tilde) waits.
        const rest = this.held.slice(prefix.length);
        if (mode.kind === "lifted_fence" && /^\s*[`~]/.test(rest)) return "";
        return this.release(rest, 0);
      }
      if (!/^ {0,3}(?:> ?)*$/.test(this.held)) {
        // A lazy line (no quote prefix) inside the region: passes as written.
        return this.release(this.held, 0);
      }
      return "";
    }
    if (mode.kind === "candidate") return "";
    // none: is this line a quote at all?
    if (!/^ {0,3}(?:>|$)/.test(this.held) && !/^ {0,3}$/.test(this.held)) {
      return this.release(this.held, 0);
    }
    const prefix = QUOTE_PREFIX.exec(this.held)?.[0];
    if (!prefix) return "";
    const rest = this.held.slice(prefix.length);
    if (!rest.trim()) return "";
    const first = rest.trimStart()[0];
    if (first === "`" || first === "~") return ""; // decided at line end
    if (first === "{" || first === "[") {
      // Lift the moment the first key says kind (monotonic — a `__kind` key
      // never un-arrives); anything else waits for the line to end.
      if (jsonKindSignal(rest) === "kind") {
        this.mode = { kind: "lifted_bare", depth: quoteDepth(prefix), balance: 0 };
        return this.release(rest, 0);
      }
      return "";
    }
    // Quoted prose.
    return this.release(this.held, 0);
  }

  /** Hand on `bytes` and let the rest of the line pass straight through. */
  private release(bytes: string, strip: number): string {
    this.held = "";
    this.passing = true;
    this.stripping = strip;
    return bytes;
  }

  private endLine(): string {
    const line = this.line;
    const held = this.held;
    this.line = "";
    this.held = "";
    this.passing = false;
    this.stripping = 0;
    const mode = this.mode;

    if (mode.kind === "source_fence") {
      const content = mode.depth > 0 ? line.replace(QUOTE_PREFIX, "") : line;
      if (mode.reader.feed(content)) this.mode = { kind: "none" };
      return held + "\n";
    }

    if (mode.kind === "lifted_fence") {
      const prefix = prefixOfDepth(line, mode.depth);
      const content = prefix !== null ? line.slice(prefix.length) : line;
      if (mode.reader.feed(content)) this.mode = { kind: "none" };
      // What was not handed on yet (a held closer, or a prefix-only line).
      const sent = line.length - held.length;
      const contentSent = Math.max(0, sent - (prefix?.length ?? 0));
      return content.slice(contentSent) + "\n";
    }

    if (mode.kind === "lifted_bare") {
      const prefix = prefixOfDepth(line, mode.depth);
      const content = prefix !== null ? line.slice(prefix.length) : line;
      mode.balance += bracketDelta(content);
      if (mode.balance <= 0) this.mode = { kind: "none" };
      const sent = line.length - held.length;
      const contentSent = Math.max(0, sent - (prefix?.length ?? 0));
      return content.slice(contentSent) + "\n";
    }

    if (mode.kind === "candidate") {
      const prefix = prefixOfDepth(line, mode.depth);
      if (prefix === null) {
        // The quote ended before the first key decided: it was prose.
        const out = mode.raw.join("\n") + "\n";
        this.mode = { kind: "none" };
        return out + this.lineFromNone(line);
      }
      mode.raw.push(line);
      mode.stripped.push(line.slice(prefix.length));
      return this.settleCandidate(mode);
    }

    return this.lineFromNone(line, held);
  }

  /**
   * A complete line met with no region open. `held` is what was not handed
   * on yet: the whole line when it was held to the end, otherwise "" (it was
   * released mid-line as prose or as an unquoted line).
   */
  private lineFromNone(line: string, held = line): string {
    const prefix = QUOTE_PREFIX.exec(line)?.[0];
    if (held.length < line.length || !prefix) {
      // Released mid-line (or never a quote). An unquoted fence opener starts
      // a source region: nothing inside it is lifted.
      if (!prefix) {
        const opener = fenceOpenerOf(line);
        if (opener) {
          this.mode = { kind: "source_fence", reader: new FenceReader(opener), depth: 0 };
        }
      }
      return held + "\n";
    }
    const rest = line.slice(prefix.length);
    const depth = quoteDepth(prefix);
    const trimmed = rest.trimStart();
    if (trimmed.startsWith("`") || trimmed.startsWith("~")) {
      const opener = fenceOpenerOf(rest);
      if (opener && JSON_FENCE_LANGS.has(opener.lang.toLowerCase())) {
        this.mode = { kind: "lifted_fence", reader: new FenceReader(opener), depth };
        return rest + "\n";
      }
      if (opener) {
        this.mode = { kind: "source_fence", reader: new FenceReader(opener), depth };
      }
      return held + "\n";
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const candidate: Mode = { kind: "candidate", depth, raw: [line], stripped: [rest] };
      this.mode = candidate;
      return this.settleCandidate(candidate);
    }
    return held + "\n";
  }

  /** A held quoted JSON start, re-judged after each complete line. */
  private settleCandidate(mode: Extract<Mode, { kind: "candidate" }>): string {
    const signal = jsonKindSignal(mode.stripped.join("\n"));
    if (signal === "undecided") return "";
    if (signal === "not_kind") {
      this.mode = { kind: "none" };
      return mode.raw.join("\n") + "\n";
    }
    const balance = mode.stripped.reduce((sum, l) => sum + bracketDelta(l), 0);
    this.mode =
      balance > 0
        ? { kind: "lifted_bare", depth: mode.depth, balance }
        : { kind: "none" };
    return mode.stripped.join("\n") + "\n";
  }
}

/** The whole-text form, for the static splitter (identical bytes to any streaming of `source`). */
export function liftQuotedKindRegions(source: string): string {
  if (!source.includes(">")) return source;
  const lift = new QuotedKindLift();
  return lift.push(source) + lift.flush();
}

