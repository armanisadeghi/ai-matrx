-- iam_component_never_wider_than_parent_dd175a_baseline — DD-175: A COMPONENT LANE IS NEVER WIDER
-- THAN ITS PARENT'S READ. The certifier, the RED, and the fleet access baseline.
--
-- THE DEFECT, DIAGNOSED RATHER THAN ASSUMED (measured live 2026-09-12, DB brsgrqvjdzwihsvnfqkf)
-- --------------------------------------------------------------------------------------------
-- B-57 reported that `iam.accessible_entity_ids('udt_document','viewer')` returns 13 ids where
-- `workbench.udt_documents`' own RLS admits 2 (27 vs 1 for an organization admin, 9 vs 1 for a
-- member). Diffing those ids by lane answers WHY, exactly:
--
--   every extra id is an ORGANIZATION lane, and `udt_document` is class `private`.
--
--   principal                   extra ids   created_by self   visibility   org member   org role
--   test@test.com                      11              no       internal          yes     member
--   arman@titaniumsuccess.com          26              no       internal          yes      admin
--   seo@titaniumsuccess.com             8              no       internal          yes     member
--
-- `iam.has_access_for_base` gates the organization-member, organization-role and platform-staff
-- lanes on `iam.class_lanes` (DD-137b), and `iam.entity_read_expr` filters the same three arms out
-- of every policy it emits from the SAME function. `iam.accessible_entity_ids` — the SET form —
-- never learned it. It emits all three unconditionally.
--
-- On the parent's own `std_select` that is harmless: the set is one CANDIDATE among several and the
-- policy ANDs `iam.has_access(token, id, 'viewer')` behind it, which asks the class. On a generated
-- COMPONENT lane it is a live leak, because the component's parent arm
--     `<fk> in (select iam.unnest_uuids(iam.accessible_entity_ids('<parent>','viewer',0,true)))`
-- is a standalone arm with NOTHING behind it (iam.entity_read_expr, "MIRROR THE DEPLOYED LANE
-- HERE"; and D266 forbids a component from resolving its own token's candidate set).
--
-- WHAT THAT COST, MEASURED ON THE REAL TABLES WITH REAL IDENTITIES (2026-09-12, before this round)
-- ----------------------------------------------------------------------------------------------
--   component table                       principal                    readable   parent refuses
--   docproc.processed_document_pages      arman@titaniumsuccess.com       3,476            2,313
--   workbench.udt_document_snapshots      admin@admin.com                   243              106
--   workbench.udt_workbook_snapshots      admin@admin.com                   111               87
--   chat.agent_run_stage                  admin@admin.com                   435               57
--   chat.tool_call                        admin@admin.com                 8,773               47
--   workbench.udt_dataset_rows            test@test.com / arman@ts          827               31
--   workbench.udt_dataset_fields          test@test.com / arman@ts           52               20
--   workbench.udt_structured_list_items   test@test.com / arman@ts           15               15
--
-- 133 of the 314 live component tokens hang off a parent whose class closes one of those lanes
-- (48 under a `private` parent, 85 under a `confidential` one), so this is a class, not a table.
--
-- THIS FILE MEASURES AND RECORDS. It changes no access. dd175b moves the set form and installs the
-- structural check; dd175c regenerates what the check reports open; dd175d is the gate.

-- This fleet-wide RED probe intentionally evaluates every active component/parent pair across
-- six real principals. Production needed more than the session's 120-second default while still
-- making forward progress, so give this one bounded migration enough time to finish.
set local statement_timeout = '10min';

-- ── 1. THE CERTIFIER ─────────────────────────────────────────────────────────────────────────────
-- 🚨 DD-175 — THE CERTIFIER: a component lane is never wider than its PARENT'S OWN READ.
--
-- The question is asked against the parent's DEPLOYED POLICY, never against a mirror of it.
-- PostgreSQL applies row security to every table a query touches, so under an impersonated
-- principal `select id from <parent> where id = any($1)` IS the parent's answer. (Proven live on
-- users.credential_attachments, whose only read policy is a bare
-- `exists (select 1 from users.credential_items where id = credential_item_id)` with no access
-- predicate of its own: test@test.com reads 0 of its 4 rows and admin@admin.com reads 3.)
--
-- It walks the PARENT side, not the component side, and that is deliberate: the parent-FK arm every
-- generated component carries is `<fk> in (select ... iam.accessible_entity_ids('<parent>' ...))`,
-- so the ids that arm admits ARE that function's answer. Diffing them against the parent's policy
-- is exact for the lane, and it costs one indexed FK lookup per component instead of a full
-- RLS-evaluated scan of tables like chat.message (measured: the component-side form did not finish
-- in 10 minutes; this one runs in seconds).
create or replace function iam.component_wider_than_parent(
  p_principals uuid[] default null,
  p_token text default null)
returns table(component_token text, component_table text, parent_type text, fk_column text,
              principal uuid, principal_email text, parent_ids_admitted int, parent_ids_refused int,
              rows_readable_under_refused_parent bigint, probe_error text)
