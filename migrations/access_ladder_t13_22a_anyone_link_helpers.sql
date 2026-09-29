-- access_ladder_t13_22a_anyone_link_helpers.sql
--
-- T-13 step 2.2 (common-docs/projects/access-ladder/t13/PLAN.md), part a of e.
-- `link` stops being a row state: a record shared by link carries an ACTIVE ANYONE LINK in
-- platform.share_links (the law: /policies/access-ladder.md, Words table, "Anyone link").
-- Doors whose address is not the token (the meeting slug, the creator handle) resolve
-- address -> record -> "does it have an active Anyone link?". These two server-only helpers are
-- that question and the one writer that answers it; no client may call either.

create or replace function platform.anyone_link_active(p_resource_type text, p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  -- True when the record carries at least one Anyone link that would open it right now:
  -- switched on, not expired, uses left. The same three tests public.share_link_authorizes
  -- applies to a presented token.
  select exists (
    select 1 from platform.share_links l
     where l.resource_type = p_resource_type
       and l.resource_id = p_resource_id
       and l.is_active
       and (l.expires_at is null or l.expires_at > now())
       and (l.max_uses is null or l.use_count < l.max_uses)
  );
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'anyone_link_active', 'p_resource_type text, p_resource_id uuid', array['text'::regtype, 'uuid'::regtype]::oid[],
        'Read-only existence test on platform.share_links for (p_resource_type, p_resource_id); checked against nothing a caller supplies because no client calls it. NULL arguments match no link and answer false.',
        'matrx-frontend/migrations/access_ladder_t13_22a_anyone_link_helpers.sql (T-13 2.2)',
        'server_only: called only from inside SECURITY DEFINER doors (communication.meet_meeting_by_slug, meet_record_consent, public.creator_public_page, creator_public_handles) after they resolve the record from its slug or handle; no client role holds EXECUTE.',
        false, false);

comment on function platform.anyone_link_active(text, uuid) is
  'T-13 2.2: does this record carry an active Anyone link? Server-only; the guest lane of doors whose address is not the share token (meeting slug, creator handle).';

create or replace function platform.ensure_anyone_link(
  p_resource_type text, p_resource_id uuid, p_created_by uuid, p_organization_id uuid,
  p_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid;
begin
  -- Idempotent: an active viewer Anyone link already on the record is returned unchanged.
  select l.id into v_id from platform.share_links l
   where l.resource_type = p_resource_type and l.resource_id = p_resource_id
     and l.is_active and l.permission_level = 'viewer'::public.permission_level
     and (l.expires_at is null or l.expires_at > now())
     and (l.max_uses is null or l.use_count < l.max_uses)
   order by l.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  if not exists (select 1 from platform.shareable_resource_registry r
                  where r.resource_type = p_resource_type and r.is_active and r.is_link_shareable) then
    raise exception 'ensure_anyone_link: % is not shareable by link — register it in platform.shareable_resource_registry', p_resource_type
      using errcode = '22023';
  end if;
  insert into platform.share_links (resource_type, resource_id, token, permission_level,
                                    created_by, organization_id, metadata)
  values (p_resource_type, p_resource_id,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          'viewer'::public.permission_level, p_created_by, p_organization_id,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  perform platform._mint_share_short_alias(v_id);
  return v_id;
end;
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('platform', 'ensure_anyone_link', 'p_resource_type text, p_resource_id uuid, p_created_by uuid, p_organization_id uuid, p_metadata jsonb', array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'Writes one viewer Anyone link for (p_resource_type, p_resource_id) owned by p_created_by in p_organization_id; the CALLER has already proved p_created_by owns the record and p_organization_id is its organization (meeting create/schedule check membership; creator_set_public writes only auth.uid()''s own profile). Refuses a type not link-shareable in the registry.',
        'matrx-frontend/migrations/access_ladder_t13_22a_anyone_link_helpers.sql (T-13 2.2)',
        'server_only: called only from SECURITY DEFINER writers (communication.meet_get_or_create_meeting, meet_schedule_meeting, public.creator_set_public) and the T-13 2.2 backfill; a client that could call it would mint links on records it does not own.',
        false, false);

comment on function platform.ensure_anyone_link(text, uuid, uuid, uuid, jsonb) is
  'T-13 2.2: the one server-side writer of an Anyone link for a record (idempotent: returns the active viewer link if one exists). Server-only.';

-- No GRANT: both are SECURITY DEFINER with no platform.client_callable_door row, so the DB-wide
-- door guard strips client EXECUTE at creation (db-rules FEATURE.md §6d-4); verified after apply.
