#!/usr/bin/env npx tsx
/**
 * THE PERSONAL-ROW WALL — a personal row stays personal INSIDE an organization table.
 *
 * WHY THIS EXISTS (V-43 §A, 2026-09-12)
 * -------------------------------------
 * `check:staff-door` asserts that a token whose CLASS is `private` or `confidential` carries no
 * platform-staff lane. That is a per-TOKEN rule, and it is why this defect went straight through it:
 *
 *     note (workbench.notes), class `organization`, keeps platform_admin_all
 *       universe of OTHER people's visibility='personal' notes .... 137
 *       readable by a platform admin ..............................  137
 *
 * The class is decided per token; `visibility='personal'` is decided per ROW, and nothing joined the
 * two. Arman, 2026-09-12: an admin cannot read a person's private data. So the chair's ruling is
 * that the class sets the DEFAULT lane set and a row's `visibility` only NARROWS it — DD-165.
 *
 * `check:staff-door` is the TOKEN axis of the same wall and this is the ROW axis. They are separate
 * guards on purpose: staff-door's population is private/confidential tokens, and this one's
 * population is exactly the tokens staff-door does not look at — the unsuppressed ones that carry a
 * typed `platform.visibility` column (179 of them today, holding 15,106 `personal` rows).
 *
 * WHAT THIS GUARD ASSERTS, for every active token that is NOT suppressed and carries a typed
 * `platform.visibility` column:
 *   A. `platform_admin_all`'s USING excludes `visibility='personal'` — that policy is PERMISSIVE and
 *      grants everything on its own, so an arm-only check would miss it entirely;
 *   B. no permissive policy on the table carries an UNWALLED `is_platform_admin()` arm;
 *   C. no permissive policy carries an UNWALLED `is_super_admin()` arm — INCLUDING the §6e
 *      system-organization arm. Until DD-180 (2026-09-13) that one arm was exempt by name here,
 *      because at the time the kernel `iam.has_access_for_base` still carried its own unwalled copy
 *      and failing the mirror alone would have demanded a wall that changed no access. DD-170 walled
 *      the kernel; DD-180 swept the 167 live policies that had been generated before it. The
 *      exemption has nothing left behind it, so it is gone: the walled §6e form is subtracted from
 *      the policy text like the other two, and anything still saying `is_super_admin` is a finding.
 *      It exposed nothing at the time — zero `personal` rows sat under a global-readable system org,
 *      measured — and that was the whole problem: a wall that holds only because of what the rows
 *      happen to be is not a wall.
 *
 * Known-open rows are NOT silently excused. They are printed by name with the reason, and the list
 * fails in BOTH directions — an unexpected token open is a finding, and an expected one CLOSING is a
 * finding too, so the list shrinks deliberately in a commit instead of rotting into folklore.
 *
 * THE CONTAINMENT AXIS (DD-171, 2026-09-12). The three assertions above read the STAFF arms. They
 * were green on `files.files` while a PLAIN MEMBER — no admin.admins row, no org-admin role — read
 * 8,815 other people's `personal` files, because the parent-folder arm in the same std_select
 * admitted any non-public file once the FOLDER was viewer-accessible and never looked at the file's
 * own visibility. Chair, 2026-09-12: containment carries the container's reach to rows at `internal`
 * and above, never to `personal`. So for every token that carries a typed visibility column AND a
 * composition/containment parent whose FK column exists on the table, this guard also asserts:
 *   D. the emitted parent-FK arm reads `(<fk> IS NOT NULL) AND (visibility >= 'internal'…) AND
 *      (visibility <> 'public'…)`, and NOT the old `(visibility IS NOT NULL)` form — which is every
 *      enum value except public, `personal` included.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS.
 *
 *   pnpm check:row-visibility             # loud, non-blocking (exit 0)
 *   pnpm check:row-visibility --strict    # exit 1 on any finding or UNMEASURED
 *   pnpm check:row-visibility --self-test # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * THE RESIDUE, BY NAME — never a count.
 *
 * Both are tokens `iam.apply_rls` refuses BY CONSTRUCTION, so they keep their bespoke policies AND
 * their unwalled staff arm. Both are already named residue on `check:staff-door` and in DD-137b.
 *  - `access_request` — `audit_class='machinery'`: it owns inputs the access resolver consumes, and
 *    db-rules §6d forbids generic RLS on machinery;
 *  - `wbx_guidance`, `wbx_demo` — both refuse with `42883 operator does not exist: text = uuid`, the
 *    same type mismatch in the same `extend` pair. DD-137b's residue list names only `wbx_guidance`
 *    because `check:staff-door`'s population is private/confidential tokens and `wbx_demo` is classed
 *    `organization` — which is precisely the blind spot DD-165 exists to cover, and this guard found
 *    its twin on the first run. Neither holds a `visibility='personal'` row today (0 and 0, measured
 *    2026-09-12); the REGISTRY/column defect is the thing to fix, not the policy.
 */
