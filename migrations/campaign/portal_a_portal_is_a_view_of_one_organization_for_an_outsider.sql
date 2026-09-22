-- target: branch,production
-- additive: yes
--   It ADDS three tables under this lane's reserved prefix (`custom.portal`,
--   `custom.portal_table`, `custom.portal_principal`), eleven new functions under the same
--   prefix, and their door rows. It REPLACES nothing, DROPS nothing, REVOKES nothing and
--   reads no customer document. The inverse is
--   `migrations/inverse/portal_a_portal_is_a_view_of_one_organization_for_an_outsider_down.sql`.
-- guard: custom/system_enabled
--
-- PORTAL — PRODUCTS row 2: *"Let each client sign in and see only their own jobs and
-- invoices."*
--
-- THE ONE IDEA. A Portal is not a query and not a second access system. It is a
-- DECLARATION over one organization that says four things:
--
--   1. WHO the outsiders are — a Table whose records ARE the clients (`client_table_id`).
--   2. WHICH Tables they may see, and on each of them WHICH FIELD NAMES THEM — the
--      "belongs to" relation. That Field's own key is already the role of the
--      `platform.associations` edge the store writes when the record names a client
--      (`custom.record_relation_edges`: *"REL-10: the role IS the field key"*). So the
--      portal does not invent an edge; it says which existing edge CARRIES.
--   3. WHICH FIELDS of those Tables are visible and which are editable.
--   4. HOW the outsider signs in — today, a magic link by email through the platform's
--      own auth. The Portal never holds a password and never mints an identity.
--
-- WHAT IT DELIBERATELY DOES NOT HOLD: a list of records. Visibility answers *"only
-- theirs"* through the ONE ladder — the outsider holds a grant on their own client
-- record (written by `custom.share_grant`, the one share door), and every Job and
-- Invoice naming that client is carried to them by the association the portal declared,
-- exactly as a record inside a record is carried. A job written five minutes from now
-- reaches her with nothing re-run, and a job that stops naming her stops reaching her.
-- There is no per-portal query to write and none to get wrong, so census 13
-- (`custom.list_door_disagreements`) covers a portal principal for free: she goes
-- through `custom.read_records` and `custom.read_record` like everybody else.
--
-- WHY THE TABLES ARE MACHINERY-SHAPED. Each carries at most two of the seven columns
-- `platform._provision_shape_guard` counts (`created_at`, `created_by`), which is under
-- its threshold of three — so they are not entity-shaped, mint no entity token, and need
-- no `@ai-matrx/associations` release to keep `pnpm check:entity-types` green. That is
-- the same judgement, for the same reason, that W2-TRUST made for `iam.publish_binding`
-- and its three siblings. `authenticated` holds no table privilege in schema `custom`
-- (census 7 of `pnpm check:store-doors-decide` keeps it that way), so these tables are
-- reached only through the SECURITY DEFINER doors below.

-- ─────────────────────────────────────────────────────────── 1. the three tables

create table if not exists custom.portal (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references iam.organizations(id),
  title             text not null,
  slug              text not null,
  client_table_id   uuid not null,
  sign_in_method    text not null default 'magic_link',
  is_active         boolean not null default true,
  opened_at         timestamptz,
  closed_at         timestamptz,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint portal_title_said check (length(btrim(title)) >= 2),
  -- The address is a name a person reads out loud, not a secret: the SECRET is the
  -- magic link that signs somebody in. Guessing the slug reaches a sign-in page and
  -- nothing else.
  constraint portal_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint portal_sign_in_method_known check (sign_in_method in ('magic_link')),
  constraint portal_closed_is_not_active check (is_active or closed_at is not null)
);
create unique index if not exists portal_slug_live_idx on custom.portal (slug) where is_active;
create index if not exists portal_organization_idx on custom.portal (organization_id) where is_active;

create table if not exists custom.portal_table (
  id                  uuid primary key default gen_random_uuid(),
  portal_id           uuid not null references custom.portal(id) on delete cascade,
  organization_id     uuid not null references iam.organizations(id),
  table_id            uuid not null,
  -- THE FIELD THAT NAMES THE OUTSIDER, and the role of the association it already writes.
  -- `edge_role` is that Field's key, denormalised so the visibility arms below are one
  -- index probe rather than a walk back through the Field kernel on the hot path.
  names_via_field_id  uuid not null,
  edge_role           text not null,
  visible_field_ids   uuid[] not null default '{}',
  visible_field_keys  jsonb  not null default '[]',
  editable_field_ids  uuid[] not null default '{}',
  editable_field_keys jsonb  not null default '[]',
  comments_allowed    boolean not null default false,
  -- What the declared edge conveys: `viewer` to read, `commenter` to comment, `editor`
  -- when the portal lets the outsider change something. VIS-3 still applies — the
  -- MINIMUM along the path decides — so this is a ceiling, never a grant.
  conveys_max         permission_level not null default 'viewer',
  ord                 integer not null default 0,
  created_at          timestamptz not null default now(),
  constraint portal_table_once unique (portal_id, table_id)
);
create index if not exists portal_table_edge_idx on custom.portal_table (organization_id, edge_role);
create index if not exists portal_table_portal_idx on custom.portal_table (portal_id, ord);

