#!/usr/bin/env npx tsx
/**
 * Offering resolver equivalence: does a keyword's worth come out the same
 * number when the value resolver reads the canonical offering model instead
 * of the old topic tables?
 *
 * WHAT IT PROTECTS: `seo.keyword_value_map`, the one resolver behind every
 * keyword score, level, receipt and value report. The brand-offerings cutover
 * (docs/db_rebuild/proposals/brand-offerings-cutover.md, D9) moved its base
 * from `seo.keyword_topic` + `seo.site_topic_value` to
 * `seo.site_keyword_offering` + `seo.site_offering_value`. The ruling was that
 * the move is LOSSLESS: for every site that carries worth, every keyword in its
 * corpus scores the same before and after, and any difference is explained,
 * never silent.
 *
 * WHY A LIVE PULL AND NOT A UNIT TEST: the answer lives in the deployed
 * function body and in the rows. A fixture proves the author's idea of the
 * data, not the data.
 *
 * WHAT A ROW IS: one (site, keyword) pair from `keyword_value_map(site, NULL)`,
 * the whole corpus of every site that has any live worth row. Compared on
 * score, level, source, computed score, computed level, and the reason chain.
 * The base step is normalised so the rename it is SUPPOSED to undergo
 * (`kind: 'topic'` becomes `kind: 'offering'`, `topic_id` becomes
 * `offering_id`) is not reported as a difference; its name, points, negative
 * guard and root still are.
 *
 * DIFFERENCES ARE CLASSIFIED, never waved through:
 *   tenancy        the old answer came from a placement that is outside the
 *                  site's own ladder (another organization's ruling). The
 *                  canonical model is site-scoped by construction, so this
 *                  difference is the cross-tenant defect being removed.
 *   root_relabel   only the reason's `root` changed: an offering whose old
 *                  topic parent was a taxonomy node now roots at itself,
 *                  because an offering hierarchy holds offerings only (D3).
 *   unexplained    anything else. Any unexplained row fails --strict.
 *
 * MODES
 *   --dry-run migrations/<file>.sql   BEGIN; snapshot; run the file; snapshot;
 *                                     diff; ROLLBACK. Nothing is kept.
 *   --snapshot <out.json>             record the live outputs (row hashes plus a
 *                                     readable summary) before an apply.
 *   --compare <in.json>               diff live outputs against a snapshot.
 *   --self-test                       prove RED then GREEN in one rolled-back
 *                                     transaction: a deliberately broken
 *                                     resolver must produce unexplained rows,
 *                                     and the untouched resolver must produce
 *                                     none.
 *   --strict                          exit 1 on any unexplained row.
 *
 * MEASURED 2026-09-14 (steps 6a and 6b): 4 sites, 40,574 keywords; 6a 40,513
 * identical + 61 tenancy + 0 unexplained; 6b 40,574 identical. Self-test RED
 * 1,820 unexplained, GREEN 0.
 *
 * UNMEASURED IS NOT PASSED: a missing connection, zero sites, or zero keywords
 * compared is a failure in every mode.
 *
 * Exit codes: 0 pass (or advisory findings without --strict), 1 findings /
 * unmeasured under --strict or --self-test, 2 the script crashed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

type Client = Awaited<ReturnType<typeof connectDirect>>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const STRICT = flag("--strict");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

async function connect(): Promise<Client> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}LIVE PULL FAILED${C.x} offering resolver equivalence could not be MEASURED. ` +
        `Wanted ${env.missing.join(", ")} in: ${env.looked.join(", ") || "(no env file)"}`,
    );
    exitAfterDrain(1);
  }
  const client = await connectDirect(env, "check-offering-resolver-equivalence");
  await client.query("set role none");
  return client;
}

/**
 * One row per (site, keyword): the resolver's answer, normalised. `h` is the
 * hash every comparison runs on; the rest is the readable summary a
 * difference is explained with.
 */
