/**
 * @jest-environment node
 *
 * WHAT AN AGENT ON THE TABLE SCREEN IS TOLD AND MAY WRITE GOES THROUGH THE SEAM
 * (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 rows F15 and F18).
 *
 * The table surface's two write targets (`table_description`, `cell_value`), the scope an agent
 * reads (`buildDataTablesScope`), and the choice editor's value suggestions must reach data
 * ONLY through `features/data-tables/service.ts` — which dispatches by where the table lives —
 * so a moved table's agent writes land in the record store, never its archived older copy. And
 * the words an agent reads (the surface intro and the write-target descriptions) must not name
 * an older door, or an agent on a record-store table is told to use a door that no longer holds
 * its table.
 *
 * Self-test first: the scanner must flag a planted direct RPC, a planted Supabase client and a
 * planted door name, or the tree check means nothing.
 */
import fs from "node:fs";
import path from "node:path";

import { dataTablesManifest } from "@/features/surfaces/manifests/data-tables.manifest";

const ROOT = path.resolve(__dirname, "../../../..");
const SEAM_ONLY = [
  "features/data-tables/hooks/useDataTableWriteHandlers.ts",
  "features/data-tables/agent-context/buildDataTablesScope.ts",
  "lib/field-formats/ChoiceOptionsEditor.tsx",
  "lib/field-formats/FieldFormatPicker.tsx",
];

/** Every way `source` reaches data other than through the seam. */
export function directDataReaches(source: string): string[] {
  const found: string[] = [];
  if (/\.rpc\(/.test(source)) found.push("calls .rpc() directly");
  if (/from\s+["']@\/utils\/supabase\/(client|server)["']/.test(source)) found.push("imports a Supabase client");
  if (/\.from\(\s*["']udt_/.test(source)) found.push("reads a udt_ table directly");
  return found;
}

/** Older door names in words an agent reads. */
export function olderDoorWords(text: string): string[] {
  return [...new Set(text.match(/\budt_[a-z_]+|get_user_table[a-z_]*|get_full_table/g) ?? [])];
}

describe("the table surface writes and reads only through the data seam", () => {
  it("self-test: a planted direct read, client and door name are flagged", () => {
    expect(
      directDataReaches(`import { supabase } from "@/utils/supabase/client";\nawait supabase.rpc("udt_upsert_cell", {});`),
    ).toEqual(["calls .rpc() directly", "imports a Supabase client"]);
    expect(directDataReaches(`import { upsertCell } from "../service";`)).toEqual([]);
    expect(olderDoorWords("lands through udt_upsert_cell and get_full_table")).toEqual(["udt_upsert_cell", "get_full_table"]);
  });

  it.each(SEAM_ONLY)("%s reaches data only through the seam", (rel) => {
    expect(directDataReaches(fs.readFileSync(path.join(ROOT, rel), "utf8"))).toEqual([]);
  });

  it("an agent on the table screen is never told an older door's name", () => {
    const told = [
      dataTablesManifest.intro ?? "",
      ...(dataTablesManifest.writeTargets ?? []).map((t) => `${t.label} ${t.description}`),
    ].join("\n");
    expect(olderDoorWords(told)).toEqual([]);
  });
});