create table if not exists custom.portal_principal (
  id                uuid primary key default gen_random_uuid(),
  portal_id         uuid not null references custom.portal(id) on delete cascade,
  organization_id   uuid not null references iam.organizations(id),
  -- WHICH CLIENT THEY ARE. A row of the portal's client Table — the same record every
  -- Job and Invoice names. This is the whole of "only theirs".
  client_record_id  uuid not null,
  email             text not null,
  -- The auth identity, once one exists. NULL means invited and not yet signed in: the
  -- row is a standing invitation, not access, and holds no grant.
  user_id           uuid references auth.users(id),
  is_active         boolean not null default true,
  invited_by        uuid,
  invited_at        timestamptz not null default now(),
  bound_at          timestamptz,
  revoked_at        timestamptz,
  constraint portal_principal_email_said check (position('@' in email) > 1),
  constraint portal_principal_revoked_is_not_active check (is_active or revoked_at is not null)
);
create unique index if not exists portal_principal_email_idx
  on custom.portal_principal (portal_id, lower(email)) where is_active;
create index if not exists portal_principal_user_idx
  on custom.portal_principal (user_id, organization_id) where is_active;
create index if not exists portal_principal_client_idx
  on custom.portal_principal (client_record_id) where is_active;

-- EVERY FOREIGN KEY GETS A COVERING INDEX, and the partial ones above do not count.
-- `platform._provision_shape_settled` refuses at COMMIT otherwise, and it is right to:
-- without one, deleting an organization sequentially scans these tables. The partial
-- indexes above are the ones the DOORS read (they all filter `is_active`); these are the
-- ones the constraint reads.
create index if not exists portal_org_fk_idx on custom.portal (organization_id);
create index if not exists portal_table_org_fk_idx on custom.portal_table (organization_id);
create index if not exists portal_principal_org_fk_idx on custom.portal_principal (organization_id);
create index if not exists portal_principal_portal_fk_idx on custom.portal_principal (portal_id);
create index if not exists portal_principal_user_fk_idx on custom.portal_principal (user_id);

comment on table custom.portal is
  'PRODUCTS row 2 / VIS-31. One organization''s portal for outsiders: which Tables it exposes, which Field on each names the outsider, and how they sign in. It holds no list of records - Visibility answers "only theirs" through the one ladder.';
comment on table custom.portal_table is
  'One Table a portal exposes, the Field on it that names the outsider (whose key is the association role that carries), and which of its fields are visible and editable.';
comment on table custom.portal_principal is
  'One outsider of one portal: which client record they are, their email, and their auth identity once they have signed in. A row with no user_id is an invitation, not access.';

-- ────────────────────────────────────────────────── 2. is this person an outsider here

create or replace function custom.portal_admits(p_organization_id uuid, p_user_id uuid default null)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  -- ONE SENTENCE, ONE PLACE. VIS-31 says an external principal is a signed-in person with
  -- no membership of a non-personal organization and that Visibility alone decides what
  -- they see. This asks the narrower question the doors need: is this person an outsider
  -- THIS organization has deliberately let in, through a live portal, right now.
  --
  -- The knob is read here and not at each call site, so no surface can invent a second
  -- answer. While `custom/external_principal_enabled` resolves false for an organization
  -- this returns false for everybody in it and every door refuses by name, which is
  -- exactly the answer the platform gave before this file.
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and exists (
           select 1
             from custom.portal_principal pp
             join custom.portal p on p.id = pp.portal_id and p.is_active
            where pp.organization_id = p_organization_id
              and pp.user_id = coalesce(p_user_id, (select auth.uid()))
              and pp.user_id is not null
              and pp.is_active);
$function$;

comment on function custom.portal_admits(uuid, uuid) is
  'True when this signed-in person is a live portal principal of this organization AND that organization has opened the external-principal lane. The one sentence every door asks.';

-- ─────────────────────────────────────────── 3. the helpers the declaring door leans on

create or replace function custom.portal_slug(p_organization_id uuid, p_title text, p_portal_id uuid default null)
returns text
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_base text;
  v_try  text;
  v_n    integer := 1;
