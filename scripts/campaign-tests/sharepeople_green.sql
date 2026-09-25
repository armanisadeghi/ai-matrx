-- LANE SHARE-PEOPLE-ONLY — THE GREEN SUITE. A share names a person, never an organization.
--
-- THE REAL USE CASE: admin@admin.com keeps a working agent ("Primary-Care Desk") and a table in
-- admin's Workspace. Sharing either one with a whole ORGANIZATION is refused by name at every
-- share door. Making the agent AVAILABLE to an organization he administers (org configuration:
-- surface binding, library contribution) still works through its own door, and the row says so.
-- Every organization grant that existed before this lane was either stamped availability (HR's
-- directory, surface bindings) or converted into one person grant per current member, with the
-- old row archived, so the same people read it.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/sharepeople_green.sql
-- ITS RED: before the migration (and after its inverse) it fails at 0a — there is no guard.

\set ON_ERROR_STOP on
\timing off

\set suite 'sharepeople_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ws       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_admin_j  constant text := json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text;
  v_agent uuid; v_table uuid; v_org uuid; v_out jsonb; v_msg text; v_n int; v_id uuid;
begin
  -- 0. the pieces exist
  if not exists (select 1 from pg_trigger where tgname = '_iam_a_share_names_a_person'
                  and tgrelid = 'iam.permissions'::regclass) then
    raise exception '0a: there is no guard on iam.permissions — organization grants are still written';
  end if;
  if to_regprocedure('public.grant_org_availability(text,uuid,uuid,text)') is null then
    raise exception '0b: the availability door is missing';
  end if;

  select d.id into v_agent from agent.definition d
   where d.created_by = c_admin and d.deleted_at is null and d.agent_type = 'user' limit 1;
  select r.id into v_table from custom.record r
   where r.organization_id = c_ws and r.table_id = custom.table_kernel_id() and r.deleted_at is null limit 1;
  select m.organization_id into v_org from iam.organization_member m
   where m.user_id = c_admin and m.role in ('owner', 'admin') and m.organization_id <> c_ws limit 1;
  if v_agent is null or v_table is null or v_org is null then
    raise exception '0c: fixtures missing (agent %, table %, org %)', v_agent, v_table, v_org;
  end if;

  -- 1. an unarmed organization grantee is refused at the table, by name
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level)
    values ('agent', v_agent, v_org, 'viewer');
    raise exception '1: a raw organization grant was written';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shares name a person, not an organization.' then raise exception '1: wrong sentence: %', v_msg; end if;
  end;
  -- 1b. forging the origin column does not help
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level, granted_via)
    values ('agent', v_agent, v_org, 'viewer', 'availability');
    raise exception '1b: a forged availability origin was accepted';
  exception when insufficient_privilege then null;
  end;

  -- ── the seat ──
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '0e: the suite did not take the seat'; end if;

  -- 2. the dialog's organization door refuses
  v_out := public.share_resource_with_org('agent', v_agent, v_org, 'viewer');
  if (v_out ->> 'success')::boolean or v_out ->> 'error' <> 'Shares name a person, not an organization.' then
    raise exception '2: share_resource_with_org answered %', v_out;
  end if;

  -- 3. the record store's door refuses kind organization (and the generic door carries it)
  begin
    perform custom.share_grant(c_ws, v_table, 'organization', v_org, 'viewer');
    raise exception '3: custom.share_grant accepted an organization';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shares name a person, not an organization.' then raise exception '3: wrong sentence: %', v_msg; end if;
  end;
  v_out := public.update_permission_level('record', v_table, null, v_org, 'viewer');
  if (v_out ->> 'success')::boolean then raise exception '3b: update_permission_level reached an organization: %', v_out; end if;

  -- 4. availability is its own door and stamps its origin
  v_out := public.grant_org_availability('agent', v_agent, v_org, 'viewer');
  if not (v_out ->> 'success')::boolean then raise exception '4: availability refused: %', v_out; end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from iam.permissions
   where id = (v_out ->> 'permission_id')::uuid and granted_via = 'availability' and granted_to_organization_id = v_org;
  if v_n <> 1 then raise exception '4b: the availability row is not stamped'; end if;
  perform set_config('sharepeople.avail_id', v_out ->> 'permission_id', true);
end
$t$;

-- A NEW STATEMENT: the availability arm is statement-scoped, so nothing below is armed.
do $t2$
declare
  v_out jsonb; v_msg text; v_n int; v_id uuid;
begin
  v_out := jsonb_build_object('permission_id', current_setting('sharepeople.avail_id'));
  -- 4c. an availability row cannot be edited from outside the door, but can be archived
  begin
    update iam.permissions set permission_level = 'editor' where id = (v_out ->> 'permission_id')::uuid;
    raise exception '4c: an organization row was raised outside the door';
  exception when insufficient_privilege then null;
  end;
  update iam.permissions set status = 'archived' where id = (v_out ->> 'permission_id')::uuid;

  -- 5. the conversion left no live organization share
  select count(*) into v_n from iam.permissions
   where granted_to_organization_id is not null and status <> 'archived'
     and granted_via is distinct from 'availability';
  if v_n <> 0 then raise exception '5: % organization grant(s) are neither availability nor archived', v_n; end if;
  -- 5b. every archived share's current members read it by name at the same level or higher —
  -- UNLESS that seat was taken away on purpose after the conversion. The conversion's promise is
  -- that it dropped nobody; a person grant it wrote and somebody later revoked (history records the
  -- DELETE, with who and when) is a later decision, not a conversion loss. Measured 2026-09-25: the
  -- probe mandate c90e2cae's two seats were revoked by its own creator after 13:27Z, which this
  -- check used to report as "lost in the conversion" (SHARE-TAILS).
  select count(*) into v_n
    from iam._share_people_conversion c
    join iam.permissions o on o.id = c.org_permission_id
    join iam.organization_member m on m.organization_id = c.organization_id
   where c.classified = 'share:archived'
     and m.joined_at <= c.converted_at
     and not exists (select 1 from iam.permissions p
                      where p.resource_type = o.resource_type and p.resource_id = o.resource_id
                        and p.granted_to_user_id = m.user_id
                        and p.permission_level >= c.level_before
                        and p.status = c.status_before)
     and not exists (select 1 from history.row_versions h
                      where h.entity_type = 'iam.permissions'
                        and h.operation = 'DELETE'
                        and h.occurred_at > c.converted_at
                        and h.row_data ->> 'resource_type' = o.resource_type
                        and (h.row_data ->> 'resource_id')::uuid = o.resource_id
                        and (h.row_data ->> 'granted_to_user_id')::uuid = m.user_id);
  if v_n <> 0 then raise exception '5b: % member(s) lost a reader seat in the conversion', v_n; end if;
  -- 5c. an archived organization share cannot be brought back
  select c.org_permission_id into v_id from iam._share_people_conversion c where c.classified = 'share:archived' limit 1;
  if v_id is not null then
    begin
      update iam.permissions set status = 'active', expires_at = null where id = v_id;
      raise exception '5c: an archived organization share came back';
    exception when insufficient_privilege then null;
    end;
  end if;
  -- 5d. HR's directory is availability
  select count(*) into v_n from iam.permissions p join hr.derived_grant dg on dg.permission_id = p.id
   where p.granted_to_organization_id is not null and p.granted_via is distinct from 'availability';
  if v_n <> 0 then raise exception '5d: % HR directory row(s) are not stamped availability', v_n; end if;

  raise notice 'sharepeople_green: GREEN';
end
$t2$;

rollback;
