-- lane: access-ladder T-1
-- lock: platform
--
-- NO NEW READER OF THE DEPRECATED ORGANIZATION FLAG — A RATCHET THAT ONLY SHRINKS.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and
-- equal; there is no personal/business type and no flag that marks one — Arman, 2026-09-26.)
--
-- The flag (iam.organizations' deprecated column, and context.templates' column of the same
-- name — iam.is_personal_dependents() lists both, and so does this) was deprecated on
-- 2026-09-25 (w1_org_is_personal_is_deprecated_on_main.sql) and nothing refused a NEW reader:
-- the 2026-09-26 06:17 UTC migration rcb6_a_personal_workspace_has_one_member.sql added one
-- that refused every second member of a signup organization.
--
-- THE GUARD. An event trigger at ddl_command_end inspects exactly the functions, procedures,
-- views, materialized views, policies and indexes each DDL command touched (pg_event_trigger_ddl_commands) and REFUSES the command when one of them
-- names the flag as a whole word (the same \m…\M test iam.is_personal_dependents() uses) and is
-- not in the grandfathered set below. There is no opt-out comment and no bypass setting: the
-- only way through is not to read the flag.
--
-- THE SET ONLY SHRINKS. The grandfathered set is the live census taken 2026-09-26 after this
-- lane's two earlier files (51 objects: 53 minus the dropped membership trigger function and
-- iam.provision_signup_organization). A grandfathered object may be replaced while it still
-- reads the flag, and passes freely once it stops. Adding an entry is refused: when this guard
-- function itself is replaced, the new list is compared with the last snapshot written to
-- platform.ddl_guard_log (rule deprecated_org_flag_reader_ratchet) and any identity not in that
-- snapshot refuses the replacement by name; a smaller list writes a new snapshot. A lane that
-- removes a reader (T-3) removes its line in the same file.
--
-- Additive: two functions, one event trigger, one log row. No table is touched.

create or replace function platform._no_new_org_flag_reader()
returns event_trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  -- The column name is assembled so this body never names it and never lists itself.
  c_word constant text := '\mis' || '_personal\M';
  c_rule constant text := 'deprecated_org_flag_reader_ratchet';
  c_self constant text := 'platform._no_new_org_flag_reader()';
  -- THE RATCHET. Live census 2026-09-26. Remove a line when its object stops reading the flag;
  -- never add one (a replacement of this function that adds a line is refused).
  c_grandfathered constant text[] := array[
    'function billing.seed_prelaunch_complimentary()',
    'function communication.notification_user_channels(uuid,text,uuid,jsonb,boolean)',
    'function crm.ensure_user_party(uuid,text)',
    'function custom._table_move_plan(uuid,uuid,uuid)',
    'function iam._container_authz(text,uuid,uuid,boolean)',
    'function iam.access_request_recipients(text,uuid)',
    'function iam.backfill_org_from_owner(boolean)',
    'function iam.external_principal_card(uuid)',
    'function iam.is_external_principal(uuid)',
    'function iam.is_personal_dependents()',
    'function iam.organization_archive(uuid,text,text)',
    'function iam.people_lists_a_non_member_can_read()',
    'function iam.personal_data_relations()',
    'function iam.personal_org_id(uuid)',
    'function mandate._admin_owner_label(uuid,boolean)',
    'function mandate._admin_owner_level(uuid,boolean)',
    'function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean)',
    'function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text)',
    'function public._d31_impl_ensure_personal_organization(uuid)',
    'function public.access_denied_context(text,uuid)',
    'function public.admin_manage_organization_membership(text,uuid,uuid,text)',
    'function public.agx_list_non_global_shortcuts_for_admin_m()',
    'function public.agx_list_scope_counts(text,boolean,text,jsonb)',
    'function public.agx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
    'function public.ctx_seed_template(jsonb)',
    'function public.cvx_list_scope_counts(text,boolean,text,jsonb)',
    'function public.get_ssr_shell_data(uuid)',
    'function public.get_user_full_context(uuid)',
    'function public.get_user_hierarchy()',
    'function public.get_user_nav_tree(uuid)',
    'function public.get_user_organizations(uuid)',
    'function public.get_user_scopes(uuid)',
    'function public.ivw_list_scope_counts(text,jsonb)',
    'function public.list_templates(text,boolean)',
    'function public.list_user_organizations(uuid,text)',
    'function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid,text)',
    'function public.mnd_member_list(text,text,text,uuid,uuid,text,jsonb,text,text,integer,integer)',
    'function public.org_create(text,text,text,text,uuid,text,jsonb,text)',
    'function public.org_update(uuid,jsonb)',
    'function public.seo_rank_target_list_scope_counts(text,jsonb)',
    'function public.set_streak_rest_weekdays(smallint[])',
    'function public.shx_list_scope_counts(text,boolean,jsonb)',
    'function public.shx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
    'function public.transfer_guest_data_to_user(uuid,uuid,text)',
    'function public.trx_list_scope_counts(text,boolean,jsonb)',
    'function public.vault_recovery_preview(uuid)',
    'function public.wfx_list_scope_counts(text,boolean,text,jsonb)',
    'function seo._archive_tenant(uuid)',
    'function users.passkey_credential_linkage_guard()',
    'view agent.menu_surface',
    'view platform.visible_user_identity'
  ];
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
    elsif cmd.classid = 'pg_catalog.pg_class'::regclass and cmd.objsubid = 0 then
      select case when c.relkind = 'i' then 'index' else 'view' end,
             c.oid::regclass::text,
             case when c.relkind = 'i' then pg_get_indexdef(c.oid) else pg_get_viewdef(c.oid) end
        into v_kind, v_identity, v_text
        from pg_class c
       where c.oid = cmd.objid and c.relkind in ('v', 'm', 'i');
    elsif cmd.classid = 'pg_catalog.pg_policy'::regclass then
      select 'policy', pol.polrelid::regclass::text || ' / ' || pol.polname,
             coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        into v_kind, v_identity, v_text
        from pg_policy pol where pol.oid = cmd.objid;
    end if;

    if v_text is not null and v_text ~ c_word
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
                hint = 'Remove the read from the object instead (the flag is deprecated: organizations are unlimited and equal, see common-docs/policies/access-ladder.md). Never grow the list.';
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
    raise exception 'New reader of the deprecated organization flag refused: %', array_to_string(v_offenders, ', ')
      using errcode = 'check_violation',
            detail = 'The column is deprecated (REC-61) and is being removed; organizations are unlimited and equal, with no personal/business type. Only the grandfathered readers in platform._no_new_org_flag_reader() may still name it, and that set only shrinks.',
            hint = 'Do not read the flag. For "the organization created at signup" read the person''s memberships; for a default organization read iam.default_organization_id(person). See common-docs/policies/access-ladder.md.';
  end if;