begin
  v_base := lower(regexp_replace(coalesce(p_title, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := btrim(regexp_replace(v_base, '-+', '-', 'g'), '-');
  if length(v_base) < 3 then v_base := 'portal-' || v_base; end if;
  v_base := left(btrim(v_base, '-'), 48);
  v_try := v_base;
  while exists (select 1 from custom.portal p
                 where p.slug = v_try and p.is_active
                   and (p_portal_id is null or p.id is distinct from p_portal_id)) loop
    v_n := v_n + 1;
    v_try := left(v_base, 48) || '-' || v_n::text;
  end loop;
  return v_try;
end $function$;

create or replace function custom.portal_field_map(p_organization_id uuid, p_table_id uuid)
returns table(field_id uuid, field_key text, field_type text, points_at uuid)
language sql
stable security definer
set search_path to ''
as $function$
  -- Every declared Field of one Table, with what a relation Field points at. Read from
  -- the Field kernel, which is where a Field lives (REC-27) - never from a cache.
  select f.id,
         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
         f.data ->> 'type',
         nullif(f.data -> 'config' ->> 'entity_definition_id', '')::uuid
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id;
$function$;

-- ───────────────────────────────────────────────────────────── 4. the declaring door

create or replace function custom.portal_declare(
  p_organization_id uuid,
  p_title           text,
  p_client_table_id uuid,
  p_tables          jsonb,
  p_portal_id       uuid default null,
  p_slug            text default null,
  p_sign_in_method  text default 'magic_link')
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_id       uuid;
  v_slug     text;
  v_spec     jsonb;
  v_table    uuid;
  v_names    text;
  v_field    record;
  v_vis_ids  uuid[];
  v_edit_ids uuid[];
  v_vis_keys jsonb;
  v_ed_keys  jsonb;
  v_key      text;
  v_conveys  public.permission_level;
  v_comments boolean;
  v_ord      integer := 0;
  v_n        integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_declare');

  if p_organization_id is null or coalesce(btrim(p_title), '') = '' or p_client_table_id is null then
    raise exception 'A portal needs the organization it belongs to, a title, and the Table whose records are the clients.'
      using errcode = '22004';
  end if;
  if coalesce(p_sign_in_method, '') <> 'magic_link' then
    raise exception 'The only way into a portal today is a magic link by email, and "%" is not that.', p_sign_in_method
      using errcode = '22023',
            hint = 'The portal never holds a password: it asks the platform''s own auth to email a one-time link. A second sign-in method is a real feature, not a value this door will take.';
  end if;
  if jsonb_typeof(p_tables) is distinct from 'array' or jsonb_array_length(p_tables) = 0 then
    raise exception 'A portal that exposes no Table would show its clients an empty page, so this door does not make one.'
      using errcode = '22004',
            hint = 'Send tables as [{"table_id": …, "names_via": "<the field key that names the client>", "visible_fields": [...], "editable_fields": [...], "comments": false}].';
  end if;

  -- THE ONE LADDER, at the rung whose definition is "may decide who else sees it". A
  -- portal hands records of these Tables to people outside the organization, so the rung
  -- is `admin` on the CLIENT Table and on every Table exposed - the same question
  -- `custom.share_grant` asks before it shares one record.
  perform custom.assert_client_may_change(p_organization_id, p_client_table_id,
            'custom.portal_declare', 'admin'::public.permission_level, 'table');

  if p_portal_id is not null then
    select p.id into v_id from custom.portal p
     where p.id = p_portal_id and p.organization_id = p_organization_id;
    if v_id is null then
      raise exception 'There is no such portal in this organization.' using errcode = '02000';
    end if;
  end if;

  v_slug := coalesce(nullif(btrim(lower(coalesce(p_slug, ''))), ''),
                     custom.portal_slug(p_organization_id, p_title, p_portal_id));

  if v_id is null then
    insert into custom.portal (organization_id, title, slug, client_table_id, sign_in_method,
                               opened_at, created_by)
    values (p_organization_id, btrim(p_title), v_slug, p_client_table_id, 'magic_link',
            now(), custom.query_principal())
    returning id into v_id;
  else
    update custom.portal
       set title = btrim(p_title), slug = v_slug, client_table_id = p_client_table_id,
           is_active = true, closed_at = null
     where id = v_id;
    -- RE-STATING a portal replaces what it exposes, so a Table dropped from the
    -- declaration stops being exposed in the same act. The principals are untouched:
    -- who is invited is not part of what the portal shows.
    delete from custom.portal_table where portal_id = v_id;
  end if;

  for v_spec in select value from jsonb_array_elements(p_tables) loop
    v_ord := v_ord + 1;
    v_table := nullif(v_spec ->> 'table_id', '')::uuid;
    v_names := nullif(btrim(coalesce(v_spec ->> 'names_via', '')), '');
    if v_table is null or v_names is null then
      raise exception 'Every Table a portal exposes has to say which Field on it names the client.'
        using errcode = '22004',
              hint = 'Each entry needs table_id and names_via. names_via is the key of the relation Field that points at the client Table - it is what makes "only theirs" answerable.';
    end if;
    perform custom.assert_client_may_change(p_organization_id, v_table,
              'custom.portal_declare', 'admin'::public.permission_level, 'table');

    select fm.field_id, fm.field_key, fm.field_type, fm.points_at
      into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm
     where fm.field_key = v_names;
    if v_field.field_id is null then
      raise exception 'That Table has no field called "%", so a portal over it cannot say who a record belongs to.', v_names
        using errcode = '42703',
              hint = format('Its fields are %s.',
                            coalesce((select string_agg(fm.field_key, ', ' order by fm.field_key)
                                        from custom.portal_field_map(p_organization_id, v_table) fm), '(none)'));
    end if;
    if v_field.field_type is distinct from 'relation' then
      raise exception 'The field "%" is a % field, and a portal needs a relation - the "belongs to" link that points at the client.', v_names, v_field.field_type
        using errcode = '22023',
              hint = 'REL-10: a relation Field''s key IS the role of the association the store writes, and that association is what carries the record to the client. A text field holding a name carries nothing, so it could never answer "only theirs" without a second query - which is the thing this design exists to avoid.';
    end if;
    if v_field.points_at is distinct from p_client_table_id then
      raise exception 'The field "%" points at a different Table from the one whose records are the clients, so it does not say who this record belongs to.', v_names
        using errcode = '22023',
              hint = 'Point names_via at the relation Field that links this Table to the client Table, or make the client Table the one that Field already points at.';
    end if;

    -- THE FIELDS. Nothing given means every field of that Table is visible and none is
    -- editable - the honest default for a portal, and the one a person describing
    -- "let them see their jobs" means.
    select coalesce(array_agg(fm.field_id order by fm.field_key), '{}'),
           coalesce(jsonb_agg(fm.field_key order by fm.field_key), '[]')
      into v_vis_ids, v_vis_keys
      from custom.portal_field_map(p_organization_id, v_table) fm
     where jsonb_typeof(v_spec -> 'visible_fields') is distinct from 'array'
        or jsonb_array_length(coalesce(v_spec -> 'visible_fields', '[]')) = 0
        or fm.field_key in (select jsonb_array_elements_text(v_spec -> 'visible_fields'));

    v_edit_ids := '{}'; v_ed_keys := '[]';
    if jsonb_typeof(v_spec -> 'editable_fields') = 'array' then
      for v_key in select jsonb_array_elements_text(v_spec -> 'editable_fields') loop
        if not exists (select 1 from custom.portal_field_map(p_organization_id, v_table) fm
                        where fm.field_key = v_key) then
          raise exception 'That Table has no field called "%", so a portal cannot let a client edit it.', v_key
            using errcode = '42703';
        end if;
        if not (v_key = any (select jsonb_array_elements_text(v_vis_keys))) then
          raise exception 'The field "%" is editable in this portal but not visible in it, which is a screen that cannot exist.', v_key
            using errcode = '22023',
                  hint = 'Add it to visible_fields as well, or take it out of editable_fields. Nothing was written.';
        end if;
        select fm.field_id into v_field from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_key;
        v_edit_ids := v_edit_ids || v_field.field_id;
        v_ed_keys := v_ed_keys || to_jsonb(v_key);
      end loop;
    end if;

    v_comments := coalesce((v_spec ->> 'comments')::boolean, false);
    v_conveys := case
                   when coalesce(array_length(v_edit_ids, 1), 0) > 0 then 'editor'::public.permission_level
                   when v_comments then 'commenter'::public.permission_level
                   else 'viewer'::public.permission_level
                 end;

    select fm.field_id into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_names;

    insert into custom.portal_table (portal_id, organization_id, table_id, names_via_field_id,
                                     edge_role, visible_field_ids, visible_field_keys,
                                     editable_field_ids, editable_field_keys, comments_allowed,
                                     conveys_max, ord)
    values (v_id, p_organization_id, v_table, v_field.field_id, v_names,
            v_vis_ids, v_vis_keys, v_edit_ids, v_ed_keys, v_comments, v_conveys, v_ord);
    v_n := v_n + 1;
  end loop;

  -- THE ORGANIZATION OPENS ITS OWN EXTERNAL LANE, AND THAT ACT IS THIS ONE.
  -- W2-TRUST's ruling stands: the world-lane admission CHECKS are not switchable, and the
  -- knob holds the LANE closed, not a check. Declaring a portal IS the explicit act VIS-N-5
  -- asks for - an organization admin saying, on the record, that outsiders may sign in
  -- here. It is written as an organization override so the platform default stays false
  -- and every other organization is untouched.
  perform platform.knob_override_set(
    'custom', 'external_principal_enabled', 'organization', p_organization_id, p_organization_id,
    'true'::jsonb,
    format('Opened by custom.portal_declare for the portal "%s".', btrim(p_title)));

  return v_id;
end $function$;

-- ─────────────────────────────────────────────────────── 5. the owner's reading doors

create or replace function custom.portals(p_organization_id uuid)
returns table(portal_id uuid, title text, slug text, client_table_id uuid, client_table text,
              is_active boolean, tables integer, invited integer, signed_in integer,
              sign_in_method text, opened_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portals');
  return query
    select p.id, p.title, p.slug, p.client_table_id,
           coalesce(nullif(t.data ->> 'name', ''), 'a table'),
           p.is_active,
           (select count(*)::integer from custom.portal_table pt where pt.portal_id = p.id),
           (select count(*)::integer from custom.portal_principal pp
             where pp.portal_id = p.id and pp.is_active),
           (select count(*)::integer from custom.portal_principal pp
             where pp.portal_id = p.id and pp.is_active and pp.user_id is not null),
           p.sign_in_method, p.opened_at
      from custom.portal p
      left join custom.record t
        on t.organization_id = p.organization_id and t.id = p.client_table_id
     where p.organization_id = p_organization_id
       -- A portal is a way IN to the Tables it exposes, so a person who cannot open the
       -- client Table is not told the portal exists. The list never reveals a Table.
       and custom.has_visibility(custom.query_principal(), 'record', p.client_table_id, 'viewer'::public.permission_level)
     order by p.is_active desc, p.opened_at desc nulls last;
end $function$;

create or replace function custom.portal_card(p_organization_id uuid, p_portal_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_card');
  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_p.client_table_id,
            'custom.portal_card', 'admin'::public.permission_level, 'table');

  return jsonb_build_object(
    'portal_id', v_p.id,
    'title', v_p.title,
    'slug', v_p.slug,
    'is_active', v_p.is_active,
    'sign_in_method', v_p.sign_in_method,
    'client_table_id', v_p.client_table_id,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table_id', pt.table_id,
               'name', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
               'names_via', pt.edge_role,
               'visible_fields', pt.visible_field_keys,
               'editable_fields', pt.editable_field_keys,
               'comments', pt.comments_allowed,
               'conveys', pt.conveys_max::text) order by pt.ord)
        from custom.portal_table pt
        left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
       where pt.portal_id = v_p.id), '[]'::jsonb),
    'principals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'principal_id', pp.id,
               'email', pp.email,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(pp.organization_id, pp.client_record_id), pp.client_record_id::text),
               'signed_in', pp.user_id is not null,
               'is_active', pp.is_active,
               'invited_at', pp.invited_at,
               'revoked_at', pp.revoked_at) order by pp.invited_at)
        from custom.portal_principal pp
       where pp.portal_id = v_p.id), '[]'::jsonb),
    'external_lane_open', coalesce(
      (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false));
