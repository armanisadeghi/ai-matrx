-- based-on: public.admin_delete_catalog_entry(text, text, text) 68cde3c6110b07b79f92ea9cd5221c907881221c78e875fe851232f41c650a32
-- based-on: public.admin_upsert_catalog_entry(text, text, text, integer, jsonb, text, text, bigint, text, boolean, integer, text, timestamp with time zone) 388e5a03bb534bf78ff62d19301b3c198907e80e06891b50941385e4475869bc
-- based-on: public.edu_uncertify_content(text, uuid) b019f6a8fd0c42d43164e1499e325279c24a778623af49b73616e60c7bf72716
-- based-on: public.edu_certify_content(text, uuid, text) c03db7bce9d89ed5549b2e1066a01823753e5de024ba5293795d429d48f5a1b4
-- based-on: public.edu_verify_content(text, uuid, boolean, text) b8212ba7a8fc24872d3debf07fc4bde26bec57c0b9cfb8253a3d39d101560f58
-- based-on: public.edu_public_decks(text, boolean, integer, text) 23393519ae69b329682772005d102a1315ed5476f91cc24c903e8ebef90891f0
-- based-on: public.industry_curator_revoke(uuid, uuid, uuid) fe4ee508272a86553d9682e4ea0b8acfbb80b50f0a1a191a30d06a988a536439
-- based-on: public.industry_curator_grant(uuid, uuid, uuid) c0dcc3b9647af3e96c74ab8864cc9482457726934c047a258183d7160dc1fbf8
-- based-on: public.is_industry_curator(uuid, uuid) a6c07fcc4a02b8e21f8e9cee228846be3db1b826229cee3db0b9c9ff8a3286cc
-- based-on: public.can_curate_library_document(uuid, uuid) 7e61fce807f9f27716f09f6901d43d84e6885202ac9c99f3552468a6df66eba6
-- Delete means archive (Arman, 2026-09-27): three client-callable admin doors
-- hard-deleted rows of soft-deletable tables. Each now archives (deleted_at),
-- the matching grant/upsert revives the archived row on the same natural key
-- (their unique indexes are full, so the conflict lands on the archived row),
-- and the readers that decide access or list live rows skip archived ones:
--   catalog entry   admin_delete_catalog_entry -> deleted_at + is_active=false; admin_upsert revives
--   certification   edu_uncertify_content -> deleted_at; edu_certify revives (fresh sign-off);
--                   edu_verify / edu_public_decks skip archived
--   curator         industry_curator_revoke -> deleted_at; industry_curator_grant revives;
--                   is_industry_curator / can_curate_library_document skip archived
-- Bodies are the live pg_get_functiondef read immediately before writing.

