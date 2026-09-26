-- chair-step: inverse of rcstore_m_public_rule_door_frames_shared_search.sql — drops search_documents (its RETURNS TABLE changed) and the three new helpers, restores the prior bodies byte-for-byte from pg_get_functiondef
-- ground-standing-ok: b — inverses run newest first: this file (rcstore_m) runs long before
--   rcstore_a_content_schema_down.sql, which drops content._capture_bypassed and the publish doors
--   together with the tables whose triggers call them; the restored guards are only ever run by those triggers.
-- based-on: content.read_published(uuid) cb9890ebe0b17a41c760d7458e9d5963d5e920cd2636446880b963ebc5149f56
-- based-on: content.read_published_by_slug(uuid, text, text) 003514cd623a713698e910f4a7ce04491e4d3305ae8a2c0473d2360a0cf40801
-- based-on: content._document_guard_publish() 548147c0d23413586eb83e77ce0a0169abed8cc40a8e45f959732fedf4153179
-- based-on: content._document_guard_univer() 96e04766349b588ef4588e764fda8e53fd625f5c754889227bf63d615b674c17
-- based-on: content._search_args_ok(text, uuid, text) ff0bf03423f9c6d7b11930b29534b8db58119825a085f02ba5a836a2d779adc2
-- based-on: content.search_documents(text, text, uuid, text[], text, integer, integer) 85de5bd19505fb6525e57c49ad544ed5a82c1d161df4a327bc59745bba21a82c

set local lock_timeout = '2s';

drop function content.search_documents(text, text, uuid, text[], text, integer, integer);
CREATE FUNCTION content.search_documents(p_query text, p_scope text DEFAULT 'mine'::text, p_organization_id uuid DEFAULT NULL::uuid, p_type_slugs text[] DEFAULT NULL::text[], p_archive text DEFAULT 'hide'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, organization_id uuid, type_slug text, title text, summary text, preview text, archived_at timestamp with time zone, updated_at timestamp with time zone, rank real, headline text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with q as (
    select websearch_to_tsquery('english'::regconfig, coalesce(p_query, '')) as tsq,
           content._search_args_ok(p_scope, p_organization_id, p_archive) as ok),
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
                         else d.organization_id = p_organization_id end)
       and (case p_archive when 'hide' then d.archived_at is null
                           when 'only' then d.archived_at is not null
                           else true end)
       and ((p_type_slugs is not null and c.slug = any (p_type_slugs))
            or (p_type_slugs is null
                and (platform.knob_resolve('content.document', 'listed.' || c.slug, d.organization_id, auth.uid()) #>> '{}')::boolean)))
  select h.id, h.organization_id, h.type_slug, h.title, h.summary, h.preview, h.archived_at, h.updated_at, h.rank,
         ts_headline('english'::regconfig, left(h.body, 20000), h.tsq,
                     'MaxFragments=1, MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>')
    from hits h
   order by h.rank desc, h.updated_at desc, h.id
   limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0))
$function$;

CREATE OR REPLACE FUNCTION content.read_published(p_document_id uuid)
 RETURNS TABLE(document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text, body text, content_version integer, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d record;
begin
  select x.id, x.organization_id, x.visibility, x.published_content_version, x.published_at, c.slug
    into d
    from content.document x
    join platform.categories c on c.id = x.document_type_id
   where x.id = p_document_id and x.deleted_at is null and x.published_content_version is not null;
  -- Published AND (public, or the signed-in caller may read it). Anything else answers nothing,
  -- the same nothing as a document that does not exist.
  if d.id is null
     or not (d.visibility = 'public'
             or (auth.uid() is not null and iam.has_access('document', d.id, 'viewer'))) then
    return;
  end if;
  return query
    select d.id, d.organization_id, d.slug, v.title, v.summary, v.format,
           coalesce(v.body, (select b.body from content.document_version b
                              where b.document_id = v.document_id and b.content_version = v.body_content_version)),
           v.content_version, d.published_at
      from content.document_version v
     where v.document_id = d.id and v.content_version = d.published_content_version;
end;
$function$;

CREATE OR REPLACE FUNCTION content.read_published_by_slug(p_organization_id uuid, p_type_slug text, p_slug text)
 RETURNS TABLE(document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text, body text, content_version integer, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
  v_vis platform.visibility;
begin
  select x.id, x.visibility into v_id, v_vis
    from content.document x
    join platform.categories c on c.id = x.document_type_id
   where x.organization_id = p_organization_id and c.slug = p_type_slug and x.slug = p_slug
     and x.deleted_at is null and x.published_content_version is not null;
  if v_id is null
     or not (v_vis = 'public' or (auth.uid() is not null and iam.has_access('document', v_id, 'viewer'))) then
    return;
  end if;
  return query select * from content.read_published(v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION content._document_guard_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if content._capture_bypassed()
     or coalesce(current_setting('content.publish_doc', true), '') = new.id::text then
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

CREATE OR REPLACE FUNCTION content._document_guard_univer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if content._capture_bypassed()
     or coalesce(current_setting('content.univer_save_doc', true), '') = new.id::text then
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

CREATE OR REPLACE FUNCTION content._search_args_ok(p_scope text, p_organization_id uuid, p_archive text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_scope not in ('mine', 'organization') then
    raise exception using errcode = '22023', message = format('Unknown search scope %s.', coalesce(p_scope, 'NULL')),
      hint = 'Use mine (the default) or organization.';
  end if;
  if p_scope = 'organization' and p_organization_id is null then
    raise exception using errcode = '22023', message = 'An organization-scoped search names its organization.',
      hint = 'Pass p_organization_id, or search mine.';
  end if;
  if p_archive not in ('hide', 'all', 'only') then
    raise exception using errcode = '22023', message = format('Unknown archive filter %s.', coalesce(p_archive, 'NULL')),
      hint = 'Use hide (the default), all or only.';
  end if;
  return true;
end;
$function$;

delete from platform.client_callable_door where schema_name = 'content' and function_name = 'document_origin';
drop function content.document_origin(uuid);
drop function content._write_came_through(text[]);
drop function content.is_publicly_readable(content.document);

update platform.client_callable_door
   set reason = case function_name
         when 'read_published' then
           'p_document_id: the document must be published and live; it is returned when its visibility is public, or when the signed-in caller holds viewer (iam.has_access). Every other id, NULL included, returns no rows: nonexistent and forbidden read the same.'
         else
           'p_organization_id only narrows the slug lookup (organization + type + slug); access is decided on the document found exactly as content.read_published decides it. Nothing found or not readable returns no rows.'
       end
 where schema_name = 'content' and function_name in ('read_published', 'read_published_by_slug');

notify pgrst, 'reload schema';
