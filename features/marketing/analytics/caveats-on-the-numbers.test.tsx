/*
  THE GA4 CAVEATS ARE PRINTED ON THE NUMBERS (round-4 finding V14-4, B side).

  §4.9 asks for *"the honesty caveats printed on the numbers (thresholding,
  `(other)` rows, sampling)"* and §1 says *"Every GA4 consumer lies silently:
  thresholding and the `(other)` row return 200 with wrong totals. We print the
  caveat on the number itself."*

  What the verifier measured instead: only the COMPARISON caveat reached a tile.
  Thresholding, sampling, schema restriction, the `(other)` row and
  users-are-summed were collected into one bordered block BELOW the chart, the
  Users tile's hint read *"Summed across landing pages — see the caveat"* (an
  instruction to go and look), and a landing page literally named `(other)`
  rendered in the table as an ordinary row with no mark at all.

  So every number now carries its own mark, through ONE component
  (`components/CaveatMark.tsx`), with the sentence on hover AND in the accessible
  name — and the attribution of which caveat touches which number is one map in
  `disclosures.ts`, never a per-surface opinion.
*/

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  disclosuresForLandingPage,
  disclosuresForSeries,
  disclosuresForTable,
  disclosuresForTile,
} from "@/features/marketing/analytics/disclosures";
import { ga4Caveats } from "@/features/marketing/analytics/caveats";
import { judgeAnalyticsComparison } from "@/features/marketing/analytics/window";
import { CaveatMark } from "@/features/marketing/analytics/components/CaveatMark";
import { AnalyticsTrendChart } from "@/features/marketing/analytics/components/AnalyticsTrendChart";

const comparable = judgeAnalyticsComparison({
  currentDaysWithData: 28,
  previousDaysWithData: 28,
  windowDays: 28,
});

/** A window Google flagged every way it can flag one. */
const flagged = {
  comparison: comparable,
  caveats: ga4Caveats({
    days: [
      {
        date: "2026-09-14",
        metadata: {
          subjectToThresholding: true,
          samplingMetadatas: [{ samplesReadCount: "1000" }],
          schemaRestrictionResponse: {
            activeMetricRestrictions: [{ metricName: "revenue" }],
          },
        },
        hasOtherRow: true,
      },
      {
        date: "2026-09-15",
        metadata: { subjectToThresholding: true },
        hasOtherRow: false,
      },
    ],
    usersAreSummed: true,
  }),
};

/** A window Google flagged nothing on — the live shape, 62,301 rows of it. */
const quiet = {
  comparison: comparable,
  caveats: ga4Caveats({
    days: [
      {
        date: "2026-09-15",
        metadata: {
          timeZone: "America/Los_Angeles",
          currencyCode: "USD",
          schemaRestrictionResponse: {},
        },
        hasOtherRow: false,
      },
    ],
    usersAreSummed: true,
  }),
};

function ids(list: { id: string }[]): string[] {
  return list.map((entry) => entry.id).sort();
}

describe("which number each caveat is printed on", () => {
  it("thresholding, sampling and a hidden metric reach EVERY tile", () => {
    for (const metric of ["sessions", "engagedSessions", "conversions"] as const) {
      expect(ids(disclosuresForTile(flagged, metric))).toEqual(
        expect.arrayContaining(["sampling", "schema-restriction", "thresholding"]),
      );
    }
  });

  it("users-are-summed reaches the Users tile and NO other tile", () => {
    expect(ids(disclosuresForTile(flagged, "users"))).toContain(
      "users-not-unique",
    );
    expect(ids(disclosuresForTile(flagged, "sessions"))).not.toContain(
      "users-not-unique",
    );
    // Even on the quiet window, where the only other note is the measurement one.
    expect(ids(disclosuresForTile(quiet, "users"))).toContain("users-not-unique");
    expect(ids(disclosuresForTile(quiet, "sessions"))).toEqual([
      "flags-not-affirmed",
    ]);
  });

  it("the `(other)` bundle marks the `(other)` ROW and the page list, never a site total", () => {
    // Site totals are still right when Google bundles — the per-page list is what
    // is missing pages by name, so the mark belongs there and not on the tile.
    expect(ids(disclosuresForTile(flagged, "sessions"))).not.toContain(
      "other-row",
    );
    expect(ids(disclosuresForLandingPage(flagged, "(other)"))).toContain(
      "other-row",
    );
    expect(ids(disclosuresForLandingPage(flagged, "/pricing"))).not.toContain(
      "other-row",
    );
    expect(ids(disclosuresForTable(flagged))).toContain("other-row");
  });

  it("sampling marks every row, because every row is then an estimate", () => {
    expect(ids(disclosuresForLandingPage(flagged, "/pricing"))).toContain(
      "sampling",
    );
    // …and a quiet window puts no mark on a row at all.
    expect(disclosuresForLandingPage(quiet, "/pricing")).toEqual([]);
  });

  it("withheld rows mark the page LIST, which is the thing missing rows", () => {
    expect(ids(disclosuresForTable(flagged))).toContain("thresholding");
  });

  it("every series carries what its own numbers carry", () => {
    expect(ids(disclosuresForSeries(flagged, "users"))).toContain(
      "users-not-unique",
    );
    expect(ids(disclosuresForSeries(flagged, "sessions"))).not.toContain(
      "users-not-unique",
    );
    expect(ids(disclosuresForSeries(flagged, "sessions"))).toContain("sampling");
  });

  it("the comparison caveat is NOT duplicated into a mark", () => {
    // The tile and the chart legend already print it in full, in words. A mark
    // repeating it would be the same sentence twice on one number.
    const refused = {
      comparison: judgeAnalyticsComparison({
        currentDaysWithData: 28,
        previousDaysWithData: 6,
        windowDays: 28,
      }),
      caveats: [],
    };
    expect(disclosuresForTile(refused, "sessions")).toEqual([]);
  });
});

