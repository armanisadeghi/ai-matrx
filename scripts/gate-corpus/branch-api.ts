#!/usr/bin/env npx tsx
/**
 * `branch-api.ts` — THE REHEARSAL BRANCH'S API LAYER.
 *
 * WHY THIS EXISTS (ATTACK-8 finding 2, measured 2026-09-16).
 * BUILD-BOOK §5.9 points the browser, the Chrome extension and the desktop client
 * at `https://ksfhewuxgxwavkpceein.supabase.co`, and every one of them reaches
 * data through PostgREST. `pg_roles` said:
 *
 *   production `brsgrqvjdzwihsvnfqkf`  authenticator.pgrst.db_schemas = 56 schemas
 *   branch     `ksfhewuxgxwavkpceein`  authenticator.pgrst.db_schemas = ABSENT
 *
 * So the branch served the project default and nothing else. `W6-GRID`'s first
 * stated act — walk the existing grid as `test@test.com` — fails on its first
 * request, because `workbench`, `platform`, `crm` and `iam` are not exposed there.
 * `C-23`, `C-24`, `C-28` and `C-29` were unrehearsable and `CUT-2` was a
 * conjunction that could not be true, which `W7-GATE`'s exit turns into a FAIL.
 *
 * WHAT IT DOES, AND WHERE EACH VERB BELONGS IN THE BOOK
 * ----------------------------------------------------
 *   --sync-schemas   W0-DATA's last step. Reads production's `pgrst.db_schemas`
 *                    over a READ ONLY transaction, writes it onto the BRANCH's
 *                    `authenticator`, and NOTIFYs PostgREST to reload.
 *   --sync-grants    W0-DATA's last step, with --sync-schemas. Exposing a schema
 *                    is only half of it: the transplant carried NO grants at all
 *                    for `anon`, `authenticated` or `service_role` outside
 *                    `public` (measured 2026-09-16 — `has_schema_privilege` false
 *                    on `platform`, `iam`, `crm` and `workbench` for all three),
 *                    so an exposed schema answers `42501 permission denied` to
 *                    every client lane. This copies production's own USAGE and
 *                    per-table privileges, exactly as production holds them.
 *   --expose <s>     W1-STORE's last step, BRANCH ONLY. The rehearsal of
 *                    switch-checklist steps 3 and 5, in the checklist's own
 *                    order: `GRANT USAGE ON SCHEMA <s> TO authenticated` and the
 *                    table grants, THEN add `<s>` to `pgrst.db_schemas`, THEN
 *                    reload. Without it the campaign's first migration
 *                    (`-- allows: revoke custom`) leaves `custom` revoked on the
 *                    branch too and no lane ever opens it — §11.3's "until this,
 *                    no application flip can reach anything, by construction"
 *                    binds the rehearsal exactly as it binds production.
 *   --prove <s.t>    One real HTTP request to the branch's REST API for a table
 *                    in `<s>`, with `Accept-Profile`, printed with its status.
 *                    PGRST106 ("the schema must be one of the following") is the
 *                    failure this whole file exists to make impossible.
 *
 * WHAT IT REFUSES
 * ---------------
 * Everything but the rehearsal branch, twice: the configured DSN against
 * `plan/BRANCH-REF` before any socket, and `pg_control_system().system_identifier`
 * on the open connection. Production is opened ONLY to read its role settings and
 * ONLY inside `begin transaction read only`.
 *
 * The API key for `--prove` is minted from the Management API by BRANCH-REF's own
 * recipe (`GET /v1/projects/<branch_ref>/api-keys?reveal=true`) and is never
 * printed, logged or written down.
 */
import { resolve } from "node:path";
import { Client } from "pg";
import {
  assertConfiguredHostMatchesTarget,
  assertServerMatchesTarget,
  branchRefOverride,
  loadBranchDbEnv,
  loadBranchRef,
  type BranchRef,
} from "../lib/migration-target";

const ROOT = resolve(__dirname, "..", "..");
const OK = "[ OK ] ";

