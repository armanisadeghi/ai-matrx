/**
 * check-udt-label-census — W0 of OLD-TABLES-CUTOVER rev 2. THE CENSUS BECOMES A GUARD.
 *
 * WHAT IT COUNTS, AND WHY THE NUMBER IS LIVE-ONLY
 * -----------------------------------------------
 * The older user-data estate (`workbench.udt_*`) has no physical columns: a row is one
 * jsonb document in `udt_dataset_rows.data`, and a column is a row in
 * `udt_dataset_fields` whose `metadata.format.id` says how the cell is read. Two of
 * those formats store a LABEL rather than an identifier — `choice` and `multi_choice` —
 * and they are the whole population the `relation` field type has to coexist with.
 *
 * The plan's claim is that this is a feature addition with a rounding error of data
 * attached, and the whole eight-wave design rests on that claim staying true. So the
 * claim is a guard:
 *
 *     13 live label columns · 208 `choice` cells · 136 `multi_choice` cells · 2 off-list
 *
 * with the including-archived scope (17 / 232 / 144 / 2) PRINTED BESIDE IT, never
 * asserted. Rev 1 of the plan asserted the archived-inclusive number, which counted a
 * second, archived copy of `Example: Project Tracker` — a guard that would have gone red
 * the moment anybody restored or purged an archived dataset, an event that changes
 * nothing about the live estate this campaign touches. `--self-test` arm B proves
 * exactly that difference by purging the archived copy inside a rolled-back transaction
 * and watching the live numbers stand still while the archived-inclusive numbers move.
 *
 * "Off-list" is a `choice`/`multi_choice` cell holding a value that is not on its own
 * column's list — legal, because `allowOther` is true on all thirteen, and the reason
 * shape B (rewrite the cells in place) has nowhere to put two of them. There are two,
 * one inline and one from a shared list; `multi_choice` has none.
 *
 * WHAT IT IS NOT. It is not a migration and it writes nothing: the census runs as four
 * SELECTs. `--self-test` opens an explicit transaction, plants, asserts, and ROLLS BACK
 * on every exit path; nothing it creates survives the process.
 *
 * USAGE
 * -----
 *   pnpm check:udt-label-census              the census, against the main database
 *   pnpm check:udt-label-census:self-test    RED twin, two arms, rolled back
 *   pnpm check:udt-label-census --json       the four live numbers as JSON
 *
 * Exit codes: 0 the census matches - 1 it drifted (every drifted column is NAMED) -
 * 2 an unexpected error. Credentials absent is exit 2 with the remedy, never a silent 0:
 * a census guard that passes because it could not connect is the failure it exists to
 * prevent.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const JSON_OUT = process.argv.includes("--json");
const SELF_TEST = process.argv.includes("--self-test");

const C = {
  reset: "[0m",
  bold: "[1m",
  red: "[31m",
  green: "[32m",
  amber: "[33m",
  dim: "[2m",
} as const;

/** The live estate, measured on the main database 2026-09-22 and ratified as W0's gate. */
const EXPECTED = {
  labelColumns: 13,
  choiceCells: 208,
  multiChoiceCells: 136,
  offList: 2,
} as const;

/**
 * The including-archived scope, PRINTED and never asserted (see the header). Recorded so
 * a drift in either scope is legible side by side instead of being invisible.
 */
const ARCHIVED_SCOPE_AT_RATIFICATION = {
  labelColumns: 17,
  choiceCells: 232,
  multiChoiceCells: 144,
  offList: 2,
} as const;

interface Scope {
  labelColumns: number;
  choiceCells: number;
  multiChoiceCells: number;
  offList: number;
}

interface ColumnRow {
  live: boolean;
  table_name: string;
  field_name: string;
  fmt: string;
  filled: number;
}

interface OffListRow {
  live: boolean;
  table_name: string;
  field_name: string;
  fmt: string;
  value: string;
  cells: number;
}

/**
 * ONE query for the columns and their filled-cell counts, in both scopes at once.
 *
 * "Filled" is deliberately not `is not null`: a cleared `choice` cell can survive in the
 * document as `""`, and a cleared `multi_choice` cell as `[]`. Either would inflate the
 * population the plan sized, so both are excluded and the exclusion is part of the gate.
 */
