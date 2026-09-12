/**
 * mark-server-set-columns-optional.ts
 *
 * Post-processing step of `pnpm db-types`, run after strip-client-excluded-columns.ts.
 *
 * WHY THIS EXISTS (DD-131 slice residue)
 * ---------------------------------------
 * `supabase gen types` marks an Insert-block column optional exactly when the column is
 * NULLABLE or carries a catalog DEFAULT — that is the ONLY mechanism it has, and it is how
 * `created_at` / `created_by` / `version` end up as `col?: type` on `content_ir.kind_instance`
 * today: they are nullable or defaulted.
 *
 * `content_ir.kind_instance.confirmation` is NOT NULL with deliberately NO DDL default
 * (`platform._stamp_actor_tier` stamps it on every INSERT; a table that loses that carrier must
 * refuse the insert outright rather than silently mint a row claiming a person confirmed it — see
 * DD-131 slice 1). The generator therefore emits `confirmation:` as REQUIRED in the Insert type,
 * and every client insert has to pass a literal the trigger throws away just to satisfy the
 * compiler — a fake write path sitting next to the real one (found live in
 * `features/content-ir/studio/instance-service.ts`).
 *
 * The database is right to refuse a default; the GENERATED TYPE is what is wrong. This step
 * corrects the type only, for exactly the columns declared in `server-set-columns.json` — never a
 * blanket "everything optional" pass, and never a DDL change.
 *
 * SCOPE
 * -----
 * Driven by `scripts/server-set-columns.json`, a small `"schema.table": ["column", ...]` map this
 * repo owns (no live registry read — this is a client-type-ergonomics fact, not a security or
 * governance one, so it does not need the DB-round-trip ceremony `strip-client-excluded-columns.ts`
 * pays for `client_excluded_columns`). Only the `Insert` block is touched; `Row` and `Update` keep
 * their generated shape untouched — a `Row` read still reports the column as required-non-null,
 * which is correct: the database really does hand every read a non-null value.
 *
 * Idempotent: a column already marked optional (`col?:`) is left alone, so running this twice (or
 * running it after the column gains a real DDL default some day) produces zero further edits.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Target defaults to the real file, but `pnpm db-types` passes the staging temp file as argv[2]
// so the committed types are never left half-written. See package.json → db-types.
const TYPES_PATH = process.argv[2]
    ? resolve(process.argv[2])
    : join(__dirname, "..", "types", "database.types.ts");

const CONFIG_PATH = join(__dirname, "server-set-columns.json");

function fail(message: string): never {
    console.error(`\n❌ mark-server-set-columns-optional: ${message}\n`);
    process.exit(1);
}

function loadTargets(): Map<string, Set<string>> {
    let raw: Record<string, string[] | string>;
    try {
        raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch (err) {
        fail(`could not read/parse ${CONFIG_PATH} — ${String(err)}`);
    }
    const targets = new Map<string, Set<string>>();
    for (const [key, cols] of Object.entries(raw)) {
        if (key.startsWith("_")) continue; // "_comment" and friends
        if (!Array.isArray(cols)) continue;
        targets.set(key, new Set(cols));
    }
    if (targets.size === 0) {
        fail(`${CONFIG_PATH} declared no server-set columns — nothing to do, which likely means the file is misconfigured (it should never be empty while this step is wired into db-types).`);
    }
    return targets;
}

/**
 * Walk the same strictly-indented grid `strip-client-excluded-columns.ts` walks (schema at 2
 * spaces, section at 4, table at 6, `Row:`/`Insert:`/`Update:` at 8, a column at 10), and inside
 * the `Insert` block ONLY, add `?` to a declared column that is not already optional.
 */
function markOptional(
    source: string,
    targets: Map<string, Set<string>>,
): { out: string; changed: Map<string, number>; alreadyOptional: string[] } {
    const lines = source.split("\n");
    const out: string[] = [];
    const changed = new Map<string, number>();
    const alreadyOptional: string[] = [];

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
        }

        if (block === "Insert" && (section === "Tables" || section === "Views")) {
            const requiredMatch = /^( {10}"?)([A-Za-z_][A-Za-z0-9_]*)("?): (.*)$/.exec(line);
            const optionalMatch = /^ {10}"?([A-Za-z_][A-Za-z0-9_]*)"?\?: /.exec(line);
            const key = `${schema}.${table}`;
            const wanted = targets.get(key);
            if (wanted && optionalMatch && wanted.has(optionalMatch[1])) {
                alreadyOptional.push(`${key}.${optionalMatch[1]}`);
            } else if (wanted && requiredMatch && wanted.has(requiredMatch[2])) {
                const [, indentQuote, name, closeQuote, rest] = requiredMatch;
                out.push(`${indentQuote}${name}${closeQuote}?: ${rest}`);
                changed.set(`${key}.${name}`, (changed.get(`${key}.${name}`) ?? 0) + 1);
                continue;
            }
        }
        out.push(line);
    }
    return { out: out.join("\n"), changed, alreadyOptional };
}

function main() {
    const targets = loadTargets();
    const source = readFileSync(TYPES_PATH, "utf-8");
    const { out, changed, alreadyOptional } = markOptional(source, targets);

    const expected: string[] = [];
    for (const [key, cols] of targets) for (const col of cols) expected.push(`${key}.${col}`);
    const untouched = expected.filter(
        (k) => !changed.has(k) && !alreadyOptional.includes(k),
    );
    if (untouched.length) {
        fail(
            `declared server-set column(s) not found in the Insert type at all — the table/column may ` +
                `have been renamed, or the generator's output shape changed: ${untouched.join(", ")}`,
        );
    }

    writeFileSync(TYPES_PATH, out, "utf-8");

    console.log(
        `✅ Marked ${changed.size} server-set column(s) optional in Insert types: ` +
            `${[...changed.keys()].join(", ") || "(none needed — already optional)"}.`,
    );
    if (alreadyOptional.length) {
        console.log(`   ℹ️  already optional (idempotent no-op): ${alreadyOptional.join(", ")}`);
    }
}

main();
