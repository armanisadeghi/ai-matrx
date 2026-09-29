-- resource_inventory_kind_counts_and_paged_candidates.sql
--
-- chair-step: public.reference_search_candidates widens from 4 to 8 arguments (order, offset, organization, mine). The old identity must be DROPPED in the same transaction, because a 4-argument and an 8-argument overload with defaults are ambiguous to every existing named-argument caller; the door row moves to the new identity in the same transaction. The one REVOKE closes the internal filter builder to every client role.
--
-- lane: A5-P, "one source input" campaign (common-docs/projects/unified-source-input/REGISTER.md A5-P;
-- study: recon/RESOURCE-INVENTORY.md).
-- based-on: public.reference_search_candidates(text, text, integer, uuid[]) 3a34d3722c6189dce0ea7df26c62d09d915989dfb651e27b6abc5fb72ff20f2e
--   (live body read with pg_get_functiondef on 2026-09-29 immediately before this file was written).
--
-- What someone sees is a FILTER, never permission. Row security stays the ceiling; nothing here adds an
-- access rule or touches a policy or grant beyond what the replaced read already had.
--
-- 1. platform.entity_types.source_input_pickable — which kinds the Source input's "Use existing" row offers
--    (so deals, CRM parties, SEO rows never appear). Set on the kinds the study lists that have a
--    searchable per-person table today.
-- 2. platform._inventory_filter(token, viewer, organization, mine, by_ids) — the ONE place that builds the
--    "what this person has of this kind" WHERE clause. Lists and counts both call it, so a count can never
--    disagree with the list it heads. It reads the Shown to list filter (platform.shown_to_lists, T-11)
--    instead of the old row column (T-13 phase 5 direction), and hides machine files set-based
--    (child files, system paths, crawl artifacts) so a 20,000-file library counts in tens of ms.
-- 3. public.reference_search_candidates gains p_order ('title' | 'recent'), p_offset (paging),
--    p_organization_id / p_mine (scope filters), and returns updated_at for "title · date" rows.
--    Existing callers (named p_token/p_search/p_limit/p_ids) are unchanged: default order stays title.
-- 4. public.entity_kind_counts(p_tokens, p_organization_id, p_mine) — per-kind counts in one round trip.
--    p_tokens null = every kind flagged source_input_pickable. A kind that cannot be counted returns
--    n = null (the screen shows a dash), never a fake 0.
-- 5. Feature knob resources.inventory / page_size = 50 (org and person may override).

set local lock_timeout = '2s';

-- ─── 1. The registry flag ────────────────────────────────────────────────────
alter table platform.entity_types
  add column if not exists source_input_pickable boolean not null default false;

comment on column platform.entity_types.source_input_pickable is
  'The Source input''s "Use existing" row offers this kind (A5-P, 2026-09-29). Requires reference_pickable + title_column. Deals, CRM parties and SEO rows stay false.';

update platform.entity_types
   set source_input_pickable = true
 where token in ('file', 'note', 'transcript', 'udt_document', 'dataset', 'workbook')
   and not source_input_pickable;

-- ─── 2. The one inventory filter ─────────────────────────────────────────────
create or replace function platform._inventory_filter(
  p_token text,
  p_uid uuid,
  p_organization_id uuid default null,
  p_mine boolean default false,
  p_by_ids boolean default false
)
returns table(
  schema_name text,
  table_name text,
  title_column text,
  recent_column text,
  where_sql text
)
language plpgsql
stable
set search_path to ''
as $function$
-- Returns the FROM target and a WHERE clause (alias t) for "rows of this kind this viewer has".
-- The clause may reference $1 = platform.shown_to_context(p_token) (jsonb); every caller executes it
-- with that one USING argument. Internal: only the definer doors below call it.
declare
  v_row platform.entity_types%rowtype;
  v_cols text[];
  v_access text;
  v_where text;
  v_predicate record;
  v_recent text;
