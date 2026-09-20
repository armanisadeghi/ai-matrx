-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.share_subject_name(uuid, text, uuid) 2d73a165ddf6e6ea1c9c3a83ecfd7eb60b528d4d6d84ac1ffba86fde16060edf
-- based-on: custom.share_access(uuid, uuid) c0b54fc6c383adbab4c1222ca96109003ff337ab555e26a957d0f580f458a187
--
-- SHARE — A REASON THAT NAMES NOTHING IS NOT A REASON.
--
-- `custom.share_access` answers "who reaches this, and why", and its containment reason read,
-- verbatim, on the green suite's own fixture:
--
--     "Anyone who reaches the thing that carries this reaches this too, at up to record admin.
--      Take it out of there, or change what that link conveys"
--
-- "the thing that carries this" is not a name, and the remedy it offers — take it out of
-- THERE — is unusable without one. The cause: it asked `platform.entity_title`, which resolves
-- a title through the platform's entity registry and answers NULL for a `custom.record`,
-- because the record store keeps its names inside the document (`data`) under whichever key
-- the row's Table calls its title field. The fallback then printed the raw uuid, and the
-- second sentence had no id to fall back to at all.
--
-- `custom.share_subject_name` is the one place that answers "what is this thing called" for
-- this store: the platform's title first (so anything outside schema `custom` keeps the
-- platform's own answer), then the Table's declared `title_field`, then `title`, then `name`,
-- and only then the first eight characters of the id — which is what a person sees on every
-- other screen of this package rather than a 36-character uuid.

