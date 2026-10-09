// The admin list's Runs / Last run columns (../runs.ts): same wiring as spend.

import {
  mandateRunsFromAnswer,
  runsFactsOf,
  runsOfKey,
  runsSince,
  runsTabHref,
  spendByKeyOf,
  type MandateRunsCell,
} from "../runs";
import { FIELDS } from "../fields";
import type { MandateAdminRow } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("the runs read", () => {
  it("turns the database answer into cells and leaves unreadable entries out", () => {
    const read = mandateRunsFromAnswer({
      "applets.build": {
        runs: 12,
        last: "2026-10-08T10:00:00+00:00",
        cost: 1.5,
        inferred_runs: 4,
        inferred_cost: "0.25",
      },
      "podcast.script": { runs: "3", last: null },
      broken: { runs: "many" },
      nothing: null,
    });
    expect(read.byKey["applets.build"]).toEqual({
      runs: 12,
      lastMs: Date.parse("2026-10-08T10:00:00Z"),
      usd: 1.5,
      inferredRuns: 4,
      inferredUsd: 0.25,
    });
    // An answer without costs is unknown cost, never $0.
    expect(read.byKey["podcast.script"]).toEqual({ runs: 3, lastMs: null, usd: null, inferredRuns: 0, inferredUsd: 0 });
    expect(read.byKey.broken).toBeUndefined();
    expect(read.byKey.nothing).toBeUndefined();
    expect(mandateRunsFromAnswer(null).byKey).toEqual({});
  });

  it("sends the runs only once they have been read, last run in epoch seconds", () => {
    expect(runsFactsOf(null)).toEqual({});
    const cell = (runs: number, lastMs: number | null): MandateRunsCell => ({
      runs,
      lastMs,
      usd: 0,
      inferredRuns: 0,
      inferredUsd: 0,
    });
    expect(runsFactsOf({ a: cell(2, 5_000), b: cell(0, null) })).toEqual({
      runs: { a: 2, b: 0 },
      lastRun: { a: 5 },
    });
  });

  it("says no runs for a key the read never named, and nothing before the read", () => {
    expect(runsOfKey(null, "a")).toBeNull();
    expect(runsOfKey({}, "a")).toEqual({ runs: 0, lastMs: null, usd: 0, inferredRuns: 0, inferredUsd: 0 });
  });

  it("starts the period where the cost period starts", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(Date.parse(runsSince("7d", now))).toBeLessThan(now.getTime());
    expect(runsSince("not-a-period", now)).toBe(runsSince("30d", now));
  });

  it("opens the mandate's Test tab on its runs", () => {
    expect(runsTabHref("/administration/intelligence/mandates/applets.build")).toBe(
      "/administration/intelligence/mandates/applets.build?tab=runs",
    );
  });
});

describe("ONE definition of a mandate's runs: the cost is the runs' cost", () => {
  // 2026-10-09: 221 runs at $0.00 beside $109.05 with 0 runs — the cost was a
  // usage-ledger question the runs never answered to.
  it("prices every mandate from the same read that counts its runs", () => {
    const read = mandateRunsFromAnswer({
      "agent_factory.structure_builder": { runs: 221, last: null, cost: 36.54, inferred_runs: 221, inferred_cost: 36.54 },
      "masterwork.coherence_partner": { runs: 231, last: null, cost: 109.05, inferred_runs: 0, inferred_cost: 0 },
    });
    expect(spendByKeyOf(read.byKey)).toEqual({
      byKey: { "agent_factory.structure_builder": 36.54, "masterwork.coherence_partner": 109.05 },
      unknown: false,
    });
  });
  it("says the cost is unknown when the answer carried none", () => {
    const read = mandateRunsFromAnswer({ a: { runs: 2, last: null } });
    expect(spendByKeyOf(read.byKey)).toEqual({ byKey: {}, unknown: true });
  });
  it("never asks the usage ledger for the list's cost", () => {
    const store = readFileSync(join(__dirname, "..", "store.ts"), "utf8");
    const spend = readFileSync(join(__dirname, "..", "spend.ts"), "utf8");
    expect(store).not.toMatch(/drillAsk|ai_usage/);
    expect(spend).not.toMatch(/drillAsk|by: \["feature"\]/);
    expect(store).toMatch(/spendByKeyOf\(read\.byKey\)/);
  });
});

describe("the Runs columns", () => {
  // columns.tsx cannot load under jest (design-system subpath), so the column
  // set is checked on its source: both columns declared, both system-only.
  const source = readFileSync(join(__dirname, "..", "columns.tsx"), "utf8");
  it("sit on the management list and not on the support lookup", () => {
    expect(source).toMatch(/id: "runs",\n\s+label: "Runs"/);
    expect(source).toMatch(/id: "lastRun",\n\s+label: "Last run"/);
    const systemOnly = source.slice(source.indexOf("SYSTEM_ONLY_REPORT_COLUMNS"));
    expect(systemOnly).toContain('"runs"');
    expect(systemOnly).toContain('"lastRun"');
  });
  it("mark an inferred share as estimated, on the count and on the cost", () => {
    expect(source).toMatch(/row\.inferredRuns > 0 \? \(\s*<EstimatedMark/);
    expect(source).toMatch(/row\.inferredUsd > 0 \? \(\s*<EstimatedMark/);
  });
  it("sort by their figures, unread last", () => {
    const row = (runs: number | null, lastRunMs: number | null) =>
      ({ runs, lastRunMs }) as unknown as MandateAdminRow;
    expect(FIELDS.runs.sort(row(5, null))).toBe(5);
    expect(FIELDS.runs.sort(row(null, null))).toBe(-1);
    expect(FIELDS.lastRun.sort(row(5, 1000))).toBe(1000);
    expect(FIELDS.lastRun.sort(row(0, null))).toBe(0);
    expect(FIELDS.lastRun.sort(row(null, null))).toBe(-1);
  });
});
