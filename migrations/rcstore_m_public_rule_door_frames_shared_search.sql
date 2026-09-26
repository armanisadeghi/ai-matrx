-- chair-step: search_documents gains organization/owner columns, and a changed RETURNS TABLE cannot be replaced in place — DROP FUNCTION then CREATE in the same transaction; no caller exists yet (census: matrx-frontend, aidream)
-- RC-A1 round-2 verify (common-docs/projects/rich-content-unification/evidence/verify-RC-A1-A3.md R2-1..R2-3):
--
--   R2-1  ONE rule decides whether a document is on the public web: content.is_publicly_readable(d)
--         = public AND published AND not trashed AND NOT ARCHIVED (Ghost/WordPress take a post off the
--         site the moment it is no longer live). read_published and read_published_by_slug both ask
--         it; a signed-in reader who can open the document still reads it archived (archived-items
--         law). Census 2026-09-25: the only SECURITY DEFINER functions anon can execute that read
--         content.document are these two doors (the other anon-executable DEFINER entries are
--         trigger functions, not callable); every content table refuses anon; no view reads it.
--         Guard: aidream db/tests/test_rich_content_public_door.py (every anon-reachable content
--         door must call the rule).
--   R2-2  The publish and Univer guards no longer trust a setting a session can set itself. The
--         door still names its document in content.publish_doc / content.univer_save_doc, and the
--         guard now ALSO requires content._write_came_through(doors): the write runs as the store's
--         owner (only a SECURITY DEFINER door can be) AND the frame that issued it is one of the
--         named doors, read from the executing call stack (GET DIAGNOSTICS PG_CONTEXT) — which no
--         caller can write, and no other owner-run function (e.g. the generic public.version_restore)
--         can pass for.
--   R2-3  Access is personal: search_documents gains scope `shared` (not mine, reached through a
--         grant to me or a document membership — from any organization, member or not) and `all`
--         (everything I can read), and every row names organization_id + organization_name +
--         owner_id + owner_name. Names come from content.document_origin(id), a DEFINER helper that
--         answers only for a document the caller can read.
--
-- based-on: content.read_published(uuid) 05dd2b111ce2f8b298c0f4dc1570925e174f161c5cb8fe1cbab0ca73552ded52
-- based-on: content.read_published_by_slug(uuid, text, text) da00a12841c928be973ab8344eebbf3cdb1a75648ed789d30a4895a197bfc2ca
-- based-on: content._document_guard_publish() 890e708fdb7d11d77e39ec30e78f6627b15c98532899e547061f2744ccd2ec36
-- based-on: content._document_guard_univer() a00ae3ac25e08da834ba8b29d2f03942f92de09dbeaead83a448bab037622396
-- based-on: content._search_args_ok(text, uuid, text) d66ac1a0dff85c211d0d305c41b99fd66fa9155304f0e63c8724d31eb3eac6d5
-- based-on: content.search_documents(text, text, uuid, text[], text, integer, integer) 54c613152152512b4463beb21501f7c77eced1dc6afe56bfcd4133b196c5958c

set local lock_timeout = '2s';

-- ============================================================================================
-- R2-1: the one public rule, and both published-read doors ask it
-- ============================================================================================
create function content.is_publicly_readable(d content.document)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select d.id is not null
     and d.visibility = 'public'
     and d.deleted_at is null
     and d.archived_at is null
     and d.published_content_version is not null
$$;
comment on function content.is_publicly_readable(content.document) is
  'THE rule for the public web: public, published, not trashed, not archived. Every anon-reachable content door asks this; none decides it itself.';
grant execute on function content.is_publicly_readable(content.document) to anon, authenticated, service_role;

