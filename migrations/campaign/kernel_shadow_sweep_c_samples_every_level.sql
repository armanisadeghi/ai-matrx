-- lane: SWEEP-SAMPLER
-- based-on: iam.kernel_shadow_sweep(integer, integer) 7e71dcbf1c419ace5b4329515f7798e9230ded01acc6dfee84009cf4849aa6da
-- KERNEL-SHADOW sweep c — the drift sweep draws a STRATIFIED sample. Measured gap: it sampled only the
-- rows of the built-in Table definition table, so rows of custom data tables (Confidential, Public,
-- Private, Organization) were never compared between the set form and the one-at-a-time form.
-- Now every run samples, per access level present: Confidential rows (always some when any Confidential
-- Table exists), Public rows (Tables at level public, rows published to the web), Private rows (Tables at
-- level private, "only me" rows), Organization data rows, and the Table definition rows. For each stratum
-- the people are: admin@admin.com, test@test.com, random members, one member INSIDE the stratum's
-- organization, one OUTSIDE it, and (Confidential) the people the reader fields of the sampled rows name.
-- Every comparison log row names its stratum, tables and counts in `caller`. Only the sampler changes:
-- the access kernel, the set form, the shadow and RLS are untouched. Signature and schedule unchanged.
-- Inverse: kernel_shadow_sweep_c_samples_every_level.inverse.sql

create or replace function iam.kernel_shadow_sweep(p_people integer default 3, p_tables integer default 300)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
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

  select count(*) into v_bad from iam.access_shadow_log l
   where l.at = now() and l.target is not null and l.caller like 'iam.kernel_shadow_sweep|%';
  return jsonb_build_object('compared', v_n, 'disagreements', v_bad, 'strata', v_summary);
end;
$function$;
