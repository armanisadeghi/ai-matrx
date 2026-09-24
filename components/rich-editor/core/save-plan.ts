// components/rich-editor/core/save-plan.ts
//
// THE SAVE GATE — every view (visual, source, an AI action, dictation) ends
// here. It turns "the stored text" + "the text now" into a splice and refuses
// what the owner forbade:
//
//   1. Regions. Stored blocks that are byte-identical in the new text (in
//      order) are anchors; everything between two anchors that differs is ONE
//      block-aligned edit. Unchanged blocks are never part of an edit.
//   2. Island accounting, per region. Every island (block and inline: kinds,
//      XML, fences, math, {{variables}}, citations, tags, anchors) the stored
//      region held must come back byte-identical — unless the person changed
//      it on purpose. Removed and changed islands are listed so the screen can
//      ask; an island whose bytes are still there but that is no longer an
//      island (an unclosed fence or tag swallowed it) is listed separately.
//      This is also the editor's half of the island-edit contract: content-ir
//      is moving to refuse any splice that touches an island, with island
//      changes going through an explicit island-replace call — so an island
//      change is classified HERE, never left for spliceSave to accept.
//   3. The splice itself (`@ai-matrx/content-ir/source` spliceSave, integrity
//      required): every island outside the edits must survive at its mapped
//      position; the change set carries anchors through the save.
//
// The result's `text` is always exactly `current` — the plan never rewrites
// what the person wrote; it only decides whether it may be stored.

import {
  listIslands,
  spliceSave,
  tokenizeSource,
  SourceSpliceError,
  type SourceBlock,
  type SourceChange,
  type SourceEdit,
  type SourceIsland,
  type SpliceIntegrity,
} from "@ai-matrx/content-ir/source";

export interface SaveRegion {
  /** Range in the stored text (block-aligned). */
  readonly start: number;
  readonly end: number;
  /** The replacement from the new text. */
  readonly text: string;
}

export type IslandDeltaKind = "removed" | "changed" | "swallowed" | "added";

export interface IslandDelta {
  readonly kind: IslandDeltaKind;
  readonly islandType: string;
  /** The stored bytes (absent for "added"). */
  readonly before: string | null;
  /** The new bytes (absent for "removed"/"swallowed"). */
  readonly after: string | null;
  /** Offset of the stored island (or of the region, for "added"). */
  readonly at: number;
}

export interface SavePlan {
  readonly stored: string;
  readonly text: string;
  readonly changed: boolean;
  readonly regions: readonly SaveRegion[];
  /** Island changes in edited regions (see header). */
  readonly islandDeltas: readonly IslandDelta[];
  /** Removed / changed / swallowed islands the person did not approve. */
  readonly needsConsent: readonly IslandDelta[];
  readonly changes: readonly SourceChange[];
  readonly integrity: SpliceIntegrity | null;
  /** A refusal nobody can consent past (a broken invariant or disturbed island). */
  readonly error: string | null;
}

export interface PlanSaveOptions {
  /**
   * Stored island bytes the person explicitly edited or removed through an
   * island's own editor — those changes need no second question.
   */
  readonly approvedIslands?: ReadonlySet<string>;
}

const MAX_LCS_CELLS = 4_000_000;

function blockKey(block: SourceBlock): string {
  return `${block.kind}\u0000${block.islandType ?? ""}\u0000${block.raw}`;
}

/** Longest common subsequence of two key lists → matched index pairs. */
function matchBlocks(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    pairs.push([lo, lo]);
    lo += 1;
  }
  let hiA = a.length - 1;
  let hiB = b.length - 1;
  const tail: Array<[number, number]> = [];
  while (hiA >= lo && hiB >= lo && a[hiA] === b[hiB]) {
    tail.push([hiA, hiB]);
    hiA -= 1;
    hiB -= 1;
  }
  const n = hiA - lo + 1;
  const m = hiB - lo + 1;
  if (n > 0 && m > 0 && n * m <= MAX_LCS_CELLS) {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          a[lo + i] === b[lo + j]
            ? (table[(i + 1) * width + j + 1] ?? 0) + 1
            : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[lo + i] === b[lo + j]) {
        pairs.push([lo + i, lo + j]);
        i += 1;
        j += 1;
      } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
        i += 1;
      } else {
        j += 1;
      }
    }
  }
  return pairs.concat(tail.reverse());
}

