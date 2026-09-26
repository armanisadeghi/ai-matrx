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
//      This is the editor's half of content-ir's strict splice contract
//      (0.13): an island change is classified HERE and applied only through
//      `islandEdit` (see spliceInSteps), never slipped into a prose edit.
//   3. The splice itself (`@ai-matrx/content-ir/source` spliceSave, integrity
//      required), in two proven steps — islands, then prose. Every island
//      outside the edits must survive at its mapped position; the change sets
//      carry anchors through the save (`mapSavePosition`).
//
// The result's `text` is always exactly `current` — the plan never rewrites
// what the person wrote; it only decides whether it may be stored.

import {
  islandEdit,
  listIslands,
  mapPosition,
  spliceSave,
  tokenizeSource,
  SourceSpliceError,
  type SourceBlock,
  type MapOptions,
  type MappedPosition,
  type SourceChange,
  type SourceIsland,
  type SpliceIntegrity,
} from "@ai-matrx/content-ir/source";
import { findTableEnd, tableStartsAt } from "@/components/mardown-display/markdown-classification/processors/utils/gfm-table-lines";

export interface SaveRegion {
  /** Range in the stored text (block-aligned). */
  readonly start: number;
  readonly end: number;
  /** The replacement from the new text. */
  readonly text: string;
}

export type IslandDeltaKind = "removed" | "changed" | "swallowed" | "moved" | "added";

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
  /**
   * The change sets of the save's splice steps, in order (island step, then
   * prose step). Carry an anchor through with `mapSavePosition`.
   */
  readonly changeSteps: ReadonlyArray<readonly SourceChange[]>;
  readonly integrity: SpliceIntegrity | null;
  /** Why the save could not be proven; the person may still save (validation offers, never blocks). */
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

interface RegionIslands {
  before: readonly SourceIsland[];
  after: readonly SourceIsland[];
  afterText: string;
  regionStart: number;
}

/**
 * Island accounting over every edited region at once, so a block the person
 * MOVED (gone from one region, identical in another) is a move, not a loss.
 */
function islandDeltas(regions: readonly RegionIslands[]): IslandDelta[] {
  const gone: Array<{ island: SourceIsland; region: number }> = [];
  const added: Array<{ island: SourceIsland; region: number }> = [];
  regions.forEach((region, index) => {
    const remaining = new Map<string, SourceIsland[]>();
    for (const island of region.after) {
      const list = remaining.get(islandKey(island));
      if (list) list.push(island);
      else remaining.set(islandKey(island), [island]);
    }
    for (const island of region.before) {
      const list = remaining.get(islandKey(island));
      if (list && list.length) list.shift();
      else gone.push({ island, region: index });
    }
    for (const list of remaining.values()) {
      for (const island of list) added.push({ island, region: index });
    }
  });

  // Moves: the same island left one place and arrived in another. Recorded (the
  // splice lifts it out of its old place with islandEdit) but never a question.
  const deltas: IslandDelta[] = [];
  const unmatchedGone: typeof gone = [];
  for (const entry of gone) {
    const at = added.findIndex((candidate) => islandKey(candidate.island) === islandKey(entry.island));
    if (at === -1) {
      unmatchedGone.push(entry);
      continue;
    }
    const [arrival] = added.splice(at, 1);
    deltas.push({
      kind: "moved",
      islandType: entry.island.islandType,
      before: entry.island.raw,
      after: arrival?.island.raw ?? entry.island.raw,
      at: entry.island.start,
    });
  }

  const swallowedBudget = new Map<string, number>();
  for (const { island, region } of unmatchedGone) {
    const info = regions[region];
    const key = `${region}\u0000${islandKey(island)}`;
    if (!swallowedBudget.has(key) && info) {
      const asIslands = info.after.filter((other) => islandKey(other) === islandKey(island)).length;
      swallowedBudget.set(key, Math.max(0, countOccurrences(info.afterText, island.raw) - asIslands));
    }
    const budget = swallowedBudget.get(key) ?? 0;
    if (budget > 0) {
      swallowedBudget.set(key, budget - 1);
      deltas.push({ kind: "swallowed", islandType: island.islandType, before: island.raw, after: null, at: island.start });
      continue;
    }
    const replacement = added.findIndex(
      (candidate) => candidate.region === region && candidate.island.islandType === island.islandType,
    );
    if (replacement !== -1) {
      const [next] = added.splice(replacement, 1);
      deltas.push({
        kind: "changed",
        islandType: island.islandType,
        before: island.raw,
        after: next?.island.raw ?? null,
        at: island.start,
      });
    } else {
      deltas.push({ kind: "removed", islandType: island.islandType, before: island.raw, after: null, at: island.start });
    }
  }
  for (const { island, region } of added) {
    deltas.push({
      kind: "added",
      islandType: island.islandType,
      before: null,
      after: island.raw,
      at: regions[region]?.regionStart ?? 0,
    });
  }
  return deltas;
}

