#!/usr/bin/env npx tsx
/**
 * `pnpm check:grant-stands:self-test` — prove the runner's GRANT-STANDS guard RED then GREEN on the
 * nightly DEV CLONE inside one transaction that is always rolled back (lane GRANT-GUARD).
 *
 *   RED    a new SECURITY DEFINER function in `custom`, bare `grant execute … to authenticated`,
 *          no door row: the DDL guard strips the grant; the guard must name the function.
 *   GREEN  the same function with its client_callable_door row declared before the GRANT and
 *          reopen_declared_doors() after: the grant stands; the guard must say nothing.
 *   PARSE  comment/string/blanket/public/service_role forms are not judged.
 */
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import { grantedClientFunctions, grantStandsFindings } from "./migration-grant-stands";

const ROOT = resolve(__dirname, "..");
const SIG = "custom.grant_guard_selftest(uuid)";
const CREATE = `create function custom.grant_guard_selftest(p_id uuid) returns uuid language sql security definer set search_path = pg_catalog as $$ select p_id $$;`;
const GRANT = `grant execute on function ${SIG} to authenticated;`;
const DOOR = `insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom','grant_guard_selftest','p_id uuid', array['uuid'::regtype::oid],'grant-stands self-test, rolled back','check-grant-stands', null, true, false);`;

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

async function main(): Promise<number> {
  if (!process.argv.includes("--self-test")) {
    console.error("usage: pnpm check:grant-stands:self-test   (dev clone, rolled back)");
    return 2;
  }
  check("PARSE a targeted grant is found", grantedClientFunctions(GRANT).length === 1, JSON.stringify(grantedClientFunctions(GRANT)));
  check("PARSE comment/string grants are not grants", grantedClientFunctions(`-- ${GRANT}\nselect 'x ${GRANT.replace(/;$/, "")} y';`).length === 0, "found one");
  check("PARSE blanket grant not judged", grantedClientFunctions("grant execute on all functions in schema custom to authenticated;").length === 0, "judged");
  check("PARSE service_role not a client role", grantedClientFunctions(`grant execute on function ${SIG} to service_role;`).length === 0, "judged");
  check("PARSE %s placeholder is not a signature", grantedClientFunctions("do $$ begin execute format('grant execute on function %s to authenticated;', 'x'); end $$;").length === 0, "judged");

  const ref = loadCloneRef(ROOT);
  const env = loadCloneDbEnv(ROOT, ref);
  const client = new pg.Client({
    host: env.host, port: env.port, user: env.user, password: env.password, database: env.database,
    ssl: { rejectUnauthorized: false }, application_name: "check:grant-stands:self-test (rolled back)",
  });
  await client.connect();
  const q = async (text: string, params?: unknown[]) =>
    (await client.query(text, (params ?? []) as never[])).rows as Record<string, unknown>[];
  try {
    const id = (await q(
      `select exists (select 1 from pg_extension where extname = 'pg_net') as has_net,
              exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from cron.job where active) as has_cron`,
    ))[0]!;
    if (!env.user.includes(ref.cloneRef) && !env.host.includes(ref.cloneRef)) {
      console.error(`REFUSED: the connection does not name the clone ref ${ref.cloneRef}.`);
      return 1;
    }
    if (id.has_net === true || id.has_cron === true) {
      console.error("REFUSED: this server is not quarantined — it is not the clone.");
      return 1;
    }
    await client.query("begin");
    await client.query("savepoint s");

    // RED
    await client.query(CREATE);
    await client.query(GRANT);
    const red = await grantStandsFindings(q, `${CREATE}\n${GRANT}`);
    check("RED bare grant on a definer function with no door is named", red.length === 1 && /client_callable_door/.test(red[0]!.message) && red[0]!.signature.includes("grant_guard_selftest"), JSON.stringify(red));
    const named = await grantStandsFindings(q, `grant execute on function custom.grant_guard_selftest(p_id uuid) to authenticated;`);
    check("RED a grant written with argument names is resolved, not skipped or crashed", named.length === 1, JSON.stringify(named));
    await client.query("rollback to savepoint s");

    // GREEN
    await client.query(CREATE);
    await client.query(DOOR);
    await client.query(GRANT);
    await client.query("select custom.reopen_declared_doors()");
    const green = await grantStandsFindings(q, `${CREATE}\n${DOOR}\n${GRANT}`);
    check("GREEN door declared first: the grant stands and the guard says nothing", green.length === 0, JSON.stringify(green));
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\ngrant-stands self-test: every arm answered as it must");
  return failures ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
