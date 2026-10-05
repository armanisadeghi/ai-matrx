-- chair-step: re-bodies the tag doors (tag_scope_id, file_under_tag, context_tags_set, the tags-column trigger, tags_backfill) and the projection read _search_item_filed_tags onto platform.tag; drops the retired platform.tag_scope_type_id and its client_callable_door row (zero callers in code and DB); adds platform.tags_in and platform._tag_slug and two CREATE TRIGGERs on platform.associations (tag edges refresh filed_tags).
-- lane: FINISH-THE-SWITCH
-- lock: platform
-- based-on: platform.tag_scope_id(uuid, text, uuid) 695449197971fb9428f2db51886c4441b27b622ebf4ce96f4fda1e9b3a447337
-- based-on: platform.file_under_tag(text, uuid, text) 48624fcdc5e9b03e35f8ca0742226ec3f12a15f512a6cee4d7c58b6099f603f2
-- based-on: custom.context_tags_set(text, uuid, uuid[]) 39a4f1a9906d37ca6aa6dfb3f02a2ae02723a052fa75d4d9853e55a7b96bb52a
-- based-on: platform._tags_column_to_filing() e6cbc7c785425fc4e5946633b0439f23c38ef019552b106b13146453838d3613
-- based-on: platform.tags_backfill(text, uuid, integer) 75db2c0a6483597d55c7c0bf2dc9e889cabfeac16cd0e1e6ffe1cecee30842af
-- based-on: platform._search_item_filed_tags(text, uuid) f485b66d13d9759f8ca5750a2288d5712d445ce3140d1d2ed57395d752d96364
--
-- FTS-4 c/4 — THE TAG DOORS WRITE platform.tag. Signatures are kept, so every caller keeps working:
--   platform.tag_scope_id(org, name, actor)  finds or creates the organization's tag by slug and answers its
--                                            platform.tag id (the name stays; it is called by the two doors below,
--                                            the trigger and the backfill).
--   platform.file_under_tag(token, id, name) files the item under the tag (edge `<kind> -> tag`).
--   custom.context_tags_set(type, id, ids[]) replaces the item's tags with exactly these tag ids; refuses, in
--                                            one sentence, any id that is not a tag of an organization the
--                                            caller belongs to (a null, an invented id and a foreign one read alike).
--   platform.tags_backfill / platform._tags_column_to_filing  the `tags text[]` column input, filed as tags.
--   platform._search_item_filed_tags (+ its follow triggers)  the projection's filed_tags read the tag edges.
-- platform.tag_scope_type_id is retired (it made the per-organization "Tag" scope type; nothing calls it any more).

set local statement_timeout = '300s';

-- A tag's slug: what context.slugify gave every tag scope the move carried over (so a name finds the same tag
-- before and after), kept here so tags do not depend on the scopes' schema.
create or replace function platform._tag_slug(p_name text)
 returns text
 language sql
 immutable
 set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(platform.search_normalize(p_name), '')), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')), ''),
    'tag-' || left(md5(lower(coalesce(p_name, ''))), 12))
$function$;