describe("the quiet window says what was and was not checked", () => {
  it("does not invent a caveat Google never reported", () => {
    expect(ids(quiet.caveats)).not.toContain("thresholding");
    expect(ids(quiet.caveats)).not.toContain("sampling");
    expect(ids(quiet.caveats)).not.toContain("other-row");
  });

  it("names the one thing the stored metadata cannot tell us", () => {
    // 🚨 Live on 2026-09-17: all 62,301 GA4 rows carry ONE metadata object,
    // `{timeZone, currencyCode, schemaRestrictionResponse:{}}` — so no caveat has
    // ever fired, and the client cannot tell "Google said no" from "we never
    // recorded an answer". The number therefore carries what IS known rather
    // than reading as a positive all-clear.
    const measured = ids(quiet.caveats);
    expect(measured).toContain("flags-not-affirmed");
    const note = quiet.caveats.find(
      (caveat) => caveat.id === "flags-not-affirmed",
    );
    expect(note?.headline).toContain("Nothing was flagged");
    expect(note?.detail).toContain("2026-09-17");
    // And it reaches the numbers it qualifies.
    expect(ids(disclosuresForTile(quiet, "sessions"))).toContain(
      "flags-not-affirmed",
    );
  });

  it("goes quiet the moment Google DOES flag something", () => {
    expect(ids(flagged.caveats)).not.toContain("flags-not-affirmed");
  });

  it("says nothing at all when there is no metadata to read", () => {
    // No collected day: the window has no numbers either, so a note about what
    // Google reported would be about nothing.
    expect(ga4Caveats({ days: [], usersAreSummed: false })).toEqual([]);
  });
});

/**
 * THE B-19 UPGRADE (2026-09-17): `subjectToThresholding`, `dataLossFromOtherRow`
 * and `samplingMetadatas` are now ALWAYS present on a new row — `false`/`[]`
 * means Google affirmed the window clean, an absent key means the row predates
 * this change and was never captured. `report_date_range` + `captured_at` name
 * the window a flag actually describes, replacing the per-day-row count.
 */
describe("the GA4 collection honesty upgrade (B-19)", () => {
  /** A day whose report affirmed clean, explicitly. */
  const affirmedCleanDay = {
    date: "2026-09-17",
    metadata: {
      timeZone: "America/Los_Angeles",
      currencyCode: "USD",
      schemaRestrictionResponse: {},
      subjectToThresholding: false,
      dataLossFromOtherRow: false,
      samplingMetadatas: [],
      report_date_range: { start: "2026-08-21", end: "2026-09-17" },
      captured_at: "2026-09-18T07:15:00Z",
    },
    hasOtherRow: false,
  };

  it("an explicit false/[]/false affirms the window clean — NO caveat on the totals", () => {
    const caveats = ga4Caveats({
      days: [affirmedCleanDay],
      usersAreSummed: false,
    });
    expect(caveats).toEqual([]);
  });

  it("a day missing the keys entirely is honestly not-captured, never read as clean", () => {
    const neverCapturedDay = {
      date: "2026-09-10",
      metadata: {
        timeZone: "America/Los_Angeles",
        currencyCode: "USD",
        schemaRestrictionResponse: {},
      },
      hasOtherRow: false,
    };
    const caveats = ga4Caveats({
      days: [neverCapturedDay],
      usersAreSummed: false,
    });
    expect(ids(caveats)).toEqual(["flags-not-affirmed"]);
  });

  it("subjectToThresholding: true still raises the thresholding mark, even though the keys are all present", () => {
    const flaggedDay = {
      ...affirmedCleanDay,
      metadata: { ...affirmedCleanDay.metadata, subjectToThresholding: true },
    };
    const caveats = ga4Caveats({ days: [flaggedDay], usersAreSummed: false });
    expect(ids(caveats)).toEqual(["thresholding"]);
    expect(caveats.find((c) => c.id === "thresholding")?.headline).not.toContain(
      "flags-not-affirmed",
    );
  });

  it(
    "🚨 a window straddling the cutover is NOT fully affirmed just because ONE day was " +
      "(the `.some()` bug: RED at HEAD before the fix, GREEN after)",
    () => {
      const neverCapturedDay = {
        date: "2026-09-10",
        metadata: {
          timeZone: "America/Los_Angeles",
          currencyCode: "USD",
          schemaRestrictionResponse: {},
        },
        hasOtherRow: false,
      };
      const caveats = ga4Caveats({
        days: [neverCapturedDay, affirmedCleanDay],
        usersAreSummed: false,
      });
      // The old `.some()` gate saw ANY day (affirmedCleanDay) carrying the keys
      // and suppressed this note for the WHOLE window — including the day that
      // truly was never captured. Full-coverage is required now.
      expect(ids(caveats)).toEqual(["flags-not-affirmed"]);
    },
  );

  it("the thresholding headline names the REPORT window and capture instant, not a per-day count", () => {
    const flaggedDay = {
      ...affirmedCleanDay,
      metadata: { ...affirmedCleanDay.metadata, subjectToThresholding: true },
    };
    const caveats = ga4Caveats({ days: [flaggedDay], usersAreSummed: false });
    const headline = caveats.find((c) => c.id === "thresholding")?.headline ?? "";
    expect(headline).toContain("Aug 21");
    expect(headline).toContain("Sep 17");
    expect(headline).toContain("captured Sep 18");
    expect(headline).not.toContain("collected day");
  });

  it("falls back to the per-day count, named as a gap, when a flagged day carries no report window", () => {
    const legacyFlaggedDay = {
      date: "2026-09-05",
      metadata: { subjectToThresholding: true },
      hasOtherRow: false,
    };
    const caveats = ga4Caveats({
      days: [legacyFlaggedDay],
      usersAreSummed: false,
    });
    const headline = caveats.find((c) => c.id === "thresholding")?.headline ?? "";
    expect(headline).toContain("the one collected day");
    expect(headline).toContain("report window not recorded");
  });
});

