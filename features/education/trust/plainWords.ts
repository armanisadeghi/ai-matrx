// features/education/trust/plainWords.ts
//
// What a citation SAYS to a person. The agents and the resolver speak in
// machine ids ("chunk 199f610f-c4d4-…", locator "22"); a non-technical expert
// reading a card should see "Big Idea 1: Evolution" and "Page 22" (verify-1,
// 2026-09-28). Every trust surface renders through these two helpers — never
// the raw strings.

/** "chunk <id>" in any shape an agent writes it: uuid, uuid:2, 1_3, c4. */
const CHUNK_REF_RE =
  /[,;]?\s*\(?\bchunks?\s+(?:id\s+)?[#]?[0-9a-z]*[0-9][0-9a-z_:-]*\)?/gi;
/** A bare uuid (or uuid:part) anywhere in the text. */
const UUID_RE =
  /[,;]?\s*\(?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?::\d+)?\b\)?/gi;

function tidy(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
    .trim();
}

/**
 * "Grounded in …" text without machine ids. Returns undefined when nothing
 * human is left (the caller then says "your material" or nothing).
 */
export function plainGroundedIn(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const out = tidy(text.replace(CHUNK_REF_RE, "").replace(UUID_RE, ""));
  return out.length > 0 ? out : undefined;
}

/**
 * Where inside a source a citation points, in words: "22" → "Page 22",
 * "p. 22–24" → "Pages 22–24", "chunk <id> (page 4)" → "Page 4". Undefined when
 * the locator is only a machine id.
 */
export function plainLocator(locator: string | null | undefined): string | undefined {
  if (!locator) return undefined;
  const raw = locator.trim();
  const page = /^(?:p(?:age|g)?\.?\s*)?(\d+)$/i.exec(raw);
  if (page) return `Page ${page[1]}`;
  const range = /^(?:p(?:ages?|p|g)?\.?\s*)?(\d+)\s*[-–]\s*(\d+)$/i.exec(raw);
  if (range) return `Pages ${range[1]}–${range[2]}`;
  const inner = /\(page (\d+)\)/i.exec(raw);
  const cleaned = plainGroundedIn(raw.replace(/\(page \d+\)/i, ""));
  if (inner) return cleaned ? `${cleaned}, page ${inner[1]}` : `Page ${inner[1]}`;
  return cleaned;
}

/** The open action's words: a real web page, or the person's own material. */
export function openSourceLabel(url: string | null | undefined): string {
  return url && /^https?:\/\//i.test(url) ? "Open the web page" : "Open the source";
}
