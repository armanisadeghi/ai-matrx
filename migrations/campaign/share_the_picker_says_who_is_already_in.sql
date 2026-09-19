-- chair-step: one DROP FUNCTION. `custom.share_people` landed an hour earlier in this same lane with an `already_at` column that was always NULL — a column that promises the picker will tell you who is already shared with, and tells you nothing. A dead column on a screen is the thing this platform refuses, and an OUT list cannot be changed by CREATE OR REPLACE. The function is minutes old, is called by nothing outside this lane's own suite, and is recreated in the same transaction with the record as an argument so the promise is kept. Its door row is re-declared for the new signature; the old one is removed with it.
--
-- SHARE — THE PEOPLE PICKER SAYS WHO IS ALREADY IN.
--
-- `already_at public.permission_level` was in the returned shape from the first byte and was
-- selected as `null::public.permission_level`, because the function had no way of knowing which
-- record you were sharing. So a picker built on it would have shown every member of the
-- organization as if none of them had access, and re-sharing somebody who is already an editor
-- would have looked like a new share. The fix is the argument the answer needs.

drop function if exists custom.share_people(uuid, text, integer);
delete from platform.client_callable_door d
 where d.schema_name = 'custom' and d.function_name = 'share_people'
   and d.identity_argtypes = array['uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid];

create function custom.share_people(
  p_organization_id uuid,
  p_subject_id      uuid    default null,
  p_query           text    default null,
  p_limit           integer default 25
)
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  membership   text,
  already_at   public.permission_level,
  already_why  text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row custom.record;
begin
  -- The organization wall first, exactly as every other door in this store. A picker that
  -- listed another organization's people would BE the leak.
  perform custom.assert_client_may_reach(p_organization_id, 'share_people');

  -- And if a record is named, the same one ladder decides whether this caller may be told
  -- anything about who reaches it — the picker is part of the share surface, not beside it.
  if p_subject_id is not null then
    perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_people',
                                          'viewer'::public.permission_level, 'record');
    select r.* into v_row from custom.record r
     where r.organization_id = p_organization_id and r.id = p_subject_id;
    if not found then
      raise exception 'That record is not in this organization.' using errcode = '02000';
    end if;
  end if;

  return query
  select m.user_id,
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1))::text,
         m.role::text,
         case when p_subject_id is null then null
              else custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record') end,
         case when p_subject_id is null then null
              when m.user_id = v_row.created_by then 'Created it'
              when exists (select 1 from iam.permissions p
                            where p.resource_type = 'record' and p.resource_id = p_subject_id
                              and p.granted_to_user_id = m.user_id
                              and p.status <> 'rejected'
                              and (p.expires_at is null or p.expires_at > now()))
                then 'Shared with them directly'
              when custom.effective_level(m.user_id, p_organization_id, p_subject_id, 'record') is not null
                then 'Reaches it another way — see who has access'
              else null end
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and (p_query is null or btrim(p_query) = ''
          or u.email::text ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'display_name', '') ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'full_name', '')   ilike '%' || btrim(p_query) || '%')
   order by 3
   limit greatest(1, least(coalesce(p_limit, 25), 200));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values
  ('custom', 'share_people',
   iam.door_identity_args('custom.share_people(uuid, uuid, text, integer)'::regprocedure),
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid],
   'p_organization_id is checked by custom.assert_client_may_reach before a single row is read, so only a member of that organization ever sees its people; NULL raises 22004 there rather than listing everybody. p_subject_id is OPTIONAL and, when given, goes through custom.assert_client_may_open at viewer — the same one ladder every read door asks — so nobody learns who reaches a record they cannot open themselves; a record in another organization raises the same 02000 as one that does not exist. p_query and p_limit are a filter and a cap, never an identity, and the cap is clamped to 200.',
   'migrations/campaign/share_the_picker_says_who_is_already_in.sql (lane SHARE)', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
