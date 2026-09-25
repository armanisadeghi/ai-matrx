// ─────────────────────────────────────────────────────────────────────────
// Is this offset inside a CommonMark inline code span?
//
// A tag MENTIONED in inline code (`<artifact>`, `Decision: <decision> — …`)
// is prose, never a block opener — the source tokenizer
// (@ai-matrx/content-ir/source) reads it that way and both renderer splitters
// must agree (RC-B3r, verify-RC-B3.md). A span opens on a run of N backticks
// and closes on the next run of exactly N; an unmatched run is literal text;
// a backslash-escaped backtick never opens a span.
// ─────────────────────────────────────────────────────────────────────────

export function isInsideInlineCode(line: string, at: number): boolean {
  let i = 0;
  while (i <= at && i < line.length) {
    if (line[i] === "\\") {
      i += 2;
      continue;
    }
    if (line[i] !== "`") {
      i += 1;
      continue;
    }
    let run = 0;
    while (line[i + run] === "`") run += 1;
    let close = -1;
    for (let j = i + run; j < line.length; ) {
      if (line[j] !== "`") {
        j += 1;
        continue;
      }
      let r = 0;
      while (line[j + r] === "`") r += 1;
      if (r === run) {
        close = j;
        break;
      }
      j += r;
    }
    if (close === -1) {
      i += run;
      continue;
    }
    if (at > i && at < close + run) return true;
    i = close + run;
  }
  return false;
}

/** Index of the first `needle` in `line` at or after `from` that is not inside inline code. */
export function indexOutsideInlineCode(line: string, needle: string, from = 0): number {
  for (let idx = line.indexOf(needle, from); idx !== -1; idx = line.indexOf(needle, idx + 1)) {
    if (!isInsideInlineCode(line, idx)) return idx;
  }
  return -1;
}
