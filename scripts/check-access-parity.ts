#!/usr/bin/env npx tsx
/**
 * THE ACCESS PARITY GUARD — the screen and the door must admit the same people.
 *
 * WHY THIS EXISTS
 * ---------------
 * There are TWO implementations of "may this person read this row", and a real product uses both
 * in the same breath:
 *
 *   (a) THE GENERATED READ POLICY — emitted by `iam._apply_rls_unchecked` / `iam.entity_read_expr`.
 *       This is what a real HTTP read runs against, so it decides what a SCREEN shows.
 *   (b) THE RESOLVER — `iam.has_access_for_base`, asked by `iam.has_access_for` from every RPC.
 *       This is what decides whether a DOOR opens: rename, share, move, delete, run.
 *
 * They are separate code and they have drifted. Measured live on 2026-09-22, before this guard
 * existed: the generated policies carry a leading blanket clause `public.is_platform_admin()`
 * (emitted as a literal by `iam.platform_admin_read_prefix`), and `iam.has_access_for_base`
 * contains NO `is_platform_admin` arm at all — its only platform-staff path additionally requires
 * the row's organization to be a global-readable system org AND `public.is_super_admin_for()`.
 * On `agent.definition` that gap is 273 rows owned by other people, in organizations the viewer is
 * not a member of, listed on a platform admin's screen — and every RPC then refuses to act on any
 * of them. A screen showed rows a door would not open.
 *
 * WHY `iam.verify_canonical` DOES NOT ALREADY CATCH IT
 * ---------------------------------------------------
 * `verify_canonical`'s `class_lanes_match_policy` compares the POLICY against `iam.class_lanes`.
 * `class_lanes.platform_admin_lane` is TRUE for every `organization` and `public` token, so the
 * blanket prefix passes that check on its face. `class_lanes` is the REGISTRY's opinion about which
 * lanes may exist; it is not the resolver. This guard compares the policy against what the resolver
 * ACTUALLY ADMITS — class_lanes AND the resolver's own structure — which is a different question
 * and the one a user experiences.
 *
 * HOW BOTH SIDES ARE DERIVED — mechanically, never from memory
 * ------------------------------------------------------------
 *   POLICY SIDE   — the live `std_select` qual (or `ref_all_members_read` on the reference variant)
 *                   is read from `pg_policy`, split into its TOP-LEVEL OR disjuncts, and each
 *                   disjunct is classified into the lane vocabulary below. Permissive policies that
 *                   sit BESIDE std_select and grant SELECT on their own (`platform_admin_all`,
 *                   `platform_admin_select`) are lanes too and are counted as such.
 *   RESOLVER SIDE — `iam.class_lanes(token)` for the class-governed lanes, plus a LIVE READ of
 *                   `iam.has_access_for_base`'s own source for the arms class_lanes says nothing
 *                   about. The `platform_admin` lane is admitted by the resolver if and only if
 *                   that source mentions `is_platform_admin` — so the day somebody adds the arm,
 *                   this guard notices without being edited.
 *
 * THE VERDICT
 * -----------
 *   FAIL — POLICY WIDER THAN RESOLVER on any active token. This is the dangerous direction: a
 *          screen that shows what no door will open. Every token is printed by name with the lane.
 *   FAIL — RESOLVER WIDER THAN POLICY on any active token. Less dangerous and still a defect: a
 *          door that opens on a row the owner's own screen never shows them.
 *   FAIL — UNMEASURED. No credentials, no census, no `std_select` where one is owed: a guard that
 *          could not measure has not passed.
 *
 * WHAT IT DOES NOT CLAIM. It judges only the lanes BOTH sides express in the vocabulary below.
 * Grant, membership, containment and candidate-set disjuncts exist on both sides in shapes this
 * text-level comparison cannot align row-for-row; they are COUNTED and printed on every run so
 * their silence is visible, never assumed. The absence of a finding here is not a proof of parity.
 *
 * This guard is READ-ONLY. It runs no DDL, holds no lock, and needs no build lock.
 *
 *   pnpm check:access-parity
 *   pnpm check:access-parity --strict     # alias; the verdict is the exit code in both modes
 *   pnpm check:access-parity --self-test  # RED then GREEN, against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { stripReadLaneV2Guard } from "./lib/read-lane-v2-guard";
import { loadDbEnv } from "./lib/direct-db";
import { openGateDb } from "./lib/gate-db";
import type { Client } from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * THE RATCHET, for the RESOLVER-WIDER half only. A ceiling that may only fall.
 *
 * 🚨 READ THIS BEFORE TOUCHING IT. `policy_wider` — the dangerous direction, a screen that shows
 * what no door will open — is NEVER ratcheted and NEVER baselined. It fails on the first token,
 * today and every day, and the only way to clear it is to close it. The ratchet exists solely for
 * `resolver_wider`, which is a door opening on a row the person's own screen never showed them:
 * a real defect, a large pre-existing surface (the component owner arm alone is 328 tokens), and
 * work that belongs to the lanes that own those variants. Making that half a wall on day one is
 * how a guard becomes a thing people pass `|| true`. Raising a number here is not a repair.
 */
