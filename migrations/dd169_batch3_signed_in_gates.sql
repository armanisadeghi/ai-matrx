-- DD-169 batch 3 (B-75) — the six signed-in doors that had NO caller gate at all.
--
-- Batch 3 is the 608 `authenticated`-executable SECURITY DEFINER functions still on
-- platform.definer_client_grant_grandfather after B-64. They run as the owner, so RLS
-- does not apply inside them; a signed-in caller reaches whatever the body reads.
-- Triage of all 608 (the table is in the B-75 report) found exactly six that BOTH have a
-- real client call site in one of the four repos AND resolve nothing about the caller —
-- no auth.uid(), no access predicate, no assert. Each is fixed here at the body, then
-- declared as a door naming the gate it now carries.
--
-- 1. public.conversations_exist(uuid[])       — was an existence oracle over every row of
--    chat.conversation. Now mirrors chat.conversation's own std_select/pub_read policies.
-- 2. public.get_structured_list_for_selection(uuid) — returned any list's name, description
--    and every item by id. Now mirrors workbench.udt_structured_lists' std_select/pub_read.
-- 3. public.lookup_user_by_email(text)        — reads auth.users. The invite-by-email product
--    needs the lookup, so the leak class closed here is the UNAUTHENTICATED one: the function
--    now refuses a caller with no session instead of relying on a grant to do it silently.
-- 4. seo.ai_autonomy_scope(text,uuid)         — returned any organization's, brand's or site's
--    name and AI-autonomy settings by id. Now asks for read access to the scope first.
-- 5. seo.fn_upsert_keyword(text,text)         — writes the shared keyword vocabulary. Now
--    refuses a caller with no session.
-- 6. seo.situational_refresh_status(uuid)     — returned any site's matcher/stamp counts by id.
--    Now asserts site access through the same helper every other gsc_* reader uses.
--
-- Nothing else in the six changes: same signature, same return shape, same rows for a caller
-- who was always allowed to see them.

create or replace function public.conversations_exist(p_ids uuid[])
 returns table(id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id
  from chat.conversation c
  where c.id = any(p_ids)
    and c.deleted_at is null
    -- 🚨 THE GATE (DD-169 batch 3). Mirrors chat.conversation's std_select + pub_read.
    and (c.created_by = (select auth.uid())
      or c.visibility = 'public'::platform.visibility
      or iam.has_access('conversation', c.id, 'viewer'::public.permission_level))
$function$;

create or replace function public.get_structured_list_for_selection(p_list_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_result jsonb;
begin
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and l.deleted_at is null
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
$function$;

create or replace function public.lookup_user_by_email(lookup_email text)
 returns table(user_id uuid, user_email text)
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
DECLARE
  normalized_email text;
  found_user_id uuid;
  found_user_email text;
BEGIN
  -- 🚨 THE GATE (DD-169 batch 3). This function reads auth.users as the owner. Sharing and
  -- inviting by email is the product it exists for, so it stays available to a signed-in
  -- caller — but it says so itself instead of leaving the whole question to a GRANT.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'lookup_user_by_email: sign in to look someone up by email'
      USING ERRCODE = '42501';
  END IF;

  normalized_email := lower(trim(lookup_email));

  SELECT au.id, au.email INTO found_user_id, found_user_email
  FROM auth.users au
  WHERE lower(au.email) = normalized_email
  LIMIT 1;

  IF found_user_id IS NOT NULL THEN
    user_id := found_user_id;
    user_email := found_user_email;
    RETURN NEXT;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

create or replace function seo.ai_autonomy_scope(p_scope text, p_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
as $function$
DECLARE
  v_own jsonb := '{}'::jsonb;
  v_inherited jsonb := '{}'::jsonb;
  v_label text;
  v_parent jsonb;
  v_org uuid;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_autonomy_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_autonomy_id_required: % needs an id', p_scope;
  END IF;

  -- 🚨 THE READ GATE (DD-169 batch 3). `may_edit` below answered the WRITE question only;
  -- the org / brand / site name and its settings came back to any signed-in caller who
  -- guessed an id. Reading a tier now needs read access to that tier. `platform` is the
  -- product's own published defaults and carries no tenant row.
  IF p_scope = 'org' THEN
    IF NOT (public.is_platform_admin() OR iam.has_org_access(p_id)) THEN
      RAISE EXCEPTION 'seo_autonomy_denied: no access to that organization'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'brand' THEN
    SELECT b.organization_id INTO v_org FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    IF NOT (public.is_platform_admin()
            OR iam.has_access('web_brand', p_id, 'viewer'::public.permission_level)
            OR (v_org IS NOT NULL AND iam.has_org_access(v_org))) THEN
      RAISE EXCEPTION 'seo_autonomy_denied: no access to that brand'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'site' THEN
    PERFORM seo.gsc_assert_site_access(p_id);
  END IF;

  IF p_scope = 'platform' THEN
    v_label := 'Platform defaults';
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_own FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
  ELSIF p_scope = 'org' THEN
    SELECT o.name, COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM iam.organizations o WHERE o.id = p_id;
    v_parent := jsonb_build_object('scope','platform','label','Platform defaults');
  ELSIF p_scope = 'brand' THEN
    SELECT b.name, COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','org','id',o.id,'label',o.name)
                   FROM web.brand b JOIN iam.organizations o ON o.id=b.organization_id WHERE b.id = p_id);
  ELSE
    SELECT COALESCE(s.name, s.domain), COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id=s.brand_id WHERE s.id = p_id);
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope, 'id', p_id, 'label', v_label,
    'parent', v_parent,
    'may_edit', seo.fn_value_settings_may_edit(p_scope, p_id),
    'capabilities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'label', c.label, 'description', c.description,
        'default_mode', c.default_mode, 'default_timeout_hours', c.default_timeout_hours,
        'enforced', c.enforced, 'enforcement_note', c.enforcement_note,
        'own_mode', v_own->c.slug->>'mode',
        'own_timeout_hours', (v_own->c.slug->>'timeout_hours')::int,
        'effective', CASE WHEN p_scope = 'site' THEN seo.fn_ai_autonomy(p_id, c.slug)
                          ELSE jsonb_build_object('mode', COALESCE(v_own->c.slug->>'mode', c.default_mode),
                                                  'source', CASE WHEN v_own ? c.slug THEN p_scope ELSE 'platform_default' END) END
      ) ORDER BY c.position), '[]'::jsonb)
      FROM seo.ai_capability c));
