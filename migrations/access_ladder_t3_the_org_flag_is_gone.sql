-- chair-step: THE COLUMN iam.organizations' deprecated organization-type flag is DROPPED, with the four functions that existed only to answer "which organization is this person's personal one" (public.current_personal_org_id, iam.personal_org_id, public.ensure_personal_organization, public._d31_impl_ensure_personal_organization). Every reader was rewritten first (access_ladder_t3_*.sql); nothing reads it. There is no additive form of removing a column.
-- based-on: platform._no_new_org_flag_reader() 7d7778d656f47fa42bb29057b84dc7b2970aab87d1f138595e74168db4325f46
-- lane: access-ladder T-3
-- lock: iam.organizations, platform
--
-- THE DEPRECATED ORGANIZATION FLAG IS GONE, AND ITS GUARD NOW REFUSES THE CONCEPT OUTRIGHT.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and
-- equal; there is no personal/business type and no flag that marks one — Arman, 2026-09-26.)
--
-- platform._no_new_org_flag_reader() (T-1) grandfathered 51 readers in a list that could only
-- shrink. T-3 removed every one, so the list is EMPTY and stays empty (the ratchet refuses any
-- growth), and the test widens from the column's bare name to the concept: the flag's name in
-- any form (a derived alias such as a `resource_…` column or a `…_home` flag included), the
-- "personal organization" id helpers, and their provisioning twin — in any function, view,
-- policy or index body, and now in any table COLUMN name too. The column's replacement is
-- nothing: an organization is whatever the person uses it for.

set local lock_timeout = '3s';

drop function public.current_personal_org_id();
drop function iam.personal_org_id(uuid);
drop function public.ensure_personal_organization(uuid);
drop function public._d31_impl_ensure_personal_organization(uuid);

-- Their doors go with them (provision_shape_guard refuses a door naming a function that is gone).
delete from platform.client_callable_door
 where (schema_name, function_name) in (('public', 'current_personal_org_id'), ('iam', 'personal_org_id'),
                                         ('public', 'ensure_personal_organization'),
                                         ('public', '_d31_impl_ensure_personal_organization'));

-- The abbreviation trigger also fired on updates of the flag; it now fires on its own column only.
create or replace trigger normalize_organization_abbreviation
  before insert or update of abbreviation on iam.organizations
  for each row execute function iam.normalize_organization_abbreviation();

alter table iam.organizations drop column is_personal;

create or replace function platform._no_new_org_flag_reader()
returns event_trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  -- Assembled so this body never names what it refuses. Case-insensitive, no word boundaries:
  -- a derived alias of the flag is the same reader.
  c_word constant text :=
    '(is' || '_' || 'personal|personal' || '_' || 'org|ensure' || '_' || 'personal' || '_' || 'organization)';
  c_rule constant text := 'deprecated_org_flag_reader_ratchet';
  c_self constant text := 'platform._no_new_org_flag_reader()';
  -- THE RATCHET, at zero since access-ladder T-3 (2026-09-26). Never add a line: a replacement
  -- of this function that adds one is refused.
  c_grandfathered constant text[] := array[]::text[];
  cmd record;
  v_kind text;
  v_identity text;
  v_text text;
  v_offenders text[] := '{}';
  v_snapshot text[];
  v_added text[];
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.in_extension then
      continue;
    end if;
    v_kind := null; v_identity := null; v_text := null;

    if cmd.classid = 'pg_catalog.pg_proc'::regclass then
      select 'function', p.oid::regprocedure::text, p.prosrc
        into v_kind, v_identity, v_text
        from pg_proc p where p.oid = cmd.objid;
    elsif cmd.classid = 'pg_catalog.pg_class'::regclass then
      select case when c.relkind = 'i' then 'index'
                  when c.relkind in ('v', 'm') then 'view'
                  else 'table' end,
             c.oid::regclass::text,
             case when c.relkind = 'i' then pg_get_indexdef(c.oid)
                  when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid)
                  else (select string_agg(a.attname::text, ' ')
                          from pg_attribute a
                         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) end
        into v_kind, v_identity, v_text
        from pg_class c
       where c.oid = cmd.objid and c.relkind in ('v', 'm', 'i', 'r', 'p', 'f');
    elsif cmd.classid = 'pg_catalog.pg_policy'::regclass then
      select 'policy', pol.polrelid::regclass::text || ' / ' || pol.polname,
             coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        into v_kind, v_identity, v_text
        from pg_policy pol where pol.oid = cmd.objid;
    end if;

    if v_text is not null and v_text ~* c_word
       and not ((v_kind || ' ' || v_identity) = any (c_grandfathered)) then
      v_offenders := v_offenders || (v_kind || ' ' || v_identity);
    end if;

    -- THE SET ONLY SHRINKS: this function replaced with a list that adds an identity.
    if cmd.classid = 'pg_catalog.pg_proc'::regclass and v_identity = c_self then
      select string_to_array(l.detail, E'\n') into v_snapshot
        from platform.ddl_guard_log l
       where l.rule = c_rule
       order by l.id desc
       limit 1;
      select coalesce(array_agg(g order by g), '{}') into v_added
        from unnest(c_grandfathered) g
       where v_snapshot is null or not (g = any (v_snapshot));
      if v_snapshot is not null and cardinality(v_added) > 0 then
        raise exception 'The deprecated organization flag''s reader ratchet only shrinks: this replacement of % adds % to the grandfathered set.',
            c_self, array_to_string(v_added, ', ')
          using errcode = 'check_violation',
                hint = 'Organizations are unlimited and equal, with no personal/business type (common-docs/policies/access-ladder.md). Never grow the list.';
      end if;
      if v_snapshot is null or cardinality(c_grandfathered) < cardinality(v_snapshot) then
        insert into platform.ddl_guard_log
          (severity, rule, object_ref, command_tag, detail, acknowledged_at, ack_reason, acknowledged_by)
        values
          ('notice', c_rule, c_self, cmd.command_tag,
           array_to_string(array(select g from unnest(c_grandfathered) g order by g), E'\n'),
           now(), 'ratchet snapshot: the grandfathered reader set as of this replacement', 'platform._no_new_org_flag_reader');
      end if;
    end if;
  end loop;

  if cardinality(v_offenders) > 0 then
    raise exception 'An organization type was reintroduced: %', array_to_string(v_offenders, ', ')
      using errcode = 'check_violation',
            detail = 'There is no personal/business organization type and no flag, id helper or provisioning twin for one; the column was dropped by access-ladder T-3 (2026-09-26). This guard refuses any function, view, policy, index or table column that names the concept.',
            hint = 'Organizations are unlimited and equal (common-docs/policies/access-ladder.md). For the organization a person is acting in, use their explicit choice; a missing one is a hold the person resolves.';
  end if;
end;
$function$;

comment on function platform._no_new_org_flag_reader() is
  'Access-ladder T-1/T-3 (2026-09-26): refuses any CREATE/ALTER of a function, procedure, view, materialized view, policy, index or table whose body or column names the retired organization type (its flag, a derived alias, the personal-organization id helpers or their provisioning twin). The grandfathered set is empty and only shrinks (snapshots in platform.ddl_guard_log, rule deprecated_org_flag_reader_ratchet). No opt-out.';
