-- education_creator_profiles.sql — Creator profiles + public landing pages (/c/[handle])
-- Convergence C growth lever: teachers / YouTubers claim a public handle and
-- feature their YouTube videos + free Matrx tools + classes on a public,
-- SEO-first page. Zero new tables — this EXTENDS the canonical per-user profile
-- (users.profiles: PK = auth user id, display_name, avatar_url, base entity
-- cols, visibility, pub_read). A "creator" is a profile that has claimed a
-- unique handle and opted its page public.
--
-- Access model:
--   creator_handle  = the unique public slug (/c/<handle>)
--   creator_public  = the opt-in flag: is the landing page live + indexable?
-- The anon read path is a SECURITY DEFINER RPC (creator_public_page) so we never
-- have to flip the profile's general `visibility` to expose the page — the RPC
-- returns ONLY creator_public=true rows and enriches featured items, gating each
-- featured resource on ITS OWN visibility='public' (a private resource can never
-- leak onto a public page).
--
-- Idempotent: safe to re-apply.

-- ── Columns on users.profiles ────────────────────────────────────────────────
alter table users.profiles
  add column if not exists creator_handle        text,
  add column if not exists creator_public        boolean not null default false,
  add column if not exists creator_tagline       text,
  add column if not exists creator_bio           text,
  add column if not exists creator_links         jsonb   not null default '[]'::jsonb,
  add column if not exists creator_featured       jsonb   not null default '[]'::jsonb,
  add column if not exists creator_published_at   timestamptz;

-- One handle, globally unique (case-insensitive), among live profiles.
create unique index if not exists profiles_creator_handle_key
  on users.profiles (lower(creator_handle))
  where creator_handle is not null and deleted_at is null;

-- Fast anon lookup of a live creator page by handle.
create index if not exists profiles_creator_public_idx
  on users.profiles (lower(creator_handle))
  where creator_public = true and deleted_at is null;

-- ── Handle validation helper ─────────────────────────────────────────────────
-- Canonical rules in ONE place: 3-30 chars, [a-z0-9_-], starts alphanumeric,
-- not a reserved word. Returns the normalized handle or raises.
create or replace function public.creator_normalize_handle(p_handle text)
returns text
language plpgsql immutable
as $$
declare
  v text := lower(btrim(coalesce(p_handle, '')));
begin
  if v !~ '^[a-z0-9][a-z0-9_-]{2,29}$' then
    raise exception 'Invalid handle: 3-30 chars, letters/numbers/dash/underscore, must start with a letter or number'
      using errcode = '22023';
  end if;
  if v = any (array[
    'admin','api','app','manage','education','creator','creators','support','help',
    'about','login','logout','signup','sign-up','signin','sign-in','settings',
    'dashboard','www','root','matrx','aimatrx','new','edit','delete','c','p','s',
    'pricing','contact','legal','privacy','terms','static','public','assets','null','undefined'
  ]) then
    raise exception 'That handle is reserved' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ── creator_get_mine (authenticated) ─────────────────────────────────────────
-- The caller's own creator fields, or null if no profile row.
create or replace function public.creator_get_mine()
returns jsonb
language plpgsql security definer set search_path = public, users
as $$
declare
  v_uid uuid := auth.uid();
  v jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'handle', p.creator_handle,
    'is_public', p.creator_public,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'tagline', p.creator_tagline,
    'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb),
    'featured', coalesce(p.creator_featured, '[]'::jsonb),
    'published_at', p.creator_published_at
  ) into v
  from users.profiles p
  where p.id = v_uid and p.deleted_at is null;
  return v; -- null when the caller has no profile row yet
end;
$$;

-- ── creator_handle_available (authenticated) ─────────────────────────────────
-- true when the (valid, unreserved) handle is free — or already owned by the
-- caller (so they can "keep" their own). Raises on an invalid/reserved handle.
create or replace function public.creator_handle_available(p_handle text)
returns boolean
language plpgsql security definer set search_path = public, users
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.id into v_owner
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null
  limit 1;
  return v_owner is null or v_owner = v_uid;
end;
$$;

