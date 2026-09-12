-- DD-140b — "Remove member" has been throwing a raw Postgres error at every organization admin,
-- and the door DD-140 closed was already inert for the same reason. (B-32, 2026-09-12.)
--
-- FOUND WHILE PROVING DD-140 GREEN, NOT GUESSED:
--
--   as a real organization owner (34ed4fc3-…3261, org 5dc930e9-…f6b5b, is_org_admin = TRUE),
--   inside a rolled-back transaction:
--     select public.org_admin_remove_member(org, other_member, null);
--     -->  ERROR 42P01: relation "public.organization_members" does not exist
--
--   and live, DB-wide:
--     select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--      where c.relname ilike 'organization_member%';
--     -->  iam.organization_member (a VIEW). `public.organization_members` EXISTS NOWHERE.
--
--     select proname from pg_proc where prosrc like '%public.organization_members%';
--     -->  exactly two: org_admin_remove_member, org_admin_reassign_member_resources.
--
-- The `organization_members → iam.memberships` cutover (see
-- `migrations/memberships_org_fk_on_delete_cascade.sql`, which names it) left these two functions
-- pointing at a relation it had removed. Nothing caught it because a `SECURITY DEFINER` body is
-- not resolved until it runs, and the only client that runs it is an org admin removing a person.
--
-- 🚨 AND IT CORRECTS THE DD-140 RECORD. `org_admin_reassign_member_resources` reaches
-- `public.organization_members` at its target-membership check, BEFORE the rewrite loop — so the
-- owner-rewrite attack would have raised 42P01 rather than completing. The finding as filed stays
-- true and stays P0: the function was `SECURITY DEFINER` owned by `postgres`, EXECUTE-granted to
-- `authenticated`, gated only on "are you an org admin", standing on a grandfather row, with no
-- self-target check and a governance trigger that could not fire. What was NOT true is that it was
-- exploitable end-to-end today: a missing relation was the only thing in the way, and a relation
-- is not a security control — repointing these functions, which is exactly what this migration
-- does, would have restored the exploit path in full. That is the reason the grant had to go
-- first and why this file comes second. This correction belongs in the attack document (F-1) and
-- in register row DD-140; the chair owns that edit.
--
-- WHAT THIS DOES:
--   1. Repoints both functions to `iam.memberships` (container_type = 'organization', the shape
--      the live `iam.organization_member` view itself reads), preserving every existing gate and
--      the DD-140 refusals added in the previous migration.
--   2. Removal becomes a SOFT delete (`deleted_at = now()`, `status = 'removed'`), because
--      `iam.memberships` carries `deleted_at` and the whole platform treats a soft-deletable row
--      as never hard-deleted by a client path. A hard DELETE through the auto-updatable view would
--      have destroyed the row and its history. `iam.org_member_controls` keeps its existing
--      hard delete — it is a settings row with no soft-delete column, unchanged from before.
--
-- NOT CHANGED, deliberately: the DD-140 closure itself. `org_admin_reassign_member_resources`
-- stays revoked from `public`, `anon` and `authenticated` with no door row and no grandfather row,
-- and `org_admin_remove_member` still refuses a non-null `p_reassign_to`. This migration asserts
-- both at the end — repointing a body must not quietly re-open what the previous one shut.
--
-- Membership semantics are DD-138's subject (lane B-31). This migration changes only the two
-- functions B-32 already owns and coins nothing: `container_type='organization'`,
-- `status`, `deleted_at` are read straight off the live `iam.organization_member` view definition.

create or replace function public.org_admin_reassign_member_resources(
  p_org_id uuid, p_from_user uuid, p_to_user uuid, p_resource_types text[] default null
)
returns table(resource_type text, reassigned bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_owner text; v_sql text; v_n bigint; v_total bigint := 0;
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

  for r in
    select reg.resource_type,
           coalesce(reg.schema_name, 'public') as schema_name,
           reg.table_name,
           reg.owner_column
    from public.shareable_resource_registry reg
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
                         jsonb_build_object('to', p_to_user, 'types', p_resource_types, 'total', v_total));
end;
$$;

