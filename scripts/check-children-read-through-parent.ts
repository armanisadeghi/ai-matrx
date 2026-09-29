/**
 * A CHILD OPENS ONLY THROUGH ITS PARENT.
 *
 * The law: common-docs/policies/access-ladder.md ("Children inherit their parent and never carry
 * access of their own"). A registered component's read policy is built from its composition parent
 * (migration access_ladder_t13_23b_children_read_only_through_their_parent.sql). Before T-13 2.3b a
 * child with stray organization_id / visibility / created_by columns got its own organization and
 * "visibility = public" arms, and a table that BECAME a child kept its old policies; this guard is
 * the census that proves neither is back.
 *
 * The check is ONE database query, `iam.children_with_own_read_arms()`, one row per child whose read
 * policies carry an arm not derived from its parent: an own organization / visibility / owner arm in
 * std_select, a std_select missing a composition parent column, a pub_read that is not the declared
 * anon-via-public-parent lane, or a hand-written read policy outside the named debt list — and one
 * row per debt-list child that is now clean (the list only shrinks).
 *
 * ZERO ROWS OR IT FAILED. UNMEASURED IS NOT PASSED.
 *
 * THE SELF-TEST plants each violation for real inside a transaction that is always rolled back
 * (2 s lock timeout) and requires the named check to go red, then requires the database to be green.
 *
 *   pnpm check:children-read-through-parent
 *   pnpm check:children-read-through-parent:self-test
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const GUARD = `select check_name, token, table_name, policy_name from iam.children_with_own_read_arms()`;

interface Row {
  check_name: string;
  token: string;
  table_name: string | null;
  policy_name: string | null;
}

const PLANTS: ReadonlyArray<{ name: string; expect: string; sql: string }> = [
  {
    name: "a child's std_select reads its own visibility column",
    expect: "own_arm_in_std_select:seo_gsc_dig_rule",
    sql: `alter policy std_select on seo.gsc_dig_rule using (visibility = 'public'::platform.visibility)`,
  },
  {
    name: "a child's std_select loses its parent arm",
    expect: "no_parent_arm:seo_gsc_dig_rule",
    sql: `alter policy std_select on seo.gsc_dig_rule using ((select public.is_platform_admin()))`,
  },
  {
    name: "a child gains an anonymous read that does not ask its parent",
    expect: "anon_read_not_via_parent:seo_gsc_dig_rule",
    sql: `create policy pub_read on seo.gsc_dig_rule for select to anon using (true)`,
  },
  {
    name: "a child gains a hand-written organization read",
    expect: "bespoke_read_policy:seo_gsc_dig_rule",
    sql: `create policy t13_plant_org_read on seo.gsc_dig_rule for select to authenticated
            using (organization_id in (select iam.my_orgs()))`,
  },
  {
    name: "a debt-list child becomes clean but stays on the list",
    expect: "bespoke_debt_cleared:user_follows",
    sql: `drop policy "Follows are viewable by everyone" on users.user_follows`,
  },
];

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if (!("host" in env)) {
    fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  }
  const client = await connectDirect(env, "check-children-read-through-parent").catch((error: unknown) => {
    fail(`UNMEASURED: could not reach the database — ${String(error)}`);
  });

  try {
    if (selfTest) {
      for (const plant of PLANTS) {
        await client.query("begin");
        try {
          await client.query("set local lock_timeout = '2s'");
          await client.query(plant.sql);
          const rows = (await client.query<Row>(GUARD)).rows;
          const keys = rows.map((r) => `${r.check_name}:${r.token}`);
          if (!keys.includes(plant.expect)) {
            fail(
              `SELF-TEST FAILED — planted "${plant.name}" and the guard did not report ${plant.expect} ` +
                `(it answered: ${[...new Set(keys)].join(", ") || "nothing"}).`,
            );
          }
          console.log(`[ OK ] RED as expected — ${plant.name} -> ${plant.expect}`);
        } finally {
          await client.query("rollback");
        }
      }
      const clean = (await client.query<Row>(GUARD)).rows;
      if (clean.length > 0) {
        fail(`SELF-TEST FAILED — after every rollback the live database is not green: ${clean.map((r) => `${r.check_name}:${r.token}`).join(", ")}`);
      }
      console.log(`[ OK ] self-test — ${PLANTS.length} planted violations each went RED for their named reason; the rolled-back database is GREEN.`);
      return;
    }

    const rows = (await client.query<Row>(GUARD)).rows;
    if (rows.length > 0) {
      fail(
        `${rows.length} child table finding(s) — a child carries a read arm not derived from its parent:\n` +
          rows
            .slice(0, 60)
            .map((r) => `  - ${r.check_name}: ${r.token} (${r.table_name ?? "-"}) ${r.policy_name ?? ""}`)
            .join("\n") +
          "\n  Regenerate the child (iam.apply_rls(schema, table, token, 'component')) so it reads only through its parent; " +
          "a hand-written read policy is superseded with iam.supersede_bespoke_policies after review; a cleared debt entry " +
          "comes off the list in iam.children_with_own_read_arms() (common-docs/policies/access-ladder.md, T-13 2.3b).",
      );
    }
    console.log("✅ CHILDREN READ THROUGH THEIR PARENT: no child table carries a read arm of its own.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
