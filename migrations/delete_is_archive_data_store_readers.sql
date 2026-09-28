-- based-on: rag.fn_list_user_data_stores(boolean) c3fee528c6ddff7fc11b6ed671438e166d374c9ed9de93b71080936940882ecb
-- based-on: rag.fn_get_user_data_store(uuid, integer) fab0ced4997c2548f8853f70d7c771651d6f7d1aeb34f7c3b65503e810ee063e
-- based-on: public.rag_library_summary_totals(uuid) 85ff6d1a9e2f553f695523b8e212369a8f3c0e74e3286e8794fe576676546e11
-- based-on: rag.fn_list_library_catalog(uuid) 3eea2b98527b838070e0bfaa3dffd5a5310805863313acbedec0e3b101ec1f66
-- based-on: public.library_subscribe(text, uuid, uuid, jsonb, uuid) bd02883a2afbfda48a29cc7e566131d04dacbd4bbc9edd580e45ed19953433f8
-- Delete means archive (Arman, 2026-09-27): a data store's delete now sets
-- rag.data_stores.deleted_at (its members follow via platform.soft_delete_edge).
-- Every definer reader that lists or resolves stores for a person now leaves
-- stores in Trash out: the list, the detail (a trashed store reads as absent),
-- the library summary count, the discoverable catalog, and library_subscribe.
-- Bodies are the live pg_get_functiondef read immediately before writing; the
-- only change in each is the added deleted_at predicate.

CREATE OR REPLACE FUNCTION rag.fn_list_user_data_stores(p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, short_code text, description text, kind text, member_count bigint, is_active boolean, access text, read_only boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
  WITH v_user AS (SELECT (select auth.uid()) AS uid),
  v_orgs AS (
    SELECT om.organization_id FROM iam.organization_member om, v_user
    WHERE om.user_id = v_user.uid
  ),
  visible AS (
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'owner'::text AS access
    FROM rag.data_stores s, v_user
    WHERE s.created_by = v_user.uid
      AND (p_include_inactive OR s.is_active)
      AND s.deleted_at IS NULL
    UNION
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'org'::text AS access
    FROM rag.data_stores s
    WHERE s.organization_id IN (SELECT organization_id FROM v_orgs)
      AND (p_include_inactive OR s.is_active)
      AND s.deleted_at IS NULL
      AND s.id NOT IN (SELECT id FROM rag.data_stores s2, v_user WHERE s2.created_by = v_user.uid)
    UNION
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'granted'::text AS access
    FROM rag.data_stores s
    WHERE (p_include_inactive OR s.is_active)
      AND s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM rag.data_store_grants g
        WHERE g.data_store_id = s.id
          AND (
            g.audience = 'global'
            OR (g.audience = 'organization' AND g.organization_id IN (SELECT organization_id FROM v_orgs))
            OR (g.audience = 'industry' AND EXISTS (
                  SELECT 1 FROM iam.org_industries oi, v_orgs
                  WHERE oi.organization_id = v_orgs.organization_id
                    AND oi.industry_id = g.industry_id))
          )
      )
      AND s.id NOT IN (
        SELECT id FROM rag.data_stores s3, v_user WHERE s3.created_by = v_user.uid
        UNION
        SELECT s4.id FROM rag.data_stores s4, v_orgs WHERE s4.organization_id = v_orgs.organization_id
      )
  )
  SELECT
    v.id, v.name, v.short_code, v.description, v.kind,
    COALESCE(mc.cnt, 0) AS member_count,
    v.is_active,
    v.access,
    (v.access = 'granted') AS read_only
  FROM visible v
  LEFT JOIN (
    SELECT data_store_id, COUNT(*) AS cnt
    FROM rag.data_store_members
    WHERE deleted_at IS NULL
    GROUP BY data_store_id
  ) mc ON mc.data_store_id = v.id
  ORDER BY (NOT v.is_active), v.name;
$function$
;