const RESIDUE_TOKENS: ReadonlySet<string> = new Set(["access_request", "wbx_guidance", "wbx_demo"]);

/**
 * THE DD-175 RESIDUE, BY NAME AND WITH ITS REASON — never a count, never a tolerance.
 * `agent_card` is a registered COMPONENT of `agent` that is really a definer VIEW over
 * `agent.definition` with an access rule of its own (`card_visibility`), so the parent's row
 * security never runs for it. Measured live 2026-09-12: three non-admin identities each read
 * exactly 1 card whose agent.definition row their own policy refuses. That is not an RLS lane
 * `iam.apply_rls` can regenerate — it is either a view that should carry `security_invoker`, or a
 * catalogue projection that should not be registered as a component at all. It is a product
 * decision about the public agent catalogue, so it is NAMED here rather than changed in a security
 * fix, and it belongs with DD-164 (the definer-view class).
 */
const COMPONENT_RESIDUE: ReadonlyMap<string, string> = new Map([
  ["agent_card", "a definer view over agent.definition with its own card_visibility rule — DD-164; 1 row per non-admin identity, measured 2026-09-12"],
]);

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

/** The two shapes `iam.apply_rls` emits for a walled staff arm, as `pg_get_expr` renders them. */
const W_ADMIN = "(visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)";
const W_SUPER = "(visibility >= 'internal'::platform.visibility) AND is_super_admin()";
/**
 * The WALLED §6e system-organization super-admin arm (DD-180), as `iam.entity_read_expr` emits it
 * and `pg_get_expr` renders it. Subtracted like the other two, so the arm is checked rather than
 * excused: before DD-180 this guard skipped any policy whose text merely MENTIONED `system_orgs`.
 */
const W_SYSORG =
  "(organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND " +
  "( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN " +
  "( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))";

export interface PolicyRow { polname: string; qual: string }
/** A composition/containment parent whose FK column really exists on the child table. */
export interface ParentRow { parent_type: string; fk_column: string }
export interface RowVisibilityRow {
  token: string;
  variant: string;
  policies: PolicyRow[];
  parents?: ParentRow[];
}

/** The pure rule, so --self-test can feed it rows it made up as well as rows it built for real. */
export function unwalledArms(row: RowVisibilityRow): string[] {
  const bad: string[] = [];
  for (const p of row.policies) {
    const q = (p.qual ?? "").replace(/\s+/g, " ");
    if (p.polname === "platform_admin_all" && !q.includes(W_ADMIN)) {
      bad.push(`${p.polname}: USING does not exclude visibility='personal'`);
      continue;
    }
    const rest = q.split(W_ADMIN).join("").split(W_SUPER).join("").split(W_SYSORG).join("");
    if (rest.includes("is_platform_admin")) bad.push(`${p.polname}: unwalled platform-admin arm`);
    else if (rest.includes("is_super_admin")) {
      bad.push(
        rest.includes("system_orgs")
          ? `${p.polname}: unwalled system-organization super-admin arm (DD-180)`
          : `${p.polname}: unwalled super-admin arm`,
      );
    }
  }
  return bad;
}

