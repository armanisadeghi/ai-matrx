// noteOutline — pure markdown heading parser for the floating outline panel.
//
// One O(lines) scan. Fenced code blocks (``` / ~~~) are skipped so a `# comment`
// inside a shell snippet never pollutes the outline. `headingIndex` is the
// ordinal among ALL parsed headings — the preview jump uses it to pick the
// matching h1–h6 element in the rendered DOM (rendered headings and parsed
// headings come from the same source in the same order).

export interface NoteOutlineItem {
  /** Heading level, 1–6. */
  level: number;
  /** Display text with basic inline markdown stripped. */
  text: string;
  /** Character offset of the heading line's first character in the content. */
  charOffset: number;
  /** Ordinal among all headings in the note (0-based). */
  headingIndex: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})/;

/** Strip the inline markdown that commonly decorates a heading. */
function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "") // trailing closing hashes: "## Title ##"
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$1") // strikethrough
    .trim();
}

export function parseNoteOutline(content: string): NoteOutlineItem[] {
  if (!content) return [];
  const items: NoteOutlineItem[] = [];
  let offset = 0;
  let inFence = false;
  let fenceMarker = "";
  let headingIndex = 0;

  for (const line of content.split("\n")) {
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[2][0];
      } else if (fence[2][0] === fenceMarker) {
        inFence = false;
      }
    } else if (!inFence) {
      const m = HEADING_RE.exec(line);
      if (m) {
        const text = cleanHeadingText(m[2]);
        if (text) {
          items.push({
            level: m[1].length,
            text,
            charOffset: offset,
            headingIndex: headingIndex++,
          });
        }
      }
    }
    offset += line.length + 1; // +1 for the split-away newline
  }
  return items;
}
