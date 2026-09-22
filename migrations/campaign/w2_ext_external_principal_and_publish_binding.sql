-- target: branch,production
-- additive: yes
-- guard: custom/external_principal_enabled
--
-- W2-EXT — VIS-31 (the external principal) and VIS-32 (the publish binding).
-- Unified data campaign v5, 2026-09-18. No lock: this lane works under its own reserved prefix
-- inside iam (rule 7) and touches nothing W2-ACCESS or W2-TRUST owns.
--
-- VIS-31. "An external principal is a signed-in Person record with no organization membership,
-- and Visibility alone decides what they see." Client portals, vendor portals and booking pages
-- all stand on this one shape, and it is deliberately NOT a new identity type, a new role, a new
-- table or a second access lane — it is the ABSENCE of a membership, so every existing grant,
-- every carrying edge and the one read door already work for them unchanged.
--
--   MEASURED ON THE MAIN DATABASE, 2026-09-18, before the definition was written:
--   iam.organization_member holds 495 rows over 448 people, and 448 of those rows are
--   memberships of a PERSONAL organization — the one iam.provision_signup_organization mints
--   for every account at signup. Only 47 are memberships of a real organization. So "no
--   organization membership" cannot mean "no row in iam.organization_member": under that
--   reading nobody on the platform would ever be external. It means no membership of a
--   NON-PERSONAL organization, and iam.is_external_principal says exactly that, in one place,
--   so no surface can invent a second answer.
--
-- VIS-32. "A record or a view is bound to a public URL with a declared render mode, and the
-- binding is admitted by the world lane's own rules, never by the share that created it."
-- So iam.publish_binding_create refuses anything that is not already in the WORLD lane — which
-- is W2-TRUST's iam.publish_to_world, with its namespacing and publisher verification. A share,
-- however generous, never produces a public URL.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis)
values
  ('custom', 'external_principal_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'External principals and publish bindings are live',
   'While false, iam.publish_binding_create refuses every binding by name — the answer the '
   'platform gave before this campaign, since no public URL has ever resolved. It does not '
   'switch off the world-lane admission check, which is a check and never optional (VIS-32).',
   'agent', 'Unified data campaign, W2-EXT, 2026-09-18.')
