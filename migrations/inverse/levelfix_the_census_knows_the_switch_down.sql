-- LEVEL-FIX (4 of 4) — THE INVERSE. `iam.access_arms_from_sources` exactly as
-- levelfix_the_census_of_overreach.sql created it, before it learned the store switch and the
-- row's own visibility.

set lock_timeout = '3s';
set statement_timeout = '60s';

create or replace function iam.access_arms_from_sources(
  p_user_id         uuid,
  p_organization_id uuid,
  p_type            text,
  p_id              uuid,
  p_table_id        uuid default null
) returns public.permission_level
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_addressed public.permission_level;
  v_best      public.permission_level;
  v_word      text;
  v_table     uuid := p_table_id;
  v_store_on  boolean;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- 1. Grants ADDRESSED to this person - to them, or to an organization they are in.
  select max(p.permission_level) into v_addressed
    from iam.permissions p
   where p.resource_type = p_type and p.resource_id = p_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and coalesce(p.is_public, false) = false
     and (p.granted_to_user_id = p_user_id
          or p.granted_to_organization_id in (select om.organization_id
                                                from iam.organization_member om
                                               where om.user_id = p_user_id));
  v_best := v_addressed;

  -- 2. Public grants on the thing, and the world lane. Both reach anybody signed in, so
  --    both are justified for a member too.
  v_best := greatest(v_best,
    (select max(p.permission_level) from iam.permissions p
      where p.resource_type = p_type and p.resource_id = p_id
        and p.status <> 'rejected' and (p.expires_at is null or p.expires_at > now())
        and coalesce(p.is_public, false)));
  if exists (select 1 from iam.content_lane c
              where c.resource_type = p_type and c.resource_id = p_id and c.lane is distinct from 'mine') then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  -- 3. WHAT MEMBERSHIP ALONE JUSTIFIES - and only where no grant is addressed to this
  --    person on this thing (VIS-19: roles set a default, per-thing grants override it).
  if v_addressed is null
     and p_organization_id is not null
     and exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    begin
      v_store_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false);
    exception when others then v_store_on := false; end;
    if v_store_on then
      begin
        v_word := platform.knob_resolve('custom', 'member_default_visibility', p_organization_id) #>> '{}';
      exception when others then v_word := 'all_records'; end;
      if coalesce(nullif(btrim(v_word), ''), 'all_records') <> 'shared_only' then
        begin
          v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
        exception when others then v_word := 'viewer'; end;
        if v_table is null and p_type = 'record' and to_regclass('custom.record') is not null then
          select r.table_id into v_table from custom.record r
           where r.organization_id = p_organization_id and r.id = p_id;
        end if;
        if v_table is not null and to_regclass('custom.record') is not null then
          v_word := coalesce((select nullif(btrim(t.data ->> 'member_default_level'), '')
                                from custom.record t
                               where t.organization_id = p_organization_id and t.id = v_table
                                 and t.deleted_at is null), v_word);
          if exists (select 1 from custom.record f
                      where f.organization_id = p_organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.deleted_at is null
                        and (f.data ->> 'entity_definition_id')::uuid = v_table
                        and f.data ->> 'sensitivity' = 'restricted') then
            v_word := 'none';
          end if;
        end if;
        if v_word is not null and v_word <> 'none'
           and exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
          v_best := greatest(v_best, v_word::public.permission_level);
        end if;
      end if;
    end if;
  end if;

  return v_best;
end;
$fn$;

