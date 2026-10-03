/**
 * ATTACH DOORS COME FROM ONE LIST (Arman, 2026-10-03: "a single menu … any
 * slight changes will just be with props from the one menu").
 *
 * A host of the attach menu (any file that imports the picker's item list or
 * the menu itself) never spells its own door: no `{ view: "notes", label:
 * "Notes" }` table beside the canonical one. Labels, icons and tints come from
 * `resource-picker-menu-items.tsx`; a host narrows with `allowedViewIds` or
 * picks items by id. The composer's + menu once carried exactly such a table
 * (WORKSPACE_ROWS with hand-typed labels) — the self-test below is that shape.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flattenResourcePickerItems } from "../resource-picker-menu-items";

const ROOT = join(__dirname, "../../../..");
const VIEW_IDS = flattenResourcePickerItems().map((item) => item.id);
const HOST_IMPORT =
  /resource-picker\/(resource-picker-menu-items|ResourcePickerMenu|ResourcePickerTiles)["']/;
// One object literal (single- or multi-line) naming a door id AND a label.
const LOCAL_DOOR = new RegExp(
  `\\{[^{}]*\\b(view|id):\\s*["'](${VIEW_IDS.join("|")})["'][^{}]*\\blabel:\\s*["'\`]`,
  "g",
);

/** The local door literals in one host file, as "line: text". */
export function localDoors(source: string): string[] {
  if (!HOST_IMPORT.test(source)) return [];
  return [...source.matchAll(LOCAL_DOOR)].map((m) => {
    const line = source.slice(0, m.index).split("\n").length;
    return `${line}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`;
  });
}

describe("attach doors come from one list", () => {
  it("self-test: the old hand-typed workspace table is caught", () => {
    const old = [
      'import type { ResourcePickerViewId } from "@host/features/resource-manager/resource-picker/resource-picker-menu-items";',
      'const WORKSPACE_ROWS = [',
      '  { view: "notes", label: "Notes" },',
      '];',
    ].join("\n");
    expect(localDoors(old)).toHaveLength(1);
    // Written across lines, it is still one door.
    const multi = old.replace('{ view: "notes", label: "Notes" }', '{\n    view: "notes",\n    label: "Notes",\n  }');
    expect(localDoors(multi)).toHaveLength(1);
    // The same literal in a file that does not host the menu is not a door.
    expect(localDoors('const tabs = [{ id: "notes", label: "Notes" }];')).toEqual([]);
  });

  it("no host of the attach menu spells its own doors", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "--", "*.ts", "*.tsx"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
      .split("\n")
      .filter(
        (f) =>
          f &&
          !f.includes("__tests__") &&
          !f.startsWith("features/resource-manager/resource-picker/") &&
          !f.startsWith("work/"),
      );
    const offenders: string[] = [];
    for (const file of files) {
      let source: string;
      try {
        source = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      for (const hit of localDoors(source)) offenders.push(`${file}:${hit}`);
    }
    expect(offenders).toEqual([]);
  });
});