END;
$function$;

create or replace function seo.fn_upsert_keyword(p_phrase text, p_language text default 'en'::text, out o_id uuid, out o_created boolean)
 returns record
 language plpgsql
 security definer
 set search_path to 'seo', 'public'
as $function$
declare
  v_norm text := seo.fn_normalize_phrase(p_phrase);
begin
  -- 🚨 THE GATE (DD-169 batch 3). This writes the shared keyword vocabulary every site
  -- reads. It is signed-in work; it now says so instead of leaving it to a GRANT.
  if auth.uid() is null then
    raise exception 'seo_keyword_no_caller: sign in to add a keyword'
      using errcode = '42501';
  end if;

  o_created := false;

  -- Exact identity first.
  select id into o_id from seo.keyword
  where normalized_phrase = v_norm and language = p_language and deleted_at is null;
  if o_id is not null then
    return;
  end if;

  if p_language = 'und' then
    select id into o_id from seo.keyword
    where normalized_phrase = v_norm and deleted_at is null
    order by (language = 'und'), created_at
    limit 1;
    if o_id is not null then
      return;
    end if;
  else
    begin
      update seo.keyword
      set language = p_language, updated_at = now()
      where normalized_phrase = v_norm and language = 'und' and deleted_at is null
      returning id into o_id;
    exception when unique_violation then
      o_id := null;
    end;
    if o_id is not null then
      return;
    end if;
  end if;

  insert into seo.keyword (phrase, normalized_phrase, language)
  values (btrim(p_phrase), v_norm, p_language)
  on conflict (normalized_phrase, language) do nothing
  returning id into o_id;
  o_created := o_id is not null;
  if o_id is null then
    select id into o_id from seo.keyword
    where normalized_phrase = v_norm and language = p_language;
  end if;
end;
$function$;

create or replace function seo.situational_refresh_status(p_site_id uuid)
 returns table(site_id uuid, matchers integer, stale_matchers integer, oldest_evaluated_at timestamp with time zone, newest_evaluated_at timestamp with time zone, stamps integer, stale_after_hours integer, autonomy jsonb)
 language plpgsql
 stable security definer
 set search_path to 'seo', 'web', 'platform', 'public', 'pg_temp'