create or replace function content.read_published(p_document_id uuid)
 returns table(document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text, body text, content_version integer, published_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  d content.document;
  v_slug text;
begin
  select x.* into d from content.document x
   where x.id = p_document_id and x.deleted_at is null and x.published_content_version is not null;
  -- On the public web only by the one rule; otherwise only for a signed-in reader who may open it
  -- (archived included). Anything else answers nothing, the same nothing as a missing document.
  if d.id is null
     or not (content.is_publicly_readable(d)
             or (auth.uid() is not null and iam.has_access('document', d.id, 'viewer'))) then
    return;
  end if;
  select c.slug into v_slug from platform.categories c where c.id = d.document_type_id;
  return query
    select d.id, d.organization_id, v_slug, v.title, v.summary, v.format,
           coalesce(v.body, (select b.body from content.document_version b
                              where b.document_id = v.document_id and b.content_version = v.body_content_version)),
           v.content_version, d.published_at
      from content.document_version v
     where v.document_id = d.id and v.content_version = d.published_content_version;
end;
$function$;

create or replace function content.read_published_by_slug(p_organization_id uuid, p_type_slug text, p_slug text)
 returns table(document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text, body text, content_version integer, published_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  d content.document;
begin
  select x.* into d
    from content.document x
    join platform.categories c on c.id = x.document_type_id
   where x.organization_id = p_organization_id and c.slug = p_type_slug and x.slug = p_slug
     and x.deleted_at is null and x.published_content_version is not null;
  if d.id is null
     or not (content.is_publicly_readable(d)
             or (auth.uid() is not null and iam.has_access('document', d.id, 'viewer'))) then
    return;
  end if;
  return query select * from content.read_published(d.id);
end;
$function$;

-- ============================================================================================
-- R2-2: a door's signal a session cannot forge
-- ============================================================================================
create function content._write_came_through(p_doors text[])
returns boolean
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_ctx   text;
  v_frame text;
  v_n     integer := 0;
begin
  -- 1. Only a SECURITY DEFINER door runs as the store's owner; a client session never does.
  if current_user <> (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'content.document'::regclass) then
    return false;
  end if;
  -- 2. The frame that issued the write is a named door: frame 1 is this function, frame 2 the
  --    guard trigger, frame 3 whoever ran the UPDATE/INSERT. PostgreSQL writes this stack; no
  --    caller can.
  get diagnostics v_ctx = pg_context;
  for v_frame in
    select (regexp_match(t.line, '^PL/pgSQL function (.*\)) line [0-9]+ at '))[1]
      from regexp_split_to_table(v_ctx, E'\n') with ordinality as t(line, n)
     where t.line like 'PL/pgSQL function %'
     order by t.n
  loop
    v_n := v_n + 1;
    if v_n = 3 then
      return v_frame = any (p_doors);
    end if;
  end loop;
  return false;
end;
$$;
comment on function content._write_came_through(text[]) is
  'True only inside one of the named SECURITY DEFINER doors: the write runs as the store owner and the issuing frame (from PG_CONTEXT) is a named door. The unforgeable half of a door signal.';

create or replace function content._document_guard_publish()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  if content._capture_bypassed()
     or (coalesce(current_setting('content.publish_doc', true), '') = new.id::text
         and content._write_came_through(array['content.version_publish(uuid,integer)',
                                               'content.version_unpublish(uuid)'])) then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.published_content_version is not null or new.published_at is not null))
     or (tg_op = 'UPDATE' and (new.published_content_version, new.published_at)
                              is distinct from (old.published_content_version, old.published_at)) then
    raise exception using
      errcode = '42501',
      message = 'The published version of a document changes only through its publish door.',
      hint = 'Call content.version_publish(document_id, content_version) or content.version_unpublish(document_id).';
  end if;
  return new;
end;
$function$;

create or replace function content._document_guard_univer()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  if content._capture_bypassed()
     or (coalesce(current_setting('content.univer_save_doc', true), '') = new.id::text
         and content._write_came_through(array['content.univer_save(uuid,integer,jsonb,text,text)',
                                               'content.version_restore(uuid,integer,integer)'])) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.format = 'univer' and (new.body <> '' or new.payload_hash is not null) then
      raise exception using
        errcode = '42501',
        message = 'A Univer document starts empty; its content arrives through content.univer_save.',
        hint = 'Insert it with format = ''univer'' and no body, then call content.univer_save(document_id, expected_version, snapshot, projection).';
    end if;
    return new;
  end if;
  if (new.format = 'univer' or old.format = 'univer')
     and (new.format is distinct from old.format
          or new.body is distinct from old.body
          or new.payload_hash is distinct from old.payload_hash) then
    raise exception using
      errcode = '42501',
      message = 'A Univer document''s body, payload and format change only through content.univer_save.',
      hint = 'Call content.univer_save(document_id, expected_version, snapshot, projection).';
  end if;
  return new;
end;
$function$;

