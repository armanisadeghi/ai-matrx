-- access_ladder_t13_22d_creator_page_resolves_through_anyone_link.sql
--
-- T-13 step 2.2, part d of e (common-docs/projects/access-ladder/t13/PLAN.md).
-- The creator page (handle -> profile) stops reading visibility 'link': it serves a published
-- page whose profile is public or carries an active Anyone link. creator_set_public writes
-- the Anyone link on publish and switches off the links it wrote on unpublish; it no longer
-- touches the row's visibility. Rollback: re-apply the bodies named by the based-on lines.
-- based-on: public.creator_public_handles() 12d7bba557b76421448d3f905a2d38006f4be110114c675f07960978bcda1ebf
-- based-on: public.creator_public_page(text) 607394c9a7be018034de0446035190cd754b308128d054042ebafcadfd005c4d
-- based-on: public.creator_set_public(boolean) c68b8bbe6b086f47d109ddf127983af52e9bcf8bcf53249ae32c1fd1770ff723

CREATE OR REPLACE FUNCTION public.creator_public_handles()
 RETURNS TABLE(handle text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
  -- DD-152 / T-13 2.2: `creator_public` is the publication decision; beneath it the profile must be
  -- public or carry an active Anyone link, so a revoked link stops the handle being served here.
  select creator_handle, updated_at
  from users.profiles
  where creator_public = true
    and deleted_at is null
    and creator_handle is not null
    and (visibility = 'public'::platform.visibility
         or platform.anyone_link_active('user_profile', id));
$function$;

CREATE OR REPLACE FUNCTION public.creator_public_page(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  p record;
  v_item jsonb;
  v_kind text;
  v_out jsonb;
  v_featured jsonb := '[]'::jsonb;
  v_enriched jsonb;
  v_scope context.scopes;
  v_mode text;
  v_cents int;
  v_price jsonb;
begin
  if v_handle = '' then return null; end if;

  -- DD-152 / T-13 2.2: the publication flag AND (public, or an active Anyone link on the profile).
  -- A handle that is not published, or whose Anyone link was revoked, returns NULL — never an error that would confirm the
  -- handle exists (access DECISIONS 2026-08-11).
  select id, creator_handle, display_name, avatar_url, creator_tagline,
         creator_bio, creator_links, creator_featured, creator_published_at, updated_at
    into p
  from users.profiles
  where lower(creator_handle) = v_handle
    and creator_public = true
    and deleted_at is null
    and (visibility = 'public'::platform.visibility
         or platform.anyone_link_active('user_profile', id))
  limit 1;

  if p.id is null then return null; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p.creator_featured, '[]'::jsonb))
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'youtube' then
      if coalesce(v_item->>'videoId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'youtube', 'videoId', v_item->>'videoId', 'title', v_item->>'title'
        ));
      end if;
    elsif v_kind = 'class' then
      if coalesce(v_item->>'classId', '') <> '' then
        v_mode := coalesce(v_item->>'accessMode', 'open');
        v_price := v_item->'price';
        begin
          select s.* into v_scope
          from context.scopes s
          join context.scope_types st on st.id = s.scope_type_id
          where s.id = (v_item->>'classId')::uuid and st.slug = 'class' and s.deleted_at is null;
          if v_scope.id is not null then
            v_mode := coalesce(nullif(v_scope.settings->>'access_mode', ''), 'open');
            v_cents := nullif(v_scope.settings->>'price_cents', '')::int;
            if v_cents is not null then
              v_price := to_jsonb(round(v_cents / 100.0, 2));
            else
              v_price := null;
            end if;
          end if;
        exception when others then null;
        end;
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'class', 'classId', v_item->>'classId',
          'title', coalesce(v_item->>'title', 'Class'),
          'description', v_item->>'description',
          'accessMode', v_mode, 'price', v_price
        ));
      end if;
    elsif v_kind = 'resource' then
      v_enriched := public.creator_resolve_featured_resource(v_item->>'resourceType', (v_item->>'id')::uuid);
      if v_enriched is not null then
        v_featured := v_featured || jsonb_build_array(v_enriched);
      end if;
    end if;
  end loop;

  v_out := jsonb_build_object(
    'handle', p.creator_handle, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
    'tagline', p.creator_tagline, 'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb), 'featured', v_featured,
    'publishedAt', p.creator_published_at, 'updatedAt', p.updated_at
  );
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creator_set_public(p_public boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- DD-152 / T-13 2.2: a page an anonymous visitor reaches by holding the handle is shared by an
  -- ANYONE LINK on the profile — never `public`, which would open the whole profile row to the
  -- published anon key through the {anon} pub_read policy. Publishing writes the link, never the
  -- row's visibility; unpublishing switches off the links this control wrote.
  update users.profiles set
    creator_public = coalesce(p_public, false),
    creator_published_at = case when coalesce(p_public, false)
      then coalesce(creator_published_at, now()) else creator_published_at end,
    updated_at = now()
  where id = v_uid and deleted_at is null and creator_handle is not null;
  if not found then
    perform platform.refuse_not_found('Claim a handle before publishing your page');
  end if;
  if coalesce(p_public, false) then
    perform platform.ensure_anyone_link('user_profile', v_uid, v_uid,
      (select pr.organization_id from users.profiles pr where pr.id = v_uid),
      jsonb_build_object('origin', 'creator_page'));
  else
    update platform.share_links l set is_active = false
     where l.resource_type = 'user_profile' and l.resource_id = v_uid and l.is_active
       and (l.metadata->>'origin' = 'creator_page' or l.metadata->>'t13_origin' = 'visibility_link');
  end if;
  return public.creator_get_mine();
end;
$function$;
