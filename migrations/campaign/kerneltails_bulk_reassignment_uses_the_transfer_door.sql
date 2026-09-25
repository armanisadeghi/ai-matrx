-- chair-step: lane KERNEL-TAILS (tail 2). The bulk offboarding reassignment no longer walks round the audited Table transfer door. public.org_admin_reassign_member_resources rewrote the owner column of every registered resource kind for a member — custom.record included, so a member's PERSONAL Tables ("Only people I share it with") moved to another member with one summary audit row, no notice to anyone, and the previous owner dropped off the Table: a second, unaudited-per-table path beside custom.table_transfer_owner (SHARE-LANE-2 left-behind). Now each live personal Table of the member (the set custom.member_personal_tables names: a Table row, not archived, created_by the member, visibility below internal) goes through custom.table_transfer_owner — one iam.org_admin_audit row per Table (table.transfer_owner), a notice to both people (custom.table.ownership_transferred), the previous owner stays named as editor — with the reason "Offboarding reassignment: <from>'s work in this organization moved to <to>."; the result carries one extra row (resource_type personal_table, the count) and the summary audit row carries personal_tables_transferred. The bulk rewrite of custom.record then skips every personal Table row (an archived personal Table keeps its owner rather than being handed over silently). Every other resource kind, the DD-140 self-takeover refusal, the member check, the grant (postgres + service_role only) and the summary audit row are unchanged. Proof: scripts/campaign-tests/kerneltails_reassign_uses_the_transfer_door_green.sql RED before (0 transfer audit rows, 0 notices), GREEN after (2 and 4). No data write.
-- based-on: public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[]) e5098baf85a81c6f9d667f953937eb990b01de906537509af16714b6e4ee48ff
-- lane: KERNEL-TAILS
-- INVERSE: migrations/inverse/kerneltails_bulk_reassignment_uses_the_transfer_door_down.sql
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION public.org_admin_reassign_member_resources(p_org_id uuid, p_from_user uuid, p_to_user uuid, p_resource_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(resource_type text, reassigned bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare r record; v_owner text; v_sql text; v_n bigint; v_total bigint := 0;
  v_tid uuid; v_tables bigint := 0; v_reason text; v_from_name text; v_to_name text;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  -- 🚨 DD-140. An organization admin naming THEMSELVES as the recipient is not an offboarding
  -- transfer, it is a takeover: this function rewrites the owner column of every shareable
  -- registered table, including private conversations, DMs and HR records, and the new owner then
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

  -- 🚨 KERNEL-TAILS (2026-09-25). A PERSONAL TABLE MOVES THROUGH THE TRANSFER DOOR, one at a time.
  -- This bulk rewrite used to move the member's personal Tables with the rest of custom.record:
  -- one summary audit row, nobody told, and the previous owner dropped off the Table. Each live
  -- personal Table (the set custom.member_personal_tables names) now goes through
  -- custom.table_transfer_owner: one audit row per Table, a notice to both people, and the
  -- previous owner stays named as editor. The bulk rewrite below then leaves every personal Table
  -- row alone (an archived one keeps its owner; it is not silently handed over), and every other
  -- resource kind keeps this call's contract exactly.
  if p_resource_types is null or 'record' = any (p_resource_types) then
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
  end if;

  for r in
    select reg.resource_type,
           coalesce(reg.schema_name, 'public') as schema_name,
           reg.table_name,
           reg.owner_column
    from platform.shareable_resource_registry reg
    where coalesce(reg.is_active, true)
      and (p_resource_types is null or reg.resource_type = any (p_resource_types))
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'organization_id'
    ) then
      continue;
    end if;

    v_owner := iam._resolve_owner_column(r.schema_name, r.table_name, r.owner_column);
    if v_owner is null then continue; end if;

    v_sql := format('update %I.%I set %I = $1 where organization_id = $2 and %I = $3',
                    r.schema_name, r.table_name, v_owner, v_owner);
    if r.schema_name = 'custom' and r.table_name = 'record' then
      v_sql := v_sql || ' and not (table_id = custom.table_kernel_id() and visibility < ''internal''::platform.visibility)';
    end if;
    execute v_sql using p_to_user, p_org_id, p_from_user;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      resource_type := r.resource_type;
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
