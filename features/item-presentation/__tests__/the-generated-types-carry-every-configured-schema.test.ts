/**
 * 🚨 A SYNCED TABLE CANNOT HIDE BEHIND A SCHEMA NOBODY GENERATED.
 *
 * THE DEFECT THIS CLOSES (lane F-93, hostile verifier V-22, finding NEW-5).
 * `every-candidate-column-is-a-live-column.test.ts` derives its universe from
 * `types/database.types.ts` — sound — and asserted the synced set was exactly
 * FIVE tables. Live it is SIX: `media.source_library` carries `sync_status` and
 * `external_id`, is an active and LISTED entity, has a working screen at
 * `/libraries/<id>` and holds live rows. It was invisible because the generated
 * file's own universe is a hand-written `--schema` list in `package.json`, and
 * `media` was not in it. Nothing anywhere compared the list to the file, so
 * every type-derived census was green about a table that, as far as the type
 * could tell, did not exist. (`provider` was missing the same way — two more
 * registered entity types.)
 *
 * WHAT THIS GUARD ASSERTS, IN THE ORDER THAT MATTERS:
 *   1. every schema the generator is CONFIGURED to emit is in the committed
 *      generated file — or is declared in `SCHEMAS_AWAITING_REGENERATION` with
 *      the command that clears it;
 *   2. no declaration is stale (a declared schema that HAS landed must go, or it
 *      hides tables that are now visible);
 *   3. the synced tables visible in the generated file are EXACTLY the live
 *      synced tables minus the ones in declared-missing schemas. So the day the
 *      regeneration runs, `media.source_library` appears and this stays green;
 *      and a NEW synced table in a schema we already generate fails by name.
 *
 * It reads the real `package.json` and the real generated file — never a fixture.
 */

import fs from "node:fs";
import path from "node:path";

import {
  LIVE_SYNCED_TABLES,
  SCHEMAS_AWAITING_REGENERATION,
} from "../syncedColumns";

const ROOT = path.join(__dirname, "..", "..", "..");
const GENERATED = path.join(ROOT, "types", "database.types.ts");

/** The `--schema x` flags of the `db-types` script, in order. */
function configuredSchemas(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = pkg.scripts["db-types"];
  if (!script) {
    throw new Error(
      "package.json has no `db-types` script. The generator moved — point this " +
        "guard at it, or the census's universe is unmeasured again.",
    );
  }
  return [...script.matchAll(/--schema ([a-z_0-9]+)/g)].map((m) => m[1]);
}

