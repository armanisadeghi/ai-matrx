// features/masterwork/archivedItemsLaw.test.ts
//
// THE ARCHIVED-ITEMS LAW over Masterworks (row F10 of
// ../../../common-docs/projects/archived-items-law/STATUS.md).
//
// Arman, 2026-09-09: "everything should have an archive filter, and the default
// should always hide archived, but seeing archived items should be one or two
// clicks away."
//
// These tests are FORCING FUNCTIONS, not decoration. Each one fails the moment
// somebody removes the thing it names:
//
//   • the archive column leaving `MASTERWORK_SELECT_COLUMNS` (the exact F10
//     defect: a reader that cannot tell an archived system from a live one),
//   • a read losing its default-hide predicate, or hardcoding it so no surface
//     can ever ask for the other half,
//   • the lane frame — the agent's surface scope — quietly starting to hand
//     archived systems to an agent as runnable,
//   • any of the four control surfaces losing its `ArchivedDisclosure`.
//
// The last two families read SOURCE TEXT on purpose. This repo has no React
// testing library, and a test that re-implements the component it is checking
// proves nothing; asserting on the real file is what actually goes red when the
// control is deleted.

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MASTERWORK_SELECT_COLUMNS,
  parseMasterworkRow,
  splitMasterworksByArchive,
  type MasterworkDefinitionRow,
} from "./service";
import {
  computeMasterworkKpis,
  masterworkFreshnessLine,
} from "./components/detail/RulebookKpiStrip";
import { nothingLiveLabel } from "./browse/components/MasterworkBrowseRows";
import { computeJourney, journeyFactsFromRulebook } from "./journey";
import type { Masterwork, Rulebook, RulebookRule } from "./types";

const FEATURE_ROOT = __dirname;

function source(relative: string): string {
  return readFileSync(path.join(FEATURE_ROOT, relative), "utf8");
}

function row(over: Partial<MasterworkDefinitionRow> = {}): MasterworkDefinitionRow {
  return {
    id: "mw-1",
    name: "Strunk Edit Desk",
    description: null,
    metadata: { built_from_rulebook: "rb-1" },
    version: 3,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    visibility: "personal",
    is_archived: false,
    ...over,
  };
}

function masterwork(over: Partial<Masterwork> = {}): Masterwork {
  return { ...parseMasterworkRow(row()), ...over };
}

describe("THE ARCHIVED-ITEMS LAW — the read carries the archive column", () => {
  it("selects is_archived on EVERY Masterwork read", () => {
    // The F10 defect exactly: without this column nothing downstream — no
    // surface, no agent scope — can tell an archived Masterwork from a live one.
    expect(MASTERWORK_SELECT_COLUMNS.split(",")).toContain("is_archived");
  });

  it("projects it onto the Masterwork, defaulting to NOT archived", () => {
    expect(parseMasterworkRow(row({ is_archived: true })).is_archived).toBe(true);
    expect(parseMasterworkRow(row({ is_archived: false })).is_archived).toBe(
      false,
    );
    // A row that somehow arrives without the column is treated as LIVE, never
    // silently archived — hiding something nobody archived is the worse lie.
    expect(
      parseMasterworkRow({
        ...row(),
        is_archived: undefined as unknown as boolean,
      }).is_archived,
    ).toBe(false);
  });
});

describe("splitMasterworksByArchive — the one split every surface uses", () => {
  it("puts archived rows in `archived` and nothing else", () => {
    const live = masterwork({ id: "live" });
    const gone = masterwork({ id: "gone", is_archived: true });
    const { active, archived } = splitMasterworksByArchive([live, gone, live]);
    expect(active.map((m) => m.id)).toEqual(["live", "live"]);
    expect(archived.map((m) => m.id)).toEqual(["gone"]);
  });

  it("preserves the read's order within each half", () => {
    const rows = [
      masterwork({ id: "a" }),
      masterwork({ id: "x", is_archived: true }),
      masterwork({ id: "b" }),
      masterwork({ id: "y", is_archived: true }),
    ];
    const { active, archived } = splitMasterworksByArchive(rows);
    expect(active.map((m) => m.id)).toEqual(["a", "b"]);
    expect(archived.map((m) => m.id)).toEqual(["x", "y"]);
  });

  it("returns two empty halves for an empty list, never undefined", () => {
    expect(splitMasterworksByArchive([])).toEqual({ active: [], archived: [] });
  });
});

