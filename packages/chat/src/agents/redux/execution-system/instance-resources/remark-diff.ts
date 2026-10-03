// packages/chat/src/agents/redux/execution-system/instance-resources/remark-diff.ts
//
// The ONE diff an `edit` remark carries (chip drawer + the wire's `diff`): a
// compact unified diff of the answer text from the last send to now, computed
// by the platform diff engine (@ai-matrx/diff). Changed lines are `- ` / `+ `,
// one line of context around each hunk is `  `, and a gap between hunks is `…`.

import { computeLineChanges } from "@ai-matrx/diff/text";

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