const SNAPSHOT_SQL = (table: string) => `
  create temp table ${table} on commit drop as
  with sites as (
    select site_id from seo.site_topic_value where deleted_at is null
    union
    select site_id from seo.site_offering_value where deleted_at is null
  ),
  answers as (
    select s.site_id, m.*
    from sites s
    join web.site ws on ws.id = s.site_id and ws.deleted_at is null
    cross join lateral seo.keyword_value_map(s.site_id, null) m
  ),
  normal as (
    select a.site_id, a.keyword_id, a.value_score, a.value_band, a.value_source,
           a.computed_score, a.computed_band,
           (select b from jsonb_array_elements(a.reasons) b
             where b->>'kind' in ('topic', 'offering') limit 1) as base,
           coalesce((
             select jsonb_agg(
                      case when r->>'kind' in ('topic', 'offering')
                           then jsonb_build_object(
                                  'kind', 'base',
                                  'name', coalesce(r->>'offering', r->>'topic'),
                                  'amount', r->'amount',
                                  'negative_guard', r->'negative_guard',
                                  'root', r->'root')
                           else r end
                      order by o)
             from jsonb_array_elements(a.reasons) with ordinality e(r, o)), '[]'::jsonb) as chain
    from answers a
  )
  select n.site_id, n.keyword_id,
         md5(concat_ws('|', n.value_score, n.value_band, n.value_source,
                       n.computed_score, n.computed_band, n.chain::text)) as h,
         md5(concat_ws('|', n.value_score, n.value_band, n.value_source,
                       n.computed_score, n.computed_band,
                       (select jsonb_agg(case when x->>'kind' = 'base' then x - 'root' else x end)
                          from jsonb_array_elements(n.chain) x)::text)) as h_rootless,
         n.value_score, n.value_band, n.value_source,
         coalesce(n.base->>'offering', n.base->>'topic') as base_name,
         (n.base->>'amount')::numeric as base_amount,
         n.base->>'root' as base_root
  from normal n
`;

type Row = {
  site_id: string;
  keyword_id: string;
  h: string;
  h_rootless: string;
  value_score: string | null;
  value_band: string | null;
  value_source: string | null;
  base_name: string | null;
  base_amount: string | null;
  base_root: string | null;
};

async function readTable(client: Client, table: string): Promise<Row[]> {
  const { rows } = await client.query<Row>(
    `select site_id::text, keyword_id::text, h, h_rootless, value_score::text, value_band, value_source,
            base_name, base_amount::text, base_root from ${table}`,
  );
  return rows;
}

/**
 * The keywords whose old answer came through a placement outside the site's
 * own ladder: a primary row at the organization, brand or site tier that
 * belongs to a different organization, brand or site. Those are the
 * cross-tenant rows the canonical model cannot represent.
 */
async function outOfScope(client: Client, pairs: Array<{ site_id: string; keyword_id: string }>) {
  if (pairs.length === 0) return new Set<string>();
  const { rows } = await client.query<{ k: string }>(
    `with p as (
       select (x->>'site_id')::uuid site_id, (x->>'keyword_id')::uuid keyword_id
       from jsonb_array_elements($1::jsonb) x
     )
     select p.site_id::text || ':' || p.keyword_id::text as k
     from p
     join web.site s on s.id = p.site_id
     where exists (
       select 1 from seo.keyword_topic kt
       where kt.keyword_id = p.keyword_id and kt.is_primary and kt.deleted_at is null
         and not ((kt.scope_tier = 'site' and kt.scope_site_id = s.id)
               or (kt.scope_tier = 'brand' and kt.scope_brand_id = s.brand_id)
               or (kt.scope_tier = 'organization' and kt.organization_id = s.organization_id)
               or kt.scope_tier = 'system'))`,
    [JSON.stringify(pairs)],
  );
  return new Set<string>(rows.map((r) => r.k));
}

type SiteTally = { compared: number; identical: number; tenancy: number; root_relabel: number; unexplained: number };

type Verdict = {
  sites: number;
  compared: number;
  identical: number;
  tenancy: number;
  rootRelabel: number;
  unexplained: number;
  missing: number;
  added: number;
  samples: string[];
  perSite: Record<string, SiteTally>;
};

