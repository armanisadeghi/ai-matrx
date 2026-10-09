/**
 * The runs comparison ranks every comparable metric and rolls the decision
 * metrics up into Standings (Arman, 2026-10-02: "actual rankings on each
 * thing that you compare").
 */
import type { ColumnStats, MetricRow, MetricSection } from "../runsComparisonData";
import { computeRanking, ordinal, rankRow, rowHighlights } from "../runsRanking";
import { formatDurationMs } from "@ai-matrx/kit/format";

const col = (columnId: string, cost: number | null, tokens: number | null, score: number | null) =>
  ({ columnId, agentName: columnId.toUpperCase(), cost, tokensTotal: tokens, fbOverall: score }) as unknown as ColumnStats;

const costRow: MetricRow = {
  label: "Cost",
  scored: true,
  pick: (s) => s.cost,
  format: (v) => (v == null ? "—" : `${v} pts`),
  direction: "lower",
};
const tokensRow: MetricRow = { ...costRow, label: "Total tokens", pick: (s) => s.tokensTotal };
const scoreRow: MetricRow = {
  ...costRow,
  label: "Overall",
  pick: (s) => s.fbOverall,
  direction: "higher",
};
const diagnosticRow: MetricRow = { ...costRow, label: "Events", scored: false, pick: (s) => s.cost };

describe("rankRow", () => {
  it("places lower-is-better values in order, ties sharing a place (1-1-3)", () => {
    const stats = [col("a", 5, 0, 0), col("b", 2, 0, 0), col("c", 2, 0, 0)];
    expect(rankRow(costRow, stats, "points")).toEqual({ a: 3, b: 1, c: 1 });
  });

  it("places higher-is-better values highest first", () => {
    const stats = [col("a", 0, 0, 3), col("b", 0, 0, 5)];
    expect(rankRow(scoreRow, stats, "points")).toEqual({ a: 2, b: 1 });
  });

  it("does not rank a row where every column is equal", () => {
    expect(rankRow(costRow, [col("a", 1, 0, 0), col("b", 1, 0, 0)], "points")).toEqual({ a: null, b: null });
  });

  it("does not rank a lone value or a missing one", () => {
    expect(rankRow(costRow, [col("a", 5, 0, 0), col("b", null, 0, 0)], "points")).toEqual({ a: null, b: null });
  });
});

describe("ties are what a person sees", () => {
  const secondsRow: MetricRow = {
    ...costRow,
    label: "Total client",
    format: (v) => formatDurationMs(v, { style: "compact" }),
  };

  it("values that read the same share a place, even when the raw numbers differ", () => {
    // 50.6s, 51.2s and 51.4s all read "51s" — never 1st, 2nd and 3rd.
    const stats = [col("a", 51200, 0, 0), col("b", 50600, 0, 0), col("c", 51400, 0, 0), col("d", 60000, 0, 0)];
    expect(rankRow(secondsRow, stats, "points")).toEqual({ a: 1, b: 1, c: 1, d: 4 });
  });

  it("a row that reads all-equal is unranked", () => {
    const stats = [col("a", 51200, 0, 0), col("b", 50600, 0, 0)];
    expect(rankRow(secondsRow, stats, "points")).toEqual({ a: null, b: null });
  });

  it("green and red come from the places: every tied first is best, every tied last is worst", () => {
    const stats = [col("a", 2, 0, 0), col("b", 1, 0, 0), col("c", 2, 0, 0)];
    expect(rowHighlights(costRow, stats, "points")).toEqual({ b: "best", a: "worst", c: "worst" });
  });
});

describe("computeRanking", () => {
  const sections: MetricSection[] = [
    { title: "Summary", rows: [costRow, tokensRow, scoreRow, diagnosticRow] },
    { title: "Token usage", rows: [tokensRow] }, // the same metric twice counts once
  ];

  it("orders the standings by average place, then wins, from scored rows only", () => {
    const stats = [col("a", 1, 900, 2), col("b", 3, 100, 5), col("c", 2, 500, 4)];
    const { standings, leaders } = computeRanking(stats, sections, "points");
    expect(standings.map((s) => [s.name, s.place, s.wins])).toEqual([
      ["B", 1, 2], // cost 3rd, tokens 1st, score 1st → avg 1.67
      ["C", 2, 0], // 2nd, 2nd, 2nd → 2.0
      ["A", 3, 1], // 1st, 3rd, 3rd → 2.33
    ]);
    expect(standings.every((s) => s.ranked === 3)).toBe(true);
    expect(leaders.map((l) => [l.label, l.leaders])).toEqual([
      ["Cost", ["A"]],
      ["Total tokens", ["B"]],
      ["Overall", ["B"]],
    ]);
  });

  it("gives no place to a column ranked on nothing", () => {
    const stats = [col("a", null, null, null), col("b", null, null, null)];
    expect(computeRanking(stats, sections, "points").standings.map((s) => s.place)).toEqual([0, 0]);
  });
});

describe("ordinal", () => {
  it.each([[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [22, "22nd"]])(
    "%i → %s",
    (n, word) => expect(ordinal(n)).toBe(word),
  );
});