begin
  select * into v_row
  from platform.entity_types e
  where e.token = p_token and e.is_active;

  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select coalesce(array_agg(c.column_name::text), '{}')
    into v_cols
  from information_schema.columns c
  where c.table_schema = v_row.schema_name
    and c.table_name = v_row.table_name;

  if p_token = 'file' then
    if p_by_ids then
      v_access := format(
        'files.has_access_for(%L, t.id, %L::public.permission_level)', p_uid, 'viewer');
    else
      -- Machine files are hidden set-based (the same rules files.is_listable_for applies through
      -- files.is_crawl_artifact, spelled as anti-joins so a large library is not one plpgsql call per
      -- row); the viewer's own files need nothing more, anyone else's go through the canonical check.
      v_access := format(
        't.parent_file_id is null'
        ' and not public.is_system_path(t.file_path)'
        ' and not (t.metadata @> %L::jsonb)'
        ' and not exists (select 1 from web.snapshot s where s.body_file_id = t.id)'
        ' and not exists (select 1 from web.snapshot s where s.markdown_file_id = t.id)'
        ' and not exists (select 1 from web.screenshot s where s.file_id = t.id)'
        ' and (t.created_by = %L or files.is_listable_for(%L, t.id))',
        '{"system_artifact": true, "artifact_domain": "web_crawl"}', p_uid, p_uid);
    end if;
  elsif p_by_ids then
    -- By-id TITLE RESOLUTION (not enumeration): the caller already holds the ids; the only question is
    -- "may this viewer read these rows?" — exactly iam.has_access, the verdict row security gives.
    v_access := format(
      'iam.has_access(%L, t.id, %L::public.permission_level)', p_token, 'viewer');
  elsif 'created_by' = any(v_cols) and 'organization_id' = any(v_cols) then
    if v_row.data_class = 'private' then
      -- A Private record opens to its owner alone (access ladder).
      v_access := format('t.created_by = %L', p_uid);
    elsif 'shown_to' = any(v_cols) then
      -- $1 holds only the viewer's live organizations, so "? organization" is the membership test.
      v_access := format(
        't.created_by = %L or (t.organization_id is not null and $1 ? t.organization_id::text'
        ' and platform.shown_to_lists(t.shown_to, null, t.created_by, t.organization_id, %L, $1))',
        p_uid, p_uid);
    else
      v_access := format(
        't.created_by = %L or (t.organization_id is not null and $1 ? t.organization_id::text)',
        p_uid);
    end if;
  elsif 'created_by' = any(v_cols) then
    v_access := format('t.created_by = %L', p_uid);
  elsif 'organization_id' = any(v_cols) then
    v_access := '(t.organization_id is not null and $1 ? t.organization_id::text)';
  else
    v_access := 'true';
  end if;

  v_where := '(' || v_access || ')';

  -- Scope filters. Filters only: they narrow what the access clause above already admits.
  if coalesce(p_mine, false) then
    if not ('created_by' = any(v_cols)) then
      raise exception 'entity "%" has no created_by column, so it cannot be filtered to "mine"', p_token;
    end if;
    v_where := v_where || format(' and t.created_by = %L', p_uid);
  end if;
  if p_organization_id is not null then
    if not ('organization_id' = any(v_cols)) then
      raise exception 'entity "%" has no organization_id column, so it cannot be filtered to an organization', p_token;
    end if;
    v_where := v_where || format(' and t.organization_id = %L', p_organization_id);
  end if;

  if 'deleted_at' = any(v_cols) then
    v_where := v_where || ' and t.deleted_at is null';
  end if;
  if 'canonical_id' = any(v_cols) then
    v_where := v_where || ' and t.canonical_id is null';
  end if;
  if not p_by_ids then
    -- Archived items leave lists (archived-items law); a held id still resolves its title.
    if 'is_archived' = any(v_cols) then
      v_where := v_where || ' and t.is_archived is not true';
    end if;
    if 'archived_at' = any(v_cols) then
      v_where := v_where || ' and t.archived_at is null';
    end if;
  end if;

  for v_predicate in
    select p.key, p.value
    from pg_catalog.jsonb_each(v_row.reference_candidate_predicates) as p(key, value)
  loop
    if not (v_predicate.key = any(v_cols)) then
      raise exception
        'entity "%" candidate predicate names missing column "%.%.%"',
        p_token, v_row.schema_name, v_row.table_name, v_predicate.key;
    end if;
    if v_predicate.value = 'null'::jsonb then
      v_where := v_where || format(' and t.%I is null', v_predicate.key);
    elsif jsonb_typeof(v_predicate.value) in ('string', 'number', 'boolean') then
      v_where := v_where || format(' and t.%I::text = %L', v_predicate.key, v_predicate.value #>> '{}');
    else
      raise exception 'entity "%" candidate predicate "%" must be a scalar or null', p_token, v_predicate.key;
    end if;
  end loop;

  v_recent := case
    when 'updated_at' = any(v_cols) then 'updated_at'
    when 'created_at' = any(v_cols) then 'created_at'
    else null
  end;

  return query select v_row.schema_name, v_row.table_name, v_row.title_column, v_recent, v_where;
end
$function$;

revoke all on function platform._inventory_filter(text, uuid, uuid, boolean, boolean) from public, anon, authenticated;

-- ─── 3. The candidate lookup: recent-first, paged, scoped ───────────────────
-- Same door, wider contract. The old four-argument identity is dropped (its door row follows below).
drop function if exists public.reference_search_candidates(text, text, integer, uuid[]);

create or replace function public.reference_search_candidates(
  p_token text,
  p_search text default null,
  p_limit integer default 50,
  p_ids uuid[] default null,
  p_order text default 'title',
  p_offset integer default 0,
  p_organization_id uuid default null,
  p_mine boolean default false
)
returns table(id uuid, title text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_f record;
  v_sql text;
  v_order text := lower(coalesce(nullif(trim(p_order), ''), 'title'));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_order not in ('title', 'recent') then
    raise exception 'p_order must be ''title'' or ''recent'', got "%"', p_order using errcode = '22023';
  end if;

  select * into v_f
  from platform._inventory_filter(p_token, v_uid, p_organization_id, p_mine, p_ids is not null);

  v_sql := format(
    'select t.id, t.%I::text as title, %s as updated_at from %I.%I t where %s',
    v_f.title_column,
    case when v_f.recent_column is null then 'null::timestamptz'
         else format('t.%I::timestamptz', v_f.recent_column) end,
    v_f.schema_name,
    v_f.table_name,
    v_f.where_sql);

  if p_ids is not null then
    v_sql := v_sql || format(' and t.id = any(%L::uuid[])', p_ids);
  end if;

  if nullif(trim(p_search), '') is not null then
    v_sql := v_sql || format(
      ' and t.%I::text ilike %L', v_f.title_column, '%' || trim(p_search) || '%');
  end if;

  if v_order = 'recent' and v_f.recent_column is not null then
    v_sql := v_sql || format(' order by t.%I desc nulls last, t.id', v_f.recent_column);
  else
    v_sql := v_sql || format(' order by t.%I, t.id', v_f.title_column);
  end if;

  v_sql := v_sql || format(
    ' limit %s offset %s',
    least(greatest(coalesce(p_limit, 50), 1), 200),
    greatest(coalesce(p_offset, 0), 0));

  return query execute v_sql using platform.shown_to_context(p_token);
end
$function$;

update platform.client_callable_door d
   set identity_args = pg_catalog.pg_get_function_identity_arguments(
         'public.reference_search_candidates(text, text, integer, uuid[], text, integer, uuid, boolean)'::regprocedure),
       identity_argtypes = (select platform.door_argtypes(p.proargtypes) from pg_catalog.pg_proc p
                             where p.oid = 'public.reference_search_candidates(text, text, integer, uuid[], text, integer, uuid, boolean)'::regprocedure),
       argument_rules = '{"version":1,"arguments":{
         "p_ids":{"type":"uuid[]","optional":true,"position":4,
           "check":"each id is admitted only when iam.has_access (files: files.has_access_for) says the caller may view it",
           "foreign":{"bounded":true,"note":"A foreign id is resolved only when the access kernel already lets the caller view that row; it can never widen access."},
           "null_rule":{"means":"search mode: the caller''s own and organization rows"}},
         "p_organization_id":{"type":"uuid","optional":true,"position":7,
           "check":"added as an extra WHERE filter on top of the caller-scoped access clause",
           "foreign":{"bounded":true,"note":"Only narrows rows the caller already reaches; a foreign organization returns no rows."},
           "null_rule":{"means":"no organization filter"}}}}'::jsonb,
       reason = 'Token-generic reference picker and per-kind inventory list for @ai-matrx/associations and the resource inventory hooks: returns only (id, title, updated_at) for rows the caller can already see, recent-first or by title, paged, optionally filtered to mine or one organization (filters, never permission).'
 where d.schema_name = 'public'
   and d.function_name = 'reference_search_candidates';