const COLUMNS_SQL = `
with fld as (
  select f.id, f.table_id, f.field_name, d.table_name,
         f.metadata->'format'->>'id' as fmt,
         (d.deleted_at is null) as live
  from workbench.udt_dataset_fields f
  join workbench.udt_datasets d on d.id = f.table_id
  where f.deleted_at is null
    and f.metadata->'format'->>'id' in ('choice','multi_choice')
)
select fld.live, fld.table_name, fld.field_name, fld.fmt,
       count(r.id) filter (
         where r.data ? fld.field_name
           and jsonb_typeof(r.data->fld.field_name) <> 'null'
           and (jsonb_typeof(r.data->fld.field_name) <> 'string' or (r.data->>fld.field_name) <> '')
           and (jsonb_typeof(r.data->fld.field_name) <> 'array' or jsonb_array_length(r.data->fld.field_name) > 0)
       )::int as filled
from fld
left join workbench.udt_dataset_rows r
       on r.table_id = fld.table_id and r.deleted_at is null
group by 1,2,3,4
order by 1 desc, 2, 3`;

/**
 * The off-list population: a stored value that is on neither the column's inline choices
 * nor the shared list it binds. `groupFromField` narrows which options a row may OFFER;
 * it never makes a stored value illegal, so the allowed set here is the whole list.
 */
const OFF_LIST_SQL = `
with fld as (
  select f.id, f.table_id, f.field_name, d.table_name,
         f.metadata->'format'->>'id' as fmt,
         (d.deleted_at is null) as live,
         f.metadata->'format'->'options' as opts
  from workbench.udt_dataset_fields f
  join workbench.udt_datasets d on d.id = f.table_id
  where f.deleted_at is null
    and f.metadata->'format'->>'id' in ('choice','multi_choice')
),
allowed as (
  select fld.id,
         array_remove(array(
           select c->>'value' from jsonb_array_elements(coalesce(fld.opts->'choices','[]'::jsonb)) c
           union
           select i.label from workbench.udt_structured_list_items i
             where fld.opts ? 'structuredList'
               and i.list_id = (fld.opts->'structuredList'->>'listId')::uuid
               and i.deleted_at is null
         ), null) as labels
  from fld
),
cells as (
  select fld.live, fld.fmt, fld.table_name, fld.field_name, a.labels,
         case when fld.fmt = 'choice'
              then array[r.data->>fld.field_name]
              else array(select jsonb_array_elements_text(r.data->fld.field_name)) end as vals
  from fld
  join allowed a on a.id = fld.id
  join workbench.udt_dataset_rows r
    on r.table_id = fld.table_id and r.deleted_at is null
  where r.data ? fld.field_name
    and jsonb_typeof(r.data->fld.field_name) <> 'null'
    and (jsonb_typeof(r.data->fld.field_name) <> 'string' or (r.data->>fld.field_name) <> '')
    and (jsonb_typeof(r.data->fld.field_name) <> 'array' or jsonb_array_length(r.data->fld.field_name) > 0)
)
select live, table_name, field_name, fmt, v as value, count(*)::int as cells
from cells, unnest(vals) v
where v is not null and v <> '' and not (v = any(labels))
group by 1,2,3,4,5
order by 1 desc, 2, 3`;

function scopeOf(columns: ColumnRow[], offList: OffListRow[], liveOnly: boolean): Scope {
  const cols = liveOnly ? columns.filter((c) => c.live) : columns;
  const off = liveOnly ? offList.filter((o) => o.live) : offList;
  return {
    labelColumns: cols.length,
    choiceCells: cols.filter((c) => c.fmt === "choice").reduce((n, c) => n + c.filled, 0),
    multiChoiceCells: cols.filter((c) => c.fmt === "multi_choice").reduce((n, c) => n + c.filled, 0),
    offList: off.reduce((n, o) => n + o.cells, 0),
  };
}

function render(scope: Scope): string {
  return (
    `${scope.labelColumns} label columns · ${scope.choiceCells} choice cells · ` +
    `${scope.multiChoiceCells} multi_choice cells · ${scope.offList} off-list`
  );
}

/** Every way a scope differs from what W0 ratified, each one named. */
function drift(scope: Scope, expected: Scope): string[] {
  const out: string[] = [];
  const check = (what: string, got: number, want: number) => {
    if (got !== want) out.push(`${what}: ${got}, expected ${want}`);
  };
  check("live label columns", scope.labelColumns, expected.labelColumns);
  check("filled choice cells", scope.choiceCells, expected.choiceCells);
  check("filled multi_choice cells", scope.multiChoiceCells, expected.multiChoiceCells);
  check("off-list values", scope.offList, expected.offList);
  return out;
}

async function census(client: pgClient): Promise<{ columns: ColumnRow[]; offList: OffListRow[] }> {
  const columns = (await client.query<ColumnRow>(COLUMNS_SQL)).rows;
  const offList = (await client.query<OffListRow>(OFF_LIST_SQL)).rows;
  return { columns, offList };
}

type pgClient = { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>; end: () => Promise<void> };

