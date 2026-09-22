/**
 * A FORM'S QUESTIONS ARE THE FORM'S. THEY ARE NOT EVERY RECORD'S.
 *
 * WHAT THIS CLOSES — V11-C, measured on the main database on 2026-09-22. Pressing
 * **New record** on a table that had a published form raised, on the person's screen:
 *
 *   That value was not accepted — New Job Request: every answer it asks for is there —
 *   Change the value so it passes, then try again. SQLSTATE 23514.
 *   Hint: REC-15: the rule "New Job Request: …" (version 1) is not satisfied by this record.
 *
 * `custom.form_declare` makes a form's accept Rule when the caller brings none — the Rule
 * `custom.anon_clear` runs to decide whether an anonymous answer becomes a record. It was
 * declared with `uses: ['validate']` and the form's table as its scope, and
 * `custom._record_rule_uses` enforces EVERY validate-use Rule scoped to a table on EVERY
 * write to that table. So publishing a form silently made its questions compulsory columns
 * for every record in that table, written by anybody, by any route: the grid's New record
 * (an empty row, refused at once), paste, import, the agent. Twenty-seven live forms were
 * in that state.
 *
 * THE RULE THIS ENFORCES, as a census of the live database, not of the source: no live
 * form's accept Rule may carry `validate` or `compute` in its uses. Those are the two the
 * write trigger enforces. `membership` is the right use — the Rule says which SUBMISSIONS
 * this form admits, which is exactly what `custom.anon_clear` asks it through
 * `custom.rule_run`, and `rule_run` does not care what a Rule's uses are.
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:form-rules-are-not-table-rules
 *   pnpm check:form-rules-are-not-table-rules:self-test
 *     plants the old shape back on ONE live form inside a transaction, proves the census
 *     goes RED on it, and rolls back. Nothing it writes survives the check.
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

/** The two uses `custom._record_rule_uses` enforces on every write to the scoped table. */
const ENFORCED_ON_WRITE = ["validate", "compute"];

const CENSUS = `
  select f.id            as form_id,
         f.title         as form_title,
         f.organization_id,
         o.name          as organization,
         t.data ->> 'name' as table_name,
         rl.id           as rule_id,
         rl.data ->> 'name' as rule_name,
         rl.data -> 'uses'  as uses
    from custom.anon_form f
    join custom.record rl
      on rl.organization_id = f.organization_id
     and rl.id = f.quarantine_rule_id
     and rl.table_id = custom.rule_kernel_id()
     and rl.deleted_at is null
    left join custom.record t
      on t.organization_id = f.organization_id and t.id = f.table_id and t.deleted_at is null
    left join iam.organizations o on o.id = f.organization_id
   where f.deleted_at is null
     and f.quarantine_rule_id is not null
     and coalesce(rl.data -> 'uses', '[]'::jsonb) ?| array[${ENFORCED_ON_WRITE.map((u) => `'${u}'`).join(", ")}]
   order by o.name, f.title`;

type Row = {
  form_title: string | null;
  organization: string | null;
  table_name: string | null;
  rule_name: string | null;
  uses: unknown;
};

function say(rows: Row[]): string[] {
  return rows.map(
    (r) =>
      `${r.organization ?? "?"} — the form "${r.form_title ?? "?"}" on ${r.table_name ?? "?"}: its accept Rule "${r.rule_name ?? "?"}" carries ${JSON.stringify(r.uses)}. ` +
      `Every record anybody writes to that table by any route is checked against the form's questions, so "New record" from the grid is refused with SQLSTATE 23514.`,
  );
}

async function main() {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[FAIL] no database credentials (${env.missing.join(", ")} — looked in ${env.looked.join(", ")}). Unmeasured is not passed.`,
    );
    exitAfterDrain(1);
  }
  const selfTest = process.argv.includes("--self-test");
  const client = await connectDirect(env, "check:form-rules-are-not-table-rules");
  try {
    if (selfTest) {
      // THE FORCING FUNCTION. Put the OLD shape back on one real form, inside a
      // transaction, through the same door a person would use — then prove the census
      // names it, and roll the whole thing away.
      await client.query("begin");
      try {
        await client.query("set local statement_timeout = '60s'");
        await client.query("set local lock_timeout = '20s'");
        const victim = (await client.query(
          `select f.organization_id, f.quarantine_rule_id as rule_id, rl.data as rule_data
             from custom.anon_form f
             join custom.record rl on rl.organization_id = f.organization_id
              and rl.id = f.quarantine_rule_id and rl.deleted_at is null
            where f.deleted_at is null and f.quarantine_rule_id is not null
            limit 1`,
        )) as { rows: { organization_id: string; rule_id: string; rule_data: unknown }[] };
        if (victim.rows.length === 0) {
          console.error(
            "[FAIL] self-test: there is no live form with an accept Rule on this database, so the census has nothing to be proven against. Unmeasured is not passed.",
          );
          exitAfterDrain(1);
        }
        const { organization_id, rule_id } = victim.rows[0];
        await client.query(
          `select custom.rule_declare('${organization_id}'::uuid,
             (select rl.data - 'id' - 'version' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
                     || jsonb_build_object('uses', jsonb_build_array('validate'))
                from custom.record rl where rl.organization_id = '${organization_id}'::uuid and rl.id = '${rule_id}'::uuid),
             '${rule_id}'::uuid)`,
        );
        const red = (await client.query(CENSUS)) as { rows: Row[] };
        if (red.rows.length === 0) {
          console.error(
            "[FAIL] self-test: the old shape was put back on a live form and the census found NOTHING. It is not looking at the thing it is supposed to police.",
          );
          exitAfterDrain(1);
        }
        console.log(
          `[OK] self-test: the census went RED on ${red.rows.length} form(s) the moment the old shape was put back — ${say(red.rows)[0]}`,
        );
      } finally {
        await client.query("rollback").catch(() => undefined);
      }
      const green = (await client.query(CENSUS)) as { rows: Row[] };
      if (green.rows.length !== 0) {
        console.error(
          `[FAIL] self-test: after the rollback the census still names ${green.rows.length} form(s) — the self-test's own write did not go away, or the tree is genuinely red.`,
        );
        exitAfterDrain(1);
      }
      console.log("[OK] self-test: rolled back, and the census is green again. Nothing it wrote survives.");
      exitAfterDrain(0);
    }

    const rows = ((await client.query(CENSUS)) as { rows: Row[] }).rows;
    if (rows.length > 0) {
      console.error(`[FAIL] ${rows.length} live form(s) make their questions compulsory for every record in their table:`);
      for (const line of say(rows)) console.error("  - " + line);
      console.error(
        "  A form's accept Rule declares `uses: ['membership']` — it says which submissions the form admits. Move them: scripts/fix11a/move_form_accept_rules_to_membership.sql",
      );
      exitAfterDrain(1);
    }
    console.log("[OK] no live form's accept Rule is enforced on the table's writes: publishing a form does not make its questions compulsory for every record.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
