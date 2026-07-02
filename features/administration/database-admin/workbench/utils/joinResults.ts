import type { JoinMode } from "../types";

export type Row = Record<string, unknown>;

/**
 * Common envelope keys we strip when a query response wraps the actual rows
 * (e.g. `executeSqlQuery` returns `{ result: [...] }`). Order matters — checked
 * first match wins.
 */
const ENVELOPE_KEYS = ["result", "results", "data", "rows", "records", "items"];

const MAX_UNWRAP_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfRows(arr: unknown[]): Row[] {
  return arr.filter(
    (item): item is Row => typeof item === "object" && item !== null,
  );
}

/**
 * Coerce an arbitrary value into rows. Strips common envelopes like
 * `{ result: [...] }` and nested wrappers such as
 * `{ data: { result: [...] }, error: null }` so suggestions and merges run
 * against the real data instead of the wrapper.
 */
export function toRows(value: unknown): Row[] {
  let current: unknown = value;

  unwrap: for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    if (Array.isArray(current)) {
      return arrayOfRows(current);
    }
    if (!isPlainObject(current)) {
      return [];
    }
    const obj = current;

    // Server action envelope from executeSqlQuery: { data, error }
    if ("data" in obj && "error" in obj) {
      current = obj.data;
      continue unwrap;
    }

    // Well-known envelope keys — array → rows; nested object → keep unwrapping
    for (const key of ENVELOPE_KEYS) {
      if (!(key in obj)) continue;
      const inner = obj[key];
      if (Array.isArray(inner)) {
        return arrayOfRows(inner);
      }
      if (isPlainObject(inner)) {
        current = inner;
        continue unwrap;
      }
    }

    // Single-key wrapper whose value is an array or another object envelope
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const inner = obj[keys[0]];
      if (Array.isArray(inner)) {
        return arrayOfRows(inner);
      }
      if (isPlainObject(inner)) {
        current = inner;
        continue unwrap;
      }
    }

    // Object with no array envelope — treat as a single row
    return [obj as Row];
  }

  return [];
}

export function getColumns(rows: Row[]): string[] {
  const cols = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) cols.add(k);
  }
  return Array.from(cols);
}

export interface JoinKeySuggestion {
  leftKey: string;
  rightKey: string;
  /**
   * Higher = better. Combines name-shape score and observed value overlap.
   */
  score: number;
  reason: string;
  /**
   * Number of left rows whose value appears in the right column when sampled.
   * `null` if no value-overlap signal was computed.
   */
  observedMatches: number | null;
}

const SAMPLE_LIMIT = 200;

function coerceKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

function buildValueIndex(rows: Row[], col: string): Set<string> {
  const out = new Set<string>();
  const limit = Math.min(rows.length, SAMPLE_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const k = coerceKey(rows[i][col]);
    if (k !== null && k !== "") out.add(k);
  }
  return out;
}

function countOverlap(rows: Row[], col: string, against: Set<string>): number {
  if (against.size === 0) return 0;
  let n = 0;
  const limit = Math.min(rows.length, SAMPLE_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const k = coerceKey(rows[i][col]);
    if (k !== null && against.has(k)) n += 1;
  }
  return n;
}

/**
 * Score a candidate (leftCol, rightCol) pair based on column-name shape.
 * Returns a base score before any value-overlap bonus.
 */
function nameShapeScore(
  leftCol: string,
  rightCol: string,
): { score: number; reason: string } | null {
  if (leftCol === rightCol) {
    if (leftCol === "id") {
      return { score: 30, reason: "Same column name" };
    }
    if (leftCol.endsWith("_id")) {
      return { score: 50, reason: "Shared foreign-key column" };
    }
    return { score: 20, reason: "Shared column" };
  }

  // id ↔ <something>_id
  if (leftCol === "id" && rightCol.endsWith("_id")) {
    return { score: 60, reason: `id ↔ ${rightCol}` };
  }
  if (rightCol === "id" && leftCol.endsWith("_id")) {
    return { score: 60, reason: `${leftCol} ↔ id` };
  }

  return null;
}

/**
 * Suggest the best (leftKey, rightKey) pairs to join on.
 *
 * Strategy:
 *   1. Generate every same-name and `id ↔ X_id` candidate pair.
 *   2. Score each pair by name shape and (when both sides have rows)
 *      verified value overlap from the first SAMPLE_LIMIT rows.
 *   3. Return up to `maxResults` distinct pairs sorted by score desc.
 */
