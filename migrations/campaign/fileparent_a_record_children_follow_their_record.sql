-- lane: FILE-PARENT-TRUTH (Unified Data program)
-- based-on: iam.kernel_shadow_sweep(integer, integer) c673fdd4cadf2187ee818a96d9898014972dc32a56cf8e0f0481dd06a8aee111
-- lock: iam
--
-- FILE-PARENT-TRUTH (2026-10-08): A FILE UNDER A TABLE ROW FOLLOWS ITS ROW; THE SWEEP ASKS THE WHOLE READ POLICY.
--
-- FINDING (ENTITY-IDS-2): in a rolled-back sample of 40 files under store rows, "the files read policy" let
-- test@test.com see 25 files the kernel (files.has_access_for) refuses. Diagnosed 2026-10-08 on live (rolled back,
-- same md5 sample, three seats): the read policy Postgres actually runs (std_select AND the restrictive org_open_gate)
-- agrees with the kernel and with the set form 40/40 for admin@admin.com, test@test.com and dd048-joiner. The
-- disagreement was the comparison: iam.kernel_shadow_sweep (and the ENTITY-IDS-2 check) evaluated std_select's text
-- alone, which keeps the owner lane for an owner's file in an ARCHIVED organization; org_open_gate and the kernel's
-- T-33 step close those to everyone. 21 of the 40 were exactly that; none was a real read.
--
-- A REAL GAP FOUND ON THE WAY (policy, kernel and set form all agree on it, so no sweep could see it): a file under a
-- Confidential row whose own visibility is 'public' opens to every signed-in person - measured: an HR-notes recording
-- under a "360 review meeting notes" row, published by the named HR manager who uploaded it, read by the plain member
-- and by a stranger. The access ladder: children have no row controls; Confidential is never published. The file's own
-- publish flag is a row control on a child. Closed at the write, so every reader (policy, kernel, set form) inherits it
-- with no read cost and no change to any other parent type:
--   * a write that leaves a store row's child published (insert, publish, or attaching a published file - variants
--     following their source included) is refused (42501) with the way out: publish the row, or share the file; to
--     attach a published file, unpublish it first. Unpublished, it opens as its row does (the organization lanes
--     never open a child). The trigger reads published_to_web only (T-13: no new reader of the retiring column);
--     _a0_t13_dual_write has already reconciled the two when it runs.
-- Live today: 0 files name a store row, so nothing is rewritten.
--
-- Revert: migrations/inverse/fileparent_a_record_children_follow_their_record_down.sql