/** Top-level schema keys present in the generated `Database` type. */
function generatedSchemas(): Set<string> {
  const out = new Set<string>();
  for (const line of fs.readFileSync(GENERATED, "utf8").split("\n")) {
    const match = /^  ([a-z_0-9]+): \{$/.exec(line);
    if (match) out.add(match[1]);
  }
  return out;
}

/** `schema.table` for every generated table whose `Row` declares `sync_status`. */
function generatedSyncedTables(): string[] {
  const lines = fs.readFileSync(GENERATED, "utf8").split("\n");
  const found: string[] = [];
  let schema: string | null = null;
  let table: string | null = null;
  let inRow = false;
  for (const line of lines) {
    const schemaMatch = /^  ([a-z_0-9]+): \{$/.exec(line);
    if (schemaMatch) {
      schema = schemaMatch[1];
      table = null;
      inRow = false;
      continue;
    }
    const tableMatch = /^      ([a-zA-Z_0-9]+): \{$/.exec(line);
    if (tableMatch) {
      table = tableMatch[1];
      inRow = false;
      continue;
    }
    if (line === "        Row: {") {
      inRow = true;
      continue;
    }
    if (inRow && line === "        }") {
      inRow = false;
      continue;
    }
    if (!inRow || !schema || !table) continue;
    if (/^          sync_status\??: /.test(line)) found.push(`${schema}.${table}`);
  }
  return [...new Set(found)].sort();
}

const CONFIGURED = configuredSchemas();
const GENERATED_SCHEMAS = generatedSchemas();
const DECLARED_MISSING = Object.keys(SCHEMAS_AWAITING_REGENERATION);

describe("the parse this guard depends on", () => {
  it("finds the generator's schema list and the generated schemas", () => {
    expect(CONFIGURED.length).toBeGreaterThan(40);
    expect(GENERATED_SCHEMAS.size).toBeGreaterThan(40);
    expect(CONFIGURED).toContain("public");
    expect(GENERATED_SCHEMAS.has("public")).toBe(true);
  });
});

describe("every schema the generator is configured to emit is in the committed types", () => {
  for (const schema of CONFIGURED) {
    it(`--schema ${schema}`, () => {
      const present = GENERATED_SCHEMAS.has(schema);
      const declared = schema in SCHEMAS_AWAITING_REGENERATION;
      if (!present && !declared) {
        throw new Error(
          `\`${schema}\` is in the \`db-types\` --schema list and is NOT in ` +
            "types/database.types.ts, so every census that derives its universe " +
            "from the generated types is silently blind to that schema's tables " +
            "(this is exactly how the sixth synced table, `media.source_library`, " +
            "stayed invisible). Remedy: run `pnpm db-types` (needs " +
            "SUPABASE_ACCESS_TOKEN) — or, if you cannot, declare the schema in " +
            "SCHEMAS_AWAITING_REGENERATION (features/item-presentation/syncedColumns.ts) " +
            "with what it costs and the command that clears it.",
        );
      }
      expect(`${schema}: ${present || declared}`).toBe(`${schema}: true`);
    });
  }

  it("holds no stale declaration — a schema that landed must lose its entry", () => {
    const landed = DECLARED_MISSING.filter((schema) => GENERATED_SCHEMAS.has(schema));
    expect(landed).toEqual([]);
  });

  it("declares nothing the generator was never asked to emit", () => {
    const unconfigured = DECLARED_MISSING.filter((schema) => !CONFIGURED.includes(schema));
    expect(unconfigured).toEqual([]);
  });

  it("gives every declaration the command that clears it", () => {
    for (const [schema, reason] of Object.entries(SCHEMAS_AWAITING_REGENERATION)) {
      expect(`${schema}: ${reason.includes("pnpm db-types")}`).toBe(`${schema}: true`);
      expect(reason.length).toBeGreaterThan(80);
    }
  });
});

describe("the synced-table census is the live truth minus what is declared missing", () => {
  const visible = LIVE_SYNCED_TABLES.filter(
    (table) => !DECLARED_MISSING.includes(table.slice(0, table.indexOf("."))),
  ).sort();

  it("every live synced table in a generated schema is visible to the census", () => {
    expect(generatedSyncedTables()).toEqual(visible);
  });

  it("names every live synced table the census still cannot see, and why", () => {
    // Not decoration: this is the list a person reads to know what the green
    // guards above are NOT measuring. It was `["media.source_library"]` until the
    // regeneration landed (`30e05dbd80`, 2026-09-18) and is EMPTY now — pinned
    // generically rather than to that one name, so the next schema that has to be
    // declared is covered by this guard on the day it is declared, and a
    // declaration with no reason attached cannot be added silently.
    const hidden = LIVE_SYNCED_TABLES.filter(
      (table) => !visible.includes(table),
    );
    const hiddenSchemas = [...new Set(hidden.map((t) => t.slice(0, t.indexOf("."))))];
    expect(hiddenSchemas.filter((schema) => !DECLARED_MISSING.includes(schema))).toEqual([]);
    for (const schema of hiddenSchemas) {
      expect(SCHEMAS_AWAITING_REGENERATION[schema]).toEqual(expect.any(String));
    }
    // Nothing is hidden today, and the assertion says so by name rather than by
    // an empty loop above that would pass on any list at all.
    expect(hidden).toEqual([]);
  });
});