async function diff(client: Client, before: Row[], after: Row[]): Promise<Verdict> {
  const key = (r: Row) => `${r.site_id}:${r.keyword_id}`;
  const afterMap = new Map(after.map((r) => [key(r), r]));
  const beforeKeys = new Set(before.map(key));
  const changed: Array<{ b: Row; a: Row }> = [];
  const v: Verdict = {
    sites: new Set(before.map((r) => r.site_id)).size,
    compared: 0,
    identical: 0,
    tenancy: 0,
    rootRelabel: 0,
    unexplained: 0,
    missing: 0,
    added: after.filter((r) => !beforeKeys.has(key(r))).length,
    samples: [],
    perSite: {},
  };
  for (const b of before) {
    const site = (v.perSite[b.site_id] ??= { compared: 0, identical: 0, tenancy: 0, root_relabel: 0, unexplained: 0 });
    const a = afterMap.get(key(b));
    v.compared += 1;
    site.compared += 1;
    if (!a) {
      v.missing += 1;
      v.unexplained += 1;
      site.unexplained += 1;
      if (v.samples.length < 20) v.samples.push(`MISSING ${key(b)} (was ${b.value_band} ${b.value_score})`);
      continue;
    }
    if (a.h === b.h) {
      v.identical += 1;
      site.identical += 1;
      continue;
    }
    changed.push({ b, a });
  }
  const tenancy = await outOfScope(
    client,
    changed.map(({ b }) => ({ site_id: b.site_id, keyword_id: b.keyword_id })),
  );
  for (const { b, a } of changed) {
    const site = v.perSite[b.site_id];
    if (tenancy.has(key(b))) {
      v.tenancy += 1;
      site.tenancy += 1;
    } else if (a.h_rootless === b.h_rootless) {
      v.rootRelabel += 1;
      site.root_relabel += 1;
    } else {
      v.unexplained += 1;
      site.unexplained += 1;
      if (v.samples.length < 20) {
        v.samples.push(
          `${key(b)}: ${b.value_band} ${b.value_score ?? "-"} [${b.base_name ?? "no base"} ${b.base_amount ?? ""}] ` +
            `-> ${a.value_band} ${a.value_score ?? "-"} [${a.base_name ?? "no base"} ${a.base_amount ?? ""}]`,
        );
      }
    }
  }
  return v;
}

function report(label: string, v: Verdict) {
  console.log(`\n${C.b}${label}${C.x}`);
  console.log(
    `  sites ${v.sites} · keywords compared ${v.compared} · identical ${v.identical} · ` +
      `tenancy ${v.tenancy} · root relabel ${v.rootRelabel} · ` +
      `${v.unexplained ? C.r : C.g}unexplained ${v.unexplained}${C.x} (missing ${v.missing}) · new rows ${v.added}`,
  );
  for (const [site, s] of Object.entries(v.perSite)) {
    console.log(
      `  ${C.d}${site}${C.x} compared ${s.compared} identical ${s.identical} tenancy ${s.tenancy} root ${s.root_relabel} unexplained ${s.unexplained}`,
    );
  }
  for (const s of v.samples) console.log(`  ${C.y}${s}${C.x}`);
}

function unmeasured(v: Verdict) {
  return v.sites === 0 || v.compared === 0;
}

async function begin(client: Client) {
  await client.query("begin");
  await client.query("set local statement_timeout = '20min'");
}