export function suggestJoinKeys(
  left: Row[],
  right: Row[],
  maxResults = 5,
): JoinKeySuggestion[] {
  const leftCols = getColumns(left);
  const rightCols = getColumns(right);
  const rightColSet = new Set(rightCols);

  const candidates: JoinKeySuggestion[] = [];
  const seen = new Set<string>();

  const addCandidate = (
    leftKey: string,
    rightKey: string,
    base: { score: number; reason: string },
  ) => {
    const sig = `${leftKey}::${rightKey}`;
    if (seen.has(sig)) return;
    seen.add(sig);

    let observed: number | null = null;
    let bonus = 0;
    if (left.length > 0 && right.length > 0) {
      const rightIndex = buildValueIndex(right, rightKey);
      const leftIndex = buildValueIndex(left, leftKey);
      observed = countOverlap(left, leftKey, rightIndex);
      if (observed > 0) {
        const ratio = observed / Math.min(left.length, SAMPLE_LIMIT);
        bonus = Math.round(40 * ratio) + 10;

        // Low-cardinality penalty: if either side has only one distinct
        // value, joining produces a near-cartesian explosion which is
        // almost never intended (e.g. both sides filtered by the same
        // conversation_id, or empty {} metadata everywhere).
        if (leftIndex.size <= 1 && rightIndex.size <= 1) {
          bonus = Math.min(bonus, 5);
        } else if (leftIndex.size <= 1 || rightIndex.size <= 1) {
          bonus = Math.round(bonus * 0.3);
        }
      }
    }

    candidates.push({
      leftKey,
      rightKey,
      score: base.score + bonus,
      reason: base.reason,
      observedMatches: observed,
    });
  };

  // Same-name pairs
  for (const col of leftCols) {
    if (rightColSet.has(col)) {
      const base = nameShapeScore(col, col);
      if (base) addCandidate(col, col, base);
    }
  }

  // Cross-name: id ↔ <X>_id (left.id matches right.<X>_id)
  if (leftCols.includes("id")) {
    for (const rcol of rightCols) {
      if (rcol === "id") continue;
      if (rcol.endsWith("_id")) {
        const base = nameShapeScore("id", rcol);
        if (base) addCandidate("id", rcol, base);
      }
    }
  }

  // Cross-name: <X>_id ↔ id (left.<X>_id matches right.id)
  if (rightColSet.has("id")) {
    for (const lcol of leftCols) {
      if (lcol === "id") continue;
      if (lcol.endsWith("_id")) {
        const base = nameShapeScore(lcol, "id");
        if (base) addCandidate(lcol, "id", base);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxResults);
}

function prefixKeys(row: Row, prefix: string): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[`${prefix}${k}`] = v;
  }
  return out;
}

/**
 * Slugify a block label into a safe object key for embed mode.
 * "Tool Calls" -> "tool_calls", "Messages" -> "messages".
 */
export function deriveEmbedKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "embedded";
}

export interface MergeArgs {
  leftRows: Row[];
  rightRows: Row[];
  leftLabel: string;
  rightLabel: string;
  leftKey: string | null;
  rightKey: string | null;
  mode: JoinMode;
  timelineKey: string;
}

export interface MergeStats {
  /** Mode actually executed. */
  mode: JoinMode;
  /** Total rows in each input. */
  leftRows: number;
  rightRows: number;
  /** Rows in the merged output. */
  outputRows: number;
  /**
   * For inner/left joins: number of left rows that matched at least one
   * right row. For concat/timeline: equal to leftRows.
   */
  matchedLeft: number;
  /** For inner/left joins: number of left rows with no right match. */
  unmatchedLeft: number;
  /** For inner/left joins: right rows whose key was never referenced. */
  unmatchedRight: number;
  /** Free-form notes (e.g., "leftKey not provided"). */
  notes: string[];
}

export interface MergeOutput {
  rows: Row[];
  stats: MergeStats;
}

