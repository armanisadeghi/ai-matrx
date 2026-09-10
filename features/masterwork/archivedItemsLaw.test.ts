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
import type { Masterwork } from "./types";

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
    { file: "home/service.ts", fn: "fetchMasterworksFor" },
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
    "home/MasterworkHomePage.tsx",
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
    expect(text).toContain(
      "computeMasterworkKpis(activeMasterworks, rulebook.version)",
    );
  });

  it("the Rulebook page's counts and journey read the LIVE half only", () => {
    const text = source("components/detail/RulebookDetailPage.tsx");
    expect(text).toContain(
      "activeMasterworks.filter((m) => !m.understudy).length",
    );
    expect(text).toContain(
      "journeyFactsFromRulebook(rulebook, activeMasterworks)",
    );
  });

  it("the home grid's heading counts the LIVE half only", () => {
    const text = source("home/MasterworkHomePage.tsx");
    expect(text).toContain("`Your Masterworks (${activeMasterworks.length})`");
  });
});
