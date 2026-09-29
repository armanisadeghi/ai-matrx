-- ACCESS LADDER T-16e (standard lane, Claude Sonnet 5): the offboarding transfer and the org-scoped
-- take-over read ONE registry-derived list, not two.
--
-- public.org_admin_reassign_member_resources (the offboarding transfer, DD-140/DD-140b/DD-235/
-- KERNEL-TAILS) picked its movable tables from platform.shareable_resource_registry — a SEPARATE,
-- older registry from the one T-16d built for the records take-over
-- (platform.entity_types.ownership_handover, read through iam._org_records_owned_by). The two
-- disagreed: shareable_resource_registry marks 'notification', 'user_profile', 'user_stat',
-- 'sms_phone_number', 'sms_consent', 'dict_setting', 'game_badge', 'league_membership',
-- 'study_reminder_context', 'study_reminder_delivery', 'app_setting' and 'app_sync_status' all
-- is_active = true -- so an offboarding transfer moved a departing member's own per-person account
-- records (their notifications, their profile, their SMS consent) to the recipient, the exact class
-- T-16d's ownership_handover = 'person' declaration says must stay with the person. A table
-- registered on one list and not the other silently drifted between the two doors depending on
-- which one a caller used.
--
-- After this migration, org_admin_reassign_member_resources no longer reads
-- platform.shareable_resource_registry at all. Every resource kind except custom Tables (still
-- their own branch: a live personal Table goes through custom.table_transfer_owner one at a time,
-- an ordinary Table's rows are bulk-rewritten alongside it -- unchanged from KERNEL-TAILS) comes
-- from iam._org_records_owned_by(p_org_id, p_from_user), the SAME function
-- public.org_admin_take_over_member_records calls. p_resource_types keeps accepting the token
-- 'record' as an alias for 'custom_table' so an existing caller naming the old token still scopes
-- to custom Tables. platform.shareable_resource_registry is untouched (other readers still use it)
-- but is no longer this door's source of truth.
--
-- Proof (rolled back, no data write): common-docs/projects/access-ladder/t16/proof_offboarding_reads_the_same_registry.sql

-- based-on: public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[]) 4541e63687687fd02c6a3c9a341aef22da20be5cd75df0bf9f550718075a937b
create or replace function public.org_admin_reassign_member_resources(
  p_org_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_resource_types text[] default null::text[]
)
returns table (resource_type text, reassigned bigint)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$

declare
  r record; v_sql text; v_n bigint; v_total bigint := 0;
  v_tid uuid; v_tables bigint := 0; v_reason text; v_from_name text; v_to_name text;
  v_moves_custom boolean;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  -- 🚨 DD-140. An organization admin naming THEMSELVES as the recipient is not an offboarding
  -- transfer, it is a takeover: this function rewrites the owner column of every registered
  -- table, including private conversations, DMs and HR records, and the new owner then
  -- reads them through the ordinary owner arm of every std_select.
  if p_to_user = auth.uid() then
    raise exception 'An organization admin cannot reassign another member''s resources to themselves. An offboarding transfer goes through the audited transfer door, which records who moved what and tells the person whose work moved.'
      using errcode = '42501';
  end if;

  if p_from_user = p_to_user then
    raise exception 'Source and target users must differ' using errcode = '22023';
  end if;
  -- DD-140b: this check read the relation the iam.memberships cutover removed (42P01).
  if not exists (
    select 1 from iam.memberships m
    where m.container_type = 'organization' and m.container_id = p_org_id
      and m.user_id = p_to_user and m.status = 'active' and m.deleted_at is null
  ) then
    raise exception 'Target user is not a member of this organization' using errcode = '23503';
  end if;

  -- 🚨 KERNEL-TAILS (2026-09-25), unchanged: A PERSONAL TABLE MOVES THROUGH THE TRANSFER DOOR, one
  -- at a time. Each live personal Table (the set custom.member_personal_tables names) goes through
  -- custom.table_transfer_owner: one audit row per Table, a notice to both people, and the
  -- previous owner stays named as editor. 'custom_table' is the T-16e token (iam._org_records_owned_by);
  -- 'record' is kept as an accepted alias for whatever already calls this door with the old token.
  v_moves_custom := p_resource_types is null or 'custom_table' = any (p_resource_types) or 'record' = any (p_resource_types);

  if v_moves_custom then
    select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text)
      into v_from_name from auth.users u where u.id = p_from_user;
    select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text)
      into v_to_name from auth.users u where u.id = p_to_user;
    v_reason := format('Offboarding reassignment: %s''s work in this organization moved to %s.',
                       coalesce(v_from_name, 'the previous owner'), coalesce(v_to_name, 'another member'));
    for v_tid in
      select t.id from custom.record t
       where t.organization_id = p_org_id and t.table_id = custom.table_kernel_id()
         and t.deleted_at is null and t.created_by = p_from_user
         and t.visibility < 'internal'::platform.visibility
       order by t.created_at, t.id
    loop
      perform custom.table_transfer_owner(v_tid, p_to_user, v_reason);
      v_tables := v_tables + 1;
    end loop;
    if v_tables > 0 then
      resource_type := 'personal_table';
      reassigned    := v_tables;
      v_total       := v_total + v_tables;
      return next;
    end if;

    -- The ordinary (non-personal) rows of custom.record the member owns in this organization,
    -- personal Tables excluded (they already moved through the transfer door above).
    update custom.record
       set created_by = p_to_user
     where organization_id = p_org_id and created_by = p_from_user
       and not (table_id = custom.table_kernel_id() and visibility < 'internal'::platform.visibility);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      resource_type := 'record';
      reassigned    := v_n;
      v_total       := v_total + v_n;
      return next;
    end if;
  end if;

  -- ── Every other resource kind: THE ONE REGISTRY-DERIVED LIST, the same function
  -- public.org_admin_take_over_member_records calls. Confidential, machinery/ledger/reference
  -- tables, components and anything declared ownership_handover <> 'work' (a per-person account
  -- record, or an owning system's own door) never appear here -- see iam._org_records_owned_by.
  for r in
    select x.token, x.schema_name, x.table_name, x.owner_column
      from iam._org_records_owned_by(p_org_id, p_from_user) x
     where x.token <> 'custom_table'
       and (p_resource_types is null or x.token = any (p_resource_types))
  loop
    v_sql := format('update %I.%I set %I = $1 where organization_id = $2 and %I = $3',
                    r.schema_name, r.table_name, r.owner_column, r.owner_column);
    execute v_sql using p_to_user, p_org_id, p_from_user;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      resource_type := r.token;
      reassigned    := v_n;
      v_total       := v_total + v_n;
      return next;
    end if;
  end loop;

  perform iam._org_audit(p_org_id, p_from_user, 'resources.reassign',
                         jsonb_build_object('to', p_to_user, 'types', p_resource_types, 'total', v_total,
                                            'personal_tables_transferred', v_tables));
end;
$function$;

comment on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[]) is
  'T-16e: the offboarding transfer. Every resource kind except custom Tables (their own branch, '
  'unchanged since KERNEL-TAILS) is read from iam._org_records_owned_by -- the SAME registry-derived '
  'list public.org_admin_take_over_member_records uses -- so the two doors can never disagree about '
  'what moves. platform.shareable_resource_registry is no longer read here.';