export function mergeResults({
  leftRows,
  rightRows,
  leftLabel,
  rightLabel,
  leftKey,
  rightKey,
  mode,
  timelineKey,
}: MergeArgs): MergeOutput {
  if (mode === "concat") {
    const tagged: Row[] = [];
    for (const r of leftRows) tagged.push({ _source: leftLabel, ...r });
    for (const r of rightRows) tagged.push({ _source: rightLabel, ...r });
    return {
      rows: tagged,
      stats: {
        mode,
        leftRows: leftRows.length,
        rightRows: rightRows.length,
        outputRows: tagged.length,
        matchedLeft: leftRows.length,
        unmatchedLeft: 0,
        unmatchedRight: 0,
        notes: [],
      },
    };
  }

  if (mode === "timeline") {
    const tagged: Row[] = [];
    for (const r of leftRows) tagged.push({ _source: leftLabel, ...r });
    for (const r of rightRows) tagged.push({ _source: rightLabel, ...r });
    let missingTs = 0;
    for (const row of tagged) {
      if (row[timelineKey] == null) missingTs += 1;
    }
    tagged.sort((a, b) => {
      const av = a[timelineKey];
      const bv = b[timelineKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const at = new Date(av as string | number).getTime();
      const bt = new Date(bv as string | number).getTime();
      if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
      if (Number.isNaN(at)) return 1;
      if (Number.isNaN(bt)) return -1;
      return at - bt;
    });
    const notes: string[] = [];
    if (missingTs > 0) {
      notes.push(
        `${missingTs} row${missingTs === 1 ? "" : "s"} missing "${timelineKey}" — sorted to the end.`,
      );
    }
    return {
      rows: tagged,
      stats: {
        mode,
        leftRows: leftRows.length,
        rightRows: rightRows.length,
        outputRows: tagged.length,
        matchedLeft: leftRows.length,
        unmatchedLeft: 0,
        unmatchedRight: 0,
        notes,
      },
    };
  }

  if (mode === "embed") {
    const stats: MergeStats = {
      mode,
      leftRows: leftRows.length,
      rightRows: rightRows.length,
      outputRows: 0,
      matchedLeft: 0,
      unmatchedLeft: 0,
      unmatchedRight: 0,
      notes: [],
    };

    if (!leftKey || !rightKey) {
      stats.notes.push("Pick a join key on both sides to embed matches.");
      return { rows: [], stats };
    }

    const embedKey = deriveEmbedKey(rightLabel);
    const rightIndex = new Map<string, Row[]>();
    const usedRightKeys = new Set<string>();
    for (const r of rightRows) {
      const k = coerceKey(r[rightKey]);
      if (k === null) continue;
      const arr = rightIndex.get(k);
      if (arr) arr.push(r);
      else rightIndex.set(k, [r]);
    }

    let collisions = 0;
    const out: Row[] = [];
    for (const lr of leftRows) {
      const k = coerceKey(lr[leftKey]);
      const matches = k !== null ? rightIndex.get(k) : undefined;
      if (embedKey in lr) collisions += 1;

      if (matches && matches.length > 0) {
        stats.matchedLeft += 1;
        if (k !== null) usedRightKeys.add(k);
        const embedded =
          matches.length === 1 ? matches[0] : (matches as unknown);
        out.push({ ...lr, [embedKey]: embedded });
      } else {
        stats.unmatchedLeft += 1;
        out.push({ ...lr, [embedKey]: null });
      }
    }

    let unmatchedRight = 0;
    for (const r of rightRows) {
      const k = coerceKey(r[rightKey]);
      if (k === null || !usedRightKeys.has(k)) unmatchedRight += 1;
    }
    stats.unmatchedRight = unmatchedRight;
    stats.outputRows = out.length;

    if (collisions > 0) {
      stats.notes.push(
        `"${embedKey}" already existed on ${collisions} left row${collisions === 1 ? "" : "s"} — overwritten by embed. Rename the right block to change the embed key.`,
      );
    }
    if (stats.matchedLeft === 0 && leftRows.length > 0) {
      stats.notes.push(
        `No matches between ${leftLabel}.${leftKey} and ${rightLabel}.${rightKey}. "${embedKey}" is null on every row.`,
      );
    }

    return { rows: out, stats };
  }

  // inner / left
  const stats: MergeStats = {
    mode,
    leftRows: leftRows.length,
    rightRows: rightRows.length,
    outputRows: 0,
    matchedLeft: 0,
    unmatchedLeft: 0,
    unmatchedRight: 0,
    notes: [],
  };

  if (!leftKey || !rightKey) {
    stats.notes.push("Pick a join key on both sides to compute matches.");
    return { rows: [], stats };
  }

  const rightIndex = new Map<string, Row[]>();
  const usedRightKeys = new Set<string>();
  for (const r of rightRows) {
    const k = coerceKey(r[rightKey]);
    if (k === null) continue;
    const arr = rightIndex.get(k);
    if (arr) arr.push(r);
    else rightIndex.set(k, [r]);
  }

  const out: Row[] = [];
  for (const lr of leftRows) {
    const k = coerceKey(lr[leftKey]);
    const matches = k !== null ? rightIndex.get(k) : undefined;
    const leftPrefixed = prefixKeys(lr, `${leftLabel}.`);

    if (matches && matches.length > 0) {
      stats.matchedLeft += 1;
      if (k !== null) usedRightKeys.add(k);
      for (const m of matches) {
        out.push({ ...leftPrefixed, ...prefixKeys(m, `${rightLabel}.`) });
      }
    } else {
      stats.unmatchedLeft += 1;
      if (mode === "left") {
        out.push(leftPrefixed);
      }
    }
  }

  let unmatchedRight = 0;
  for (const r of rightRows) {
    const k = coerceKey(r[rightKey]);
    if (k === null || !usedRightKeys.has(k)) unmatchedRight += 1;
  }
  stats.unmatchedRight = unmatchedRight;
  stats.outputRows = out.length;

  if (out.length === 0) {
    stats.notes.push(
      `No matches between ${leftLabel}.${leftKey} and ${rightLabel}.${rightKey}. Try a different key pair.`,
    );
  }

  return { rows: out, stats };
}
