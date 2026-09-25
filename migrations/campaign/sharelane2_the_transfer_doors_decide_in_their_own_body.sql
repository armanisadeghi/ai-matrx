-- chair-step: lane SHARE-LANE-2 (round 3). The two transfer doors decide in their own body: each now asks custom.assert_client_may_reach, the one ladder's organization wall, so check:store-doors-decide finds the ladder in custom.table_transfer_owner and custom.member_personal_tables (it named both as doors whose body never reaches it). custom.table_transfer_owner asks it after its role test, so a non-member still meets the read door's not-found words. Same signatures, same answers otherwise. No data write.
-- based-on: custom.table_transfer_owner(uuid, uuid, text) 4262d6a95d5fb973b2ce8b2e5420ea940459d4c220922c52c30db3f386ae9cbd
-- based-on: custom.member_personal_tables(uuid, uuid) 60bfba7d2af3bca81649581c470b5e3be9e44e43cf86c49be9dff99002b79571
-- lane: SHARE-LANE-2
-- INVERSE: migrations/inverse/sharelane2_the_transfer_doors_decide_in_their_own_body_down.sql
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
  -- THE ONE LADDER'S WALL, decided in this body (check:store-doors-decide): the organization the
  -- Table lives in, read from the Table. Asked after the role test above so a non-member still
  -- gets the read door's not-found words rather than a sentence naming the organization.
  perform custom.assert_client_may_reach(v_t.organization_id, 'custom.table_transfer_owner');
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
  -- THE ONE LADDER'S WALL first (check:store-doors-decide): the organization the caller named.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.member_personal_tables');
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