describe("the ONE caveat mark component", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(node: React.ReactNode) {
    act(() => root.render(node));
    return container;
  }

  it("carries the sentence on hover AND in the accessible name", () => {
    const dom = render(
      <CaveatMark what="Sessions" disclosures={disclosuresForTile(flagged, "sessions")} />,
    );
    const mark = dom.querySelector("[role='img']");
    expect(mark).not.toBeNull();
    const title = mark!.getAttribute("title") ?? "";
    const label = mark!.getAttribute("aria-label") ?? "";
    for (const text of ["withheld some rows", "sampled", "hid some metrics"]) {
      expect(title).toContain(text);
      expect(label).toContain(text);
    }
    // The accessible name says WHAT it qualifies — a bare "warning" tells a
    // screen-reader user nothing about which number is affected.
    expect(label).toContain("Sessions");
  });

  it("renders NOTHING when there is nothing true to say", () => {
    const dom = render(<CaveatMark what="Sessions" disclosures={[]} />);
    // Never a disabled-looking or empty mark: absent or honest.
    expect(dom.textContent).toBe("");
    expect(dom.querySelector("[role='img']")).toBeNull();
  });

  it("rides the chart's real legend, per series", () => {
    const dom = render(
      <AnalyticsTrendChart
        series={[
          { date: "2026-09-14", sessions: 10, users: 8, engagedSessions: 6, conversions: 1 },
          { date: "2026-09-15", sessions: 12, users: 9, engagedSessions: 7, conversions: 0 },
        ]}
        previousSeries={[]}
        currentStart="2026-09-14"
        previousStart="2026-09-12"
        windowDays={2}
        comparison={comparable}
        caveats={flagged.caveats}
        visible={["sessions", "users", "engagedSessions"]}
        onToggle={() => undefined}
      />,
    );
    const names = [...dom.querySelectorAll("[role='img']")].map(
      (mark) => mark.getAttribute("aria-label") ?? "",
    );
    // Every series wears the sampling/thresholding marks…
    expect(names.filter((name) => name.includes("sampled")).length).toBe(3);
    // …and exactly one — Users — wears the summed-visitors one.
    expect(
      names.filter((name) => name.includes("Users are summed")).length,
    ).toBe(1);
    expect(
      names.find((name) => name.includes("Users are summed")),
    ).toContain("Users:");
  });

  it("is one component, and the panel's own numbers use it", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const panel = fs.readFileSync(
      path.join(__dirname, "components", "SiteAnalyticsPanel.tsx"),
      "utf8",
    );
    // The tiles, the chart and the landing-page table all ask the ONE component
    // through the ONE attribution map.
    expect(panel).toContain("<CaveatMark");
    expect(panel).toContain("disclosuresForTile(");
    expect(panel).toContain("disclosuresForLandingPage(");
    expect(panel).toContain("disclosuresForTable(");
    // And the instruction-to-go-and-look hint is gone from the Users tile.
    expect(panel).not.toContain("see the caveat");
    const chart = fs.readFileSync(
      path.join(__dirname, "components", "AnalyticsTrendChart.tsx"),
      "utf8",
    );
    expect(chart).toContain("disclosuresForSeries(");
    expect(chart).toContain("<CaveatMark");
  });
});