interface SpliceStep {
  text: string;
  changes: readonly SourceChange[];
  integrity: SpliceIntegrity;
}

/**
 * THE ONE PLACE THE SAVE CALLS THE PACKAGE'S SPLICE, under content-ir's strict
 * contract (0.13): an island changes ONLY through `islandEdit`, and a prose
 * edit must carry every island in its range back byte-identical. So a save is
 * two proven steps over the stored text:
 *   1. island step — every island that was changed, removed, swallowed or moved
 *      AWAY is rewritten in place with `islandEdit` (its new bytes, or nothing);
 *   2. prose step — block-aligned edits from that text to what is on screen,
 *      which by now only ADD islands, never change one.
 * Integrity is required on both (the package default).
 */
function spliceInSteps(stored: string, current: string, deltas: readonly IslandDelta[]): SpliceStep[] {
  const steps: SpliceStep[] = [];
  const islandEdits = deltas
    .filter((delta) => delta.kind !== "added" && delta.before !== null)
    .map((delta) =>
      islandEdit(
        { start: delta.at, end: delta.at + (delta.before ?? "").length },
        delta.kind === "changed" ? (delta.after ?? "") : "",
      ),
    )
    .sort((x, y) => x.start - y.start);
  let text = stored;
  if (islandEdits.length) {
    const result = spliceSave(stored, islandEdits);
    steps.push({ text: result.text, changes: result.changes, integrity: result.integrity });
    text = result.text;
  }
  if (text !== current) {
    const plan = regionsBetween(text, current);
    const result = spliceSave(
      text,
      plan.regions.map((region) => ({ start: region.start, end: region.end, text: region.text })),
      { blocks: plan.storedBlocks },
    );
    steps.push({ text: result.text, changes: result.changes, integrity: result.integrity });
  }
  return steps;
}

/** Char ranges of the GFM tables in `text` (header through last row), by THE table rule. */
function tableRanges(text: string): Array<[number, number]> {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!tableStartsAt(lines, i)) continue;
    const end = findTableEnd(lines, i);
    ranges.push([starts[i] ?? 0, (starts[end - 1] ?? 0) + (lines[end - 1] ?? "").length]);
    i = end - 1;
  }
  return ranges;
}

const BR_TAG = /^<br\s*\/?>$/i;

/**
 * A `<br>` inside a table cell is GFM's in-cell line break — ordinary editable
 * content the person types and deletes (verify-RC-B4 R6-3), never protected
 * HTML asking for consent. Every other tag, and a `<br>` outside a table, stays
 * protected.
 */
function isCellLineBreak(delta: IslandDelta, stored: string): boolean {
  if (delta.kind === "swallowed" || delta.before === null || !BR_TAG.test(delta.before)) return false;
  if (delta.after !== null && !BR_TAG.test(delta.after)) return false;
  return tableRanges(stored).some(([start, end]) => delta.at >= start && delta.at < end);
}

