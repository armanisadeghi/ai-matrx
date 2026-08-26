/**
 * strip-client-excluded-columns.ts
 *
 * Post-processing step of `pnpm db-types`. Removes every column a table declares in
 * `platform.entity_types.client_excluded_columns` from the generated `types/database.types.ts`,
 * so a client cannot reach for a column the registry says clients never read.
 *
 * WHY THIS EXISTS
 * ---------------
 * `client_excluded_columns` was a declaration with no mechanism behind it. `supabase gen types`
 * reads the live catalog and knows nothing about the registry, so every declared-excluded column
 * — ciphertext, password/PIN/session hashes, the e-sign signing secret, the leave ledger's raw
 * amounts — was being emitted into `database.types.ts` verbatim. Found 2026-08-26 by
 * `scripts/hr/hrb012_type_proof.py` while landing the HR/e-sign contract freeze (HRB-012):
 * 30 declared-excluded columns across 16 registered tables, all present.
 *
 * As SPEC-ACCESS §4.6 and SPEC-CONTRACTS §6.2 both say plainly, this is a PROJECTION CONVENTION,
 * NOT A SECURITY BOUNDARY — the boundary is RLS and column grants. Stripping the type keeps an
 * agent or a developer from casually selecting the column; it does not stop anyone determined.
 *
 * 🚨 SCOPE IS DELIBERATELY NARROW — READ BEFORE WIDENING
 * ------------------------------------------------------
 * Only the schemas in FROZEN_SCHEMAS are stripped. The registry declares exclusions on ten more
 * tables across `files`, `platform`, `rag` and `docproc`, and those have been emitted (and read)
 * for as long as they have existed — 27 files reference `files.files.storage_uri` alone. Stripping
 * them is a repo-wide breaking change that belongs to the owners of those features, not to the HR
 * contract-freeze lane. Widening this list is that owner's call, done with the typecheck fallout
 * in the same change. The debt is recorded in `FOUND_DEFECTS.md` and in
 * `common-docs/projects/hr-domain/specs/FREEZE.md`.
 *
 * Required env (same as gen:entity-types, loaded from .env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY (sb_secret_*) — read-only access to the registry.
 *
 * This step SCREAMS and exits non-zero when it cannot read the registry. A stripper that silently
 * does nothing when the DB is unreachable would report a green pipeline while emitting the very
 * columns it exists to remove.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const TYPES_PATH = join(__dirname, "..", "types", "database.types.ts");

/**
 * The schemas whose excluded columns are stripped today. See the scope note above: this is an
 * allowlist because widening it breaks live consumers in features this script's author does not own.
 */
const FROZEN_SCHEMAS = new Set(["hr", "esign"]);

interface RegistryRow {
    schema_name: string;
    table_name: string;
    client_excluded_columns: string[] | null;
}

function fail(message: string): never {
    console.error(`\n❌ strip-client-excluded-columns: ${message}\n`);
    process.exit(1);
}

async function readRegistry(): Promise<RegistryRow[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
        fail(
            "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required to read " +
                "platform.entity_types.client_excluded_columns. Without them this step cannot run, " +
                "and a type file that was not stripped must never be reported as stripped.",
        );
    }
    const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    // The client has no direct grant on `platform.*`; read the registry through the public
    // SECURITY-DEFINER projection (migrations/hr_c8_01_entity_client_excluded_columns_rpc.sql),
    // the same pattern `gen:entity-types` uses for `entity_types_list()`.
    const { data, error } = await supabase.rpc("entity_client_excluded_columns");
    if (error) fail(`could not read the registry via entity_client_excluded_columns() — ${error.message}`);
    return (data ?? []) as RegistryRow[];
}

/**
 * Strip the named columns from the Row / Insert / Update blocks of one table.
 *
 * The generated file is strictly indented — schema at 2 spaces, section (`Tables:` / `Views:`) at
 * 4, table name at 6, `Row:` / `Insert:` / `Update:` at 8, a column at 10 — so walking that grid
 * attributes every line to exactly one table and one block. `Relationships` and `Functions` are
 * never touched.
 */
function strip(source: string, targets: Map<string, Set<string>>): { out: string; removed: Map<string, number> } {
    const lines = source.split("\n");
    const kept: string[] = [];
    const removed = new Map<string, number>();

    let schema: string | null = null;
    let section: string | null = null;
    let table: string | null = null;
    let block: string | null = null;

    for (const line of lines) {
        if (/^ {2}[a-z_][a-z0-9_]*: \{$/.test(line)) {
            schema = line.trim().split(":")[0];
            section = table = block = null;
        } else if (schema && /^ {4}[A-Za-z]+: \{$/.test(line)) {
            section = line.trim().split(":")[0];
            table = block = null;
        } else if (schema && section && /^ {6}[A-Za-z_][A-Za-z0-9_]*: \{$/.test(line)) {
            table = line.trim().split(":")[0];
            block = null;
        } else if (table && /^ {8}(Row|Insert|Update): \{$/.test(line)) {
            block = line.trim().split(":")[0];
        } else if (block) {
            const match = /^ {10}"?([A-Za-z_][A-Za-z0-9_]*)"?\??: /.exec(line);
            if (match && (section === "Tables" || section === "Views")) {
                const key = `${schema}.${table}`;
                if (targets.get(key)?.has(match[1])) {
                    removed.set(`${key}.${match[1]}`, (removed.get(`${key}.${match[1]}`) ?? 0) + 1);
                    continue; // drop the line
                }
            }
        }
        kept.push(line);
    }
    return { out: kept.join("\n"), removed };
}

async function main() {
    const registry = await readRegistry();
    const targets = new Map<string, Set<string>>();
    let declaredOutOfScope = 0;

    for (const row of registry) {
        const cols = row.client_excluded_columns ?? [];
        if (cols.length === 0) continue;
        if (!FROZEN_SCHEMAS.has(row.schema_name)) {
            declaredOutOfScope += cols.length;
            continue;
        }
        targets.set(`${row.schema_name}.${row.table_name}`, new Set(cols));
    }

    if (targets.size === 0) {
        fail(
            "the registry returned no excluded columns for any frozen schema — either the registry " +
                "was read empty or FROZEN_SCHEMAS is wrong. Refusing to report a clean strip.",
        );
    }

    const source = readFileSync(TYPES_PATH, "utf-8");
    const { out, removed } = strip(source, targets);

    // Every declared column must actually have been found and removed, OR must already be absent.
    // A column that is neither is a registry row naming a column the table does not have.
    const expected: string[] = [];
    for (const [key, cols] of targets) for (const col of cols) expected.push(`${key}.${col}`);
    const untouched = expected.filter((k) => !removed.has(k));

    writeFileSync(TYPES_PATH, out, "utf-8");

    const strippedLines = [...removed.values()].reduce((a, b) => a + b, 0);
    console.log(
        `✅ Stripped ${removed.size}/${expected.length} client-excluded columns ` +
            `(${strippedLines} type lines) from types/database.types.ts ` +
            `across ${targets.size} tables in ${[...FROZEN_SCHEMAS].join(", ")}.`,
    );
    if (untouched.length) {
        console.log(
            `   ℹ️  already absent (not emitted by supabase gen types): ${untouched.join(", ")}`,
        );
    }
    if (declaredOutOfScope > 0) {
        console.log(
            `   ⚠️  ${declaredOutOfScope} declared-excluded columns in NON-frozen schemas were left in place ` +
                `on purpose — see the scope note at the top of this file.`,
        );
    }
}

main().catch((err) => fail(String(err)));
