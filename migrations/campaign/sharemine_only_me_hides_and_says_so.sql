-- chair-step: lane SHARE-MINE-REGRESSION (chair ruling 2026-10-01). "Only people I share it with" promised a lock the access kernel has not enforced since access ladder T-36 (2026-09-28: on an Organization table "Only me" hides from lists and never locks). REPLACES custom.share_lanes() (the mine label and sentence) and custom.share_lane_set (its "mine" message) — text only, same signatures, no data written, no grant change.
-- based-on: custom.share_lanes() a2dfc276dc027dceebc5a830edd35ce56de6de5c1417676508c346d1e32c07c7
-- based-on: custom.share_lane_set(uuid, uuid, text, permission_level) a09f320f7961f12addaf1556dffee2c74bed14796ff9a82fc79374ad64f2ebc0
-- lane: SHARE-MINE-REGRESSION
-- INVERSE: migrations/inverse/sharemine_only_me_hides_and_says_so_down.sql

CREATE OR REPLACE FUNCTION custom.share_lanes()
 RETURNS TABLE(choice text, lane text, discoverable boolean, label text, means text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- VIS-N-4 + VIS-N-6. Four choices over three lanes: `community` and `world` are one lane and
  -- differ only in `discoverable`, and this table says so rather than inventing a fourth class.
  select * from (values
    -- SHARE-MINE-REGRESSION (chair ruling 2026-10-01, access ladder T-36): "mine" is the hide the law
    -- says it is, "Shown to: Only me" — never a lock on an Organization table. Same label as
    -- lib/list-scope/shownToWords.ts.
    ('mine',         'mine',         false, 'Only me',
     'Hidden from members'' lists. Members with the link, and the people it is shared with, still open it.'),
    ('organization', 'organization', false, 'Everyone in this organization',
     'Every member of the organization reaches it at the level the organization''s member default sets.'),
    ('community',    'world',        false, 'Anyone with the link',
     'Out in the world, but not listed anywhere: findable by the link and by nothing else (VIS-N-6''s unlisted).'),
    ('world',        'world',        true,  'Anyone, and listed',
     'Out in the world and discoverable: it may be listed and searched (VIS-N-4''s discoverable flag).')
  ) as t(choice, lane, discoverable, label, means);
$function$;

CREATE OR REPLACE FUNCTION custom.share_lane_set(p_organization_id uuid, p_subject_id uuid, p_choice text, p_level permission_level DEFAULT NULL::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_choice record;
  v_row    custom.record;
  v_word   text;
  v_level  public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_lane_set');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_lane_set',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  select * into v_choice from custom.share_lanes() l where l.choice = lower(btrim(coalesce(p_choice, '')));
  if not found then
    raise exception 'There is no lane called "%".', coalesce(p_choice, '<nothing>')
      using errcode = '22023',
            hint = 'The lanes are mine, organization, community and world — call custom.share_lanes() for what each one means.';
  end if;

  -- SHARE-TAILS (2026-09-25): THE LANE AND THE VISIBILITY MOVE TOGETHER, IN THIS ONE TRANSACTION.
  -- `custom.record.visibility` is what the access kernel reads for the organization-member lane
  -- (iam.has_access_for_base, iam.member_lane_confers): `internal` means every member reaches it
  -- by default. This door used to write only iam.content_lane, so "Only people I share it with"
  -- left the thing `internal` and every member of the organization still read it while the
  -- dialog said otherwise (measured on the clone as a plain member, 2026-09-25). Access is
  -- personal: `mine` is the owner and the people named, so it is `personal`; the organization
  -- and world lanes reach at least every member, so they are `internal`. The world lane's own
  -- act is still delegated whole below; if it refuses, this line rolls back with it.
  update custom.record r
     set visibility = case when v_choice.choice = 'mine'
                           then 'personal'::platform.visibility
                           else 'internal'::platform.visibility end
   where r.organization_id = p_organization_id and r.id = p_subject_id
     and r.visibility is distinct from (case when v_choice.choice = 'mine'
                                             then 'personal'::platform.visibility
                                             else 'internal'::platform.visibility end);

  if v_choice.lane = 'world' then
    -- Delegated whole: the world lane has its own act, its own admission and its own switch,
    -- and this door does not get a second copy of any of them (VIS-N-5, VIS-N-7).
    perform iam.publish_to_world('record', p_subject_id, p_organization_id, v_choice.discoverable);
    return jsonb_build_object('lane', v_choice.choice, 'message', v_choice.label || '.');
  end if;

  if v_choice.choice = 'organization' then
    v_level := coalesce(p_level, iam.member_default_level(p_organization_id, v_row.table_id),
                        'viewer'::public.permission_level);
    -- SHARE-PEOPLE-ONLY (chair ruling 2026-09-25): the "Everyone in this organization" LANE is the
    -- owner's visibility choice for the thing's OWN organization — one of the four lanes (mine,
    -- organization, community, world) — not a share. It is written through the availability arm
    -- and stamped so, because custom.share_grant now refuses an organization by name.
    perform iam._org_availability_arm();
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                 permission_level, created_by, status, granted_via)
    values ('record', p_subject_id, p_organization_id, v_level, custom.query_principal(), 'active', 'availability')
    on conflict (resource_type, resource_id, granted_to_organization_id) do update
       set permission_level = excluded.permission_level, status = 'active', expires_at = null,
           reviewed_by = null, reviewed_at = null;
  else
    -- delete means archive (T-32g)
    perform iam.remove_grant(p.id, custom.query_principal(), true)
       from iam.permissions p
      where p.resource_type = 'record' and p.resource_id = p_subject_id and p.status <> 'archived'
        and (p.granted_to_organization_id = p_organization_id or p.is_public);
    v_level := null;
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values ('record', p_subject_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do update
     set lane = 'mine', discoverable = false, unlisted = true;

  return jsonb_build_object(
    'lane', v_choice.choice,
    'level', v_level::text,
    'message', case when v_choice.choice = 'organization'
                    then format('Everyone in this organization now reaches this %s at %s.',
                                v_word, lower(iam.level_label(v_word, v_level)))
                    -- SHARE-MINE-REGRESSION (chair ruling 2026-10-01): "Only me" hides, never locks (T-36).
                    else format('Listed for you alone now. Members with the link can still open this %s.', v_word) end);
end;
$function$;