as $function$
begin
  -- 🚨 THE GATE (DD-169 batch 3). The same helper every other gsc_* site reader asks.
  perform seo.gsc_assert_site_access(p_site_id);

  return query
  with hours as (
    select coalesce((k.value #>> '{}')::int, 24) as h
      from platform.feature_knob k
     where k.feature = 'seo.situational_stamps' and k.key = 'stale_after_hours'
  ),
  cutoff as (select now() - make_interval(hours => coalesce((select h from hours), 24)) as t)
  select p_site_id,
         count(dm.*)::int,
         count(dm.*) filter (
           where dm.last_evaluated_at is null or dm.last_evaluated_at < (select t from cutoff)
         )::int,
         min(dm.last_evaluated_at),
         max(dm.last_evaluated_at),
         (select count(*)::int
            from seo.keyword_facet kf
            join seo.dimension_value_matcher d2 on d2.id = kf.matcher_id
           where d2.site_id = p_site_id and d2.kind = 'condition' and kf.deleted_at is null),
         coalesce((select h from hours), 24),
         seo.fn_autonomy_gate(p_site_id, 'matcher_engine')
    from seo.dimension_value_matcher dm
   where dm.site_id = p_site_id and dm.kind = 'condition'
     and dm.enabled and dm.deleted_at is null;
end;
$function$;

-- ── The six are now gated, so each is DECLARED as a signed-in door and its
--    grandfather row (the standing admission that nobody had decided) is deleted.
--    gate_predicate is the literal text D6 asserts is still present in the body.
insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, declared_by, gate_predicate)
values
 ('public','conversations_exist','p_ids uuid[]',
  'Signed-in door (DD-169 batch 3). Tells the war room which of the conversation ids it holds still exist. Gated: mirrors chat.conversation std_select/pub_read, so it answers only about conversations the caller may read.',
  'DD-169 batch 3 / B-75','iam.has_access(''conversation'''),
 ('public','get_structured_list_for_selection','p_list_id uuid',
  'Signed-in door (DD-169 batch 3). Returns one structured list and its items for a picker. Gated: mirrors workbench.udt_structured_lists std_select/pub_read.',
  'DD-169 batch 3 / B-75','iam.has_access(''structured_list'''),
 ('public','lookup_user_by_email','lookup_email text',
  'Signed-in door (DD-169 batch 3). Resolves an email to a user id so a person can be invited or shared with by email. Gated: refuses a caller with no session itself (42501) rather than leaving that to the GRANT; it reads auth.users as the owner.',
  'DD-169 batch 3 / B-75','auth.uid() IS NULL'),
 ('seo','ai_autonomy_scope','p_scope text, p_id uuid',
  'Signed-in door (DD-169 batch 3). Reads one autonomy tier (platform / org / brand / site). Gated: org needs org access, brand needs brand or org access, site goes through gsc_assert_site_access; platform is the product''s published defaults.',
  'DD-169 batch 3 / B-75','seo_autonomy_denied'),
 ('seo','fn_upsert_keyword','p_phrase text, p_language text, OUT o_id uuid, OUT o_created boolean',
  'Signed-in door (DD-169 batch 3). Mints or adopts a row in the shared keyword vocabulary. Gated: refuses a caller with no session (42501).',
  'DD-169 batch 3 / B-75','seo_keyword_no_caller'),
 ('seo','situational_refresh_status','p_site_id uuid',
  'Signed-in door (DD-169 batch 3). Matcher and stamp freshness for one site. Gated: seo.gsc_assert_site_access, the same helper every other gsc_* site reader asks.',
  'DD-169 batch 3 / B-75','seo.gsc_assert_site_access(p_site_id)');

delete from platform.definer_client_grant_grandfather g
 where (g.schema_name, g.function_name, g.identity_args) in (
   ('public','conversations_exist','p_ids uuid[]'),
   ('public','get_structured_list_for_selection','p_list_id uuid'),
   ('public','lookup_user_by_email','lookup_email text'),
   ('seo','ai_autonomy_scope','p_scope text, p_id uuid'),
   ('seo','fn_upsert_keyword','p_phrase text, p_language text, OUT o_id uuid, OUT o_created boolean'),
   ('seo','situational_refresh_status','p_site_id uuid'));

do $$
declare n int;
begin
  select count(*) into n from platform.definer_client_grant_grandfather where schema_name <> 'pgsodium';
  if n <> 602 then
    raise exception 'DD-169 batch 3 gates: expected 602 non-pgsodium grandfather rows after this file, found %', n;
  end if;
  select count(*) into n from platform.client_callable_door
   where declared_by = 'DD-169 batch 3 / B-75';
  if n <> 6 then
    raise exception 'DD-169 batch 3 gates: expected 6 new door rows, found %', n;
  end if;
end $$;
