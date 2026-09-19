-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LEVEL-FIX — THE CENSUS: WHO READS OR WRITES MORE THAN THEIR GRANTS AND THEIR ORGANIZATION'S
-- OWN KNOB JUSTIFY.
--
-- The defect this campaign found was not one record and one colleague. It was an arm of the
-- access kernel that said `editor` to every member of every organization about every record
-- they did not create, while the Share dialog, the Access tab and the store's own
-- `custom.share_access` door all reported the organization's knob. So the question "how many
-- people are over their level right now" has to be ASKABLE, before and after, by anybody, for
-- every organization on the database - and asked of the GRANT ROWS AND THE KNOB REGISTRY
-- rather than of the function under suspicion.
--
-- `iam.member_level_justified` derives the level from the sources: the grants addressed to the
-- person, the public grants on the thing, the world lane, what carries the thing, and
-- `custom/member_default_level` read straight out of `platform.feature_knob` /
-- `platform.knob_override` with the Table's own override and its restricted fields applied. It
-- calls neither `iam.has_access_for_base` nor `iam.effective_level` nor
-- `iam.member_lane_confers`, on purpose: a census that asks the thing it is auditing measures
-- nothing.
--
-- `iam.member_level_overreach()` is the answer per organization and per member. It is
-- SECURITY DEFINER and reachable only by the roles that own the store - it names people and
-- the records they can reach, so it is not a client door and is declared as none.

set local statement_timeout = '600s';
set local lock_timeout = '20s';
set local idle_in_transaction_session_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The arms ONE person may hold on ONE thing, derived from the sources.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function iam.access_arms_from_sources(
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

comment on function iam.access_arms_from_sources(uuid, uuid, text, uuid, uuid) is
  'LEVEL-FIX census. What one person may hold on one thing, derived from iam.permissions, '
  'iam.content_lane and the knob registry - never by asking iam.has_access_for_base, '
  'iam.effective_level or iam.member_lane_confers, which are the things the census audits.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- And the level the RULE justifies on a record: its own arms, plus whatever carries it, at
-- no more than the carrying link conveys.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function iam.member_level_justified(
  p_user_id         uuid,
  p_organization_id uuid,
  p_record_id       uuid
) returns public.permission_level
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_created uuid;
  v_table   uuid;
  v_best    public.permission_level;
  v_anc     public.permission_level;
  a         record;
begin
  select r.created_by, r.table_id into v_created, v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then return null; end if;

  -- VIS-25 and VIS-20, the two rungs a role justifies on its own.
  if v_created = p_user_id then return iam.top_content_level(); end if;
  if public.is_org_admin_for(p_user_id, p_organization_id) then return iam.top_content_level(); end if;

  v_best := iam.access_arms_from_sources(p_user_id, p_organization_id, 'record', p_record_id, v_table);

  for a in select c.container_type, c.container_id, c.max_level
             from custom.visibility_ancestors('record', p_record_id) c
  loop
    v_anc := iam.access_arms_from_sources(p_user_id, p_organization_id, a.container_type, a.container_id, null);
    if v_anc is not null then
      v_best := greatest(v_best, least(a.max_level, v_anc));
    end if;
  end loop;

  return v_best;
end;
$fn$;

comment on function iam.member_level_justified(uuid, uuid, uuid) is
  'LEVEL-FIX census. The level this person''s grants, this organization''s knob and whatever '
  'carries this record justify - the answer every door is supposed to agree with.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE CENSUS. Every organization on this database, every plain member, every record they
-- did not create.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function iam.member_level_overreach()
returns table(
  organization_id   uuid,
  organization_name text,
  member_id         uuid,
  member_email      text,
  records_over      integer,
  worst_actual      public.permission_level,
  worst_justified   public.permission_level,
  example_record_id uuid
)
language sql
stable
security definer
set search_path to ''
as $fn$
  with pair as (
    select om.organization_id, om.user_id, r.id as record_id,
           custom.effective_level(om.user_id, om.organization_id, r.id, 'record') as actual,
           iam.member_level_justified(om.user_id, om.organization_id, r.id)       as justified
      from iam.organization_member om
      join custom.record r on r.organization_id = om.organization_id and r.deleted_at is null
     where om.role = 'member'
       and r.created_by is distinct from om.user_id
  ), over as (
    select * from pair
     where actual is not null and (justified is null or actual > justified)
  )
  select o.organization_id,
         coalesce(g.name, o.organization_id::text),
         o.user_id,
         coalesce(u.email::text, o.user_id::text),
         count(*)::int,
         max(o.actual),
         max(o.justified),
         (array_agg(o.record_id order by o.record_id))[1]
    from over o
    left join iam.organizations g on g.id = o.organization_id
    left join auth.users        u on u.id = o.user_id
   group by o.organization_id, g.name, o.user_id, u.email
   order by 5 desc, 2, 4;
$fn$;

comment on function iam.member_level_overreach() is
  'LEVEL-FIX. Every plain member, in every organization on this database, whose level on '
  'records they did not create is HIGHER than their grants, the world lane, what carries the '
  'record and their organization''s custom/member_default_level justify. Zero is the only '
  'acceptable answer. The remedy is always the RULE - never rewriting somebody''s grants.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- AND THE THREE ARE DECLARED, IN DATA, AS THINGS NO CLIENT EVER CALLS. They are SECURITY
-- DEFINER, so `provision_shape_guard` requires the declaration and is right to: the census
-- names people and the records they can reach, which is an admin answer, not a screen.
-- ─────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'access_arms_from_sources',
   'p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'A census helper. p_user_id is the person being ASKED ABOUT, never the caller, so it makes no '
   'access decision of its own and must never be reachable by a client: it would answer "what may '
   'this other person do with that thing". Null p_user_id or p_id answers null.',
   'levelfix_the_census_of_overreach.sql',
   'server_only: nothing client-side calls this. It is read by iam.member_level_justified and by '
   'the LEVEL-FIX suites, both of which run as the role that owns the store. A client that could '
   'call it would be able to enumerate other people''s access levels one probe at a time.',
   false, false),
  ('iam', 'member_level_justified',
   'p_user_id uuid, p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'A census helper. p_user_id is the person being ASKED ABOUT, never the caller. p_record_id is '
   'read inside p_organization_id and answers null when the record is not there.',
   'levelfix_the_census_of_overreach.sql',
   'server_only: nothing client-side calls this. It answers "what SHOULD this person hold on that '
   'record", which is the auditor''s question, not a screen''s - the screen asks '
   'custom.share_access, which decides the caller.',
   false, false),
  ('iam', 'member_level_overreach', '', array[]::oid[],
   'The census itself. Takes no argument and reads every organization on the database.',
   'levelfix_the_census_of_overreach.sql',
   'server_only: nothing client-side calls this. It returns every plain member of every '
   'organization on this database together with the records they over-reach, which is a '
   'platform-administration answer and belongs to no organization''s screen.',
   false, false)
on conflict do nothing;
