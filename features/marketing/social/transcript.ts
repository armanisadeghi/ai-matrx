/**
 * Transcript text -> readable paragraphs. Providers hand back either plain text or raw WebVTT
 * (header, cue timings, repeated rolling-caption lines); a person never sees that raw form.
 * Pure, so it is unit-tested without a render.
 */

export interface TranscriptParagraph {
  /** Seconds from the start, when the source carried timings; else null. */
  start: number | null;
  text: string;
}

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;

function seconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
}

function cleanLine(line: string): string {
  return line
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest words-suffix of `prev` that is a prefix of `next` (rolling captions repeat the last line). */
function dropOverlap(prev: string, next: string): string {
  if (!prev) return next;
  if (prev.endsWith(next)) return "";
  const a = prev.split(" ");
  const b = next.split(" ");
  for (let n = Math.min(a.length, b.length); n > 0; n -= 1) {
    if (a.slice(-n).join(" ") === b.slice(0, n).join(" ")) return b.slice(n).join(" ");
  }
  return next;
}

const MAX_PARAGRAPH_CHARS = 420;

/** Group a flat run of timed fragments into paragraphs that end at a sentence boundary once long enough. */
function paragraphsFrom(fragments: ReadonlyArray<{ start: number | null; text: string }>): TranscriptParagraph[] {
  const out: TranscriptParagraph[] = [];
  let cur: TranscriptParagraph | null = null;
  for (const f of fragments) {
    if (!f.text) continue;
    if (!cur) cur = { start: f.start, text: f.text };
    else cur.text = `${cur.text} ${f.text}`;
    if (cur.text.length >= MAX_PARAGRAPH_CHARS && /[.!?]["')\]]?$/.test(cur.text)) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function parseTranscript(raw: string): TranscriptParagraph[] {
  const text = (raw ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const isCues = /^\s*WEBVTT/.test(text) || text.split("\n").some((l) => TIMING.test(l));
  if (isCues) {
    const fragments: Array<{ start: number | null; text: string }> = [];
    let prev = "";
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split("\n");
      const at = lines.findIndex((l) => TIMING.test(l));
      if (at < 0) continue; // WEBVTT header, NOTE / STYLE / REGION blocks
      const start = seconds(TIMING.exec(lines[at]!)![1]!);
      const body = cleanLine(lines.slice(at + 1).join(" "));
      const fresh = dropOverlap(prev, body);
      if (body) prev = body;
      if (fresh) fragments.push({ start, text: fresh });
    }
    return paragraphsFrom(fragments);
  }
  const blocks = text.split(/\n{2,}/).map(cleanLine).filter(Boolean);
  if (blocks.length > 1) return blocks.map((t) => ({ start: null, text: t }));
  // One unbroken run: break it into readable chunks at sentence ends.
  const sentences = (blocks[0] ?? "").split(/(?<=[.!?])\s+/);
  return paragraphsFrom(sentences.map((t) => ({ start: null, text: t })));
}

/** `1:05`, `12:30`, `1:02:03`. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const UNKNOWN_LANGUAGES = new Set(["", "und", "unk", "unknown", "zxx", "mis", "mul", "xx", "n/a", "none", "null"]);

/** The language's name ("English"), or null when it is unknown — an unknown code is never shown. */
export function languageName(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  if (UNKNOWN_LANGUAGES.has(c.toLowerCase())) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(c);
    if (name && name.toLowerCase() !== c.toLowerCase()) return name;
  } catch {
    // not a valid BCP-47 tag
  }
  return null;
}

export function wordCountOf(paragraphs: readonly TranscriptParagraph[]): number {
  return paragraphs.reduce((n, p) => n + (p.text.split(/\s+/).filter(Boolean).length), 0);
}

/** The plain text a Copy button should put on the clipboard: paragraphs, no cue markup. */
export function plainTranscript(paragraphs: readonly TranscriptParagraph[]): string {
  return paragraphs.map((p) => p.text).join("\n\n");
}