function fail(lines: string[]): never {
  console.error(`\nREFUSED / FAILED\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
}

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const text = require("node:fs").readFileSync(path, "utf8") as string;
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* absent is not an error here; the caller says what it needed */
  }
  return out;
}

function aidreamEnv(): Record<string, string> {
  return envFile(resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"));
}

async function branchClient(ref: BranchRef): Promise<Client> {
  const env = loadBranchDbEnv(ROOT, ref);
  assertConfiguredHostMatchesTarget(
    { user: env.user, host: env.host, port: env.port, database: env.database, from: env.from },
    "branch",
    ref,
  );
  const client = new Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const sysid = await assertServerMatchesTarget(
    (sql) => client.query(sql),
    "branch",
    ref,
    "branch-api.ts",
  );
  console.log(`${OK}branch ${ref.branchRef}, server system_identifier ${sysid}.`);
  return client;
}

/** Production, opened READ ONLY, for the one setting this file copies. */
async function productionDbSchemas(ref: BranchRef): Promise<string> {
  const e = { ...aidreamEnv(), ...process.env } as Record<string, string>;
  const need = [
    "SUPABASE_MATRIX_USER",
    "SUPABASE_MATRIX_PASSWORD",
    "SUPABASE_MATRIX_HOST",
    "SUPABASE_MATRIX_PORT",
    "SUPABASE_MATRIX_DATABASE_NAME",
  ];
  const missing = need.filter((k) => !e[k]);
  if (missing.length) {
    fail([
      `--sync-schemas reads production's pgrst.db_schemas and ${missing.join(", ")} is not set.`,
      `Production is opened READ ONLY, for one SELECT on pg_roles, and for nothing else.`,
    ]);
  }
  const client = new Client({
    host: e.SUPABASE_MATRIX_HOST,
    port: Number(e.SUPABASE_MATRIX_PORT),
    user: e.SUPABASE_MATRIX_USER,
    password: e.SUPABASE_MATRIX_PASSWORD,
    database: e.SUPABASE_MATRIX_DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const id = await client.query("select system_identifier::text as s from pg_control_system()");
    const sysid = String(id.rows[0]?.s ?? "");
    if (sysid !== ref.parentSystemIdentifier) {
      fail([
        `--sync-schemas wanted PRODUCTION and the connected server says system_identifier ${sysid}.`,
        `BRANCH-REF says production is ${ref.parentSystemIdentifier} (${ref.path}). Nothing was read.`,
      ]);
    }
    await client.query("begin transaction read only");
    const res = await client.query(
      `select unnest(rolconfig) as setting from pg_roles where rolname = 'authenticator'`,
    );
    await client.query("rollback");
    const hit = (res.rows as Array<{ setting: string }>)
      .map((r) => r.setting)
      .find((s) => s.startsWith("pgrst.db_schemas="));
    if (!hit) {
      fail([
        `production's authenticator carries no pgrst.db_schemas at all.`,
        `Refusing to invent a list: this file COPIES what production serves, it never guesses it.`,
      ]);
    }
    return hit.slice("pgrst.db_schemas=".length);
  } finally {
    await client.end();
  }
}

/**
 * 🚨 PRODUCTION'S LIST IS NOT APPLICABLE VERBATIM, AND APPLYING IT TAKES THE
 * BRANCH'S WHOLE API DOWN (measured 2026-09-16, and recovered).
 *
 * Production's `pgrst.db_schemas` names `graveyard`, which the schema-only branch
 * does not carry. PostgREST will not build a schema cache that names a schema the
 * database does not have: every request to EVERY schema then answers
 *
 *   503 {"code":"PGRST002","message":"Could not query the database for the schema cache. Retrying."}
 *
 * and stays there until the list is corrected. So the list is intersected with
 * `pg_namespace` first and every dropped name is printed with the reason. The
 * branch also carries `esign` and `hr`, which production's role list does not:
 * they are served today only because the project's own `db_schema` config is what
 * PostgREST reads while the role setting is absent, and the role setting
 * OVERRIDES that config — so they are printed too, as a loss the rehearsal takes
 * on purpose in exchange for production's list.
 */