interface RegionsBetween {
  storedBlocks: readonly SourceBlock[];
  regions: SaveRegion[];
  regionIslands: RegionIslands[];
}

/** Stored blocks identical in the new text (in order) are anchors; everything between two that differs is one region. */
function regionsBetween(stored: string, current: string): RegionsBetween {
  const storedBlocks = tokenizeSource(stored);
  const currentBlocks = tokenizeSource(current);
  const a = storedBlocks.filter((block) => block.kind !== "gap");
  const b = currentBlocks.filter((block) => block.kind !== "gap");
  const anchors = matchBlocks(a.map(blockKey), b.map(blockKey));
  const storedIslands = listIslands(storedBlocks);
  const currentIslands = listIslands(currentBlocks);
  const within = (islands: readonly SourceIsland[], start: number, end: number) =>
    islands.filter((island) => island.start >= start && island.end <= end);

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

  const regions: SaveRegion[] = [];
  const regionIslands: RegionIslands[] = [];
  for (const [sStart, sEnd, cStart, cEnd] of bounds) {
    const before = stored.slice(sStart, sEnd);
    const after = current.slice(cStart, cEnd);
    if (before === after) continue;
    regions.push({ start: sStart, end: sEnd, text: after });
    regionIslands.push({
      before: within(storedIslands, sStart, sEnd),
      after: within(currentIslands, cStart, cEnd),
      afterText: after,
      regionStart: sStart,
    });
  }
  return { storedBlocks, regions, regionIslands };
}

/** Carry a stored-text position through a save (every step, in order). */
export function mapSavePosition(plan: SavePlan, pos: number, options?: MapOptions): MappedPosition {
  let mapped: MappedPosition = { pos, deleted: false };
  for (const step of plan.changeSteps) {
    const next = mapPosition(step, mapped.pos, options);
    mapped = { pos: next.pos, deleted: mapped.deleted || next.deleted };
  }
  return mapped;
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
    changeSteps: [],
    integrity: { ok: true, bytesOutsideEditsIdentical: true, disturbed: [] },
    error: null,
  };
  if (stored === current) return unchanged;

  const { regions, regionIslands } = regionsBetween(stored, current);
  const deltas = islandDeltas(regionIslands);

  const approved = options.approvedIslands ?? new Set<string>();
  const needsConsent = deltas.filter(
    (delta) =>
      delta.kind !== "added" &&
      delta.kind !== "moved" &&
      !(delta.kind !== "swallowed" && delta.before !== null && approved.has(delta.before)) &&
      // The splice still carries it as an island edit (proven); it just never asks.
      !isCellLineBreak(delta, stored),
  );

  let error: string | null = null;
  let changeSteps: ReadonlyArray<readonly SourceChange[]> = [];
  let integrity: SpliceIntegrity | null = null;
  try {
    const steps = spliceInSteps(stored, current, deltas);
    changeSteps = steps.map((step) => step.changes);
    integrity = steps[steps.length - 1]?.integrity ?? null;
    if ((steps[steps.length - 1]?.text ?? stored) !== current) {
      error =
        "The save could not be proven: splicing the edited blocks into the stored text did not reproduce what is on screen.";
    }
  } catch (caught) {
    error =
      caught instanceof SourceSpliceError && caught.code === "integrity"
        ? "This edit would change protected content outside the part you edited (for example, an unclosed code block or tag swallowing what follows)."
        : caught instanceof SourceSpliceError && caught.code === "island_edit"
          ? `A protected block changed in a way the editor could not account for (${caught.message}).`
          : `The save could not be proven (${caught instanceof Error ? caught.message : String(caught)}).`;
  }

  return {
    stored,
    text: current,
    changed: true,
    regions,
    islandDeltas: deltas,
    needsConsent,
    changeSteps,
    integrity,
    error,
  };
}
