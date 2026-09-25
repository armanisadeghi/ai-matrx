-- chair-step: lane SHARE-LANE-2. The organization's governance over a personal Table is an explicit, audited TRANSFER, never a silent read path (chair ruling 2026-09-25, the Google Workspace / Notion model). ADDS custom.table_transfer_owner(uuid, uuid, text) — an owner or admin of the Table's own organization makes another member (or themselves) its owner, with a reason; the previous owner stays named as editor; one row in the organization's governance audit (iam.org_admin_audit via iam._org_audit, action table.transfer_owner, who/when/why) and an in-app notice to both people (communication.notification, event custom.table.ownership_transferred, declared by aidream). The Table's visibility is not touched: a personal Table stays personal, now to its new owner. ADDS custom.member_personal_tables(uuid, uuid) — the ids (never the contents) of the personal Tables one member owns, for the organization's owners and admins, so settings can offer "Transfer their personal tables". Both are declared client-callable doors. No data write.
-- lane: SHARE-LANE-2
-- INVERSE: migrations/inverse/sharelane2_the_owner_transfers_a_personal_table_down.sql
-- PROOF: scripts/campaign-tests/sharelane2_green.sql (part T)
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.table_transfer_owner(p_table_id uuid, p_to_person uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- TRANSFER OWNERSHIP OF A TABLE (lane SHARE-LANE-2, 2026-09-25). The one way an organization's owner
-- or admin reaches a Table somebody kept to themselves: explicit, with a reason, audited, and told
-- to both people. Never a read path — the kernel refuses organization roles on a personal Table
-- (custom.row_sits_in_a_personal_table), and this door hands ownership over instead of opening it.
--   · caller: an owner or admin of the Table's OWN organization (read from the Table, never from an
--     active-org context). Anybody else gets exactly the read door's not-found words.
--   · p_to_person: a current member of that organization (the caller themselves is allowed —
--     unlike org_admin_reassign_member_resources' bulk rewrite, this is one Table, audited, told).
--   · p_reason: required; it is written into the audit row and into both notices.
--   · the previous owner stays NAMED on the Table as editor (Google Drive's rule), when still a member.
--   · the Table's visibility and lane are untouched: personal stays personal, to the new owner.
declare
  v_me      uuid := auth.uid();
  v_t       custom.record;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_from    uuid;
  v_org     text;
  v_name    text;
  v_me_name text;
  v_to_name text;
  v_fr_name text;
  v_kept    boolean := false;
  v_told    integer := 0;
  v_link    text;
  v_person  uuid;
  v_subject text;
  v_body    text;
  v_id      uuid;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so nothing can be transferred.' using errcode = '42501';
  end if;

  select t.* into v_t from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  if not found
     or not exists (select 1 from iam.organization_member om
                     where om.organization_id = v_t.organization_id and om.user_id = v_me
                       and om.role in ('owner', 'admin')) then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'Only an owner or admin of the organization a Table belongs to may transfer it.';
  end if;
  perform custom.assert_store_door(v_t.organization_id, 'table_transfer_owner');

  if v_reason = '' then
    raise exception 'A transfer has to say why. The reason is kept in the organization''s audit log and told to both people.'
      using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = '22023';
  end if;
  if p_to_person is null
     or not exists (select 1 from iam.organization_member om
                     where om.organization_id = v_t.organization_id and om.user_id = p_to_person) then
    raise exception 'That person is not in this organization, so the Table cannot be given to them.'
      using errcode = '22023';
  end if;
  v_from := v_t.created_by;
  if v_from = p_to_person then
    raise exception 'They already own this Table.' using errcode = '22023';
  end if;

  select o.name into v_org from iam.organizations o where o.id = v_t.organization_id;
  v_name := coalesce(nullif(btrim(v_t.data ->> 'name'), ''), 'a table');
  select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text)
    into v_me_name from auth.users u where u.id = v_me;
  select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text)
    into v_to_name from auth.users u where u.id = p_to_person;
  select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text)
    into v_fr_name from auth.users u where u.id = v_from;

  update custom.record set created_by = p_to_person where id = v_t.id;

  if v_from is not null and exists (select 1 from iam.organization_member om
                                     where om.organization_id = v_t.organization_id and om.user_id = v_from) then
    perform custom._share_write_person(v_t.organization_id, v_t.id, v_from, 'editor'::public.permission_level, v_me);
    v_kept := true;
  end if;

  perform iam._org_audit(v_t.organization_id, v_from, 'table.transfer_owner',
            jsonb_build_object('table_id', v_t.id, 'table_name', v_name, 'from', v_from, 'to', p_to_person,
                               'reason', v_reason, 'visibility', v_t.visibility::text,
                               'previous_owner_kept_as', case when v_kept then 'editor' end));

  v_link := format('/data-v2/%s', v_t.id);
  foreach v_person in array array_remove(array[v_from, p_to_person], null) loop
    if not ('in_app' = any (coalesce(hr._notify_channels('custom.table.ownership_transferred', v_t.organization_id, v_person, null), array['in_app']))) then
      continue;
    end if;
    if v_person = p_to_person then
      v_subject := case when v_person = v_me then format('You are now the owner of %s', v_name)
                        else format('%s made you the owner of %s', coalesce(v_me_name, 'An organization admin'), v_name) end;
      v_body := format('It was %s''s. Reason: %s', coalesce(v_fr_name, 'somebody else'), v_reason);
    else
      v_subject := format('%s transferred your table %s to %s', coalesce(v_me_name, 'An organization admin'), v_name,
                          case when p_to_person = v_me then 'themselves' else coalesce(v_to_name, 'another member') end);
      v_body := case when v_kept then format('You can still edit it. Reason: %s', v_reason)
                     else format('Reason: %s', v_reason) end;
    end if;
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (v_t.organization_id, 'custom.table.ownership_transferred', 'in_app', v_person, 'user',
       format('custom.table_transfer:%s:%s:%s', v_t.id, v_person, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('table_id', v_t.id, 'from', v_from, 'to', p_to_person, 'by', v_me,
                          'reason', v_reason, 'source', 'table_transfer_owner',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       'custom.record', v_t.id, v_link, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
    if v_id is not null then v_told := v_told + 1; end if;
  end loop;

  return jsonb_build_object(
    'transferred', true, 'table_id', v_t.id, 'table_name', v_name,
    'from_person', v_from, 'to_person', p_to_person,
    'previous_owner_kept_as', case when v_kept then 'editor' end,
    'told', v_told,
    'message', format('%s now belongs to %s.%s', v_name,
                      case when p_to_person = v_me then 'you' else coalesce(v_to_name, 'them') end,
                      case when v_kept then format(' %s can still edit it.', coalesce(v_fr_name, 'The previous owner')) else '' end));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.member_personal_tables(p_organization_id uuid, p_person uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- WHICH PERSONAL TABLES DOES THIS MEMBER OWN HERE? (lane SHARE-LANE-2) For the organization's owners
-- and admins only, so the member's row in settings can offer "Transfer their personal tables".
-- It returns ids and a count and never a Table's name or contents: the owner of an organization
-- governs a personal Table (by transferring it) without reading it.
declare
  v_me uuid := auth.uid();
  v_ids uuid[];
begin
  if v_me is null or p_organization_id is null
     or not exists (select 1 from iam.organization_member om
                     where om.organization_id = p_organization_id and om.user_id = v_me
                       and om.role in ('owner', 'admin')) then
    raise exception 'Only an owner or admin of this organization may see which personal tables a member keeps.'
      using errcode = '42501';
  end if;
  select coalesce(array_agg(t.id order by t.created_at), '{}') into v_ids
    from custom.record t
   where t.organization_id = p_organization_id and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null and t.created_by = p_person
     and t.visibility < 'internal'::platform.visibility;
  return jsonb_build_object('person', p_person, 'count', coalesce(array_length(v_ids, 1), 0), 'table_ids', to_jsonb(v_ids));
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
select d.schema_name, d.function_name, iam.door_identity_args(d.fn), d.argtypes, d.reason,
       'migrations/campaign/sharelane2_the_owner_transfers_a_personal_table.sql (lane SHARE-LANE-2)', true, false
  from (values
    ('custom', 'table_transfer_owner', 'custom.table_transfer_owner(uuid, uuid, text)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
     'p_table_id is read from custom.record and the caller must be an owner or admin (iam.organization_member) of THAT Table''s own organization, or the door answers the read door''s not-found words (42501); p_to_person must be a member of the same organization (22023); p_reason is required. It reads nothing back but the Table''s name, and it writes one audit row and two in-app notices.'),
    ('custom', 'member_personal_tables', 'custom.member_personal_tables(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'p_organization_id: the caller must be an owner or admin of it (42501 otherwise). p_person only filters; the door returns ids and a count, never a Table''s name or contents.')
  ) as d(schema_name, function_name, fn, argtypes, reason)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.table_transfer_owner(uuid, uuid, text) to authenticated;
grant execute on function custom.member_personal_tables(uuid, uuid) to authenticated;