end;
$function$;

comment on function platform._no_new_org_flag_reader() is
  'Access-ladder T-1 (2026-09-26): refuses any CREATE/REPLACE of a function, procedure, view, materialized view, policy or index that names the deprecated organization flag unless it is in the grandfathered set, which only shrinks (snapshots in platform.ddl_guard_log, rule deprecated_org_flag_reader_ratchet). No opt-out.';

-- The first snapshot, written here because the event trigger does not exist yet when the
-- function above is created. regprocedure text depends on search_path, so it is computed under
-- the same search_path the guard runs with (pg_catalog: every identity schema-qualified), and the
-- caller's search_path is restored after.
do $$
declare
  v_old text := current_setting('search_path');
begin
  perform pg_catalog.set_config('search_path', 'pg_catalog', true);
  insert into platform.ddl_guard_log
    (severity, rule, object_ref, command_tag, detail, acknowledged_at, ack_reason, acknowledged_by)
  select 'notice', 'deprecated_org_flag_reader_ratchet', 'platform._no_new_org_flag_reader()',
         'CREATE FUNCTION',
         array_to_string(array(
           select x from (
             select 'function ' || p.oid::regprocedure::text as x
               from pg_catalog.pg_proc p
               join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where p.prosrc ~ ('\mis' || '_personal\M')
                and n.nspname not in ('pg_catalog', 'information_schema')
                and p.oid <> 'platform._no_new_org_flag_reader()'::regprocedure
             union all
             select 'view ' || c.oid::regclass::text
               from pg_catalog.pg_class c
              where c.relkind in ('v', 'm')
                and c.relnamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                and pg_catalog.pg_get_viewdef(c.oid) ~ ('\mis' || '_personal\M')
             union all
             select 'policy ' || pol.polrelid::regclass::text || ' / ' || pol.polname
               from pg_catalog.pg_policy pol
              where coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                    coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ ('\mis' || '_personal\M')
             union all
             select 'index ' || c.oid::regclass::text
               from pg_catalog.pg_class c
              where c.relkind = 'i' and pg_catalog.pg_get_indexdef(c.oid) ~ ('\mis' || '_personal\M')
           ) s order by x), E'\n'),
         now(), 'ratchet snapshot: the grandfathered reader set as of this replacement', 'access_ladder_no_new_reader_of_the_org_flag.sql';
  perform pg_catalog.set_config('search_path', v_old, true);
end $$;

-- No tag filter: it fires on every DDL command and judges only the functions, procedures,
-- views, materialized views, policies (created or altered) and indexes the command touched;
-- every other object class is skipped in the loop.
create event trigger no_new_org_flag_reader
  on ddl_command_end
  execute function platform._no_new_org_flag_reader();

-- The census and the ratchet agree at birth: every live reader is grandfathered and nothing
-- grandfathered is missing (a drift here means another lane moved a reader mid-flight).
do $$
declare
  v_snapshot text;
  v_listed text;
begin
  select l.detail into v_snapshot from platform.ddl_guard_log l
   where l.rule = 'deprecated_org_flag_reader_ratchet' order by l.id desc limit 1;
  select array_to_string(array(
           select m[1]
             from regexp_matches(
                    pg_catalog.pg_get_functiondef('platform._no_new_org_flag_reader()'::regprocedure),
                    '''((?:function|view|policy|index) [^'']+)''', 'g') as m
            order by 1), E'\n')
    into v_listed;
  if v_snapshot is distinct from v_listed then
    raise exception 'access-ladder T-1: the live census and the grandfathered list disagree. census: % | list: %', v_snapshot, v_listed;
  end if;
end $$;
