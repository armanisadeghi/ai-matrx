-- rca2c_a_reference_follows_its_target
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 646027bc7bfc9bf022227837ff0b3836a6e0752270f17bc7fb6e5f1b0ec5b497
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) b015e201871938aa7984104cf54350188d9b7437f1e9b287fa4b185a2f8f421d
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 31c7214349fe0590eae32cc456e2f0c94005bc65385e65ed2013f82b548fd78a
-- based-on: iam.generated_policy_names() 56be7b208d1ad1e973eb6df40fc9abce1e4ef1ee8b1e4077a641e54f006d6a88
-- based-on: iam.verify_canonical(text, text, text, text) 9d5da04fe29f78f8833b9b5d0e22a377c0350ff61d3056f47c020f34999a31ac
--
-- RC-A2c (register: common-docs/projects/rich-content-unification/REGISTER.md) — A RECORD THAT
-- POINTS AT ANOTHER RECORD IS READ ONLY BY PEOPLE WHO CAN READ WHAT IT POINTS AT.
--
-- THE DEFECT, measured live 2026-09-25 (rolled back): a War Room thread (workspace.threads) and a
-- War Room (workspace.war_rooms) name their subject with (anchor_type, anchor_id), and 21 of 43
-- anchored threads and both anchored rooms carry the subject's NAME as their own title. Both were
-- read by their OWN visibility ('internal') plus organization membership, so 33 member/row pairs
-- (13 threads) were readable by members who could not open the project or task they point at — a
-- private project's name included. A census of every registered table that names another record
-- by a (<x>_type, <x>_id) pair and carries a text column found the same title copy only here
-- (plus association labels, RC-A5d, and mandate labels naming platform agents — not private).
--
-- THE CLASS FIX — a declared reference gate, read by every place access is decided:
--   1. platform.reference_gate_columns(token) is the declaration (platform.reference_gate is its row form): which (type column, id column) of a
--      token's row names the record it points at. Declared: thread, war_room (anchor_type,
--      anchor_id). A new token is gated by adding its line here (a CREATE OR REPLACE with its
--      based-on line) — nothing else changes.
--   2. The kernel (iam.has_access_for_base): a gated row whose target is set grants NOTHING at any
--      level — and carries nothing to its containers — unless the caller can view the target. It is
--      an AND on top of the row's own lanes: it only ever narrows.
--   3. The set form (iam.accessible_entity_ids) filters its answer through the same gate.
--   4. The generator emits one RESTRICTIVE policy `ref_target_gate` (for all commands, so a member
--      also cannot FILE a thread on a record they cannot open) on every gated table; platform
--      admins are exempt inside it, so platform_admin_read keeps reading every row. The policy
--      catalogue and the certifier learn the name. Both tables are regenerated.
-- Forcing suite: aidream db/tests/test_rca2c_reference_follows_its_target.py (RCA2C_BEFORE=1 red).
-- Inverse (rehearsal only; re-opens the leak): migrations/inverse/rca2c_a_reference_follows_its_target_down.sql

set local lock_timeout = '2s';

create or replace function platform.reference_gate_columns(p_token text)
returns text[]
language sql
immutable
as $fn$
  -- RC-A2c: THE DECLARATION — the one list. A row of this token names the record it points at with
  -- (type column, id column); iam.has_access_for_base, iam.accessible_entity_ids and the
  -- generator's ref_target_gate policy all read it, so a row is never readable by someone who
  -- cannot read its target. A plain CASE with no SET clause so the planner inlines it: the kernel
  -- asks it on every node of every walk. Add a token only with a forcing test beside it.
  select case p_token
           when 'thread'   then array['anchor_type', 'anchor_id']  -- workspace.threads: a War Room thread's subject
           when 'war_room' then array['anchor_type', 'anchor_id']  -- workspace.war_rooms: a War Room's subject
         end
$fn$;

comment on function platform.reference_gate_columns(text) is
  'RC-A2c: {type column, id column} of a token''s row that names the record it points at, or null. A gated row is readable only by someone who can read its target (kernel, set form and the generated ref_target_gate policy). common-docs/projects/rich-content-unification/REGISTER.md RC-A2c.';

create or replace function platform.reference_gate(p_token text)
returns table(type_column text, id_column text)
language sql
immutable
as $fn$
  -- RC-A2c: the declaration as rows (platform.reference_gate_columns is the one list).
  select c[1], c[2] from (select platform.reference_gate_columns(p_token) as c) x where c is not null
