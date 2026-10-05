// packages/chat/src/agents/redux/execution-system/instance-resources/remark-diff.ts
//
// The ONE diff an `edit` remark carries (chip drawer + the wire's `diff`): a
// compact unified diff of the answer text from the last send to now, computed
// by the platform diff engine (@ai-matrx/diff). Changed lines are `- ` / `+ `,
// one line of context around each hunk is `  `, and a gap between hunks is `…`.

import { computeLineChanges, computeTextDiff } from "@ai-matrx/diff/text";

const CONTEXT_LINES = 1;

/** Unified diff `before → after`, or "" when nothing changed. */
export function remarkDiff(before: string, after: string): string {
  if (before === after) return "";
  const { lines } = computeLineChanges(before, after);
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.type === "unchanged") return;
    for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(lines.length - 1, i + CONTEXT_LINES); j++) {
      keep[j] = true;
    }
  });
  const out: string[] = [];
  let skipped = false;
  lines.forEach((line, i) => {
    if (!keep[i]) {
      skipped = true;
      return;
    }
    if (skipped && out.length) out.push("…");
    skipped = false;
    const mark = line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  ";
    out.push(`${mark}${line.content}`);
  });
  return out.join("\n");
}

/**
 * The words that changed, as one short phrase for a chip title: `+ added words`,
 * `- removed words`, or `- old → + new`. Word-level (the platform engine's
 * intra-line segments), so appending a sentence to a one-paragraph answer names
 * that sentence — never the paragraph's opening. "" when nothing changed.
 */
export function remarkChangeSummary(before: string, after: string): string {
  if (before === after) return "";
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of computeTextDiff(before, after).inline) {
    if (line.type === "unchanged") continue;
    const target = line.type === "added" ? added : removed;
    if (line.segments && line.segments.length > 0) {
      let run = "";
      for (const seg of line.segments) {
        if (seg.type === line.type) run += seg.value;
        else if (seg.type === "unchanged" && seg.value.trim() === "" && run.trim()) {
          // Whitespace between two changed words keeps one run: "a b c" → "x y z".
          run += seg.value;
        } else {
          if (run.trim()) target.push(run.trim());
          run = "";
        }
      }
      if (run.trim()) target.push(run.trim());
    } else if (line.content.trim()) {
      target.push(line.content.trim());
    }
  }
  const add = added[0];
  const rem = removed[0];
  if (add && rem) return `- ${rem} → + ${add}`;
  if (add) return `+ ${add}`;
  if (rem) return `- ${rem}`;
  return "";
}