end $function$;

-- One record's title, said once, because four things below want it and a portal that
-- named a client by uuid would be a screen nobody can read.
create or replace function custom.portal_record_title(p_organization_id uuid, p_record_id uuid)
returns text
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(nullif(r.data ->> (t.data ->> 'title_field'), ''),
                  nullif(r.data ->> 'name', ''),
                  nullif(r.data ->> 'title', ''))
    from custom.record r
    left join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
$function$;

-- ─────────────────────────────────────────────────── 6. invite, bind, revoke

create or replace function custom.portal_invite(
  p_organization_id uuid,
  p_portal_id       uuid,
  p_client_record_id uuid,
  p_email           text,
  p_user_id         uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_p    custom.portal;
  v_pp   custom.portal_principal;
  v_id   uuid;
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_invite');

  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  if not v_p.is_active then
    raise exception 'That portal is closed, so nobody new can be invited into it.'
      using errcode = '42501', hint = 'Re-open it with custom.portal_declare before inviting anyone.';
  end if;
  if position('@' in v_mail) < 2 then
    raise exception 'An invitation needs an email address to send the sign-in link to.'
      using errcode = '22004';
  end if;

  -- The same rung the portal was declared at. Letting one more outsider in is the same
  -- kind of act as letting the first one in.
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_invite', 'admin'::public.permission_level, 'table');

  -- THE CLIENT RECORD IS THE WHOLE OF "ONLY THEIRS", so it has to be one, and it has to
  -- be in the portal's own client Table. A principal pointed at the wrong Table would
  -- carry whatever THAT record carries, which is the leak this check exists to stop.
  if not exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id
                    and r.id = p_client_record_id
                    and r.table_id = v_p.client_table_id
                    and r.deleted_at is null) then
    raise exception 'That record is not one of this portal''s clients, so nobody can be invited as it.'
      using errcode = '02000',
            hint = 'A portal principal IS a record of the portal''s client Table. Pick the client''s own row.';
  end if;

  select * into v_pp from custom.portal_principal
   where portal_id = v_p.id and lower(email) = v_mail and is_active;
  if found then
    v_id := v_pp.id;
    update custom.portal_principal
       set client_record_id = p_client_record_id,
           user_id = coalesce(p_user_id, user_id)
     where id = v_id;
  else
    insert into custom.portal_principal (portal_id, organization_id, client_record_id, email,
                                         user_id, invited_by)
    values (v_p.id, p_organization_id, p_client_record_id, v_mail, p_user_id, custom.query_principal())
    returning id into v_id;
  end if;

  if p_user_id is not null then
    perform custom.portal_principal_bind(p_organization_id, v_id, p_user_id);
  end if;

  select * into v_pp from custom.portal_principal where id = v_id;
  return jsonb_build_object(
    'invited', true,
    'principal_id', v_id,
    'portal_id', v_p.id,
    'slug', v_p.slug,
    'email', v_mail,
    'client_record_id', p_client_record_id,
    'client', coalesce(custom.portal_record_title(p_organization_id, p_client_record_id), p_client_record_id::text),
    'bound', v_pp.user_id is not null,
    'say', case when v_pp.user_id is not null
                then format('%s can sign in to "%s" and will see their own records and nothing else.', v_mail, v_p.title)
                else format('%s is invited to "%s". They get access the moment they follow the sign-in link and the platform gives them an identity - until then this row holds nothing.', v_mail, v_p.title) end);
