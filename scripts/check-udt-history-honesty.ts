#!/usr/bin/env npx tsx
/**
 * UDT HISTORY HONESTY — a value the grid cannot keep goes to row history with
 * its reason, and the history keeps it for at least thirty days.
 *
 * DD-244 / G10 (`common-docs/projects/data-doctrine-adoption/plan/R1-FEATURE-INVENTORY.md`
 * T3/T22/G10). The live data-loss path this gate exists to kill:
 *
 *   - `udt_change_field_type(..., 'cast_or_null')` — the DEFAULT strategy, and the
 *     only one the Table settings dialog ever sends — rewrote an un-castable cell
 *     to `null` and said nothing. Doctrine Rule 3: a Value that does not fit goes
 *     to History WITH THE REASON, and is neither coerced nor deleted.
 *   - `udt_dataset_row_versions_trim()` then deleted anything past the latest two
 *     versions of a row older than **14 days**, hardcoded, on a weekly cron.
 *     Doctrine Rule 10 sets a floor of **30 days**, organization-configurable,
 *     raise-only.
 *
 *   Together: two weeks after a careless type change, the original values were
 *   gone from the platform entirely. Nothing in the product ever said so.
 *
 * WHAT THIS GATE MEASURES — live, on the real functions, never on a mock:
 *
 *   1. The knob `extensibility.user_tables.history_retention_floor_days` exists,
 *      defaults to 30, is `raise_only`, and is organization-overridable.
 *   2. A type change over an un-castable value writes a version row carrying
 *      `reason = 'type_change:<from>→<to>'` and the ORIGINAL value in
 *      `prior_data`, in the same transaction that empties the cell.
 *   3. `udt_change_field_type` REPORTS the count as `values_moved_to_history`,
 *      so a screen can say it (a screen never lies).
 *   4. The trim at the default floor does NOT delete a 20-day-old version
 *      beyond the latest two — and still DOES delete a 40-day-old one, so the
 *      gate cannot go green on a trim that simply stopped working.
 *   5. THE ORDER THE DIALOG ACTUALLY USES (DD-260, V-113 finding F1). Checks 2
 *      and 3 call the RPC directly, which is not what any user does — and that
 *      blind spot let a live lie through: `TableConfigModal` wrote the field's
 *      new `data_type` through `update_user_table_config` FIRST, so
 *      `udt_change_field_type` read the already-new type as the "from" and the
 *      production row-history badge read "Column type changed
 *      (integer→integer)". So the gate now drives both orders through the real
 *      RPCs: the dialog's save must stamp `type_change:string→integer`, and a
 *      caller that pre-flips the declared type must be REFUSED rather than
 *      leave a `<new>→<new>` reason behind.
 *
 * Everything runs inside ONE transaction that is ALWAYS rolled back: the
 * throwaway table, its rows, the planted version ages, and the trim's deletes.
 * Nothing this script does survives its own run.
 *
 * Exit codes: 0 clean · 1 findings · 2 UNMEASURED (no database credentials —
 * never a warn that reads as a pass).
 *
 * Run: `pnpm check:udt-history` · `pnpm check:udt-history:self-test`
 */
import process from "node:process";

import type pg from "pg";

import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";

const KNOB_FEATURE = "extensibility";
const KNOB_KEY = "user_tables.history_retention_floor_days";
const PLATFORM_FLOOR_DAYS = 30;

type Finding = { readonly check: string; readonly detail: string };

const findings: Finding[] = [];
function fail(check: string, detail: string): void {
  findings.push({ check, detail });
}
function ok(check: string, detail: string): void {
  console.log(`  ✓ ${check} — ${detail}`);
}

function unmeasured(why: string, remedy: string): never {
  console.error(`\n[UNMEASURED] ${why}`);
  console.error(`  Remedy: ${remedy}`);
  console.error(
    "  This is NOT a pass. The gate could not reach the live database.",
  );
  process.exit(2);
}

