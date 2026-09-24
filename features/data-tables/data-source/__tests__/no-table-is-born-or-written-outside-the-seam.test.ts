/**
 * @jest-environment node
 *
 * THE GUARD THAT KEEPS THE INTEGRATION REPOINT CLOSED (lane INTEG-CLIENTS, CUTOVER-PLAN
 * rev 3 §2 Step 7, the births-and-writes half — and the viewer-host half: a host that mounts
 * the grid by id must locate the table first, through `LocatedTableViewer`).
 *
 * The defect class: a "save this as a table" or "add a row" path outside the grid that
 * reaches the older store's doors itself — `createTable` / `addRow` / `addColumn` /
 * `getTableDetails` imported from `utils/user-table-utls/table-utils`, or one of the
 * pre-grid RPCs called by name. Such a path ignores where the organization's tables live,
 * so a moved organization's new table is born where its screens no longer look, and an
 * append lands in a moved table's archived older copy and reports success. After the flip
 * both paths write into tables nobody can see.
 *
 * Every runtime file in the app is scanned. The only places allowed to reach those doors:
 *   - `features/data-tables/service.ts` — the seam's own older half;
 *   - `utils/user-table-utls/table-utils.ts` — the older doors themselves;
 *   - `components/user-generated-table-data/**` — the /data grid screen (lane GRID-PORT's
 *     rows, repointed with the grid, not here);
 *   - `app/(dev)/**` — dev-only demos (F21, retired with the older store).
 * A new entry in this list needs a reason next to it.
 *
 * It proves itself first: a planted import and a planted RPC call must be flagged, or the
 * scanner is broken and the tree scan means nothing.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const SCAN_DIRS = ["app", "features", "components", "lib", "utils", "hooks", "providers"];

const OLDER_BINDINGS = ["createTable", "addRow", "addColumn", "getTableDetails"];
const OLDER_RPCS = [
  "create_new_user_table_dynamic",
  "create_user_table_with_fields",
  "add_data_row_to_user_table",
  "append_rows_to_user_table",
  "add_column_to_user_table",
  // The older READ doors: a picker or reader that calls one lists or reads a moved table's
  // archived copy (or misses a store table altogether).
  "get_user_tables",
  "get_user_table_complete",
  "get_user_table_data_paginated",
  "get_user_table_data_paginated_v2",
  "get_full_table",
];

const ALLOWED: Array<{ match: (rel: string) => boolean; why: string }> = [
  { match: (r) => r === "features/data-tables/service.ts", why: "the seam's older half" },
  { match: (r) => r === "utils/user-table-utls/table-utils.ts", why: "the older doors themselves" },
  { match: (r) => r.startsWith("components/user-generated-table-data/"), why: "the /data grid screen (GRID-PORT)" },
  { match: (r) => r.startsWith("app/(dev)/"), why: "dev-only demos (F21)" },
  { match: (r) => r === "features/data-tables/components/LocatedTableViewer.tsx", why: "the locating host itself" },
  { match: (r) => r === "features/data-tables/components/SheetLayout.tsx", why: "the /data-v2 Sheet layout places the table itself (GRID-PORT)" },
  { match: (r) => r.startsWith("app/(core)/data/"), why: "the /data route resolves the table's home itself (GRID-PORT)" },
  { match: (r) => r === "features/matrx-envelope/referenceResolvers.ts", why: "its older arm runs only after the record store said the table is not its (F10)" },
];

/** Every way `text` reaches an older birth/write door, as human-readable findings. */
export function olderDoorReaches(text: string): string[] {
  const found: string[] = [];
  const importRe = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*user-table-utls\/table-utils["']/g;
  for (const m of text.matchAll(importRe)) {
    if (m[1]) continue; // `import type { … }` carries no door
    const names = m[2]!
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith("type "))
      .map((n) => n.split(/\s+as\s+/)[0]!.trim());
    for (const n of names) if (OLDER_BINDINGS.includes(n)) found.push(`imports ${n} from table-utils`);
  }
  // Mounting the grid by id without locating the table first reads a moved table's archived
  // older copy: every host outside the table page goes through `LocatedTableViewer`.
  if (
    /import\s+\w+(\s*,\s*\{[^}]*\})?\s+from\s*["'][^"']*user-generated-table-data\/UserTableViewer["']/.test(text) ||
    /import\(\s*["'][^"']*user-generated-table-data\/UserTableViewer["']\s*\)/.test(text)
  ) {
    found.push("mounts UserTableViewer without locating the table (use LocatedTableViewer)");
  }
  for (const rpc of OLDER_RPCS) {
    const call = new RegExp(`\\.rpc\\(\\s*["'\`]${rpc}["'\`]`);
    if (call.test(text)) found.push(`calls .rpc("${rpc}")`);
  }
  return found;
}

function* runtimeFiles(dir: string): Generator<string> {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      yield* runtimeFiles(rel);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield rel;
    }
  }
}

describe("no table is born or written outside the data seam", () => {
  it("the scanner flags a planted older birth and a planted older RPC (self-test)", () => {
    const planted = `
      import {
        createTable,
        type FieldDefinition,
      } from "@/utils/user-table-utls/table-utils";
      await supabase.rpc("add_data_row_to_user_table", { p_table_id: id, p_data: row });
    `;
    expect(olderDoorReaches(planted)).toEqual([
      "imports createTable from table-utils",
      'calls .rpc("add_data_row_to_user_table")',
    ]);
    expect(olderDoorReaches(`import type { TableField } from "@/utils/user-table-utls/table-utils";`)).toEqual([]);
    expect(olderDoorReaches(`import { addTableRow as addRow, createTable } from "@/features/data-tables/service";`)).toEqual([]);
    expect(olderDoorReaches(`import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";`)).toEqual([
      "mounts UserTableViewer without locating the table (use LocatedTableViewer)",
    ]);
    expect(olderDoorReaches(`const V = lazy(() => import("@/components/user-generated-table-data/UserTableViewer"));`)).toHaveLength(1);
    expect(olderDoorReaches(`import LocatedTableViewer from "@/features/data-tables/components/LocatedTableViewer";`)).toEqual([]);
  });

  it("no runtime file outside the allow-list reaches an older birth or write door", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const rel of runtimeFiles(dir)) {
        const posix = rel.split(path.sep).join("/");
        if (ALLOWED.some((a) => a.match(posix))) continue;
        const reaches = olderDoorReaches(fs.readFileSync(path.join(ROOT, rel), "utf8"));
        for (const r of reaches) offenders.push(`${posix}: ${r}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
