-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_both_new_doors_ask_the_census_questions.sql`.
-- It takes the two census answers back out: `custom.work_approval_approvers` stops asking the
-- organization wall, and `custom.work_person` stops asking the OFF switch. Both bodies below
-- are what stood at 04:20Z on 2026-09-20, byte for byte, and running this file is what makes
-- `pnpm check:store-doors-decide` name them again — which is how the red twin proves the two
-- findings were real rather than a census talking to itself.

CREATE OR REPLACE FUNCTION custom.work_approval_approvers(p_organization_id uuid, p_subject_id uuid, p_approver_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, name text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
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
$function$
;


CREATE OR REPLACE FUNCTION custom.work_person(p_organization_id uuid, p_user_id uuid, p_create boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id   uuid;
  v_name text;
begin
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

  -- The name a person is KNOWN BY, read exactly the way `custom.share_people` reads it, so
  -- the picker and the assignment cannot disagree about who somebody is.
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
$function$
;

