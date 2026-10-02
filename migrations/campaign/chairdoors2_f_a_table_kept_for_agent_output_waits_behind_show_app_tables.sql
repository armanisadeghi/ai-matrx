-- chair-step: this adds ONE predicate, custom.table_kept_out_of_lists(text) (IMMUTABLE, SECURITY INVOKER, reads nothing), and ONE opt-in argument, p_include_app_tables, on the three list doors: custom.data_home_tables(uuid) and custom.table_list_everywhere(uuid) keep their signatures and bodies except one filter (a Table the predicate keeps out is left out unless the transaction-local setting custom.include_app_tables is 'on'), and each gains a two-argument SECURITY INVOKER overload (uuid, boolean) that sets that setting for its one call and puts it back; custom.data_home(uuid, text) becomes custom.data_home(uuid, text, boolean DEFAULT false) — its signature changes, so it is dropped and made again in this one transaction, its platform.client_callable_door row moved to the new signature and its EXECUTE grant to authenticated given back exactly as it stood. The two overloads get the same grants as their one-argument doors (authenticated, dashboard_user, service_role, svc_seo / authenticated). platform._t13_allowlist is NOT touched (its lists only shrink): no function that reads the retired row column changes its signature. No table, policy, index or data row is touched.
-- lane: CHAIR-DOORS-2 (asked by v6 lane 4 KINDS-GLUE, need N-C8)
-- based-on: custom.data_home(uuid, text) bdf37b45803bf3a9b44b1bd12dfc5c0a2e7deae69e8dc271693d04fcb92ef96f
-- based-on: custom.data_home_tables(uuid) dd9b099b99c511d686b0873b0c46be061c6c5df1fd34b6d8534aa84798ec6ed8
-- based-on: custom.table_list_everywhere(uuid) 410ee79bf99015c93a97df6235909916c45e3ce6e782b060d10c580b67bb7f59
--
-- A TABLE THE APP KEEPS FOR AN AGENT'S OUTPUT IS IN NO DEFAULT LIST (KINDS-GLUE wave 2 §2.2, N-C8). Every
-- registry kind an agent emits lands in an outputs table placed `kept_by_the_app: true, kept_for:
-- "agent_output"` (SC-1 placement). Before this file /data-v2 (custom.data_home), ⌘K and every picker on
-- custom.table_list_everywhere / custom.data_home_tables listed them beside the organization's own tables.
-- THE ONE PRIMITIVE: custom.table_kept_out_of_lists(kept_for) says which placement words stay out of
-- default lists (today only `agent_output`; the lists behind columns, scopes, forms, checklists and the
-- rest the data home lists by kind are NOT kept out). Every list door asks it; a caller that wants them
-- passes p_include_app_tables => true (the "Show app tables" switch). The records agent tools ask it too.
-- WHY OVERLOADS AND NOT A NEW ARGUMENT ON THE TWO OLD DOORS: both read the row column T-13 retires, and
-- platform._t13_allowlist names each reader by its signature and only shrinks — a (uuid, boolean)
-- signature would be a new reader. The overloads read nothing themselves; the one-argument doors stay
-- the only readers. Callers name both arguments (PostgREST picks the overload by argument names).
--
-- Guard: matrx-frontend/scripts/campaign-tests/chairdoors2_f_app_tables_wait_behind_one_switch.sql
-- Inverse: migrations/inverse/chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables_down.sql

create function custom.table_kept_out_of_lists(p_kept_for text)
 returns boolean
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  -- WHICH PLACEMENT WORDS STAY OUT OF EVERY DEFAULT LIST (lane CHAIR-DOORS-2, v6 N-C8). One word today:
  -- agent_output — the table an agent's outputs land in (KINDS-GLUE wave 2). A list shows such a Table
  -- only when its caller asks (p_include_app_tables). Null and every other word: not kept out.
  select coalesce(p_kept_for, '') = any (array['agent_output'])