function islandKey(island: SourceIsland): string {
  return `${island.islandType}\u0000${island.raw}`;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

function regionIslandDeltas(
  before: readonly SourceIsland[],
  after: readonly SourceIsland[],
  afterText: string,
  regionStart: number,
): IslandDelta[] {
  const remaining = new Map<string, SourceIsland[]>();
  for (const island of after) {
    const key = islandKey(island);
    const list = remaining.get(key);
    if (list) list.push(island);
    else remaining.set(key, [island]);
  }
  const gone: SourceIsland[] = [];
  for (const island of before) {
    const list = remaining.get(islandKey(island));
    if (list && list.length) list.shift();
    else gone.push(island);
  }
  const added = [...remaining.values()].flat().sort((x, y) => x.start - y.start);

  const deltas: IslandDelta[] = [];
  const afterCounts = new Map<string, number>();
  for (const island of after) {
    afterCounts.set(islandKey(island), (afterCounts.get(islandKey(island)) ?? 0) + 1);
  }
  const swallowedBudget = new Map<string, number>();
  for (const island of gone) {
    const key = islandKey(island);
    if (!swallowedBudget.has(key)) {
      const asText = countOccurrences(afterText, island.raw);
      swallowedBudget.set(key, Math.max(0, asText - (afterCounts.get(key) ?? 0)));
    }
    const budget = swallowedBudget.get(key) ?? 0;
    if (budget > 0) {
      swallowedBudget.set(key, budget - 1);
      deltas.push({
        kind: "swallowed",
        islandType: island.islandType,
        before: island.raw,
        after: null,
        at: island.start,
      });
      continue;
    }
    const replacement = added.findIndex((candidate) => candidate.islandType === island.islandType);
    if (replacement !== -1) {
      const [next] = added.splice(replacement, 1);
      deltas.push({
        kind: "changed",
        islandType: island.islandType,
        before: island.raw,
        after: next?.raw ?? null,
        at: island.start,
      });
    } else {
      deltas.push({
        kind: "removed",
        islandType: island.islandType,
        before: island.raw,
        after: null,
        at: island.start,
      });
    }
  }
  for (const island of added) {
    deltas.push({
      kind: "added",
      islandType: island.islandType,
      before: null,
      after: island.raw,
      at: regionStart,
    });
  }
  return deltas;
}

/**
 * Apply the regions to the stored text. THE ONE CALL INTO THE PACKAGE'S
 * SPLICE: when content-ir ships its explicit island-replace API, regions whose
 * deltas carry an approved island change route through it here.
 */
function applyRegions(
  stored: string,
  blocks: readonly SourceBlock[],
  regions: readonly SaveRegion[],
): { text: string; changes: readonly SourceChange[]; integrity: SpliceIntegrity } {
  const edits: SourceEdit[] = regions.map((region) => ({
    start: region.start,
    end: region.end,
    text: region.text,
  }));
  const result = spliceSave(stored, edits, { blocks, requireIntegrity: true });
  return { text: result.text, changes: result.changes, integrity: result.integrity };
}

export function planSave(
  stored: string,
  current: string,
  options: PlanSaveOptions = {},
): SavePlan {
  const unchanged: SavePlan = {
    stored,
    text: stored,
    changed: false,
    regions: [],
    islandDeltas: [],
    needsConsent: [],
    changes: [],
    integrity: { ok: true, bytesOutsideEditsIdentical: true, disturbed: [] },
    error: null,
  };
  if (stored === current) return unchanged;

  const storedBlocks = tokenizeSource(stored);
  const currentBlocks = tokenizeSource(current);
  const a = storedBlocks.filter((block) => block.kind !== "gap");
  const b = currentBlocks.filter((block) => block.kind !== "gap");
  const anchors = matchBlocks(a.map(blockKey), b.map(blockKey));

  const storedIslands = listIslands(storedBlocks);
  const currentIslands = listIslands(currentBlocks);
  const within = (islands: readonly SourceIsland[], start: number, end: number) =>
    islands.filter((island) => island.start >= start && island.end <= end);

  const regions: SaveRegion[] = [];
  const deltas: IslandDelta[] = [];
  const bounds: Array<[number, number, number, number]> = [];
  let prevStored = 0;
  let prevCurrent = 0;
  for (const [ai, bi] of anchors) {
    const sa = a[ai];
    const sb = b[bi];
    if (!sa || !sb) continue;
    bounds.push([prevStored, sa.start, prevCurrent, sb.start]);
    prevStored = sa.end;
    prevCurrent = sb.end;
  }
  bounds.push([prevStored, stored.length, prevCurrent, current.length]);

  for (const [sStart, sEnd, cStart, cEnd] of bounds) {
    const before = stored.slice(sStart, sEnd);
    const after = current.slice(cStart, cEnd);
    if (before === after) continue;
    regions.push({ start: sStart, end: sEnd, text: after });
    deltas.push(
      ...regionIslandDeltas(
        within(storedIslands, sStart, sEnd),
        within(currentIslands, cStart, cEnd),
        after,
        sStart,
      ),
    );
  }

  const approved = options.approvedIslands ?? new Set<string>();
  const needsConsent = deltas.filter(
    (delta) =>
      delta.kind !== "added" &&
      !(delta.kind !== "swallowed" && delta.before !== null && approved.has(delta.before)),
  );

  let error: string | null = null;
  let changes: readonly SourceChange[] = [];
  let integrity: SpliceIntegrity | null = null;
  try {
    const applied = applyRegions(stored, storedBlocks, regions);
    changes = applied.changes;
    integrity = applied.integrity;
    if (applied.text !== current) {
      error =
        "The save could not be proven: splicing the edited blocks into the stored text did not reproduce what is on screen. Nothing was saved.";
    }
  } catch (caught) {
    error =
      caught instanceof SourceSpliceError && caught.code === "integrity"
        ? "This edit would change protected content outside the part you edited (for example, an unclosed code block or tag swallowing what follows). Close it or undo, then save."
        : `The save could not be proven (${caught instanceof Error ? caught.message : String(caught)}). Nothing was saved.`;
  }

  return {
    stored,
    text: current,
    changed: true,
    regions,
    islandDeltas: deltas,
    needsConsent,
    changes,
    integrity,
    error,
  };
}
