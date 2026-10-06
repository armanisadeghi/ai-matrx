/**
 * GUARD — no app code reads `platform.custom_field_definition`.
 *
 * That table is the older twin (0 rows ever, live 2026-10-06). An organization's custom fields on a
 * platform record type live in the custom store, behind `custom.entity_fields` / `entity_field_declare`
 * / `entity_field_update` / `entity_field_retire`, reached through `@ai-matrx/records`. A reader of the
 * twin shows an empty list while the real fields exist, and a writer to it goes nowhere.
 *
 * What is flagged: a PostgREST `.from("custom_field_definition")` (any schema call chain) — i.e. an
 * actual read or write. Mentions in generated types, registries and comments are not reads.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const SCAN_DIRS = ["features", "app", "components", "lib", "utils", "hooks", "actions", "packages"];
const SKIP_DIR = new Set(["node_modules", ".next", "__tests__", "dist", "generated"]);
const READ = /\.from\(\s*["'`]custom_field_definition["'`]/;

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|generated)\./.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
}

export function findReaders(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files);
  return files
    .filter((f) => READ.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
}

describe("no app code reads platform.custom_field_definition", () => {
  it("has no reader or writer of the older twin", () => {
    expect(findReaders()).toEqual([]);
  });

  it("the detector can fail: it flags the shape that was in service.ts", () => {
    expect(READ.test(`supabase.schema("platform").from("custom_field_definition").select("id")`)).toBe(true);
    expect(READ.test(`.from("custom_field_target")`)).toBe(false);
  });
});
