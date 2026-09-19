-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- SHARE — THE LANE IS READABLE WITHOUT READING THE TABLE.
--
-- Measured on the real screen, 2026-09-19: the one share dialog, opened on a record, renders a
-- red box reading
--
--     "We couldn't check this item's public visibility."
--
-- `getResourceVisibility` asks `getShareCapabilities` for the physical column that holds the
-- public state, and for `custom.record` it finds one — the table really does carry a
-- `visibility platform.visibility` column — and then reads that column DIRECTLY off the row.
-- `authenticated` holds no SELECT on `custom.record`, on purpose and permanently (DOOR-N-1a),
-- so the read is refused and the dialog says so.
--
-- It is the same class as this lane's first file: something that needs to READ the record
-- store reaching for the table instead of the door. The remedy is the same — a door.
--
-- `public.store_door_lane` answers the question the dialog is actually asking — "is this out in
-- the world, and how far" — from `iam.content_lane`, which is where VIS-N-4's lanes live, plus
-- the public grant row. It resolves the record's own organization off the row (so a caller
-- cannot name one) and puts the caller through the same one ladder at viewer before answering:
-- whether a record is published is a fact about the record, and you may not learn it about a
-- record you cannot open.
--
-- It deliberately does NOT read `custom.record.visibility`. That column is the platform's
-- generic three-state, and the record store's lane is `iam.content_lane` (mine · organization ·
-- world, plus discoverable) — answering from the column would report a different thing from the
-- one the Access tab beside it reports, which is two answers to one question.

create function public.store_door_lane(p_resource_type text, p_resource_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org  uuid;
  v_lane record;
  v_pub  boolean;
begin
  select r.organization_id into v_org from custom.record r where r.id = p_resource_id;
  if v_org is null then
    return jsonb_build_object('found', false);
  end if;
  -- The one ladder, at the rung that opens the thing. Nobody learns where a record is
  -- published from a record they cannot open.
  perform custom.assert_client_may_open(v_org, p_resource_id, 'store_door_lane',
                                        'viewer'::public.permission_level, 'record');

  select c.lane, c.discoverable, c.unlisted into v_lane
    from iam.content_lane c
   where c.resource_type = 'record' and c.resource_id = p_resource_id;

  select exists (select 1 from iam.permissions p
                  where p.resource_type = 'record' and p.resource_id = p_resource_id
                    and p.is_public and p.status <> 'rejected'
                    and (p.expires_at is null or p.expires_at > now()))
    into v_pub;

  return jsonb_build_object(
    'found', true,
    'lane', coalesce(v_lane.lane, 'mine'),
    'discoverable', coalesce(v_lane.discoverable, false),
    'is_public', coalesce(v_lane.lane, 'mine') = 'world' or coalesce(v_pub, false),
    -- The four CHOICES over the three lanes, so a screen names what a person picked rather than
    -- the storage word underneath it (VIS-N-4 + VIS-N-6).
    'choice', case when coalesce(v_lane.lane, 'mine') <> 'world' then coalesce(v_lane.lane, 'mine')
                   when coalesce(v_lane.discoverable, false) then 'world'
                   else 'community' end);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values
  ('public', 'store_door_lane',
   iam.door_identity_args('public.store_door_lane(text, uuid)'::regprocedure),
   array['text'::regtype::oid, 'uuid'::regtype::oid],
   'p_resource_id is resolved to its own organization off custom.record — the caller never names one — and then goes through custom.assert_client_may_open at viewer, the same one ladder every read door in this store asks, so a record the caller cannot open answers 42501 rather than telling them where it is published. A NULL or unknown id answers {"found": false} rather than raising, because a dialog opening on a deleted record should say "not found", not crash. p_resource_type is carried for the caller''s own bookkeeping and is not used to widen anything.',
   'migrations/campaign/share_the_lane_is_readable_without_reading_the_table.sql (lane SHARE)', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
