/**
 * Defects 5 and 6 (2026-10-05, tracker 03dddca8, run 92645952): the report
 * showed literal "None" in its Pickups / first-public cells, a title link with
 * a "|" in it as raw text, raw ISO timestamps, "0 watched" beside the digest's
 * "16 on the watch list", and its funnel counts were plain text.
 */
import {
  cleanReportMarkdown,
  funnelOpenTarget,
  markdownHasSection,
  watchListCount,
} from "../run-document";

const fmt = (iso: string) => `<${iso.slice(0, 10)}>`;

describe("cleanReportMarkdown", () => {
  it("reads an empty table cell as unknown, never None", () => {
    const row = "| [A](https://a.test/x) | None | stale | reason | None |";
    expect(cleanReportMarkdown(row, fmt)).toBe("| [A](https://a.test/x) | unknown | stale | reason | unknown |");
  });

  it("escapes a pipe inside a link's text in a table row so the link renders", () => {
    const row = "| [Action now: The Lancet | World News](https://h.test/a) | 2026-10-04 | stale |";
    expect(cleanReportMarkdown(row, fmt)).toBe(
      "| [Action now: The Lancet \\| World News](https://h.test/a) | 2026-10-04 | stale |",
    );
  });

  it("formats ISO timestamps with the app's date format, never inside a link address", () => {
    const line = "**Run Generated**: 2026-10-05T21:29:31Z and [x](https://a.test/2026-10-05T07:14:01Z)";
    expect(cleanReportMarkdown(line, fmt)).toBe(
      "**Run Generated**: <2026-10-05> and [x](https://a.test/2026-10-05T07:14:01Z)",
    );
  });

  it("leaves prose 'None' alone (it is the report's word, not an empty cell)", () => {
    expect(cleanReportMarkdown("- **Standing**: None — no overlap", fmt)).toBe("- **Standing**: None — no overlap");
  });
});

describe("one watch-list count", () => {
  it("is the digest's listed entries plus its overflow", () => {
    expect(watchListCount({ watch: [{ a: 1 }, { b: 2 }], watch_overflow: 14 })).toBe(16);
    expect(watchListCount(null)).toBeNull();
  });
});

describe("every funnel count opens its list", () => {
  it.each([
    ["surfaced", { kind: "surfaced" }],
    ["stale", { kind: "watch", group: "stale" }],
    ["watching_unverified", { kind: "watch", group: "freshness_unverified" }],
    ["unverified_by_status: unverified_no_timestamp", { kind: "watch", group: "unverified_no_timestamp" }],
    ["hygiene_withheld", { kind: "set_aside", list: "withheld" }],
    ["coarse_rejected", { kind: "set_aside", list: "rejected" }],
    ["pre_gated_stale", { kind: "set_aside", list: "pre_gated" }],
    ["s2_dropped: older_than_max_age", { kind: "set_aside", list: "s2_dropped" }],
    ["below_floor_by_lane: profile_relevance_weak", { kind: "set_aside", list: "below_floor" }],
    ["over_limit", { kind: "set_aside", list: "over_limit" }],
    ["collected", { kind: "run_steps" }],
    ["scored", { kind: "run_steps" }],
  ])("%s", (stage, target) => {
    expect(funnelOpenTarget(stage)).toEqual(target);
  });
});

describe("markdownHasSection", () => {
  it("finds the report's own Disclosures / Monitor Notes headings", () => {
    const md = "# R\n\n## Disclosures\n\n- a\n\n## Monitor Notes\n- b";
    expect(markdownHasSection(md, "Disclosures")).toBe(true);
    expect(markdownHasSection(md, "Monitor notes")).toBe(true);
    expect(markdownHasSection("# R", "Disclosures")).toBe(false);
  });
});

describe("a set-aside item names each address once (duplicate React keys, defect 7)", () => {
  it("dedupes an item's urls", () => {
    // Run 92645952: item 90d3c0659c631723 carried the same insideclimatenews.org address 3 times.
    const { readSetAsideItems } = jest.requireActual("../run-document");
    const [item] = readSetAsideItems(
      { set_aside_items: [{ reason: "below_floor", id: "x", title: "T", urls: ["https://a.test/1", "https://a.test/1", "https://b.test/2"] }] },
      ["below_floor"],
    );
    expect(item.urls).toEqual(["https://a.test/1", "https://b.test/2"]);
  });
});
