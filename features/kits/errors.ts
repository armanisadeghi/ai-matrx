// features/kits/errors.ts — what a person reads when something fails.
//
// Transport noise ("TypeError: fetch failed", "Failed to fetch", an HTML error
// page) is never the sentence: it becomes a plain one, and the raw text is kept
// for the "Details" disclosure. A door's own refusal is already a sentence for a
// person (the record store and the agent RPCs write them that way) and is kept.

export interface PlainError {
  sentence: string;
  /** The raw text, for "Details". Null when the sentence IS the raw text. */
  detail: string | null;
}

const TRANSPORT = /(failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|etimedout|socket hang up|aborted)/i;
const HTML = /<\s*(!doctype|html|head|body)\b/i;

export function plainError(raw: unknown): PlainError {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : String(raw);
  const trimmed = text.trim();
  if (!trimmed) return { sentence: "Something went wrong.", detail: null };
  if (HTML.test(trimmed)) {
    return { sentence: "Something went wrong on our side. Try again in a moment.", detail: trimmed };
  }
  if (TRANSPORT.test(trimmed)) {
    return { sentence: "Couldn't connect. Check your connection and try again.", detail: trimmed };
  }
  if (/^HTTP \d{3}$/.test(trimmed) || /^\d{3}$/.test(trimmed)) {
    return { sentence: "That didn't go through. Try again.", detail: trimmed };
  }
  // An error state holds at most 140 characters; the whole text stays behind "Details".
  if (trimmed.length > 140) return { sentence: `${trimmed.slice(0, 120).trimEnd()}…`, detail: trimmed };
  return { sentence: trimmed, detail: null };
}