end $function$;

create or replace function custom.portal_principal_bind(
  p_organization_id uuid, p_principal_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
  v_lv public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_principal_bind');
  if p_user_id is null then
    raise exception 'Binding a portal principal needs the identity the platform''s auth gave them.'
      using errcode = '22004';
  end if;

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal principal in this organization.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;

  -- WHO MAY BIND. The organization admin who invited them, or the server lane that has
  -- just watched the platform's auth create the identity for that exact address. A
  -- signed-in person cannot bind an identity that is not their own invitation.
  if not custom.query_is_store_owner() then
    if custom.query_principal() = p_user_id then
      null;  -- the outsider arriving on their own link
    else
      perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
                'custom.portal_principal_bind', 'admin'::public.permission_level, 'table');
    end if;
  end if;

  if not v_pp.is_active or not v_p.is_active then
    raise exception 'That invitation has been withdrawn, so it cannot be used to sign in.'
      using errcode = '42501';
  end if;

  update custom.portal_principal
     set user_id = p_user_id, bound_at = coalesce(bound_at, now())
   where id = v_pp.id;

  -- THE ONE GRANT, THROUGH THE ONE SHARE DOOR. This is the only access a portal ever
  -- writes: the outsider holds their own client record, and the association the portal
  -- declared carries every record that names it. Nothing here touches a Job or an
  -- Invoice, and nothing has to be re-run when one is written.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom.share_grant(p_organization_id, v_pp.client_record_id, 'person', p_user_id,
                             coalesce(v_lv, 'viewer'::public.permission_level));

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$;

