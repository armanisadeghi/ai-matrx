-- chair-step: every REVOKE here closes a private helper THIS file creates (no door row) to every client role; no existing grant anywhere loses reach. Already applied once through the MCP on 2026-09-27; this run is the idempotent, ledgered apply.
-- based-on: platform._search_engine_indexed_table(text) 3abfdc0019fa160ee24747db86dd8062fc5eab65e63a0e30d7c5ee2ee6d1e9de
-- based-on: platform._search_engine_indexed_default(text, uuid) 319f8029649784feff1a979a807ea1f28a0ed5aec415317c7473d1e37c6e37d8
-- based-on: platform._published_to_web_sql(boolean, boolean) 494b12073bd84c58387a9097749508f5a96751206e485bb58a10fcf80b59483f
-- based-on: platform.search_engine_indexed(text, text) a6664cedd00d997d560a640df07e72d6ac107ce6a026d5a6cb2a5f7ab82eb80a
-- based-on: platform.search_engine_indexed_records(text, integer) 50b81ee9f51037d0ca59c1d6ba2bed173d9a9e573a81072279c0dacd2428effd
-- based-on: platform.search_engine_indexed_state(text, uuid) 45c3298503f4bddf50d3e49d2cc419a0708f2e437e550a0dbf4f704b078a247f
-- based-on: platform.set_search_engine_indexed(text, uuid, boolean) be6bd05d7d20a8bac9aea569df26a59b65145be586312224321ac88737f13a65
-- lane: access-ladder T-12 (the indexed switch), part b: the type knob, the ONE resolver,
-- the ONE setter, the state reader, and their door declarations.
--
-- Law: common-docs/policies/access-ladder.md ("Public items: indexed or not"): whether search
-- engines index a record that is published to the web is a switch, never a level. Security is
-- identical either way. The switch is a knob: a default per type (system) -> organization
-- override -> the creator per item (`search_engine_indexed`, part a; NULL follows the knob).
-- Private and Confidential types are never enrolled (the table lookup refuses them), and an
-- Anyone-link or secure-link page is never indexed (enforced in matrx-frontend, not here).
--
-- "Published to the web" today = `visibility = 'public'` and not trashed, plus the type's own
-- lifecycle word where it has one (`is_published`, or `status = 'published'`). T-13 renames
-- the live column to `published_to_web`; this resolver is the one place that changes then.

-- ── 1. The knob: access.indexed_by_default / <entity token> ─────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis,
   review_due, overridable_by, override_direction)
values
  ('access.indexed_by_default','pc_episode', 'true'::jsonb,'true'::jsonb,'boolean',
   'Indexed by default: podcast episodes',
   'Whether a podcast episode that is published to the web may be listed by search engines, unless its creator chooses otherwise. Security is the same either way.',
   'agent','Access ladder law (Arman, 2026-09-26): podcast episodes are indexed by default — a published episode is made to be found.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','pc_show', 'true'::jsonb,'true'::jsonb,'boolean',
   'Indexed by default: podcast shows',
   'Whether a podcast show that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12: a show page is the episode list''s front door; same default as its episodes.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','pc_article', 'true'::jsonb,'true'::jsonb,'boolean',
   'Indexed by default: blog posts',
   'Whether a blog post that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12 brief: blog posts are indexed by default.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','agent', 'true'::jsonb,'true'::jsonb,'boolean',
   'Indexed by default: marketplace agents',
   'Whether an agent that is published to the web (a marketplace agent) may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12 brief: marketplace agents are indexed by default. No public agent page exists yet; the default is ready for it.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','learn_doc', 'true'::jsonb,'true'::jsonb,'boolean',
   'Indexed by default: learning articles',
   'Whether a learning article that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12: published learn docs were already in the sitemap and indexed; the default keeps that.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','app', 'false'::jsonb,'false'::jsonb,'boolean',
   'Indexed by default: apps',
   'Whether an app that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder law (Arman, 2026-09-26): user-generated apps are not indexed by default.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','shared_canvas_item', 'false'::jsonb,'false'::jsonb,'boolean',
   'Indexed by default: shared canvases',
   'Whether a shared canvas that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12 brief: shared canvases are user-generated and not indexed by default.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','fc_set', 'false'::jsonb,'false'::jsonb,'boolean',
   'Indexed by default: flashcard sets',
   'Whether a flashcard set that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12: a person''s study material is user-generated; not indexed unless the creator or organization says so.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','note', 'false'::jsonb,'false'::jsonb,'boolean',
   'Indexed by default: notes',
   'Whether a note that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12: notes are user-generated and not index-worthy by default.',
   '2026-11-27','{organization}','any'),
  ('access.indexed_by_default','message_template', 'false'::jsonb,'false'::jsonb,'boolean',
   'Indexed by default: message templates',
   'Whether a message template that is published to the web may be listed by search engines, unless its creator chooses otherwise.',
   'agent','Access ladder T-12: templates are user-generated and not index-worthy by default.',
   '2026-11-27','{organization}','any')
