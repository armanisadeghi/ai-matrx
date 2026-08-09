/**
 * Portion-heading de-duplication — one title, not two.
 *
 * THE FAILURE CLASS
 * -----------------
 * Extractors that split a document into portions (a pptx slide, a pdf page, an
 * xlsx sheet) put a heading at the top of each portion's markdown, because the
 * portions are also JOINED into the whole-document markdown that AI consumers
 * and ingest read — without it, a 40-slide deck flattens into one unlabelled
 * wall of bullets. That heading is CORRECT at the codec layer and must stay.
 *
 * A UI that renders portions individually already draws its own divider from
 * the structured `number` / `title` fields, so the portion's own heading is
 * shown a second time immediately below it — "SLIDE 1  Kickoff" followed by
 * "Slide 1: Kickoff". Observed in production on the pptx previewer, 2026-08-08.
 *
 * WHAT THIS DOES
 * --------------
 * Strips the leading ATX heading from ONE portion's markdown, but only when
 * that heading says nothing the caller's own chrome isn't already showing —
 * i.e. it matches the portion's label/number/title. A heading carrying real
 * content ("## Introduction" on a slide titled "Kickoff") is left alone, so a
 * codec that stops emitting the heading, changes its wording, or hoists real
 * text into it degrades to "unchanged", never to lost content.
 *
 * Purely textual and side-effect free: pass the RAW portion markdown, render
 * the result. Deliberately NOT a "clean up markdown" catch-all — it removes at
 * most one leading heading and nothing else.
 */

export interface PortionIdentity {
  /** Portion-kind word the caller's own chrome shows — "Slide", "Page", "Sheet". */
  label?: string | null;
  /** 1-based portion number shown beside the label. */
  number?: number | string | null;
  /** Portion title shown by the caller's own chrome. */
  title?: string | null;
}

const ATX_HEADING = /^#{1,6}\s+(.*)$/;

/**
 * Compare headings the way a reader does: case doesn't count, and every run of
 * whitespace or separator punctuation collapses to one space — so `Slide 1:
 * Kickoff`, `slide 1 - kickoff`, and `Slide 1. Kickoff` are the same heading,
 * and the caller needs no separator guesswork.
 */
const normalize = (value: string): string =>
  value
    .replace(/[\s:.\-–—]+/gu, " ")
    .trim()
    .toLowerCase();

/** Every phrasing of the portion's identity that a codec plausibly emits. */
function identityForms(identity: PortionIdentity): Set<string> {
  const forms = new Set<string>();
  const label = (identity.label ?? "").trim();
  const number =
    identity.number === null || identity.number === undefined
      ? ""
      : String(identity.number).trim();
  const title = (identity.title ?? "").trim();

  const add = (value: string) => {
    const key = normalize(value);
    if (key) forms.add(key);
  };

  if (title) add(title);
  // `## Slide 3` / `## Slide 3: Kickoff` (pptx) and `## Sheet: Q3` (xlsx) are
  // what our Office codec emits; the rest are the same identity said differently.
  if (label && number) add(`${label} ${number}`);
  if (label && number && title) add(`${label} ${number} ${title}`);
  if (label && title) add(`${label} ${title}`);
  if (number && title) add(`${number} ${title}`);

  return forms;
}

/**
 * Remove a portion's leading markdown heading when it duplicates the identity
 * the caller is already rendering. Returns the markdown unchanged whenever the
 * first heading carries anything else — or when there is no leading heading.
 *
 * @param markdown Raw portion markdown (pre delimiter-guard, pre render).
 * @param identity What the caller's own divider/chrome already shows.
 */
export function stripDuplicatePortionHeading(
  markdown: string | null | undefined,
  identity: PortionIdentity,
): string {
  const source = markdown ?? "";
  if (!source.trim()) return source;

  const forms = identityForms(identity);
  if (forms.size === 0) return source;

  const lines = source.split("\n");
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  if (start >= lines.length) return source;

  const heading = ATX_HEADING.exec(lines[start].trim());
  if (!heading) return source;
  if (!forms.has(normalize(heading[1]))) return source;

  let body = start + 1;
  while (body < lines.length && lines[body].trim() === "") body += 1;
  return lines.slice(body).join("\n");
}
