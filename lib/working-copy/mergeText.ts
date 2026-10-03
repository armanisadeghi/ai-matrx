/**
 * lib/working-copy/mergeText.ts — a line-based three-way merge for the
 * working-copy conflict choice "Merge".
 *
 * `mergeText(ancestor, mine, theirs)` returns the text holding BOTH edits when
 * they touch different lines (or make the same change), and null when they
 * change the same lines differently — then only "Keep mine" / "Take theirs"
 * are offered. Never guesses: an overlapping change is never merged.
 */

interface Hunk {
  /** Ancestor lines [start, end) are replaced by `lines`. */
  start: number;
  end: number;
  lines: string[];
}

/** Above this many LCS cells the merge is not attempted (null: choose a side). */
const MAX_CELLS = 2_000_000;

function diffHunks(a: string[], b: string[]): Hunk[] | null {
  // Common prefix / suffix shrink the table to the changed middle.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  ) {
    suf += 1;
  }
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const n = am.length;
  const m = bm.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  // lcs[i][j] = LCS length of am[i..] and bm[j..].
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        am[i] === bm[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: Hunk | null = null;
  const close = () => {
    if (open) hunks.push(open);
    open = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && am[i] === bm[j]) {
      close();
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])) {
      open ??= { start: pre + i, end: pre + i, lines: [] };
      open.lines.push(bm[j]);
      j += 1;
    } else {
      open ??= { start: pre + i, end: pre + i, lines: [] };
      i += 1;
      open.end = pre + i;
    }
  }
  close();
  return hunks;
}

function sideText(ancestor: string[], hunks: Hunk[], start: number, end: number): string[] {
  const out: string[] = [];
  let at = start;
  for (const hunk of hunks) {
    out.push(...ancestor.slice(at, hunk.start), ...hunk.lines);
    at = hunk.end;
  }
  out.push(...ancestor.slice(at, end));
  return out;
}

const overlaps = (x: Hunk, y: Hunk) =>
  x.start === y.start || (x.start < y.end && y.start < x.end);

export function mergeText(ancestor: string, mine: string, theirs: string): string | null {
  if (mine === theirs) return mine;
  if (ancestor === mine) return theirs;
  if (ancestor === theirs) return mine;
  const base = ancestor.split("\n");
  const ours = diffHunks(base, mine.split("\n"));
  const other = diffHunks(base, theirs.split("\n"));
  if (!ours || !other) return null;
  const out: string[] = [];
  let at = 0;
  let a = 0;
  let b = 0;
  while (a < ours.length || b < other.length) {
    // The next group: the earliest hunk plus every hunk (either side) that
    // overlaps the group as it grows.
    const first =
      b >= other.length || (a < ours.length && ours[a].start <= other[b].start) ? ours[a] : other[b];
    let start = first.start;
    let end = first.end;
    const mineGroup: Hunk[] = [];
    const theirGroup: Hunk[] = [];
    let grew = true;
    while (grew) {
      grew = false;
      const probe: Hunk = { start, end, lines: [] };
      if (a < ours.length && (ours[a] === first || overlaps(ours[a], probe))) {
        mineGroup.push(ours[a]);
        start = Math.min(start, ours[a].start);
        end = Math.max(end, ours[a].end);
        a += 1;
        grew = true;
      }
      if (b < other.length && (other[b] === first || overlaps(other[b], { start, end, lines: [] }))) {
        theirGroup.push(other[b]);
        start = Math.min(start, other[b].start);
        end = Math.max(end, other[b].end);
        b += 1;
        grew = true;
      }
    }
    out.push(...base.slice(at, start));
    if (mineGroup.length > 0 && theirGroup.length > 0) {
      const m = sideText(base, mineGroup, start, end);
      const t = sideText(base, theirGroup, start, end);
      if (m.join("\n") !== t.join("\n")) return null; // both changed these lines, differently
      out.push(...m);
    } else {
      out.push(...sideText(base, mineGroup.length > 0 ? mineGroup : theirGroup, start, end));
    }
    at = end;
  }
  out.push(...base.slice(at));
  return out.join("\n");
}