create or replace function custom.portal_revoke(
  p_organization_id uuid, p_portal_id uuid, p_principal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_revoke');

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and portal_id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such person in this portal.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = p_portal_id;
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_revoke', 'admin'::public.permission_level, 'table');

  update custom.portal_principal
     set is_active = false, revoked_at = now()
   where id = v_pp.id;

  -- REVOKING TAKES THE GRANT AWAY, not just the row. A row that said "revoked" beside a
  -- grant that still read is the exact shape W2-TRUST's clause 8 was written about: a
  -- screen showing access as gone while the read path still answers.
  if v_pp.user_id is not null then
    perform custom.share_revoke(p_organization_id, v_pp.client_record_id, 'person', v_pp.user_id);
  end if;

  return jsonb_build_object(
    'revoked', true,
    'principal_id', v_pp.id,
    'email', v_pp.email,
    'say', format('%s can no longer sign in to "%s", and the records that named their client no longer reach them.',
                  v_pp.email, v_p.title));
end $function$;

-- ───────────────────────────────────────────────── 7. what the outsider's screen reads

create or replace function custom.portal_me()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid := custom.query_principal();
begin
  -- The outsider's own standing, and NOTHING about anybody else's. It answers what the
  -- portal DECLARED - which Tables, which fields - and not one record: the records come
  -- back through `custom.read_records` like everybody else's, so there is one read path
  -- on this platform and a portal is not a second one.
  if v_me is null then
    return jsonb_build_object('signed_in', false, 'portals', '[]'::jsonb,
      'explanation', 'Nobody is signed in, so there is no portal to show.');
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'user_id', v_me,
    'external', iam.is_external_principal(v_me),
    'portals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'portal_id', p.id,
               'title', p.title,
               'slug', p.slug,
               'organization_id', p.organization_id,
               'organization', o.name,
               'principal_id', pp.id,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(p.organization_id, pp.client_record_id), 'your records'),
               'tables', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'table_id', pt.table_id,
                          'name', coalesce(nullif(t.data ->> 'name', ''), 'Records'),
                          'visible_fields', pt.visible_field_keys,
                          'editable_fields', pt.editable_field_keys,
                          'comments', pt.comments_allowed) order by pt.ord)
                   from custom.portal_table pt
                   left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
                  where pt.portal_id = p.id), '[]'::jsonb))
             order by p.title)
        from custom.portal_principal pp
        join custom.portal p on p.id = pp.portal_id and p.is_active
        join iam.organizations o on o.id = p.organization_id
       where pp.user_id = v_me and pp.is_active
         and coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p.organization_id) #>> '{}')::boolean, false)),
      '[]'::jsonb));
end $function$;