-- ============================================================================================
-- R2-3: shared with me personally, and where every result comes from
-- ============================================================================================
create function content.document_origin(p_document_id uuid)
returns table(organization_id uuid, organization_name text, owner_id uuid, owner_name text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select d.organization_id, o.name::text, d.created_by, p.display_name::text
    from content.document d
    left join iam.organizations o on o.id = d.organization_id
    left join users.profiles p on p.id = d.created_by
   where d.id = p_document_id
     and d.deleted_at is null
     -- answers only for a document the caller can read (the read policy's own arms)
     and (d.created_by = auth.uid()
          or public.is_platform_admin()
          or d.visibility = 'public'
          or (d.visibility >= 'internal' and d.organization_id in (select iam.my_orgs()))
          or (auth.uid() is not null and iam.has_access('document', d.id, 'viewer')))
$$;
comment on function content.document_origin(uuid) is
  'Which organization and person a document comes from, by name — only for a document the caller can read. Search rows carry it so a shared result always says whose it is.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane)
select 'content', p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'p_document_id: the document''s organization and owner names are returned only when the caller can read it (owner, public, an internal document of one of my organizations, viewer via iam.has_access, or the platform admin read lane). Every other id, NULL included, returns no rows: nonexistent and forbidden read the same.',
       'rcstore_m_public_rule_door_frames_shared_search', true, false, null, null
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'content' and p.proname = 'document_origin'
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'content' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

update platform.client_callable_door
   set reason = case function_name
         when 'read_published' then
           'p_document_id: returned to anyone when content.is_publicly_readable (public, published, not trashed, not archived); to a signed-in caller holding viewer (iam.has_access) when published and not trashed. Every other id, NULL included, returns no rows: nonexistent and forbidden read the same.'
         else
           'p_organization_id only narrows the slug lookup (organization + type + slug); access is decided on the document found by the same rule as content.read_published (content.is_publicly_readable, or viewer). Nothing found or not readable returns no rows.'
       end
 where schema_name = 'content' and function_name in ('read_published', 'read_published_by_slug');

grant execute on function content.document_origin(uuid) to authenticated, service_role;

create or replace function content._search_args_ok(p_scope text, p_organization_id uuid, p_archive text)
 returns boolean
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
begin
  if p_scope is null or p_scope not in ('mine', 'organization', 'shared', 'all') then
    raise exception using errcode = '22023', message = format('Unknown search scope %s.', coalesce(p_scope, 'NULL')),
      hint = 'Use mine (the default), organization, shared (shared with me personally, any organization) or all (everything I can read).';
  end if;
  if p_scope = 'organization' and p_organization_id is null then
    raise exception using errcode = '22023', message = 'An organization-scoped search names its organization.',
      hint = 'Pass p_organization_id, or search mine, shared or all.';
  end if;
  if p_archive not in ('hide', 'all', 'only') then
    raise exception using errcode = '22023', message = format('Unknown archive filter %s.', coalesce(p_archive, 'NULL')),
      hint = 'Use hide (the default), all or only.';
  end if;
  return true;
end;
$function$;

drop function content.search_documents(text, text, uuid, text[], text, integer, integer);
create function content.search_documents(p_query text, p_scope text default 'mine', p_organization_id uuid default null,
                                         p_type_slugs text[] default null, p_archive text default 'hide',
                                         p_limit integer default 25, p_offset integer default 0)
 returns table(id uuid, organization_id uuid, organization_name text, owner_id uuid, owner_name text, type_slug text,
               title text, summary text, preview text, archived_at timestamp with time zone,
               updated_at timestamp with time zone, rank real, headline text)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with q as (
    select websearch_to_tsquery('english'::regconfig, coalesce(p_query, '')) as tsq,
           content._search_args_ok(p_scope, p_organization_id, p_archive) as ok),
  shared_with_me as (
    select p.resource_id as id
      from iam.permissions p
     where p_scope = 'shared'
       and p.resource_type = 'document' and p.granted_to_user_id = auth.uid()
       and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
    union
    select m.container_id
      from iam.memberships m
     where p_scope = 'shared'
       and m.container_type = 'document' and m.user_id = auth.uid() and m.deleted_at is null),
  hits as (
    select d.*, c.slug as type_slug,
           ts_rank_cd(content.document_search_vector(d.title, d.summary, d.body), q.tsq)
             + public.similarity(d.title, coalesce(p_query, '')) as rank,
           q.tsq
      from q, content.document d
      join platform.categories c on c.id = d.document_type_id
     where q.ok
       and d.deleted_at is null
       and (content.document_search_vector(d.title, d.summary, d.body) @@ q.tsq
            or d.title operator(public.%) coalesce(p_query, ''))
       and (case p_scope when 'mine' then d.created_by = auth.uid()
                         when 'organization' then d.organization_id = p_organization_id
                         when 'shared' then d.created_by is distinct from auth.uid()
                                            and d.id in (select s.id from shared_with_me s)
                         else true end)
       and (case p_archive when 'hide' then d.archived_at is null
                           when 'only' then d.archived_at is not null
                           else true end)
       and ((p_type_slugs is not null and c.slug = any (p_type_slugs))
            or (p_type_slugs is null
                and (platform.knob_resolve('content.document', 'listed.' || c.slug, d.organization_id, auth.uid()) #>> '{}')::boolean))),
  page as (
    select h.* from hits h
     order by h.rank desc, h.updated_at desc, h.id
     limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0)))
  select h.id, h.organization_id, o.organization_name, h.created_by, o.owner_name, h.type_slug, h.title, h.summary,
         h.preview, h.archived_at, h.updated_at, h.rank,
         ts_headline('english'::regconfig, left(h.body, 20000), h.tsq,
                     'MaxFragments=1, MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>')
    from page h
    left join lateral content.document_origin(h.id) o on true
   order by h.rank desc, h.updated_at desc, h.id
$function$;
comment on function content.search_documents(text, text, uuid, text[], text, integer, integer) is
  'Ranked document search through the caller''s RLS. Scopes: mine, organization (names it), shared (shared with me personally, any organization), all. Every row names its organization and owner.';
revoke execute on function content.search_documents(text, text, uuid, text[], text, integer, integer) from public, anon;
grant execute on function content.search_documents(text, text, uuid, text[], text, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
