#!/usr/bin/env npx tsx
/**
 * Offering availability round trip: does stopping an offering on a site and
 * then offering it again bring back exactly what stopping took?
 *
 * WHAT IT PROTECTS: the site availability writer of the brand-offerings
 * cutover (docs/db_rebuild/proposals/brand-offerings-cutover.md, D2):
 *   web.set_site_offering_availability   THE availability writer
 *   web.site_offering_availability_impact the preview a person reads first
 *   seo.keyword_value_map                 the resolver the placements feed
 * Stopping an offering soft-deletes this site's placements and worth on it;
 * offering it again must restore those exact rows. A person who unticks an
 * offering by mistake and ticks it back must lose nothing.
 *
 * WHY IT EXISTS (2026-09-14): the first live proof of the writer restored 0 of
 * 122 placement rows and dropped an expert's written worth ruling, because the
 * removal stamp was written in two text forms of one moment and compared as
 * text (migration brand_offerings_step6h2_availability_round_trip_restores.sql).
 * Before that, stopping was refused outright because the availability row went
 * inactive before its facts were removed (step 6h1). Both were invisible to
 * type-check and to every other guard.
 *
 * HOW IT MEASURES: one transaction, always rolled back, acting as
 * admin@admin.com (the only test identity). It picks a live site that account
 * may edit and the available offering there with the most primary placements
 * and a worth ruling, records the before state, stops it, checks the site no
 * longer offers it and a placement on it is refused, offers it again, and
 * checks every placement, the worth ruling and a sample keyword's value came
 * back exactly. Nothing is left behind.
 *
 * PROVEN FAILING: --self-test runs the probe twice in rolled-back transactions,
 * first against a writer whose restore can never match its own stamp (the
 * 2026-09-14 defect, re-created in the transaction), where the restore checks
 * must FAIL, then against the live writer, where every check must pass.
 *
 *   pnpm check:offering-availability-round-trip            # loud, exit 0 on findings
 *   pnpm check:offering-availability-round-trip:strict     # exit 1 on any finding
 *   pnpm check:offering-availability-round-trip:self-test  # RED then GREEN
 *
 * UNMEASURED IS NOT PASSED: no connection, no admin@admin.com, or no site that
 * account may edit with an offering carrying placements and worth, is a failure
 * under --strict and --self-test.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

type Client = Awaited<ReturnType<typeof connectDirect>>;

const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
const ADMIN_EMAIL = "admin@admin.com";
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

interface Check {
  key: string;
  ok: boolean;
  detail: string;
}

interface Fixture {
  adminId: string;
  siteId: string;
  organizationId: string;
  offeringId: string;
  offeringName: string;
  keywordId: string;
}

interface Snapshot {
  primaryPlacements: number;
  allPlacements: number;
  worthPoints: string | null;
  worthNotes: string | null;
  leadQuality: string | null;
  offeringMatch: string | null;
  keywordBand: string | null;
  keywordScore: string | null;
}

async function connect(): Promise<Client> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}LIVE PULL FAILED${C.x} the offering availability round trip could not be MEASURED. Wanted ${env.missing.join(", ")} in: ${env.looked.join(", ") || "(no env file)"}`,
    );
    exitAfterDrain(1);
  }
  const client = await connectDirect(env, "check-offering-availability-round-trip");
  await client.query("set role none");
  return client;
}

/** Act as admin@admin.com for the rest of the transaction. */
async function actAsAdmin(client: Client, adminId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: adminId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

async function fixture(client: Client): Promise<Fixture | null> {
  const admin = await client.query<{ id: string }>(`select id from auth.users where email = $1`, [ADMIN_EMAIL]);
  if (admin.rows.length === 0) return null;
  const adminId = admin.rows[0].id;
  const candidates = await client.query<{
    site_id: string;
    organization_id: string;
    offering_id: string;
    offering_name: string;
    keyword_id: string;
  }>(
    `select s.id as site_id, s.organization_id, bo.id as offering_id, bo.name as offering_name,
            (select k.keyword_id from seo.site_keyword_offering k
              where k.site_id = s.id and k.brand_offering_id = bo.id and k.is_primary and k.deleted_at is null
              order by k.keyword_id limit 1) as keyword_id
       from web.site_offering so
       join web.site s on s.id = so.site_id and s.deleted_at is null
       join web.brand_offering bo on bo.id = so.brand_offering_id and bo.status = 'active' and bo.deleted_at is null
       join seo.site_offering_value v on v.site_id = s.id and v.brand_offering_id = bo.id and v.deleted_at is null
      where so.status = 'active' and so.deleted_at is null
        and exists (select 1 from seo.site_keyword_offering k
                     where k.site_id = s.id and k.brand_offering_id = bo.id and k.is_primary and k.deleted_at is null)
      order by (select count(*) from seo.site_keyword_offering k
                 where k.site_id = s.id and k.brand_offering_id = bo.id and k.is_primary and k.deleted_at is null) desc
      limit 25`,
  );
  await actAsAdmin(client, adminId);
  for (const row of candidates.rows) {
    const editor = await client.query<{ ok: boolean }>(`select seo.fn_is_site_editor($1) as ok`, [row.site_id]);
    if (editor.rows[0]?.ok) {
      return {
        adminId,
        siteId: row.site_id,
        organizationId: row.organization_id,
        offeringId: row.offering_id,
        offeringName: row.offering_name,
        keywordId: row.keyword_id,
      };
    }
  }
  return null;
}

async function snapshot(client: Client, f: Fixture): Promise<Snapshot> {
  const { rows } = await client.query<{
    primary_placements: string;
    all_placements: string;
    worth_points: string | null;
    worth_notes: string | null;
    lead_quality: string | null;
    offering_match: string | null;
    band: string | null;
    score: string | null;
  }>(
    `select
       (select count(*) from seo.site_keyword_offering k
         where k.site_id = $1 and k.brand_offering_id = $2 and k.is_primary and k.deleted_at is null)::text as primary_placements,
       (select count(*) from seo.site_keyword_offering k
         where k.site_id = $1 and k.brand_offering_id = $2 and k.deleted_at is null)::text as all_placements,
       v.worth_points::text as worth_points, v.notes as worth_notes, v.lead_quality, v.offering_match,
       m.value_band as band, m.value_score::text as score
     from (select 1) one
     left join seo.site_offering_value v on v.site_id = $1 and v.brand_offering_id = $2 and v.deleted_at is null
     left join lateral seo.keyword_value_map($1, array[$3::uuid]) m on true`,
    [f.siteId, f.offeringId, f.keywordId],
  );
  const r = rows[0];
  return {
    primaryPlacements: Number(r.primary_placements),
    allPlacements: Number(r.all_placements),
    worthPoints: r.worth_points,
    worthNotes: r.worth_notes,
    leadQuality: r.lead_quality,
    offeringMatch: r.offering_match,
    keywordBand: r.band,
    keywordScore: r.score,
  };
}

async function probe(client: Client, f: Fixture): Promise<Check[]> {
  const checks: Check[] = [];
  const before = await snapshot(client, f);

  const impact = await client.query<{ placements: string; has_worth: boolean }>(
    `select placements::text, has_worth from web.site_offering_availability_impact($1, array[$2::uuid])`,
    [f.siteId, f.offeringId],
  );
  checks.push({
    key: "impact_previews_what_stop_removes",
    ok: Number(impact.rows[0]?.placements) === before.primaryPlacements && impact.rows[0]?.has_worth === true,
    detail: `preview ${impact.rows[0]?.placements} placements, worth ${impact.rows[0]?.has_worth}; live ${before.primaryPlacements} placements`,
  });

  const stop = await client.query<{ placements_removed: string; worth_removed: string; changed: boolean }>(
    `select placements_removed::text, worth_removed::text, changed
       from web.set_site_offering_availability($1, $2, array[$3::uuid], false, 'check-offering-availability-round-trip')`,
    [f.organizationId, f.siteId, f.offeringId],
  );
  checks.push({
    key: "stop_removes_this_sites_placements_and_worth",
    ok:
      stop.rows[0]?.changed === true &&
      Number(stop.rows[0]?.placements_removed) === before.primaryPlacements &&
      Number(stop.rows[0]?.worth_removed) === 1,
    detail: `removed ${stop.rows[0]?.placements_removed} placements, ${stop.rows[0]?.worth_removed} worth`,
  });

  const stopped = await client.query<{ offered: boolean; live: string }>(
    `select exists (select 1 from web.site_offerings($1) s where s.id = $2) as offered,
            (select count(*) from seo.site_keyword_offering k
              where k.site_id = $1 and k.brand_offering_id = $2 and k.deleted_at is null)::text as live`,
    [f.siteId, f.offeringId],
  );
  checks.push({
    key: "stopped_offering_is_not_offered_and_has_no_placements",
    ok: stopped.rows[0]?.offered === false && Number(stopped.rows[0]?.live) === 0,
    detail: `offered ${stopped.rows[0]?.offered}, live placements ${stopped.rows[0]?.live}`,
  });

  await client.query("savepoint probe_step");
  try {
    await client.query(`select * from seo.gsc_set_keyword_offering($1, $2, array[$3::uuid], $4, null)`, [
      f.organizationId,
      f.siteId,
      f.keywordId,
      f.offeringId,
    ]);
    await client.query("rollback to savepoint probe_step");
    checks.push({ key: "placement_on_stopped_offering_refused", ok: false, detail: "the placement was ACCEPTED" });
  } catch (error) {
    await client.query("rollback to savepoint probe_step");
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    checks.push({
      key: "placement_on_stopped_offering_refused",
      ok: /site_offering_unavailable/.test(message),
      detail: `refused: ${message}`,
    });
  }

  const offer = await client.query<{ placements_restored: string; worth_restored: string; changed: boolean }>(
    `select placements_restored::text, worth_restored::text, changed
       from web.set_site_offering_availability($1, $2, array[$3::uuid], true, 'check-offering-availability-round-trip')`,
    [f.organizationId, f.siteId, f.offeringId],
  );
  const after = await snapshot(client, f);
  checks.push({
    key: "offer_again_restores_every_placement",
    ok:
      Number(offer.rows[0]?.placements_restored) === before.primaryPlacements &&
      after.primaryPlacements === before.primaryPlacements &&
      after.allPlacements === before.allPlacements,
    detail: `restored ${offer.rows[0]?.placements_restored}; primary ${after.primaryPlacements}/${before.primaryPlacements}, all rows ${after.allPlacements}/${before.allPlacements}`,
  });
  checks.push({
    key: "offer_again_restores_the_worth_ruling_exactly",
    ok:
      Number(offer.rows[0]?.worth_restored) === 1 &&
      after.worthPoints === before.worthPoints &&
      after.worthNotes === before.worthNotes &&
      after.leadQuality === before.leadQuality &&
      after.offeringMatch === before.offeringMatch,
    detail: `points ${after.worthPoints}/${before.worthPoints}, lead ${after.leadQuality}/${before.leadQuality}, match ${after.offeringMatch}/${before.offeringMatch}, notes ${after.worthNotes === before.worthNotes ? "same" : "DIFFERENT"}`,
  });
  checks.push({
    key: "keyword_value_is_what_it_was",
    ok: after.keywordBand === before.keywordBand && after.keywordScore === before.keywordScore,
    detail: `band ${after.keywordBand}/${before.keywordBand}, score ${after.keywordScore}/${before.keywordScore}`,
  });
  return checks;
}

/** Re-create the 2026-09-14 defect inside the transaction: a restore that can never match its stamp. */
async function breakTheWriter(client: Client) {
  await client.query("set local role none");
  const { rows } = await client.query<{ d: string }>(
    `select pg_get_functiondef('web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text)'::regprocedure) as d`,
  );
  const broken = rows[0].d.replaceAll("= v_removed_at", "= v_removed_at + interval '1 second'");
  if (broken === rows[0].d) throw new Error("self-test could not find the writer's restore match to break; the probe is stale");
  await client.query(broken);
}

function print(label: string, checks: Check[]) {
  console.log(`\n${C.b}${label}${C.x}`);
  for (const c of checks) console.log(`  ${c.ok ? `${C.g}[ OK ]` : `${C.r}[FAIL]`}${C.x} ${c.key} ${C.d}${c.detail}${C.x}`);
}

async function run(broken: boolean): Promise<{ fixture: Fixture; checks: Check[] } | null> {
  const client = await connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120s'");
    if (broken) await breakTheWriter(client);
    const f = await fixture(client);
    if (!f) return null;
    return { fixture: f, checks: await probe(client, f) };
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

async function residue(): Promise<number> {
  const client = await connect();
  try {
    const { rows } = await client.query<{ n: string }>(
      `select ((select count(*) from seo.site_keyword_offering where metadata ? 'removed_with_availability')
             + (select count(*) from seo.site_offering_value where metadata ? 'removed_with_availability')
             + (select count(*) from web.site_offering
                 where metadata #>> '{availability,reason}' = 'check-offering-availability-round-trip'))::text as n`,
    );
    return Number(rows[0].n);
  } finally {
    await client.end();
  }
}

function unmeasured() {
  console.error(
    `${C.r}UNMEASURED${C.x}: no ${ADMIN_EMAIL}, or no site that account may edit with an available offering carrying placements and a worth ruling.`,
  );
}

async function main() {
  const restore = ["offer_again_restores_every_placement", "offer_again_restores_the_worth_ruling_exactly"];
  if (SELF_TEST) {
    const red = await run(true);
    const green = await run(false);
    if (!red || !green) {
      unmeasured();
      exitAfterDrain(1);
    }
    print(`SELF-TEST RED (restore can never match its stamp) — ${red.fixture.offeringName}`, red.checks);
    print(`SELF-TEST GREEN (live writer) — ${green.fixture.offeringName}`, green.checks);
    const redFailed = restore.every((k) => red.checks.find((c) => c.key === k)?.ok === false);
    const greenPassed = green.checks.every((c) => c.ok);
    const left = await residue();
    const ok = redFailed && greenPassed && left === 0;
    console.log(
      ok
        ? `\n${C.g}SELF-TEST PASSED${C.x} (residue ${left})`
        : `\n${C.r}SELF-TEST FAILED${C.x} red_failed=${redFailed} green_passed=${greenPassed} residue=${left}`,
    );
    exitAfterDrain(ok ? 0 : 1);
  }
  const result = await run(false);
  if (!result) {
    unmeasured();
    exitAfterDrain(STRICT ? 1 : 0);
  }
  const left = await residue();
  result.checks.push({ key: "probe_left_no_residue", ok: left === 0, detail: `${left} probe-stamped rows remain` });
  print(`OFFERING AVAILABILITY ROUND TRIP — ${result.fixture.offeringName}`, result.checks);
  const failed = result.checks.filter((c) => !c.ok);
  if (failed.length && STRICT) exitAfterDrain(1);
}

main().catch((error) => {
  console.error(`${C.r}crashed:${C.x}`, error instanceof Error ? error.message : error);
  exitAfterDrain(2);
});
