/**
 * The canonical stored/wire form of a materialized artifact (vision R1):
 *
 *   <artifact type="X" id="<uuid>" version="N">…original body verbatim…</artifact>
 *
 * This ONE form is simultaneously: what the UI recognizes (a UUID id →
 * render-by-id), what the model reads natively (plain text in the message), and
 * the durable archive. Producing it is what makes the model-facing side work
 * with zero server changes — aidream already passes text through to the model.
 *
 * Caveat (R1): a body that literally contains `</artifact>` (e.g. code about
 * artifacts) closes the tag early. This is the same risk the raw `<artifact>`
 * wire format already carries; length-delimiting is a future hardening.
 */

/** Titles travel in the attribute; collapse quotes so the tag never breaks. */
function sanitizeTitle(title?: string): string {
  return (title ?? "").replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build the canonical id-bearing artifact tag. `body` is the type's payload
 * verbatim (markdown checklist, mermaid source, JSON object, …) — opaque to the
 * wrapper; the type's renderer parses it. Placed on its own lines so the closing
 * tag is unambiguous for the splitter.
 */
export function wrapArtifactText(args: {
  canvasType: string;
  id: string;
  version?: number;
  title?: string;
  body: string;
}): string {
  const { canvasType, id, version, title, body } = args;
  const attrs = [`type="${canvasType}"`, `id="${id}"`, `version="${version ?? 1}"`];
  const t = sanitizeTitle(title);
  if (t) attrs.push(`title="${t}"`);
  return `<artifact ${attrs.join(" ")}>\n${body}\n</artifact>`;
}
