-- chair-step: rule-27 rehearsal inverse of rca2c_a_reference_follows_its_target.sql — restores the kernel, set-form, generator, policy-catalogue and certifier bodies it patched, regenerates workspace.threads and workspace.war_rooms without ref_target_gate, and drops the declaration. It RE-OPENS the War Room title leak (RC-A2c); never run it on production except as an emergency rollback of a broken kernel.
-- based-on: PENDING
--
-- Exact textual inverse: every replacement the up file made is swapped back for its anchor (the
-- same DO block with the two columns exchanged, applied in reverse order), each asserted to occur
-- exactly once.

set local lock_timeout = '2s';

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
    ) as t(ord, fn, repl, anchor)
    order by ord desc
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2c inverse %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

select iam.apply_rls('workspace', 'threads', 'thread', 'entity');
select iam.apply_rls('workspace', 'war_rooms', 'war_room', 'entity');

drop function platform.reference_gate(text);
drop function platform.reference_gate_columns(text);