-- ── creator_claim_handle (authenticated) ─────────────────────────────────────
-- Opt in as a creator: claim a unique handle onto the caller's own profile,
-- creating the profile row if it doesn't exist yet. Returns creator_get_mine().
create or replace function public.creator_claim_handle(
  p_handle       text,
  p_display_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public, users
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_taken uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_taken
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null and p.id <> v_uid
  limit 1;
  if v_taken is not null then
    raise exception 'That handle is already taken' using errcode = '23505';
  end if;

  insert into users.profiles (id, display_name, creator_handle)
  values (v_uid, coalesce(nullif(btrim(p_display_name), ''), 'Creator'), v_handle)
  on conflict (id) do update set
    creator_handle = v_handle,
    display_name = coalesce(nullif(btrim(p_display_name), ''), users.profiles.display_name),
    updated_at = now();

  return public.creator_get_mine();
end;
$$;

-- ── creator_update_profile (authenticated) ───────────────────────────────────
-- Update the caller's creator identity + featured content. NULL args are left
-- unchanged (partial patch). Returns creator_get_mine().
create or replace function public.creator_update_profile(
  p_display_name text  default null,
  p_tagline      text  default null,
  p_bio          text  default null,
  p_avatar_url   text  default null,
  p_links        jsonb default null,
  p_featured     jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = public, users
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be a JSON array' using errcode = '22023';
  end if;
  if p_featured is not null and jsonb_typeof(p_featured) <> 'array' then
    raise exception 'featured must be a JSON array' using errcode = '22023';
  end if;

  update users.profiles set
    display_name    = coalesce(nullif(btrim(p_display_name), ''), display_name),
    creator_tagline = coalesce(p_tagline, creator_tagline),
    creator_bio     = coalesce(p_bio, creator_bio),
    avatar_url      = coalesce(nullif(btrim(p_avatar_url), ''), avatar_url),
    creator_links   = coalesce(p_links, creator_links),
    creator_featured = coalesce(p_featured, creator_featured),
    updated_at = now()
  where id = v_uid and deleted_at is null;

  if not found then
    raise exception 'No profile to update — claim a handle first' using errcode = 'P0002';
  end if;
  return public.creator_get_mine();
end;
$$;

-- ── creator_set_public (authenticated) ───────────────────────────────────────
-- Publish / unpublish the landing page. Requires a claimed handle.
create or replace function public.creator_set_public(p_public boolean)
returns jsonb
language plpgsql security definer set search_path = public, users
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update users.profiles set
    creator_public = coalesce(p_public, false),
    creator_published_at = case when coalesce(p_public, false)
      then coalesce(creator_published_at, now()) else creator_published_at end,
    updated_at = now()
  where id = v_uid and deleted_at is null and creator_handle is not null;
  if not found then
    raise exception 'Claim a handle before publishing your page' using errcode = 'P0002';
  end if;
  return public.creator_get_mine();
end;
$$;

-- ── creator_resolve_featured_resource (internal helper) ──────────────────────
-- Given an entity token + id, return safe public-page metadata IFF the resource
-- is visibility='public'. Never leaks a private resource. Returns null otherwise.
create or replace function public.creator_resolve_featured_resource(p_token text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, platform, education
as $$
declare
  v_schema text;
  v_table text;
  v_id_col text;
  v_row jsonb;
  v_title text;
  v_desc text;
  v_href text;
  v_extra jsonb := '{}'::jsonb;
  v_count int;
begin
  begin
    select schema_name, table_name, id_column
      into v_schema, v_table, v_id_col
    from public.resolve_shareable_resource(p_token);
  exception when others then
    return null;
  end;
  if v_table is null then return null; end if;

  begin
    execute format('select to_jsonb(t) from %I.%I t where %I = $1',
                   v_schema, v_table, coalesce(v_id_col, 'id'))
      into v_row using p_id;
  exception when others then
    return null;
  end;
  if v_row is null then return null; end if;

  -- Gate on the resource's own public visibility.
  if coalesce(v_row->>'visibility', '') <> 'public' then
    return null;
  end if;

  v_title := coalesce(v_row->>'name', v_row->>'title', v_row->>'label', 'Untitled');
  v_desc  := coalesce(v_row->>'description', v_row->>'summary', v_row->>'tagline');

  -- Route each type to the surface an anonymous visitor can actually use.
  if p_token = 'learn_doc' then
    v_href := '/education/learn/' || coalesce(v_row->>'slug', '');
  elsif p_token = 'study_media' then
    v_href := '/education/media/' || p_id::text;
  else
    v_href := '/p/e/' || p_token || '/' || p_id::text; -- fc_set, note, content_template
  end if;

  -- fc_set: best-effort card count for the card meta line. Cards attach to a set
  -- via platform.associations (source=fc_card → target=fc_set, role='member').
  if p_token = 'fc_set' then
    begin
      execute 'select count(*)::int from platform.associations a
                 where a.target_type = ''fc_set'' and a.target_id = $1
                   and a.source_type = ''fc_card'' and a.role = ''member'''
        into v_count using p_id;
      if v_count is not null then v_extra := jsonb_build_object('cardCount', v_count); end if;
    exception when others then
      v_extra := '{}'::jsonb;
    end;
  end if;

  return jsonb_build_object(
    'kind', 'resource',
    'resourceType', p_token,
    'id', p_id,
    'title', v_title,
    'description', v_desc,
    'href', v_href,
    'extra', v_extra
  );
end;
$$;

-- ── creator_public_page (anon + authenticated) ───────────────────────────────
-- The one anon-safe read powering /c/<handle>. Returns null for an unknown /
-- unpublished handle (→ notFound). Enriches featured items; drops any featured
-- resource that is not public.
create or replace function public.creator_public_page(p_handle text)
returns jsonb
language plpgsql security definer set search_path = public, users
as $$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  p record;
  v_item jsonb;
  v_kind text;
  v_out jsonb;
  v_featured jsonb := '[]'::jsonb;
  v_enriched jsonb;
begin
  if v_handle = '' then return null; end if;

  select id, creator_handle, display_name, avatar_url, creator_tagline,
         creator_bio, creator_links, creator_featured, creator_published_at, updated_at
    into p
  from users.profiles
  where lower(creator_handle) = v_handle
    and creator_public = true
    and deleted_at is null
  limit 1;

  if p.id is null then return null; end if;

  -- Walk the ordered featured array, enriching each item.
  for v_item in select * from jsonb_array_elements(coalesce(p.creator_featured, '[]'::jsonb))
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'youtube' then
      if coalesce(v_item->>'videoId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'youtube',
          'videoId', v_item->>'videoId',
          'title', v_item->>'title'
        ));
      end if;
    elsif v_kind = 'class' then
      -- Classes are scopes owned by the other agent's contract; pass stored data
      -- through (title/accessMode/price) so the enroll CTA can render + call
      -- edu_class_join when it lands.
      if coalesce(v_item->>'classId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'class',
          'classId', v_item->>'classId',
          'title', coalesce(v_item->>'title', 'Class'),
          'description', v_item->>'description',
          'accessMode', coalesce(v_item->>'accessMode', 'open'),
          'price', v_item->'price'
        ));
      end if;
    elsif v_kind = 'resource' then
      v_enriched := public.creator_resolve_featured_resource(
        v_item->>'resourceType',
        (v_item->>'id')::uuid
      );
      if v_enriched is not null then
        v_featured := v_featured || jsonb_build_array(v_enriched);
      end if;
    end if;
  end loop;

  v_out := jsonb_build_object(
    'handle', p.creator_handle,
    'displayName', p.display_name,
    'avatarUrl', p.avatar_url,
    'tagline', p.creator_tagline,
    'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb),
    'featured', v_featured,
    'publishedAt', p.creator_published_at,
    'updatedAt', p.updated_at
  );
  return v_out;
end;
$$;

-- ── creator_public_handles (anon + authenticated) ───────────────────────────
-- Every published creator handle — powers the sitemap. Kept as a public RPC so
-- callers never depend on the `users` schema being PostgREST-exposed.
create or replace function public.creator_public_handles()
returns table(handle text, updated_at timestamptz)
language sql stable security definer set search_path = public, users
as $$
  select creator_handle, updated_at
  from users.profiles
  where creator_public = true and deleted_at is null and creator_handle is not null;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.creator_normalize_handle(text) to authenticated, service_role;
grant execute on function public.creator_public_handles() to anon, authenticated, service_role;
grant execute on function public.creator_get_mine() to authenticated, service_role;
grant execute on function public.creator_handle_available(text) to authenticated, service_role;
grant execute on function public.creator_claim_handle(text, text) to authenticated, service_role;
grant execute on function public.creator_update_profile(text, text, text, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.creator_set_public(boolean) to authenticated, service_role;
grant execute on function public.creator_resolve_featured_resource(text, uuid) to service_role;
grant execute on function public.creator_public_page(text) to anon, authenticated, service_role;
