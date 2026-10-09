// The admin list's Runs / Last run columns (../runs.ts): same wiring as spend.

import {
  mandateRunsFromAnswer,
  runsFactsOf,
  runsOfKey,
  runsSince,
  runsTabHref,
} from "../runs";
import { FIELDS } from "../fields";
import type { MandateAdminRow } from "../types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("the runs read", () => {
  it("turns the database answer into cells and leaves unreadable entries out", () => {
    const read = mandateRunsFromAnswer({
      "applets.build": { runs: 12, last: "2026-10-08T10:00:00+00:00" },
      "podcast.script": { runs: "3", last: null },
      broken: { runs: "many" },
      nothing: null,
    });
    expect(read.byKey["applets.build"]).toEqual({ runs: 12, lastMs: Date.parse("2026-10-08T10:00:00Z") });
    expect(read.byKey["podcast.script"]).toEqual({ runs: 3, lastMs: null });
    expect(read.byKey.broken).toBeUndefined();
    expect(read.byKey.nothing).toBeUndefined();
    expect(mandateRunsFromAnswer(null).byKey).toEqual({});
  });

  it("sends the runs only once they have been read, last run in epoch seconds", () => {
    expect(runsFactsOf(null)).toEqual({});
    expect(runsFactsOf({ a: { runs: 2, lastMs: 5_000 }, b: { runs: 0, lastMs: null } })).toEqual({
      runs: { a: 2, b: 0 },
      lastRun: { a: 5 },
    });
  });

  it("says no runs for a key the read never named, and nothing before the read", () => {
    expect(runsOfKey(null, "a")).toBeNull();
    expect(runsOfKey({}, "a")).toEqual({ runs: 0, lastMs: null });
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