on conflict (feature, key) do update
  set label = excluded.label, description = excluded.description, basis = excluded.basis;

-- ── 2. Enrollment: which table a token names, and what "published" means on it ─────────────
create or replace function platform._search_engine_indexed_table(p_resource_type text)
returns table(s text, tb text, has_slug boolean, has_is_published boolean, has_status boolean)
language plpgsql stable set search_path = '' as $fn$
declare v_class text;
begin
  select et.schema_name, et.table_name, et.data_class into s, tb, v_class
    from platform.entity_types et
   where et.token = p_resource_type and et.is_active and not et.is_component;
  if s is null
     or not exists (select 1 from platform.feature_knob k
                     where k.feature = 'access.indexed_by_default' and k.key = p_resource_type
                       and k.archived_at is null)
     or not exists (select 1 from information_schema.columns c
                     where c.table_schema = s and c.table_name = tb
                       and c.column_name = 'search_engine_indexed') then
    raise exception 'The type "%" has no "Indexed by search engines" switch.', p_resource_type
      using errcode = '22023',
            hint = 'A type is enrolled by a knob row access.indexed_by_default/<token> plus a '
                || 'search_engine_indexed column (access ladder T-12).';
  end if;
  if v_class in ('private', 'confidential') then
    raise exception 'The type "%" is %, so it is never published to the web or indexed.',
      p_resource_type, v_class using errcode = '22023';
  end if;
  select exists (select 1 from information_schema.columns c where c.table_schema = s and c.table_name = tb and c.column_name = 'slug'),
         exists (select 1 from information_schema.columns c where c.table_schema = s and c.table_name = tb and c.column_name = 'is_published'),
         exists (select 1 from information_schema.columns c where c.table_schema = s and c.table_name = tb and c.column_name = 'status')
    into has_slug, has_is_published, has_status;
  return next;
end $fn$;
revoke all on function platform._search_engine_indexed_table(text) from public, anon, authenticated;