async function applicableSchemas(client: Client, wanted: string): Promise<string> {
  const want = wanted.split(",").filter(Boolean);
  const res = await client.query(
    `select s as name, exists (select 1 from pg_namespace n where n.nspname = s) as present
       from unnest($1::text[]) s`,
    [want],
  );
  const rows = res.rows as Array<{ name: string; present: boolean }>;
  const absent = rows.filter((r) => !r.present).map((r) => r.name);
  if (absent.length > 0) {
    console.log(
      `${OK}dropping ${absent.length} schema(s) production serves that this branch does not ` +
        `carry: ${absent.join(", ")}. PostgREST refuses to build a schema cache that names a ` +
        `missing schema, and the whole API answers 503 PGRST002 until it is corrected.`,
    );
  }
  return rows.filter((r) => r.present).map((r) => r.name).join(",");
}

/** Is the branch's REST API answering at all? PGRST002 means the cache is broken. */
async function apiIsHealthy(ref: BranchRef, key: string): Promise<{ ok: boolean; body: string }> {
  try {
    const res = await fetch(`https://${ref.branchRef}.supabase.co/rest/v1/?select=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const body = (await res.text()).slice(0, 200);
    return { ok: !body.includes("PGRST002"), body };
  } catch (e) {
    return { ok: false, body: e instanceof Error ? e.message : String(e) };
  }
}

function branchDbSchemas(rows: Array<{ setting: string }>): string | null {
  const hit = rows.map((r) => r.setting).find((s) => s.startsWith("pgrst.db_schemas="));
  return hit ? hit.slice("pgrst.db_schemas=".length) : null;
}

async function readBranchSchemas(client: Client): Promise<string | null> {
  const res = await client.query(
    `select unnest(rolconfig) as setting from pg_roles where rolname = 'authenticator'`,
  );
  return branchDbSchemas(res.rows as Array<{ setting: string }>);
}

async function setBranchSchemas(client: Client, list: string): Promise<void> {
  // ALTER ROLE … SET takes no parameter placeholders; the list is schema names
  // read from production's own role config, and it is validated before it is used.
  if (!/^[a-z0-9_,]+$/i.test(list)) {
    fail([
      `the schema list read from production is not a bare comma-separated identifier list:`,
      list.slice(0, 200),
      `Refusing to ALTER ROLE with it.`,
    ]);
  }
  await client.query(`alter role authenticator set pgrst.db_schemas = '${list}'`);
  // BOTH reloads, in this order. 'reload config' makes PostgREST re-read the
  // in-database settings (which is where the list now lives, and which overrides
  // the project's own db_schema); 'reload schema' rebuilds the schema cache, and
  // without it the newly exposed schema answers PGRST205 "could not find the
  // table in the schema cache" — served, but empty-handed.
  await client.query(`notify pgrst, 'reload config'`);
  await client.query(`notify pgrst, 'reload schema'`);
}

/** The branch's own publishable key, by BRANCH-REF's recipe. Never printed. */
async function branchApiKey(ref: BranchRef): Promise<string> {
  const token = (aidreamEnv().SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    fail([
      `--prove needs SUPABASE_ACCESS_TOKEN to mint the BRANCH's own API key`,
      `(${ref.path}: GET /v1/projects/<branch_ref>/api-keys?reveal=true). It is in aidream/.env.`,
    ]);
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref.branchRef}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    fail([`the Management API answered ${res.status} for the branch's api-keys.`]);
  }
  const keys = (await res.json()) as Array<{ type?: string; name?: string; api_key?: string }>;
  const key =
    keys.find((k) => k.type === "publishable")?.api_key ??
    keys.find((k) => k.name === "anon")?.api_key;
  if (!key) fail([`the branch has no publishable or anon key to read with.`]);
  return key;
}