language plpgsql as $$
declare
  r record; v_ids uuid[]; v_ok uuid[]; v_bad uuid[]; v_n bigint;
  v_err text; v_count_err text; v_email text;
  v_principals uuid[] := coalesce(p_principals, (select array_agg(user_id) from iam.entity_read_probe_users(6)));
  v_p uuid; v_prev_parent text; v_prev_principal uuid;
begin
  if v_principals is null or cardinality(v_principals) = 0 then
    raise exception 'component_wider_than_parent: no principals. A read probe over nobody proves nothing.';
  end if;
  -- Probe each parent policy once per principal, then reuse that answer for every component under
  -- the parent. Component-first order repeated the expensive parent-policy probe for each sibling.
  foreach v_p in array v_principals loop
    v_email := (select email from auth.users where id = v_p);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_p::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_prev_parent := null;

    for r in
    select distinct et.token, et.schema_name, et.table_name, er.parent_type, er.fk_column,
           pt.schema_name as p_schema, pt.table_name as p_table
    from platform.entity_types et
    join platform.entity_relationships er on er.child_type = et.token and er.kind in ('composition','containment')
    join platform.entity_types pt on pt.token = er.parent_type and pt.is_active
    where et.is_active and et.rls_variant = 'component'
      and (p_token is null or et.token = p_token)
      and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
      and to_regclass(format('%I.%I', pt.schema_name, pt.table_name)) is not null
      and exists (select 1 from information_schema.columns c
                   where c.table_schema = et.schema_name and c.table_name = et.table_name
                     and c.column_name = er.fk_column)
      and exists (select 1 from information_schema.columns c
                   where c.table_schema = pt.schema_name and c.table_name = pt.table_name
                     and c.column_name = 'id' and c.udt_name = 'uuid')
    order by er.parent_type, et.token, er.fk_column
    loop
      v_n := 0; v_count_err := null;
      if v_prev_parent is distinct from r.parent_type then
        v_ids := null; v_ok := null; v_bad := null; v_err := null;
        begin
        -- exactly what the generated component arm resolves
        v_ids := iam.accessible_entity_ids(r.parent_type, 'viewer'::public.permission_level, 0, true);
        -- and exactly what the parent's own deployed policy hands this principal back
        execute format('select coalesce(array_agg(p.id), ''{}'') from %I.%I p where p.id = any($1)',
                       r.p_schema, r.p_table) into v_ok using coalesce(v_ids, '{}'::uuid[]);
        select coalesce(array_agg(x), '{}') into v_bad
          from unnest(coalesce(v_ids,'{}'::uuid[])) x
         where not (x = any(coalesce(v_ok, '{}'::uuid[])));
        exception when others then
          v_err := format('%s: %s', sqlstate, sqlerrm);
        end;
        v_prev_parent := r.parent_type;
      end if;

      if v_err is null and coalesce(array_length(v_bad,1),0) > 0 then
        begin
          execute format('select count(*) from %I.%I t where t.%I = any($1)',
                         r.schema_name, r.table_name, r.fk_column) into v_n using v_bad;
        exception when others then
          v_count_err := format('%s: %s', sqlstate, sqlerrm);
        end;
      end if;
      if v_err is null and v_count_err is null and coalesce(array_length(v_bad,1),0) = 0 then
        continue;
      end if;
      component_token := r.token; component_table := r.schema_name||'.'||r.table_name;
      parent_type := r.parent_type; fk_column := r.fk_column;
      principal := v_p; principal_email := coalesce(v_email, v_p::text);
      parent_ids_admitted := coalesce(array_length(v_ids,1),0);
      parent_ids_refused := coalesce(array_length(v_bad,1),0);
      rows_readable_under_refused_parent := v_n; probe_error := coalesce(v_err, v_count_err);
      return next;
    end loop;
    perform set_config('role', 'postgres', true);
  end loop;
end $$;

-- ── 2. THE RED, RECORDED RATHER THAN REMEMBERED ──────────────────────────────────────────────────
-- Six real identities: a platform admin, an organization admin, two members of that organization,
-- a second organization's member, and a non-member. The rows go on disk so dd175d compares against
-- what was measured, not against what anyone remembers measuring.
create table if not exists iam.dd175_component_lane_baseline(
  phase text not null check (phase in ('BEFORE','AFTER')),
  component_token text not null,
  component_table text not null,
  parent_type text not null,
  fk_column text not null,
  principal_email text not null,
  parent_ids_admitted int not null,
  parent_ids_refused int not null,
  rows_readable_under_refused_parent bigint not null,
  probe_error text,
  measured_at timestamptz not null default now()
);
comment on table iam.dd175_component_lane_baseline is
  'DD-175: component rows readable under a parent row the principal''s own parent policy refuses, before and after the set form learned iam.class_lanes.';