-- The DD-140 closure is re-asserted, not assumed: a CREATE OR REPLACE preserves the ACL, but
-- saying so out loud is cheaper than discovering otherwise.
revoke all on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[])
  to service_role;

create or replace function public.org_admin_remove_member(
  p_org_id uuid, p_user_id uuid, p_reassign_to uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_owner_count int; v_removed int;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use leave organization to remove yourself' using errcode = '42501';
  end if;

  -- 🚨 DD-140. This argument called org_admin_reassign_member_resources, which rewrites the owner
  -- column of every shareable registered table — private conversations, DMs and HR records
  -- included — and a nested call inside a SECURITY DEFINER owned by postgres is privilege-checked
  -- as postgres, so closing the direct RPC alone would have left the identical capability here.
  if p_reassign_to is not null then
    raise exception 'Removing a member no longer transfers their work. Transferring another person''s resources is an audited action with its own door, because it changes who owns their private conversations and records — remove the member without a transfer, and ask for the offboarding transfer door if you need their work moved.'
      using errcode = '42501';
  end if;

  -- DD-140b: all three statements below read the relation the cutover removed (42P01).
  select m.role into v_role
  from iam.memberships m
  where m.container_type = 'organization' and m.container_id = p_org_id
    and m.user_id = p_user_id and m.status = 'active' and m.deleted_at is null;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if v_role = 'owner' then
    select count(*) into v_owner_count
    from iam.memberships m
    where m.container_type = 'organization' and m.container_id = p_org_id
      and m.role = 'owner' and m.status = 'active' and m.deleted_at is null;
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner' using errcode = '42501';
    end if;
  end if;

  -- SOFT delete: iam.memberships carries deleted_at, and a client path never destroys a
  -- soft-deletable row. The iam.organization_member view filters on exactly these two columns,
  -- so the person leaves every roster the moment this commits.
  update iam.memberships m
     set deleted_at = now(), status = 'removed', updated_at = now(), updated_by = auth.uid()
   where m.container_type = 'organization' and m.container_id = p_org_id
     and m.user_id = p_user_id and m.deleted_at is null;
  get diagnostics v_removed = row_count;

  delete from iam.org_member_controls where organization_id = p_org_id and user_id = p_user_id;

  perform iam._org_audit(p_org_id, p_user_id, 'member.remove',
                         jsonb_build_object('reassigned_to', null, 'reassigned', '[]'::jsonb,
                                            'memberships_removed', v_removed));

  return jsonb_build_object('removed', v_removed > 0, 'reassigned', '[]'::jsonb);
end;
$$;

grant execute on function public.org_admin_remove_member(uuid, uuid, uuid) to authenticated;


-- ── Assertions. ──────────────────────────────────────────────────────────────────────────
do $$
declare v_n int; v_oid oid;
begin
  -- The relation that did not exist is referenced by nothing any more.
  select count(*) into v_n from pg_proc where prosrc like '%public.organization_members%';
  if v_n > 0 then
    raise exception 'dd140b: % function(s) still reference public.organization_members', v_n;
  end if;

  -- Both repointed bodies resolve against live catalog objects.
  perform 1 from iam.memberships where container_type = 'organization' limit 1;

  -- The DD-140 closure survived the CREATE OR REPLACE — both lanes.
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'org_admin_reassign_member_resources';
  if has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'dd140b: the owner-rewrite door RE-OPENED to a client role';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'dd140b: service_role lost EXECUTE on the owner-rewrite function';
  end if;
  if pg_get_functiondef(v_oid) not like '%p_to_user = auth.uid()%' then
    raise exception 'dd140b: the self-target refusal was lost';
  end if;

  select count(*) into v_n from platform.definer_client_grant_grandfather
   where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';
  if v_n > 0 then raise exception 'dd140b: a grandfather row came back'; end if;
  select count(*) into v_n from platform.client_callable_door
   where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';
  if v_n > 0 then raise exception 'dd140b: a client_callable_door row came back'; end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'org_admin_remove_member';
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd140b: removing a member must still be callable by authenticated';
  end if;
  if pg_get_functiondef(v_oid) not like '%p_reassign_to is not null%' then
    raise exception 'dd140b: the transfer refusal was lost';
  end if;

  raise notice 'dd140b: all assertions passed';
end $$;