/**
 * THE CONTAINMENT AXIS (DD-171). The two shapes, as `pg_get_expr` renders them, for one FK column.
 * `wallOld` is the arm as it was emitted before DD-171 — it admits `personal`; `wallNew` is the
 * walled form. A component is exempt: it has no visibility column at all, which is exactly WHY its
 * access is its parent's (db-rules §6d-1).
 */
export function unwalledContainmentArms(row: RowVisibilityRow): string[] {
  if (row.variant === "component" || row.variant === "personal") return [];
  const parents = row.parents ?? [];
  if (parents.length === 0) return [];
  const sel = row.policies.find((p) => p.polname === "std_select");
  if (!sel) return [];
  const q = (sel.qual ?? "").replace(/\s+/g, " ");
  const bad: string[] = [];
  for (const { fk_column } of parents) {
    const oldArm = `(${fk_column} IS NOT NULL) AND (visibility IS NOT NULL) AND (visibility <> 'public'`;
    const newArm = `(${fk_column} IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (visibility <> 'public'`;
    if (q.includes(oldArm)) bad.push(`std_select: ${fk_column} carries the UNWALLED containment arm (admits visibility='personal')`);
    else if (!q.includes(newArm)) bad.push(`std_select: ${fk_column} has no walled containment arm at all`);
  }
  return bad;
}

/** A component's door and the parents it must resolve (DD-175). */
export interface ComponentParentRow { parent_type: string; fk_column: string; parent_schema: string; parent_table: string }
export interface ComponentPolicyRow { polname: string; qual: string; roles: string[] }
export interface ComponentRow {
  token: string;
  relkind: string;
  rls_enabled: boolean;
  security_invoker: boolean;
  keeps_staff_lane: boolean;
  parents: ComponentParentRow[];
  policies: ComponentPolicyRow[];
}

/**
 * THE COMPONENT AXIS (DD-175). A component has no class and no owner column of its own: its access
 * IS its parent's (db-rules §6d-1). So every permissive read door a signed-in client can use must
 * resolve the parent, in one of the three forms that actually do:
 *   * `iam.accessible_entity_ids('<parent>'…`  — the arm iam.entity_read_expr emits;
 *   * `iam.has_access('<parent>'…`             — the kernel, one row at a time
 *                                                 (runtime.global_execution_control carries this);
 *   * a read of the parent TABLE itself        — the strictest of the three, because PostgreSQL
 *     applies row security inside a policy's own subqueries, so the parent's deployed policy does
 *     the filtering and cannot drift from itself. users.credential_attachments is exactly this.
 * The one door allowed to skip the parent is the platform-staff arm, and only while the token's
 * resolved class still HAS a platform-admin lane. `service_role` is not a client door.
 * Row security switched off is the widest lane a component can have, so it is named first.
 */
export function componentDoorsNotThroughParent(row: ComponentRow): string[] {
  if (row.parents.length === 0) return [];
  // A registered component can be a VIEW. A `security_invoker` view runs its query as the CALLER, so
  // the parent table's own row security filters it — the strictest form there is, and nothing to
  // check. A view WITHOUT security_invoker runs as its owner, so the parent's row security does not
  // apply to it at all and its own WHERE clause is the whole lane.
  if (row.relkind === "v" || row.relkind === "m") {
    return row.security_invoker
      ? []
      : ["a definer view over its parent (security_invoker is not set) — the parent's row security never runs, so the view's own WHERE clause is the entire lane"];
  }
  if (!row.rls_enabled) {
    return ["row security is DISABLED — every signed-in client reads every row"];
  }
  const doors = row.policies.filter((p) => !(p.roles ?? []).includes("service_role"));
  if (doors.length === 0) return ["no permissive read policy for a signed-in client exists at all"];
  const bad: string[] = [];
  for (const p of doors) {
    const q = (p.qual ?? "").replace(/\s+/g, " ");
    const throughParent = row.parents.some(
      (x) =>
        q.includes(`accessible_entity_ids('${x.parent_type}'`) ||
        q.includes(`has_access('${x.parent_type}'`) ||
        q.includes(`${x.parent_schema}.${x.parent_table}`),
    );
    if (throughParent) continue;
    if (row.keeps_staff_lane && (q.includes("is_platform_admin") || q.includes("is_super_admin"))) continue;
    bad.push(`${p.polname}: a readable door that never asks the parent`);
  }
  return bad;
}

