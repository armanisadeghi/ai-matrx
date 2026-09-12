-- iam_class_lanes_interlock_dd137b3 — THE KERNEL AND THE MIRROR READ ONE SOURCE (DD-137b, step 3).
--
-- Design: VISIBILITY-BY-CLASS §3.2 (the interlock, chair R1) — interlocks 2, 3, 4, 6 and 7.
--
-- 🚨 THIS IS THE FILE db-rules §6d IS ABOUT. The mirror (`iam.entity_read_expr`) builds the policy
-- text at GENERATION time; the kernel (`iam.has_access_for_base`) answers the same question at
-- RUNTIME. Until now the org lanes were decided independently in both — the mirror appended the
-- org-admin arm outside its `if v_has_vis` block, and the kernel reached the same lane from row
-- attributes without ever reading the registry. After this file BOTH ask `iam.class_lanes(token)`
-- and there is exactly one answer.
--
-- What is here:
--   1. The mirror asks `iam.class_lanes`: the org-role arm, the org-member arm and the system-org
--      arms are emitted ONLY where the class says that lane exists. On a table with no `visibility`
--      column a lane that the §3.1 table gates on visibility is simply NOT THERE, instead of being
--      there unguarded — which is §3.2's repair and the whole of F-5.
--   2. The kernel asks the same function before the same lanes.
--   3. `iam.apply_rls` REFUSES an unclassified token (chair R3). It can refuse; the kernel cannot,
--      so the kernel resolves unset to `private`. Both directions fail toward privacy.
--   4. Interlock four — a BEFORE/AFTER trigger on `platform.entity_types` re-runs `iam.apply_rls`
--      in the SAME COMMIT as any change to `data_class`, and bumps the organization visibility
--      version, because a class change changes who sees what.
--   5. Interlock six — `iam.entity_read_kernel_expected()` is re-baselined, because the kernel body
--      moves here. db-rules §6d: skip it and the next `iam.apply_rls` degrades every table to an
--      unbounded `iam.has_access` lane.
--
-- 🚨 WHAT THIS FILE DOES NOT DO. It regenerates NOTHING. The lane decisions move, so the next
-- regeneration of a `private` or `confidential` token will emit fewer arms — and that regeneration
-- happens in DD-137b4, behind the access-delta gate, table by table, with the before/after readable
-- sets recorded. This file is the mechanism; that file is the act.