create or replace function custom.share_subject_name(p_organization_id uuid, p_type text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_name  text;
  v_row   custom.record;
  v_title text;
begin
  if p_id is null then return null; end if;

  -- Outside schema `custom` the platform's registry is the authority and this adds nothing.
  if p_type is distinct from 'record' then
    return coalesce(nullif(btrim(platform.entity_title(p_type, p_id)), ''), left(p_id::text, 8));
  end if;

  v_name := nullif(btrim(coalesce(platform.entity_title('record', p_id), '')), '');
  if v_name is not null then return v_name; end if;

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  if not found then return left(p_id::text, 8); end if;

  -- The Table says which key holds the name. Asking the row for `title` when its Table calls
  -- it something else is how a screen ends up showing a uuid for a record that HAS a name.
  select nullif(btrim(coalesce(t.data ->> 'title_field', '')), '') into v_title
    from custom.record t
   where t.organization_id = p_organization_id and t.id = v_row.table_id;

  return coalesce(
    nullif(btrim(coalesce(v_row.data ->> v_title, '')), ''),
    nullif(btrim(coalesce(v_row.data ->> 'title', '')), ''),
    nullif(btrim(coalesce(v_row.data ->> 'name', '')), ''),
    left(p_id::text, 8));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'share_subject_name',
   iam.door_identity_args('custom.share_subject_name(uuid, text, uuid)'::regprocedure),
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'It takes an organization and a record id and returns only a NAME. It is called from inside custom.share_access, which has already put the caller through custom.assert_client_may_open at viewer on the subject, so no client reaches it without that check having run.',
   'migrations/campaign/share_a_reason_that_names_nothing.sql (lane SHARE)',
   'server_only: it returns a record''s NAME with no access check of its own, because the door that calls it (custom.share_access) has already applied the one ladder at viewer on that record. A client calling it directly would skip that check, so it gets no client grant and the schema stays closed to it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

CREATE OR REPLACE FUNCTION custom.share_access(p_organization_id uuid, p_subject_id uuid)
 RETURNS TABLE(principal_kind text, principal_id uuid, principal_label text, level permission_level, reason text, reason_detail text, via_type text, via_id uuid, revocable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_row      custom.record;
  v_manage   boolean;
  v_default  public.permission_level;
  v_lane     text;
  v_org_name text;
begin
  -- Seeing the list needs only the level that opens the thing; CHANGING it needs admin, and
  -- that is what `revocable` says per row rather than emptying the list (which is what the
  -- platform's generic RPC does today, and why an admin saw nothing at all).
  perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_access', 'viewer', 'record');

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'That record is not in this organization, so there is nobody to list.'
      using errcode = '02000';
  end if;

  v_manage := v_me is not null
              and custom.has_visibility(v_me, 'record', p_subject_id, 'admin'::public.permission_level);
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- ── 1. THE OWNER. VIS-25: the top rung, held as `created_by` and not as a grant row, so it
  -- is never revocable here — ownership transfers, it is not taken away in a share dialog.
  if v_row.created_by is not null then
    return query
    select 'person'::text,
           v_row.created_by,
           coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                    nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    u.email::text, v_row.created_by::text),
           iam.top_content_level(),
           'owner'::text,
           'Created it. The Owner rung sits above Admin and is held on the record itself, so it '
             || 'is transferred rather than revoked.',
           null::text, null::uuid, false
      from auth.users u where u.id = v_row.created_by;
  end if;

  -- ── 2. DIRECT GRANTS on this very thing — the rows this dialog writes and takes back.
  return query
  select case when p.is_public then 'everyone'
              when p.granted_to_organization_id is not null then 'organization'
              else 'person' end::text,
         coalesce(p.granted_to_organization_id, p.granted_to_user_id),
         case when p.is_public then 'Anyone with access to the link'
              when p.granted_to_organization_id is not null
                then coalesce(o.name, p.granted_to_organization_id::text)
              else coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            u.email::text, p.granted_to_user_id::text) end::text,
         p.permission_level,
         'direct'::text,
         case when p.granted_to_organization_id is not null and p.granted_to_organization_id <> p_organization_id
                then 'Shared with another organization (VIS-23: a cross-organization share is a grant whose principal is that organization).'
              when p.granted_to_organization_id is not null
                then 'Shared with everyone in ' || coalesce(o.name, 'this organization') || '.'
              when p.is_public then 'Open to anyone who reaches it.'
              else 'Shared with this person directly.' end
           || case when p.expires_at is not null then ' Expires ' || to_char(p.expires_at, 'YYYY-MM-DD') || '.' else '' end,
         null::text, null::uuid,
         v_manage
    from iam.permissions p
    left join auth.users        u on u.id = p.granted_to_user_id
    left join iam.organizations o on o.id = p.granted_to_organization_id
   where p.resource_type = 'record'
     and p.resource_id   = p_subject_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
   order by p.created_at;

  -- ── 3. THE ORGANIZATION'S OWN MEMBER DEFAULT (VIS-19 / VIS-33). Not a grant row and not
  -- revocable from here: it is the organization's setting, and the remedy is the setting.
  if iam.member_lane_open(p_organization_id) then
    v_default := iam.member_default_level(p_organization_id, v_row.table_id);
    if v_default is not null then
      return query
      select 'organization'::text, p_organization_id,
             coalesce(v_org_name, 'this organization'),
             v_default,
             'organization default'::text,
             'Every member of ' || coalesce(v_org_name, 'this organization') || ' reaches this without '
               || 'anybody sharing it, because the organization''s member default says so. Change it in '
               || 'the organization''s settings (custom/member_default_visibility, custom/member_default_level) '
               || '— there is no grant here to revoke.',
             null::text, null::uuid, false;
    end if;
  end if;

  -- ── 4. CONTAINMENT (VIS-1 / VIS-5 / VIS-3): whatever carries this thing carries access to it,
  -- at no more than the carrying link conveys. The remedy is on the container, so each row names
  -- the container and is not revocable here.
  return query
  select 'via'::text,
         a.container_id,
         custom.share_subject_name(p_organization_id, a.container_type, a.container_id),
         a.max_level,
         'containment'::text,
         'Anyone who reaches ' || custom.share_subject_name(p_organization_id, a.container_type, a.container_id)
           || ' reaches this too, at up to ' || lower(iam.level_label('record', a.max_level))
           || '. Take it out of there, or change what that link conveys — there is no grant here to revoke.',
         a.container_type, a.container_id, false
    from custom.visibility_ancestors('record', p_subject_id) a
   order by a.depth, 3;

  -- ── 5. THE LANE (VIS-N-4). Only said out loud when it is not the closed default.
  v_lane := iam.lane_of('record', p_subject_id);
  if v_lane is distinct from 'mine' then
    return query
    select 'everyone'::text, null::uuid,
           case when c.discoverable then 'Anyone, and listed' else 'Anyone with the link' end,
           'viewer'::public.permission_level,
           'world lane'::text,
           case when c.discoverable
                then 'Published to the world and discoverable: it may be listed and searched.'
                else 'Published to the world but unlisted: reachable by its link and by nothing else.' end,
           null::text, null::uuid, v_manage
      from iam.content_lane c
     where c.resource_type = 'record' and c.resource_id = p_subject_id;
  end if;
end;
$function$;

-- `custom.share_access` is REPLACED by this file, so its door travels with it: a file that can
-- run on its own must declare every SECURITY DEFINER function it leaves standing. The row is
-- identical to the one `share_the_store_has_a_share_door.sql` wrote, so on a normal apply this
-- is a no-op, and on a re-apply after that file's inverse it is what keeps the door declared.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values
  ('custom', 'share_access',
   iam.door_identity_args('custom.share_access(uuid, uuid)'::regprocedure),
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'p_organization_id and p_subject_id go through custom.assert_client_may_open at viewer — the same one ladder every read door in this store asks — so a caller who cannot open the record cannot list who reaches it; a NULL organization raises 22004 and a record in another organization raises the same 02000 as one that does not exist. Grantee identities are shown to anyone who may open the thing (that is what a share list IS), and the revocable flag, not the row set, is what admin decides.',
   'migrations/campaign/share_a_reason_that_names_nothing.sql (lane SHARE)', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
