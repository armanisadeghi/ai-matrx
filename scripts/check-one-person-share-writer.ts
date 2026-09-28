#!/usr/bin/env npx tsx
/**
 * ONE PERSON-SHARE WRITER — no database function writes a person's grant except iam.share_with_person.
 *
 * THE CLASS (access ladder T-32e, 2026-09-28)
 * ------------------------------------------
 * Fourteen functions inserted rows into iam.permissions for a person directly — meeting invitations,
 * access-request approval, the emergency doors, HR rules, task assignment, DM participants, the
 * record store, cutover carries, fixtures — each with its own `on conflict … set status = 'active'`.
 * Every one of them silently gave back access an owner had removed. The revocation rule (a removed
 * grant is archived, ends now, and only a deliberate direct share by someone allowed to share
 * restores it) can only hold if there is ONE body that decides it: iam.share_with_person, and its
 * revoke counterpart iam.unshare_person. This guard reads the LIVE function bodies (the database is
 * the source of truth) and fails on any other function whose body inserts a row naming
 * granted_to_user_id into iam.permissions. Organization/availability rows are not person shares and
 * are not judged. There is no baseline: the ratchet is at zero.
 *
 *   pnpm check:one-person-share-writer                 # live (a light catalog read), exit 1 on a finding
 *   pnpm check:one-person-share-writer --target clone  # the nightly clone (trails live by up to a day)
 *   pnpm check:one-person-share-writer:self-test       # on the clone: plants an offender in a
 *                                                      # rolled-back transaction and requires a finding
 *
 * The self-test edits no tracked file: it creates a throwaway function inside a transaction on the
 * clone (DDL is refused on production by the production guard), runs the same census in that
 * transaction, requires the plant to be named, and rolls back.
 */
import process from "node:process";
import type pg from "pg";
import { connectCheckDirect } from "./lib/check-target";
import { exitAfterDrain } from "./lib/exit-after-drain";

const GATE = "check:one-person-share-writer";
const SELF_TEST = process.argv.includes("--self-test");
const ALLOWED = new Set(["iam.share_with_person"]);
const PLANT = "public.__one_share_writer_plant";

/** Any function body inserting a row that names granted_to_user_id into iam.permissions. */
const CENSUS_SQL = `
  select n.nspname || '.' || p.proname as fn, p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prokind in ('f', 'p')
     and p.prosrc ~* 'permissions'
     and p.prosrc ~* 'insert\\s+into\\s+(iam\\.)?permissions\\M[^;]*granted_to_user_id'
   order by 1`;

async function census(client: pg.Client): Promise<Array<{ fn: string; sig: string }>> {
  const r = await client.query<{ fn: string; sig: string }>(CENSUS_SQL);
  return r.rows.filter((row) => !ALLOWED.has(row.fn));
}

async function main(): Promise<number> {
  const argv = SELF_TEST ? [...process.argv.filter((a) => a !== "--self-test"), "--target", "clone"] : process.argv;
  const { client, target } = await connectCheckDirect({
    gate: GATE,
    defaultTarget: SELF_TEST ? "clone" : "production",
    argv,
  });
  try {
    if (SELF_TEST) {
      if (target !== "clone") throw new Error("the self-test plants a function and runs only on the clone");
      await client.query("begin");
      try {
        await client.query(`
          create function ${PLANT}(p_type text, p_id uuid, p_user uuid) returns void
          language sql as $$
            insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
            values (p_type, p_id, p_user, 'viewer', 'active')
            on conflict (resource_type, resource_id, granted_to_user_id) do update set status = 'active';
          $$`);
        const found = await census(client);
        const named = found.some((f) => f.fn === PLANT);
        console.log(
          named
            ? `SELF-TEST OK: the planted direct writer ${PLANT} was named (${found.length} finding(s) in the planted transaction).`
            : `SELF-TEST FAILED: the planted direct writer ${PLANT} was NOT named — this guard cannot fail.`,
        );
        return named ? 0 : 1;
      } finally {
        await client.query("rollback");
      }
    }

    const found = await census(client);
    if (found.length === 0) {
      console.log(`OK: the only function that writes a person's grant is iam.share_with_person (${target}).`);
      return 0;
    }
    console.log(`FOUND ${found.length} function(s) writing a person's grant outside iam.share_with_person (${target}):`);
    for (const f of found) console.log(`  - ${f.sig}`);
    console.log(
      "Remedy: call iam.share_with_person(type, id, person, level, actor, restore_removed, basis, expires_at, exact, note)" +
        " to give access, and iam.unshare_person(permission_id, actor, by_person) to end it — never insert or delete the row." +
        " A caller that is not a deliberate direct share by someone allowed to share passes restore_removed = false.",
    );
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    exitAfterDrain(2);
  });