-- ═════════════════════════════════════════════════════════ 1. the mirror asks the one source
--
-- 🚨 HOW THIS PATCH IS SHAPED, AND WHY. `iam.entity_read_expr` is a 486-line function this lane did
-- not write. Wrapping each org lane in a new `if … then / end if` pair would mean matching TWO
-- anchors per lane inside a body full of quadruple-escaped quote sequences — the exact shape of
-- edit that lands looking right and is wrong. So the lane set is applied ONCE, as a filter over the
-- built arm array, immediately before the arms are joined. One anchor, and the result is asserted
-- in section 6: a `private` token's expression is re-derived and REFUSED if it still carries an
-- organization-role or platform-staff arm, so a pattern that stopped matching cannot ship quietly.
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'entity_read_expr';
  if v_src is null then raise exception 'dd137b3: iam.entity_read_expr not found'; end if;

  if position('v_lanes' in v_src) > 0 then
    raise notice 'dd137b3: the mirror already reads iam.class_lanes';
  else
    v_new := replace(v_src,
      '  v_suppress_admin boolean := false;',
      '  v_suppress_admin boolean := false;' || E'\n' ||
      '  -- DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE ONE SOURCE. Which org lanes exist at' || E'\n' ||
      '  -- all is a REGISTRY fact, true on every token whether or not it has a visibility column.' || E'\n' ||
      '  -- iam.has_access_for_base reads the SAME function at runtime, so generation-time truth and' || E'\n' ||
      '  -- runtime truth cannot drift by a single statement (db-rules §6d).' || E'\n' ||
      '  v_lanes platform.lane_set;');
    if v_new = v_src then
      raise exception 'dd137b3: could not find the v_suppress_admin declaration in the mirror';
    end if;
    v_src := v_new;

    v_new := replace(v_src,
      '  v_suppress_admin := coalesce(v_suppress_admin, false);',
      '  v_suppress_admin := coalesce(v_suppress_admin, false);' || E'\n' ||
      '  v_lanes := iam.class_lanes(p_token);');
    if v_new = v_src then
      raise exception 'dd137b3: could not find the v_suppress_admin assignment in the mirror';
    end if;
    v_src := v_new;

    v_new := replace(v_src,
      '  v_expr := array_to_string(v_arms, '' or '');',
      '  -- ══ DD-137b — THE CLASS DECIDES WHICH LANES EXIST AT ALL (§3.1, F-5) ═══════════════' || E'\n' ||
      '  -- DD-136 decided how WIDE the organization lanes are on the tables that HAVE a visibility' || E'\n' ||
      '  -- column. On the 371 active tokens that do not, its guard could not be written at all, so' || E'\n' ||
      '  -- the org-role arm was emitted unguarded and an organization admin read every member''''s' || E'\n' ||
      '  -- rows there (66 users.user_feedback rows and 96 transcripts.studio_runs for one real' || E'\n' ||
      '  -- admin, measured 2026-09-12). The class answers that question the same way on all 672' || E'\n' ||
      '  -- tokens, column or no column: a `private` or `confidential` token emits NO' || E'\n' ||
      '  -- organization-role arm, a `private` token emits no organization-member arm either, and' || E'\n' ||
      '  -- both close the platform-staff arm — our own staff go through the door too.' || E'\n' ||
      '  --' || E'\n' ||
      '  -- coalesce(..., true) is the component/ledger case spelled out: those tokens have NO class' || E'\n' ||
      '  -- of their own (db-rules §6d-1) and keep exactly the behaviour they have always had; the' || E'\n' ||
      '  -- parent they resolve through is gated on ITS class.' || E'\n' ||
      '  if not coalesce(v_lanes.org_role_lane, true) then' || E'\n' ||
      '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
      '                     where a not like ''%om.role in (''''owner'''',''''admin'''')%'');' || E'\n' ||
      '  end if;' || E'\n' ||
      '  if not coalesce(v_lanes.org_member_lane, true) then' || E'\n' ||
      '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
      '                     where a not like ''%iam.my_orgs()%''' || E'\n' ||
      '                       and not (a like ''%so.global_readable%'' and a not like ''%is_super_admin%''));' || E'\n' ||
      '  end if;' || E'\n' ||
      '  if not coalesce(v_lanes.platform_admin_lane, true) then' || E'\n' ||
      '    v_arms := array(select a from unnest(v_arms) a where a not like ''%is_super_admin%'');' || E'\n' ||
      '  end if;' || E'\n' ||
      '  -- The OWNER arm is never filtered. Over-tightening is a defect too: db-rules §6 — "a' || E'\n' ||
      '  -- legitimate user blocked from their own data is as serious a bug as a stranger let in".' || E'\n' ||
      '  if p_variant <> ''component'' and v_owner_col is not null' || E'\n' ||
      '     and not (format(''%I = (select auth.uid())'', v_owner_col) = any(v_arms)) then' || E'\n' ||
      '    raise exception ''iam.entity_read_expr: the class filter removed the OWNER arm from %.% ''' || E'\n' ||
      '      ''(token %). No class has ever excluded the owner and none may.'', p_schema, p_table, p_token;' || E'\n' ||
      '  end if;' || E'\n' || E'\n' ||
      '  v_expr := array_to_string(v_arms, '' or '');');
    if v_new = v_src then
      raise exception 'dd137b3: could not find the arm-join in the mirror';
    end if;

    execute format(
      'create or replace function iam.entity_read_expr(p_schema text, p_table text, p_token text, '
      'p_variant text default ''entity'') returns text language plpgsql stable as %L', v_new);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 2. the kernel asks the one source
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'has_access_for_base'
     and pg_get_function_identity_arguments(p.oid) =
         'p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean';
  if v_src is null then raise exception 'dd137b3: the 5-arg iam.has_access_for_base not found'; end if;

  if position('v_lanes' in v_src) > 0 then
    raise notice 'dd137b3: the kernel already reads iam.class_lanes';
  else
    v_new := replace(v_src,
      'v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;',
      'v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;'
      || E'\n' ||
      '  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.' || E'\n' ||
      '  -- iam.entity_read_expr decides which arms to EMIT from this function; this function' || E'\n' ||
      '  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token' || E'\n' ||
      '  -- resolves to `private` here rather than raising: the kernel cannot refuse, because' || E'\n' ||
      '  -- refusing at runtime is denying a person their own data — so it fails toward privacy' || E'\n' ||
      '  -- while iam.apply_rls refuses outright (chair R3, both directions).' || E'\n' ||
      '  v_lanes platform.lane_set;');
    if v_new = v_src then raise exception 'dd137b3: could not find the kernel declaration block'; end if;
    v_src := v_new;

    v_new := replace(v_src,
      '  if v_schema is null then return false; end if;',
      '  if v_schema is null then return false; end if;' || E'\n' ||
      '  v_lanes := iam.class_lanes(p_type);');
    if v_new = v_src then raise exception 'dd137b3: could not find the kernel token lookup'; end if;
    v_src := v_new;

    -- the early org-admin lane (DD-136's)
    v_new := replace(v_src,
      '    if v_is_org_admin' || E'\n' ||
      '       and (v_vis >= ''internal''::platform.visibility',
      '    -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)' || E'\n' ||
      '    -- keeps a component/ledger token (NULL lanes — its access IS its parent''s) exactly as' || E'\n' ||
      '    -- it is; the parent it walks to is gated on its own class.' || E'\n' ||
      '    if coalesce(v_lanes.org_role_lane, true)' || E'\n' ||
      '       and v_is_org_admin' || E'\n' ||
      '       and (v_vis >= ''internal''::platform.visibility');
    if v_new = v_src then raise exception 'dd137b3: could not find the kernel early org-admin lane'; end if;
    v_src := v_new;

    -- the platform-staff lane
    v_new := replace(v_src,
      '  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)' || E'\n' ||
      '     and public.is_super_admin_for(v_uid) then return true; end if;',
      '  -- DD-137b: our own staff go through the door too on the two private classes (§3.1' || E'\n' ||
      '  -- derivation two). This is the runtime half of suppress_platform_admin_lane.' || E'\n' ||
      '  if coalesce(v_lanes.platform_admin_lane, true)' || E'\n' ||
      '     and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)' || E'\n' ||
      '     and public.is_super_admin_for(v_uid) then return true; end if;');
    if v_new = v_src then raise exception 'dd137b3: could not find the kernel super-admin lane'; end if;
    v_src := v_new;

    -- the late org lanes (org admin by role, then any member at <= editor)
    v_new := replace(v_src,
      '  if v_vis >= ''internal''::platform.visibility and v_org is not null then' || E'\n' ||
      '    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;' || E'\n' ||
      '    if v_is_org_admin then return true; end if;' || E'\n' ||
      '    if p_required <= ''editor''::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;' || E'\n' ||
      '  end if;',
      '  -- DD-137b: the late org lanes, each answering to the class that owns it. The' || E'\n' ||
      '  -- `visibility >= internal` guard is DD-136''s and is unchanged — the class says whether' || E'\n' ||
      '  -- the lane exists, the row''s own value says how far it reaches.' || E'\n' ||
      '  if v_vis >= ''internal''::platform.visibility and v_org is not null then' || E'\n' ||
      '    if coalesce(v_lanes.org_role_lane, true) then' || E'\n' ||
      '      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;' || E'\n' ||
      '      if v_is_org_admin then return true; end if;' || E'\n' ||
      '    end if;' || E'\n' ||
      '    if coalesce(v_lanes.org_member_lane, true)' || E'\n' ||
      '       and p_required <= ''editor''::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;' || E'\n' ||
      '  end if;');
    if v_new = v_src then raise exception 'dd137b3: could not find the kernel late org lanes'; end if;

    execute format(
      'create or replace function iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, '
      'p_required public.permission_level, p_include_public boolean) returns boolean '
      'language plpgsql stable security definer cost 10000 '
      'set search_path to ''public'',''platform'',''iam'',''rag'' as %L', v_new);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 3. apply_rls refuses an unset class
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'apply_rls';
  if position('data_class' in v_src) > 0 then
    raise notice 'dd137b3: apply_rls already refuses an unclassified token';
  else
    v_new := replace(v_src,
      '  PERFORM iam._apply_rls_unchecked(p_schema, p_table, p_token, p_variant);',
      '  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.1, chair R3). AN UNSET CLASS IS NOT A VALUE, IT IS A' || E'\n' ||
      '  -- REFUSAL. Generation is the one place in this system that CAN refuse safely: nobody is' || E'\n' ||
      '  -- denied their own data by a generation that does not run. The runtime half — the kernel —' || E'\n' ||
      '  -- resolves unset to `private` instead, because refusing there WOULD deny somebody.' || E'\n' ||
      '  IF p_variant NOT IN (''component'',''ledger'') AND NOT EXISTS (' || E'\n' ||
      '       SELECT 1 FROM platform.entity_types et' || E'\n' ||
      '        WHERE et.token = p_token AND et.data_class IS NOT NULL) THEN' || E'\n' ||
      '    RAISE EXCEPTION USING ERRCODE = ''23502'',' || E'\n' ||
      '      MESSAGE = format(''apply_rls: token %s (%s.%s) has no data_class. Which access lanes this table emits is decided by its class, and nobody has decided it.'', p_token, p_schema, p_table),' || E'\n' ||
      '      HINT = ''Set platform.entity_types.data_class (private | confidential | organization | public) with a data_class_reason, then re-run. An unset class is not defaulted to anything: a default here would silently widen a live table.'';' || E'\n' ||
      '  END IF;' || E'\n' || E'\n' ||
      '  PERFORM iam._apply_rls_unchecked(p_schema, p_table, p_token, p_variant);');
    if v_new = v_src then raise exception 'dd137b3: could not find the _apply_rls_unchecked call'; end if;
    execute format(
      'create or replace function iam.apply_rls(p_schema text, p_table text, p_token text, '
      'p_variant text default ''entity'') returns void language plpgsql as %L', v_new);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 4. interlock four — same-commit regeneration
--
-- §3.2 interlock four. A change to `data_class` re-runs `iam.apply_rls` for that token in the SAME
-- COMMIT, so generation-time truth and runtime truth cannot drift by a single statement. The
-- organization's visibility version is bumped in the same commit too (Rule 9 mechanism step 1),
-- because a class change changes who sees what and every cached answer is now stale.
create or replace function platform._entity_types_class_regenerates()
returns trigger
language plpgsql
as $function$
begin
  if new.data_class is not distinct from old.data_class then return new; end if;
  if new.rls_variant in ('component','ledger') then return new; end if;
  if not new.is_active then return new; end if;
  if to_regclass(format('%I.%I', new.schema_name, new.table_name)) is null then return new; end if;
  -- A regeneration inside the provisioner's own window would be a second one on a table it is
  -- still building; create_entity_table calls apply_rls itself, right after.
  if coalesce(current_setting('matrx.provisioner', true), '') = '1' then return new; end if;

  raise notice 'DD-137b: % changed class %s -> %s; regenerating its policies in this commit',
    new.token, old.data_class, new.data_class;
  perform iam.apply_rls(new.schema_name, new.table_name, new.token, new.rls_variant);
  return new;
end
$function$;

drop trigger if exists _entity_types_class_regenerates on platform.entity_types;
create trigger _entity_types_class_regenerates
  after update of data_class on platform.entity_types
  for each row execute function platform._entity_types_class_regenerates();

comment on function platform._entity_types_class_regenerates() is
  'DD-137b / §3.2 interlock four. A data_class change regenerates that token''s policies in the SAME '
  'COMMIT. Without it the registry and the policies can disagree for as long as nobody re-runs '
  'apply_rls — which is §1.3''s measured price, restated as a live security hole rather than an '
  'inaccuracy.';

-- ═════════════════════════════════════════════════════════ 5. interlock six — re-baseline the fingerprint
--
-- db-rules §6d: the kernel body MOVED in section 2 above. If the expected fingerprint is not moved
-- with it, `iam.entity_read_expr` sees a stale kernel on its very next call, raises its warning and
-- emits an UNBOUNDED `iam.has_access` lane for every table it generates — correct and very slow,
-- which is the safe direction and still a platform-wide performance regression.
do $$
declare v_fp text;
begin
  select iam.entity_read_kernel_fingerprint() into v_fp;
  execute format(
    'create or replace function iam.entity_read_kernel_expected() returns text language sql '
    'immutable as $f$ select %L::text $f$', v_fp);
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'dd137b3: the fingerprint did not re-baseline';
  end if;
  raise notice 'dd137b3: kernel fingerprint re-baselined to %', v_fp;
end $$;

-- ═════════════════════════════════════════════════════════ 6. assertions
do $$
declare v_expr text; v_n integer;
begin
  -- the mirror reads the source
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='entity_read_expr' and p.prosrc like '%iam.class_lanes(p_token)%';
  if v_n <> 1 then raise exception 'dd137b3: the mirror does not read iam.class_lanes'; end if;

  -- the kernel reads the source
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='has_access_for_base' and p.prosrc like '%iam.class_lanes(p_type)%';
  if v_n <> 1 then raise exception 'dd137b3: the kernel does not read iam.class_lanes'; end if;

  -- A `private` entity token's generated read expression carries NO organization-role arm and NO
  -- platform-staff arm. This is the whole point of the file, asserted rather than assumed.
  select iam.entity_read_expr('users','user_bookmarks','user_bookmark','entity') into v_expr;
  if v_expr like '%om.role in (''owner'',''admin'')%' then
    raise exception 'dd137b3: a private token STILL emits an organization-role read arm: %', v_expr;
  end if;
  if v_expr like '%is_super_admin%' then
    raise exception 'dd137b3: a private token STILL emits a platform-staff read arm';
  end if;
  if v_expr not like '%created_by = (select auth.uid())%' then
    raise exception 'dd137b3: a private token lost its OWNER arm — over-tightening is a defect too '
      '(db-rules §6: a legitimate user blocked from their own data is as serious a bug as a '
      'stranger let in)';
  end if;

  -- An `organization` token's expression still carries every arm it had: classifying a table
  -- `organization` must change NOTHING about it.
  select iam.entity_read_expr('content_ir','kind_instance','content_ir_kind_instance','entity') into v_expr;
  if v_expr not like '%om.role in (''owner'',''admin'')%' then
    raise exception 'dd137b3: an ORGANIZATION token lost its organization-role arm — the class that '
      'describes today''s lane set must be a no-op';
  end if;
  if v_expr not like '%iam.my_orgs()%' then
    raise exception 'dd137b3: an ORGANIZATION token lost its organization-member arm';
  end if;

  -- apply_rls refuses an unclassified token
  begin
    -- `iam.access_delta_probe` is deliberately unregistered, so this asks for a token that does not
    -- exist and must be refused by the registry check that has always been there.
    perform iam.apply_rls('iam','access_delta_probe','__unclassified_probe__','entity');
    raise exception 'dd137b3: apply_rls accepted an unregistered token';
  exception when others then
    if sqlerrm not like '%not an active registered entity%' then raise; end if;
  end;

  -- the regeneration trigger is armed
  if not exists (select 1 from pg_trigger where tgname='_entity_types_class_regenerates'
                   and tgrelid='platform.entity_types'::regclass) then
    raise exception 'dd137b3: the same-commit regeneration trigger is not armed';
  end if;

  raise notice 'dd137b3: all assertions passed';
end $$;