/**
 * A REAL SESSION ON THE BRANCH. `anon` holds no table grant on `platform` — that is
 * production's own posture, copied — so a proof that stops at the anon key proves
 * the schema is served and nothing else. `W6-GRID` walks as `test@test.com`, so the
 * proof does too, through the branch's own auth API and its own key.
 */
async function testUserToken(ref: BranchRef, key: string): Promise<string | null> {
  const password = (aidreamEnv().TEST_USER_PASSWORD ?? "Password1234#").trim();
  const res = await fetch(`https://${ref.branchRef}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@test.com", password }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    console.log(
      `  … no session for test@test.com on the branch (${res.status} ${body}). The proof falls ` +
        `back to the anon key, and SAYS SO: W0-CORPUS is the lane that creates that identity.`,
    );
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function prove(ref: BranchRef, target: string, asTestUser: boolean): Promise<boolean> {
  const [schema, table] = target.split(".");
  if (!schema || !table) fail([`--prove wants <schema>.<table>, got "${target}".`]);
  const key = await branchApiKey(ref);
  const bearer = asTestUser ? ((await testUserToken(ref, key)) ?? key) : key;
  const url = `${`https://${ref.branchRef}.supabase.co`}/rest/v1/${table}?select=*&limit=1`;
  const headers = { apikey: key, Authorization: `Bearer ${bearer}`, "Accept-Profile": schema };
  // PGRST002 is PostgREST rebuilding its schema cache after the reload this file
  // just asked for — the one transient state here, and it is WAITED OUT LOUDLY
  // rather than reported as a verdict.
  let res = await fetch(url, { headers });
  let body = (await res.text()).slice(0, 400);
  for (let attempt = 1; attempt <= 10 && body.includes("PGRST002"); attempt += 1) {
    console.log(
      `  … PostgREST is still rebuilding its schema cache (PGRST002); attempt ${attempt} of 10, ` +
        `waiting 3 s.`,
    );
    await new Promise((r) => setTimeout(r, 3000));
    res = await fetch(url, { headers });
    body = (await res.text()).slice(0, 400);
  }
  console.log(
    `\n== HTTP PROOF ==\n  GET ${url}\n  Accept-Profile: ${schema}\n  -> ${res.status} ${res.statusText}\n  ${body}`,
  );
  if (body.includes("PGRST106")) {
    console.error(
      `\nFAILED — PostgREST does not serve schema "${schema}" on this branch. That is the exact` +
        `\nstate ATTACK-8 finding 2 measured; run --sync-schemas (and --expose ${schema} for a` +
        `\nschema the campaign creates) and try again.`,
    );
    return false;
  }
  if (res.status >= 500) {
    console.error(`\nFAILED — the branch's API answered ${res.status}.`);
    return false;
  }
  console.log(
    `${OK}the branch's PostgREST served schema "${schema}" over HTTP. 401/403/200 are all a` +
      ` SERVED schema; PGRST106 is an unserved one, and it is not what came back.`,
  );
  return true;
}

/**
 * THE GRANTS. Read from production's own catalogs inside a READ ONLY transaction
 * and replayed on the branch, per object, exactly as production holds them —
 * never a blanket `GRANT ALL ON ALL TABLES`, which would hand the rehearsal a
 * posture production does not have and make every access answer meaningless.
 * Objects production has and the branch does not are SKIPPED and COUNTED.
 */
