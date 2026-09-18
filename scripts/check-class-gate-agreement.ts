#!/usr/bin/env npx tsx
/**
 * ONE RESOLVER ANSWERS THE CLASS — the class gate may never disagree with `iam.class_lanes` (DD-216).
 *
 * WHY THIS EXISTS (measured live on brsgrqvjdzwihsvnfqkf, 2026-09-14, B-109)
 * -------------------------------------------------------------------------
 * The data-class regime has three readers of "what class is this token?", and until DD-216 one of
 * them answered differently from the other two:
 *
 *   iam.class_lanes(token)             a component resolves through its composition parent      ✅
 *   platform.entity_link_shareable()   a component returns NULL — "this function has no opinion" ✅
 *   iam.class_allows(token, action)    coalesce(entity_types.data_class, 'private')              ❌
 *
 * All 319 active tokens with `data_class IS NULL` are components, and that NULL is REQUIRED of them
 * (db-rules §6d-1, chair ruling DD-137b14: a component's access IS its parent's;
 * `platform._entity_types_classify_default` nulls the column at birth and
 * `iam.verify_canonical.data_class_set` FAILs a component that holds a class). So the `coalesce`
 * written for an UNREGISTERED token fired on every component instead, and the gate called all 319
 * `private` — including 170 whose parent class is `organization` and 14 whose parent class is
 * `public`.
 *
 * It was not theoretical. `public.create_share_link` asks this gate, and 15 ACTIVE component
 * resource types are registered `is_link_shareable` in `platform.shareable_resource_registry` —
 * admitted there by `platform._share_registry_class_interlock` precisely BECAUSE
 * `platform.entity_link_shareable` declined to invent an opinion for a component. Measured before
 * the fix, as admin@admin.com, rolled back:
 *
 *   select public.create_share_link('web_page','96a95f35-9ae8-4833-b30f-e57dfb383e32');
 *   -> {"success": false, "error": "a private row cannot be shared by public link"}
 *
 * and the refusal was written into `iam.access_audit` with `data_class = 'private'` — a class that
 * token's registry row never carried.
 *
 * WHAT THIS GUARD ASSERTS
 * -----------------------
 *   D1 — SOURCE. `iam.class_allows` takes its class from `iam.class_gate_class` and reads
 *        `platform.entity_types` nowhere. A fourth reader can only fork the resolver by going
 *        around that function, which is exactly what this detector sees.
 *   D2 — CLASS. For EVERY active token, `iam.class_gate_class(token)` equals
 *        `(iam.class_lanes(token)).resolved_class`. Unmeasured is a failure, never a pass: if the
 *        census returns no rows at all, this fails.
 *   D3 — VERDICT. For every active token, the gate's own `share_link` arithmetic
 *        (`class in ('organization','public')`) equals `(iam.class_lanes(token)).share_link_lane`.
 *        D2 alone would stay green if someone re-tabled the lanes in `iam.class_lanes` and left the
 *        gate's hard-coded pair behind; this is the detector that notices.
 *
 * IT NEVER CALLS `iam.class_allows`. That function writes an `iam.access_audit` row on every
 * refusal — that is its whole value — so asking it 800 questions would manufacture 800 refusal
 * records. `iam.class_gate_class` exists to be asked instead: same class, no side effect.
 *
 *   pnpm check:class-gate            # loud, non-blocking (exit 0)
 *   pnpm check:class-gate --strict   # exit 1 on any disagreement, or on an unmeasured census
 *   pnpm check:class-gate --self-test  # prove the detectors RED on a planted fork, then GREEN
 *
 * --self-test never touches `iam.class_allows`: it runs the same pure rules over rows it makes up.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function door(env: { url: string; key: string }, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${env.url}/rest/v1/rpc/execute_admin_query`, {
    method: "POST",
    headers: {
      apikey: env.key, Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json", "Content-Profile": "public", "Accept-Profile": "public",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  const payload = JSON.parse(text) as unknown;
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object" && Array.isArray((payload as { result?: unknown[] }).result)) {
    return (payload as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

/** One active token as the two readers answer for it. */
export interface GateRow {
  token: string;
  variant: string;
  /** what iam.class_gate_class answers — the class iam.class_allows will apply */
  gate_class: string | null;
  /** what iam.class_lanes resolves the same token to */
  lanes_class: string | null;
  /** iam.class_lanes' own share_link lane for the token */
  share_link_lane: boolean | null;
}

/** D1, as a pure rule so --self-test can feed it source text it made up. */
export function sourceFindings(src: string): string[] {
  const bad: string[] = [];
  if (!/iam\.class_gate_class/.test(src)) {
    bad.push(
      "iam.class_allows does not take its class from iam.class_gate_class — the gate has a resolver of its own again (DD-216)",
    );
  }
  if (/from\s+platform\.entity_types/i.test(src)) {
    bad.push(
      "iam.class_allows reads platform.entity_types directly — that is the second, divergent copy of the resolver DD-216 removed; a component's data_class is NULL BY DESIGN and a coalesce over it calls every component 'private'",
    );
  }
  return bad;
}

/** D2 + D3, as pure rules over the census rows. */
export function rowFindings(rows: readonly GateRow[]): string[] {
  const bad: string[] = [];
  for (const r of rows) {
    if (r.gate_class !== r.lanes_class) {
      bad.push(
        `${r.token} (${r.variant}): the class gate says ${r.gate_class ?? "<null>"} and iam.class_lanes says ${r.lanes_class ?? "<null>"}`,
      );
      continue;
    }
    const gateAllowsShare = r.gate_class === "organization" || r.gate_class === "public";
    if (gateAllowsShare !== r.share_link_lane) {
      bad.push(
        `${r.token} (${r.variant}): class ${r.gate_class ?? "<null>"} — the gate's share_link verdict is ${gateAllowsShare} but iam.class_lanes.share_link_lane is ${r.share_link_lane}; the lane table and the gate's arithmetic have drifted apart`,
      );
    }
  }
  return bad;
}