create or replace function platform._search_engine_indexed_default(p_resource_type text, p_organization_id uuid)
returns boolean language sql stable set search_path = '' as $fn$
  select coalesce((platform.knob_resolve('access.indexed_by_default', p_resource_type, p_organization_id) #>> '{}')::boolean, false);
$fn$;
revoke all on function platform._search_engine_indexed_default(text, uuid) from public, anon, authenticated;

-- The "published to the web" predicate, as SQL text over alias r. Kept in one place.
create or replace function platform._published_to_web_sql(p_has_is_published boolean, p_has_status boolean)
returns text language sql immutable set search_path = '' as $fn$
  select $q$r.visibility = 'public' and r.deleted_at is null$q$
      || case when p_has_is_published then ' and r.is_published' else '' end
      || case when p_has_status then $q$ and r.status = 'published'$q$ else '' end;
$fn$;
revoke all on function platform._published_to_web_sql(boolean, boolean) from public, anon, authenticated;

-- ── 3. THE resolver: may search engines index this record? ─────────────────────────────────
-- NULL  = no record of this type is published to the web at this key (the page 404s anyway).
-- true / false = the answer. p_key is the record's id or its slug.
create or replace function platform.search_engine_indexed(p_resource_type text, p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare
  t record;
  v_is_uuid boolean := p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_val boolean; v_org uuid;
begin
  if p_key is null or btrim(p_key) = '' then return null; end if;
  select * into t from platform._search_engine_indexed_table(p_resource_type);
  if not v_is_uuid and not t.has_slug then return null; end if;
  -- Access decision for a signed-out caller: only a row whose visibility = 'public' (published
  -- to the web) answers at all; anything else answers exactly like a missing row.
  execute format(
    $q$select r.search_engine_indexed, r.organization_id from %I.%I r where %s and %s limit 1$q$,
    t.s, t.tb, platform._published_to_web_sql(t.has_is_published, t.has_status),
    case when v_is_uuid then 'r.id = $1::uuid' else 'r.slug = $1' end)
    into v_val, v_org using p_key;
  if v_org is null then return null; end if;
  return coalesce(v_val, platform._search_engine_indexed_default(p_resource_type, v_org));
end $fn$;

-- ── 4. The sitemap read: every published, indexed record of a type ─────────────────────────
create or replace function platform.search_engine_indexed_records(p_resource_type text, p_limit integer default 5000)
returns table(id uuid, slug text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
declare t record;
begin
  select * into t from platform._search_engine_indexed_table(p_resource_type);
  -- Only rows whose visibility = 'public' (published to the web) are ever returned.
  return query execute format(
    $q$with rows as (
         select r.id, %s as slug, r.updated_at, r.search_engine_indexed as v, r.organization_id as org
           from %I.%I r where %s),
       defs as (
         select o.org, platform._search_engine_indexed_default($1, o.org) as d
           from (select distinct org from rows) o)
       select rows.id, rows.slug, rows.updated_at
         from rows join defs on defs.org = rows.org
        where coalesce(rows.v, defs.d)
        order by rows.updated_at desc nulls last
        limit $2$q$,
    case when t.has_slug then 'r.slug' else 'null::text' end,
    t.s, t.tb, platform._published_to_web_sql(t.has_is_published, t.has_status))
    using p_resource_type, least(greatest(coalesce(p_limit, 5000), 1), 50000);
end $fn$;

-- ── 5. The state the share dialog shows ────────────────────────────────────────────────────
create or replace function platform.search_engine_indexed_state(p_resource_type text, p_resource_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare t record; v_val boolean; v_org uuid; v_pub boolean; v_def boolean;
begin
  if not iam.has_access(p_resource_type, p_resource_id, 'viewer'::public.permission_level) then
    raise exception 'You cannot open this record.' using errcode = '42501';
  end if;
  begin
    select * into t from platform._search_engine_indexed_table(p_resource_type);
  exception when sqlstate '22023' then
    return jsonb_build_object('enrolled', false);
  end;
  execute format(
    $q$select r.search_engine_indexed, r.organization_id, (%s) from %I.%I r where r.id = $1$q$,
    platform._published_to_web_sql(t.has_is_published, t.has_status), t.s, t.tb)
    into v_val, v_org, v_pub using p_resource_id;
  v_def := platform._search_engine_indexed_default(p_resource_type, v_org);
  return jsonb_build_object(
    'enrolled', true,
    'published_to_web', coalesce(v_pub, false),
    'value', v_val,
    'type_default', v_def,
    'effective', coalesce(v_pub, false) and coalesce(v_val, v_def),
    'can_change', iam.has_access(p_resource_type, p_resource_id, 'editor'::public.permission_level));
end $fn$;

-- ── 6. THE setter: the creator's per-item choice (NULL = follow the type default) ───────────
create or replace function platform.set_search_engine_indexed(p_resource_type text, p_resource_id uuid, p_indexed boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $fn$
declare t record; v_pub boolean;
begin
  -- Publishing is an edit-level act, and so is telling search engines about it.
  if not iam.has_access(p_resource_type, p_resource_id, 'editor'::public.permission_level) then
    raise exception 'Only someone who can edit this record can change whether search engines index it.'
      using errcode = '42501';
  end if;
  select * into t from platform._search_engine_indexed_table(p_resource_type);
  execute format($q$select (%s) from %I.%I r where r.id = $1$q$,
    platform._published_to_web_sql(t.has_is_published, t.has_status), t.s, t.tb)
    into v_pub using p_resource_id;
  if p_indexed is true and not coalesce(v_pub, false) then
    raise exception 'Publish this to the web first; search engines can only index a record that is published to the web.'
      using errcode = '22023';
  end if;
  execute format('update %I.%I r set search_engine_indexed = $2 where r.id = $1', t.s, t.tb)
    using p_resource_id, p_indexed;
  return platform.search_engine_indexed_state(p_resource_type, p_resource_id);
end $fn$;

-- ── 7. Doors ───────────────────────────────────────────────────────────────────────────────
-- Idempotent: a re-run (the ledgered apply after the first MCP apply) adds no second row.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers,
   anonymous_purpose, gate_predicate, argument_rules)
select v.* from (values
  ('platform','search_engine_indexed','p_resource_type text, p_key text',
   'access_ladder_t12b_indexed_knob_and_doors.sql',
   'Answers whether search engines may index one record that is published to the web; every public record page and the proxy read it to emit robots noindex.',
   true,
   'A search-engine crawler and every signed-out reader of a public record page have no account; the answer concerns only records already published to the web and discloses one boolean.',
   'visibility = ''public'' (published to the web) on the named row; anything else answers null like a missing row',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_key', jsonb_build_object('type','text','position',2,'optional',false,'foreign',jsonb_build_object('not_an_id',true))))),
  ('platform','search_engine_indexed_records','p_resource_type text, p_limit integer',
   'access_ladder_t12b_indexed_knob_and_doors.sql',
   'Lists the records of one type that are published to the web and indexed, for the sitemap.',
   true,
   'The sitemap is fetched by search-engine crawlers with no account; it lists only records already published to the web whose indexed switch resolves on.',
   'visibility = ''public'' (published to the web) and the resolved indexed switch',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_limit', jsonb_build_object('type','integer','position',2,'optional',true,'foreign',jsonb_build_object('not_an_id',true))))),
  ('platform','search_engine_indexed_state','p_resource_type text, p_resource_id uuid',
   'access_ladder_t12b_indexed_knob_and_doors.sql',
   'SIGNED-IN door. The share dialog reads a record''s Published to the web / Indexed by search engines state.',
   false, null, 'iam.has_access(p_resource_type, p_resource_id, viewer)',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_resource_id', jsonb_build_object('type','uuid','position',2,'optional',false,'foreign',jsonb_build_object('bounded',true,'note','iam.has_access decides on this id before any read'))))),
  ('platform','set_search_engine_indexed','p_resource_type text, p_resource_id uuid, p_indexed boolean',
   'access_ladder_t12b_indexed_knob_and_doors.sql',
   'SIGNED-IN door. The creator turns Indexed by search engines on or off for one record (null = follow the type default).',
   false, null, 'iam.has_access(p_resource_type, p_resource_id, editor)',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_resource_id', jsonb_build_object('type','uuid','position',2,'optional',false,'foreign',jsonb_build_object('bounded',true,'note','iam.has_access editor decides on this id before any read or write')),
     'p_indexed', jsonb_build_object('type','boolean','position',3,'optional',true,'foreign',jsonb_build_object('not_an_id',true)))))
) as v(schema_name, function_name, identity_args, declared_by, reason, anonymous_callers,
       anonymous_purpose, gate_predicate, argument_rules)
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = v.schema_name and d.function_name = v.function_name
                     and d.identity_args = v.identity_args);

-- No REVOKE on the four doors: their door rows decide who keeps EXECUTE (the DB-wide guards
-- close anon on the two signed-in doors and reopen declared lanes).
grant execute on function platform.search_engine_indexed(text, text) to anon, authenticated, service_role;
grant execute on function platform.search_engine_indexed_records(text, integer) to anon, authenticated, service_role;
grant execute on function platform.search_engine_indexed_state(text, uuid) to authenticated, service_role;
grant execute on function platform.set_search_engine_indexed(text, uuid, boolean) to authenticated, service_role;
