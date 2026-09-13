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
  v_schema text; v_table text; v_clock text; v_stale bigint; v_unpinned int := 0;
  v_pairs int; v_bad int;
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

  -- 🚨 THE PIN IS ONLY A PIN WHERE THERE IS A COLUMN TO PIN TO.
  -- iam.access_delta_snapshot pins a probe to the baseline instant with `created_at`/`occurred_at`.
  -- Three tokens in this cast carry NEITHER — canvas.canvas_views, docproc.derive_runs and
  -- docproc.page_extraction_page_runs — so live traffic that arrived between the two snapshots is
  -- indistinguishable, to that function, from a lane that opened. The first run of this gate
  -- refused on exactly that: `canvas_view / admin@admin.com: 23 -> 27`, four rows, all four written
  -- AFTER the baseline (viewed_at 04:27:29, 04:28:48, 04:29:18 and 04:46:27 against a baseline of
  -- 04:11:49) and every one of them admin@admin.com''s OWN row.
  --
  -- "I could not measure it" and "it did not widen" are the two sentences this harness exists to
  -- keep apart, so the unpinnable tokens are not waived and not dropped from the cast: each gained
  -- id is made to prove, on the ROW''S OWN CLOCK, that it did not exist when the baseline was taken.
  -- A gained row that was already there when the baseline ran, or a token with no event clock to
  -- ask, refuses the gate exactly as before.
  for r in select token, principal_id, principal_label, count_before, count_after, gained_sample
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'WIDER'
  loop
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = r.token and et.is_active;
    if exists (select 1 from information_schema.columns c
                where c.table_schema = v_schema and c.table_name = v_table
                  and c.column_name in ('created_at','occurred_at')) then
      raise exception using errcode = '42501', message = format(
        'dd175d: %s / %s WIDENED %s -> %s on a table the snapshot CAN pin (it carries '
        'created_at/occurred_at), so this is a real widening, not clock drift. Gained: %s',
        r.token, r.principal_label, r.count_before, r.count_after, r.gained_sample);
    end if;
    select c.column_name into v_clock
      from information_schema.columns c
     where c.table_schema = v_schema and c.table_name = v_table
       and c.column_name in ('viewed_at','started_at','inserted_at','logged_at')
     order by case c.column_name when 'viewed_at' then 0 when 'started_at' then 1
                                 when 'inserted_at' then 2 else 3 end
     limit 1;
    if v_clock is null then
      raise exception using errcode = '42501', message = format(
        'dd175d: %s / %s WIDENED %s -> %s and the table has NO clock of its own to ask — neither a '
        'pin column nor an event timestamp. It cannot be measured, so it is not proven. Gained: %s',
        r.token, r.principal_label, r.count_before, r.count_after, r.gained_sample);
    end if;
    execute format(
      'select count(*) from %I.%I t where t.id = any($1) and (t.%I is null or t.%I <= $2)',
      v_schema, v_table, v_clock, v_clock)
      into v_stale using r.gained_sample, v_as;
    if v_stale <> 0 then
      raise exception using errcode = '42501', message = format(
        'dd175d: %s / %s WIDENED %s -> %s and %s of the gained row(s) already existed at the '
        'baseline instant %s by their own %s. That is a lane that opened. Gained: %s',
        r.token, r.principal_label, r.count_before, r.count_after, v_stale, v_as, v_clock,
        r.gained_sample);
    end if;
    v_unpinned := v_unpinned + 1;
    raise notice 'dd175d: %s / %s % -> % — all % gained row(s) were written after the baseline % '
      '(by %.%), so the readable LANE did not move; the table just took traffic.',
      r.token, r.principal_label, r.count_before, r.count_after,
      coalesce(array_length(r.gained_sample,1),0), v_as, v_table, v_clock;
  end loop;

  -- Everything the harness can pin, gated exactly as every other round gates it. UNMEASURED and
  -- UNPROVEN still refuse; the loop above has already refused any WIDER pair it could not explain
  -- on the row''s own clock, so a WIDER verdict reaching here would be one of those three
  -- explained pairs.
  select count(*) into v_pairs from iam.access_delta_compare(v_before, v_after);
  select count(*) filter (where verdict in ('UNMEASURED','UNPROVEN')),
         string_agg(format('%s / %s (%s)', token, principal_label, verdict), E'\n')
           filter (where verdict in ('UNMEASURED','UNPROVEN'))
    into v_bad, v_msg
    from iam.access_delta_compare(v_before, v_after);
  if coalesce(v_bad,0) > 0 then
    raise exception using errcode = '42501', message = format(
      E'dd175d: %s pair(s) could not be MEASURED, so nothing here proves they did not widen:\n%s',
      v_bad, v_msg);
  end if;
  raise notice 'dd175d: access delta over % pairs — 0 unexplained widenings, % traffic-only '
    'widening(s) proven on the row''s own clock.', v_pairs, v_unpinned;

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