const COMPONENT_SQL = `
select coalesce(json_agg(x order by x->>'token'), '[]'::json) as j from (
  select json_build_object(
    'token', et.token,
    'relkind', (select cl.relkind::text from pg_class cl
                 where cl.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))),
    'rls_enabled', coalesce((select cl.relrowsecurity from pg_class cl
                              where cl.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))), false),
    'security_invoker', coalesce((select o.option_value = 'true' from pg_class cl,
                                    pg_options_to_table(cl.reloptions) o
                                   where cl.oid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
                                     and o.option_name = 'security_invoker'), false),
    'keeps_staff_lane', (iam.class_lanes(et.token)).platform_admin_lane,
    'parents', coalesce((
       select json_agg(json_build_object('parent_type', er.parent_type, 'fk_column', er.fk_column,
                                         'parent_schema', pt.schema_name, 'parent_table', pt.table_name)
                        order by er.parent_type, er.fk_column)
         from platform.entity_relationships er
         join platform.entity_types pt on pt.token = er.parent_type and pt.is_active
        where er.child_type = et.token and er.kind in ('composition','containment')
          and exists (select 1 from information_schema.columns c2
                       where c2.table_schema = et.schema_name and c2.table_name = et.table_name
                         and c2.column_name = er.fk_column)), '[]'::json),
    'policies', coalesce((
       select json_agg(json_build_object(
                'polname', p.polname,
                'qual', coalesce(pg_get_expr(p.polqual, p.polrelid), 'true'),
                'roles', coalesce((select array_agg(ro.rolname::text)
                                     from unnest(p.polroles) rr join pg_roles ro on ro.oid = rr), '{}'))
                        order by p.polname)
         from pg_policy p
        where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
          and p.polpermissive and p.polcmd in ('r','*')), '[]'::json)
  ) as x
  from platform.entity_types et
  where et.is_active and et.rls_variant = 'component'
    and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
) q`;