$fn$;

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      -- 2a. kernel locals
      (1, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
$a$,
$a$  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
  -- RC-A2c: the reference gate (platform.reference_gate).
  v_gate_cols text[]; v_gate_type_col text; v_gate_id_col text; v_gate_type text; v_gate_id uuid;
$a$),
      -- 2b. kernel: read the declaration with the registry row, and gate the node
      (2, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$    select et.schema_name, et.table_name, et.rls_variant into v_schema, v_table, v_variant
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
$a$,
$a$    select et.schema_name, et.table_name, et.rls_variant, platform.reference_gate_columns(et.token)
      into v_schema, v_table, v_variant, v_gate_cols
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
    v_gate_type_col := v_gate_cols[1]; v_gate_id_col := v_gate_cols[2];
    -- 🚨 RC-A2c (2026-09-25) — A RECORD THAT POINTS AT ANOTHER RECORD IS READ ONLY BY PEOPLE WHO
    -- CAN READ WHAT IT POINTS AT. A War Room thread / room names its subject (anchor_type,
    -- anchor_id) and copies its name; read by its own 'internal' visibility, 13 threads were
    -- readable by members who could not open the project or task. A gated node whose target is
    -- set grants nothing at any level, and carries nothing to its containers, unless the caller
    -- can view the target. An AND on the row's own lanes: it only narrows.
    if v_gate_id_col is not null then
      v_gate_type := null; v_gate_id := null;
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_gate_type_col, v_gate_id_col, v_schema, v_table)
        into v_gate_type, v_gate_id using v_id;
      continue walk when v_gate_type is not null and v_gate_id is not null
        and not (case when v_gate_type = 'file'
                      then files.has_access_for(v_uid, v_gate_id, 'viewer'::public.permission_level)
                      else iam.has_access_for_base(v_uid, v_gate_type, v_gate_id,
                                                   'viewer'::public.permission_level, true, v_visited)
                 end);
    end if;
$a$),
      -- 3. the set form filters through the same gate
      (3, 'iam.accessible_entity_ids(text,permission_level,integer,boolean)',
$a$  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;$a$,
$a$  -- 🚨 RC-A2c (2026-09-25): a row that points at another record (platform.reference_gate) is in
  -- the set only when the caller can view that record — the kernel's gate, set-wise.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    for rec in select g.type_column, g.id_column from platform.reference_gate(p_type) g loop
      execute format(
        'select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) and '
        '(t.%I is null or t.%I is null or iam.has_access_for($2, t.%I, t.%I, ''viewer''::public.permission_level))',
        v_tbl, rec.type_column, rec.id_column, rec.type_column, rec.id_column)
        into v_more using v_ids, v_uid;
      v_ids := coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;
  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;$a$),
      -- 4a. generator locals
      (4, 'iam._apply_rls_unchecked(text,text,text,text)',
$a$  v_no_client_writes boolean := false;
begin
$a$,
$a$  v_no_client_writes boolean := false;
  -- RC-A2c: the reference gate this token declares (platform.reference_gate), if any.
  v_ref_type_col text; v_ref_id_col text;
begin
$a$),
      -- 4b. generator: emit the restrictive gate for a gated token (every variant path)
      (5, 'iam._apply_rls_unchecked(text,text,text,text)',
$a$      v_tbl, v_required_anon_status));
  end if;
$a$,
$a$      v_tbl, v_required_anon_status));
  end if;

  -- 🚨 RC-A2c (2026-09-25): a token that names the record it points at (platform.reference_gate)
  -- gets ONE restrictive policy for every command: a row whose target is set is visible to, and
  -- writable by, only someone who can view the target. Platform admins are exempt inside it, so
  -- platform_admin_read keeps reading every row (common-docs/policies/our-own-admin-database-access.md).
  select g.type_column, g.id_column into v_ref_type_col, v_ref_id_col
    from platform.reference_gate(p_token) g limit 1;
  if v_ref_id_col is not null then
    v_pol := array_append(v_pol, format(
      'create policy ref_target_gate on %1$s as restrictive for all to authenticated '
      'using ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level)) '
      'with check ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level))',
      v_tbl, v_ref_type_col, v_ref_id_col));
  end if;
$a$),
      -- 4c. the policy catalogue learns the name
      (6, 'iam.generated_policy_names()',
$a$    'platform_admin_read' -- ADMIN-ACCESS$a$,
$a$    'ref_target_gate',    -- RC-A2c: RESTRICTIVE, every command — a row that points at a record
                          -- is read and written only by someone who can view that record
    'platform_admin_read' -- ADMIN-ACCESS$a$),
      -- 4d. the certifier expects it on a gated token
      (7, 'iam.verify_canonical(text,text,text,text)',
$a$  IF v_required_anon_status IS NOT NULL THEN
    v_expected:=array_append(v_expected,'anon_status_gate');$a$,
$a$  -- RC-A2c: a token that points at another record carries the restrictive ref_target_gate.
  IF EXISTS (SELECT 1 FROM platform.reference_gate(p_token)) THEN
    v_expected:=array_append(v_expected,'ref_target_gate');
  END IF;
  IF v_required_anon_status IS NOT NULL THEN
    v_expected:=array_append(v_expected,'anon_status_gate');$a$)
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2c patch %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

-- Regenerate workspace.threads with the function changes it depends on. The second target is
-- deliberately in rca2c_c: `iam.apply_rls` holds the policy-lock footprint until transaction
-- commit, so a migration may regenerate only one target.
select iam.apply_rls('workspace', 'threads', 'thread', 'entity');
