/**
 * G1 (source half) — NO SECOND TABLE ACTION LIST (lane TABLE-ACTIONS, v6 lane 1).
 *
 * The renderers are held to the registry by `one-table-action-list-every-renderer-draws-the-same`.
 * This scan holds the SOURCE of the places that draw a record-store table: a file there that
 * defines its own list of table actions is the drift the registry (`tableActions` in
 * @ai-matrx/records-ui) replaced. A file is a table action list when it declares a table-menu name,
 * or carries three or more of the registry's verb labels as literals. Other objects' menus (agents,
 * files, topics) use the same verbs on purpose, so the scan covers only the table-owning trees.
 *
 * THE BASELINE ONLY SHRINKS — and is empty since 2026-10-03 (the Sheet's table section went onto
 * the registry). Any list here is named below (records-ui scans its own
 * `TABLE_MENU`); a new file fails, and a baseline file that no longer matches fails too, so whoever
 * moves it onto the registry deletes its line.
 *
 * RED, proven 2026-10-02: a planted `features/unified-data/home/zz-planted-menu.ts` with Rename… /
 * Share… / Export… failed "a new file"; removed, green.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Where a record-store table is drawn. */
const TABLE_TREES = [
  "features/unified-data",
  "features/data-tables",
  "components/user-generated-table-data",
  "app/(core)/data",
];

/** The registry's renderers in this app — the lawful home of table actions. */
const REGISTRY = new Set([
  "features/unified-data/actions/tableActionAdapters.ts",
  "features/unified-data/actions/tableMenuExtensions.ts",
]);

/** Today's lists outside the registry. Delete a line when its list moves onto the registry. */
const BASELINE: string[] = [];

const TABLE_MENU_NAME =
  /\b(?:const|let|var|function)\s+(TABLE_[A-Z_]*MENU[A-Z_]*|build\w*Table\w*MenuSections?|dataHome\w*RowActions|\w*[Tt]ableMenu(?:Entries|Items|Sections?)?)\b/;

const VERB_LABELS = new Set([
  "Open in new tab",
  "Copy link",
  "Rename…",
  "Duplicate",
  "Move to…",
  "Share…",
  "Export…",
  "Export",
  "Export this table…",
  "Import…",
  "Import",
  "Settings",
  "History",
  "Add column",
  "Forms",
  "Bookings",
  "Checklists",
  "Notifications",
  "Portals",
  "Dashboards",
  "Archived",
  "Archived records",
  "Archive table",
]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function isTableActionList(source: string): boolean {
  if (TABLE_MENU_NAME.test(source)) return true;
  const labels = new Set(
    [...source.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]!).filter((l) => VERB_LABELS.has(l)),
  );
  return labels.size >= 3;
}

it("no file where a table is drawn defines its own table action list, and the baseline only shrinks", () => {
  const found = TABLE_TREES.flatMap((tree) => sources(join(ROOT, tree)))
    .map((path) => relative(ROOT, path))
    .filter((file) => !REGISTRY.has(file))
    .filter((file) => isTableActionList(readFileSync(join(ROOT, file), "utf8")))
    .sort();
  expect({ "a new file": found.filter((f) => !BASELINE.includes(f)) }).toEqual({ "a new file": [] });
  expect({
    "moved onto the registry — delete its baseline line": BASELINE.filter((f) => !found.includes(f)),
  }).toEqual({ "moved onto the registry — delete its baseline line": [] });
});

it("the scan can see a list", () => {
  expect(isTableActionList(`const m = [{ label: "Rename…" }, { label: "Share…" }, { label: "Export…" }];`)).toBe(true);
  expect(isTableActionList(`const m = [{ label: "Rename…" }, { label: "Share…" }];`)).toBe(false);
});