const FINDINGS_SQL = `
select coalesce(json_agg(x order by x->>'token'), '[]'::json) as j from (
  select json_build_object(
    'token', et.token,
    'variant', et.rls_variant,
    'policies', coalesce((
       select json_agg(json_build_object('polname', p.polname,
                                         'qual', coalesce(pg_get_expr(p.polqual, p.polrelid), ''))
                        order by p.polname)
         from pg_policy p
        where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
          and p.polpermissive), '[]'::json),
    'parents', coalesce((
       select json_agg(json_build_object('parent_type', er.parent_type, 'fk_column', er.fk_column)
                        order by er.parent_type, er.fk_column)
         from platform.entity_relationships er
        where er.child_type = et.token and er.kind in ('composition','containment')
          and exists (select 1 from information_schema.columns c2
                       where c2.table_schema = et.schema_name and c2.table_name = et.table_name
                         and c2.column_name = er.fk_column)), '[]'::json)
  ) as x
  from platform.entity_types et
  join information_schema.columns c
    on c.table_schema = et.schema_name and c.table_name = et.table_name
   and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  where et.is_active
    and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
    and not coalesce(et.suppress_platform_admin_lane, false)
) q`;

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the detector must find an unwalled staff arm on a visibility table, and must not flag a walled one)${C.x}`);
  let bad = 0;
  const cases: Array<[string, RowVisibilityRow, boolean]> = [
    ["a bare platform_admin_all on a visibility table",
      { token: "x", variant: "entity", policies: [{ polname: "platform_admin_all", qual: "( SELECT is_platform_admin() AS is_platform_admin)" }] }, true],
    ["a walled platform_admin_all",
      { token: "x", variant: "entity", policies: [{ polname: "platform_admin_all", qual: `(${W_ADMIN})` }] }, false],
    ["a std_select whose admin arm is unwalled",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: "(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))" }] }, true],
    ["a std_select whose admin arm is walled",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)))` }] }, false],
    ["a restricted std_select with a bare super-admin arm",
      { token: "x", variant: "restricted", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)) OR is_super_admin())` }] }, true],
    // DD-180: the arm that used to be excused here, and the same arm with the wall. 167 live
    // policies carried the first form until 2026-09-13 and this guard called every one of them fine.
    ["the UNWALLED system-org super-admin arm (the DD-180 defect, on 167 live policies)",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR ((organization_id IS NOT NULL) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))))` }] }, true],
    ["the WALLED system-org super-admin arm, which the generator has emitted since DD-170",
      { token: "x", variant: "entity", policies: [{ polname: "std_select", qual: `((${W_ADMIN}) OR (${W_SYSORG}))` }] }, false],
  ];
  const OLD_ARM = "(parent_folder_id IS NOT NULL) AND (visibility IS NOT NULL) AND (visibility <> 'public'::platform.visibility)";
  const NEW_ARM = "(parent_folder_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (visibility <> 'public'::platform.visibility)";
  const parents = [{ parent_type: "folder", fk_column: "parent_folder_id" }];
  // THE DD-171 AXIS. The first case is the real `files.files` arm as it stood while a plain member
  // read 8,815 other people's personal files; the guard must go RED on it.
  cases.push(
    ["a containment arm that admits any non-public child (the files.files leak)",
      { token: "x", variant: "entity", parents,
        policies: [{ polname: "platform_admin_all", qual: `(${W_ADMIN})` },
                   { polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)) OR (${OLD_ARM} AND (parent_folder_id IN ( SELECT x))))` }] }, true],
    ["a containment arm walled at internal",
      { token: "x", variant: "entity", parents,
        policies: [{ polname: "platform_admin_all", qual: `(${W_ADMIN})` },
                   { polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)) OR (${NEW_ARM} AND (parent_folder_id IN ( SELECT x))))` }] }, false],
    ["a registered containment parent with NO arm emitted at all",
      { token: "x", variant: "entity", parents,
        policies: [{ polname: "platform_admin_all", qual: `(${W_ADMIN})` },
                   { polname: "std_select", qual: `((${W_ADMIN}) OR (created_by = ( SELECT auth.uid() AS uid)))` }] }, true],
    ["a COMPONENT, whose access IS its parent's and which has no visibility column by contract",
      { token: "x", variant: "component", parents,
        policies: [{ polname: "std_select", qual: `(${OLD_ARM} AND (parent_folder_id IN ( SELECT x)))` }] }, false],
  );

  // THE DD-175 AXIS, as pure cases. The first is workbench.udt_document_snapshots as it stood while
  // admin@admin.com read 106 snapshots of documents that table's parent policy refuses them.
  const cparents = [{ parent_type: "udt_document", fk_column: "document_id",
                      parent_schema: "workbench", parent_table: "udt_documents" }];
  const ccases: Array<[string, ComponentRow, boolean]> = [
    ["a component with a staff ALL policy under a parent whose class closes the staff lane",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: false, parents: cparents,
        policies: [{ polname: "platform_admin_all", qual: "( SELECT is_platform_admin() AS is_platform_admin)", roles: ["authenticated"] },
                   { polname: "std_select", qual: "(document_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('udt_document'::text, 'viewer'::permission_level, 0, true))))", roles: ["authenticated"] }] }, true],
    ["the same component once the staff policy is gone",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: false, parents: cparents,
        policies: [{ polname: "std_select", qual: "(document_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('udt_document'::text, 'viewer'::permission_level, 0, true))))", roles: ["authenticated"] }] }, false],
    ["a component whose only door reads the PARENT TABLE (users.credential_attachments' shape)",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: false, parents: cparents,
        policies: [{ polname: "parent_read", qual: "(EXISTS ( SELECT 1 FROM workbench.udt_documents d WHERE (d.id = document_id)))", roles: ["authenticated"] }] }, false],
    ["a component whose door asks the kernel about the parent (global_execution_control's shape)",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: false, parents: cparents,
        policies: [{ polname: "std_select", qual: "iam.has_access('udt_document'::text, document_id, 'viewer'::permission_level)", roles: ["authenticated"] }] }, false],
    ["a component with ROW SECURITY DISABLED (agent.card's shape)",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: false, keeps_staff_lane: false, parents: cparents, policies: [] }, true],
    ["a component whose only policy is service_role, so no client door exists at all",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: false, parents: cparents,
        policies: [{ polname: "svc_all", qual: "true", roles: ["service_role"] }] }, true],
    ["a staff arm on a component whose parent class KEEPS the platform-admin lane",
      { token: "c", relkind: "r", security_invoker: false, rls_enabled: true, keeps_staff_lane: true, parents: cparents,
        policies: [{ polname: "platform_admin_all", qual: "( SELECT is_platform_admin() AS is_platform_admin)", roles: ["authenticated"] },
                   { polname: "std_select", qual: "(document_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('udt_document'::text, 'viewer'::permission_level, 0, true))))", roles: ["authenticated"] }] }, false],
    ["a component that is a security_invoker VIEW — the parent's own row security filters it",
      { token: "c", relkind: "v", security_invoker: true, rls_enabled: false, keeps_staff_lane: false, parents: cparents, policies: [] }, false],
    ["a component that is a DEFINER view — the parent's row security never runs (agent.card's shape)",
      { token: "c", relkind: "v", security_invoker: false, rls_enabled: false, keeps_staff_lane: false, parents: cparents, policies: [] }, true],
  ];
  for (const [name, row, expected] of ccases) {
    const got = componentDoorsNotThroughParent(row).length > 0;
    if (got !== expected) {
      console.log(`  ${C.r}✗${C.x} ${expected ? "RED " : "GREEN"} — ${name}: expected ${expected}, got ${got}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} ${expected ? "RED " : "GREEN"} — ${name}`);
    }
  }

  for (const [name, row, expected] of cases) {
    const got = unwalledArms(row).length + unwalledContainmentArms(row).length > 0;
    if (got !== expected) {
      console.log(`  ${C.r}✗${C.x} ${expected ? "RED " : "GREEN"} — ${name}: expected ${expected}, got ${got}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} ${expected ? "RED " : "GREEN"} — ${name}`);
    }
  }

  // And the same two states built FOR REAL, so the SQL that feeds the detector is proven too.
  const schema = `zz_row_visibility_selftest_${Date.now().toString(36)}`;
  const token = `${schema}_token`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `create table ${schema}.probe (id uuid primary key default gen_random_uuid(),
                     created_by uuid, organization_id uuid,
                     visibility platform.visibility not null default 'personal')`);
    await door(env, `alter table ${schema}.probe enable row level security`);
    await door(env, `insert into platform.entity_types
      (token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
       base_tier, is_versioned, has_soft_delete, data_class, default_list_scope, data_class_reason)
      values ('${token}', '${schema}', 'probe', 'self-test probe', 'entity', true, false, false,
              1, false, false, 'organization', 'organization',
              'check:row-visibility self-test; deleted at the end of the run')`);
    await door(env, `create policy platform_admin_all on ${schema}.probe for all to authenticated
                     using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()))`);

    const pull = async (): Promise<RowVisibilityRow | undefined> => {
      const res = await door(env, FINDINGS_SQL.replace("where et.is_active", `where et.token = '${token}' and et.is_active`));
      return ((res[0] as { j?: RowVisibilityRow[] })?.j ?? [])[0];
    };

    const redRow = await pull();
    if (!redRow || unwalledArms(redRow).length === 0) {
      console.log(`  ${C.r}✗${C.x} RED  — the live query did not flag a real bare platform_admin_all on a visibility table`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the live query flags a real bare platform_admin_all on a visibility table`);
    }

    // …and the CONTAINMENT axis for real: a registered containment edge to `folder`, an arm that
    // admits any non-public child (RED), then the same arm walled at internal (GREEN).
    await door(env, `alter table ${schema}.probe add column parent_folder_id uuid`);
    await door(env, `insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
                     values ('${token}', 'folder', 'parent_folder_id', 'containment')`);
    await door(env, `create policy std_select on ${schema}.probe for select to authenticated
                     using (((visibility >= 'internal'::platform.visibility) and (select public.is_platform_admin()))
                            or (parent_folder_id is not null and visibility is not null and visibility <> 'public'::platform.visibility
                                and parent_folder_id in (select iam.unnest_uuids(iam.accessible_entity_ids('folder', 'viewer'::permission_level, 0, false)))))`);
    const redContainment = await pull();
    if (!redContainment || unwalledContainmentArms(redContainment).length === 0) {
      console.log(`  ${C.r}✗${C.x} RED  — the live query did not flag a real containment arm that admits a personal child`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} RED  — the live query flags a real containment arm that admits a personal child`);
    }
    await door(env, `drop policy std_select on ${schema}.probe`);
    await door(env, `create policy std_select on ${schema}.probe for select to authenticated
                     using (((visibility >= 'internal'::platform.visibility) and (select public.is_platform_admin()))
                            or (parent_folder_id is not null and visibility >= 'internal'::platform.visibility and visibility <> 'public'::platform.visibility
                                and parent_folder_id in (select iam.unnest_uuids(iam.accessible_entity_ids('folder', 'viewer'::permission_level, 0, false)))))`);
    const greenContainment = await pull();
    if (!greenContainment || unwalledContainmentArms(greenContainment).length > 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the live query still flags the containment arm once it is walled: ${greenContainment ? unwalledContainmentArms(greenContainment).join("; ") : "no row"}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — the live query stops flagging the containment arm the moment it is walled`);
    }

    await door(env, `drop policy platform_admin_all on ${schema}.probe`);
    await door(env, `create policy platform_admin_all on ${schema}.probe for all to authenticated
                     using ((visibility >= 'internal'::platform.visibility) and (select public.is_platform_admin()))
                     with check ((select public.is_platform_admin()))`);
    const greenRow = await pull();
    if (!greenRow || unwalledArms(greenRow).length > 0) {
      console.log(`  ${C.r}✗${C.x} GREEN — the live query still flags the table once the arm is walled: ${greenRow ? unwalledArms(greenRow).join("; ") : "no row"}`); bad++;
    } else {
      console.log(`  ${C.g}✓${C.x} GREEN — the live query stops flagging it the moment the arm is walled`);
    }
  } finally {
    // The teardown is not optional: a leftover registered token would break every other guard.
    try { await door(env, `delete from platform.entity_relationships where child_type = '${token}'`); } catch { /* reported below */ }
    try { await door(env, `delete from platform.entity_types where token = '${token}'`); } catch { /* reported below */ }
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* reported below */ }
    const left = await door(env, `select (select count(*) from platform.entity_types where token = '${token}')
                                       + (select count(*) from platform.entity_relationships where child_type = '${token}') as n`);
    if (Number((left[0] as { n?: number })?.n ?? 0) !== 0) {
      console.log(`  ${C.r}✗${C.x} the self-test left its scratch token behind — remove '${token}' by hand`); bad++;
    }
  }

  console.log(bad === 0
    ? `${C.g}✓${C.x} ${C.b}the detector fails when it should and passes when it should${C.x}`
    : `${C.r}✗${C.x} ${C.b}the detector is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE PERSONAL-ROW WALL${C.x} ${C.d}(DD-165 — a personal row stays personal inside an organization table)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: RowVisibilityRow[];
  try {
    const res = await door(env, FINDINGS_SQL);
    rows = ((res[0] as { j?: RowVisibilityRow[] })?.j ?? []);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the structural query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  if (rows.length === 0) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — not one unsuppressed token with a typed visibility column came back, which cannot be right`);
    return STRICT ? 1 : 0;
  }

  console.log(`  ${C.d}${rows.length} active tokens are unsuppressed AND carry a typed platform.visibility column${C.x}`);

  const withParents = rows.filter((r) => (r.parents ?? []).length > 0).length;
  console.log(`  ${C.d}${withParents} of them also carry a composition/containment parent (the DD-171 axis)${C.x}`);

  const open = rows
    .map((r) => ({ row: r, bad: [...unwalledArms(r), ...unwalledContainmentArms(r)] }))
    .filter((x) => x.bad.length > 0);

  // ── THE DD-175 AXIS — a component lane is never wider than its parent's read ──────────────────
  let componentOpen: Array<{ token: string; bad: string[] }> = [];
  let componentCount = 0;
  try {
    const cres = await door(env, COMPONENT_SQL);
    const crows = ((cres[0] as { j?: ComponentRow[] })?.j ?? []);
    const withParents = crows.filter((r) => (r.parents ?? []).length > 0);
    componentCount = withParents.length;
    if (componentCount === 0) throw new Error("not one component token with a registered parent came back");
    componentOpen = withParents
      .map((r) => ({ token: r.token, bad: componentDoorsNotThroughParent(r) }))
      .filter((x) => x.bad.length > 0);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the DD-175 component query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  const unexpected = open.filter((x) => !RESIDUE_TOKENS.has(x.row.token));
  const closed = [...RESIDUE_TOKENS].filter((t) => !open.some((x) => x.row.token === t));

  let findings = 0;
  if (unexpected.length > 0) {
    findings++;
    console.error(`  ${C.r}✗${C.x} ${unexpected.length} token(s) let a platform admin read a person's \`personal\` row and are NOT known residue`);
  } else if (open.length === 0) {
    console.log(`  ${C.g}✓${C.x} no token lets a platform admin read a person's \`personal\` row`);
  } else {
    console.log(`  ${C.g}✓${C.x} the ${open.length} open tokens are EXACTLY the known residue`);
  }
  if (closed.length > 0) {
    findings++;
    console.error(`  ${C.y}!${C.x} ${closed.length} expected-residue token(s) are now WALLED: ${closed.join(", ")}. Good news — remove them from RESIDUE_TOKENS here and from v_expected in migrations/iam_personal_row_wall_dd165g_gate.sql, in the same commit. A residue list that quietly shrinks is a residue list nobody re-reads.`);
  }
  for (const x of open) {
    const mark = RESIDUE_TOKENS.has(x.row.token) ? `${C.d}` : `${C.r}UNEXPECTED ${C.x}${C.d}`;
    console.log(`     ${mark}${x.row.token} (${x.row.variant}): ${x.bad.join("; ")}${C.x}`);
  }

  console.log(`  ${C.d}${componentCount} active component tokens carry a registered parent whose FK column exists (the DD-175 axis)${C.x}`);
  const componentUnexpected = componentOpen.filter((x) => !COMPONENT_RESIDUE.has(x.token));
  const componentClosed = [...COMPONENT_RESIDUE.keys()].filter((t) => !componentOpen.some((x) => x.token === t));
  if (componentUnexpected.length > 0) {
    findings++;
    console.error(`  ${C.r}✗${C.x} ${componentUnexpected.length} component token(s) carry a readable door that never asks the parent and are NOT known residue — a component's access IS its parent's (db-rules §6d-1, DD-175)`);
  } else if (componentOpen.length === 0) {
    console.log(`  ${C.g}✓${C.x} every component's readable doors resolve its parent`);
  } else {
    console.log(`  ${C.g}✓${C.x} the ${componentOpen.length} open component token(s) are EXACTLY the known residue`);
  }
  if (componentClosed.length > 0) {
    findings++;
    console.error(`  ${C.y}!${C.x} ${componentClosed.length} expected DD-175 residue token(s) now resolve their parent: ${componentClosed.join(", ")}. Good news — remove them from COMPONENT_RESIDUE here in the same commit. A residue list that quietly shrinks is a residue list nobody re-reads.`);
  }
  for (const x of componentOpen) {
    const mark = COMPONENT_RESIDUE.has(x.token) ? `${C.d}` : `${C.r}UNEXPECTED ${C.x}${C.d}`;
    const why = COMPONENT_RESIDUE.get(x.token);
    console.log(`     ${mark}${x.token}: ${x.bad.join("; ")}${why ? ` [known residue: ${why}]` : ""}${C.x}`);
  }

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}a personal row stays personal — no staff arm and no containment arm carries one, and no component reads wider than its parent${C.x}`);
    return 0;
  }
  console.log(`${C.r}✗${C.x} ${C.b}${findings} finding(s)${C.x}`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(`${C.r}✗${C.x} check:row-visibility crashed: ${String(e)}`);
  process.exit(1);
});