-- The door row names the new identity first, so this grant sticks (§6d-4 guard).
grant execute on function public.reference_search_candidates(text, text, integer, uuid[], text, integer, uuid, boolean) to authenticated, service_role;

-- ─── 4. Per-kind counts ──────────────────────────────────────────────────────
create or replace function public.entity_kind_counts(
  p_tokens text[] default null,
  p_organization_id uuid default null,
  p_mine boolean default false
)
returns table(token text, n bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_f record;
  v_n bigint;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  for v_token in
    select e.token
    from platform.entity_types e
    where e.is_active
      and case when p_tokens is null then e.source_input_pickable
               else e.token = any(p_tokens) end
    order by e.token
  loop
    begin
      select * into v_f
      from platform._inventory_filter(v_token, v_uid, p_organization_id, p_mine, false);
      execute format('select count(*) from %I.%I t where %s', v_f.schema_name, v_f.table_name, v_f.where_sql)
        into v_n
        using platform.shown_to_context(v_token);
      token := v_token;
      n := v_n;
      return next;
    exception when others then
      -- Uncountable (not pickable, no such column for this scope, table moved): say so with a null,
      -- never a fake 0. The warning names the kind and the reason for whoever reads the logs.
      raise warning 'entity_kind_counts: % not counted: %', v_token, sqlerrm;
      token := v_token;
      n := null;
      return next;
    end;
  end loop;
end
$function$;

comment on function public.entity_kind_counts(text[], uuid, boolean) is
  'Per-kind counts of what the caller has (A5-P). Same filter as reference_search_candidates (platform._inventory_filter), so a count always equals the length of the list it heads. p_tokens null = source_input_pickable kinds. n null = the kind could not be counted.';

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers, argument_rules)
select 'public', 'entity_kind_counts',
       pg_catalog.pg_get_function_identity_arguments('public.entity_kind_counts(text[], uuid, boolean)'::regprocedure),
       (select platform.door_argtypes(p.proargtypes) from pg_catalog.pg_proc p where p.oid = 'public.entity_kind_counts(text[], uuid, boolean)'::regprocedure),
       'A5-P resource_inventory_kind_counts_and_paged_candidates',
       'Per-kind counts of the caller''s own rows (mine) or one organization''s rows, through the same caller-scoped filter as reference_search_candidates; returns only (token, count). Filters, never permission.',
       true, false,
       '{"version":1,"arguments":{
         "p_organization_id":{"type":"uuid","optional":true,"position":2,
           "check":"added as an extra WHERE filter on top of the caller-scoped access clause",
           "foreign":{"bounded":true,"note":"Only narrows rows the caller already reaches; a foreign organization counts 0."},
           "null_rule":{"means":"no organization filter"}}}}'::jsonb
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = 'public' and d.function_name = 'entity_kind_counts');

grant execute on function public.entity_kind_counts(text[], uuid, boolean) to authenticated, service_role;

-- ─── 5. The page-size knob ───────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description, set_by, basis, review_due, overridable_by)
values
  ('resources.inventory', 'page_size', '50'::jsonb, '50'::jsonb, 'integer', 'items', 10, 200,
   'Items per page in "what you have" lists',
   'How many items a per-kind list (the organization Resources pages, the Source input''s Use existing lists) loads at a time before "Show more".',
   'agent',
   'One screen of rows on a laptop is ~20-30; 50 keeps "Show more" rare for most kinds while a 20,000-file library still answers in one fast page. The server caps any page at 200.',
   (current_date + 45), '{organization,user}')
on conflict (feature, key) do nothing;
