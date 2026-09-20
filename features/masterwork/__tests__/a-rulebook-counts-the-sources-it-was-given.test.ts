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

//
// ## The second defect this holds closed (cold walk 13, N4 — 2026-09-20)
//
// `attached + kept` was the wrong operation. The two stores OVERLAP: every
// file the dump lane reads gets a `distillation_source` edge AND a
// `platform.masterwork_source` row. Rulebook 2fba365b-831a-4cb8-a1bb-51eab3889edc
// — one interview, five uploads, one email thread, seven real sources — read
// "Resources 12" and "7 sources are already here — besides the 5 attached
// below", where four of the seven WERE four of the five. `tallyOf` now unions
// by the identity `aidream/services/distillation/source_identity.py` gives
// each source, so the D7 case (nothing attached, 50 kept) and the N4 case
// (five things attached that are also five things kept) are both right.

import { tallyOf, attachedIdentities } from "../sourceLinks";
import { entityIdentity, isInterviewMaterial, urlIdentity } from "../sourceIdentity";

/** One kept row, as `listKeptSourcesBrief` returns it. */
const keptRow = (source_key: string, approach_key = "dump") => ({
  source_key,
  approach_key,
});

/** The five uploads, the interview and the thread, exactly as they are live. */
const WALK_13_KEPT = [
  keptRow("interview:c7a89414-b909-4b9e-bac2-673631549f38", "interview"),
  keptRow("file:258d34cd-1f6b-4796-83bc-49aa55997c0a"),
  keptRow("file:ca665e3c-dce8-4370-bac8-d97038530722"),
  keptRow("file:f0e86b32-6f4b-4af6-9399-c8a1537b9262"),
  keptRow("file:2ee06aa4-d08c-4f77-ba6f-585352f33eed"),
  keptRow("file:899ec6a5-b26e-4273-b7c1-7e3fbee38afc"),
  keptRow("thread:thread-7d25c39285e1935e", "shadow_inbox"),
];

const WALK_13_ATTACHED = [
  "258d34cd-1f6b-4796-83bc-49aa55997c0a",
  "ca665e3c-dce8-4370-bac8-d97038530722",
  "f0e86b32-6f4b-4af6-9399-c8a1537b9262",
  "2ee06aa4-d08c-4f77-ba6f-585352f33eed",
  "899ec6a5-b26e-4273-b7c1-7e3fbee38afc",
].map((id) => ({ token: "file", resourceId: id }));

const fifty = Array.from({ length: 50 }, (_, i) => keptRow(`thread:mail-${i}`, "export"));

describe("the one definition of a Rulebook's sources", () => {
  it("counts a Rulebook that was GIVEN 50 sources and had nothing attached", () => {
    // The exact shape of the walk that found D7: rulebook
    // 245eabcb-313f-4827-8c43-ef645eaefe10, 50 masterwork_source rows,
    // 0 distillation_source edges, 0 staged URLs.
    const { count, tally } = tallyOf([], fifty, 50);
    expect(count).toBe(50);
    expect(tally.kept).toBe(50);
    expect(tally.attached).toBe(0);
  });

  it("opens the ingest gate for a Rulebook whose sources are all kept", () => {
    // The gate's condition, verbatim from RulebookSourcesPanel: totalSources === 0.
    expect(tallyOf([], fifty, 50).count === 0).toBe(false);
  });

  it("still counts attachments when nothing has been kept yet", () => {
    const attached = attachedIdentities({
      sourceLinks: WALK_13_ATTACHED.slice(0, 3),
      stagedUrls: [],
    });
    const { count, tally } = tallyOf(attached, [], 0);
    expect(count).toBe(3);
    expect(tally.attached).toBe(3);
  });

  it("adds two DIFFERENT sets rather than preferring either", () => {
    const attached = attachedIdentities({
      sourceLinks: [
        { token: "note", resourceId: "n-1" },
        { token: "note", resourceId: "n-2" },
        { token: "note", resourceId: "n-3" },
      ],
      stagedUrls: [],
    });
    const { count, tally } = tallyOf(attached, fifty, 50);
    expect(count).toBe(53);
    expect(tally).toEqual({
      attached: 3,
      kept: 50,
      total: 53,
      countedOnce: 0,
    });
  });

  it("is empty only when BOTH are empty", () => {
    expect(tallyOf([], [], 0).count).toBe(0);
  });

  it("never reports a total smaller than either part", () => {
    for (const [attachedCount, keptCount] of [
      [0, 1],
      [1, 0],
      [7, 400],
      [400, 7],
    ] as const) {
      const attached = attachedIdentities({
        sourceLinks: Array.from({ length: attachedCount }, (_, i) => ({
          token: "note",
          resourceId: `a-${i}`,
        })),
        stagedUrls: [],
      });
      const rows = Array.from({ length: keptCount }, (_, i) => keptRow(`thread:k-${i}`));
      const { count } = tallyOf(attached, rows, keptCount);
      expect(count).toBeGreaterThanOrEqual(Math.max(attachedCount, keptCount));
    }
  });
});

describe("one source is counted once, whichever door named it (N4)", () => {
  it("does not turn five uploads and two captures into twelve", () => {
    // RED before the fix: 5 attached + 7 kept = 12, the number on the screen.
    const attached = attachedIdentities({
      sourceLinks: WALK_13_ATTACHED,
      stagedUrls: [],
    });
    const { count, tally } = tallyOf(attached, WALK_13_KEPT, WALK_13_KEPT.length);
    expect(count).toBe(7);
    expect(tally.countedOnce).toBe(5);
  });

  it("gives a dumped file the same identity from either store", () => {
    // `entity_source_key` collapses the "file" token; the kept row's
    // `source_key` is already `file:<id>`. They must be the same string.
    expect(entityIdentity("file", "f-1")).toBe("file:f-1");
    expect(entityIdentity("note", "n-1")).toBe("entity:note:n-1");
  });

  it("treats one URL staged and kept as one source", () => {
    const attached = attachedIdentities({
      sourceLinks: [],
      stagedUrls: [{ url: "https://EXAMPLE.com/a/" }],
    });
    const { count } = tallyOf(attached, [keptRow("url:https://example.com/a")], 1);
    expect(count).toBe(1);
  });

  it("counts kept rows beyond the page it holds rather than losing them", () => {
    // The screen reads one page; the server's exact count is larger. Those
    // rows cannot be compared to anything, so they are counted as themselves.
    const { count } = tallyOf([], fifty, 4000);
    expect(count).toBe(4000);
  });

  it("knows an interview's raw material belongs to the Interviews block", () => {
    expect(isInterviewMaterial(WALK_13_KEPT[0])).toBe(true);
    expect(isInterviewMaterial(WALK_13_KEPT[1])).toBe(false);
  });

  it("does not list one interview twice with two word counts", () => {
    // The Resources block counts what it owns: everything but the interview.
    const resources = WALK_13_KEPT.filter((r) => !isInterviewMaterial(r));
    const attached = attachedIdentities({
      sourceLinks: WALK_13_ATTACHED,
      stagedUrls: [],
    });
    const { count } = tallyOf(attached, resources, resources.length);
    expect(count).toBe(6);
  });

  it("normalises a URL the way the server does, and no further", () => {
    expect(urlIdentity("https://EXAMPLE.com/a/")).toBe("url:https://example.com/a");
    // A query string is a different page of a book, never a cosmetic variant.
    expect(urlIdentity("https://example.com/a?page=2")).not.toBe(
      urlIdentity("https://example.com/a"),
    );
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