async function dryRun(file: string) {
  const sql = readFileSync(resolve(ROOT, file), "utf8");
  const client = await connect();
  try {
    await begin(client);
    await client.query(SNAPSHOT_SQL("_eq_before"));
    const before = await readTable(client, "_eq_before");
    const t0 = Date.now();
    await client.query(sql);
    console.log(`${C.d}ran ${file} in ${Math.round((Date.now() - t0) / 1000)}s (rolled back below)${C.x}`);
    await client.query(SNAPSHOT_SQL("_eq_after"));
    const after = await readTable(client, "_eq_after");
    const v = await diff(client, before, after);
    report(`DRY RUN ${file}`, v);
    return v;
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

async function snapshot(out: string) {
  const client = await connect();
  try {
    await begin(client);
    await client.query(SNAPSHOT_SQL("_eq_snap"));
    const rows = await readTable(client, "_eq_snap");
    writeFileSync(out, JSON.stringify({ taken_at: new Date().toISOString(), rows }));
    console.log(`snapshot: ${rows.length} rows over ${new Set(rows.map((r) => r.site_id)).size} sites -> ${out}`);
    if (rows.length === 0) exitAfterDrain(1);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

async function compareLive(file: string) {
  const { rows: before } = JSON.parse(readFileSync(file, "utf8")) as { rows: Row[] };
  const client = await connect();
  try {
    await begin(client);
    await client.query(SNAPSHOT_SQL("_eq_now"));
    const after = await readTable(client, "_eq_now");
    const v = await diff(client, before, after);
    report(`COMPARE live vs ${file}`, v);
    return v;
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

/**
 * RED: in a rolled-back transaction, break the live resolver the way a careless
 * repoint would (the base step's points silently become zero) and demand
 * unexplained rows. GREEN: the same diff against the untouched resolver must
 * be clean. The mutation is applied to the live body text, so it proves the
 * harness sees the resolver that is actually deployed.
 */
async function selfTest() {
  const client = await connect();
  let ok = true;
  try {
    await begin(client);
    await client.query(SNAPSHOT_SQL("_st_a"));
    const a = await readTable(client, "_st_a");
    await client.query(SNAPSHOT_SQL("_st_c"));
    const c = await readTable(client, "_st_c");
    const green = await diff(client, a, c);
    report("SELF-TEST GREEN (untouched resolver)", green);
    if (unmeasured(green) || green.unexplained !== 0) ok = false;
    const { rows } = await client.query<{ d: string }>(
      `select pg_get_functiondef('seo.keyword_value_map(uuid, uuid[])'::regprocedure) as d`,
    );
    const body = rows[0].d;
    const broken = body.replace(/COALESCE\(tb\.base_points, 0\)|COALESCE\(tb\.base_weight, 0\)/, "0");
    if (broken === body) {
      console.error(`${C.r}SELF-TEST could not find the base-points term to break; the harness is stale.${C.x}`);
      ok = false;
    } else {
      await client.query(broken);
      await client.query(SNAPSHOT_SQL("_st_b"));
      const b = await readTable(client, "_st_b");
      const red = await diff(client, a, b);
      report("SELF-TEST RED (base points forced to zero)", red);
      if (red.unexplained === 0) ok = false;
    }
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
  console.log(ok ? `\n${C.g}SELF-TEST PASSED${C.x}` : `\n${C.r}SELF-TEST FAILED${C.x}`);
  exitAfterDrain(ok ? 0 : 1);
}

async function main() {
  if (flag("--self-test")) return selfTest();
  let v: Verdict | undefined;
  const dry = valueOf("--dry-run");
  const snap = valueOf("--snapshot");
  const cmp = valueOf("--compare");
  if (dry) v = await dryRun(dry);
  else if (snap) return snapshot(snap);
  else if (cmp) v = await compareLive(cmp);
  else {
    console.error("usage: --dry-run <migration.sql> | --snapshot <out.json> | --compare <in.json> | --self-test [--strict]");
    exitAfterDrain(2);
  }
  if (!v || unmeasured(v)) {
    console.error(`${C.r}UNMEASURED${C.x}: no sites or no keywords were compared.`);
    exitAfterDrain(1);
  }
  if (v.unexplained > 0 && STRICT) exitAfterDrain(1);
}

main().catch((error) => {
  console.error(`${C.r}crashed:${C.x}`, error instanceof Error ? `${error.message}\n${(error as { where?: string }).where ?? ""}` : error);
  exitAfterDrain(2);
});
