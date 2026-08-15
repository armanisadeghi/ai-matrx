-- Generic picker predicates + CRM contact-only duplicate detection.
-- Applied live to txzxabzwovsujtloxrus as filter_party_picker_candidates.

alter table platform.entity_types
  add column if not exists reference_candidate_predicates jsonb not null default '{}'::jsonb;

alter table platform.entity_types
  drop constraint if exists entity_types_reference_candidate_predicates_object;

alter table platform.entity_types
  add constraint entity_types_reference_candidate_predicates_object
  check (jsonb_typeof(reference_candidate_predicates) = 'object');

comment on column platform.entity_types.reference_candidate_predicates is
  'Registry-declared equality predicates applied by reference_search_candidates. JSON keys are backing-table columns; scalar values compare by text and null means IS NULL.';

update platform.entity_types
set reference_candidate_predicates = jsonb_build_object('record_class', 'contact')
where token = 'party';

create or replace function public.reference_search_candidates(
  p_token text,
  p_search text default null,
  p_limit integer default 50,
  p_ids uuid[] default null)
returns table(id uuid, title text)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_row platform.entity_types%rowtype;
  v_has_owner boolean;
  v_has_org boolean;
  v_has_visibility boolean;
  v_has_deleted boolean;
  v_has_canonical boolean;
  v_access text;
  v_sql text;
  v_uid uuid := auth.uid();
  v_predicate record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row
  from platform.entity_types e
  where e.token = p_token and e.is_active;

  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select
    coalesce(bool_or(c.column_name = 'created_by'), false),
    coalesce(bool_or(c.column_name = 'organization_id'), false),
    coalesce(bool_or(c.column_name = 'visibility'), false),
    coalesce(bool_or(c.column_name = 'deleted_at'), false),
    coalesce(bool_or(c.column_name = 'canonical_id'), false)
  into v_has_owner, v_has_org, v_has_visibility, v_has_deleted, v_has_canonical
  from information_schema.columns c
  where c.table_schema = v_row.schema_name
    and c.table_name = v_row.table_name;

  if p_token = 'file' then
    if p_ids is not null then
      v_access := format(
        'files.has_access_for(%L, t.id, %L::public.permission_level)',
        v_uid,
        'viewer');
    else
      v_access := format(
        'files.is_listable_for(%L, t.id) and t.parent_file_id is null and not public.is_system_path(t.file_path)',
        v_uid);
    end if;
  elsif v_has_owner and v_has_org then
    v_access := format(
      't.created_by = %L or (t.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)%s)',
      v_uid,
      v_uid,
      case
        when v_has_visibility then format(
          ' and (t.visibility is null or t.visibility::text <> %L or t.created_by = %L)',
          'personal',
          v_uid)
        else ''
      end);
  elsif v_has_owner then
    v_access := format('t.created_by = %L', v_uid);
  elsif v_has_org then
    v_access := format(
      't.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)',
      v_uid);
  else
    v_access := 'true';
  end if;

  v_sql := format(
    'select t.id, t.%I::text as title from %I.%I t where (%s)',
    v_row.title_column,
    v_row.schema_name,
    v_row.table_name,
    v_access);

  if v_has_deleted then
    v_sql := v_sql || ' and t.deleted_at is null';
  end if;

  if v_has_canonical then
    v_sql := v_sql || ' and t.canonical_id is null';
  end if;

  for v_predicate in
    select p.key, p.value
    from pg_catalog.jsonb_each(v_row.reference_candidate_predicates) as p(key, value)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = v_row.schema_name
        and c.table_name = v_row.table_name
        and c.column_name = v_predicate.key
    ) then
      raise exception
        'entity "%" candidate predicate names missing column "%.%.%"',
        p_token,
        v_row.schema_name,
        v_row.table_name,
        v_predicate.key;
    end if;

    if v_predicate.value = 'null'::jsonb then
      v_sql := v_sql || format(' and t.%I is null', v_predicate.key);
    elsif jsonb_typeof(v_predicate.value) in ('string', 'number', 'boolean') then
      v_sql := v_sql || format(
        ' and t.%I::text = %L',
        v_predicate.key,
        v_predicate.value #>> '{}');
    else
      raise exception
        'entity "%" candidate predicate "%" must be a scalar or null',
        p_token,
        v_predicate.key;
    end if;
  end loop;

  if p_ids is not null then
    v_sql := v_sql || format(' and t.id = any(%L::uuid[])', p_ids);
  end if;

  if nullif(trim(p_search), '') is not null then
    v_sql := v_sql || format(
      ' and t.%I::text ilike %L',
      v_row.title_column,
      '%' || trim(p_search) || '%');
  end if;

  v_sql := v_sql || format(
    ' order by t.%I limit %s',
    v_row.title_column,
    least(greatest(coalesce(p_limit, 50), 1), 200));

  return query execute v_sql;
end
$function$;

revoke execute on function public.reference_search_candidates(text, text, integer, uuid[]) from public, anon;
grant execute on function public.reference_search_candidates(text, text, integer, uuid[]) to authenticated;

create or replace function public.crm_detect_merge_candidates(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auto jsonb := '[]'::jsonb;
  v_refreshed int := 0;
  v_pending int;
  v_merge uuid;
  r record;
begin
  if auth.uid() is null or not iam.has_org_access_for(auth.uid(), p_org) then
    raise exception 'crm_detect_merge_candidates: organization membership required'
      using errcode = '42501';
  end if;

  for r in
    select distinct
      case when pa.created_at <= pb.created_at then pa.id else pb.id end as winner_id,
      case when pa.created_at <= pb.created_at then pb.id else pa.id end as loser_id,
      m.channel,
      m.display_value
    from crm.party_contact_point a
    join crm.party_contact_point b
      on b.medium_id = a.medium_id and b.party_id > a.party_id
    join crm.contact_medium m on m.id = a.medium_id
    join crm.party pa on pa.id = a.party_id
    join crm.party pb on pb.id = b.party_id
    where m.organization_id = p_org
      and m.deleted_at is null
      and m.channel in ('email', 'phone')
      and a.deleted_at is null
      and b.deleted_at is null
      and a.is_identity_key
      and b.is_identity_key
      and pa.deleted_at is null
      and pa.canonical_id is null
      and pa.record_class = 'contact'
      and pb.deleted_at is null
      and pb.canonical_id is null
      and pb.record_class = 'contact'
      and pa.party_kind = pb.party_kind
  loop
    if exists (
      select 1
      from crm.party
      where id in (r.winner_id, r.loser_id)
        and (canonical_id is not null or deleted_at is not null or record_class <> 'contact')
    ) then
      continue;
    end if;

    begin
      v_merge := public.crm_merge_parties(
        r.winner_id,
        r.loser_id,
        'auto',
        format(
          'identity key collision: both records hold %s %s',
          r.channel,
          r.display_value));

      v_auto := v_auto || jsonb_build_object(
        'winner_id', r.winner_id,
        'loser_id', r.loser_id,
        'merge_id', v_merge);
    exception when others then
      insert into crm.merge_candidate as mc (
        source_id,
        target_id,
        organization_id,
        signals,
        confidence)
      values (
        least(r.winner_id, r.loser_id),
        greatest(r.winner_id, r.loser_id),
        p_org,
        jsonb_build_array(jsonb_build_object(
          'kind', 'identity_collision',
          'channel', r.channel,
          'value', r.display_value)),
        95)
      on conflict (source_id, target_id) do update set
        signals = excluded.signals,
        confidence = greatest(mc.confidence, excluded.confidence),
        last_detected_at = now(),
        status = case
          when mc.status = 'dismissed' then 'dismissed'
          else 'pending'
        end;
    end;
  end loop;

  with raw as (
    select
      least(pa.id, pb.id) as s,
      greatest(pa.id, pb.id) as t,
      jsonb_build_object(
        'kind', 'shared_medium',
        'channel', m.channel,
        'value', m.display_value) as signal,
      90 as confidence
    from crm.party_contact_point a
    join crm.party_contact_point b
      on b.medium_id = a.medium_id and b.party_id > a.party_id
    join crm.contact_medium m on m.id = a.medium_id
    join crm.party pa on pa.id = a.party_id
    join crm.party pb on pb.id = b.party_id
    where m.organization_id = p_org
      and m.deleted_at is null
      and m.channel in ('email', 'phone')
      and a.deleted_at is null
      and b.deleted_at is null
      and not (a.is_identity_key and b.is_identity_key)
      and pa.deleted_at is null
      and pa.canonical_id is null
      and pa.record_class = 'contact'
      and pb.deleted_at is null
      and pb.canonical_id is null
      and pb.record_class = 'contact'
      and pa.party_kind = pb.party_kind

    union all

    select
      least(pa.id, pb.id),
      greatest(pa.id, pb.id),
      jsonb_build_object('kind', 'name_key', 'value', pa.name_key),
      60
    from crm.party pa
    join crm.party pb
      on pb.name_key = pa.name_key
      and pb.id > pa.id
      and pb.party_kind = pa.party_kind
      and pb.organization_id = pa.organization_id
    where pa.organization_id = p_org
      and pa.name_key is not null
      and length(pa.name_key) >= 3
      and pa.deleted_at is null
      and pa.canonical_id is null
      and pa.record_class = 'contact'
      and pb.deleted_at is null
      and pb.canonical_id is null
      and pb.record_class = 'contact'

    union all

    select
      least(ca.id, cb.id),
      greatest(ca.id, cb.id),
      jsonb_build_object('kind', 'domain', 'value', ca.primary_domain),
      75
    from crm.party ca
    join crm.party_contact_point p on p.deleted_at is null
    join crm.contact_medium m
      on m.id = p.medium_id
      and m.deleted_at is null
      and m.channel = 'email'
      and m.value_key like '%@' || lower(ca.primary_domain)
    join crm.party cb on cb.id = p.party_id and cb.id <> ca.id
    where ca.organization_id = p_org
      and m.organization_id = p_org
      and ca.party_kind = 'organization'
      and cb.party_kind = 'organization'
      and ca.primary_domain is not null
      and ca.deleted_at is null
      and ca.canonical_id is null
      and ca.record_class = 'contact'
      and cb.deleted_at is null
      and cb.canonical_id is null
      and cb.record_class = 'contact'
  ),
  agg as (
    select
      s,
      t,
      jsonb_agg(distinct signal) as signals,
      max(confidence) as confidence
    from raw
    group by s, t
  )
  insert into crm.merge_candidate as mc (
    source_id,
    target_id,
    organization_id,
    signals,
    confidence)
  select s, t, p_org, signals, confidence
  from agg
  on conflict (source_id, target_id) do update set
    signals = excluded.signals,
    confidence = greatest(mc.confidence, excluded.confidence),
    last_detected_at = now(),
    status = case
      when mc.status = 'dismissed' then 'dismissed'
      else 'pending'
    end;
  get diagnostics v_refreshed = row_count;

  update crm.merge_candidate mc
  set status = 'stale', updated_at = now()
  where mc.organization_id = p_org
    and mc.status = 'pending'
    and exists (
      select 1
      from crm.party p
      where p.id in (mc.source_id, mc.target_id)
        and (
          p.deleted_at is not null
          or p.canonical_id is not null
          or p.record_class <> 'contact'
        )
    );

  select count(*)
  into v_pending
  from crm.merge_candidate mc
  join crm.party s on s.id = mc.source_id
  join crm.party t on t.id = mc.target_id
  where mc.organization_id = p_org
    and mc.status = 'pending'
    and mc.deleted_at is null
    and s.deleted_at is null
    and s.canonical_id is null
    and s.record_class = 'contact'
    and t.deleted_at is null
    and t.canonical_id is null
    and t.record_class = 'contact';

  return jsonb_build_object(
    'auto_merged', v_auto,
    'refreshed_candidates', v_refreshed,
    'pending_candidates', v_pending);
end
$function$;

revoke execute on function public.crm_detect_merge_candidates(uuid) from public, anon;
grant execute on function public.crm_detect_merge_candidates(uuid) to authenticated, service_role;