function selfTest(): number {
  let failures = 0;
  const expect = (name: string, got: number, want: number) => {
    const ok = got === want;
    if (!ok) failures++;
    console.log(`  ${ok ? `${C.g}RED->GREEN` : `${C.r}BROKEN`}${C.x} ${name} ${C.d}(findings ${got}, expected ${want})${C.x}`);
  };

  const fixed = `v_class := iam.class_gate_class(p_token);`;
  const forked = `select et.data_class::text into v_class from platform.entity_types et where et.token = p_token; v_class := coalesce(v_class,'private');`;
  expect("D1 source: the DD-216 form is clean", sourceFindings(fixed).length, 0);
  expect("D1 source: the pre-DD-216 fork is caught", sourceFindings(forked).length, 2);

  const good: GateRow[] = [
    { token: "agent", variant: "entity", gate_class: "organization", lanes_class: "organization", share_link_lane: true },
    { token: "web_page", variant: "component", gate_class: "organization", lanes_class: "organization", share_link_lane: true },
    { token: "message", variant: "component", gate_class: "private", lanes_class: "private", share_link_lane: false },
  ];
  expect("D2/D3: agreeing rows are clean", rowFindings(good).length, 0);

  const drifted: GateRow[] = [
    // exactly the live defect: the gate calls a component private, the lanes call it organization
    { token: "web_page", variant: "component", gate_class: "private", lanes_class: "organization", share_link_lane: true },
    { token: "agent_card", variant: "component", gate_class: "private", lanes_class: "organization", share_link_lane: true },
  ];
  expect("D2: the live pre-DD-216 disagreement is caught", rowFindings(drifted).length, 2);

  const laneDrift: GateRow[] = [
    // the class agrees, but the lane table no longer matches the gate's hard-coded pair
    { token: "some_token", variant: "entity", gate_class: "confidential", lanes_class: "confidential", share_link_lane: true },
  ];
  expect("D3: a re-tabled lane with an agreeing class is caught", rowFindings(laneDrift).length, 1);

  // Unmeasured is a failure, never a pass — but that rule cannot live in rowFindings(), which is
  // given rows and can only speak about rows. main() raises it, and this asserts the split is real:
  // an empty census produces no ROW finding, which is exactly why main() must add one itself.
  expect("an empty census produces no row finding (so main() must fail it)", rowFindings([]).length, 0);
  return failures;
}

const CENSUS_SQL = `
select et.token,
       et.rls_variant as variant,
       iam.class_gate_class(et.token) as gate_class,
       (iam.class_lanes(et.token)).resolved_class::text as lanes_class,
       (iam.class_lanes(et.token)).share_link_lane as share_link_lane
  from platform.entity_types et
 where et.is_active
 order by et.token`;

const SOURCE_SQL = `
select pg_get_functiondef('iam.class_allows(text,text,uuid)'::regprocedure) as src`;

async function main(): Promise<number> {
  console.log(`${C.b}One resolver answers the class — iam.class_allows vs iam.class_lanes (DD-216)${C.x}`);
  if (SELF_TEST) {
    console.log(`${C.b}--self-test${C.x} ${C.d}(pure rules; iam.class_allows is never called)${C.x}`);
    const f = selfTest();
    console.log(f === 0 ? `${C.g}self-test GREEN${C.x}` : `${C.r}self-test BROKEN: ${f}${C.x}`);
    return f === 0 ? 0 : 1;
  }

  const env = loadEnv();
  if (!env) {
    console.log(`${C.r}UNMEASURED${C.x} — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Unmeasured is a failure, never a pass.`);
    return STRICT ? 1 : 0;
  }

  let src: string;
  let rows: GateRow[];
  try {
    const s = await door(env, SOURCE_SQL);
    src = String((s[0]?.src as string) ?? "");
    rows = (await door(env, CENSUS_SQL)) as unknown as GateRow[];
  } catch (e) {
    console.log(`${C.r}UNMEASURED${C.x} — ${(e as Error).message}`);
    return STRICT ? 1 : 0;
  }

  const findings: string[] = [];
  if (!src) {
    findings.push("iam.class_allows(text,text,uuid) does not exist — the class gate is gone");
  } else {
    findings.push(...sourceFindings(src));
  }
  if (rows.length === 0) {
    findings.push("the census returned no active tokens at all — unmeasured is a failure, never a pass");
  }
  findings.push(...rowFindings(rows));

  console.log(`  ${C.d}active tokens measured: ${rows.length}${C.x}`);
  if (findings.length === 0) {
    console.log(`${C.g}PASS${C.x} — every active token's class gate agrees with iam.class_lanes, and the gate has one resolver.`);
    return 0;
  }
  for (const f of findings) console.log(`  ${C.r}FAIL${C.x} ${f}`);
  console.log(
    `${C.r}${findings.length} finding(s)${C.x} — the class regime has more than one answer for the same token. ` +
      `Fix the reader, never the lane table: ${C.b}iam.class_lanes${C.x} is the resolver (db-rules §6d-1, DD-216).`,
  );
  return STRICT ? 1 : 0;
}

// Run only when invoked as the script. The pure rules above are exported so a RED proof (and the
// --self-test) can exercise them without the live census firing as an import side effect.
const INVOKED_DIRECTLY = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) main().then((c) => exitAfterDrain(c));
