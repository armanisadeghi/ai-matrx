// features/masterwork/intake/duplicateStartNotice.ts
//
// THE DUPLICATE-NAME START NOTICE, HELD TO ITS SLOT (cold walk 23 leftover,
// review follow-up 2026-09-30).
//
// A duplicate start is the ordinary start plus one fact, so the notice is
// "<duplicate sentence> <the Approach's start line>". The start line is live
// registry text (`platform.approach.cost_time_shape`); the longest today is
// 103 characters, which leaves the full duplicate sentence exactly 140 — no
// headroom. A longer row must not overflow the toast description slot (140,
// two sentences), so the notice degrades in order: the full sentence, then
// the short one, then the short one with the start line cut at a word.

/** Toast/dialog description budget (interface-text). */
export const NOTICE_SLOT_CHARS = 140;

const FULL = "You already have one with this name.";
const SHORT = "Same name as one you have.";

function cutAtWord(text: string, room: number): string {
  if (text.length <= room) return text;
  if (room <= 1) return "";
  const cut = text.slice(0, room - 1).trimEnd();
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, "")}…`;
}

export function duplicateStartNotice(startLine: string): string {
  const line = startLine.trim();
  if (!line) return FULL;
  for (const sentence of [FULL, SHORT]) {
    const notice = `${sentence} ${line}`;
    if (notice.length <= NOTICE_SLOT_CHARS) return notice;
  }
  return `${SHORT} ${cutAtWord(line, NOTICE_SLOT_CHARS - SHORT.length - 1)}`;
}