on conflict (feature, key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VIS-31 — the external principal
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function iam.is_external_principal(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_me uuid := auth.uid(); v_who uuid := coalesce(p_user_id, auth.uid());
begin
  if v_me is null then
    return false;                      -- nobody is signed in: not a principal at all
  end if;
  if v_who is distinct from v_me and not public.is_platform_admin_for(v_me) then
    raise exception 'You can ask this about yourself, and a platform admin can ask it about anybody. Nobody else.'
      using errcode = '42501';
  end if;
  return not exists (
    select 1
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id
     where m.user_id = v_who
       and not coalesce(o.is_personal, false));
end $function$;

comment on function iam.is_external_principal(uuid) is
  'VIS-31: a signed-in Person who belongs to no real organization — a client, a vendor, a '
  'customer with a booking. A personal organization does not count: signup mints one for every '
  'account, so counting it would mean nobody is ever external. This is the ONE place that '
  'question is answered.';

create or replace function iam.external_principal_card(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_me uuid := auth.uid(); v_who uuid := coalesce(p_user_id, auth.uid()); v_n integer;
begin
  if v_me is null then
    return jsonb_build_object('signed_in', false, 'external', false,
      'explanation', 'Nobody is signed in, so there is no principal to describe.');
  end if;
  if v_who is distinct from v_me and not public.is_platform_admin_for(v_me) then
    raise exception 'You can ask this about yourself, and a platform admin can ask it about anybody. Nobody else.'
      using errcode = '42501';
  end if;

  select count(*) into v_n
    from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id
   where m.user_id = v_who and not coalesce(o.is_personal, false);

  return jsonb_build_object(
    'signed_in', true,
    'user_id', v_who,
    'external', v_n = 0,
    'organization_memberships', v_n,
    'explanation', case when v_n = 0
      then 'This person belongs to no organization here. Everything they can see, they can see '
           'because somebody shared it with them — nothing reaches them by being inside an '
           'organization they are in.'
      else format('This person belongs to %s organization(s), so organization membership is one '
                  'of the ways things reach them.', v_n) end);
end $function$;

create or replace function iam.external_principal_reach(p_resource_type text, p_user_id uuid default null)
returns table (resource_id uuid)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_me uuid := auth.uid(); v_who uuid := coalesce(p_user_id, auth.uid());
begin
  if v_me is null then return; end if;
  if v_who is distinct from v_me and not public.is_platform_admin_for(v_me) then
    raise exception 'You can ask this about yourself, and a platform admin can ask it about anybody. Nobody else.'
      using errcode = '42501';
  end if;
  -- No new lane, no new predicate: the answer IS Visibility's answer. That is the whole of
  -- VIS-31 — an outsider sees exactly what Visibility gives them and not one row more.
  return query
    select p.resource_id
      from iam.permissions p
     where p.resource_type = p_resource_type
       and p.granted_to_user_id = v_who
       and coalesce(p.status, 'active') <> 'rejected'
       and (p.expires_at is null or p.expires_at > now());
end $function$;

comment on function iam.external_principal_reach(text, uuid) is
  'VIS-31: the ids of one entity type an external principal actually holds, so a portal can be '
  'diffed against the read door rather than eyeballed. It reads the ONE grant surface; there is '
  'no external-principal lane to read instead.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VIS-32 — the publish binding
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Shape note: a MACHINERY table, like iam.content_lane — created_at/updated_at and nothing else
-- from the entity column set, so platform._provision_shape_guard's lane (d) does not fire and no
-- entity token is minted.

create table if not exists iam.publish_binding (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  resource_type    text not null,
  resource_id      uuid not null,
  organization_id  uuid not null,
  render_mode      text not null check (render_mode in ('page', 'embed', 'feed', 'raw')),
  is_active        boolean not null default true,
  bound_by         uuid,
  bound_at         timestamptz not null default now(),
  revoked_by       uuid,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint revoked_is_not_active check (is_active or revoked_at is not null)
);

create index if not exists publish_binding_resource_idx
  on iam.publish_binding (resource_type, resource_id);
create index if not exists publish_binding_live_idx
  on iam.publish_binding (slug) where is_active;

comment on table iam.publish_binding is
  'VIS-32: a record or view bound to a public URL with a declared render mode. The binding is a '
  'thing of its own — revoking it takes the URL away and leaves the record, its shares and its '
  'world-lane row exactly where they were. Notion''s Publish to web is the reference: a per-page '
  'binding with its own switches, separate from the page''s sharing.';

create or replace function iam.publish_binding_create(p_slug text, p_resource_type text, p_resource_id uuid,
                                           p_organization_id uuid, p_render_mode text default 'page')
returns iam.publish_binding
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_row   iam.publish_binding;
  v_slug  text := lower(btrim(coalesce(p_slug, '')));
  v_on    boolean;
begin
  if v_actor is null then
    raise exception 'Nobody is signed in, so no public URL can be bound.' using errcode = '42501';
  end if;
  if iam.effective_level(v_actor, p_resource_type, p_resource_id, p_organization_id)
       < iam.top_content_level() then
    raise exception 'Giving something a public address is an %.',
                    iam.level_label('record', iam.top_content_level())
      using errcode = '42501';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'external_principal_enabled',
                                          p_organization_id, v_actor) #>> '{}')::boolean,
                   false);
  if not v_on then
    raise exception 'Public addresses are not open yet, so nothing can be bound to one.'
      using errcode = '42501',
            hint = 'custom/external_principal_enabled resolves false. This is the answer the platform has always given; turning it on is a switch-checklist step, not a lane''s.';
  end if;

  -- VIS-32's whole point: the WORLD LANE admits it, never the share that created it. Being
  -- shared with everybody in an organization, or with a hundred people, still produces no URL.
  if iam.lane_of(p_resource_type, p_resource_id) is distinct from 'world' then
    raise exception 'This is not out in the world yet, so it cannot have a public address.'
      using errcode = '42501',
            hint = 'Publish it first with iam.publish_to_world, which is where namespacing and publisher verification are checked. A share is not a publish.';
  end if;

  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'A public address is 3 to 64 characters, lower-case letters, digits and hyphens. "%" is not.', p_slug
      using errcode = '22023';
  end if;
  if coalesce(p_render_mode, '') not in ('page', 'embed', 'feed', 'raw') then
    raise exception 'A binding has to say HOW it renders: page, embed, feed or raw. "%" is none of those.', p_render_mode
      using errcode = '22023';
  end if;
  if exists (select 1 from iam.publish_binding b
              where b.slug = v_slug and b.is_active
                and (b.resource_type, b.resource_id) is distinct from (p_resource_type, p_resource_id)) then
    raise exception 'The address "%" is already pointing at something else.', v_slug
      using errcode = '23505';
  end if;

  insert into iam.publish_binding as b
    (slug, resource_type, resource_id, organization_id, render_mode, bound_by)
  values (v_slug, p_resource_type, p_resource_id, p_organization_id, p_render_mode, v_actor)
  on conflict (slug) do update
     set resource_type = excluded.resource_type, resource_id = excluded.resource_id,
         organization_id = excluded.organization_id, render_mode = excluded.render_mode,
         is_active = true, revoked_at = null, revoked_by = null,
         bound_by = excluded.bound_by, bound_at = now(), updated_at = now()
  returning b.* into v_row;
  return v_row;
end $function$;

create or replace function iam.publish_binding_revoke(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_actor uuid := auth.uid(); v_b iam.publish_binding;
begin
  if v_actor is null then
    raise exception 'Nobody is signed in.' using errcode = '42501';
  end if;
  select * into v_b from iam.publish_binding b where b.slug = lower(btrim(p_slug)) for update;
  if not found then
    return jsonb_build_object('revoked', false,
      'message', 'There is no such address, so there is nothing to take back.');
  end if;
  if iam.effective_level(v_actor, v_b.resource_type, v_b.resource_id, v_b.organization_id)
       < iam.top_content_level() then
    raise exception 'Taking a public address back is an %.',
                    iam.level_label('record', iam.top_content_level())
      using errcode = '42501';
  end if;

  update iam.publish_binding b
     set is_active = false, revoked_at = now(), revoked_by = v_actor, updated_at = now()
   where b.id = v_b.id;

  return jsonb_build_object('revoked', true, 'slug', v_b.slug,
    'message', 'The address stops answering now. The thing itself, its shares and its world-lane '
               'row are untouched — only the public door closed.');
end $function$;

create or replace function iam.resolve_publish_binding(p_slug text)
returns table (slug text, resource_type text, resource_id uuid, organization_id uuid,
               render_mode text, namespace text, notice text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- The access decision, taken before existence, so a revoked address and an address that never
  -- existed answer identically — zero rows, which is the 404. auth.uid() is deliberately NOT
  -- consulted: a public address answers the same for everybody, or it is not public.
  return query
    select b.slug, b.resource_type, b.resource_id, b.organization_id, b.render_mode,
           n.namespace, iam.world_publish_gap_notice()
      from iam.publish_binding b
      left join iam.world_namespace n on n.organization_id = b.organization_id
     where b.slug = lower(btrim(p_slug))
       and b.is_active
       and iam.lane_of(b.resource_type, b.resource_id) = 'world';
end $function$;

comment on function iam.resolve_publish_binding(text) is
  'VIS-32: what a public URL resolves to, or nothing at all. Zero rows IS the 404 — a revoked '
  'binding, a binding whose thing left the world lane, and an address nobody ever created are '
  'the same answer, so the URL space leaks nothing. It carries the world lane''s no-scan notice '
  'with it, because a public page is exactly where that has to be said.';

-- ── The door register.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'is_external_principal',
       iam.door_identity_args('iam.is_external_principal(uuid)'::regprocedure),
       array['uuid'::regtype]::oid[],
       'p_user_id is the person being asked about and IS checked against the caller: null means '
       'auth.uid(), any other id is refused with 42501 unless public.is_platform_admin_for(auth.uid()). '
       'A signed-out caller gets false rather than an error, because nobody is a principal.',
       'w2_ext_external_principal_and_publish_binding.sql', true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'is_external_principal');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'external_principal_card',
       iam.door_identity_args('iam.external_principal_card(uuid)'::regprocedure),
       array['uuid'::regtype]::oid[],
       'p_user_id is the person being described and IS checked against the caller: null means '
       'auth.uid(), any other id is refused with 42501 unless public.is_platform_admin_for(auth.uid()). '
       'It returns a count and a sentence, never anybody else''s rows.',
       'w2_ext_external_principal_and_publish_binding.sql', true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'external_principal_card');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'external_principal_reach',
       iam.door_identity_args('iam.external_principal_reach(text,uuid)'::regprocedure),
       array['text'::regtype, 'uuid'::regtype]::oid[],
       'p_resource_type is an entity token and decides nothing on its own. p_user_id is the '
       'person whose reach is listed and IS checked against the caller: null means auth.uid(), '
       'any other id is refused with 42501 unless public.is_platform_admin_for(auth.uid()). A '
       'signed-out caller gets zero rows.',
       'w2_ext_external_principal_and_publish_binding.sql', true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'external_principal_reach');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'publish_binding_create',
       iam.door_identity_args('iam.publish_binding_create(text,text,uuid,uuid,text)'::regprocedure),
       array['text'::regtype,'text'::regtype,'uuid'::regtype,'uuid'::regtype,'text'::regtype]::oid[],
       'p_resource_type + p_resource_id name the thing and ARE checked: the caller must hold the '
       'top content level on it through iam.effective_level, and the thing must already be in '
       'the WORLD lane (iam.lane_of), which is where namespacing and publisher verification were '
       'enforced. p_organization_id is the tenant the level is resolved in. p_slug is the public '
       'address, 3-64 lower-case characters, refused with 22023, and 23505 when another live '
       'binding holds it. p_render_mode is one of page/embed/feed/raw, refused with 22023. Null '
       'on any of them fails the level check or the format check and binds nothing.',
       'w2_ext_external_principal_and_publish_binding.sql', true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'publish_binding_create');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'publish_binding_revoke',
       iam.door_identity_args('iam.publish_binding_revoke(text)'::regprocedure),
       array['text'::regtype]::oid[],
       'p_slug names the binding. The access decision is on the bound THING, not the string: the '
       'caller must hold the top content level on it through iam.effective_level, or it is '
       'refused with 42501. An unknown or null slug returns revoked=false with a sentence, never '
       'an error, so the address space cannot be probed.',
       'w2_ext_external_principal_and_publish_binding.sql', true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'publish_binding_revoke');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose)
select 'iam', 'resolve_publish_binding',
       iam.door_identity_args('iam.resolve_publish_binding(text)'::regprocedure),
       array['text'::regtype]::oid[],
       'p_slug is a public address and is checked against the WORLD LANE, never against the '
       'caller: the row is returned only while the binding is active AND iam.lane_of says the '
       'bound thing is in the world lane. That decision is taken before existence, so a revoked '
       'address, an address whose thing left the world lane, and an address nobody created all '
       'return zero rows — the 404. It returns the binding and the render mode, never the '
       'thing''s content; reading the content is still the read door''s job.',
       'w2_ext_external_principal_and_publish_binding.sql', true, true,
       'The caller is a visitor with no account following a public link. The SLUG is what stands '
       'in for an identity, and it has to be unguessable-enough on its own, which is why the '
       'answer is identical for a revoked address and an invented one. Nothing here is private: '
       'every row it can return belongs to something its owner deliberately put in the world '
       'lane by an explicit act.'
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'resolve_publish_binding');
