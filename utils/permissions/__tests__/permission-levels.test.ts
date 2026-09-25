/**
 * THE LADDER GUARD.
 *
 * A permission level that exists in the vocabulary but is missing from a rank
 * map, a label map or an ordered array does not throw — it returns `undefined`,
 * and `undefined >= 2` is `false`. The holder is refused with no message, or
 * the screen renders a blank string where the level should be. That is a law-4
 * violation (nothing fails silently) and it is invisible to every other test.
 *
 * So this suite does not test behaviour for the levels it happens to think of.
 * It enumerates the canonical ladder from ONE place — `PERMISSION_LEVELS` —
 * and asserts every derived structure covers it, including the ladder sites in
 * other files, found by reading their source. Delete a level from
 * `PERMISSION_LEVELS` and this suite goes red; add a fifth level and every
 * structure that forgot it is named here by file.
 */

import fs from "node:fs";
import path from "node:path";

import {
  DB_PERMISSION_LEVELS,
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_LABELS,
  PERMISSION_LEVEL_RANK,
  PERMISSION_LEVEL_SHORT_LABELS,
  isDbPermissionLevel,
  isPermissionLevel,
  parsePermissionLevel,
  permissionLevelRank,
  toDbPermissionLevel,
} from "../levels";
import {
  getPermissionLevelLabel,
  getPermissionLevelsAtOrAbove,
  satisfiesPermissionLevel,
} from "../types";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("the canonical ladder", () => {
  it("carries the four doctrine levels in authority order", () => {
    // AI Matrx Data Doctrine R18 (2026-09-10): viewer · commenter · editor · admin.
    expect([...PERMISSION_LEVELS]).toEqual([
      "viewer",
      "commenter",
      "editor",
      "admin",
    ]);
  });

  it("places commenter at ordinal 2, between viewer and editor", () => {
    expect(PERMISSION_LEVEL_RANK.viewer).toBe(1);
    expect(PERMISSION_LEVEL_RANK.commenter).toBe(2);
    expect(PERMISSION_LEVEL_RANK.editor).toBe(3);
    expect(PERMISSION_LEVEL_RANK.admin).toBe(4);
  });
});

describe("every derived structure covers every level", () => {
  it.each([...PERMISSION_LEVELS])("rank map covers %s", (level) => {
    expect(PERMISSION_LEVEL_RANK[level]).toEqual(expect.any(Number));
    expect(Number.isNaN(PERMISSION_LEVEL_RANK[level])).toBe(false);
  });

  it.each([...PERMISSION_LEVELS])("sentence label covers %s", (level) => {
    expect(PERMISSION_LEVEL_LABELS[level]).toEqual(expect.any(String));
    expect(PERMISSION_LEVEL_LABELS[level].length).toBeGreaterThan(0);
  });

  it.each([...PERMISSION_LEVELS])("noun label covers %s", (level) => {
    expect(PERMISSION_LEVEL_SHORT_LABELS[level]).toEqual(expect.any(String));
    expect(PERMISSION_LEVEL_SHORT_LABELS[level].length).toBeGreaterThan(0);
  });

  it.each([...PERMISSION_LEVELS])(
    "getPermissionLevelLabel never blanks for %s",
    (level) => {
      const label = getPermissionLevelLabel(level);
      expect(label).toEqual(expect.any(String));
      expect(label.trim().length).toBeGreaterThan(0);
      expect(label).not.toContain("Unknown level");
    },
  );

  it("rank map has no duplicate and no missing ordinals", () => {
    const ranks = PERMISSION_LEVELS.map((level) => PERMISSION_LEVEL_RANK[level]);
    expect(new Set(ranks).size).toBe(PERMISSION_LEVELS.length);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(Object.keys(PERMISSION_LEVEL_RANK).sort()).toEqual(
      [...PERMISSION_LEVELS].sort(),
    );
  });

  it("label maps hold exactly the ladder's keys — no extras, no gaps", () => {
    expect(Object.keys(PERMISSION_LEVEL_LABELS).sort()).toEqual(
      [...PERMISSION_LEVELS].sort(),
    );
    expect(Object.keys(PERMISSION_LEVEL_SHORT_LABELS).sort()).toEqual(
      [...PERMISSION_LEVELS].sort(),
    );
  });

  it("getPermissionLevelsAtOrAbove enumerates the whole ladder from the floor", () => {
    expect(getPermissionLevelsAtOrAbove("viewer")).toEqual([
      ...PERMISSION_LEVELS,
    ]);
    expect(getPermissionLevelsAtOrAbove("admin")).toEqual(["admin"]);
    // The slice must be a real suffix of the ladder for EVERY level, so a new
    // level inserted mid-ladder cannot fall out of somebody's at-or-above set.
    for (const level of PERMISSION_LEVELS) {
      const expected = PERMISSION_LEVELS.slice(
        PERMISSION_LEVELS.indexOf(level),
      );
      expect(getPermissionLevelsAtOrAbove(level)).toEqual([...expected]);
    }
  });
});

