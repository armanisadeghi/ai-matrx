-- iam_component_never_wider_than_parent_dd175d_gate — DD-175: THE ACCESS DELTA, THE RE-PROBE AND
-- THE END-STATE ASSERTION.
--
-- dd175a measured and recorded; dd175b taught the set form the class and installed the check;
-- dd175c generated what the check reported open. This is the only file allowed to say "done", and
-- it says it only against numbers written down BEFORE anything moved.

-- ── 1. THE FLEET ACCESS DELTA — 0 WIDER, every narrowing NAMED ───────────────────────────────────
do $$
declare
  v_before uuid; v_after uuid; v_as timestamptz; v_msg text; r record;
  v_narrowed int := 0; v_principals uuid[]; v_tokens text[];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-175a BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd175d: there is no DD-175a BEFORE snapshot to compare against. A gate with no '
      'baseline is not a gate. Run …dd175a_baseline.sql first.';
  end if;

  -- the SAME cast, read back from disk rather than retyped
  select array_agg(token order by token) into v_tokens
    from iam.dd175_cast where why not like '%NOT SNAPSHOTABLE%';
  v_principals := array[
    '87a6e699-3622-4869-8843-d0867456c0dd','34ed4fc3-c527-4819-99bf-15c26603b261',
    'c5e92166-e148-4e73-926e-83af0c453665','392afd39-d59c-4418-866b-451e9d93fead',
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14','f0146c96-e02e-420b-a99f-92774da0566c',
    '00000000-0000-0000-0000-000000000000']::uuid[];

  v_after := iam.access_delta_snapshot('DD-175d AFTER', v_principals, v_tokens, 400000,
    'DD-175 confirmation, pinned to the dd175a baseline instant', v_as);

  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd175d: %', v_msg;

  for r in select token, principal_label, count_before, count_after
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'NARROWER'
            order by count_before - count_after desc limit 60
  loop
    v_narrowed := v_narrowed + 1;
    raise notice 'dd175d: NARROWED % for % : % -> %', r.token, r.principal_label,
      r.count_before, r.count_after;
  end loop;
  raise notice 'dd175d: % narrowed (token, principal) pair(s) named above', v_narrowed;
end $$;

-- ── 2. THE COMPONENT RE-PROBE — the same six identities, the same question, on disk ──────────────
do $$
declare v_p uuid[]; v_before bigint; v_after bigint; v_open text;
begin
  select array_agg(id) into v_p from auth.users
   where email in ('admin@admin.com','arman@titaniumsuccess.com','seo@titaniumsuccess.com',
                   'projectmanager@titaniumsuccess.com','test@test.com','kelvin.kiprop96@gmail.com');
  delete from iam.dd175_component_lane_baseline where phase = 'AFTER';
  insert into iam.dd175_component_lane_baseline(
    phase, component_token, component_table, parent_type, fk_column, principal_email,
    parent_ids_admitted, parent_ids_refused, rows_readable_under_refused_parent, probe_error)
  select 'AFTER', w.component_token, w.component_table, w.parent_type, w.fk_column,
         coalesce(w.principal_email, w.principal::text),
         w.parent_ids_admitted, w.parent_ids_refused, w.rows_readable_under_refused_parent,
         w.probe_error
  from iam.component_wider_than_parent(v_p) w;

  select coalesce(sum(rows_readable_under_refused_parent),0) into v_before
    from iam.dd175_component_lane_baseline where phase = 'BEFORE';
  select coalesce(sum(rows_readable_under_refused_parent),0) into v_after
    from iam.dd175_component_lane_baseline where phase = 'AFTER';

  select string_agg(format('%s/%s: %s row(s) under a refused %s',
                           component_token, principal_email,
                           rows_readable_under_refused_parent, parent_type), '; ')
    into v_open
    from iam.dd175_component_lane_baseline
   where phase = 'AFTER' and rows_readable_under_refused_parent > 0;

  if v_after > 0 then
    raise exception 'dd175d: % component row(s) are STILL readable under a parent row the principal '
      'may not read: %. The round is not done.', v_after, v_open;
  end if;
  if v_before = 0 then
    raise exception 'dd175d: the BEFORE phase recorded zero readings, so this proves nothing.';
  end if;
  raise notice 'dd175d: component rows readable under a refused parent: % -> 0', v_before;
end $$;

-- ── 3. A LEGITIMATE READER IS STILL A READER ─────────────────────────────────────────────────────
-- Over-tightening is as serious a bug as a stranger let in (db-rules §6). The snapshot tables are
-- the two this round generated, so they are the ones asserted: the OWNER of a udt_document must
-- still read its snapshots, and a component under an `organization`-class parent must not have lost
-- its organization lane.
do $$
declare v_owner uuid; v_doc uuid; v_n bigint;
begin
  select d.created_by, d.id into v_owner, v_doc
    from workbench.udt_documents d
    join workbench.udt_document_snapshots s on s.document_id = d.id
   where d.created_by is not null and d.deleted_at is null
   group by d.created_by, d.id
   order by count(*) desc limit 1;
  if v_owner is null then
    raise exception 'dd175d: no udt_document with snapshots and an owner exists, so the '
      'owner-still-reads proof cannot run. An unrun forcing test is not a forcing test.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  execute format('select count(*) from workbench.udt_document_snapshots where document_id = %L', v_doc)
    into v_n;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if v_n = 0 then
    raise exception 'dd175d: the OWNER of udt_document % reads 0 of its own snapshots. The '
      'generation took a lane it had no business taking.', v_doc;
  end if;
  raise notice 'dd175d: the owner of udt_document % still reads % of its snapshots', v_doc, v_n;
end $$;

-- ── 4. THE END STATE ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record; v_open text[] := '{}'; v_n int; v_fp text;
begin
  for r in
    select distinct et.token, et.schema_name, et.table_name
      from platform.entity_types et
      join platform.entity_relationships er on er.child_type = et.token and er.kind in ('composition','containment')
     where et.is_active and et.rls_variant = 'component'
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = er.fk_column)
     order by et.token
  loop
    if exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, 'component') v
                where v.check_name = 'component_not_wider_than_parent' and v.status = 'FAIL') then
      v_open := array_append(v_open, r.token);
    end if;
  end loop;
  if cardinality(v_open) > 0 then
    raise exception 'dd175d: component_not_wider_than_parent still FAILs on % token(s): %',
      cardinality(v_open), array_to_string(v_open, ', ');
  end if;

  -- the set form really does ask the class now, in the deployed source
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'accessible_entity_ids'
     and p.prosrc like '%v_lanes := iam.class_lanes(p_type);%';
  if v_n <> 1 then
    raise exception 'dd175d: iam.accessible_entity_ids does not resolve iam.class_lanes — the fix '
      'is not deployed (matched % overloads, expected 1)', v_n;
  end if;

  -- and the mirror will still emit (an unmatched fingerprint makes iam.entity_read_expr refuse)
  if iam.entity_read_kernel_fingerprint() <> iam.entity_read_kernel_expected() then
    raise exception 'dd175d: the read-kernel fingerprint no longer matches its expected stamp.';
  end if;
  raise notice 'dd175d: component_not_wider_than_parent is GREEN on every live component token, '
    'the set form asks iam.class_lanes, and the read-kernel fingerprint matches.';
end $$;
