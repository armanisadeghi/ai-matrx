-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_approval_approvers(uuid, uuid, uuid) 60d94dbd94e92b47379521df05a5d51c19941481f8b7ba3cd08adff073becd24
-- based-on: custom.work_person(uuid, uuid, boolean) 52d620a3601e5057e539b06586332805808cadf85db267ca79efd0be3dad5d0b
--
-- WORK-DOORS — THE TWO THINGS `pnpm check:store-doors-decide` CAUGHT, and they were both real.
--
-- The lane landed its doors at 04:20Z and ran the census at 04:21Z. Two of them were named,
-- and neither finding was a false positive:
--
--   * `custom.work_approval_approvers` (census 5, THE LADDER) — a declared client door taking
--     a uuid whose body never reached the one ladder. Real: it lists the PEOPLE of an
--     organization, with their display names, keyed on a subject id. A signed-in stranger who
--     guessed an organization id would have read that organization's roster. The wall goes in
--     first, exactly as `custom.share_people` asks it before listing the same people.
--
--   * `custom.work_person` (census 6, THE SWITCH) — a declared client door that WRITES a
--     record and never asked whether the store is open. Real: while `custom/system_enabled`
--     resolves false for an organization, nothing may write into its store, and this door
--     would have created a person-kernel record anyway. The OFF switch is the campaign's own
--     product switch; a door that writes past it is the switch not working.
--
-- Both are one statement, at the top of the body, before anything is read or written.
--
-- THE INVERSE: `migrations/inverse/workdoors_both_new_doors_ask_the_census_questions_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.work_approval_approvers(p_organization_id uuid, p_subject_id uuid,
                                                          p_approver_id uuid default null)
returns table (user_id uuid, name text, why text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  -- THE ORGANIZATION WALL FIRST, always — this answers with the NAMES of an organization's
  -- members, which is exactly what `custom.share_people` asks the same question before doing.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_approvers');
  return query
  select m.user_id,
         coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1))::text,
         case when m.user_id = p_approver_id then 'Asked for by name'
              when custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record')
                   = 'admin'::public.permission_level then 'Admin on this'
              else 'Owner or admin of this organization' end
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and (m.user_id = p_approver_id
          or custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record')
             = 'admin'::public.permission_level
          or public.is_org_admin_for(m.user_id, p_organization_id))
   order by 3, 2;
end
$$;

create or replace function custom.work_person(p_organization_id uuid, p_user_id uuid, p_create boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id   uuid;
  v_name text;
begin
  -- THE SWITCH FIRST. This door WRITES a person-kernel record on first use, and while the
  -- store is switched off for an organization nothing writes into it.
  perform custom.assert_store_door(p_organization_id, 'custom.work_person');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_person');
  if p_user_id is null then
    return null;
  end if;

  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.person_kernel_id()
     and r.deleted_at is null
     and nullif(r.data ->> 'user_id', '')::uuid = p_user_id
   order by r.created_at
   limit 1;
  if v_id is not null or not coalesce(p_create, true) then
    return v_id;
  end if;

  if not exists (select 1 from iam.organization_member m
                  where m.organization_id = p_organization_id and m.user_id = p_user_id) then
    raise exception 'That person is not in this organization, so work here cannot be given to them.'
      using errcode = '42501',
            hint = 'Invite them to the organization first. VIS-31: somebody with no membership here is the external-principal lane, and it is not open.';
  end if;

  select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  nullif(split_part(u.email::text, '@', 1), ''),
                  p_user_id::text)
    into v_name
    from auth.users u
   where u.id = p_user_id;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.person_kernel_id(), 'record',
          jsonb_build_object('name', coalesce(v_name, p_user_id::text),
                             'user_id', p_user_id::text))
  returning id into v_id;
  return v_id;
end
$$;