CREATE OR REPLACE FUNCTION public.admin_delete_catalog_entry(p_app text, p_kind text, p_key text)
 RETURNS catalog_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key AND deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('No catalog entry %s/%s/%s', p_app, p_kind, p_key));
  END IF;

  INSERT INTO public.catalog_entries_history
    (entry_id, app, kind, key, schema_version, payload, artifact_url,
     artifact_sha256, artifact_size_bytes, min_app_version, is_active,
     sort_order, notes, op, changed_by)
  VALUES
    (existing.id, existing.app, existing.kind, existing.key,
     existing.schema_version, existing.payload, existing.artifact_url,
     existing.artifact_sha256, existing.artifact_size_bytes,
     existing.min_app_version, existing.is_active, existing.sort_order,
     existing.notes, 'delete', (select auth.uid()));

  -- Delete means archive (2026-09-27): the row stays, archived and switched
  -- off (is_active=false keeps every client that filters on is_active from
  -- serving it). admin_upsert_catalog_entry on the same key revives it.
  UPDATE public.catalog_entries
     SET deleted_at = now(), is_active = false,
         updated_at = now(), updated_by = (select auth.uid())
   WHERE id = existing.id
  RETURNING * INTO existing;

  RETURN existing;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_upsert_catalog_entry(p_app text, p_kind text, p_key text, p_schema_version integer, p_payload jsonb, p_artifact_url text DEFAULT NULL::text, p_artifact_sha256 text DEFAULT NULL::text, p_artifact_size_bytes bigint DEFAULT NULL::bigint, p_min_app_version text DEFAULT NULL::text, p_is_active boolean DEFAULT false, p_sort_order integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS catalog_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.catalog_entries;
  updated  public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  IF p_expected_updated_at IS NOT NULL
     AND FOUND
     AND existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: entry %/%/% changed since it was loaded (now %). Reload and re-apply.',
      p_app, p_kind, p_key, existing.updated_at
      USING ERRCODE = '40001';
  END IF;

  IF FOUND THEN
    INSERT INTO public.catalog_entries_history
      (entry_id, app, kind, key, schema_version, payload, artifact_url,
       artifact_sha256, artifact_size_bytes, min_app_version, is_active,
       sort_order, notes, op, changed_by)
    VALUES
      (existing.id, existing.app, existing.kind, existing.key,
       existing.schema_version, existing.payload, existing.artifact_url,
       existing.artifact_sha256, existing.artifact_size_bytes,
       existing.min_app_version, existing.is_active, existing.sort_order,
       existing.notes, 'update', (select auth.uid()));
  END IF;

  -- organization_id: public.catalog_entries is a platform-wide app catalog
  -- (keyed app/kind/key, super-admin only), not org data. Belongs to the
  -- ratified platform tenant via public.system_org_id('system'). Never
  -- defaulted or resolver-chosen (Data Doctrine, 2026-09-19).
  INSERT INTO public.catalog_entries AS ce
    (app, organization_id, kind, key, schema_version, payload, artifact_url, artifact_sha256,
     artifact_size_bytes, min_app_version, is_active, sort_order, notes,
     updated_at, updated_by)
  VALUES
    (p_app, public.system_org_id('system'), p_kind, p_key, p_schema_version, p_payload, p_artifact_url,
     p_artifact_sha256, p_artifact_size_bytes, p_min_app_version, p_is_active,
     p_sort_order, p_notes, now(), (select auth.uid()))
  ON CONFLICT (app, kind, key) DO UPDATE
    SET schema_version      = EXCLUDED.schema_version,
        payload             = EXCLUDED.payload,
        artifact_url        = EXCLUDED.artifact_url,
        artifact_sha256     = EXCLUDED.artifact_sha256,
        artifact_size_bytes = EXCLUDED.artifact_size_bytes,
        min_app_version     = EXCLUDED.min_app_version,
        is_active           = EXCLUDED.is_active,
        sort_order          = EXCLUDED.sort_order,
        notes               = EXCLUDED.notes,
        updated_at          = now(),
        updated_by          = (select auth.uid()),
        -- Saving an archived key brings it back (delete means archive).
        deleted_at          = NULL
  RETURNING * INTO updated;

  RETURN updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_uncertify_content(p_resource_type text, p_resource_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Delete means archive (2026-09-27): the certification row is archived,
  -- never removed; edu_certify_content on the same resource revives it.
  update education.content_certification
     set deleted_at = now()
   where resource_type = p_resource_type and resource_id = p_resource_id
     and deleted_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_certify_content(p_resource_type text, p_resource_id uuid, p_note text DEFAULT NULL::text)
 RETURNS education.content_certification
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- THE ORGANIZATION: the certification is a child of the RESOURCE being
  -- certified — inherit that resource's own organization_id. Never defaulted.
  -- Only 'fc_set' is certifiable today (features/education/library/actions.ts);
  -- an unrecognized resource_type has no legitimate source and is refused.
  if p_resource_type = 'fc_set' then
    select organization_id into v_org from education.fc_set where id = p_resource_id;
  else
    raise exception 'organization_required: edu_certify_content has no organization resolver for resource_type %', p_resource_type
      using errcode = 'P0001',
            hint = 'Add an organization lookup for this resource_type before certifying it.';
  end if;

  if v_org is null then
    raise exception 'organization_required: resource % % was not found (or carries no organization)', p_resource_type, p_resource_id
      using errcode = 'P0001';
  end if;

  insert into education.content_certification (resource_type, resource_id, note, certified_by, organization_id)
  values (p_resource_type, p_resource_id, p_note, v_uid, v_org)
  on conflict (resource_type, resource_id)
    do update set note = excluded.note, certified_by = v_uid, certified_at = now(),
                  -- Re-certifying an uncertified (archived) resource starts a
                  -- fresh certification: no earlier human sign-off carries over.
                  human_verified_at = case when content_certification.deleted_at is null
                                           then content_certification.human_verified_at end,
                  human_verified_by = case when content_certification.deleted_at is null
                                           then content_certification.human_verified_by end,
                  deleted_at = null
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_verify_content(p_resource_type text, p_resource_id uuid, p_verified boolean DEFAULT true, p_note text DEFAULT NULL::text)
 RETURNS education.content_certification
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update education.content_certification
     set human_verified_at = case when p_verified then now() else null end,
         human_verified_by = case when p_verified then v_uid else null end,
         note = coalesce(p_note, note)
   where resource_type = p_resource_type
     and resource_id = p_resource_id
     and deleted_at is null
  returning * into v_row;

  if not found then
    perform platform.refuse_not_found(format('no certification row for %s %s', p_resource_type, p_resource_id));
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_public_decks(p_search text DEFAULT NULL::text, p_certified_only boolean DEFAULT false, p_limit integer DEFAULT 60, p_exam_slug text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, topic text, difficulty text, card_count bigint, certified boolean, certified_note text, human_verified boolean, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform'
AS $function$
  select
    s.id, s.name, s.description, s.topic, s.difficulty,
    (select count(*) from platform.associations_live a
       where a.target_type='fc_set' and a.target_id=s.id
         and a.source_type='fc_card' and a.role='member')::bigint as card_count,
    (cc.resource_id is not null) as certified,
    cc.note as certified_note,
    (cc.human_verified_at is not null) as human_verified,
    s.updated_at
  from education.fc_set s
  left join education.content_certification cc
    on cc.resource_type='fc_set' and cc.resource_id=s.id and cc.deleted_at is null
  where s.visibility='public'
    and s.deleted_at is null
    and (
      p_search is null or btrim(p_search)=''
      or s.name ilike '%'||p_search||'%'
      or s.topic ilike '%'||p_search||'%'
      or s.description ilike '%'||p_search||'%'
    )
    and (not p_certified_only or cc.resource_id is not null)
    and (p_exam_slug is null or btrim(p_exam_slug)='' or s.metadata->>'exam_slug' = p_exam_slug)
  -- Human-verified content sorts above AI-curated starters.
  order by (cc.human_verified_at is not null) desc,
           (cc.resource_id is not null) desc,
           s.updated_at desc
  limit greatest(1, least(coalesce(p_limit,60),200));
$function$
;

CREATE OR REPLACE FUNCTION public.industry_curator_revoke(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_industry_org uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    -- organization_id: the audit row is about a specific industry — inherit
    -- its organization_id, read before the curator row is archived.
    SELECT organization_id INTO v_industry_org FROM iam.industries WHERE id = p_industry;
    IF v_industry_org IS NULL THEN
        RAISE EXCEPTION 'organization_required: industry % not found', p_industry;
    END IF;
    -- Delete means archive (2026-09-27): the grant is archived; a later
    -- industry_curator_grant for the same person and industry revives it.
    UPDATE iam.industry_curators SET deleted_at = now()
     WHERE user_id = p_user AND industry_id = p_industry AND deleted_at IS NULL;
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_curator_revoke', p_industry, jsonb_build_object('user', p_user), v_industry_org);
END; $function$
;

CREATE OR REPLACE FUNCTION public.industry_curator_grant(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS iam.industry_curators
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industry_curators; v_industry_org uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    -- organization_id: a curator grant is a CHILD of the industry it grants
    -- curatorship over — inherit the parent row's organization_id, never a
    -- default or the caller's personal org.
    SELECT organization_id INTO v_industry_org FROM iam.industries WHERE id = p_industry;
    IF v_industry_org IS NULL THEN
        RAISE EXCEPTION 'organization_required: industry % not found', p_industry;
    END IF;
    INSERT INTO iam.industry_curators(user_id, industry_id, granted_by, organization_id)
    VALUES (p_user, p_industry, v_actor, v_industry_org)
    ON CONFLICT (user_id, industry_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, deleted_at = NULL
    RETURNING * INTO v_row;
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_curator_grant', p_industry, jsonb_build_object('user', p_user), v_industry_org);
    RETURN v_row;
END; $function$
;

CREATE OR REPLACE FUNCTION public.is_industry_curator(p_user uuid, p_industry uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM iam.industry_curators ic WHERE ic.user_id = p_user AND ic.industry_id = p_industry AND ic.deleted_at IS NULL); $function$
;

-- is_industry_curator is server-only (client EXECUTE revoked by d31_retire_identity_oracles,
-- 2026-07-15; its one caller is seo._pack_assert_creator). Declare that in data.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Answers whether p_user holds a live (not archived) curator grant for p_industry.',
       'delete_is_archive_catalog_cert_curator', false, false, null,
       'server_only: no client call site in matrx-frontend, matrx-extend or aidream; client EXECUTE revoked 2026-07-15 (d31_retire_identity_oracles). Called only inside seo._pack_assert_creator.'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'is_industry_curator'
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'public' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

CREATE OR REPLACE FUNCTION public.can_curate_library_document(p_doc uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag'
AS $function$
  select case when iam.asks_about_caller(p_user, 'public.can_curate_library_document')
  then (public.is_super_admin_user(p_user)
      or exists (
          select 1
          from docproc.processed_documents pd
          join rag.data_store_members dm
            on dm.deleted_at is null
           and ( (dm.source_kind = pd.source_kind and dm.source_id = pd.source_id::text)
              or (dm.source_kind = 'processed_document' and dm.source_id = pd.id::text) )
          join rag.data_store_grants g
            on g.data_store_id = dm.data_store_id and g.audience = 'industry'
          join iam.industry_curators ic
            on ic.industry_id = g.industry_id and ic.user_id = p_user and ic.deleted_at is null
          where pd.id = p_doc
            and pd.deleted_at is null
      ))
  end;
$function$
;