/**
 * The RED twin, two arms, both inside ONE explicit transaction that is rolled back.
 *
 * Arm A — THE FOURTEENTH LIVE LABEL COLUMN. The real use case: Rincon Plumbing &
 * Drain dispatches service calls and tracks each one's stage. A new live dataset,
 * `Rincon Plumbing — Service Calls`, gets a `job_status` choice column with the stages a
 * dispatcher actually uses, and three calls filled in. The guard must exit non-zero AND
 * NAME that column — a guard that only says "14, expected 13" tells a 3 a.m. builder
 * nothing about which column arrived.
 *
 * Arm B — THE ARCHIVED SCOPE IS NOT THE GATE. `Example: Project Tracker` exists twice:
 * a live copy and an archived one carrying four more label columns. Purging the archived
 * copy is a thing an ordinary cleanup does and it changes nothing about the live estate.
 * The live numbers must NOT move; the archived-inclusive numbers MUST. That second half
 * is what makes the arm a red twin rather than a restatement: a guard written against
 * rev 1's 17/232/144 goes RED on this plant, and this guard stays GREEN.
 */
async function selfTest(client: pgClient): Promise<number> {
  let failures = 0;
  const say = (ok: boolean, line: string) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? `${C.green}RED-TWIN OK${C.reset}` : `${C.red}RED-TWIN FAILED${C.reset}`}  ${line}`);
  };

  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '60s'");

    const baseline = await census(client);
    const baseLive = scopeOf(baseline.columns, baseline.offList, true);
    const baseAll = scopeOf(baseline.columns, baseline.offList, false);
    console.log(`${C.dim}  baseline live      ${render(baseLive)}${C.reset}`);
    console.log(`${C.dim}  baseline incl arch ${render(baseAll)}${C.reset}`);

    // ── Arm A ──────────────────────────────────────────────────────────────────
    // Planted onto a live organization that already owns older tables, because a
    // dataset's organization_id is inherited and FK-checked; the seat is the dataset's
    // own owner so no policy is bypassed and no grant is minted.
    const host = (
      await client.query<{ id: string; organization_id: string; user_id: string; created_by: string }>(
        `select id, organization_id, user_id, created_by
           from workbench.udt_datasets
          where deleted_at is null and template_id is null
          order by created_at limit 1`,
      )
    ).rows[0];
    if (!host) throw new Error("no live non-template dataset to borrow an organization and a seat from");

    const planted = (
      await client.query<{ id: string }>(
        `insert into workbench.udt_datasets
           (table_name, description, user_id, organization_id, created_by, visibility, validation_mode)
         values ('Rincon Plumbing — Service Calls',
                 'Dispatch board for residential drain and water-heater calls.',
                 $1, $2, $1, 'personal', 'permissive')
         returning id`,
        [host.user_id, host.organization_id],
      )
    ).rows[0]!;

    await client.query(
      `insert into workbench.udt_dataset_fields
         (table_id, field_name, display_name, data_type, field_order, user_id, organization_id, created_by, metadata)
       values ($1, 'job_status', 'Job status', 'string', 0, $2, $3, $2, $4::jsonb)`,
      [
        planted.id,
        host.user_id,
        host.organization_id,
        JSON.stringify({
          format: {
            id: "choice",
            options: {
              choices: [
                { value: "Dispatched", color: "blue" },
                { value: "On site", color: "amber" },
                { value: "Parts on order", color: "violet" },
                { value: "Invoiced", color: "green" },
              ],
            },
          },
        }),
      ],
    );
    for (const [address, status] of [
      ["1412 Calle Puente, San Clemente", "On site"],
      ["308 Avenida Del Mar, San Clemente", "Parts on order"],
      ["77 Via Pacifica, Dana Point", "Invoiced"],
    ] as const) {
      await client.query(
        `insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
         values ($1, $2::jsonb, $3, $4, $3)`,
        [planted.id, JSON.stringify({ service_address: address, job_status: status }), host.user_id, host.organization_id],
      );
    }

    const armA = await census(client);
    const armALive = scopeOf(armA.columns, armA.offList, true);
    const armADrift = drift(armALive, EXPECTED);
    const named = armA.columns.some(
      (c) => c.live && c.table_name === "Rincon Plumbing — Service Calls" && c.field_name === "job_status",
    );
    say(
      armADrift.length > 0,
      `arm A — a 14th LIVE label column makes the census drift: ${armADrift.join("; ") || "IT DID NOT"}`,
    );
    say(named, `arm A — the census NAMES "Rincon Plumbing — Service Calls · job_status" rather than only counting it`);

    await client.query("delete from workbench.udt_dataset_rows where table_id = $1", [planted.id]);
    await client.query("delete from workbench.udt_dataset_fields where table_id = $1", [planted.id]);
    await client.query("delete from workbench.udt_datasets where id = $1", [planted.id]);

    // ── Arm B ──────────────────────────────────────────────────────────────────
    const archived = (
      await client.query<{ id: string; table_name: string }>(
        `select d.id, d.table_name
           from workbench.udt_datasets d
           join workbench.udt_dataset_fields f
             on f.table_id = d.id and f.deleted_at is null
            and f.metadata->'format'->>'id' in ('choice','multi_choice')
          where d.deleted_at is not null
          group by 1,2 order by count(*) desc limit 1`,
      )
    ).rows[0];
    if (!archived) throw new Error("no archived dataset carrying a label column — arm B has no subject");

    await client.query("delete from workbench.udt_dataset_rows where table_id = $1", [archived.id]);
    await client.query("delete from workbench.udt_dataset_fields where table_id = $1", [archived.id]);
    await client.query("delete from workbench.udt_datasets where id = $1", [archived.id]);

    const armB = await census(client);
    const armBLive = scopeOf(armB.columns, armB.offList, true);
    const armBAll = scopeOf(armB.columns, armB.offList, false);
    say(
      drift(armBLive, baseLive).length === 0,
      `arm B — purging the archived "${archived.table_name}" leaves the LIVE census standing still: ${render(armBLive)}`,
    );
    say(
      drift(armBAll, ARCHIVED_SCOPE_AT_RATIFICATION).length > 0,
      `arm B — the same purge MOVES the archived-inclusive scope to ${render(armBAll)}, ` +
        `which is what rev 1's 17/232/144 gate asserted — it would have gone RED here`,
    );

    return failures;
  } finally {
    await client.query("rollback").catch(() => {});
  }
}

