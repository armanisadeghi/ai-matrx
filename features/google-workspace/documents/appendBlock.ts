/**
 * Docs Plane A — the exact block, composed on the client, ONCE.
 *
 * 🚨 WHAT THE PERSON SEES IS THE BYTES WE SEND. Our champion edge (PLAN §1, Docs
 * row) is "nobody shows the append before it lands": *"This exact block will be
 * appended to Q3 Plan, at the end, under a dated heading — Append / Edit /
 * Cancel."* That promise is only true if the preview and the request carry the
 * SAME string, so this function is the one composer and the composer's output is
 * what `appendGoogleDocument` is handed — verbatim, never re-stamped, never
 * re-headed anywhere else.
 *
 * WHY THE HEADING IS COMPOSED HERE AND NOT ON THE SERVER. The client write route
 * `POST /google-workspace/documents/append` takes `text` and appends exactly that
 * (aidream `AppendDocumentRequest`); it has no `dry_run` and no heading option —
 * only the AGENT path has a dry run (`document_append_dry_run`). Composing the
 * heading on the client therefore makes the preview EXACT rather than a guess at
 * what a server would add. If a heading option is ever added server-side, this
 * module is the thing that gets deleted, not duplicated.
 */

/** `google.docs.append_heading` (PLAN §7): default `dated`, org- and user-overridable. */
export type AppendHeadingMode = "dated" | "none";

export const DEFAULT_APPEND_HEADING_MODE: AppendHeadingMode = "dated";

export function isAppendHeadingMode(value: unknown): value is AppendHeadingMode {
  return value === "dated" || value === "none";
}

/**
 * The dated heading's text. A date a person reads, never an ISO stamp, and it
 * names US so a reader of the Doc in a year knows what put it there.
 */
export function datedHeading(now: Date): string {
  const when = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Added from AI Matrx — ${when}`;
}

/**
 * The exact block. A Google Doc append is plain text, so the block is plain
 * text: heading line, blank line, the body, and a trailing newline so the next
 * append does not run onto this one's last word.
 *
 * Returns `null` when there is nothing to append — an empty composer has no
 * block, and the caller offers no Append control rather than a button that would
 * write a bare heading over a person's document.
 */
export function composeAppendBlock(args: {
  text: string;
  heading: AppendHeadingMode;
  now: Date;
}): string | null {
  const body = args.text.replace(/\s+$/u, "");
  if (!body.trim()) return null;
  if (args.heading === "none") return `${body}\n`;
  return `${datedHeading(args.now)}\n\n${body}\n`;
}

/** The sentence above the preview. Names the document and where the block lands. */
export function appendPromiseSentence(args: {
  title: string;
  heading: AppendHeadingMode;
}): string {
  const headingClause =
    args.heading === "dated" ? ", under a dated heading" : ", with no heading added";
  return `This exact block will be added to the end of “${args.title}” in Google${headingClause}.`;
}