create or replace function platform.tag_scope_id(p_org uuid, p_name text, p_actor uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_name text := btrim(left(regexp_replace(btrim(coalesce(p_name, '')), '^#+|\s+', ' ', 'g'), 80));
  v_slug text;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'A tag needs a name.' using errcode = '22023';
  end if;
  v_slug := platform._tag_slug(v_name);
  select t.id into v_id from platform.tag t
   where t.organization_id = p_org and t.slug = v_slug and t.deleted_at is null;
  if v_id is null then
    insert into platform.tag (organization_id, name, slug, created_by)
    values (p_org, v_name, v_slug, p_actor)
    on conflict (organization_id, slug) where deleted_at is null do nothing
    returning id into v_id;
    if v_id is null then  -- a concurrent writer filed the same name first
      select t.id into v_id from platform.tag t
       where t.organization_id = p_org and t.slug = v_slug and t.deleted_at is null;
    end if;
  end if;
  return v_id;
end
$function$;

create or replace function platform.file_under_tag(p_entity_token text, p_entity_id uuid, p_tag_name text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_rel text;
  v_org uuid;
  v_tag uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to tag things.' using errcode = '42501';
  end if;
  if p_entity_token is null or p_entity_id is null or nullif(btrim(coalesce(p_tag_name, '')), '') is null then
    raise exception 'Say what to tag and the tag''s name.' using errcode = '22023';
  end if;
  if not iam.has_access(p_entity_token, p_entity_id, 'editor'::public.permission_level) then
    raise exception 'You cannot file this record.' using errcode = '42501';
  end if;
  select format('%I.%I', et.schema_name, et.table_name) into v_rel
    from platform.entity_types et where et.token = p_entity_token and et.is_active;
  execute format('select organization_id from %s where id = $1', v_rel) into v_org using p_entity_id;
  v_tag := platform.tag_scope_id(v_org, p_tag_name, v_uid);
  -- assoc_add applies the association rules (both ends' access, the registry's label; 23514 for a
  -- type the registry does not pair with tag).
  perform public.assoc_add(p_entity_token, p_entity_id, 'tag', v_tag, v_org);
  return v_tag;
end
$function$;

create or replace function custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_ids uuid[] := coalesce(p_scope_ids, '{}'::uuid[]);
  v_uid uuid := auth.uid();
  v_bad jsonb;
  v_org uuid;
  v_edge record;
  v_row jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to tag things.' using errcode = '42501';
  end if;
  if p_entity_id is null
     or coalesce(iam.has_access_for(v_uid, p_entity_type, p_entity_id, 'editor'::public.permission_level), false) is not true then
    raise exception 'You cannot tag this %.', coalesce(p_entity_type, 'record') using errcode = '42501';
  end if;
  -- NOTHING FAILS SILENTLY: every id must be a live tag of an organization the caller belongs to, or the whole
  -- set is refused before anything is written. One sentence for a null id, an invented id, an id that is not
  -- a tag and another organization's tag, so the refusal tells no one which ids exist.
  select jsonb_agg(x.id order by x.ord) into v_bad
    from unnest(v_ids) with ordinality x(id, ord)
   where x.id is null
      or not exists (select 1
                       from platform.tag t
                       join iam.organization_member om
                         on om.organization_id = t.organization_id and om.user_id = v_uid
                      where t.id = x.id and t.deleted_at is null);
  if v_bad is not null then
    raise exception 'One of those is not a tag you can use. Nothing was saved.'
      using errcode = '42501',
            detail = jsonb_build_object('tag_ids', v_bad)::text,
            hint = 'Each id must be a tag of an organization you belong to.';
  end if;
  -- the set is re-stated: withdraw the tags that are not in it, file the ones that are.
  for v_edge in
    select a.target_id from platform.associations a
     where a.source_type = p_entity_type and a.source_id = p_entity_id and a.target_type = 'tag'
       and a.deleted_at is null and not (a.target_id = any(v_ids))
  loop
    perform platform.assoc_unset(p_entity_type, p_entity_id, 'tag', v_edge.target_id, null, p_entity_type, p_entity_id);
  end loop;
  for v_org in select distinct t.organization_id from platform.tag t where t.id = any(v_ids) loop
    perform custom.assert_client_may_reach(v_org, 'custom.context_tags_set');
  end loop;
  perform public.assoc_add(p_entity_type, p_entity_id, 'tag', t.id, t.organization_id)
     from platform.tag t where t.id = any(v_ids);
  select coalesce(jsonb_agg(jsonb_build_object('tag_id', t.id, 'tag_name', t.name) order by t.name), '[]'::jsonb)
    into v_row
    from platform.associations a join platform.tag t on t.id = a.target_id
   where a.source_type = p_entity_type and a.source_id = p_entity_id and a.target_type = 'tag' and a.deleted_at is null;
  return jsonb_build_object('ok', true, 'row', v_row);
end;
$function$;

create or replace function platform._tags_column_to_filing()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_token text := tg_argv[0];
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_old text[] := case when tg_op = 'UPDATE' then coalesce(old.tags, '{}') else '{}' end;
  v_new text[] := coalesce(new.tags, '{}');
  v_label text;
  v_tag uuid;
  t text;
begin
  if new.organization_id is null or v_actor is null then return null; end if;
  if v_old = v_new then return null; end if;
  select at.label into v_label from platform.association_types at
   where at.source_type = v_token and at.target_type = 'tag';
  foreach t in array v_new loop
    continue when nullif(btrim(coalesce(t, '')), '') is null or t = any(v_old);
    v_tag := platform.tag_scope_id(new.organization_id, t, v_actor);
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, created_by)
    values (v_token, new.id, 'tag', v_tag, new.organization_id, v_label, v_actor)
    on conflict do nothing;
  end loop;
  foreach t in array v_old loop
    continue when t = any(v_new) or nullif(btrim(coalesce(t, '')), '') is null;
    update platform.associations a set deleted_at = now()
      from platform.tag g
     where g.organization_id = new.organization_id and g.deleted_at is null
       and g.slug = platform._tag_slug(btrim(regexp_replace(t, '^#+|\s+', ' ', 'g')))
       and a.source_type = v_token and a.source_id = new.id and a.target_type = 'tag'
       and a.target_id = g.id and a.deleted_at is null;
  end loop;
  return null;
end
$function$;

create or replace function platform.tags_backfill(p_token text, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000, OUT rows_seen integer, OUT edges_written integer, OUT last_id uuid)
 returns record
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_rel text;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  r record;
  t text;
  v_tag uuid;
  v_label text;
  v_n integer;
begin
  perform set_config('app.actor_tier', 'system', true);
  perform set_config('app.actor_system', 'platform.tags_backfill', true);
  perform platform.reachability_defer_begin();   -- 1381: refreshed once per tag by reachability_flush
  rows_seen := 0; edges_written := 0;
  if p_token = 'research_tag' then
    -- A topic-local label becomes the org's tag; everything filed under it is filed under the tag.
    for r in select g.id, g.organization_id, g.created_by, g.name from research.rs_tag g
              where g.deleted_at is null and (p_after is null or g.id > p_after) order by g.id limit v_limit loop
      rows_seen := rows_seen + 1; last_id := r.id;
      v_tag := platform.tag_scope_id(r.organization_id, r.name, r.created_by);
      insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, created_by)
      select a.source_type, a.source_id, 'tag', v_tag, a.organization_id,
             (select at.label from platform.association_types at where at.source_type = a.source_type and at.target_type = 'tag'),
             a.created_by
        from platform.associations a
       where a.target_type = 'research_tag' and a.target_id = r.id and a.deleted_at is null
         and exists (select 1 from platform.association_types at
                      where at.source_type = a.source_type and at.target_type = 'tag' and at.is_active)
      on conflict do nothing;
      get diagnostics v_n = row_count; edges_written := edges_written + v_n;
    end loop;
    return;
  end if;
  if p_token not in ('agent', 'app', 'transcript', 'workflow', 'sch_task', 'message_template',
                     'shared_canvas_item', 'note', 'credential_item') then
    raise exception 'tags_backfill: % has no tags column this backfill converts', p_token using errcode = '22023';
  end if;
  select format('%I.%I', et.schema_name, et.table_name) into v_rel from platform.entity_types et where et.token = p_token;
  select at.label into v_label from platform.association_types at where at.source_type = p_token and at.target_type = 'tag';
  for r in execute format(
      'select id, organization_id, created_by, tags from %s where ($1::uuid is null or id > $1) '
      'and deleted_at is null order by id limit $2', v_rel) using p_after, v_limit loop
    rows_seen := rows_seen + 1; last_id := r.id;
    continue when r.tags is null or cardinality(r.tags) = 0 or r.organization_id is null;
    foreach t in array r.tags loop
      continue when nullif(btrim(coalesce(t, '')), '') is null;
      v_tag := platform.tag_scope_id(r.organization_id, t, r.created_by);
      insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, created_by)
      values (p_token, r.id, 'tag', v_tag, r.organization_id, v_label, r.created_by)
      on conflict do nothing;
      get diagnostics v_n = row_count; edges_written := edges_written + v_n;
    end loop;
  end loop;
