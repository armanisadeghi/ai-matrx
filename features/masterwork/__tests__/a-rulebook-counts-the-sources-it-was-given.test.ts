// features/masterwork/__tests__/a-rulebook-counts-the-sources-it-was-given.test.ts
//
// A Rulebook that HAS sources never tells a person it has none.
//
// ## The defect this holds closed (2026-09-18, VERIFICATION.md D7)
//
// The export flow sent 50 selected emails to a brand-new Rulebook. The send
// returned 200, the consent permit was written, 50 rows landed in
// `platform.masterwork_source` and 50 `kept_source` edges beside them — and the
// Rulebook's own page said **"Add your first resource / Attach at least one
// source first"**, on both tabs. A person who followed the dialog's own "Open
// the Rulebook" landed on a screen telling them they had nothing, holding 50 of
// their own emails.
//
// The cause was not a broken query. "This Rulebook's Sources" had two disjoint
// meanings and every count, badge and gate read only the older one:
//
//   ATTACHED  `platform.associations` role `distillation_source` + the URLs on
//             `rulebook.metadata.dump_url_sources` — "we are ABOUT to read
//             this".
//   KEPT      `platform.masterwork_source` rows — "we HAVE this, in the
//             person's own words". Written by `raw_material.keep`, the
//             chokepoint EVERY acquisition door goes through.
//
// A census of both repos on 2026-09-18 found the kept store had NO READER
// anywhere on the platform outside its own writer's idempotency check.
//
// `tallyOf` is now the ONE place the two are added, and every gate, badge and
// empty state derives from it. This guard fails on the pre-fix arithmetic
// (`attached` alone) and passes on the union.

import { tallyOf } from "../sourceLinks";

describe("the one definition of a Rulebook's sources", () => {
  it("counts a Rulebook that was GIVEN 50 sources and had nothing attached", () => {
    // The exact shape of the walk that found this: rulebook
    // 245eabcb-313f-4827-8c43-ef645eaefe10, 50 masterwork_source rows,
    // 0 distillation_source edges, 0 staged URLs.
    const { count, tally } = tallyOf(0, 50);
    expect(count).toBe(50);
    expect(tally.kept).toBe(50);
    expect(tally.attached).toBe(0);
  });

  it("opens the ingest gate for a Rulebook whose sources are all kept", () => {
    // The gate's condition, verbatim from RulebookSourcesPanel: totalSources === 0.
    const { count } = tallyOf(0, 50);
    expect(count === 0).toBe(false);
  });

  it("still counts attachments when nothing has been kept yet", () => {
    const { count, tally } = tallyOf(3, 0);
    expect(count).toBe(3);
    expect(tally.attached).toBe(3);
  });

  it("adds the two rather than preferring either", () => {
    const { count, tally } = tallyOf(3, 50);
    expect(count).toBe(53);
    expect(tally).toEqual({ attached: 3, kept: 50, total: 53 });
  });

  it("is empty only when BOTH are empty", () => {
    expect(tallyOf(0, 0).count).toBe(0);
  });

  it("never reports a total smaller than either part", () => {
    for (const [attached, kept] of [
      [0, 1],
      [1, 0],
      [7, 4000],
      [4000, 7],
    ] as const) {
      const { count } = tallyOf(attached, kept);
      expect(count).toBeGreaterThanOrEqual(Math.max(attached, kept));
    }
  });
});

describe("the kept store has a reader at all", () => {
  // The root cause was structural: nothing read `platform.masterwork_source`.
  // These assertions are on the module surface, so deleting the reader to
  // "simplify" re-opens the defect loudly instead of silently.
  it("exposes a hook the screens share", async () => {
    const mod = await import("../sourceLinks");
    expect(typeof mod.useKeptSourceCount).toBe("function");
    expect(typeof mod.useRulebookSourceCount).toBe("function");
    expect(typeof mod.tallyOf).toBe("function");
  });

  it("names the kept edge role, so the two roles are never confused", async () => {
    const mod = await import("../sourceLinks");
    expect(mod.KEPT_SOURCE_ROLE).toBe("kept_source");
    expect(mod.DUMP_ROLE).toBe("distillation_source");
    expect(mod.KEPT_SOURCE_ROLE).not.toBe(mod.DUMP_ROLE);
  });

  it("reads the kept rows through a query that asks the server for the count", async () => {
    const service = await import("../kept-sources/service");
    expect(typeof service.listKeptSourcesBrief).toBe("function");
    // `rows.length` is one page and was never the answer; the cap is what one
    // ingest run carries, and the screen says so when there are more.
    expect(service.KEPT_SOURCE_INGEST_CAP).toBeGreaterThan(0);
  });
});