CREATE OR REPLACE FUNCTION rag.fn_get_user_data_store(p_store_id uuid, p_member_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_store rag.data_stores;
  v_access text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_store FROM rag.data_stores WHERE id = p_store_id AND created_by = v_user AND deleted_at IS NULL;
  IF FOUND THEN
    v_access := 'owner';
  ELSE
    SELECT * INTO v_store FROM rag.data_stores s
     WHERE s.id = p_store_id
       AND s.deleted_at IS NULL
       AND s.organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_user);
    IF FOUND THEN
      v_access := 'org';
    ELSE
      SELECT * INTO v_store FROM rag.data_stores s
       WHERE s.id = p_store_id
         AND s.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM rag.data_store_grants g
            WHERE g.data_store_id = s.id
              AND (
                g.audience = 'global'
                OR (g.audience = 'organization' AND EXISTS (
                      SELECT 1 FROM iam.organization_member om
                       WHERE om.user_id = v_user AND om.organization_id = g.organization_id))
                OR (g.audience = 'industry' AND EXISTS (
                      SELECT 1 FROM iam.org_industries oi
                        JOIN iam.organization_member om ON om.organization_id = oi.organization_id
                       WHERE om.user_id = v_user AND oi.industry_id = g.industry_id))
              )
         );
      IF FOUND THEN
        v_access := 'granted';
      ELSE
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id', v_store.id,
    'name', v_store.name,
    'short_code', v_store.short_code,
    'description', v_store.description,
    'kind', v_store.kind,
    'organization_id', v_store.organization_id,
    'is_active', v_store.is_active,
    'settings', COALESCE(v_store.settings, '{}'::jsonb),
    'access', v_access,
    'read_only', (v_access = 'granted'),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'source_kind', m.source_kind,
        'source_id', m.source_id,
        'notes', m.notes,
        'added_at', m.added_at,
        'label', CASE m.source_kind
          WHEN 'library_doc' THEN (SELECT title FROM rag.library_docs WHERE id::text = m.source_id)
          WHEN 'cld_file' THEN (SELECT file_name FROM files.files WHERE id::text = m.source_id)
          WHEN 'processed_document' THEN (SELECT name FROM docproc.processed_documents WHERE id::text = m.source_id)
          WHEN 'note' THEN (SELECT label FROM workbench.notes WHERE id::text = m.source_id)
          WHEN 'code_file' THEN (SELECT path FROM code.code_files WHERE id::text = m.source_id)
          ELSE NULL
        END
      ))
      FROM (
        SELECT source_kind, source_id, notes, added_at
        FROM rag.data_store_members
        WHERE data_store_id = p_store_id AND deleted_at IS NULL
        ORDER BY added_at DESC
        LIMIT p_member_limit
      ) m
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rag_library_summary_totals(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'rag'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_documents_total     int := 0;
  v_documents_ready     int := 0;
  v_documents_embedding int := 0;
  v_documents_extracted int := 0;
  v_documents_pending   int := 0;
  v_pages_persisted     bigint := 0;
  v_chunks              bigint := 0;
  v_embeddings_oai      bigint := 0;
  v_embeddings_voyage   bigint := 0;
  v_data_stores         int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  with tops as (
    select id from docproc.processed_documents
    where created_by = v_uid and parent_processed_id is null and deleted_at is null
  ),
  per_doc as (
    select
      t.id,
      (select count(*) from docproc.processed_document_pages p
         where p.processed_document_id = t.id) as pages,
      (select count(*) from rag.kg_chunks c
         where c.processed_document_id = t.id and c.deleted_at is null) as chunks,
      (select count(*) from rag.kg_chunks c
         join rag.embeddings_voyage_4_large_1024 e on e.chunk_id = c.id
         where c.processed_document_id = t.id and c.deleted_at is null) as oai
    from tops t
  )
  select
    count(*)::int,
    coalesce(sum(pages), 0),
    coalesce(sum(chunks), 0),
    coalesce(sum(oai), 0),
    coalesce(sum((pages = 0)::int), 0),
    coalesce(sum((pages > 0 and chunks = 0)::int), 0),
    coalesce(sum((pages > 0 and chunks > 0 and oai >= chunks)::int), 0),
    coalesce(sum((pages > 0 and chunks > 0 and oai < chunks)::int), 0)
  into
    v_documents_total, v_pages_persisted, v_chunks, v_embeddings_oai,
    v_documents_pending, v_documents_extracted, v_documents_ready,
    v_documents_embedding
  from per_doc;

  select coalesce(count(*), 0)
  into v_embeddings_voyage
  from rag.kg_chunks c
  join rag.embeddings_voyage_code_3_1024 e on e.chunk_id = c.id
  where c.deleted_at is null
    and c.processed_document_id in (
      select id from docproc.processed_documents
       where created_by = v_uid and deleted_at is null
    );

  select count(*)::int
  into v_data_stores
  from rag.data_stores
  where deleted_at is null
    and (created_by = v_uid
     or (p_organization_id is not null and organization_id = p_organization_id));

  return jsonb_build_object(
    'documents_total',     v_documents_total,
    'documents_ready',     v_documents_ready,
    'documents_embedding', v_documents_embedding,
    'documents_extracted', v_documents_extracted,
    'documents_pending',   v_documents_pending,
    'pages_persisted',     v_pages_persisted,
    'chunks',              v_chunks,
    'embeddings_oai',      v_embeddings_oai,
    'embeddings_voyage',   v_embeddings_voyage,
    'data_stores',         v_data_stores
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION rag.fn_list_library_catalog(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, short_code text, description text, kind text, member_count bigint, subscribed boolean, entitled_via text, entitled_industry_name text, entitled_industry_slug text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_admin boolean := exists (select 1 from admin.admins a where a.user_id = (select auth.uid()));
begin
  if p_organization_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return query
  select
    store.id,
    store.name,
    store.short_code,
    store.description,
    store.kind,
    coalesce(member_count.count, 0),
    p_organization_id is not null and exists (
      select 1
      from rag.data_store_grants as grant_row
      where grant_row.data_store_id = store.id
        and grant_row.audience = 'organization'
        and grant_row.organization_id = p_organization_id
    ),
    coalesce(ent.via, case when v_admin then 'admin' end),
    ent.ind_name,
    ent.ind_slug
  from rag.data_stores as store
  left join (
    select member.data_store_id, count(*) as count
    from rag.data_store_members as member
    where member.deleted_at is null
    group by member.data_store_id
  ) as member_count on member_count.data_store_id = store.id
  left join lateral (
    select
      case
        when bool_or(g.audience = 'organization') then 'organization'
        when bool_or(g.audience = 'industry') then 'industry'
        when bool_or(g.audience = 'global') then 'global'
      end as via,
      (array_agg(i.name order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_name,
      (array_agg(i.slug order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_slug
    from rag.data_store_grants g
    left join iam.industries i on i.id = g.industry_id
    where g.data_store_id = store.id
      and v_user is not null
      and (
        g.audience = 'global'
        or (g.audience = 'organization'
            and g.organization_id in (
              select om.organization_id
              from iam.organization_member om
              where om.user_id = v_user))
        or (g.audience = 'industry'
            and exists (
              select 1
              from iam.org_industries oi
              join iam.organization_member om
                on om.organization_id = oi.organization_id
              where om.user_id = v_user
                and oi.industry_id = g.industry_id))
      )
  ) as ent on true
  where store.discoverable
    and store.is_active
    and store.deleted_at is null
  order by store.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.library_subscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_target jsonb DEFAULT NULL::jsonb, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam', 'seo', 'web'
AS $function$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_org is null and p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    select s.organization_id into v_org from web.site s where s.id = (p_target->>'site_id')::uuid and s.deleted_at is null;
  end if;
  if v_org is null then raise exception 'library: organization required' using errcode = '22023'; end if;
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = v_org and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', v_org using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable and s.deleted_at is null) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;

  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'ratified'), false) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'active'), false) then
      raise exception 'library: organization % is not entitled to Rulebook % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = v_org
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', v_org, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    -- KI-030: `rule_ids` is gone — a pack's meaning is items now, so `item_ids`
    -- selects every part including the dimension values.
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  -- Acting organization: the subscribing organization, whose membership this door just
  -- checked the caller against. It is also the organization acted upon.
  perform public._library_audit(v_actor, v_org, 'self_subscribe', p_entity_type, p_entity_id,
                                null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $function$
;
