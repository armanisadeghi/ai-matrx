/**
 * Seed generator + drift check for `platform.change_type_default`.
 *
 * The CHANGE_TYPE_CATALOGUE in `catalogue.ts` is the source of truth; the DB
 * table is a mirror so SQL (`platform.resolve_change_handling`) can resolve
 * without app code. This script keeps the two honest:
 *
 *     pnpm tsx features/change-policy/generate-seed.ts          # print idempotent seed SQL
 *     pnpm tsx features/change-policy/generate-seed.ts --check  # diff catalogue vs live DB (exit 1 on drift)
 *
 * Apply the printed SQL via the Supabase MCP (project txzxabzwovsujtloxrus)
 * in the same session you edit the catalogue — a seed that only exists as
 * output has changed nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    CHANGE_TYPE_CATALOGUE,
    DEFAULT_TIMEOUT_MINUTES,
    defaultTimeoutExpiryFor,
    type ChangeTypeDef,
} from "./catalogue";

function sqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function rowValues(row: ChangeTypeDef): string {
    return [
        sqlLiteral(row.key),
        String(row.rowNum),
        String(row.tier),
        sqlLiteral(row.label),
        sqlLiteral(row.description),
        sqlLiteral(row.defaultMode),
        String(DEFAULT_TIMEOUT_MINUTES),
        sqlLiteral(defaultTimeoutExpiryFor(row)),
        row.floorHumanOnly ? "true" : "false",
        sqlLiteral(row.note ?? ""),
    ].join(", ");
}

export function buildSeedSql(): string {
    const values = CHANGE_TYPE_CATALOGUE.map((row) => `  (${rowValues(row)})`).join(",\n");
    return `-- GENERATED from features/change-policy/catalogue.ts — do not hand-edit rows.
-- Idempotent: upserts every catalogue row, then reports (never deletes) strays.
insert into platform.change_type_default
  (change_type_key, row_num, tier, label, description, default_mode,
   default_timeout_minutes, default_timeout_expiry, floor_human_only, note)
values
${values}
on conflict (change_type_key) do update set
  row_num = excluded.row_num,
  tier = excluded.tier,
  label = excluded.label,
  description = excluded.description,
  default_mode = excluded.default_mode,
  default_timeout_minutes = excluded.default_timeout_minutes,
  default_timeout_expiry = excluded.default_timeout_expiry,
  floor_human_only = excluded.floor_human_only,
  note = excluded.note,
  updated_at = now();

do $seed_check$
declare
  v_strays text;
begin
  select string_agg(change_type_key, ', ') into v_strays
  from platform.change_type_default
  where change_type_key not in (${CHANGE_TYPE_CATALOGUE.map((r) => sqlLiteral(r.key)).join(", ")});
  if v_strays is not null then
    raise warning '[change-policy seed] rows in platform.change_type_default but NOT in the catalogue: % — the catalogue is the source of truth; reconcile it (rows are never auto-deleted).', v_strays;
  end if;
end
$seed_check$;
`;
}

// ── Drift check against the live DB ─────────────────────────────────────────

interface LiveRow {
    change_type_key: string;
    row_num: number;
    tier: number;
    label: string;
    description: string;
    default_mode: string;
    default_timeout_minutes: number;
    default_timeout_expiry: string;
    floor_human_only: boolean;
    note: string;
}

function readEnv(name: string): string {
    const direct = process.env[name];
    if (direct) return direct;
    try {
        const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
        const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
        if (match) return match[1].trim().replace(/^"|"$/g, "");
    } catch {
        /* fall through to the loud throw */
    }
    throw new Error(`[change-policy --check] ${name} not set and not found in .env.local`);
}

async function checkDrift(): Promise<void> {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("SUPABASE_SECRET_KEY"));
    const { data, error } = await supabase.schema("platform").from("change_type_default").select("*");
    if (error) throw new Error(`[change-policy --check] read failed: ${error.message}`);
    const live = new Map((data as LiveRow[]).map((r) => [r.change_type_key, r]));

    const problems: string[] = [];
    for (const row of CHANGE_TYPE_CATALOGUE) {
        const db = live.get(row.key);
        if (!db) {
            problems.push(`MISSING in DB: ${row.key} — apply the seed`);
            continue;
        }
        const expected: Omit<LiveRow, "change_type_key"> = {
            row_num: row.rowNum,
            tier: row.tier,
            label: row.label,
            description: row.description,
            default_mode: row.defaultMode,
            default_timeout_minutes: DEFAULT_TIMEOUT_MINUTES,
            default_timeout_expiry: defaultTimeoutExpiryFor(row),
            floor_human_only: row.floorHumanOnly ?? false,
            note: row.note ?? "",
        };
        for (const [field, want] of Object.entries(expected)) {
            const got = db[field as keyof LiveRow];
            if (got !== want) problems.push(`DRIFT ${row.key}.${field}: catalogue=${JSON.stringify(want)} db=${JSON.stringify(got)}`);
        }
        live.delete(row.key);
    }
    for (const key of live.keys()) problems.push(`STRAY in DB (not in catalogue): ${key}`);

    if (problems.length > 0) {
        console.error(`[change-policy --check] ${problems.length} problem(s):`);
        for (const p of problems) console.error(`  - ${p}`);
        console.error("Fix: edit catalogue.ts, re-run the generator, apply the seed via the Supabase MCP.");
        process.exit(1);
    }
    console.log(`[change-policy --check] OK — ${CHANGE_TYPE_CATALOGUE.length} rows match the live DB.`);
}

const isMain = process.argv[1]?.includes("generate-seed");
if (isMain) {
    if (process.argv.includes("--check")) {
        checkDrift().catch((err: unknown) => {
            console.error(err instanceof Error ? err.message : err);
            process.exit(1);
        });
    } else {
        console.log(buildSeedSql());
    }
}
