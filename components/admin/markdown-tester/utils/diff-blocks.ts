// components/admin/markdown-tester/utils/diff-blocks.ts
// Pure utility — aligns three parser outputs and a raw input string by
// block index, computes per-cell match status, and exposes byte-level
// diff helpers for the drift report.
//
// "Match" is byte-for-byte equality of:
//   - block type
//   - block content (server-emitted content is normalized to `string` —
//     `null` is treated as "")
// Any character difference (whitespace, trailing newline, escape) counts
// as drift. That's the point.

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import type { SplitterBlock } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

export type ParserSource = "v2" | "redux" | "server";

export type CellStatus = "match" | "type-drift" | "content-drift" | "missing";

export interface NormalizedBlock {
  index: number;
  type: string;
  content: string;
}

export interface DiffCell {
  block: NormalizedBlock | null;
  status: CellStatus;
  /** First differing byte index vs V2, or -1 if no drift. */
  firstDiffAt: number;
}

export interface DiffRow {
  index: number;
  v2: DiffCell;
  redux: DiffCell;
  server: DiffCell;
  summary: string;
}

export interface DiffReport {
  rows: DiffRow[];
  /** Count of rows where at least one cell is type-drift / content-drift / missing. */
  driftCount: number;
  /** Per-pair byte equality (0..1). */
  v2VsRedux: number;
  v2VsServer: number;
  reduxVsServer: number;
}

function normalizeSplitter(blocks: SplitterBlock[]): NormalizedBlock[] {
  return blocks.map((b, i) => ({
    index: i,
    type: b.type,
    content: b.content ?? "",
  }));
}

function normalizeRendered(blocks: RenderBlockPayload[]): NormalizedBlock[] {
  return blocks.map((b, i) => ({
    index: b.blockIndex ?? i,
    type: b.type,
    content: b.content ?? "",
  }));
}

export interface DiffInputs {
  v2: SplitterBlock[];
  redux: RenderBlockPayload[];
  server: RenderBlockPayload[];
}

/**
 * Returns the 0-based index of the first differing character between
 * `a` and `b`, or `-1` if they are byte-identical.
 */
export function findFirstDifferingChar(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return i;
  }
  return a.length === b.length ? -1 : len;
}

function compareToBaseline(
  baseline: NormalizedBlock | undefined,
  other: NormalizedBlock | undefined,
): DiffCell {
  if (!other) {
    return { block: null, status: "missing", firstDiffAt: -1 };
  }
  if (!baseline) {
    // Baseline missing but `other` exists — this is also drift.
    return { block: other, status: "content-drift", firstDiffAt: 0 };
  }
  if (baseline.type !== other.type) {
    return { block: other, status: "type-drift", firstDiffAt: -1 };
  }
  const firstDiffAt = findFirstDifferingChar(baseline.content, other.content);
  if (firstDiffAt === -1) {
    return { block: other, status: "match", firstDiffAt: -1 };
  }
  return { block: other, status: "content-drift", firstDiffAt };
}

function describeCell(
  source: ParserSource,
  cell: DiffCell,
  baseline: NormalizedBlock | undefined,
): string | null {
  if (cell.status === "match") return null;
  if (cell.status === "missing") return `${source.toUpperCase()} missing block`;
  if (cell.status === "type-drift") {
    return `${source.toUpperCase()} type=${cell.block?.type} vs V2 ${baseline?.type ?? "—"}`;
  }
  const baselineLen = baseline?.content.length ?? 0;
  const otherLen = cell.block?.content.length ?? 0;
  return `${source.toUpperCase()} content drift at byte ${cell.firstDiffAt} (${otherLen} vs ${baselineLen} B)`;
}

function pairwiseByteEquality(
  a: NormalizedBlock[],
  b: NormalizedBlock[],
): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  let matches = 0;
  for (let i = 0; i < max; i++) {
    const x = a[i];
    const y = b[i];
    if (x && y && x.type === y.type && x.content === y.content) matches++;
  }
  return matches / max;
}

export function diffBlocks(inputs: DiffInputs): DiffReport {
  const v2 = normalizeSplitter(inputs.v2);
  const redux = normalizeRendered(inputs.redux);
  const server = normalizeRendered(inputs.server);

  const totalRows = Math.max(v2.length, redux.length, server.length);
  const rows: DiffRow[] = [];
  let driftCount = 0;

  for (let i = 0; i < totalRows; i++) {
    const baseline = v2[i];
    const v2Cell: DiffCell = baseline
      ? { block: baseline, status: "match", firstDiffAt: -1 }
      : { block: null, status: "missing", firstDiffAt: -1 };
    const reduxCell = compareToBaseline(baseline, redux[i]);
    const serverCell = compareToBaseline(baseline, server[i]);

    const parts = [
      describeCell("redux", reduxCell, baseline),
      describeCell("server", serverCell, baseline),
    ].filter((s): s is string => Boolean(s));
    const isDrift =
      !baseline ||
      reduxCell.status !== "match" ||
      serverCell.status !== "match";
    if (isDrift) driftCount++;

    rows.push({
      index: i,
      v2: v2Cell,
      redux: reduxCell,
      server: serverCell,
      summary:
        parts.length === 0 ? "all match" : parts.join(" · "),
    });
  }

  return {
    rows,
    driftCount,
    v2VsRedux: pairwiseByteEquality(v2, redux),
    v2VsServer: pairwiseByteEquality(v2, server),
    reduxVsServer: pairwiseByteEquality(redux, server),
  };
}

/**
 * Extracts the source-text segment for a given parser block from the
 * raw input. The local V2 splitter doesn't carry source offsets, so we
 * approximate by scanning the input for the block's content. Falls back
 * to "(no source mapping)" when the content isn't found verbatim.
 */
export function findRawSegment(
  raw: string,
  block: NormalizedBlock | null,
): string {
  if (!block || !block.content) return "";
  const idx = raw.indexOf(block.content);
  if (idx === -1) return block.content;
  return raw.slice(idx, idx + block.content.length);
}
