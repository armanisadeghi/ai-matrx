/**
 * Rankings for the runs comparison — who placed where, on each metric and overall.
 *
 * Every row with a direction ranks the columns (competition ranking: a tie
 * shares the place and the next place is skipped, 1-1-3). Rows marked
 * `scored` — the person's own scores, tokens, cost, speed — feed the
 * Standings: wins (first places), average place, and an overall standing
 * ordered by average place, then wins. Diagnostic rows (event counts,
 * payload sizes) are ranked in place but never decide the standings.
 */

import type { CostUnit } from "@ai-matrx/kit/format";
import type {
  ColumnStats,
  MetricRow,
  MetricSection,
} from "./runsComparisonData";

/** Each column's place on one row; null when it has no value or the row has no direction. */
export function rankRow(
  row: MetricRow,
  stats: ColumnStats[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of stats) out[s.columnId] = null;
  if (row.direction === "none") return out;
  const values = stats
    .map((s) => ({ id: s.columnId, v: row.pick(s) }))
    .filter((x): x is { id: string; v: number } => x.v != null);
  // One value, or every column equal, is not a comparison: no places.
  if (values.length < 2 || values.every((x) => x.v === values[0].v)) return out;
  const sorted = [...values].sort((a, b) =>
    row.direction === "lower" ? a.v - b.v : b.v - a.v,
  );
  sorted.forEach((x, i) => {
    const prev = sorted[i - 1];
    out[x.id] = prev && prev.v === x.v ? (out[prev.id] ?? i + 1) : i + 1;
  });
  return out;
}

export interface Standing {
  columnId: string;
  name: string;
  /** Overall place (1 = best). */
  place: number;
  /** First places across the scored metrics. */
  wins: number;
  /** Average place across the scored metrics it was ranked on. */
  averagePlace: number | null;
  /** How many scored metrics it was ranked on. */
  ranked: number;
}

export interface CategoryLeader {
  label: string;
  /** Names of every column that placed first (ties share it). */
  leaders: string[];
  /** The winning value, formatted. */
  value: string;
}

export interface RunsRanking {
  standings: Standing[];
  leaders: CategoryLeader[];
}

export function computeRanking(
  stats: ColumnStats[],
  sections: MetricSection[],
  costUnit: CostUnit,
): RunsRanking {
  const scoredRows = sections.flatMap((sec) =>
    sec.rows.filter((r) => r.scored),
  );
  // The same metric can appear in two sections (Summary and Token usage):
  // it counts once.
  const seen = new Set<string>();
  const rows = scoredRows.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });

  const tally: Record<string, { wins: number; sum: number; ranked: number }> =
    Object.fromEntries(
      stats.map((s) => [s.columnId, { wins: 0, sum: 0, ranked: 0 }]),
    );
  const leaders: CategoryLeader[] = [];
  for (const row of rows) {
    const places = rankRow(row, stats);
    let firstValue: number | null = null;
    const names: string[] = [];
    for (const s of stats) {
      const place = places[s.columnId];
      if (place == null) continue;
      const t = tally[s.columnId];
      t.ranked += 1;
      t.sum += place;
      if (place === 1) {
        t.wins += 1;
        names.push(s.agentName);
        firstValue = row.pick(s);
      }
    }
    if (names.length > 0) {
      leaders.push({
        label: row.label,
        leaders: names,
        value: row.format(firstValue, costUnit),
      });
    }
  }

  const unplaced = stats.map((s) => {
    const t = tally[s.columnId];
    return {
      columnId: s.columnId,
      name: s.agentName,
      wins: t.wins,
      ranked: t.ranked,
      averagePlace: t.ranked > 0 ? t.sum / t.ranked : null,
    };
  });
  const order = [...unplaced].sort((a, b) => {
    if (a.averagePlace == null && b.averagePlace == null) return 0;
    if (a.averagePlace == null) return 1;
    if (b.averagePlace == null) return -1;
    if (a.averagePlace !== b.averagePlace) return a.averagePlace - b.averagePlace;
    return b.wins - a.wins;
  });
  const standings: Standing[] = [];
  order.forEach((s, i) => {
    const prev = standings[i - 1];
    const tied =
      prev &&
      prev.averagePlace === s.averagePlace &&
      prev.wins === s.wins &&
      s.averagePlace != null;
    standings.push({ ...s, place: tied ? prev.place : i + 1 });
  });
  // A column ranked on nothing has no place yet.
  return {
    standings: standings.map((s) =>
      s.averagePlace == null ? { ...s, place: 0 } : s,
    ),
    leaders,
  };
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