/** The whole probe, inside one transaction that is always rolled back. */
async function probe(client: pg.Client, selfTest: boolean): Promise<void> {
  // ── The cast: admin@admin.com and an organization it already owns tables in.
  const cast = await client.query<{ user_id: string; org_id: string }>(
    `select u.id as user_id,
            (select d.organization_id from workbench.udt_datasets d
              where d.created_by = u.id and d.deleted_at is null
              order by d.created_at limit 1) as org_id
       from auth.users u where u.email = 'admin@admin.com'`,
  );
  const who = cast.rows[0];
  if (!who?.user_id || !who.org_id) {
    unmeasured(
      "no admin@admin.com user with an existing user-defined table to borrow an organization from",
      "Create one table under admin@admin.com, or point the five SUPABASE_MATRIX_* variables at the live database.",
    );
  }

  await client.query("BEGIN");
  try {
    await client.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [who.user_id],
    );

    // ── 1. The knob ──────────────────────────────────────────────────────────
    const knob = await client.query<{
      default_value: string;
      override_direction: string;
      overridable_by: string[];
      min_value: string | null;
      resolved: string | null;
    }>(
      `select k.default_value::text as default_value, k.override_direction,
              k.overridable_by, k.min_value::text as min_value,
              (platform.knob_resolve($1, $2, $3) #>> '{}') as resolved
         from platform.feature_knob k
        where k.feature = $1 and k.key = $2`,
      [KNOB_FEATURE, KNOB_KEY, who.org_id],
    );
    const k = knob.rows[0];
    if (!k) {
      fail(
        "retention floor is a knob",
        `platform.feature_knob has no row for ${KNOB_FEATURE}.${KNOB_KEY} — the trim's floor is still hardcoded.`,
      );
    } else {
      if (Number(k.resolved) !== PLATFORM_FLOOR_DAYS) {
        fail(
          "retention floor defaults to 30 days",
          `${KNOB_FEATURE}.${KNOB_KEY} resolves to ${k.resolved} for organization ${who.org_id}, not ${PLATFORM_FLOOR_DAYS}.`,
        );
      }
      if (k.override_direction !== "raise_only") {
        fail(
          "retention floor is raise-only",
          `override_direction is '${k.override_direction}' — an organization could lower the floor below the ruled 30 days.`,
        );
      }
      if (!k.overridable_by.includes("organization")) {
        fail(
          "retention floor is organization-configurable",
          `overridable_by is {${k.overridable_by.join(",")}} — organizations cannot raise it.`,
        );
      }
      if (findings.length === 0) {
        ok(
          "retention floor is a raise-only, org-configurable knob",
          `${KNOB_FEATURE}.${KNOB_KEY} = ${k.resolved} days (min ${k.min_value})`,
        );
      }
    }

    // ── A throwaway table with one fitting and one un-castable value ─────────
    const table = await client.query<{ id: string }>(
      `insert into workbench.udt_datasets
         (table_name, user_id, created_by, organization_id, visibility, validation_mode)
       values ($1, $2, $2, $3, 'personal', 'permissive') returning id`,
      [`dd244_history_guard_${Date.now()}`, who.user_id, who.org_id],
    );
    const tableId = table.rows[0]!.id;

    const field = await client.query<{ id: string }>(
      `insert into workbench.udt_dataset_fields
         (table_id, field_name, display_name, data_type, user_id, organization_id)
       values ($1, 'probe', 'Probe', 'string', $2, $3) returning id`,
      [tableId, who.user_id, who.org_id],
    );
    const fieldId = field.rows[0]!.id;

    const fits = await client.query<{ id: string }>(
      `insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id)
       values ($1, '{"probe":"42"}'::jsonb, $2, $3) returning id`,
      [tableId, who.user_id, who.org_id],
    );
    const unfit = await client.query<{ id: string }>(
      `insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id)
       values ($1, '{"probe":"not a number"}'::jsonb, $2, $3) returning id`,
      [tableId, who.user_id, who.org_id],
    );
    const unfitRowId = unfit.rows[0]!.id;
    void fits;

    // ── 2 + 3. The type change ───────────────────────────────────────────────
    const changed = await client.query<{ result: Record<string, unknown> }>(
      `select public.udt_change_field_type($1, $2, 'integer', 'cast_or_null') as result`,
      [tableId, fieldId],
    );
    const result = changed.rows[0]!.result;

    const moved = result["values_moved_to_history"];
    if (typeof moved !== "number") {
      fail(
        "the type change reports what it moved",
        `udt_change_field_type returned no numeric 'values_moved_to_history' (got ${JSON.stringify(moved)}). The dialog cannot tell anyone a value was set aside, so the screen is lying by omission.`,
      );
    } else if (moved !== 1) {
      fail(
        "the type change reports what it moved",
        `values_moved_to_history = ${moved}, expected 1 (one un-castable value over two rows).`,
      );
    } else {
      ok("the type change reports what it moved", "values_moved_to_history = 1");
    }

    const emptied = await client.query<{ cell: string | null }>(
      `select (data ->> 'probe') as cell from workbench.udt_dataset_rows where id = $1`,
      [unfitRowId],
    );
    if (emptied.rows[0]?.cell !== null) {
      fail(
        "the un-castable cell was actually emptied",
        `the probe cell still reads ${JSON.stringify(emptied.rows[0]?.cell)} — this gate would be measuring nothing.`,
      );
    }

    const reason = "type_change:string→integer";
    const history = await client.query<{ id: string; original: string | null }>(
      `select id, (prior_data ->> 'probe') as original
         from workbench.udt_dataset_row_versions
        where row_id = $1 and reason = $2`,
      [unfitRowId, reason],
    );
    if (history.rowCount !== 1) {
      fail(
        "the value that did not fit went to history WITH the reason",
        `expected exactly one version of row ${unfitRowId} carrying reason '${reason}', found ${history.rowCount}. Doctrine Rule 3: a Value that does not fit goes to History with the reason, and is neither coerced nor deleted.`,
      );
    } else if (history.rows[0]!.original !== "not a number") {
      fail(
        "the value that did not fit went to history WITH the reason",
        `the version's prior_data holds ${JSON.stringify(history.rows[0]!.original)}, not the original 'not a number'.`,
      );
    } else {
      ok(
        "the value that did not fit went to history WITH the reason",
        `${reason} · prior_data.probe = 'not a number'`,
      );
    }

    // ── 4. The trim honours the 30-day floor ─────────────────────────────────
    // Give the row four versions, then age them deterministically:
    //   now  ·  -1 day  ·  -20 days (the type change)  ·  -40 days
    // Ranks 3 and 4 are both past the latest two. The OLD 14-day policy deleted
    // BOTH. The 30-day floor must keep the 20-day-old one — that version is the
    // only surviving copy of the value the type change set aside.
    await client.query(
      `update workbench.udt_dataset_rows set data = '{"probe":1}'::jsonb where id = $1`,
      [unfitRowId],
    );
    await client.query(
      `update workbench.udt_dataset_rows set data = '{"probe":2}'::jsonb where id = $1`,
      [unfitRowId],
    );
    const typeChangeVersionId = history.rows[0]?.id;
    const others = await client.query<{ id: string }>(
      `select id from workbench.udt_dataset_row_versions
        where row_id = $1 and (reason is distinct from $2) order by id`,
      [unfitRowId, reason],
    );
    if (others.rowCount !== 3 || !typeChangeVersionId) {
      fail(
        "the trim probe could be built",
        `expected 3 non-type-change versions plus the type-change one, found ${others.rowCount}.`,
      );
    } else {
      const [newest, middle, fortyDay] = others.rows.map((r) => r.id);
      await client.query(
        `update workbench.udt_dataset_row_versions set changed_at = now() where id = $1`,
        [newest],
      );
      await client.query(
        `update workbench.udt_dataset_row_versions set changed_at = now() - interval '1 day' where id = $1`,
        [middle],
      );
      await client.query(
        `update workbench.udt_dataset_row_versions set changed_at = now() - interval '20 days' where id = $1`,
        [typeChangeVersionId],
      );
      await client.query(
        `update workbench.udt_dataset_row_versions set changed_at = now() - interval '40 days' where id = $1`,
        [fortyDay],
      );

      await client.query(
        `select public.udt_dataset_row_versions_trim_scoped($1)`,
        [tableId],
      );

      const survived = await client.query<{ n: string }>(
        `select count(*)::text as n from workbench.udt_dataset_row_versions where id = $1`,
        [typeChangeVersionId],
      );
      if (survived.rows[0]!.n !== "1") {
        fail(
          "the trim keeps a 20-day-old version at the default floor",
          `the only surviving copy of the value the type change set aside was deleted at 20 days old. Rule 10 sets a floor of ${PLATFORM_FLOOR_DAYS} days.`,
        );
      } else {
        ok(
          "the trim keeps a 20-day-old version at the default floor",
          `20-day-old ${reason} version survived`,
        );
      }

      const gone = await client.query<{ n: string }>(
        `select count(*)::text as n from workbench.udt_dataset_row_versions where id = $1`,
        [fortyDay],
      );
      if (gone.rows[0]!.n !== "0") {
        fail(
          "the trim still trims past the floor",
          `a 40-day-old version beyond the latest two survived — the trim is not running at all, which would make the check above green for the wrong reason.`,
        );
      } else {
        ok("the trim still trims past the floor", "40-day-old version deleted");
      }
    }

    // ── 5 + 6. The order the Table settings dialog ACTUALLY uses ────────────
    // DD-260 / V-113 finding F1. Checks 2 and 3 above call the RPC DIRECTLY —
    // which is not what any user does. `TableConfigModal` saves the field's new
    // metadata through `update_user_table_config` and only then calls
    // `udt_change_field_type`, so on the real path the function read the ALREADY
    // NEW type as the "from" and stamped `type_change:integer→integer` on the row
    // history. The value survived; the label lied, on the one screen DD-244 exists
    // to make honest. These two checks drive that order for real.
    const uiCase = async (
      name: string,
      preflipDeclaredType: boolean,
    ): Promise<{ raised: string | null; reason: string | null }> => {
      await client.query("SAVEPOINT ui_order");
      try {
        const t = await client.query<{ id: string }>(
          `insert into workbench.udt_datasets
             (table_name, user_id, created_by, organization_id, visibility, validation_mode)
           values ($1, $2, $2, $3, 'personal', 'permissive') returning id`,
          [`dd260_ui_order_${name}_${Date.now()}`, who.user_id, who.org_id],
        );
        const tid = t.rows[0]!.id;
        const f = await client.query<{ id: string }>(
          `insert into workbench.udt_dataset_fields
             (table_id, field_name, display_name, data_type, user_id, organization_id)
           values ($1, 'amount', 'Amount', 'string', $2, $3) returning id`,
          [tid, who.user_id, who.org_id],
        );
        const fid = f.rows[0]!.id;
        const r = await client.query<{ id: string }>(
          `insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id)
           values ($1, '{"amount":"about twelve dollars"}'::jsonb, $2, $3) returning id`,
          [tid, who.user_id, who.org_id],
        );
        const rid = r.rows[0]!.id;

        // The dialog's metadata save, through the very RPC it calls. The ONLY
        // difference between the two cases is whether `data_type` rides it — the
        // bug, and the fix.
        const fieldUpdate: Record<string, unknown> = {
          id: fid,
          display_name: "Amount (USD)",
        };
        if (preflipDeclaredType) fieldUpdate["data_type"] = "integer";
        let raised: string | null = null;
        try {
          await client.query(
            `select public.update_user_table_config(p_table_id := $1, p_field_updates := $2::jsonb)`,
            [tid, JSON.stringify([fieldUpdate])],
          );
        } catch (err) {
          // The FIRST door refusing is the better outcome: nothing is written, so
          // the table cannot be left declared one type over rows of another.
          raised = err instanceof Error ? err.message : String(err);
          await client.query("ROLLBACK TO SAVEPOINT ui_order");
          return { raised, reason: null };
        }

        // ...then the row rewrite, exactly as the dialog does it.
        try {
          await client.query(
            `select public.udt_change_field_type($1, $2, 'integer', 'cast_or_null')`,
            [tid, fid],
          );
        } catch (err) {
          raised = err instanceof Error ? err.message : String(err);
          await client.query("ROLLBACK TO SAVEPOINT ui_order");
          return { raised, reason: null };
        }
        const v = await client.query<{ reason: string | null }>(
          `select reason from workbench.udt_dataset_row_versions
            where row_id = $1 and reason like 'type_change:%' order by changed_at desc limit 1`,
          [rid],
        );
        return { raised, reason: v.rows[0]?.reason ?? null };
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT ui_order");
        await client.query("RELEASE SAVEPOINT ui_order");
      }
    };

    // 5. The dialog's REAL save, fixed: the declared type is NOT pre-flipped, so
    //    the history names what the value actually used to be.
    const honest = await uiCase("honest", false);
    if (honest.raised) {
      fail(
        "the dialog's real save records the real from-type",
        `the Table settings save order (update_user_table_config for the other field properties, then udt_change_field_type) RAISED: ${honest.raised}`,
      );
    } else if (honest.reason !== "type_change:string→integer") {
      fail(
        "the dialog's real save records the real from-type",
        `the row-history reason produced by the dialog's own order is ${JSON.stringify(honest.reason)}, not 'type_change:string→integer'. The badge on the row-history screen renders this string verbatim, so the screen tells the user the wrong thing about their own value (DD-260 / V-113 F1).`,
      );
    } else {
      ok(
        "the dialog's real save records the real from-type",
        "type_change:string→integer through update_user_table_config + udt_change_field_type",
      );
    }

    // 6. The order that produced the lie is REFUSED, not recorded. This is the
    //    forcing half: whatever a future caller does, it can never leave a
    //    `<new>→<new>` reason behind quietly.
    const preflipped = await uiCase("preflipped", true);
    if (!preflipped.raised) {
      fail(
        "flipping the declared type first is refused, never recorded as a lie",
        `a caller that wrote data_type through update_user_table_config BEFORE calling udt_change_field_type was accepted, and the row history now reads ${JSON.stringify(preflipped.reason)}. The from-type is unrecoverable at that point, so the only honest answer is to refuse (DD-260).`,
      );
    } else if (
      !/already declared|refusing to change column/i.test(preflipped.raised)
    ) {
      fail(
        "flipping the declared type first is refused, never recorded as a lie",
        `it raised, but not with the DD-260 refusal naming the cause and the remedy: ${preflipped.raised}`,
      );
    } else {
      ok(
        "flipping the declared type first is refused, never recorded as a lie",
        "the declared type has one writer: the pre-flip is refused at the door",
      );
    }

    // ── Self-test: the gate must go RED when the honesty is removed ──────────
    if (selfTest) {
      console.log(
        "\n[SELF-TEST] removing the reason from the planted history row inside the same rolled-back transaction…",
      );
      await client.query(
        `update workbench.udt_dataset_row_versions set reason = null where row_id = $1`,
        [unfitRowId],
      );
      const after = await client.query<{ n: string }>(
        `select count(*)::text as n from workbench.udt_dataset_row_versions
          where row_id = $1 and reason = $2`,
        [unfitRowId, reason],
      );
      if (after.rows[0]!.n !== "0") {
        fail(
          "self-test",
          "stripping the reason did not change what the gate reads — the gate is not measuring the column it claims to.",
        );
      } else {
        console.log(
          "  ✓ self-test — with the reason stripped the gate's history probe finds 0 rows (it would have FAILED)",
        );
      }
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if ("missing" in env) {
    unmeasured(
      `missing ${env.missing.join(", ")}`,
      `Set the ${DB_VARS.length} SUPABASE_MATRIX_* variables (this repo's env files, then ../aidream/.env).`,
    );
  }
  console.log(
    `UDT history honesty (DD-244) — ${env.database}@${env.host} (from ${env.from})\n`,
  );
  const client = await connectDirect(env, "check-udt-history-honesty");
  try {
    await probe(client, selfTest);
  } finally {
    await client.end();
  }

  if (findings.length > 0) {
    console.error(`\n${findings.length} finding(s):\n`);
    for (const f of findings) console.error(`  ✗ ${f.check}\n    ${f.detail}\n`);
    console.error(
      "The grid's type change can still empty a cell whose only copy nothing keeps.",
    );
    process.exit(1);
  }
  console.log("\nGREEN — no value the grid cannot keep is left without a home.");
}

main().catch((err: unknown) => {
  // A missing function or column is the pre-fix world, and that is a FINDING,
  // not a crash: say which one and exit 1 so the gate reads red, not broken.
  const message = err instanceof Error ? err.message : String(err);
  for (const f of findings) console.error(`  ✗ ${f.check}\n    ${f.detail}\n`);
  if (
    /does not exist|column .* does not exist|function .* does not exist/i.test(
      message,
    )
  ) {
    console.error(`\n  ✗ the database does not carry the honesty yet\n    ${message}\n`);
    process.exit(1);
  }
  console.error(message);
  process.exit(2);
});
