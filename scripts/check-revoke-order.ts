#!/usr/bin/env npx tsx
/**
 * `pnpm check:revoke-order:self-test` — prove the runner's CLOSE-THE-ROW-FIRST guard live,
 * RED and GREEN, on the nightly DEV CLONE, inside ONE transaction that is always rolled back.
 *
 * The guard itself lives in `scripts/migration-revoke-order.ts` and runs inside every
 * `pnpm db:apply` transaction, after the file and before COMMIT (STORE-TXN-3's class, lane
 * ARGS-RULED-2). This script drives the SAME function against a real door on a real copy of
 * the platform, so what it proves is what the runner does:
 *
 *   RED-1  `revoke execute … from authenticated` on a door whose register row is OPEN.
 *          platform.reopen_declared_doors puts the grant straight back — the database shows
 *          the grant present at the end — and the guard must name it.
 *   RED-2  the STORE-TXN-3 order: revoke first, close the row second. The grant comes back,
 *          the row closes, the two disagree — and the guard must name it.
 *   GREEN  the right order: close the row, then revoke. The grant stays gone, the row is
 *          closed, and the guard must say NOTHING.
 *   PARSE  the static half: a REVOKE inside a comment or a string literal is not a REVOKE, a
 *          blanket `on all functions in schema` is posture restoration and is not judged, and
 *          `%s` inside a format() body is not a signature.
 *
 * The door used is `custom.hub_changed_by(uuid, text, uuid[])`, a live signed-in door whose
 * register row is open on every copy of the platform. Nothing is committed: the connection is
 * refused unless it is the CLONE by its own (system_identifier, project ref) pair and its
 * quarantine facts, and every step runs between one BEGIN and one ROLLBACK.
 */
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";
import { revokedClientFunctions, revokeOrderFindings } from "./migration-revoke-order";

const ROOT = resolve(__dirname, "..");
const DOOR = "custom.hub_changed_by(uuid, text, uuid[])";
const CLOSE_ROW = `update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'revoke-order self-test on the dev clone: closed only inside a transaction that is rolled back'
 where schema_name = 'custom' and function_name = 'hub_changed_by';`;
const REVOKE = `revoke execute on function ${DOOR} from authenticated;`;

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

async function main(): Promise<number> {
  if (!process.argv.includes("--self-test")) {
    console.error("usage: pnpm check:revoke-order:self-test   (dev clone, rolled back)");
    return 2;
  }

  // ── PARSE — offline ──
  check(
    "PARSE a targeted revoke is found",
    revokedClientFunctions(REVOKE).length === 1,
    JSON.stringify(revokedClientFunctions(REVOKE)),
  );
  check(
    "PARSE a revoke in a comment or a string is not a revoke",
    revokedClientFunctions(`-- ${REVOKE}\nselect 'no ${REVOKE.replace(/;$/, "")} here';`).length === 0,
    "found one",
  );
  check(
    "PARSE a blanket revoke is not judged",
    revokedClientFunctions("revoke execute on all functions in schema custom from authenticated;").length === 0,
    "judged a blanket revoke",
  );
  check(
    "PARSE %s in a format() body is not a signature",
    revokedClientFunctions(
      "do $$ begin execute format('revoke execute on function %s from authenticated;', 'x'); end $$;",
    ).length === 0,
    "treated a placeholder as a signature",
  );
  check(
    "PARSE a server-only role is not a client role",
    revokedClientFunctions(`revoke execute on function ${DOOR} from service_role;`).length === 0,
    "judged service_role",
  );

  // ── LIVE — the clone, one transaction, rolled back ──
  const ref = loadCloneRef(ROOT);
  const env = loadCloneDbEnv(ROOT, ref);
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "check:revoke-order:self-test (rolled back)",
  });
  await client.connect();
  const q = async (text: string, params?: unknown[]) =>
    (await client.query(text, (params ?? []) as never[])).rows as Record<string, unknown>[];
  try {
    const id = (await q(
      `select (select system_identifier from pg_control_system())::text as sysid,
              exists (select 1 from pg_extension where extname = 'pg_net') as has_net,
              exists (select 1 from pg_extension where extname = 'pg_cron')
                and exists (select 1 from cron.job where active) as has_cron`,
    ))[0]!;
    if (!env.user.includes(ref.cloneRef) && !env.host.includes(ref.cloneRef)) {
      console.error(`REFUSED: the connection does not name the clone ref ${ref.cloneRef}.`);
      return 1;
    }
    if (id.has_net === true || id.has_cron === true) {
      console.error("REFUSED: this server is not quarantined (pg_net or an active pg_cron job) — it is not the clone.");
      return 1;
    }
    console.log(`clone ${ref.cloneRef} (system_identifier ${String(id.sysid)}), quarantine confirmed`);

    const grant = async () =>
      (await q(`select has_function_privilege('authenticated', to_regprocedure($1), 'EXECUTE') as g`, [DOOR]))[0]!
        .g === true;
    const rowOpen = async () =>
      (await q(
        `select signed_in_callers as o from platform.client_callable_door
          where schema_name = 'custom' and function_name = 'hub_changed_by'`,
      ))[0]?.o === true;

    await client.query("begin");
    check("SETUP the door is open and granted on the clone", (await rowOpen()) && (await grant()), "not open/granted");

    // RED-1
    await client.query("savepoint s");
    await client.query(REVOKE);
    const g1 = await grant();
    const f1 = await revokeOrderFindings(q, REVOKE);
    check(
      "RED-1 revoke on an OPEN row: reopen_declared_doors put the grant back",
      g1,
      "the grant was actually gone — the premise of this arm is false on this copy",
    );
    check("RED-1 the guard names it", f1.length === 1 && /still OPENS/.test(f1[0]!.message), JSON.stringify(f1));
    await client.query("rollback to savepoint s");

    // RED-2
    const wrong = `${REVOKE}\n${CLOSE_ROW}`;
    await client.query(REVOKE);
    await client.query(CLOSE_ROW);
    const g2 = await grant();
    const o2 = await rowOpen();
    const f2 = await revokeOrderFindings(q, wrong);
    check(
      "RED-2 revoke then close: grant present, register closed — the disagreement",
      g2 && !o2,
      `grant ${g2}, row open ${o2}`,
    );
    check("RED-2 the guard names it", f2.length === 1 && /disagree/.test(f2[0]!.message), JSON.stringify(f2));
    await client.query("rollback to savepoint s");

    // GREEN
    const right = `${CLOSE_ROW}\n${REVOKE}`;
    await client.query(CLOSE_ROW);
    await client.query(REVOKE);
    const g3 = await grant();
    const o3 = await rowOpen();
    const f3 = await revokeOrderFindings(q, right);
    check("GREEN close then revoke: the grant stays gone and the row is closed", !g3 && !o3, `grant ${g3}, row open ${o3}`);
    check("GREEN the guard says nothing", f3.length === 0, JSON.stringify(f3));
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nrevoke-order self-test: every arm answered as it must");
  return failures ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