async function main(): Promise<void> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.red}check:udt-label-census: cannot connect — missing ${env.missing.join(", ")}.${C.reset}\n` +
        `  Looked in: ${env.looked.join(", ")}.\n` +
        `  A census guard that passes because it could not read the estate is the failure it exists to prevent, so this is exit 2.`,
    );
    return exitAfterDrain(2);
  }

  const client = (await connectDirect(env, "check:udt-label-census")) as unknown as pgClient;
  let exitCode = 0;
  try {
    if (SELF_TEST) {
      console.log(`${C.bold}check:udt-label-census --self-test${C.reset} ${C.dim}(one transaction, rolled back)${C.reset}`);
      const failures = await selfTest(client);
      if (failures > 0) {
        console.error(`${C.red}SELF-TEST FAILED: ${failures} arm(s) did not go red. This guard proves nothing.${C.reset}`);
        exitCode = 1;
      } else {
        console.log(`${C.green}SELF-TEST GREEN — both arms behave, and nothing was committed.${C.reset}`);
      }
      return exitAfterDrain(exitCode);
    }

    const { columns, offList } = await census(client);
    const live = scopeOf(columns, offList, true);
    const all = scopeOf(columns, offList, false);

    if (JSON_OUT) {
      console.log(JSON.stringify({ live, includingArchived: all }, null, 2));
      return exitAfterDrain(drift(live, EXPECTED).length === 0 ? 0 : 1);
    }

    console.log(`${C.bold}The older estate's label columns${C.reset} ${C.dim}(${env.from})${C.reset}`);
    for (const c of columns.filter((c) => c.live)) {
      console.log(`  ${c.table_name} · ${c.field_name}  ${C.dim}${c.fmt}, ${c.filled} filled${C.reset}`);
    }
    for (const o of offList.filter((o) => o.live)) {
      console.log(`  ${C.amber}off-list${C.reset} ${o.table_name} · ${o.field_name} = "${o.value}" (${o.cells})`);
    }
    console.log(`\n  ${C.bold}LIVE (the gate)${C.reset}      ${render(live)}`);
    console.log(`  ${C.dim}including archived   ${render(all)} — printed, never asserted${C.reset}`);

    const drifted = drift(live, EXPECTED);
    if (drifted.length === 0) {
      console.log(
        `\n${C.green}GREEN — the older estate is still ${render(EXPECTED)}. ` +
          `OLD-TABLES-CUTOVER's shape-A case holds.${C.reset}`,
      );
    } else {
      console.error(`\n${C.red}DRIFTED from W0's ratified census:${C.reset}`);
      for (const d of drifted) console.error(`  ${C.red}·${C.reset} ${d}`);
      console.error(
        `  ${C.dim}Re-read common-docs/projects/data-doctrine-adoption/v5/OLD-TABLES-CUTOVER.md §1.3 ` +
          `before changing this number: the plan's shape-A case is sized on it.${C.reset}`,
      );
      exitCode = 1;
    }
  } catch (error) {
    console.error(`${C.red}check:udt-label-census: unexpected error — ${(error as Error).message}${C.reset}`);
    exitCode = 2;
  } finally {
    await client.end().catch(() => {});
  }
  exitAfterDrain(exitCode);
}

void main();
