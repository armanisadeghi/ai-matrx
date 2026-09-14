#!/usr/bin/env npx tsx
/**
 * Offering tenancy: can one organization's offering, availability, placement or
 * worth ever surface on, or be written against, another organization's site?
 *
 * WHAT IT PROTECTS: the canonical offering model of the brand-offerings cutover
 * (docs/db_rebuild/proposals/brand-offerings-cutover.md, D1/D2/D4/D7):
 *   web.brand_offering        owned by a brand; organization must match it
 *   web.site_offering         a site exposes only its own brand's offerings
 *   seo.site_keyword_offering a placement names an offering the site exposes
 *   seo.write_site_keyword_offering  THE placement writer
 *   seo.keyword_value_map     the resolver, which must read only this site
 *
 * WHY IT EXISTS: the model it replaces, seo.topic + seo.keyword_topic, was one
 * global tree. Until 2026-09-12 the placement read handed every site other
 * tenants' rulings, and on 2026-09-14 the value resolver was still doing it (61
 * keywords on one site were worth what another organization said). The old
 * table also carried `uq_keyword_topic_scope`, a unique key with no
 * organization column, so two organizations placing the same keyword on the
 * same topic at the organization tier would collide. The canonical placement
 * key must be site-scoped so that shape cannot recur.
 *
 * HOW IT MEASURES: one transaction, always rolled back. It picks two live sites
 * with brands in two different organizations and one live keyword, plants a
 * brand offering and its availability on each side, then attempts every
 * crossing. Each attempt runs inside a savepoint so a refusal is observed, not
 * fatal. Nothing is left behind.
 *
 * PROVEN FAILING: --self-test runs the same probe twice in one rolled-back
 * transaction, first against a deliberately broken writer (availability and
 * organization checks removed) with the placement trigger disabled, where the
 * crossing checks must FAIL, then against the live objects, where every check
 * must pass.
 *
 *   pnpm check:offering-tenancy            # loud, exit 0 on findings
 *   pnpm check:offering-tenancy:strict     # exit 1 on any finding
 *   pnpm check:offering-tenancy:self-test  # RED then GREEN
 *
 * UNMEASURED IS NOT PASSED: no connection, or fewer than two organizations with
 * a branded site, is a failure under --strict and --self-test.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

type Client = Awaited<ReturnType<typeof connectDirect>>;

const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

interface Check {
  key: string;
  ok: boolean;
  detail: string;
}

interface Fixture {
  siteA: string;
  orgA: string;
  brandA: string;
  siteB: string;
  orgB: string;
  brandB: string;
  keyword: string;
}

async function connect(): Promise<Client> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}LIVE PULL FAILED${C.x} offering tenancy could not be MEASURED. Wanted ${env.missing.join(", ")} in: ${env.looked.join(", ") || "(no env file)"}`,
    );
    exitAfterDrain(1);
  }
  const client = await connectDirect(env, "check-offering-tenancy");
  await client.query("set role none");
  return client;
}

async function refused(client: Client, sql: string, params: unknown[], pattern: RegExp): Promise<{ ok: boolean; detail: string }> {
  await client.query("savepoint probe_step");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint probe_step");
    return { ok: false, detail: "the write was ACCEPTED" };
  } catch (error) {
    await client.query("rollback to savepoint probe_step");
    const message = error instanceof Error ? error.message : String(error);
    return pattern.test(message)
      ? { ok: true, detail: `refused: ${message.split("\n")[0]}` }
      : { ok: false, detail: `refused for the WRONG reason: ${message.split("\n")[0]}` };
  }
}

async function fixture(client: Client): Promise<Fixture | null> {
  const { rows } = await client.query<{ site_id: string; organization_id: string; brand_id: string }>(
    `select distinct on (s.organization_id) s.id as site_id, s.organization_id, s.brand_id
       from web.site s
       join web.brand b on b.id = s.brand_id and b.deleted_at is null and b.organization_id = s.organization_id
      where s.deleted_at is null
      order by s.organization_id, s.created_at
      limit 2`,
  );
  const kw = await client.query<{ id: string }>(`select id from seo.keyword where deleted_at is null limit 1`);
  if (rows.length < 2 || kw.rows.length === 0) return null;
  return {
    siteA: rows[0].site_id,
    orgA: rows[0].organization_id,
    brandA: rows[0].brand_id,
    siteB: rows[1].site_id,
    orgB: rows[1].organization_id,
    brandB: rows[1].brand_id,
    keyword: kw.rows[0].id,
  };
}

async function plantOffering(client: Client, org: string, brand: string, site: string, tag: string): Promise<string> {
  const slug = `tenancy-probe-${tag}-${Math.random().toString(36).slice(2, 10)}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into web.brand_offering (organization_id, brand_id, name, slug, kind, status, metadata)
     values ($1, $2, $3, $4, 'service', 'active', '{"probe":"check-offering-tenancy"}')
     returning id`,
    [org, brand, `Tenancy probe ${tag}`, slug],
  );
  await client.query(
    `insert into web.site_offering (organization_id, site_id, brand_offering_id, status, metadata)
     values ($1, $2, $3, 'active', '{"probe":"check-offering-tenancy"}')`,
    [org, site, rows[0].id],
  );
  return rows[0].id;
}

async function probe(client: Client, f: Fixture): Promise<Check[]> {
  const checks: Check[] = [];
  const push = (key: string, r: { ok: boolean; detail: string }) => checks.push({ key, ...r });

  const offeringA = await plantOffering(client, f.orgA, f.brandA, f.siteA, "a");
  const offeringB = await plantOffering(client, f.orgB, f.brandB, f.siteB, "b");

  push(
    "offering_row_with_foreign_organization_refused",
    await refused(
      client,
      `insert into web.brand_offering (organization_id, brand_id, name, slug, kind, metadata)
       values ($1, $2, 'cross org', 'tenancy-probe-cross-org', 'service', '{"probe":"check-offering-tenancy"}')`,
      [f.orgB, f.brandA],
      /brand_offering_scope_mismatch/,
    ),
  );

  push(
    "availability_of_foreign_brand_offering_refused",
    await refused(
      client,
      `insert into web.site_offering (organization_id, site_id, brand_offering_id, metadata)
       values ($1, $2, $3, '{"probe":"check-offering-tenancy"}')`,
      [f.orgA, f.siteA, offeringB],
      /site_offering_scope_mismatch/,
    ),
  );

  push(
    "placement_on_foreign_offering_refused",
    await refused(
      client,
      `select * from seo.write_site_keyword_offering($1, $2, array[$3::uuid], $4, null, 'human')`,
      [f.orgA, f.siteA, f.keyword, offeringB],
      /site_offering_unavailable/,
    ),
  );

  push(
    "placement_under_foreign_organization_refused",
    await refused(
      client,
      `select * from seo.write_site_keyword_offering($1, $2, array[$3::uuid], $4, null, 'human')`,
      [f.orgB, f.siteA, f.keyword, offeringA],
      /keyword_offering_scope_mismatch/,
    ),
  );

  push(
    "direct_foreign_placement_row_refused",
    await refused(
      client,
      `insert into seo.site_keyword_offering (organization_id, site_id, keyword_id, brand_offering_id, is_primary, metadata)
       values ($1, $2, $3, $4, true, '{"probe":"check-offering-tenancy"}')`,
      [f.orgA, f.siteA, f.keyword, offeringB],
      /site_offering_unavailable/,
    ),
  );

  push(
    "direct_foreign_worth_row_refused",
    await refused(
      client,
      `insert into seo.site_offering_value (organization_id, site_id, brand_offering_id, worth_points, metadata)
       values ($1, $2, $3, 1, '{"probe":"check-offering-tenancy"}')`,
      [f.orgA, f.siteA, offeringB],
      /site_offering_unavailable/,
    ),
  );

  // The uq_keyword_topic_scope hazard: the same keyword placed by two
  // organizations must be two independent rows, never a collision.
  await client.query("savepoint probe_step");
  try {
    await client.query(`select * from seo.write_site_keyword_offering($1, $2, array[$3::uuid], $4, null, 'human')`, [
      f.orgA,
      f.siteA,
      f.keyword,
      offeringA,
    ]);
    await client.query(`select * from seo.write_site_keyword_offering($1, $2, array[$3::uuid], $4, null, 'human')`, [
      f.orgB,
      f.siteB,
      f.keyword,
      offeringB,
    ]);
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from seo.site_keyword_offering
        where keyword_id = $1 and is_primary and deleted_at is null and brand_offering_id in ($2, $3)`,
      [f.keyword, offeringA, offeringB],
    );
    checks.push({
      key: "two_organizations_place_same_keyword_without_collision",
      ok: rows[0].n === "2",
      detail: `${rows[0].n} independent primary placements (want 2)`,
    });

    await client.query(
      `insert into seo.site_offering_value (organization_id, site_id, brand_offering_id, worth_points, metadata)
       values ($1, $2, $3, 777, '{"probe":"check-offering-tenancy"}')`,
      [f.orgB, f.siteB, offeringB],
    );
    const own = await client.query<{ hit: boolean }>(
      `select exists (select 1 from seo.keyword_value_map($1, array[$2::uuid]) m, jsonb_array_elements(m.reasons) r
                      where r->>'offering_id' = $3) as hit`,
      [f.siteB, f.keyword, offeringB],
    );
    const foreign = await client.query<{ hit: boolean }>(
      `select exists (select 1 from seo.keyword_value_map($1, array[$2::uuid]) m, jsonb_array_elements(m.reasons) r
                      where r->>'offering_id' = $3) as hit`,
      [f.siteA, f.keyword, offeringB],
    );
    checks.push({
      key: "resolver_reads_own_site_placement",
      ok: own.rows[0].hit === true,
      detail: own.rows[0].hit ? "site B's resolver reads its own placement" : "site B's own planted placement is INVISIBLE, so the next check proves nothing",
    });
    checks.push({
      key: "resolver_never_surfaces_foreign_placement",
      ok: foreign.rows[0].hit === false,
      detail: foreign.rows[0].hit ? "site A's resolver returned site B's offering" : "site A never sees site B's offering",
    });
  } catch (error) {
    checks.push({
      key: "two_organizations_place_same_keyword_without_collision",
      ok: false,
      detail: `refused: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    });
  } finally {
    await client.query("rollback to savepoint probe_step");
  }

  const idx = await client.query<{ name: string; site_scoped: boolean }>(
    `select c.relname as name,
            exists (select 1 from unnest(i.indkey) k join pg_attribute a
                      on a.attrelid = i.indrelid and a.attnum = k where a.attname = 'site_id') as site_scoped
       from pg_index i join pg_class c on c.oid = i.indexrelid
      where i.indrelid = 'seo.site_keyword_offering'::regclass and i.indisunique and not i.indisprimary`,
  );
  const unscoped = idx.rows.filter((r) => !r.site_scoped).map((r) => r.name);
  checks.push({
    key: "placement_uniqueness_is_site_scoped",
    ok: idx.rows.length > 0 && unscoped.length === 0,
    detail: unscoped.length ? `unique keys without site_id: ${unscoped.join(", ")}` : `${idx.rows.length} unique keys, all keyed on site_id`,
  });

  return checks;
}

async function breakTheModel(client: Client) {
  const { rows } = await client.query<{ d: string }>(
    `select pg_get_functiondef('seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb)'::regprocedure) as d`,
  );
  const broken = rows[0].d
    .replace("IF p_organization_id IS NULL OR v_site_org <> p_organization_id THEN", "IF false THEN")
    .replace("IF p_offering_id IS NOT NULL AND NOT EXISTS (", "IF false AND NOT EXISTS (");
  if (broken === rows[0].d) throw new Error("self-test could not find the writer's guards to break; the probe is stale");
  await client.query(broken);
  await client.query(`alter table seo.site_keyword_offering disable trigger site_keyword_offering_scope_guard`);
  await client.query(`alter table seo.site_offering_value disable trigger site_offering_value_scope_guard`);
}

function print(label: string, checks: Check[]) {
  console.log(`\n${C.b}${label}${C.x}`);
  for (const c of checks) console.log(`  ${c.ok ? `${C.g}[ OK ]` : `${C.r}[FAIL]`}${C.x} ${c.key} ${C.d}${c.detail}${C.x}`);
}

async function residue(client: Client): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `select ((select count(*) from web.brand_offering where metadata->>'probe' = 'check-offering-tenancy')
           + (select count(*) from web.site_offering where metadata->>'probe' = 'check-offering-tenancy'))::text as n`,
  );
  return Number(rows[0].n);
}

async function run(broken: boolean): Promise<Check[] | null> {
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120s'");
    const f = await fixture(client);
    if (!f) return null;
    if (broken) await breakTheModel(client);
    return await probe(client, f);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

async function main() {
  const crossing = [
    "placement_on_foreign_offering_refused",
    "placement_under_foreign_organization_refused",
    "direct_foreign_placement_row_refused",
    "direct_foreign_worth_row_refused",
  ];
  if (SELF_TEST) {
    const red = await run(true);
    const green = await run(false);
    if (!red || !green) {
      console.error(`${C.r}UNMEASURED${C.x}: fewer than two organizations with a branded site.`);
      exitAfterDrain(1);
    }
    print("SELF-TEST RED (writer guards removed, placement triggers disabled)", red);
    print("SELF-TEST GREEN (live objects)", green);
    const redFailed = crossing.every((k) => red.find((c) => c.key === k)?.ok === false);
    const greenPassed = green.every((c) => c.ok);
    const client = await connect();
    const left = await residue(client);
    await client.end();
    const ok = redFailed && greenPassed && left === 0;
    console.log(ok ? `\n${C.g}SELF-TEST PASSED${C.x} (residue ${left})` : `\n${C.r}SELF-TEST FAILED${C.x} red_failed=${redFailed} green_passed=${greenPassed} residue=${left}`);
    exitAfterDrain(ok ? 0 : 1);
  }
  const checks = await run(false);
  if (!checks) {
    console.error(`${C.r}UNMEASURED${C.x}: fewer than two organizations with a branded site.`);
    exitAfterDrain(STRICT ? 1 : 0);
  }
  const client = await connect();
  const left = await residue(client);
  await client.end();
  checks.push({ key: "probe_left_no_residue", ok: left === 0, detail: `${left} probe rows remain` });
  print("OFFERING TENANCY", checks);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length && STRICT) exitAfterDrain(1);
}

main().catch((error) => {
  console.error(`${C.r}crashed:${C.x}`, error instanceof Error ? error.message : error);
  exitAfterDrain(2);
});