describe("THE DEFAULT HIDES — the three Masterwork list reads", () => {
  const READS: Array<{ file: string; fn: string }> = [
    { file: "service.ts", fn: "listMasterworksForRulebook" },
    { file: "service.ts", fn: "listMasterworksForRulebooks" },
  ];

  it.each(READS)(
    "$file · $fn takes includeArchived and defaults it to false",
    ({ file, fn }) => {
      const text = source(file);
      expect(text).toContain(`function ${fn}(`);
      expect(text).toContain("includeArchived = false");
      // Option-driven, never hardcoded: a surface that owns a control must be
      // able to ask for the archived half, or the reveal is impossible.
      expect(text).toContain(
        'if (!includeArchived) query = query.eq("is_archived", false);',
      );
    },
  );

  it("the lane frame reads with the DEFAULT, so no agent scope sees archived", () => {
    // RulebookLaneRoute renders no Masterwork list of its own — it is the
    // agent's surface scope. Asking for archived rows here would hand an agent
    // a retired system as something it can run or rebuild.
    const text = source("components/RulebookLaneRoute.tsx");
    expect(text).toContain("listMasterworksForRulebook(rulebookId)");
    // Every call site, not just one: a second read that opts in would put
    // archived systems back into the scope.
    expect(text).not.toMatch(
      /listMasterworksForRulebook\s*\([^)]*includeArchived/,
    );
  });
});