CREATE OR REPLACE FUNCTION iam.kernel_shadow_sweep(p_people integer DEFAULT 3, p_tables integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW: the read-write half of the drift guard. Compares both forms of the access kernel in its
-- own transaction through iam.has_access_for_shadow, at viewer and editor, on a stratified sample of
-- rows (see the file header). p_tables is the total rows per person; p_people the random members.
declare
  v_kernel  uuid := custom.table_kernel_id();
  v_base    uuid[];
  v_conf_t  uuid[];
  v_pub_t   uuid[];
  v_priv_t  uuid[];
  v_name    text;
  v_ids     uuid[];
  v_org     uuid;
  v_label   text;
  v_who     uuid[];
  v_inside  uuid;
  v_outside uuid;
  v_named   uuid[];
  v_p       uuid;
  v_lvl     text;
  v_caller  text;
  v_n       integer := 0;
  v_tot     integer;
  v_summary jsonb := '[]'::jsonb;
  v_cap     integer;
  v_bad     integer;
  -- ENTITY-IDS-2: the record-parented-file stratum
  v_files   uuid[];
  v_synth   boolean := false;
  v_qual    text;
  v_f       uuid;
  v_fk      boolean;
  v_fp      boolean;
  v_fs      boolean;
  v_fset    uuid[];
  v_rows    jsonb := '[]'::jsonb;
  v_claims0 text := current_setting('request.jwt.claims', true);
  v_ferr    text;
begin
  -- The shadow writes an agreement only into a transaction that has already written; the sweep IS its
  -- own transaction and its summaries are its point, so it takes a transaction id first.
  perform pg_catalog.pg_current_xact_id();
  v_tot := greatest(p_tables, 5);
  v_base := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid]
         || array(select distinct on (u) u from (select om.user_id as u from iam.organization_member om
                                                 order by random() limit greatest(p_people, 0) * 4) z
                   limit greatest(p_people, 0));

  select array_agg(t.id) filter (where t.data ->> 'level' = 'confidential'),
         array_agg(t.id) filter (where t.data ->> 'level' = 'public'),
         array_agg(t.id) filter (where t.data ->> 'level' = 'private')
    into v_conf_t, v_pub_t, v_priv_t
    from custom.record t
   where t.table_id = v_kernel and t.data_class = 'table'
     and t.data ->> 'level' in ('confidential', 'public', 'private');

  foreach v_name in array array['confidential', 'public', 'private', 'organization', 'table_definition'] loop
    v_ids := null; v_org := null; v_label := null; v_named := null;

    if v_name = 'confidential' then
      v_cap := greatest(v_tot / 10, 12);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.table_id = any (coalesce(v_conf_t, '{}')) and r.data_class = 'record'
               order by random() limit v_cap) x;
    elsif v_name = 'public' then
      v_cap := greatest(v_tot / 20, 5);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.published_to_web or (r.table_id = any (coalesce(v_pub_t, '{}')) and r.data_class = 'record')
               order by random() limit v_cap) x;
    elsif v_name = 'private' then
      v_cap := greatest(v_tot / 20, 5);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.shown_to = 'only_me' or (r.table_id = any (coalesce(v_priv_t, '{}')) and r.data_class = 'record')
               order by random() limit v_cap) x;
    elsif v_name = 'organization' then
      v_cap := greatest(v_tot / 5, 10);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r tablesample system (2)
               where r.data_class = 'record'
                 and r.table_id <> all (coalesce(v_conf_t, '{}') || coalesce(v_pub_t, '{}') || coalesce(v_priv_t, '{}'))
               order by random() limit v_cap) x;
    else
      v_cap := greatest(v_tot / 5, 10);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r tablesample system (5)
               where r.table_id = v_kernel order by random() limit v_cap) x;
    end if;

    if v_ids is null then
      v_summary := v_summary || jsonb_build_object('level', v_name, 'tables', 'none present', 'rows', 0, 'people', 0, 'compared', 0);
      continue;
    end if;

    -- Which Tables the sampled rows belong to (named, so the log row says what was sampled).
    if v_name = 'table_definition' then
      v_label := 'the Table definitions';
    else
      select string_agg(distinct coalesce(t.data ->> 'name', '?') || ' ' || left(t.id::text, 8), ', ')
        into v_label
        from custom.record r join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id
       where r.id = any (v_ids);
      v_label := coalesce(left(v_label, 300), 'rows without a Table');
    end if;

    -- People: the base seats, one inside and one outside the stratum's organization, and any person
    -- a reader field of a sampled Confidential row names.
    select om.user_id into v_inside from iam.organization_member om
     where om.organization_id = v_org order by random() limit 1;
    select z.u into v_outside
      from (select om.user_id as u from iam.organization_member om
             where om.organization_id <> v_org order by random() limit 12) z
     where not exists (select 1 from iam.organization_member o2 where o2.user_id = z.u and o2.organization_id = v_org)
     limit 1;
    if v_name = 'confidential' then
      select array_agg(distinct x.v::uuid) into v_named
        from (select r.data ->> (rd ->> 'field') as v
                from custom.record r
                join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id
                cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data -> 'readers') = 'array'
                                                             then t.data -> 'readers' else '[]'::jsonb end) rd
               where r.id = any (v_ids)) x
       where x.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      v_named := v_named[1:3];
    end if;
    v_who := array(select distinct u from unnest(v_base || array[v_inside, v_outside] || coalesce(v_named, '{}')) u
                    where u is not null);

    v_caller := format('iam.kernel_shadow_sweep|%s|%s|%s rows|%s people', v_name, v_label, cardinality(v_ids), cardinality(v_who));
    foreach v_p in array v_who loop
      foreach v_lvl in array array['viewer', 'editor'] loop
        perform 1 from iam.has_access_for_shadow(v_p, v_ids, v_lvl, 'record', v_caller);
        v_n := v_n + cardinality(v_ids);
      end loop;
    end loop;
    v_summary := v_summary || jsonb_build_object('level', v_name, 'tables', v_label, 'rows', cardinality(v_ids),
                   'people', cardinality(v_who), 'compared', cardinality(v_ids) * cardinality(v_who) * 2);
  end loop;

  -- ENTITY-IDS-2 (2026-10-08): FILES WHOSE PARENT IS A STORE RECORD. The files read policy's child lane and the set
  -- every files component policy takes as final reach the record through iam.accessible_child_parents and
  -- iam.accessible_entity_ids; the kernel (files.has_access_for) walks to it itself. Each sampled file is asked all
  -- three ways for the base seats; a difference is a disagreement row (old = kernel, new = policy or set). When no
  -- file names a record yet, one under a Confidential row and one under an Organization row are written inside a
  -- block that is rolled back (the answers leave it in variables).
  select array_agg(x.id) into v_files
    from (select f.id from files.files f where f.parent_record_type = 'record' and f.deleted_at is null
           order by random() limit 6) x;
  -- FILE-PARENT-TRUTH (2026-10-08): the read policy is what Postgres runs, not std_select alone: every permissive
  -- SELECT/ALL policy ORed, ANDed with every restrictive one (org_open_gate closes an archived organization's files to
  -- everyone, owner included, as the kernel's T-33 step does). std_select alone counted an owner's file in an archived
  -- organization as readable: 21 of 40 sampled files for test@test.com were that, not a leak.
  select '(' || string_agg('(' || p.qual || ')', ' or ') filter (where p.permissive = 'PERMISSIVE') || ')'
         || coalesce(' and ' || string_agg('(' || p.qual || ')', ' and ') filter (where p.permissive = 'RESTRICTIVE'), '')
    into v_qual
    from pg_catalog.pg_policies p
   where p.schemaname = 'files' and p.tablename = 'files' and p.cmd in ('SELECT', 'ALL') and p.qual is not null
     and p.roles && array['authenticated', 'public']::name[];
  begin
    if v_files is null then
      v_synth := true;
      with src as (
        (select r.id, r.organization_id, r.created_by from custom.record r
          where r.table_id = any (coalesce(v_conf_t, '{}')) and r.data_class = 'record' and r.created_by is not null
          order by random() limit 1)
        union all
        (select r.id, r.organization_id, r.created_by from custom.record r tablesample system (1)
          where r.data_class = 'record' and r.created_by is not null
            and r.table_id <> all (coalesce(v_conf_t, '{}')) order by random() limit 1)
      ), ins as (
        insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id)
        select s.created_by, s.organization_id, 'kernel-shadow-sweep/' || s.id || '.webm', 'Sweep recording.webm',
               's3://kernel-shadow-sweep/' || s.id || '.webm', 'record', s.id
          from src s
        returning id
      )
      select array_agg(ins.id) into v_files from ins;
    end if;
    foreach v_p in array v_base[1:3] loop
      perform pg_catalog.set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      v_fset := iam.accessible_entity_ids('file', 'viewer'::public.permission_level, 0, true);
      foreach v_f in array coalesce(v_files, '{}') loop
        v_fk := coalesce(files.has_access_for(v_p, v_f, 'viewer'::public.permission_level), false);
        execute pg_catalog.format('select exists (select 1 from files.files where id = $1 and (%s))', v_qual) into v_fp using v_f;
        v_fs := v_f = any (coalesce(v_fset, '{}'));
        v_rows := v_rows || jsonb_build_object('p', v_p, 'f', v_f, 'k', v_fk, 'pol', v_fp, 's', v_fs);
      end loop;
    end loop;
    if v_synth then
      raise exception using errcode = 'KS000', message = 'kernel shadow sweep: synthetic record-parented files rolled back';
    end if;
  exception
    when sqlstate 'KS000' then null;
    when others then v_ferr := sqlstate || ': ' || sqlerrm;
  end;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller, compared, disagreed, error)
  select (r ->> 'p')::uuid, (r ->> 'f')::uuid, 'viewer', (r ->> 'k')::boolean,
         case when (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean then (r ->> 'pol')::boolean else (r ->> 's')::boolean end,
         pg_catalog.format('iam.kernel_shadow_sweep|record_parented_file|%s|%s', case when v_synth then 'synthetic, rolled back' else 'live files' end,
                           case when (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean then 'files read policy' else 'file set (component policies)' end),
         null, null, null
    from jsonb_array_elements(v_rows) r
   where (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean or (r ->> 's')::boolean is distinct from (r ->> 'k')::boolean;
  if v_ferr is not null then
    insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller, compared, disagreed, error)
    values (null, null, 'viewer', null, null, 'iam.kernel_shadow_sweep|record_parented_file|failed', 0, 0, v_ferr);
  end if;
  v_n := v_n + jsonb_array_length(v_rows) * 2;
  v_summary := v_summary || jsonb_build_object('level', 'record_parented_file', 'tables', case when v_synth then 'synthetic, rolled back' else 'live files' end,
                 'rows', coalesce(cardinality(v_files), 0), 'people', least(cardinality(v_base), 3),
                 'compared', jsonb_array_length(v_rows) * 2, 'error', v_ferr,
                 'disagreed', (select count(*) from jsonb_array_elements(v_rows) r
                                where (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean
                                   or (r ->> 's')::boolean is distinct from (r ->> 'k')::boolean),
                 'answers', v_rows);

  select count(*) into v_bad from iam.access_shadow_log l
   where l.at = now() and l.target is not null and l.caller like 'iam.kernel_shadow_sweep|%';
  return jsonb_build_object('compared', v_n, 'disagreements', v_bad, 'strata', v_summary);
end;
$function$;

create or replace function files._record_children_follow_their_record()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
-- FILE-PARENT-TRUTH (2026-10-08): a file under a store row opens as its row does; publishing it on its own is a row
-- control on a child (access ladder: children have no row controls; Confidential is never published). Runs after
-- _a0_t13_dual_write, so published_to_web already says what the row column says (T-13: published_to_web is the one
-- publish lane; this body names nothing else).
begin
  if new.parent_record_type = 'record' and coalesce(new.published_to_web, false) then
    raise exception using
      errcode = '42501',
      message = 'A file under a table row follows its row; it cannot be published on its own.',
      detail  = format('file %s, row %s', new.id, new.parent_record_id),
      hint    = 'Publish the row, or share the file with the people who need it. To attach a published file to a row, unpublish it first.';
  end if;
  return new;
end;
$fn$;

-- Fires after _a0_t13_dual_write (which reconciles the row column with published_to_web) and after
-- _stamp_parent_record (which names a variant's record): BEFORE row triggers run in name order.
create trigger _stamp_parent_record_follows
  before insert or update on files.files
  for each row execute function files._record_children_follow_their_record();