async function syncGrants(client: Client, ref: BranchRef): Promise<void> {
  const e = { ...aidreamEnv(), ...process.env } as Record<string, string>;
  const prod = new Client({
    host: e.SUPABASE_MATRIX_HOST,
    port: Number(e.SUPABASE_MATRIX_PORT),
    user: e.SUPABASE_MATRIX_USER,
    password: e.SUPABASE_MATRIX_PASSWORD,
    database: e.SUPABASE_MATRIX_DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
  });
  await prod.connect();
  let schemaRows: Array<{ nspname: string; rolname: string }>;
  let tableRows: Array<{ table_schema: string; table_name: string; grantee: string; privs: string }>;
  try {
    const id = await prod.query("select system_identifier::text as s from pg_control_system()");
    if (String(id.rows[0]?.s ?? "") !== ref.parentSystemIdentifier) {
      fail([`--sync-grants wanted PRODUCTION; the connected server is not it. Nothing was read.`]);
    }
    await prod.query("begin transaction read only");
    schemaRows = (
      await prod.query(`
        select n.nspname, r.rolname
        from pg_namespace n
        cross join (select rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r
        where n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
          and has_schema_privilege(r.rolname, n.nspname, 'USAGE')
        order by 1, 2`)
    ).rows as typeof schemaRows;
    tableRows = (
      await prod.query(`
        select table_schema, table_name, grantee,
               string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
        from information_schema.role_table_grants
        where grantee in ('anon','authenticated','service_role')
        group by 1, 2, 3
        order by 1, 2, 3`)
    ).rows as typeof tableRows;
    await prod.query("rollback");
  } finally {
    await prod.end();
  }

  const haveSchemas = new Set(
    ((await client.query(`select nspname from pg_namespace`)).rows as Array<{ nspname: string }>).map(
      (r) => r.nspname,
    ),
  );
  const haveTables = new Set(
    (
      (await client.query(
        `select table_schema || '.' || table_name as k from information_schema.tables`,
      )).rows as Array<{ k: string }>
    ).map((r) => r.k),
  );

  let usageDone = 0;
  let usageSkipped = 0;
  for (const r of schemaRows) {
    if (!haveSchemas.has(r.nspname)) {
      usageSkipped += 1;
      continue;
    }
    await client.query(`grant usage on schema "${r.nspname}" to "${r.rolname}"`);
    usageDone += 1;
  }
  let tableDone = 0;
  const skippedTables = new Set<string>();
  for (const r of tableRows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!haveTables.has(key)) {
      skippedTables.add(key);
      continue;
    }
    await client.query(
      `grant ${r.privs} on "${r.table_schema}"."${r.table_name}" to "${r.grantee}"`,
    );
    tableDone += 1;
  }
  console.log(
    `${OK}grants copied from production: ${usageDone} schema USAGE grant(s) ` +
      `(${usageSkipped} skipped — the schema is not on this branch), ${tableDone} table grant(s) ` +
      `(${skippedTables.size} object(s) skipped — production has them and this branch does not).`,
  );
  console.log(
    `${OK}NOT copied, and said out loud: ALTER DEFAULT PRIVILEGES, function EXECUTE grants and ` +
      `column-level grants. A table a lane CREATES on the branch therefore carries the branch's ` +
      `own defaults, not production's.`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const ref = loadBranchRef(ROOT, branchRefOverride(argv));
  const exposeAt = argv.indexOf("--expose");
  const proveAt = argv.indexOf("--prove");
  const doSync = argv.includes("--sync-schemas") || (exposeAt < 0 && proveAt < 0);
  const doGrants = argv.includes("--sync-grants") || (exposeAt < 0 && proveAt < 0);
  const exposeSchema = exposeAt >= 0 ? argv[exposeAt + 1] : undefined;
  const proveTarget = proveAt >= 0 ? (argv[proveAt + 1] ?? "platform.entity_types") : undefined;

  if (exposeAt >= 0 && !exposeSchema) fail([`--expose wants a schema name.`]);

  const client = doSync || doGrants || exposeSchema ? await branchClient(ref) : null;
  try {
    if (doGrants) await syncGrants(client!, ref);
    if (doSync) {
      const key = await branchApiKey(ref);
      const wanted = await productionDbSchemas(ref);
      const before = await readBranchSchemas(client!);
      console.log(
        `${OK}production serves ${wanted.split(",").length} schema(s); the branch had ` +
          `${before === null ? "NO pgrst.db_schemas at all" : `${before.split(",").length}`}.`,
      );
      const list = await applicableSchemas(client!, wanted);
      await setBranchSchemas(client!, list);
      const after = await readBranchSchemas(client!);
      if (after !== list) {
        fail([
          `the branch's authenticator did not take the list.`,
          `wanted: ${list.slice(0, 120)}…`,
          `read back: ${String(after).slice(0, 120)}…`,
        ]);
      }
      console.log(
        `${OK}the branch's authenticator now carries ${after.split(",").length} schema(s), read ` +
          `back from pg_roles, and PostgREST was told to reload. Waiting for the schema cache.`,
      );
      // THE ROLLBACK. A half-configured API is worse than none: if the cache does
      // not come back, the previous state is restored and the lane is told, rather
      // than leaving every client lane on a 503 nobody can explain.
      let health = await apiIsHealthy(ref, key);
      for (let i = 1; i <= 12 && !health.ok; i += 1) {
        console.log(`  … schema cache not rebuilt yet (attempt ${i} of 12), waiting 10 s.`);
        await new Promise((r) => setTimeout(r, 10_000));
        health = await apiIsHealthy(ref, key);
      }
      if (!health.ok) {
        if (before === null) await client!.query(`alter role authenticator reset pgrst.db_schemas`);
        else await setBranchSchemas(client!, before);
        await client!.query(`notify pgrst, 'reload config'`);
        await client!.query(`notify pgrst, 'reload schema'`);
        fail([
          `the branch's REST API did not come back after the new schema list (2 minutes).`,
          `Last answer: ${health.body}`,
          `ROLLED BACK to ${before === null ? "no pgrst.db_schemas at all" : `the previous ${before.split(",").length} schema(s)`}; the API should recover within a minute.`,
          `A PGRST002 here means PostgREST could not build a cache over that list — usually a`,
          `schema in it that this branch does not carry. Nothing else in wave zero was touched.`,
        ]);
      }
      console.log(`${OK}the branch's REST API is answering again over the new list.`);
    }

    if (exposeSchema) {
      const exists = await client!.query(
        `select 1 from pg_namespace where nspname = $1`,
        [exposeSchema],
      );
      if (exists.rowCount === 0) {
        fail([
          `--expose ${exposeSchema}: the schema does not exist on the branch yet.`,
          `This verb is W1-STORE's LAST step and runs after its DDL, never before it.`,
        ]);
      }
      // Switch-checklist step 3, then step 5 — the production order, rehearsed.
      await client!.query(`grant usage on schema ${exposeSchema} to authenticated`);
      await client!.query(
        `grant select, insert, update, delete on all tables in schema ${exposeSchema} to authenticated`,
      );
      await client!.query(
        `alter default privileges in schema ${exposeSchema} ` +
          `grant select, insert, update, delete on tables to authenticated`,
      );
      console.log(
        `${OK}step 3 rehearsed on the BRANCH: usage on schema ${exposeSchema} and the table ` +
          `grants to authenticated. (Production's own grant is switch-checklist step 3, a chair step.)`,
      );
      const current = (await readBranchSchemas(client!)) ?? "";
      const list = current.split(",").filter(Boolean);
      if (!list.includes(exposeSchema)) {
        await setBranchSchemas(client!, [...list, exposeSchema].join(","));
      }
      const after = (await readBranchSchemas(client!)) ?? "";
      if (!after.split(",").includes(exposeSchema)) {
        fail([`${exposeSchema} is still not in the branch's pgrst.db_schemas after the ALTER ROLE.`]);
      }
      console.log(
        `${OK}step 5 rehearsed on the BRANCH: ${exposeSchema} is in pgrst.db_schemas ` +
          `(${after.split(",").length} schemas) and PostgREST was told to reload.`,
      );
    }
  } finally {
    await client?.end();
  }

  if (proveTarget) {
    const ok = await prove(ref, proveTarget, argv.includes("--as-test-user"));
    if (!ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? (err.stack ?? err.message) : err));
  process.exit(1);
});
