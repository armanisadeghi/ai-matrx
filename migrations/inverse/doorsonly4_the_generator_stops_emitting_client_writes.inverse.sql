-- lane: DOORS-ONLY-4
-- chair-step: genuinely non-additive, and that is what an inverse is. It DROPs
-- platform.schema_is_doors_only(text), DELETEs the two declaration rows the campaign file
-- inserted, and DROPs platform.schema_client_exposure.client_writes_doors_only -- each one an
-- object that file created and nothing else reads. The `REVOKE` / `TRUNCATE` words below are the
-- same iam.apply_table_grants fragments, being put back, executing nothing at apply time.
--
-- INVERSE of migrations/campaign/doorsonly4_the_generator_stops_emitting_client_writes.sql
--
-- The SAME harness, with every anchor pair reversed and applied in reverse order, against the
-- body read LIVE. So it un-teaches the doors-only rule from whatever the four bodies say at the
-- moment it runs -- carrying forward anything another lane has added since -- rather than
-- restoring a file's frozen copy of them. Each block is idempotent: a body that does not teach
-- the rule is left alone with a NOTICE.
--
-- 🚨 RUNNING THIS DOES NOT PUT THE POLICIES BACK. It restores the GENERATOR. A table regenerated
-- while the new generator was live keeps `platform_admin_select` and no std_insert/std_update/
-- std_delete until iam.apply_rls runs on it again -- at which point the restored generator emits
-- platform_admin_all and the write family, and iam.apply_rls's DD-147 drift loop removes the
-- orphaned platform_admin_select because the restored catalog no longer claims the name. So the
-- reversal is: run this, then re-run iam.apply_rls on every table the campaign regenerated.
--
-- The column is dropped LAST, after both functions have stopped reading it.
do $d4b0$
declare
  v_def text; v_from text; v_to text; v_n int; v_want int; i int;
  v_pairs text[][]; v_counts int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.generated_policy_names()'::regprocedure;
  if v_def is null then raise exception 'doors-only-4: iam.generated_policy_names() not found'; end if;
  if position($d4s0$'platform_admin_select'$d4s0$ in v_def) = 0 then
    raise notice 'doors-only-4: iam.generated_policy_names() does not teach the doors-only rule -- nothing to undo, left alone'; return;
  end if;
  v_pairs := array[
    [$d4a0_0$    'platform_admin_all', -- every variant except personal, unless the token suppresses the lane
    'platform_admin_select', -- the FOR SELECT twin of platform_admin_all, in a doors-only schema:
                          -- platform staff keep the exact read they had and lose the write lane,
                          -- because in `platform`/`iam` a write is a door (DOORS-ONLY-4)$d4a0_0$, $d4z0_0$    'platform_admin_all', -- every variant except personal, unless the token suppresses the lane$d4z0_0$]
  ];
  v_counts := array[1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2]; v_want := v_counts[i];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want then
      raise exception 'doors-only-4: iam.generated_policy_names() patch % -- anchor found % time(s), expected exactly %. The live body has moved under this migration; re-derive the anchor from pg_get_functiondef and do NOT replace the function from a file (db-rules line 491). Anchor head: %',
        i, v_n, v_want, left(v_from, 140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'doors-only-4: patched iam.generated_policy_names()';
end
$d4b0$;

do $d4b1$
declare
  v_def text; v_from text; v_to text; v_n int; v_want int; i int;
  v_pairs text[][]; v_counts int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam._apply_rls_unchecked(text,text,text,text)'::regprocedure;
  if v_def is null then raise exception 'doors-only-4: iam._apply_rls_unchecked(text,text,text,text) not found'; end if;
  if position($d4s1$v_no_client_writes$d4s1$ in v_def) = 0 then
    raise notice 'doors-only-4: iam._apply_rls_unchecked(text,text,text,text) does not teach the doors-only rule -- nothing to undo, left alone'; return;
  end if;
  v_pairs := array[
    [$d4a1_0$    -- DOORS-ONLY-4 -- THE FOR SELECT TWIN, AND WHY IT IS A BRANCH AND NOT A REMOVAL.
    -- platform_admin_all is FOR ALL, which means it is the platform-staff READ policy as
    -- well as the write one. Removing it to clear the residual write surface would take
    -- staff reads away on seventy-five tables (the warning DOORS-ONLY-2 left in capitals).
    -- So in a doors-only schema the SAME predicate is emitted FOR SELECT under a name that
    -- says so, and the write half simply never exists: staff write through the same doors
    -- everybody else does.
    -- The outer gate stays v_client_read_only, NOT v_no_client_writes: a MARKED relation
    -- gets no platform-staff policy at all today, and handing it one here would widen reads
    -- on a table nobody asked this lane about.
    if not v_client_read_only then
      if not v_doors_only then
        execute format(
          'create policy platform_admin_all on %s for all to authenticated '
          || 'using (%s) with check ((select public.is_platform_admin()))',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      else
        execute format(
          'create policy platform_admin_select on %s for select to authenticated using (%s)',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      end if;
    end if;
$d4a1_0$, $d4z1_0$    if not v_no_client_writes then
    execute format(
      'create policy platform_admin_all on %s for all to authenticated '
      || 'using (%s) with check ((select public.is_platform_admin()))',
      v_tbl,
      case when v_vis_enum
           then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
           else '(select public.is_platform_admin())' end);
    end if;
$d4z1_0$],
    [$d4a1_1$  if not v_no_client_writes then
$d4a1_1$, $d4z1_1$  if not v_client_read_only then
$d4z1_1$],
    [$d4a1_2$  -- DOORS-ONLY-4. Read once, used at every emit site below.
  v_doors_only := platform.schema_is_doors_only(p_schema);
  v_no_client_writes := v_client_read_only or v_doors_only;

  if v_suppress_admin then
    v_admin := '';$d4a1_2$, $d4z1_2$  if v_suppress_admin then
    v_admin := '';$d4z1_2$],
    [$d4a1_3$  -- DD-249: the anon lane is the CLASS's to grant, and this is where it is asked.
  v_pub_lanes platform.lane_set;
  -- DOORS-ONLY-4 (2026-09-21) -- A DOORS-ONLY SCHEMA'S WRITE LANES ARE THE GENERATOR'S,
  -- NOT SEVENTY-FIVE HAND-WRITTEN DROP-POLICY FILES.
  -- `platform` and `iam` are not client-writable schemas (chair ruling; VERIFIER-8 HIGH-3):
  -- every write goes through a named SECURITY DEFINER door, reads stay exactly as they are.
  -- The 255 residual triples DOORS-ONLY-3 left are all PERMISSIVE WRITE POLICIES with no
  -- grant behind them any more -- std_insert/std_update/std_delete and platform_admin_all --
  -- and every one of those names is emitted BELOW. Removing them by hand lasts until the
  -- next iam.apply_rls, which platform.provision calls, so one new table spec would put
  -- them all back on tables the guard had already recorded clean.
  -- Fix the class: the generator stops emitting them for a schema DECLARED doors-only in
  -- platform.schema_client_exposure.client_writes_doors_only, and emits the FOR SELECT twin
  -- platform_admin_select wherever it would have emitted platform_admin_all, so platform
  -- staff keep the identical read and lose only the write half of that FOR ALL policy.
  v_doors_only boolean := false;
  -- The registry flag and the schema declaration answer the same question -- may a CLIENT
  -- write this base table -- so the emit sites ask this one. The registry flag keeps its own
  -- strict refusals (duplicate rows, variant mismatch) below: those are about a MARKED
  -- relation's declaration being coherent, and a schema-wide rule must not start raising on
  -- a hundred tables that never declared anything.
  v_no_client_writes boolean := false;
$d4a1_3$, $d4z1_3$  -- DD-249: the anon lane is the CLASS's to grant, and this is where it is asked.
  v_pub_lanes platform.lane_set;
$d4z1_3$]
  ];
  v_counts := array[1,13,1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2]; v_want := v_counts[i];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want then
      raise exception 'doors-only-4: iam._apply_rls_unchecked(text,text,text,text) patch % -- anchor found % time(s), expected exactly %. The live body has moved under this migration; re-derive the anchor from pg_get_functiondef and do NOT replace the function from a file (db-rules line 491). Anchor head: %',
        i, v_n, v_want, left(v_from, 140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'doors-only-4: patched iam._apply_rls_unchecked(text,text,text,text)';
end
$d4b1$;

do $d4b2$
declare
  v_def text; v_from text; v_to text; v_n int; v_want int; i int;
  v_pairs text[][]; v_counts int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.apply_table_grants(text,text,text)'::regprocedure;
  if v_def is null then raise exception 'doors-only-4: iam.apply_table_grants(text,text,text) not found'; end if;
  if position($d4s2$v_no_client_writes$d4s2$ in v_def) = 0 then
    raise notice 'doors-only-4: iam.apply_table_grants(text,text,text) does not teach the doors-only rule -- nothing to undo, left alone'; return;
  end if;
  v_pairs := array[
    [$d4a2_0$  -- THE ASSERTION IS THE FORCING FUNCTION. This is the one place every provisioning path
  -- funnels its table grants through, so it is the one place that can PROVE the client write
  -- privilege is gone rather than assume the withdrawal above did its job (DOORS-ONLY-4
  -- extends it from the marked-relation flag to the doors-only schema declaration).
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
      foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
      end loop;
      if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
    end loop;
  end if;

  if v_declared is not null then$d4a2_0$, $d4z2_0$  if v_client_read_only then
    foreach v_role in array array['public','anon','authenticated'] loop
      foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
      end loop;
      if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
    end loop;
  end if;

  if v_declared is not null then$d4z2_0$],
    [$d4a2_1$  if p_variant in ('ledger','reference') or v_stamped or v_no_client_writes then$d4a2_1$, $d4z2_1$  if p_variant in ('ledger','reference') or v_stamped or v_client_read_only then$d4z2_1$],
    [$d4a2_2$  execute format('revoke all on %s from authenticated', v_tbl);

  -- DOORS-ONLY-4: a table-level withdrawal does not remove a COLUMN grant, and a column
  -- grant is exactly the shape this function issues when client_excluded_columns is
  -- declared -- so on some of these tables `authenticated` holds no table privilege and a
  -- fistful of column ones, which has_any_column_privilege (what the doors-only guard asks)
  -- still sees.
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
$d4a2_2$, $d4z2_2$  execute format('revoke all on %s from authenticated', v_tbl);

  if v_client_read_only then
    foreach v_role in array array['public','anon','authenticated'] loop
$d4z2_2$],
    [$d4a2_3$  v_doors_only := platform.schema_is_doors_only(p_schema);
  v_no_client_writes := v_client_read_only or v_doors_only;

  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.$d4a2_3$, $d4z2_3$  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.$d4z2_3$],
    [$d4a2_4$  v_client_read_only boolean := false;
  -- DOORS-ONLY-4 -- THE GRANT HALF OF THE SAME RULING. Without this the policy change is
  -- worthless: iam.apply_rls calls this function at the end of every generation, and the
  -- default arm below issues the entity variant's write grants -- so regenerating a
  -- platform/iam table to stop emitting its write POLICIES would hand its write GRANTS
  -- straight back and reopen all eighty-seven tables the last three lanes closed.
  -- A schema declared doors-only takes the read-only client grant, as a marked relation does.
  v_doors_only boolean := false;
  v_no_client_writes boolean := false;
$d4a2_4$, $d4z2_4$  v_client_read_only boolean := false;
$d4z2_4$]
  ];
  v_counts := array[1,1,1,1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2]; v_want := v_counts[i];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want then
      raise exception 'doors-only-4: iam.apply_table_grants(text,text,text) patch % -- anchor found % time(s), expected exactly %. The live body has moved under this migration; re-derive the anchor from pg_get_functiondef and do NOT replace the function from a file (db-rules line 491). Anchor head: %',
        i, v_n, v_want, left(v_from, 140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'doors-only-4: patched iam.apply_table_grants(text,text,text)';
end
$d4b2$;

do $d4b3$
declare
  v_def text; v_from text; v_to text; v_n int; v_want int; i int;
  v_pairs text[][]; v_counts int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.verify_canonical(text,text,text,text)'::regprocedure;
  if v_def is null then raise exception 'doors-only-4: iam.verify_canonical(text,text,text,text) not found'; end if;
  if position($d4s3$v_doors_only$d4s3$ in v_def) = 0 then
    raise notice 'doors-only-4: iam.verify_canonical(text,text,text,text) does not teach the doors-only rule -- nothing to undo, left alone'; return;
  end if;
  v_pairs := array[
    [$d4a3_0$  v_bad := coalesce(v_bad || '; ', '') || 'the platform-staff policy USING does not exclude visibility=''personal''';$d4a3_0$, $d4z3_0$  v_bad := coalesce(v_bad || '; ', '') || 'platform_admin_all USING does not exclude visibility=''personal''';$d4z3_0$],
    [$d4a3_1$        IF r_pol.polname IN ('platform_admin_all','platform_admin_select') THEN$d4a3_1$, $d4z3_1$        IF r_pol.polname = 'platform_admin_all' THEN$d4z3_1$],
    [$d4a3_2$    ELSIF NOT v_lanes.platform_admin_lane
      AND ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
        OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}'))) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all/platform_admin_select policy still sits beside std_select — that ' ||
        'policy is permissive and grants its command on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);$d4a3_2$, $d4z3_2$    ELSIF NOT v_lanes.platform_admin_lane AND 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all policy still sits beside std_select — that policy is permissive ' ||
        'and grants everything on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);$d4z3_2$],
    [$d4a3_3$    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
       OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but a platform-staff policy exists — re-run iam.apply_rls';$d4a3_3$, $d4z3_3$    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but platform_admin_all exists — re-run iam.apply_rls';$d4z3_3$],
    [$d4a3_4$  IF v_client_read_only THEN
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['platform_admin_all','std_insert','std_update','std_delete']));
  ELSIF v_doors_only THEN
    -- A doors-only schema emits no client write lane at all, and the platform-staff FOR ALL
    -- policy is replaced by its FOR SELECT twin: identical read, no write half.
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['std_insert','std_update','std_delete']));
    IF 'platform_admin_all' = ANY(v_expected) THEN
      v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
      v_expected:=array_append(v_expected,'platform_admin_select');
    END IF;
  END IF;$d4a3_4$, $d4z3_4$  IF v_client_read_only THEN
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['platform_admin_all','std_insert','std_update','std_delete']));
  END IF;$d4z3_4$],
    [$d4a3_5$  v_doors_only := platform.schema_is_doors_only(p_schema);
  SELECT count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    INTO v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant$d4a3_5$, $d4z3_5$  SELECT count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    INTO v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant$d4z3_5$],
    [$d4a3_6$  v_client_read_only boolean := false; v_registry_rows integer := 0;
  -- DOORS-ONLY-4 -- THE VERIFIER LEARNS THE NEW SET IN THE SAME CHANGE THAT EMITS IT.
  -- iam.generated_policy_names() now carries platform_admin_select, and DD-147's drift
  -- guard inside iam.apply_rls raises on any emitted name outside that catalog. If this
  -- function did not also learn it, policies_canonical would report the twin as
  -- legacy/unexpected on every doors-only table -- a generator arguing with its own
  -- verifier, which is the exact defect DD-249 was.
  v_doors_only boolean := false;$d4a3_6$, $d4z3_6$  v_client_read_only boolean := false; v_registry_rows integer := 0;$d4z3_6$]
  ];
  v_counts := array[1,1,1,1,1,1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2]; v_want := v_counts[i];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want then
      raise exception 'doors-only-4: iam.verify_canonical(text,text,text,text) patch % -- anchor found % time(s), expected exactly %. The live body has moved under this migration; re-derive the anchor from pg_get_functiondef and do NOT replace the function from a file (db-rules line 491). Anchor head: %',
        i, v_n, v_want, left(v_from, 140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'doors-only-4: patched iam.verify_canonical(text,text,text,text)';
end
$d4b3$;

drop function if exists platform.schema_is_doors_only(text);

delete from platform.schema_client_exposure
 where schema_name in ('platform', 'iam')
   and declared_by = 'migrations/campaign/doorsonly4_the_generator_stops_emitting_client_writes.sql (lane DOORS-ONLY-4)';

alter table platform.schema_client_exposure
  drop column if exists client_writes_doors_only;