$function$;
comment on function custom.table_kept_out_of_lists(text) is
  'CHAIR-DOORS-2 (N-C8): true when a Table placed kept_for this word stays out of every default table list '
  '(custom.data_home_tables, custom.data_home, custom.table_list_everywhere, the records agent tools). Today: agent_output.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'table_kept_out_of_lists', 'p_kept_for text', array['text'::regtype::oid],
        'A pure word test (IMMUTABLE, SECURITY INVOKER, reads nothing): whether a Table placed kept_for this word stays out of default table lists. The records agent tools ask it under the caller''s own seat. It grants nothing and writes nothing.',
        'chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables.sql', null, true, false);
grant execute on function custom.table_kept_out_of_lists(text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text) is null));


  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    team_reach as materialized (
      -- MY TEAM (lane DATA-HOME-2, 2026-09-30): (organization, person) pairs the signed-in person shares a
      -- live team with — iam.my_team_reach, the same answer every *_list_scoped RPC narrows My team by.
      select tr.organization_id, tr.user_id from iam.my_team_reach(null) tr
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'kept_by_the_app')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'kept_by_the_app')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end,
           -- MY TEAM: the Table's maker shares a live team with her in its organization.
           exists (select 1 from team_reach tr where tr.organization_id = a.id and tr.user_id = t.created_by),
           -- SYSTEM: the Table lives in an organization the platform itself keeps (iam.organizations.is_system).
           coalesce((select o2.is_system from iam.organizations o2 where o2.id = a.id), false),
           -- THE MAKER (lane DATA-HOME-2, 2026-09-30): the Table's own created_by, so a list outside the
           -- data home (the agent builder's picker) can run the shell's lanes on the same facts.
           t.created_by
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'kept_by_the_app', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      else exists (select 1 from options_ids o where o.id = t.id::text) end) as word) w) d
      ) pl
     -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
     -- default list (custom.table_kept_out_of_lists on its placement word) is listed only when the caller
     -- asks with p_include_app_tables. Every other Table the app keeps (lists, scopes, forms …) is unchanged.
     -- The switch travels as the transaction-local setting custom.include_app_tables, which only the
     -- two-argument overload sets (and puts back); unset, the Table stays out.
     where current_setting('custom.include_app_tables', true) is not distinct from 'on'
        or not custom.table_kept_out_of_lists(pl.p ->> 'kept_for');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
  v_org    uuid;
  v_all    jsonb := '[]'::jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization is asked through this same door with its name, so it meets its own wall
  -- and its own ladder below; this only adds the answers together, each row already carrying its
  -- organization_id. An organization whose wall refuses (42501) contributes nothing. No permission
  -- is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        v_all := v_all || coalesce(custom.table_list_everywhere(v_org) -> 'tables', '[]'::jsonb);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    select coalesce(jsonb_agg(x order by (x ->> 'last_activity_at') desc nulls last, (x ->> 'created_at') desc), '[]'::jsonb)
      into v_tables from jsonb_array_elements(v_all) x;
    return jsonb_build_object('success', true, 'tables', v_tables);
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records')
           -- SC-1 PLACEMENT: who keeps it, and whether the context picker offers it.
           || custom.table_placement(t.organization_id, t.id, t.data, false) as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_app_tables.
    from (select s.doc from store s
           where current_setting('custom.include_app_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;

create function custom.data_home_tables(p_organization_id uuid, p_include_app_tables boolean)
 returns TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- "SHOW APP TABLES" (lane CHAIR-DOORS-2, v6 N-C8): custom.data_home_tables(uuid) with the one switch. It
-- decides nothing itself — the one-argument door (SECURITY DEFINER, its own walls) answers; this only
-- tells it, through the transaction-local custom.include_app_tables, whether the Tables the app keeps out
-- of default lists are wanted, and puts the setting back as it found it, on every path.
declare
  v_was text := current_setting('custom.include_app_tables', true);
begin
  perform set_config('custom.include_app_tables', case when p_include_app_tables then 'on' else 'off' end, true);
  return query select * from custom.data_home_tables(p_organization_id);
  perform set_config('custom.include_app_tables', coalesce(v_was, ''), true);
exception when others then
  perform set_config('custom.include_app_tables', coalesce(v_was, ''), true);
  raise;
end
$function$;

create function custom.table_list_everywhere(p_organization_id uuid, p_include_app_tables boolean)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- "SHOW APP TABLES" (lane CHAIR-DOORS-2, v6 N-C8): custom.table_list_everywhere(uuid) with the one switch.
-- The one-argument door (SECURITY DEFINER, its own walls) answers; this only sets the transaction-local
-- custom.include_app_tables for that one call and puts it back as it found it, on every path.
declare
  v_was text := current_setting('custom.include_app_tables', true);
  v_out jsonb;
begin
  perform set_config('custom.include_app_tables', case when p_include_app_tables then 'on' else 'off' end, true);
  v_out := custom.table_list_everywhere(p_organization_id);
  perform set_config('custom.include_app_tables', coalesce(v_was, ''), true);
  return v_out;
exception when others then
  perform set_config('custom.include_app_tables', coalesce(v_was, ''), true);
  raise;
end
$function$;

comment on function custom.data_home_tables(uuid, boolean) is
  'CHAIR-DOORS-2 (N-C8): custom.data_home_tables(uuid) with the "Show app tables" switch. p_include_app_tables only WIDENS the one-argument door''s answer back to the Tables the caller could already open that the app keeps out of default lists (custom.table_kept_out_of_lists); it grants nothing.';
comment on function custom.table_list_everywhere(uuid, boolean) is
  'CHAIR-DOORS-2 (N-C8): custom.table_list_everywhere(uuid) with the "Show app tables" switch. p_include_app_tables only WIDENS the one-argument door''s answer back to the Tables the caller could already open that the app keeps out of default lists (custom.table_kept_out_of_lists); it grants nothing.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home_tables', 'p_organization_id uuid, p_include_app_tables boolean', array['uuid'::regtype::oid, 'boolean'::regtype::oid],
        'SECURITY INVOKER, reads nothing itself: sets the transaction-local custom.include_app_tables for one call of custom.data_home_tables(uuid) — a SECURITY DEFINER door that decides the organization (custom.assert_client_may_reach) and every Table by its own walls — and puts the setting back. The switch only WIDENS that door''s answer back to Tables the caller could already open that the app keeps out of default lists. It grants nothing and writes nothing.',
        'chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables.sql', null, true, false);
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'table_list_everywhere', 'p_organization_id uuid, p_include_app_tables boolean', array['uuid'::regtype::oid, 'boolean'::regtype::oid],
        'SECURITY INVOKER, reads nothing itself: sets the transaction-local custom.include_app_tables for one call of custom.table_list_everywhere(uuid) — a SECURITY DEFINER door that decides the organization (custom.assert_client_may_reach) and every Table by its own walls — and puts the setting back. The switch only WIDENS that door''s answer back to Tables the caller could already open that the app keeps out of default lists. It grants nothing and writes nothing.',
        'chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables.sql', null, true, false);
