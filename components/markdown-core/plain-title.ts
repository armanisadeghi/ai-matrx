// ─────────────────────────────────────────────────────────────────────────
// THE ONE plain-text title projection of markdown.
//
// Anything that names a record from its content — a pasted note's title, the
// flashcard set / quiz / memory aid made from it, a task seeded from a message,
// a note's auto-label, an observation note's label, a list-row preview — goes
// through here, so a title never carries markdown syntax. The 2026-09-25
// RC-B2 re-verification found set, quiz and memory-aid titles reading
// "# AP Chemistry Nomenclature…" because the paste path took the note's raw
// first line; three other call sites each stripped a different subset of
// syntax by hand.
//
// The projection: the first non-empty line outside YAML front matter and code
// fences (a heading when the content opens with one), with block markers
// (`#`, `>`, list bullets, task boxes, numbering), emphasis, inline code
// ticks, links/images (their text), autolinks, HTML tags and trailing heading
// hashes removed, whitespace collapsed. Math and `{{variables}}` are kept as
// written. It is idempotent: a clean title comes back unchanged.
//
// Also used at DISPLAY time for titles already stored with syntax — stored
// rows are not rewritten.
// ─────────────────────────────────────────────────────────────────────────

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** The first line of content that can name it (front matter / fences skipped). */
function firstContentLine(source: string): string {
  const lines = source.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, k) => k > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) i = end + 1;
  }
  let fence: string | null = null;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    // Setext underline / thematic break lines name nothing.
    if (/^\s*([-=*_])(\s*\1){2,}\s*$/.test(line)) continue;
    if (line.trim()) return line;
  }
  return "";
}

/** Strip markdown syntax from ONE line, keeping its readable text. */
export function plainTextOfMarkdownLine(line: string): string {
  let text = line
    // Block markers: heading, quote, list bullet / number, task box.
    .replace(/^\s{0,3}#{1,6}(\s+|$)/, "")
    .replace(/^\s*(>\s?)+/, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/, "")
    .replace(/^\s*\[[ xX]\]\s+/, "")
    // Closing heading hashes.
    .replace(/\s+#+\s*$/, "");
  text = text
    // Images, then links → their text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    // Autolinks and HTML tags.
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/<\/?[A-Za-z][\w:-]*(\s[^<>]*)?\/?>/g, "")
    // Inline code keeps its text.
    .replace(/(`+)([\s\S]*?)\1/g, "$2")
    // Emphasis / strike (asterisk forms anywhere, underscore forms only at
    // word boundaries so snake_case survives).
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\*(?=\S)([^*]*?\S)\*/g, "$1")
    .replace(/(^|\W)_(?=\S)([^_]*?\S)_(?=\W|$)/g, "$1$2")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    // Escaped punctuation (never `\(` `\)` `\[` `\]` — those are math).
    .replace(/\\([\\`*_{}#+\-.!>~|])/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}

export interface PlainTitleOptions {
  /** Longest title; longer titles are cut at a word boundary with "…". */
  maxLength?: number;
}

/**
 * The plain-text title of markdown content: its first heading or line with
 * the syntax removed. Returns "" when the content has no nameable line.
 */
export function plainTitleFromMarkdown(
  source: string | null | undefined,
  { maxLength }: PlainTitleOptions = {},
): string {
  const title = plainTextOfMarkdownLine(firstContentLine(source ?? ""));
  if (!maxLength || title.length <= maxLength) return title;
  const cut = title.slice(0, maxLength - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Display form of a STORED title that may still carry syntax (rows written
 * before the projection existed). Clean titles come back unchanged; a title
 * that projects to nothing keeps its original text rather than going blank.
 */
export function displayTitle(title: string | null | undefined): string {
  const raw = title ?? "";
  return plainTitleFromMarkdown(raw) || raw.trim();
}

/**
 * A read-boundary copy of `row` whose `key` title is in display form.
 * Services that return rows whose title may have been derived from markdown
 * (flashcard sets, assessments, study media) pass them through this, so every
 * list, header, picker and export shows the clean name. Storage is untouched;
 * a person who edits and saves the name saves what they see.
 */
export function withDisplayTitle<T, K extends keyof T>(row: T, key: K): T {
  const value = row[key];
  if (typeof value !== "string") return row;
  const clean = displayTitle(value);
  return clean === value ? row : { ...row, [key]: clean };
}