describe("satisfiesPermissionLevel ranks every pair honestly", () => {
  it("never answers a comparison with a silent false", () => {
    for (const current of PERMISSION_LEVELS) {
      for (const required of PERMISSION_LEVELS) {
        const expected =
          PERMISSION_LEVEL_RANK[current] >= PERMISSION_LEVEL_RANK[required];
        expect(satisfiesPermissionLevel(current, required)).toBe(expected);
      }
    }
  });

  it("puts commenter above viewer and below editor", () => {
    expect(satisfiesPermissionLevel("commenter", "viewer")).toBe(true);
    expect(satisfiesPermissionLevel("commenter", "commenter")).toBe(true);
    expect(satisfiesPermissionLevel("commenter", "editor")).toBe(false);
    expect(satisfiesPermissionLevel("commenter", "admin")).toBe(false);
    expect(satisfiesPermissionLevel("viewer", "commenter")).toBe(false);
    expect(satisfiesPermissionLevel("editor", "commenter")).toBe(true);
    expect(satisfiesPermissionLevel("admin", "commenter")).toBe(true);
  });
});

describe("an unknown level is announced, never swallowed", () => {
  let errors: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    errors = [];
    spy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
  });

  afterEach(() => spy.mockRestore());

  it("parsePermissionLevel names the value and the remedy", () => {
    expect(parsePermissionLevel("superuser", "test")).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("superuser");
    expect(errors[0]).toContain("utils/permissions/levels.ts");
  });

  it("parsePermissionLevel stays quiet for a genuinely absent value", () => {
    expect(parsePermissionLevel(null, "test")).toBeNull();
    expect(parsePermissionLevel(undefined, "test")).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it("permissionLevelRank denies AND reports for an off-ladder level", () => {
    const rank = permissionLevelRank(
      "superuser" as unknown as (typeof PERMISSION_LEVELS)[number],
    );
    expect(Number.isNaN(rank)).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it("recognises every ladder level and nothing else", () => {
    for (const level of PERMISSION_LEVELS) {
      expect(isPermissionLevel(level)).toBe(true);
    }
    expect(isPermissionLevel("superuser")).toBe(false);
    expect(isPermissionLevel(2)).toBe(false);
  });
});

describe("the code ladder is a superset of the database enum", () => {
  it("contains every value the database enum currently holds", () => {
    for (const dbLevel of DB_PERMISSION_LEVELS) {
      expect(PERMISSION_LEVELS).toContain(dbLevel);
    }
  });

  it("refuses to write a level the database cannot store, by name", () => {
    for (const level of PERMISSION_LEVELS) {
      if (isDbPermissionLevel(level)) {
        expect(toDbPermissionLevel(level)).toBe(level);
      } else {
        expect(() => toDbPermissionLevel(level)).toThrow(level);
        expect(() => toDbPermissionLevel(level)).toThrow(
          /ALTER TYPE public\.permission_level ADD VALUE/,
        );
      }
    }
  });
});

/**
 * The census. Every ladder site found in the sweep for `viewer` near `editor`
 * near `admin` across utils/, lib/, features/, app/ and components/. Each one
 * must resolve to the canonical ladder rather than restating it — a restated
 * union is exactly how a level goes missing in one place while the rest of the
 * app moves on.
 */
const CENSUS_SITES = [
  "utils/permissions/types.ts",
  "utils/permissions/orgModeration.ts",
  "utils/permissions/orgResources.ts",
  "features/notes/redux/notes.types.ts",
  "features/messaging/types.ts",
  "features/cx-chat/types/cx-tables.ts",
  "features/public-chat/types/cx-tables.ts",
  "features/access-gate/service/accessRequests.ts",
  "features/access-gate/service/accessDeniedContext.ts",
] as const;

describe("no ladder site restates the level union", () => {
  // Matches a hand-written three-level union or array in any quoting/spacing.
  const RESTATED_UNION =
    /["']viewer["']\s*\|\s*["']editor["']\s*\|\s*["']admin["']/;
  const RESTATED_ARRAY =
    /\[\s*["']viewer["']\s*,\s*["']editor["']\s*,\s*["']admin["']\s*\]/;
  // A hand-written chain that maps anything unrecognised down to viewer.
  const SILENT_DOWNGRADE =
    /===?\s*["']admin["'][\s\S]{0,80}===?\s*["']editor["'][\s\S]{0,80}:\s*["']viewer["']/;

  it.each(CENSUS_SITES)("%s derives its levels", (relativePath) => {
    const source = readRepoFile(relativePath);
    expect(source).not.toMatch(RESTATED_UNION);
    expect(source).not.toMatch(RESTATED_ARRAY);
    expect(source).not.toMatch(SILENT_DOWNGRADE);
    // and it reaches the canonical module, directly or by re-export
    expect(source).toMatch(/permissions\/levels|from "\.\/levels"/);
  });
});

/**
 * The write-side ladders. A picker may only OFFER levels the database can
 * actually store — offering `commenter` today would hand the user a choice
 * whose save fails with `invalid input value for enum public.permission_level`.
 * So these are pinned to `DB_PERMISSION_LEVELS`, not to the code ladder: the
 * day `commenter` is added to the enum and the types regenerated, this test
 * goes red and names the pickers that must gain the option.
 */
const PERMISSION_PICKERS = [
  "features/sharing/components/tabs/ShareWithUserTab.tsx",
  "features/sharing/components/PermissionsList.tsx",
  "features/organizations/components/OrgModuleSettings.tsx",
] as const;

describe("every permission picker offers exactly what the database accepts", () => {
  it.each(PERMISSION_PICKERS)("%s", (relativePath) => {
    const source = readRepoFile(relativePath);
    const offered = new Set<string>();
    for (const match of source.matchAll(/<SelectItem value="([^"]+)"/g)) {
      if (isPermissionLevel(match[1])) offered.add(match[1]);
    }
    expect([...offered].sort()).toEqual([...DB_PERMISSION_LEVELS].sort());
  });
});
