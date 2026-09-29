-- chair-step: this ADDS custom.data_home(uuid) — the data home page's one call — and changes one clause in each of custom.data_home_tables(uuid), custom.data_home_items(uuid) and custom.data_home_changed_by(jsonb): an organization whose Table-visibility answer is already in the current statement's memo is not walked again. Called alone, each door walks exactly as before; called by custom.data_home, which asks the walk once first, none walks again. Rows unchanged (suites F and J prove it). The three doors stay callable; their platform.client_callable_door rows say they are served by custom.data_home for the page. No data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_tables(uuid) c165bb7004f6665701fa2b96d11eb2036f1d0f108fb72ff2ff60364234f48ad1
-- based-on: custom.data_home_items(uuid) 8ee9e50854a25086fc9caa42ed9fcbcf000cd28bed380e88278a42624b0a9b57
-- based-on: custom.data_home_changed_by(jsonb) 023c16c0f1a0b3fdc980465da980a617539cff67e8d33762a0605fe6b7263a22
--
-- THE DATA HOME ASKS ONE DOOR (chair ruling 2026-09-29, after STORE-READ-PERF-3 made the visibility
-- answer shared): the page paid one walk per door. Budget: the whole home under 400 ms warm for both
-- seats on the clone (suite J).
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql (J, K)
-- Inverse: migrations/inverse/datahome2_g_the_data_home_is_one_call_down.sql

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, kept_by_the_app boolean, kind text)
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
           end
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
      ) pl;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_items(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, organization_id uuid, organization_name text, item_id uuid, table_id uuid, table_name text, item_row jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_owner  boolean := custom.query_is_store_owner();
  v_tbl    record;
  v_read   jsonb;
  v_a_id   uuid[];
  v_a_name text[];
  v_a_member boolean[];
  v_v_org  uuid[];
  v_v_id   uuid[];
  v_tpl    jsonb := '{}'::jsonb;
  -- STORE-READ-PERF-3: the one ladder's viewer answer about every live Table of her organizations.
  v_s_org  uuid[];
  v_s_id   uuid[];
  v_s_seen boolean[];
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach,
  -- or the call is refused here, naming this door. Named nobody, the walk below admits only
  -- organizations the caller reaches (the same arms: iam.has_org_access / custom.portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_items');
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
  -- (A portal whose Table is then not in v_s_* is asked on its own below — the same answer.)
  select coalesce(array_agg(g.organization_id), '{}'), coalesce(array_agg(g.id), '{}'), coalesce(array_agg(g.seen), '{}')
    into v_s_org, v_s_id, v_s_seen
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text) is null)) g;


  -- custom.data_home_tables()'s organizations, word for word — held in arrays (a STABLE door writes
  -- nothing, not even a temporary table). `member` is kept: it decides the walk below.
  select coalesce(array_agg(z.id), '{}'), coalesce(array_agg(z.name), '{}'), coalesce(array_agg(z.member), '{}')
    into v_a_id, v_a_name, v_a_member
    from (
      select o.id, o.name::text as name, bool_or(x.member) as member
        from (
          select m.organization_id as id, true as member
            from iam.organization_member m
           where m.user_id = v_me
          union
          select t.organization_id, false
            from iam.permissions g
            join custom.record t
              on t.id = g.resource_id
             and t.table_id = v_kernel
             and t.deleted_at is null
           where g.resource_type = 'record'
             and g.granted_to_user_id = v_me
             and g.status = 'active'
             and (g.expires_at is null or g.expires_at > now())
        ) x
        join iam.organizations o on o.id = x.id and o.archived_at is null
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         and (p_organization_id is null or o.id = p_organization_id)
       group by o.id, o.name
    ) z;

  -- THE ONE WALK, custom.data_home_tables()' own: in an organization the caller belongs to, every
  -- Table custom.query_visible_ids opens to her, asked ONCE for all kinds; in one she was only let
  -- into, the Tables a live grant names (which is all that walk opens to an outsider — suite F).
  select coalesce(array_agg(w.org_id), '{}'), coalesce(array_agg(w.id), '{}')
    into v_v_org, v_v_id
    from (
      select a.id as org_id, v.v as id
        from unnest(v_a_id, v_a_member) a(id, member)
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from unnest(v_a_id, v_a_member) a(id, member)
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
        join custom.record gt
          on gt.id = g.resource_id and gt.organization_id = a.id and gt.table_id = v_kernel
       where not a.member
    ) w;

  -- FORMS (custom.forms' wall and columns).
  return query
    select 'form'::text, a.id, a.name, f.id, f.table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'form_id', f.id, 'table_id', f.table_id, 'title', f.title, 'slug', f.slug,
             'published_at', f.published_at, 'closed_at', f.closed_at, 'submission_cap', f.submission_cap,
             'responses', s.responses, 'in_table', s.in_table, 'held', s.held, 'rejected', s.rejected,
             'state', case when f.published_at is null then 'draft'
                           when f.closed_at is not null then 'closed'
                           when f.submission_cap is not null and s.live >= f.submission_cap then 'full'
                           else 'open' end,
             'quarantine_rule_id', f.quarantine_rule_id, 'notify_rule_id', f.notify_rule_id,
             'presentation', f.presentation)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.anon_form f on f.organization_id = a.id and f.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = f.table_id
      left join custom.record t on t.organization_id = a.id and t.id = f.table_id and t.deleted_at is null
      left join lateral (
        select count(x.id) as responses,
               count(x.id) filter (where x.state = 'cleared') as in_table,
               count(x.id) filter (where x.state = 'quarantined') as held,
               count(x.id) filter (where x.state = 'rejected') as rejected,
               count(x.id) filter (where x.state <> 'rejected') as live
          from custom.anon_submission x
         where x.organization_id = f.organization_id and x.form_id = f.id) s on true;

  -- BOOKING PAGES (custom.bookings' wall and the columns the home reads).
  return query
    select 'booking'::text, a.id, a.name, f.id, f.table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'form_id', f.id, 'table_id', f.table_id, 'title', coalesce(f.title, 'Book a time'),
             'slug', f.slug, 'published_at', f.published_at, 'closed_at', f.closed_at,
             'slot_minutes', (f.presentation -> 'booking' ->> 'slot_minutes')::integer,
             'timezone', f.presentation -> 'booking' ->> 'timezone',
             'slot_table_id', (f.presentation -> 'booking' ->> 'slot_table_id')::uuid,
             'booked', coalesce(b.booked, 0), 'cancelled', coalesce(b.cancelled, 0),
             'upcoming', coalesce(b.upcoming, 0), 'next_at', b.next_at,
             'state', case when f.closed_at is not null then 'closed'
                           when f.published_at is null then 'draft' else 'open' end)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.anon_form f
        on f.organization_id = a.id and f.deleted_at is null and f.presentation ? 'booking'
      left join custom.record t on t.organization_id = a.id and t.id = f.table_id and t.deleted_at is null
      left join lateral (
        select count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled') as booked,
               count(*) filter (where r.data ->> 'status' = 'cancelled') as cancelled,
               count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                                  and (r.data ->> 'slot')::timestamptz > now()) as upcoming,
               min((r.data ->> 'slot')::timestamptz) filter (
                 where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                   and (r.data ->> 'slot')::timestamptz > now()) as next_at
          from custom.anon_submission s
          join custom.record r
            on r.organization_id = s.organization_id and r.id = s.record_id and r.deleted_at is null
         where s.organization_id = f.organization_id and s.form_id = f.id
           and s.booking_ref is not null) b on true
     where custom.my_level(a.id, f.table_id, 'table') is not null;

  -- PORTALS, and which Tables each shows (custom.list_portals' / custom.portal_tables' wall).
  return query
    select 'portal'::text, a.id, a.name, p.id, p.client_table_id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'portal_id', p.id, 'title', p.title, 'slug', p.slug, 'client_table_id', p.client_table_id,
             'client_table', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
             'is_active', p.is_active,
             'tables', (select count(*)::integer from custom.portal_table pt where pt.portal_id = p.id),
             'invited', (select count(*)::integer from custom.portal_principal pp
                          where pp.portal_id = p.id and pp.is_active),
             'signed_in', (select count(*)::integer from custom.portal_principal pp
                            where pp.portal_id = p.id and pp.is_active and pp.user_id is not null),
             'sign_in_method', p.sign_in_method, 'opened_at', p.opened_at,
             'shows', coalesce((
               select jsonb_agg(jsonb_build_object('table_id', pt.table_id,
                                                   'name', coalesce(nullif(st.data ->> 'name', ''), 'a table'))
                                order by coalesce(nullif(st.data ->> 'name', ''), 'a table'))
                 from custom.portal_table pt
                 left join custom.record st on st.organization_id = pt.organization_id and st.id = pt.table_id
                where pt.portal_id = p.id and pt.organization_id = a.id), '[]'::jsonb))
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.portal p on p.organization_id = a.id and p.archived_at is null
      left join custom.record t on t.organization_id = p.organization_id and t.id = p.client_table_id
     -- STORE-READ-PERF-3: a live Table of her organizations is answered from the walk above (the same
     -- custom.has_visibility answer); anything else is asked on its own, as before.
     where coalesce((select s.seen from unnest(v_s_org, v_s_id, v_s_seen) as s(org, id, seen)
                      where s.org = a.id and s.id = p.client_table_id limit 1),
                    custom.has_visibility(v_me, 'record', p.client_table_id, 'viewer'::public.permission_level));

  -- DASHBOARDS (custom.dashboards' wall: the Table's own).
  return query
    select 'dashboard'::text, a.id, a.name, d.id, nullif(d.data ->> 'subject_table_id', '')::uuid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'dashboard_id', d.id, 'table_id', nullif(d.data ->> 'subject_table_id', '')::uuid,
             'name', d.data ->> 'name',
             'block_count', jsonb_array_length(coalesce(d.data -> 'blocks', '[]'::jsonb)),
             'version', d.version, 'created_at', d.created_at, 'updated_at', d.updated_at)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record d
        on d.organization_id = a.id
       and d.table_id = custom.presentation_kernel_id()
       and d.data_class = custom.dashboard_class()
       and d.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = nullif(d.data ->> 'subject_table_id', '')::uuid
      left join custom.record t on t.organization_id = a.id and t.id = vis.id and t.deleted_at is null;

  -- DIGESTS AND NOTIFICATIONS (custom.subscriptions' wall).
  return query
    select 'digest'::text, a.id, a.name, r.id, (r.data ->> 'scope_table_id')::uuid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'rule_id', r.id, 'name', coalesce(r.data ->> 'name', 'Subscription'),
             'table_id', (r.data ->> 'scope_table_id')::uuid,
             'saved_view_id', nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
             'cadence', custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
             'channel', coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
             'recipient_user_id', nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
             'muted', coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false),
             'mine', nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me)
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record r
        on r.organization_id = a.id and r.data_class = 'rule' and r.deleted_at is null
       and r.data ? 'subscription'
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = (r.data ->> 'scope_table_id')::uuid
      left join custom.record t on t.organization_id = a.id and t.id = vis.id and t.deleted_at is null
     where nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
        or custom.has_visibility(v_me, 'record', vis.id, 'admin'::public.permission_level);

  -- CHECKLISTS (custom.checklist_templates' wall and its page per organization).
  if not v_owner then
    v_tpl := custom.levels_of(v_me, array(
               select c.id from unnest(v_a_id) a(id)
                 join custom.record c
                   on c.organization_id = a.id and c.data_class = 'checklist_template' and c.deleted_at is null));
  end if;
  return query
    select 'checklist'::text, q.org_id, q.org_name, q.id, q.about, q.about_name, q.r
      from (
        select a.id as org_id, a.name as org_name, c.id,
               nullif(c.data ->> 'about_table_id', '')::uuid as about,
               case when nullif(c.data ->> 'about_table_id', '') is null then null
                    else coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table') end as about_name,
               jsonb_build_object(
                 'template_id', c.id, 'name', c.data ->> 'name',
                 'about_table_id', nullif(c.data ->> 'about_table_id', '')::uuid,
                 'about_table', t.data ->> 'name',
                 'steps', jsonb_array_length(coalesce(c.data -> 'steps', '[]'::jsonb)),
                 'roles', jsonb_array_length(coalesce(c.data -> 'roles', '[]'::jsonb)),
                 'trigger_kind', coalesce(c.data #>> '{trigger,kind}', 'manual'),
                 'trigger_status', nullif(c.data #>> '{trigger,status}', ''),
                 'open_runs', (select count(*)::integer from custom.record run
                                where run.organization_id = a.id and run.data_class = 'checklist_run'
                                  and run.deleted_at is null
                                  and nullif(run.data ->> 'template_id', '')::uuid = c.id
                                  and nullif(run.data ->> 'closed_at', '') is null),
                 'total_runs', (select count(*)::integer from custom.record run
                                 where run.organization_id = a.id and run.data_class = 'checklist_run'
                                   and run.deleted_at is null
                                   and nullif(run.data ->> 'template_id', '')::uuid = c.id),
                 'updated_at', c.updated_at) as r,
               row_number() over (partition by a.id order by c.updated_at desc) as n,
               ps.cap
          from unnest(v_a_id, v_a_name) a(id, name)
          cross join lateral (select custom.page_size(a.id, 'custom.checklist_templates', 100, 100, 200) as cap) ps
          join custom.record c
            on c.organization_id = a.id and c.data_class = 'checklist_template' and c.deleted_at is null
          left join custom.record t
            on t.organization_id = c.organization_id and t.id = nullif(c.data ->> 'about_table_id', '')::uuid
         -- STORE-READ-PERF-3: the same custom.has_visibility answer, asked of every template at once
         -- through custom.levels_of (once per class of templates the ladder cannot tell apart).
         where v_owner or coalesce((v_tpl -> c.id::text ->> 's')::boolean, false)
      ) q
     where q.n <= q.cap;

  -- OUTSIDE SHARES (custom.shares_outside' wall).
  return query
    select 'share'::text, a.id, a.name, i.id, t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           jsonb_build_object(
             'invitation_id', i.id, 'table_id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'email', i.email, 'level', coalesce(i.metadata ->> 'level', 'viewer'),
             'level_label', iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
             'status', i.status, 'joined', i.status = 'accepted',
             'expired', i.expires_at is not null and i.expires_at <= now(),
             'invited_at', i.created_at, 'expires_at', i.expires_at,
             'say', case
               when i.status = 'accepted'
                 then format('%s can open %s as a %s.', i.email,
                             coalesce(nullif(t.data ->> 'name', ''), 'this table'),
                             coalesce(i.metadata ->> 'level', 'viewer'))
               when i.expires_at is not null and i.expires_at <= now()
                 then format('%s was invited to %s, and the invitation has run out. Resend it from that table to give them a fresh link.', i.email,
                             coalesce(nullif(t.data ->> 'name', ''), 'a table'))
               else format('%s is invited to %s and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email,
                           coalesce(nullif(t.data ->> 'name', ''), 'a table'))
             end)
      from unnest(v_a_id, v_a_name) a(id, name)
      join iam.invitations i
        on i.organization_id = a.id and i.target_type = 'custom_table'
       and i.deleted_at is null and i.status <> 'revoked'
      join custom.record t
        on t.id = i.target_id and t.organization_id = a.id
       and t.table_id = v_kernel and t.deleted_at is null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = t.id;

  -- AUTOMATIONS (custom.pipelines, row for row: a board that cannot be read is listed with why).
  for v_tbl in
    select a.id as org_id, a.name as org_name, t.id,
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)') as name, t.updated_at, t.updated_by
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record t
        on t.organization_id = a.id and t.table_id = v_kernel and t.deleted_at is null
       and nullif(t.data ->> 'stage_field', '') is not null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = t.id
  loop
    begin
      v_read := custom.pipeline_read(v_tbl.org_id, v_tbl.id);
    exception when others then
      kind := 'automation'; organization_id := v_tbl.org_id; organization_name := v_tbl.org_name;
      item_id := v_tbl.id; table_id := v_tbl.id; table_name := v_tbl.name;
      item_row := jsonb_build_object('table_id', v_tbl.id, 'table_name', v_tbl.name, 'stage_field', null,
                                     'stage_label', null, 'stages', 0, 'rules', 0, 'broken', sqlerrm,
                                     'updated_at', v_tbl.updated_at, 'updated_by', v_tbl.updated_by);
      return next;
      continue;
    end;
    if coalesce((v_read ->> 'is_pipeline')::boolean, false) then
      kind := 'automation'; organization_id := v_tbl.org_id; organization_name := v_tbl.org_name;
      item_id := v_tbl.id; table_id := v_tbl.id; table_name := v_tbl.name;
      item_row := jsonb_build_object(
        'table_id', v_tbl.id, 'table_name', v_tbl.name,
        'stage_field', v_read ->> 'stage_field', 'stage_label', v_read ->> 'stage_label',
        'stages', jsonb_array_length(coalesce(v_read -> 'stages', '[]'::jsonb)),
        'rules', jsonb_array_length(coalesce(v_read -> 'rules', '[]'::jsonb)),
        'broken', null, 'updated_at', v_tbl.updated_at, 'updated_by', v_tbl.updated_by);
      return next;
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_changed_by(p_asks jsonb)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ask jsonb;
  v_org uuid;
begin
  -- WHO CHANGED EACH ROW, FOR EVERY ORGANIZATION THE HOME SHOWS, IN ONE CALL (lane DATA-HOME-2).
  -- p_asks = [{"organization_id": …, "kind": "structure"|"form"|"portal", "ids": [...]}, …].
  -- Each organization is decided HERE, in this door's own name, before custom.hub_changed_by —
  -- the store's own answer — is asked about it.
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    raise exception 'custom.data_home_changed_by takes a list of asks, one per organization and kind'
      using errcode = '22023',
            hint = 'Send [{"organization_id": "<uuid>", "kind": "structure", "ids": ["<uuid>", ...]}].';
  end if;
  if jsonb_array_length(p_asks) > 200 then
    raise exception 'custom.data_home_changed_by was asked % things at once', jsonb_array_length(p_asks)
      using errcode = '54000', hint = 'Ask about at most 200 (organization, kind) pairs at a time.';
  end if;
  -- STORE-READ-PERF-3 (2026-09-28): one walk for every organization asked (see
  -- custom.tables_seen_once_per_group); each custom.hub_changed_by below reads its organization's
  -- part from this statement's memo. It decides nothing: every organization is still decided in
  -- this door's name below, and without it every answer is the same, only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(custom.query_principal(), array(
            select distinct (e ->> 'organization_id')::uuid
              from jsonb_array_elements(p_asks) e
             where e ->> 'kind' in ('structure', 'form', 'portal')
               and (e ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and exists (select 1 from iam.organization_member m
                            where m.organization_id = (e ->> 'organization_id')::uuid
                              and m.user_id = custom.query_principal())
               and platform.memo_k_get('custom.tables_seen:' || custom.query_principal()::text || ':'
                                       || (e ->> 'organization_id')) is null));
  for v_ask in select * from jsonb_array_elements(p_asks) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.data_home_changed_by');
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(
               v_org,
               v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid)
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
declare
  v_me      uuid := custom.query_principal();
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
    from custom.data_home_tables(p_organization_id) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

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

  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
end;
$function$;


comment on function custom.data_home(uuid) is
  'THE DATA HOME IN ONE CALL (lane DATA-HOME-2): {tables, items, changed_by} — exactly custom.data_home_tables, '
  'custom.data_home_items and custom.data_home_changed_by for the page''s rows, with the Table-visibility walk '
  'asked once for all of them.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home', 'p_organization_id uuid', array['uuid'::regtype::oid],
        'Decides a named organization first in its own name (custom.assert_client_may_reach), asks the Table-visibility walk (custom.tables_seen_once_per_group) once for the caller''s organizations, then answers with the rows of custom.data_home_tables, custom.data_home_items and custom.data_home_changed_by — each of which decides every organization and row by its own walls, unchanged. p_organization_id only NARROWS. An anonymous caller gets empty lists. It writes nothing.',
        'datahome2_g_the_data_home_is_one_call.sql', null, true, false)
on conflict do nothing;

update platform.client_callable_door
   set reason = reason || ' SERVED BY custom.data_home(uuid) for the data home page (lane DATA-HOME-2, 2026-09-29); kept callable for other callers.'
 where schema_name = 'custom'
   and function_name in ('data_home_tables', 'data_home_items', 'data_home_changed_by')
   and reason not like '%SERVED BY custom.data_home(uuid)%';

grant execute on function custom.data_home(uuid) to authenticated;