grant execute on function custom.data_home_tables(uuid, boolean) to authenticated, dashboard_user, service_role, svc_seo;
grant execute on function custom.table_list_everywhere(uuid, boolean) to authenticated;

drop function custom.data_home(uuid, text);
CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_app_tables boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
-- SEARCHED (lane DATA-HOME-3B, 2026-10-01): p_search narrows those same rows to the ones that match and
-- ranks them (see the campaign file's header); unsearched, nothing below the walk changes.
-- APP TABLES (lane CHAIR-DOORS-2, v6 N-C8, 2026-10-02): a Table the app keeps out of every default
-- list (custom.table_kept_out_of_lists — today the outputs an agent lands, kept_for agent_output) is
-- not among the tables unless p_include_app_tables is true — the page's "Show app tables" switch.
-- It is handed to custom.data_home_tables as is; it narrows, never widens, and searched rows obey it.
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_qid     uuid;
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.data_home searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tables
    from custom.data_home_tables(p_organization_id, p_include_app_tables) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  if v_q is not null then
    -- A WHOLE ID PASTED IN finds its row outright; any shorter run of hex never matches an id.
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_qid := v_q::uuid;
    end if;

    -- THE TABLES SHE MAY OPEN (above), ranked on title, description and Fields.
    with t as (
      select e as row_, (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
             coalesce(e ->> 'table_name', '') as nm, (e ->> 'updated_at')::timestamptz as at
        from jsonb_array_elements(v_tables) e
    ), d as (
      -- the Table's own description, read from the very Table record listed above
      select r.id, nullif(btrim(r.data ->> 'description'), '') as descr
        from t
        join custom.record r
          on r.organization_id = t.org
         and r.id = t.id
         and r.table_id = custom.table_kernel_id()
    ), f as (
      -- its live Fields (custom.applicable_fields' own rule: data.entity_definition_id = the Table)
      select (fr.data ->> 'entity_definition_id') as tid,
             array_agg(coalesce(nullif(btrim(fr.data ->> 'label'), ''), fr.data ->> 'key')
                       order by (fr.data ->> 'sort') nulls last, fr.id) as labels,
             array_agg(coalesce(fr.data ->> 'key', '') order by (fr.data ->> 'sort') nulls last, fr.id) as keys
        from custom.record fr
       where fr.organization_id = any (array(select distinct t.org from t))
         and fr.table_id = custom.field_kernel_id()
         and fr.deleted_at is null
         and (fr.data ->> 'entity_definition_id') in (select t.id::text from t)
       group by 1
    ), s as (
      select t.row_, t.nm, t.at, d.descr, f.labels, f.keys,
             public.mtx_search_score(v_q, case when v_qid is not null then t.id end, t.nm, d.descr,
                                     null, null, coalesce(f.labels, '{}'), coalesce(f.keys, '{}')) as rank,
             (v_qid is not null and t.id = v_qid) as by_id
        from t
        left join d on d.id = t.id
        left join f on f.tid = t.id::text
    ), hit as (
      select s.*,
             case
               when s.by_id then 'id'
               when public.mtx_search_score(v_q, null, s.nm, null, null, null) > 0 then 'name'
               when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0 then 'description'
               when public.mtx_search_score(v_q, null, null, null, null, null, coalesce(s.labels, '{}'), coalesce(s.keys, '{}')) > 0 then 'field'
               -- several words spread over title, description and Fields: say where the first word is
               when position(split_part(lower(v_q), ' ', 1) in lower(s.nm)) > 0 then 'name'
               when position(split_part(lower(v_q), ' ', 1) in lower(coalesce(s.descr, ''))) > 0 then 'description'
               else 'field'
             end as matched_in
        from s
       where s.rank > 0
    )
    select coalesce(jsonb_agg(
             h.row_ || jsonb_build_object(
               'match_rank', h.rank,
               'matched_in', h.matched_in,
               'matched_field', case when h.matched_in = 'field' then
                  (select coalesce(l.label, k.key)
                     from unnest(coalesce(h.labels, '{}')) with ordinality as l(label, o)
                     full join unnest(coalesce(h.keys, '{}')) with ordinality as k(key, o) using (o)
                    where position(split_part(lower(v_q), ' ', 1) in lower(coalesce(l.label, ''))) > 0
                       or position(split_part(lower(v_q), ' ', 1) in lower(coalesce(k.key, ''))) > 0
                    -- the Field that holds the whole search first, then the first that holds its first word
                    order by (position(lower(v_q) in lower(coalesce(l.label, ''))) > 0) desc,
                             (position(lower(v_q) in lower(coalesce(k.key, ''))) > 0) desc,
                             o
                    limit 1) end)
             order by h.rank desc, length(h.nm), h.at desc nulls last, h.nm), '[]'::jsonb)
      into v_tables
      from hit h;

    -- THE REST THE HOME LISTS (forms, booking pages, portals, dashboards, digests, checklists,
    -- automations, outside shares), ranked on their own title and description.
    with i as (
      select e as row_,
             coalesce(e -> 'item_row' ->> 'title', e -> 'item_row' ->> 'name', e -> 'item_row' ->> 'label', '') as nm,
             nullif(btrim(e -> 'item_row' ->> 'description'), '') as descr,
             (e ->> 'item_id')::uuid as id
        from jsonb_array_elements(v_items) e
    ), s as (
      select i.*,
             public.mtx_search_score(v_q, case when v_qid is not null then i.id end, i.nm, i.descr, null, null) as rank,
             (v_qid is not null and i.id = v_qid) as by_id
        from i
    )
    select coalesce(jsonb_agg(
             s.row_ || jsonb_build_object(
               'match_rank', s.rank,
               'matched_in', case when s.by_id then 'id'
                                  when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0
                                   and public.mtx_search_score(v_q, null, s.nm, null, null, null) = 0 then 'description'
                                  else 'name' end,
               'matched_field', null)
             order by s.rank desc, length(s.nm), s.nm), '[]'::jsonb)
      into v_items
      from s
     where s.rank > 0;
  end if;

  -- THE MAKER, BY NAME (lane DATA-HOME-3B2, 2026-10-01). Every Table row gains created_by_name: the
  -- name custom.history_people gives its maker (created_by) in the Table's own organization — the
  -- same door that names who changed a row on this page (custom.hub_changed_by), so Owner and
  -- Changed by never disagree about a person's name. Only a member of that organization is named;
  -- a maker who is not one (left, or never was) is null and the page shows its dash. One
  -- history_people call per organization, after any search narrowing; row order is kept.
  with mk as (
    select (e ->> 'organization_id')::uuid as org, array_agg(distinct (e ->> 'created_by')::uuid) as ids
      from jsonb_array_elements(v_tables) e
     where e ->> 'created_by' is not null
     group by 1
  ), people as materialized (
    -- asked once per organization (materialized: never once per row)
    select mk.org, custom.history_people(mk.org, mk.ids) as m from mk
  )
  select coalesce(jsonb_agg(t.e || jsonb_build_object('created_by_name', p.m #>> array[t.e ->> 'created_by', 'name'])
                  order by t.o), '[]'::jsonb)
    into v_tables
    from jsonb_array_elements(v_tables) with ordinality as t(e, o)
    left join people p on p.org = (t.e ->> 'organization_id')::uuid;

  with ids as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  if v_q is null then
    return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
  end if;
  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed, 'search', v_q);
end;
$function$;

comment on function custom.data_home(uuid, text, boolean) is
  'THE DATA HOME IN ONE CALL (DATA-HOME-2, DATA-HOME-3B, DATA-HOME-3B2): the rows of custom.data_home_tables, custom.data_home_items and custom.data_home_changed_by, searched by p_search when given. CHAIR-DOORS-2 (N-C8): p_include_app_tables is handed to custom.data_home_tables.';
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_search text, p_include_app_tables boolean',
       identity_argtypes = array['uuid'::regtype::oid, 'text'::regtype::oid, 'boolean'::regtype::oid],
       declared_by = 'chairdoors2_f_a_table_kept_for_agent_output_waits_behind_show_app_tables.sql',
       reason = reason || ' p_include_app_tables only WIDENS the one-argument door''s answer back to the Tables the caller could already open that the app keeps out of default lists (custom.table_kept_out_of_lists); it grants nothing.'
 where schema_name = 'custom' and function_name = 'data_home';
grant execute on function custom.data_home(uuid, text, boolean) to authenticated;