do $$
declare v_p uuid[]; v_rows bigint; v_pairs int;
begin
  if exists (select 1 from iam.dd175_component_lane_baseline where phase = 'BEFORE') then
    raise notice 'dd175a: the BEFORE probe is already on record';
    return;
  end if;
  select array_agg(id) into v_p from auth.users
   where email in ('admin@admin.com','arman@titaniumsuccess.com','seo@titaniumsuccess.com',
                   'projectmanager@titaniumsuccess.com','test@test.com','kelvin.kiprop96@gmail.com');
  if coalesce(array_length(v_p,1),0) < 6 then
    raise exception 'dd175a: only % of the 6 named probe identities resolved. A baseline over a '
      'different cast than dd175d will re-probe is not a baseline.', coalesce(array_length(v_p,1),0);
  end if;

  insert into iam.dd175_component_lane_baseline(
    phase, component_token, component_table, parent_type, fk_column, principal_email,
    parent_ids_admitted, parent_ids_refused, rows_readable_under_refused_parent, probe_error)
  select 'BEFORE', w.component_token, w.component_table, w.parent_type, w.fk_column,
         coalesce(w.principal_email, w.principal::text),
         w.parent_ids_admitted, w.parent_ids_refused, w.rows_readable_under_refused_parent,
         w.probe_error
  from iam.component_wider_than_parent(v_p) w;

  select count(*), coalesce(sum(rows_readable_under_refused_parent),0)
    into v_pairs, v_rows
    from iam.dd175_component_lane_baseline where phase = 'BEFORE';

  -- A forcing test that finds nothing to close is a broken measurement, not a clean system.
  if v_rows = 0 then
    raise exception 'dd175a: the RED probe found NO component row readable under a parent its own '
      'policy refuses. Either this is already fixed (it is not — dd175b has not run) or the probe '
      'is not probing. Refusing to record a baseline of zero.';
  end if;
  raise notice 'dd175a RED: % (component, parent, principal) reading(s), % component row(s) '
    'readable under a parent row the principal may not read', v_pairs, v_rows;
end $$;

-- ── 3. THE FLEET ACCESS BASELINE ─────────────────────────────────────────────────────────────────
-- The fix lands in `iam.accessible_entity_ids` — machinery every generated policy calls — so the
-- gate cannot be scoped to the components. The cast is DERIVED, never hand-typed, and written down
-- so dd175d re-probes exactly the same set: every active token whose class closes an organization
-- or staff lane AND which carries an organization_id column (the only tokens whose set form can
-- move at all), plus every component hanging off one of them.
create table if not exists iam.dd175_cast(token text primary key, why text not null);

do $$
declare v_before uuid; v_as timestamptz := now(); v_principals uuid[]; v_tokens text[];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-175a BEFORE') > 0 then
    raise notice 'dd175a: the access baseline is already on record';
    return;
  end if;

  insert into iam.dd175_cast(token, why)
  select t.token, t.why from (
    select et.token,
           format('class %s with an organization_id column — the set form emits an org or staff arm here',
                  (iam.class_lanes(et.token)).resolved_class) as why
      from platform.entity_types et
     where et.is_active
       and (iam.class_lanes(et.token)).resolved_class in ('private','confidential')
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'organization_id')
    union
    select et.token, format('component of %s, which is in the cast', er.parent_type)
      from platform.entity_types et
      join platform.entity_relationships er
        on er.child_type = et.token and er.kind in ('composition','containment')
     where et.is_active
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = er.fk_column)
       and (iam.class_lanes(er.parent_type)).resolved_class in ('private','confidential')
       and exists (select 1 from platform.entity_types pt
                    where pt.token = er.parent_type and pt.is_active
                      and exists (select 1 from information_schema.columns c
                                   where c.table_schema = pt.schema_name and c.table_name = pt.table_name
                                     and c.column_name = 'organization_id'))
  ) t
  on conflict (token) do nothing;

  -- access_delta_snapshot needs a uuid `id` to hash; the tokens without one say so on their row
  -- rather than silently leaving the cast.
  update iam.dd175_cast c set why = why || ' [NOT SNAPSHOTABLE: no uuid id column]'
   where not exists (
     select 1 from platform.entity_types et
      where et.token = c.token and et.is_active
        and exists (select 1 from information_schema.columns col
                     where col.table_schema = et.schema_name and col.table_name = et.table_name
                       and col.column_name = 'id' and col.udt_name = 'uuid'));

  select array_agg(token order by token) into v_tokens
    from iam.dd175_cast where why not like '%NOT SNAPSHOTABLE%';

  v_principals := array[
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- admin@admin.com, platform admin
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com, organization admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com, member
    '392afd39-d59c-4418-866b-451e9d93fead',  -- projectmanager@titaniumsuccess.com, member
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com, member of another organization
    'f0146c96-e02e-420b-a99f-92774da0566c',  -- kelvin.kiprop96@gmail.com, plain member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];

  if coalesce(array_length(v_tokens,1),0) < 250 then
    raise exception 'dd175a: the derived cast came out at % tokens. That is far below the 302 '
      'measured on 2026-09-12 — the derivation has broken and the gate would be probing a '
      'different fleet than the one this round moves.', coalesce(array_length(v_tokens,1),0);
  end if;

  v_before := iam.access_delta_snapshot('DD-175a BEFORE', v_principals, v_tokens, 400000,
    'DD-175: a component lane is never wider than its parent — fleet baseline before the set form '
    'learns iam.class_lanes', v_as);
  raise notice 'dd175a: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;