create or replace function custom.portal_public(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_p custom.portal;
  v_o text;
begin
  -- THE SIGN-IN PAGE, AND NOTHING ELSE. It answers the portal's own words so a person
  -- following a link knows whose portal they have reached - and reads no record, no
  -- count and no id of anything inside it. A slug that does not exist, one that is
  -- closed, and one whose organization has not opened the external lane all answer the
  -- same NULL, which is the 404: the address cannot be used to learn that anything is
  -- there. `iam.resolve_publish_binding`'s own precedent.
  select * into v_p from custom.portal where slug = lower(btrim(coalesce(p_slug, ''))) and is_active;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;
  return jsonb_build_object(
    'portal_id', v_p.id,
    'slug', v_p.slug,
    'title', v_p.title,
    'organization', v_o,
    'sign_in_method', v_p.sign_in_method,
    'state', 'open');
end $function$;

-- WHO IS INVITED UNDER THIS ADDRESS, asked by the server lane alone, so a sign-in link
-- can be sent to an address that was actually invited and to no other. It answers the
-- principal id and nothing about the client, the records or the organization's people.
create or replace function custom.portal_invitation(p_slug text, p_email text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_p  custom.portal;
  v_pp custom.portal_principal;
begin
  if not custom.query_is_store_owner() and custom.query_principal() is not null then
    raise exception 'This door is the server''s, not a person''s: it says whether an address was invited, and a signed-in person asking that about somebody else is a way to test addresses.'
      using errcode = '42501';
  end if;
  select * into v_p from custom.portal where slug = lower(btrim(coalesce(p_slug, ''))) and is_active;
  if not found then return null; end if;
  select * into v_pp from custom.portal_principal
   where portal_id = v_p.id and lower(email) = lower(btrim(coalesce(p_email, ''))) and is_active;
  if not found then return null; end if;
  return jsonb_build_object(
    'principal_id', v_pp.id,
    'portal_id', v_p.id,
    'organization_id', v_p.organization_id,
    'email', v_pp.email,
    'bound', v_pp.user_id is not null);
end $function$;

-- ──────────────────────────────────────────── 8. what this client sees, asked honestly

create or replace function custom.portal_preview(
  p_organization_id uuid, p_portal_id uuid, p_principal_id uuid, p_table_id uuid)
returns table(record_id uuid, title text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
  v_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_preview');
  select * into v_pp from custom.portal_principal
   where id = p_principal_id and portal_id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such person in this portal.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = p_portal_id;
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_preview', 'admin'::public.permission_level, 'table');
  if not exists (select 1 from custom.portal_table pt
                  where pt.portal_id = p_portal_id and pt.table_id = p_table_id) then
    raise exception 'This portal does not show that Table, so there is nothing to preview.'
      using errcode = '02000';
  end if;
  if v_pp.user_id is null then
    -- NOTHING FAILS SILENTLY. An empty list here would read as "she sees nothing" when
    -- the truth is she has not signed in yet and holds nothing at all.
    raise exception 'This client has not signed in yet, so there is nothing for them to see.'
      using errcode = '02000',
            hint = 'A portal principal holds access from the moment they follow the sign-in link. Until then the invitation is a standing offer and confers nothing - which is why this preview refuses rather than showing an empty page.';
  end if;

  -- IT ASKS THE SAME LADDER, ABOUT HER. Not a copy of the rule and not a portal-shaped
  -- query: `custom.visible_set` for her user id, which is the exact call
  -- `custom.read_records` makes when SHE opens the page. "View as this client" cannot
  -- disagree with what she sees, because it is the same answer.
  for v_id in
    select unnest(coalesce(vs.o_granted_visible, '{}') || coalesce(vs.o_carried_visible, '{}'))
      from custom.visible_set(v_pp.user_id, p_organization_id, p_table_id, 'viewer'::public.permission_level) vs
  loop
    record_id := v_id;
    title := coalesce(custom.portal_record_title(p_organization_id, v_id), v_id::text);
    return next;
  end loop;
end $function$;

-- ───────────────────────────────────────────────────────────────── 9. the door rows

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'portal_declare',
   'p_organization_id uuid, p_title text, p_client_table_id uuid, p_tables jsonb, p_portal_id uuid, p_slug text, p_sign_in_method text',
   array['uuid'::regtype,'text'::regtype,'uuid'::regtype,'jsonb'::regtype,'uuid'::regtype,'text'::regtype,'text'::regtype]::oid[],
   'p_organization_id: the tenant; NULL is refused with 22004 and a non-member is refused with 42501 by custom.assert_client_may_reach. p_client_table_id and every table_id inside p_tables: records of that organization''s Table kernel, each asked at the `admin` rung through custom.assert_client_may_change - the same rung custom.share_grant asks before it hands one record to somebody else, because a portal hands records to people outside the organization. p_tables.names_via: a field KEY of that Table; one that does not exist is refused with 42703 naming the keys that do, one that is not a relation is refused with 22023, and one pointing at a different Table is refused with 22023. p_slug: NULL means the door names the portal itself; a taken name is not overwritten. No entity token is declared on the uuids because every one of them is decided on the one ladder inside the body.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portals', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
   'p_organization_id: the tenant; a non-member is refused with 42501. The list is narrowed to portals whose CLIENT Table the caller can already open at viewer, so it can never reveal a Table.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_card', 'p_organization_id uuid, p_portal_id uuid',
   array['uuid'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id: the tenant. p_portal_id: a portal of that organization; one that is not there is refused with 02000, and the card is decided at `admin` on the portal''s client Table because it names every person invited.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_invite', 'p_organization_id uuid, p_portal_id uuid, p_client_record_id uuid, p_email text, p_user_id uuid',
   array['uuid'::regtype,'uuid'::regtype,'uuid'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id: the tenant. p_portal_id: a live portal of it. p_client_record_id: a record of THAT portal''s client Table - anything else is refused with 02000, because a principal pointed at another Table would carry whatever that record carries. p_email: where the sign-in link goes. p_user_id: NULL from a screen (the invitation confers nothing until the platform''s auth gives the person an identity); the server lane passes it when it has just watched auth create or find that identity.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_principal_bind', 'p_organization_id uuid, p_principal_id uuid, p_user_id uuid',
   array['uuid'::regtype,'uuid'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id: the tenant. p_principal_id: an invitation of it. p_user_id: the identity being bound - the body admits only the store owner, the person binding THEIR OWN identity (auth.uid() = p_user_id, the outsider arriving on their own link), or an organization admin of the client Table. It writes exactly one grant, through custom.share_grant, on the client''s own record.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_revoke', 'p_organization_id uuid, p_portal_id uuid, p_principal_id uuid',
   array['uuid'::regtype,'uuid'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id: the tenant. p_portal_id / p_principal_id: a person of that portal; decided at `admin` on the client Table. It takes the grant away as well as marking the row revoked, so no screen can show access as gone while the read path still answers.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_me', '', array[]::oid[],
   'No arguments: it answers about the signed-in person and nobody else. It returns what the portals they belong to DECLARED - titles, Tables, field lists - and not one record; records come back through custom.read_records like everybody else''s.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_preview', 'p_organization_id uuid, p_portal_id uuid, p_principal_id uuid, p_table_id uuid',
   array['uuid'::regtype,'uuid'::regtype,'uuid'::regtype,'uuid'::regtype]::oid[],
   'p_organization_id: the tenant. p_portal_id / p_principal_id: a person of that portal; decided at `admin` on the client Table. p_table_id: a Table that portal exposes; anything else is refused with 02000. It calls custom.visible_set for HER user id - the same call custom.read_records makes when she opens the page - so "view as this client" cannot disagree with what she sees.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql', null, true, false),
  ('custom', 'portal_admits', 'p_organization_id uuid, p_user_id uuid',
   array['uuid'::regtype,'uuid'::regtype]::oid[],
   'The one sentence the doors ask. Server-only: it is a predicate the store''s own walls consult, and a client that could ask it about an arbitrary user id would be able to test whether an address is a client of an organization.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: consulted by custom.assert_client_may_reach, custom.share_grant and iam.may_touch_field. No screen calls it - a screen asks custom.portal_me about itself.',
   false, false),
  ('custom', 'portal_public', 'p_slug text', array['text'::regtype]::oid[],
   'p_slug: the address in a link. It answers the portal''s own words so a person knows whose portal they reached, and reads no record, no count and no id inside it. Missing, closed and external-lane-shut all answer NULL, which is the 404.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: the sign-in page is server-rendered and schema custom stays revoked from anon; the grant is to service_role, whose key never leaves the server process. Same posture as custom.form_public.',
   false, false),
  ('custom', 'portal_invitation', 'p_slug text, p_email text',
   array['text'::regtype,'text'::regtype]::oid[],
   'p_slug / p_email: says whether THAT address was invited to THAT portal, so a sign-in link is only ever sent to somebody who was. The body refuses any signed-in caller outright, because a person able to ask this could test addresses against an organization.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: called by the portal sign-in route with the service key before it asks the platform''s auth to email a link. Never reachable by a person.',
   false, false),
  ('custom', 'portal_record_title', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype,'uuid'::regtype]::oid[],
   'One record''s human title, used by the portal doors above so a client is never named by uuid.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: it reads a title without asking the ladder, so it is only ever called from inside a door that has already decided the caller may see that record.',
   false, false),
  ('custom', 'portal_slug', 'p_organization_id uuid, p_title text, p_portal_id uuid',
   array['uuid'::regtype,'text'::regtype,'uuid'::regtype]::oid[],
   'Names a portal''s address from its title, avoiding one already taken.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: a helper of custom.portal_declare, which decides the access.', false, false),
  ('custom', 'portal_field_map', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype,'uuid'::regtype]::oid[],
   'Every declared Field of one Table with what a relation Field points at - what custom.portal_declare checks names_via against.',
   'portal_a_portal_is_a_view_of_one_organization_for_an_outsider.sql',
   'server_only: a helper of custom.portal_declare; a screen asks custom.applicable_fields.', false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