end
$function$;

create or replace function platform._search_item_filed_tags(p_token text, p_id uuid)
 returns text[]
 language sql
 stable
 set search_path to 'pg_catalog', 'public'
as $function$
  -- FTS-4 (2026-10-04): the Tags an item is filed under, from the platform tag table — filing is the
  -- edge `<kind> -> tag`; an archived tag no longer names the item.
  select coalesce(array_agg(distinct t.name order by t.name), '{}'::text[])
    from platform.associations a
    join platform.tag t on t.id = a.target_id and t.deleted_at is null
   where a.source_type = p_token and a.source_id = p_id and a.target_type = 'tag'
     and a.deleted_at is null
$function$;

-- Bring the projection current: every item that carries a tag edge, and every item that carried the old record-store tags.
update platform.search_item si
   set filed_tags = platform._search_item_filed_tags(si.entity_token, si.entity_id), projected_at = now()
 where cardinality(si.filed_tags) > 0
    or exists (select 1 from platform.associations a
                where a.source_type = si.entity_token and a.source_id = si.entity_id
                  and a.target_type = 'tag' and a.deleted_at is null);

-- The tags the caller can read in these organizations, as the caller (row security decides). The server's #tag
-- lookup reads through it (aidream/services/knowledge/search.py find_tags).
create or replace function platform.tags_in(p_org_ids uuid[])
 returns table (id uuid, name text, slug text, organization_id uuid)
 language sql
 stable
 set search_path to 'pg_catalog', 'public'
as $function$
  select t.id, t.name, t.slug, t.organization_id
    from platform.tag t
   where t.organization_id = any(p_org_ids) and t.deleted_at is null
$function$;
grant execute on function platform.tags_in(uuid[]) to authenticated, service_role;

-- RETIRED: nothing calls it now (platform.tag_scope_id above was its only caller).
delete from platform.client_callable_door where schema_name = 'platform' and function_name = 'tag_scope_type_id';
drop function if exists platform.tag_scope_type_id(uuid, uuid);

-- The projection follows the tag edges too (it followed the scope edges until now; those two triggers stay,
-- untouched: dropping a trigger on platform.associations freezes sign-in, and they are harmless — their function
-- reads the tag edges). CREATE TRIGGER blocks writes to the edges until commit, so these are the last statements.
create trigger _search_item_follow_filing_tag
  after insert or update of deleted_at, target_id on platform.associations
  for each row when (new.target_type = 'tag') execute function platform._search_item_follow_filing();
create trigger _search_item_follow_filing_tag_delete
  after delete on platform.associations
  for each row when (old.target_type = 'tag') execute function platform._search_item_follow_filing();