describe("ONE OR TWO CLICKS — every Masterwork list surface carries the control", () => {
  // The two allowed implementations and no third: `lib/entity-list`'s Archived
  // radio for entity-list-shaped surfaces, `ArchivedDisclosure` for card lists.
  // Both live in `@ai-matrx/design-system` (0.13.0 / 0.14.0), never in this repo.
  // All four of these are card lists.
  const SURFACES = [
    "components/masterworks/MasterworksPage.tsx",
    "components/detail/RulebookDetailPage.tsx",
    "browse/components/MasterworkBrowseCards.tsx",
  ];

  it.each(SURFACES)("%s renders <ArchivedDisclosure>", (file) => {
    const text = source(file);
    // THE ONE control, from the package (design-system 0.14.0). A local
    // re-implementation of it in this repo is what `check:package-twins` fails.
    expect(text).toMatch(
      /import \{[^}]*\bArchivedDisclosure\b[^}]*\} from "@ai-matrx\/design-system"/,
    );
    expect(text).toContain("<ArchivedDisclosure");
  });

  it.each(SURFACES)("%s starts with the disclosure CLOSED", (file) => {
    // `useState(false)` on the open flag is the "default hides" half. A surface
    // that opened by default would satisfy the import check and still break the
    // law.
    const text = source(file);
    expect(text).toMatch(/useState<string \| null>\(null\)|useState\(false\)/);
    expect(text).not.toMatch(/open=\{true\}/);
  });

  it("the Masterworks lane splits before it counts, so the KPIs never lie", () => {
    const text = source("components/masterworks/MasterworksPage.tsx");
    expect(text).toMatch(
      /computeMasterworkKpis\(\s*activeMasterworks,\s*rulebook\.version,/,
    );
  });

  it("the Rulebook page's counts read the LIVE half only", () => {
    const text = source("components/detail/RulebookDetailPage.tsx");
    expect(text).toContain(
      "activeMasterworks.filter((m) => !m.understudy).length",
    );
    expect(text).toMatch(
      /journeyFactsFromRulebook\(\s*rulebook,\s*activeMasterworks,/,
    );
  });

  it("both KPI surfaces hand the ARCHIVED half in for the honesty check", () => {
    // Row F10's repair (2026-09-10): a caption that could claim "never built"
    // must see both halves. Dropping either argument puts the lie back.
    for (const file of [
      "components/masterworks/MasterworksPage.tsx",
      "components/detail/RulebookDetailPage.tsx",
    ]) {
      expect(source(file)).toMatch(
        /computeMasterworkKpis\([\s\S]{0,600}?archivedMasterworks,\s*\)/,
      );
    }
    expect(source("components/detail/RulebookDetailPage.tsx")).toMatch(
      /journeyFactsFromRulebook\([\s\S]{0,400}?archivedMasterworks,\s*\)/,
    );
  });

  it("the browse ROWS view is handed the archived counts it must be honest about", () => {
    // It renders no list, so it carries no control — but "not built yet" is a
    // claim it cannot make from the live half alone.
    const config = source("browse/listConfig.tsx");
    expect(config).toMatch(
      /<MasterworkBrowseRows[\s\S]{0,400}?archivedBy=\{archivedBy\}/,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// A SCREEN NEVER LIES — the all-archived state (row F10 repair, 2026-09-10)
//
// The F10 fix made every COUNT the live half, which is right. The defect an
// independent live review then found is the other half of that same move: a
// CAPTION that infers "never built" from a live-half count. With both Hopkins
// Masterworks archived the Rulebook page printed "No Masterworks built yet."
// and "115 approved rules and no Masterwork yet — the Conductor can build one"
// one line above its own "Archived Masterworks (2)" door.
//
// These tests fail the moment any of those captions goes back to reading the
// live half alone.
// ───────────────────────────────────────────────────────────────────────────

describe("the KPI strip's freshness line", () => {
  const kpis = (over: Partial<ReturnType<typeof computeMasterworkKpis>> = {}) => ({
    built: 0,
    current: 0,
    released: 0,
    currentPct: 0,
    archived: 0,
    ...over,
  });

  it('says "built yet" ONLY when nothing was ever built', () => {
    expect(masterworkFreshnessLine(kpis())).toBe("No Masterworks built yet.");
  });

  it("says how many are archived when every Masterwork is archived", () => {
    // THE ROW-FAILING DEFECT. Never "No Masterworks built yet." while the
    // surface's own disclosure offers two.
    const line = masterworkFreshnessLine(kpis({ archived: 2 }));
    expect(line).toBe("All 2 Masterworks are archived.");
    expect(line).not.toMatch(/yet/);
    expect(masterworkFreshnessLine(kpis({ archived: 1 }))).toBe(
      "All 1 Masterwork is archived.",
    );
  });

  it("keeps saying the LIVE truth when both halves exist", () => {
    expect(
      masterworkFreshnessLine(kpis({ built: 2, current: 2, archived: 3 })),
    ).toBe("Every Masterwork is using the current rules.");
    expect(
      masterworkFreshnessLine(kpis({ built: 2, current: 1, archived: 3 })),
    ).toBe("1 Masterwork needs rebuilding.");
  });
});

describe("computeMasterworkKpis counts the archived half without counting it twice", () => {
  it("keeps every TILE on the live half and exposes archived separately", () => {
    const live = masterwork({ id: "live", rulebook_version: 4 });
    const gone = masterwork({ id: "gone", is_archived: true });
    const goneUnderstudy = masterwork({
      id: "gone-us",
      is_archived: true,
      understudy: true,
    });
    const kpis = computeMasterworkKpis([live], 4, [gone, goneUnderstudy]);
    expect(kpis.built).toBe(1);
    expect(kpis.current).toBe(1);
    // An archived UNDERSTUDY is not one of the Expert's built Masterworks, on
    // either side of the split.
    expect(kpis.archived).toBe(1);
  });

  it("defaults archived to 0 for a caller that has no split", () => {
    expect(computeMasterworkKpis([], 1).archived).toBe(0);
  });
});

describe("the Rulebook header stat (the journey's headline)", () => {
  const rule = (over: Partial<RulebookRule> = {}): RulebookRule =>
    ({
      id: `r-${Math.random()}`,
      text: "Say the thing plainly.",
      status: "approved",
      ...over,
    }) as RulebookRule;

  const rulebook = (approved: number) =>
    ({
      id: "rb-1",
      name: "Scientific Advertising",
      rules: Array.from({ length: approved }, () => rule()),
      metadata: {},
    }) as unknown as Pick<Rulebook, "id" | "name" | "rules" | "metadata">;

  it('says "no Masterwork yet" only when none exists at all', () => {
    const journey = computeJourney(journeyFactsFromRulebook(rulebook(12), []));
    expect(journey.headline).toContain("no Masterwork yet");
  });

  it("names the archived ones instead when all of them are archived", () => {
    // The exact false sentence the live review caught: "115 approved rules and
    // no Masterwork yet — the Conductor can build one" with two archived.
    const journey = computeJourney(
      journeyFactsFromRulebook(rulebook(12), [], [
        masterwork({ id: "a", is_archived: true }),
        masterwork({ id: "b", is_archived: true }),
      ]),
    );
    expect(journey.stage).toBe("conductor_ready");
    expect(journey.headline).not.toMatch(/no Masterwork yet/);
    expect(journey.headline).toContain("all 2 Masterworks are archived");
  });

  it("still fires the move — the Conductor CAN build, it just must not lie", () => {
    const journey = computeJourney(
      journeyFactsFromRulebook(rulebook(12), [], [
        masterwork({ id: "a", is_archived: true }),
      ]),
    );
    expect(journey.moves.map((m) => m.key)).toContain("conductor_ready");
    expect(journey.headline).toContain("all 1 Masterwork is archived");
  });

  it("an archived UNDERSTUDY is not a Masterwork the Expert built", () => {
    const journey = computeJourney(
      journeyFactsFromRulebook(rulebook(12), [], [
        masterwork({ id: "us", is_archived: true, understudy: true }),
      ]),
    );
    expect(journey.headline).toContain("no Masterwork yet");
  });
});

describe("the browse ROWS view — a count-only surface still cannot lie", () => {
  it('says "not built yet" only with nothing archived either', () => {
    expect(nothingLiveLabel(0)).toBe("not built yet");
  });

  it("names the archived ones otherwise", () => {
    expect(nothingLiveLabel(2)).toBe("all 2 archived");
    expect(nothingLiveLabel(2)).not.toMatch(/yet/);
  });
});

describe("the browse CARDS view's empty chip line", () => {
  it("takes an honest label when the live half is empty and archived is not", () => {
    // Source-text, deliberately: the branch lives in JSX and this repo has no
    // React testing library. Deleting the prop puts "Not built into a system
    // yet." back over an "Archived (2)" door.
    const text = source("browse/components/MasterworkBrowseCards.tsx");
    expect(text).toMatch(/emptyLabel=\{[\s\S]{0,300}?archived\.length > 0/);
    expect(text).toMatch(/archived\.length} \$\{archived\.length === 1/);
  });
});

describe("ENCORE — the fourth archive-blind read, closed explicitly", () => {
  // 2026-09-10: F10's census missed `encore/service.ts:59`. It was closed the
  // same day, but a later live check that Encore did NOT surface an
  // archived-and-released Masterwork could not tell a fix from luck: BOTH the
  // predicate AND the select column had to be right, and neither was asserted
  // anywhere. It is asserted here.
  const text = source("encore/service.ts");

  it("releasedBase() EXCLUDES archived Masterworks", () => {
    // Not luck, and not the caller's job: the shelf reader itself refuses
    // them. Delete this line and an archived-then-released Masterwork appears
    // on the Operator's shelf as something to run.
    expect(text).toMatch(
      /function releasedBase\(\)[\s\S]{0,900}?\.eq\("is_archived", false\)/,
    );
  });

  it("declares WHY it excludes instead of revealing — the guard reads this", () => {
    // Encore is the Operator RUN shelf, not a browsable list, so the F9 ruling
    // applies: exempt-and-exclude, with a reason the static guard accepts
    // (12+ characters after the marker).
    expect(text).toMatch(
      /function releasedBase\(\)\s*\{[\s\S]{0,200}?archived-items-law-exempt:\s*.{12,}/,
    );
  });

  it("all three Encore shelves are fed by that ONE read", () => {
    // mine / orgs / public. A shelf that grew its own LIST query would need its
    // own predicate, which is how the fourth blind read happened in the first
    // place. The file's only other `definition` read is the single-record
    // run-page lookup, which the law deliberately does not legislate.
    expect(text).toContain("export async function listEncoreShelves()");
    const reads = text.match(/\.from\("definition"\)[\s\S]{0,600}?;/g) ?? [];
    expect(reads).toHaveLength(2);
    const listReads = reads.filter((read) => !/\.maybeSingle\(\)/.test(read));
    expect(listReads).toHaveLength(1);
    expect(listReads[0]).toContain('.eq("is_archived", false)');
  });
});

describe("HINDSIGHT enrollment pickers — all THREE take the same ruling", () => {
  // The 2026-09-10 re-verify found the workflow picker archive-blind beside
  // the agent and orchestra pickers that had been closed. An enrollment
  // candidate must be LIVE, so archived rows are excluded rather than revealed
  // — and the reason is written where the guard can read it.
  const text = readFileSync(
    path.join(FEATURE_ROOT, "..", "hindsight", "components", "EnrollDialog.tsx"),
    "utf8",
  );

  it("every picker excludes archived rows", () => {
    expect(text.match(/\.eq\("is_archived", false\)/g) ?? []).toHaveLength(3);
  });

  it("every picker carries a reasoned exemption marker", () => {
    expect(
      text.match(/archived-items-law-exempt:\s*.{12,}/g) ?? [],
    ).toHaveLength(3);
  });
});
