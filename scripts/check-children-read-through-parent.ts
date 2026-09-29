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
 * THE SELF-TEST runs on the CLONE (policy DDL on production is refused by the production guard): it
 * plants each violation for real inside a transaction that is always rolled back (2 s lock timeout),
 * requires the named finding to APPEAR (absent from the clone's baseline, present after the plant),
 * and requires the rolled-back clone to answer its baseline again.
 *
 *   pnpm check:children-read-through-parent
 *   pnpm check:children-read-through-parent:self-test
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { cloneRefOverride, loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GUARD = `select check_name, token, table_name, policy_name from iam.children_with_own_read_arms()`;

interface Row {
  check_name: string;
  token: string;
  table_name: string | null;
  policy_name: string | null;
}

const PLANTS: ReadonlyArray<{ name: string; expect: string; sql: string }> = [
  {
    name: "a child's std_select reads its own organization column",
    expect: "own_arm_in_std_select:agent_definition_version",
    sql: `alter policy std_select on agent.definition_version
            using ((organization_id is not null and organization_id in (select iam.my_orgs())) or agent_id is not null)`,
  },
  {
    name: "a child's std_select loses its parent arm",
    expect: "no_parent_arm:agent_definition_version",
    sql: `alter policy std_select on agent.definition_version using ((select public.is_platform_admin()))`,
  },
  {
    name: "a child gains an anonymous read that does not ask its parent",
    expect: "anon_read_not_via_parent:agent_definition_version",
    sql: `create policy pub_read on agent.definition_version for select to anon using (true)`,
  },
  {
    name: "a child gains a hand-written organization read",
    expect: "bespoke_read_policy:agent_definition_version",
    sql: `create policy t13_plant_org_read on agent.definition_version for select to authenticated
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
  let client: pg.Client;
  if (selfTest) {
    const env = loadCloneDbEnv(ROOT, loadCloneRef(ROOT, cloneRefOverride(process.argv)));
    client = new pg.Client({ host: env.host, port: env.port, user: env.user, password: env.password,
      database: env.database, ssl: { rejectUnauthorized: false }, application_name: "check:children-read-through-parent (self-test)" });
    await client.connect().catch((error: unknown) => fail(`UNMEASURED: could not reach the clone — ${String(error)}`));
  } else {
    const env = loadDbEnv();
    if (!("host" in env)) {
      fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
    }
    client = await connectDirect(env, "check-children-read-through-parent").catch((error: unknown) => {
      fail(`UNMEASURED: could not reach the database — ${String(error)}`);
    });
  }

  try {
    if (selfTest) {
      const key = (r: Row) => `${r.check_name}:${r.token}`;
      const baseline = (await client.query<Row>(GUARD)).rows.map(key).sort();
      for (const plant of PLANTS) {
        if (baseline.includes(plant.expect)) {
          fail(`SELF-TEST UNMEASURED — ${plant.expect} is already in the clone's baseline, so its plant proves nothing.`);
        }
        await client.query("begin");
        try {
          await client.query("set local lock_timeout = '2s'");
          await client.query(plant.sql);
          const rows = (await client.query<Row>(GUARD)).rows;
          const keys = rows.map(key);
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
      const after = (await client.query<Row>(GUARD)).rows.map(key).sort();
      if (after.join("|") !== baseline.join("|")) {
        fail(`SELF-TEST FAILED — after every rollback the clone does not answer its baseline (${baseline.length} vs ${after.length} findings).`);
      }
      console.log(`[ OK ] self-test (clone) — ${PLANTS.length} planted violations each went RED for their named reason; the rolled-back clone answers its baseline (${baseline.length} findings) again.`);
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
