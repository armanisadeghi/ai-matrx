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
  if (!trimmed) return { sentence: "Something went wrong, and it did not say what.", detail: null };
  if (HTML.test(trimmed)) {
    return { sentence: "The server answered with an error page instead of data. Try again in a moment.", detail: trimmed };
  }
  if (TRANSPORT.test(trimmed)) {
    return { sentence: "We couldn't reach the server. Check your connection and try again.", detail: trimmed };
  }
  if (/^HTTP \d{3}$/.test(trimmed) || /^\d{3}$/.test(trimmed)) {
    return { sentence: "The server refused the request without saying why. Try again.", detail: trimmed };
  }
  if (trimmed.length > 400) return { sentence: `${trimmed.slice(0, 280)}…`, detail: trimmed };
  return { sentence: trimmed, detail: null };
}