interface Baseline { resolver_wider_by_lane: Record<string, number> }
function loadBaseline(): Baseline | null {
  const p = resolve(ROOT, "scripts/access-parity-baseline.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as Baseline; } catch { return null; }
}
/** Kept as an alias: the verdict is the exit code in BOTH modes. */
const STRICT = process.argv.includes("--strict");
void STRICT;
const SELF_TEST = process.argv.includes("--self-test");
const LIMIT = (() => {
  const i = process.argv.indexOf("--print");
  if (i === -1) return 25;
  const n = Number(process.argv[i + 1] ?? 25);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER; // `--print 0` means all of them

})();

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * THE LANE VOCABULARY. One entry per access lane BOTH implementations can express. A lane that only
 * one side can express is exactly the finding, so the vocabulary is deliberately the intersection
 * of what can be named, not of what each side happens to carry today.
 */
export const LANES = {
  platform_admin: "the blanket platform-admin read lane — public.is_platform_admin()",
  super_admin_system_org: "the super-admin arm on a global-readable system organization",
  system_org_global: "the global-readable system-organization arm — every signed-in account",
  org_role: "the organization owner/admin lane",
  org_member: "the plain organization-member lane",
  owner: "the row owner's own lane",
  public_visibility: "the visibility = 'public' lane",
} as const;
export type Lane = keyof typeof LANES;

/**
 * Split a boolean expression into its `OR` disjuncts at ONE level. Parenthesis-aware and
 * string-literal-aware; anything inside a nested paren, a quoted literal or a quoted identifier is
 * opaque, so a sub-SELECT is never mistaken for an arm. That is the whole reason this is not a regex.
 */
export function topLevelDisjuncts(qual: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0, i = 0;
  let inSingle = false, inDouble = false;
  while (i < qual.length) {
    const ch = qual.charAt(i);
    if (inSingle) { if (ch === "'") { if (qual[i + 1] === "'") i++; else inSingle = false; } i++; continue; }
    if (inDouble) { if (ch === '"') inDouble = false; i++; continue; }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === "(") { depth++; i++; continue; }
    if (ch === ")") { depth--; i++; continue; }
    if (depth === 0 && /\s/.test(ch)) {
      const m = /^\s+OR\s+/i.exec(qual.slice(i));
      if (m) { out.push(qual.slice(start, i)); i += m[0].length; start = i; continue; }
    }
    i++;
  }
  out.push(qual.slice(start));
  // A qual is almost always one outer paren wrapping everything. Unwrap once and retry, so the
  // real arms are found instead of a single opaque blob.
  if (out.length === 1) {
    const t = (out[0] ?? "").trim();
    if (t.startsWith("(") && t.endsWith(")")) {
      const inner = t.slice(1, -1);
      let d = 0, balanced = true, s = false, dq = false;
      for (let k = 0; k < inner.length; k++) {
        const c = inner.charAt(k);
        if (s) { if (c === "'") { if (inner[k + 1] === "'") k++; else s = false; } continue; }
        if (dq) { if (c === '"') dq = false; continue; }
        if (c === "'") { s = true; continue; }
        if (c === '"') { dq = true; continue; }
        if (c === "(") d++;
        else if (c === ")") { d--; if (d < 0) { balanced = false; break; } }
      }
      if (balanced && d === 0) return topLevelDisjuncts(inner);
    }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Every arm of a qual, at any depth of grouping.
 *
 * 🚨 THE EMITTER DOES NOT WRITE A FLAT DISJUNCTION, AND READING ONE LEVEL IS READING NOTHING.
 * `iam._apply_rls_unchecked` prefixes the admin clause and then wraps the ENTIRE class-built body
 * in a second paren, so `std_select` is literally `(admin_arm OR (owner OR public OR org_admin OR
 * system_org OR member OR super_admin OR containment OR candidates))`. A one-level split sees TWO
 * arms: the prefix, and one opaque blob that mentions every lane's functions at once. A first cut
 * of this guard did exactly that and silently classified the blob by whichever substring it hit
 * first — which made the numbers move by hundreds when the substring order changed, the tell that
 * the reading was never a reading. Descending is not an optimisation; without it the comparison is
 * meaningless.
 */
export function allDisjuncts(qual: string): string[] {
  const out: string[] = [];
  const walk = (expr: string, depth: number) => {
    const parts = topLevelDisjuncts(expr);
    if (parts.length === 1) { out.push(parts[0] ?? expr); return; }
    // 16 is far beyond any generated nesting and stops a pathological qual from recursing forever.
    if (depth >= 16) { out.push(...parts); return; }
    for (const part of parts) walk(part, depth + 1);
  };
  walk(qual, 0);
  return out;
}

/** Classify ONE top-level disjunct. `null` = a lane outside this vocabulary (grant, containment…). */
export function classifyDisjunct(arm: string): Lane | null {
  const a = arm.toLowerCase();
  // 🚨 A CANDIDATE SET IS NOT A LANE, AND IT MENTIONS EVERY LANE'S FUNCTIONS.
  // The `id IN (… UNION …)` arm unions permissions, memberships, reachability and grants, so it
  // contains `iam.my_orgs()` and `iam.organization_member` inside subqueries that key on
  // `granted_to_organization_id`, not on the row's own organization. Classifying it by a bare
  // substring is how a first cut reported 93 phantom `org_member` findings. It is recognised
  // FIRST, and it is deliberately left unclassified rather than aligned by guesswork.
  // `iam.has_access(` is the emitter's own closing conjunct on a candidate set; `accessible_entity_ids`
  // is its opening one. Either marker means this disjunct is a set of IDS, not a lane predicate.
  if (a.includes("accessible_entity_ids") || a.includes("iam.has_access(")) return null;
  if (a.includes("is_platform_admin")) return "platform_admin";
  // Every org lane below must key on the ROW's own organization_id. The `organization_id IN (…)`
  // / `…_for(…, organization_id)` shape is what iam.entity_read_expr emits and what
  // iam.has_access_for_base evaluates as `v_org`; anything else is a different question.
  if (a.includes("is_super_admin") && /(?<![a-z_])organization_id\s+in\s*\(\s*select\s+so\./.test(a)) return "super_admin_system_org";
  if (/(?<![a-z_])organization_id\s+in\s*\(\s*select\s+so\./.test(a) && a.includes("global_readable")) return "system_org_global";
  if (/is_org_admin[a-z_]*\s*\([^)]*(?<![a-z_])organization_id/.test(a)
      || (/(?<![a-z_])organization_id\s+in\s*\(\s*select\s+om\./.test(a) && /role\s*=\s*any\s*\(array\['owner'/.test(a))) return "org_role";
  if (/(?<![a-z_])organization_id\s+in\s*\(\s*select\s+iam\.my_orgs/.test(a)
      || /has_org_access_for\s*\([^)]*(?<![a-z_])organization_id/.test(a)
      || /member_lane_open\s*\(\s*(?<![a-z_])organization_id/.test(a)) return "org_member";
  if (/visibility\s*=\s*'public'/.test(a) && !a.includes("auth.uid")) return "public_visibility";
  // `created_by` then `owner_id` — the same two columns, in the same order, that
  // platform.entity_row_access_attrs falls through and iam.entity_read_expr emits.
  if (a.includes("auth.uid") && /(?<![a-z_])(created_by|owner_id)\s*=\s*\(\s*select\s+auth\.uid/.test(a)) return "owner";
  return null;
}

/** The POLICY's lane set: the std_select disjuncts, plus any permissive staff policy beside it. */
export function policyLanes(
  stdSelect: string | null,
  siblingSelectPolicies: string[],
): { lanes: Set<Lane>; unclassified: number } {
  const lanes = new Set<Lane>();
  let unclassified = 0;
  if (stdSelect) {
    // READ-LANE V2 (P4): the lane-admin guard wraps the whole std_select in `guard AND (…)`, which
    // would make it ONE unclassifiable disjunct. The guard only narrows; judge the lanes inside it.
    for (const arm of allDisjuncts(stripReadLaneV2Guard(stdSelect))) {
      const lane = classifyDisjunct(arm);
      if (lane) lanes.add(lane); else unclassified++;
    }
  }
  // A permissive policy beside std_select grants SELECT on its own say-so, so it IS a lane.
  for (const name of siblingSelectPolicies) {
    if (name === "platform_admin_all" || name === "platform_admin_select") lanes.add("platform_admin");
  }
  return { lanes, unclassified };
}

export interface LaneFacts {
  owner_lane: boolean;
  org_member_lane: boolean;
  org_role_lane: boolean;
  platform_admin_lane: boolean;
  resolved_class: string;
  /** Measured live from iam.has_access_for_base's own source, never assumed. */
  resolver_has_platform_admin_arm: boolean;
  // ── THE STRUCTURAL FACTS. A lane the class ALLOWS still cannot fire if the row has no column
  //    to key it on, and pretending otherwise would make this guard cry drift on ~600 tables that
  //    are in perfect agreement. Each fact below is one branch of
  //    platform.entity_row_access_attrs — the function iam.has_access_for_base reads the row
  //    through — so the resolver side is derived from the resolver's own plumbing, not from taste.
  /** `created_by`, else `owner_id`, else null: the fall-through order of entity_row_access_attrs. */
  owner_col: string | null;
  /** A real `platform.visibility` column. Without one the probe hard-codes a visibility. */
  has_visibility_col: boolean;
  /** `organization_id`. Branch five surfaces it even with no owner column, so the org lanes live. */
  has_org_col: boolean;
  /** platform.entity_types.default_visibility — what branches five and six hand back. */
  default_visibility: string | null;
  /** iam.table_has_visibility(schema, table) — asked of the resolver's OWN helper, not re-derived. */
  table_has_visibility: boolean;
  /** iam.token_is_parented_component(token) — the other half of the resolver's no-visibility escape. */
  token_is_parented_component: boolean;
}

/**
 * `platform.visibility` is an ORDERED enum — personal < internal < link < public — and almost every
 * organization and staff arm in iam.has_access_for_base is walled `v_vis >= 'internal'`.
 */
const VIS_ORDER = ["personal", "internal", "link", "public"] as const;
export function visAtLeastInternal(v: string | null): boolean {
  return VIS_ORDER.indexOf((v ?? "personal") as (typeof VIS_ORDER)[number]) >= 1;
}

/**
 * The RESOLVER's lane set: what `iam.has_access_for_base` actually admits for this token, derived
 * from `iam.class_lanes` for the class-governed arms and from the resolver's own structure for the
 * rest. Each line below is one arm of that function, in its order.
 */
export function resolverLanes(f: LaneFacts): Set<Lane> {
  const lanes = new Set<Lane>();
  // `if v_owner = v_uid then return true` — and v_owner is NULL unless one of the two columns exists.
  if (f.owner_lane && f.owner_col) lanes.add("owner");
  // `v_pub and v_vis = 'public'` — v_vis is the column when there is one; when there is not, the
  // probe hands back 'personal' (branches three and four) or the registry's declared visibility
  // (branches five and six), so the arm can only ever fire on a declared-public catalogue.
  if (f.has_visibility_col || (!f.owner_col && f.default_visibility === "public")) lanes.add("public_visibility");
  // ── The org and staff arms. Three conditions, all of them the resolver's own:
  //    v_org must be non-null (organization_id must exist), the CLASS must carry the lane, and the
  //    row must be able to reach `v_vis >= 'internal'` — which a table with no visibility column
  //    cannot, because the probe hands back 'personal' unless it fell through to the registry's
  //    declared default. DD-136/DD-170 then grant ONE escape to the two admin arms and not to the
  //    plain-member arm: a table with no visibility concept at all, that is not a parented
  //    component, keeps the arm it always had.
  const visReachesInternal = f.has_visibility_col
    || (!f.owner_col && visAtLeastInternal(f.default_visibility));
  const noVisibilityEscape = !f.table_has_visibility && !f.token_is_parented_component;
  const adminVis = visReachesInternal || noVisibilityEscape;
  if (f.org_role_lane && f.has_org_col && adminVis) lanes.add("org_role");
  if (f.org_member_lane && f.has_org_col && visReachesInternal) lanes.add("org_member");
  if ((f.resolved_class === "organization" || f.resolved_class === "public")
      && f.has_org_col && visReachesInternal)
    lanes.add("system_org_global");                                          // DD-185's class gate on the §6e arm
  if (f.platform_admin_lane && f.has_org_col && adminVis) lanes.add("super_admin_system_org");
  if (f.resolver_has_platform_admin_arm) lanes.add("platform_admin");        // measured: TODAY there is no such arm
  return lanes;
}

export interface Disagreement { lane: Lane; direction: "policy_wider" | "resolver_wider" }

/** The whole rule, in one pure function the self-test can hand rows it wrote itself. */
export function disagreements(policy: Set<Lane>, resolver: Set<Lane>): Disagreement[] {
  const out: Disagreement[] = [];
  for (const lane of Object.keys(LANES) as Lane[]) {
    const p = policy.has(lane), r = resolver.has(lane);
    if (p && !r) out.push({ lane, direction: "policy_wider" });
    else if (r && !p) out.push({ lane, direction: "resolver_wider" });
  }
  return out;
}

type TokenRow = {
  token: string; schema_name: string; table_name: string; rls_variant: string;
  data_class: string | null; suppress_platform_admin_lane: boolean;
  std_select: string | null; select_policies: string[];
  owner_lane: boolean; org_member_lane: boolean; org_role_lane: boolean;
  platform_admin_lane: boolean; resolved_class: string;
  owner_col: string | null; has_visibility_col: boolean; has_org_col: boolean;
  default_visibility: string | null;
  table_has_visibility: boolean; token_is_parented_component: boolean;
};

/**
 * 🚨 ONE ROUND TRIP, AND THE POLICY TEXT COMES BACK WHOLE. `iam.class_lanes` is a per-token
 * SECURITY DEFINER call with a recursive walk inside it; asking it ~1,000 times from the client
 * would be ~1,000 round trips over the pooler. It is asked once per token INSIDE the query.
 */
const CENSUS_SQL = `
with tok as (
  select et.token, et.schema_name, et.table_name, et.rls_variant,
         et.data_class::text as data_class,
         coalesce(et.suppress_platform_admin_lane, false) as suppress_platform_admin_lane,
         et.default_visibility::text as default_visibility,
         c.oid as relid,
         -- The three structural facts, read from the catalog exactly as
         -- iam.entity_read_expr and platform.entity_row_access_attrs read them.
         exists (select 1 from pg_attribute a where a.attrelid = c.oid
                   and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped) as has_org_col,
         exists (select 1 from pg_attribute a join pg_type ty on ty.oid = a.atttypid
                  join pg_namespace tn on tn.oid = ty.typnamespace
                  where a.attrelid = c.oid and a.attname = 'visibility'
                    and tn.nspname = 'platform' and ty.typname = 'visibility'
                    and a.attnum > 0 and not a.attisdropped) as has_visibility_col,
         case
           when exists (select 1 from pg_attribute a where a.attrelid = c.oid
                          and a.attname = 'created_by' and a.attnum > 0 and not a.attisdropped) then 'created_by'
           when exists (select 1 from pg_attribute a where a.attrelid = c.oid
                          and a.attname = 'owner_id' and a.attnum > 0 and not a.attisdropped) then 'owner_id'
         end as owner_col
    from platform.entity_types et
    join pg_class c on c.relname = et.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = et.schema_name
   where et.is_active and c.relkind = 'r'
),
pol as (
  select t.token,
         (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
           where p.polrelid = t.relid and p.polname = 'std_select') as std_select_raw,
         (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
           where p.polrelid = t.relid and p.polname = 'ref_all_members_read') as ref_select_raw,
         coalesce((select array_agg(p.polname order by p.polname) from pg_policy p
                    where p.polrelid = t.relid and p.polcmd in ('r','*')), '{}'::text[]) as select_policies
    from tok t
)
select t.token, t.schema_name, t.table_name, t.rls_variant, t.data_class,
       t.suppress_platform_admin_lane, t.default_visibility,
       t.has_org_col, t.has_visibility_col, t.owner_col,
       coalesce(p.std_select_raw, p.ref_select_raw) as std_select,
       p.select_policies,
       l.owner_lane, l.org_member_lane, l.org_role_lane, l.platform_admin_lane,
       l.resolved_class::text as resolved_class,
       -- Asked of the RESOLVER'S OWN helpers, so a change to either is a change to this guard.
       coalesce(iam.table_has_visibility(t.schema_name, t.table_name), false) as table_has_visibility,
       coalesce(iam.token_is_parented_component(t.token), false) as token_is_parented_component
  from tok t
  join pol p on p.token = t.token
  cross join lateral iam.class_lanes(t.token) l
 order by t.schema_name, t.table_name`;

/** The resolver's own structure, read live. No memory, no constant. */
const RESOLVER_SQL = `
select bool_or(p.prosrc ilike '%is_platform_admin%') as has_platform_admin_arm,
       count(*)::int as overloads
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'iam' and p.proname = 'has_access_for_base'`;

async function selfTest(db: Client): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the parser, the rule, and the live state both halves describe)${C.x}`);
  let bad = 0;
  const ok = (label: string, pass: boolean) => {
    if (pass) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  };

  // ── 1. THE PARSER. A sub-SELECT containing the word OR must not become an arm. ──
  const q = "((a = 1) OR (b IN ( SELECT x FROM t WHERE (p OR q))) OR (c = 'a OR b'))";
  ok("the splitter finds 3 top-level arms and is not fooled by OR inside a sub-SELECT or a literal",
     topLevelDisjuncts(q).length === 3);
  ok("the splitter respects nesting: one arm wrapping two is ONE arm at the top level, not two",
     topLevelDisjuncts("(((a = 1) OR (b = 2)) OR (c = 3))").length === 2);
  ok("RED   — and the DESCENT is what makes the reading real: the same expression has 3 arms in all",
     allDisjuncts("(((a = 1) OR (b = 2)) OR (c = 3))").length === 3);

  // ── 1b. READ-LANE V2 (P4): a guarded std_select is judged by the lanes INSIDE the guard. ──
  {
    const inner = "((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility))";
    const guarded = `((( SELECT is_platform_admin() AS is_platform_admin) IS NOT TRUE) AND (${inner}))`;
    const g = policyLanes(guarded, []);
    ok("GREEN — read-lane v2: a guarded std_select yields its owner and public lanes, nothing unclassified, no platform_admin lane",
       g.lanes.has("owner") && g.lanes.has("public_visibility") && !g.lanes.has("platform_admin") && g.unclassified === 0);
  }

  // ── 2. THE CLASSIFIER, on the exact text Postgres prints. ──
  ok("classifies the blanket platform-admin arm",
     classifyDisjunct("((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin))") === "platform_admin");
  ok("classifies the super-admin system-org arm as super-admin, not as the global-readable arm",
     classifyDisjunct("((organization_id IS NOT NULL) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)))") === "super_admin_system_org");
  ok("classifies the global-readable system-org arm",
     classifyDisjunct("((organization_id IS NOT NULL) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)))") === "system_org_global");
  ok("classifies the organization owner/admin arm",
     classifyDisjunct("(organization_id IN ( SELECT om.organization_id FROM iam.organization_member om WHERE ((om.user_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])))))") === "org_role");
  ok("classifies the plain member arm",
     classifyDisjunct("((organization_id IS NOT NULL) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))") === "org_member");
  ok("classifies the owner arm", classifyDisjunct("(created_by = ( SELECT auth.uid() AS uid))") === "owner");
  ok("classifies the public-visibility arm", classifyDisjunct("(visibility = 'public'::platform.visibility)") === "public_visibility");
  ok("leaves a containment/grant arm unclassified rather than guessing a lane for it",
     classifyDisjunct("(id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('agent'::text, 'viewer'::permission_level, 0, true))))") === null);
  ok("RED   — `granted_to_organization_id IN (SELECT iam.my_orgs())` is a GRANT, not the row's own organization: 60 phantom findings came from the missing word boundary",
     classifyDisjunct("((id IN ( SELECT p.resource_id FROM iam.permissions p WHERE (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))))") === null);
  ok("does NOT read a candidate set as an organization lane just because iam.my_orgs() appears inside it",
     classifyDisjunct("((id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('agent'::text, 'viewer'::permission_level, 0, true)) UNION SELECT p.resource_id FROM iam.permissions p WHERE (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))) AND iam.has_access('agent'::text, id, 'viewer'::permission_level))") === null);

  // ── 3. THE RULE. RED, then the exact shape that makes it GREEN. ──
  const facts: LaneFacts = {
    owner_lane: true, org_member_lane: true, org_role_lane: true, platform_admin_lane: true,
    resolved_class: "organization", resolver_has_platform_admin_arm: false,
    owner_col: "created_by", has_visibility_col: true, has_org_col: true, default_visibility: "personal",
    table_has_visibility: true, token_is_parented_component: false,
  };
  const red = disagreements(new Set<Lane>(["platform_admin", "owner", "public_visibility", "org_role", "org_member", "system_org_global", "super_admin_system_org"]), resolverLanes(facts));
  ok("RED   — a policy carrying the blanket admin lane disagrees with a resolver that has no such arm",
     red.length === 1 && red[0]?.lane === "platform_admin" && red[0]?.direction === "policy_wider");
  const green = disagreements(new Set<Lane>(["owner", "public_visibility", "org_role", "org_member", "system_org_global", "super_admin_system_org"]), resolverLanes(facts));
  ok("GREEN — THE SHAPE THAT CLEARS IT: the same policy with the blanket arm gone, nothing else changed",
     green.length === 0);
  const greenOther = disagreements(new Set<Lane>(["platform_admin", "owner", "public_visibility", "org_role", "org_member", "system_org_global", "super_admin_system_org"]),
                                   resolverLanes({ ...facts, resolver_has_platform_admin_arm: true }));
  ok("GREEN — or the OTHER repair: the resolver grows the same arm, and the guard sees that live",
     greenOther.length === 0);
  ok("GREEN — an org-scoped table with NO visibility column reaches no org-member lane: the probe hands back 'personal' and the arm is walled at internal",
     !resolverLanes({ ...facts, has_visibility_col: false, table_has_visibility: false }).has("org_member"));
  ok("RED   — and the two ADMIN arms keep DD-136's escape on that same table, so they are still expected",
     resolverLanes({ ...facts, has_visibility_col: false, table_has_visibility: false }).has("org_role"));
  ok("GREEN — but a parented component does not get that escape",
     !resolverLanes({ ...facts, has_visibility_col: false, table_has_visibility: false, token_is_parented_component: true }).has("org_role"));
  const rw = disagreements(new Set<Lane>(["owner", "public_visibility"]), resolverLanes(facts));
  ok("RED   — and the other direction is a finding too: a door the owner's own screen never shows",
     rw.length === 4 && rw.every((d) => d.direction === "resolver_wider"));

  // ── 4. THE LIVE HALF. Both shapes exist on the real database right now, and this proves the
  //      whole pipeline — census SQL, parser, rule — separates them without being told which. ──
  const rows = (await db.query(CENSUS_SQL)).rows as TokenRow[];
  const r = (await db.query(RESOLVER_SQL)).rows[0] as { has_platform_admin_arm: boolean | null };
  const arm = r?.has_platform_admin_arm === true;
  let liveRed = 0, liveGreen = 0;
  for (const row of rows) {
    if (!row.std_select) continue;
    const { lanes } = policyLanes(row.std_select, row.select_policies ?? []);
    const res = resolverLanes({ ...row, resolver_has_platform_admin_arm: arm });
    const d = disagreements(lanes, res).filter((x) => x.lane === "platform_admin");
    if (d.length > 0) liveRed++;
    else if (row.suppress_platform_admin_lane) liveGreen++;
  }
  ok(`RED   — live: ${liveRed} active tokens whose policy carries a lane the resolver has not`, liveRed > 0);
  ok(`GREEN — live: ${liveGreen} tokens ALREADY have the clearing shape (suppress_platform_admin_lane, no blanket arm emitted) and are not flagged`, liveGreen > 0);

  console.log(bad === 0 ? `${C.g}✓${C.x} ${C.b}the guard fails when it should and passes when it should${C.x}`
                        : `${C.r}✗${C.x} ${C.b}the guard is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE ACCESS PARITY GUARD${C.x} ${C.d}(the generated read policy and iam.has_access_for_base must admit the same lanes)${C.x}`);
  const env = loadDbEnv();
  if ("missing" in env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no direct database credentials (${env.missing.join(", ")}). This is a FAILURE, not a pass.`);
    return 1;
  }
  console.log(`  ${C.d}${env.host}/${env.database} (credentials from ${env.from})${C.x}`);
  // No session `set statement_timeout` here any more: through the transaction pooler it stuck to
  // a pooled backend and was inherited by the next client (2026-09-25). The gate helper sets the
  // ceiling inside every transaction instead.
  const db = await openGateDb(env, { gate: "check-access-parity" });
  try {
    if (SELF_TEST) return await selfTest(db);

    let rows: TokenRow[];
    let armRow: { has_platform_admin_arm: boolean | null; overloads: number };
    try {
      rows = (await db.query(CENSUS_SQL)).rows as TokenRow[];
      armRow = (await db.query(RESOLVER_SQL)).rows[0] as { has_platform_admin_arm: boolean | null; overloads: number };
    } catch (e) {
      console.log(`  ${C.r}✗${C.x} UNMEASURED — the census query failed: ${String(e)}`);
      return 1;
    }
    if (rows.length === 0 || !armRow || Number(armRow.overloads ?? 0) === 0) {
      console.log(`  ${C.r}✗${C.x} UNMEASURED — the census returned nothing, or iam.has_access_for_base is not there to read.`);
      return 1;
    }
    const arm = armRow.has_platform_admin_arm === true;

    let withPolicy = 0, withoutPolicy = 0, unclassifiedTotal = 0;
    const byLane = new Map<string, TokenRow[]>();
    const offenders: Array<{ row: TokenRow; d: Disagreement[] }> = [];
    for (const row of rows) {
      if (!row.std_select) { withoutPolicy++; continue; }
      withPolicy++;
      const { lanes, unclassified } = policyLanes(row.std_select, row.select_policies ?? []);
      unclassifiedTotal += unclassified;
      const res = resolverLanes({ ...row, resolver_has_platform_admin_arm: arm });
      const d = disagreements(lanes, res);
      if (d.length === 0) continue;
      offenders.push({ row, d });
      for (const one of d) {
        const key = `${one.lane}:${one.direction}`;
        byLane.set(key, [...(byLane.get(key) ?? []), row]);
      }
    }

    console.log(`  ${C.d}${rows.length} active registered tokens on a real table — ${withPolicy} carry a generated read policy this guard can read, ${withoutPolicy} carry none (a bespoke or machinery table; not this guard's question)${C.x}`);
    console.log(`  ${C.d}iam.has_access_for_base: ${armRow.overloads} overloads, and its source ${arm ? "DOES" : "does NOT"} contain an is_platform_admin arm — measured this run, not remembered${C.x}`);
    console.log(`  ${C.d}${unclassifiedTotal} policy disjuncts fall outside this vocabulary (grant, membership, containment, candidate sets). They are NOT judged and NOT counted as agreement.${C.x}`);

    const policyWider = offenders.filter((o) => o.d.some((x) => x.direction === "policy_wider"));
    if (process.argv.includes("--json")) {
      const census: Record<string, number> = {};
      for (const [key, list] of byLane) census[key] = list.length;
      console.log(JSON.stringify({ active_tokens: rows.length, with_policy: withPolicy,
        without_policy: withoutPolicy, disagreeing_tokens: offenders.length, by_lane: census }, null, 2));
    }
    if (offenders.length === 0) {
      console.log(`${C.g}✓${C.x} ${C.b}every active token's read policy and the resolver admit the same lanes${C.x}`);
      return 0;
    }

    console.log(`  ${C.r}✗${C.x} ${C.b}${offenders.length}${C.x} of ${withPolicy} active tokens disagree — the screen and the door do not admit the same people. ${C.b}${policyWider.length}${C.x} of them in the DANGEROUS direction.`);
    const keys = [...byLane.keys()].sort((a, b) => ((byLane.get(b)?.length ?? 0) - (byLane.get(a)?.length ?? 0)));
    for (const key of keys) {
      const [lane, direction] = key.split(":") as [Lane, Disagreement["direction"]];
      const list = byLane.get(key) ?? [];
      const danger = direction === "policy_wider";
      console.log(`     ${danger ? C.r : C.y}${list.length}${C.x} tokens — ${C.b}${direction === "policy_wider" ? "POLICY WIDER THAN RESOLVER" : "resolver wider than policy"}${C.x} on ${LANES[lane]}`);
      console.log(`       ${C.d}${danger
        ? "The policy admits people the resolver refuses: a screen lists rows, and every RPC then declines to act on them."
        : "The resolver admits people the policy refuses: a door opens on a row the person's own screen never showed them."}${C.x}`);
      const shown = list.slice(0, LIMIT);
      for (const t of shown) {
        console.log(`       ${C.d}${t.schema_name}.${t.table_name}  [${t.token}]  class=${t.resolved_class} variant=${t.rls_variant}${t.suppress_platform_admin_lane ? " suppressed" : ""}${C.x}`);
      }
      if (list.length > shown.length) console.log(`       ${C.d}… and ${list.length - shown.length} more (pass --print ${list.length} to see them all)${C.x}`);
    }
    // ── THE VERDICT ───────────────────────────────────────────────────────────────────────────
    let findings = policyWider.length > 0 ? 1 : 0;
    const baseline = loadBaseline();
    const nowByLane: Record<string, number> = {};
    for (const [key, list] of byLane) {
      if (!key.endsWith(":resolver_wider")) continue;
      nowByLane[key.split(":")[0] ?? key] = list.length;
    }
    if (!baseline) {
      findings++;
      console.log(`  ${C.r}✗${C.x} UNMEASURED — scripts/access-parity-baseline.json is missing or unreadable, so the resolver-wider ratchet has no ceiling to compare against. That is a failure, not a pass.`);
    } else {
      const risen = Object.entries(nowByLane).filter(([lane, n]) => n > (baseline.resolver_wider_by_lane[lane] ?? 0));
      if (risen.length > 0) {
        findings++;
        console.log(`  ${C.r}✗${C.x} the resolver-wider ratchet has been BROKEN — a door opened on rows a screen does not show, on a lane that was not drifting before:`);
        for (const [lane, n] of risen) {
          console.log(`     ${C.r}${baseline.resolver_wider_by_lane[lane] ?? 0} → ${n}${C.x} on ${LANES[lane as Lane]}`);
        }
        console.log(`     ${C.d}Close the new ones. Raising the number in the baseline file is not one of the options.${C.x}`);
      } else {
        const fell = Object.entries(baseline.resolver_wider_by_lane).filter(([lane, n]) => (nowByLane[lane] ?? 0) < n);
        console.log(`  ${C.g}✓${C.x} the resolver-wider ratchet holds${fell.length > 0 ? `, and ${fell.length} lane(s) FELL (${fell.map(([l, n]) => `${l} ${n} → ${nowByLane[l] ?? 0}`).join(", ")}) — lower the ceiling in scripts/access-parity-baseline.json in the same commit` : ""}`);
      }
    }
    if (policyWider.length > 0) {
      console.log(`  ${C.r}✗${C.x} ${C.b}${policyWider.length} tokens are POLICY WIDER THAN RESOLVER${C.x} — this half is never ratcheted and never baselined.`);
    }

    console.log(`  ${C.d}THE TWO SHAPES THAT CLEAR A policy_wider FINDING, and there is no third: the policy stops emitting the lane, or the resolver grows the same arm. Both are read live on every run. Narrowing this guard's vocabulary is not one of them.${C.x}`);
    console.log(`  ${C.d}This comparison is text-level over the lanes both sides can name, so it is a FLOOR on the drift and never a ceiling. The absence of a finding is not a proof of parity.${C.x}`);
    if (findings === 0) {
      console.log(`${C.g}✓${C.x} ${C.b}no screen shows what a door will not open, and the resolver-wider distance is not growing${C.x}`);
      return 0;
    }
    // The verdict IS the exit code in both modes; --strict is an alias. A guard whose printed
    // finding does not reach `$?` is a guard nobody is obeying.
    return 1;
  } finally {
    await db.end();
  }
}

main().then(exitAfterDrain).catch((e) => {
  console.error(`${C.r}✗${C.x} check:access-parity crashed: ${String(e)}`);
  exitAfterDrain(1);
});
