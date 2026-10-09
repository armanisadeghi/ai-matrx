-- chair-step: undo hotdoors7_d - custom.data_home_items stops leaving the templates' answer in the memo and custom.hub_changed_by_many hands asks holding a template to custom.hub_changed_by again. Run BEFORE the inverses of c, b, a.
-- lane: HOT-DOORS-7
-- based-on: custom.data_home_items(uuid) 14261e364e0856ab2c13245dd816afa35d3ecf7e091f7b00bf737eebe55c0d37
-- based-on: custom.hub_changed_by_many(jsonb, text) 857b7ccbfdefb26c03f581f87f7e4812735e20be30f171544bb6cf7f2e9bfde5

set local statement_timeout = '60s';

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
  v_hd6    boolean := custom.hot_doors_6_on(null);
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
               and (p_organization_id is null or m.organization_id = p_organization_id))) g;
  -- PERF-FIX-3: the walk is asked for EVERY organization, not only those the memo lacks. The filter that stood
  -- here tested a memo key without the snapshot the walk writes (it never matched, so it never narrowed);
  -- narrowed properly it would hand back no rows when data_home had walked them, and v_s_* below would be
  -- empty. Asked for all, the walk's own memo shortcut answers from the statement memo when they are all
  -- there (data_home), and walks them when they are not (a lone call), the same rows either way.


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
     -- HOT-DOORS-6 b (2026-10-09): a booking page whose Table the walk above already says she sees (the viewer
     -- answer, the same one the portal arm below trusts) is kept without asking custom.my_level - which would
     -- have passed its open check on that same answer and returned at least viewer. Every other booking page
     -- (not seen, not walked, the store owner, or the switch off) asks custom.my_level exactly as before.
     where case when v_hd6 and not v_owner
                     and coalesce((select s.seen from unnest(v_s_org, v_s_id, v_s_seen) as s(org, id, seen)
                                    where s.org = a.id and s.id = f.table_id limit 1), false)
                then true
                -- HOT-DOORS-6 e: custom.my_level RAISES 42501 for a Table the person cannot see, which would fail the
                -- whole data home for one booking page on an invisible Table. Ask the ladder first (the same
                -- custom.has_visibility answer custom.assert_client_may_open decides on): a Table she cannot see is
                -- skipped, not an error. The store owner (whom the open check lets through) and every visible Table
                -- ask custom.my_level exactly as before.
                when v_owner or custom.has_visibility(v_me, 'record', f.table_id, 'viewer'::public.permission_level)
                then custom.my_level(a.id, f.table_id, 'table') is not null
                else false end;

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
             'presentation', d.data -> 'presentation',
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
  -- PERF-FIX-4 e (2026-10-07): DIGESTS, same rows; mx.data_home_set = off runs the query as it was.
  if coalesce(current_setting('mx.data_home_set', true), '') <> 'off' then
  return query
    with rr as materialized (
      -- the subscription rules of these organizations, read ONCE per organization (joined directly, the
      -- planner re-read every row of the organization once per visible Table: 736,849 buffers, 3.5 s,
      -- for a person in 5 organizations with 305 Tables)
      select r.* from unnest(v_a_id) o(id)
        join custom.record r
          on r.organization_id = o.id and r.data_class = 'rule' and r.deleted_at is null
         and r.data ? 'subscription'
    ), adm as materialized (
      -- DATA-HOME-SLIM (2026-10-08): THE ADMIN CHECK, ONCE FOR THE SET. Each rule that is not her own
      -- subscription asked custom.has_visibility(v_me, 'record', <its Table>, 'admin') one row at a time.
      -- At admin (above viewer, so its arm 4 never answers) that function is exactly: the Table is not
      -- being copied by somebody else (custom._copy_in_progress_hides) AND custom.reaches_directly at
      -- admin. Asked here once, for every distinct Table such a rule names among the Tables she sees,
      -- through custom.reaches_directly_many (that very function per target, its shared reads done once).
      select m.target as id
        from custom.reaches_directly_many(v_me, array(
               select distinct vis.id
                 from rr r
                 join unnest(v_v_org, v_v_id) vis(org_id, id)
                   on vis.org_id = r.organization_id and vis.id = (r.data ->> 'scope_table_id')::uuid
                where nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is distinct from v_me),
               'record', 'admin'::public.permission_level) m
       where m.reaches
         and not custom._copy_in_progress_hides(v_me, m.target)
    )
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
      join rr r on r.organization_id = a.id
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = (r.data ->> 'scope_table_id')::uuid
      left join custom.record t on t.organization_id = a.id and t.id = vis.id and t.deleted_at is null
     where nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
        or vis.id in (select adm.id from adm);
  else
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
  end if;

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
  -- HOT-DOORS-5 (2026-10-09): the Tables with a stage field are found per organization FIRST (a handful), then
  -- kept when the walk above opened them. Joined the other way round, the planner walked every Table she sees
  -- (1,517 for admin@admin.com) and, for each, re-read every Table of its organization (206,000 buffers, ~140 ms).
  -- Same rows: v_v_* is a set (a UNION), so the semi-join keeps exactly the rows the join kept. Only while
  -- iam.kernel_batch_on (knob access/kernel_batch); otherwise the join as it was.
  for v_tbl in
    with st as materialized (
      select a.id as org_id, a.name as org_name, t.id,
             coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)') as name, t.updated_at, t.updated_by
        from unnest(v_a_id, v_a_name) a(id, name)
        join custom.record t
          on t.organization_id = a.id and t.table_id = v_kernel and t.deleted_at is null
         and nullif(t.data ->> 'stage_field', '') is not null
    )
    select st.org_id, st.org_name, st.id, st.name, st.updated_at, st.updated_by
      from st
     where iam.kernel_batch_on(null)
       and exists (select 1 from unnest(v_v_org, v_v_id) vis(org_id, id)
                    where vis.org_id = st.org_id and vis.id = st.id)
    union all
    -- knob access/kernel_batch off (or after a write): the join as it was
    select a.id, a.name, t.id,
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'), t.updated_at, t.updated_by
      from unnest(v_a_id, v_a_name) a(id, name)
      join custom.record t
        on t.organization_id = a.id and t.table_id = v_kernel and t.deleted_at is null
       and nullif(t.data ->> 'stage_field', '') is not null
      join unnest(v_v_org, v_v_id) vis(org_id, id) on vis.org_id = a.id and vis.id = t.id
     where not iam.kernel_batch_on(null)
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
$function$
;

CREATE OR REPLACE FUNCTION custom.hub_changed_by_many(p_asks jsonb, p_door text DEFAULT NULL::text)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- HOT-DOORS-7 (2026-10-09). custom.hub_changed_by(<organization>, <kind>, <ids>) for every ask of p_asks
-- ([{"organization_id", "kind", "ids"}], custom.data_home_changed_by's shape) in ONE statement: the rows each ask
-- would return, with its organization. custom.data_home_changed_by asked custom.hub_changed_by once per ask (31 for
-- admin@admin.com's data home); here the walls are asked per ask, in order, exactly as before (p_door's own
-- custom.assert_client_may_reach first when named, then custom.hub_changed_by's: its wall, its kind and size checks),
-- and then every arm is answered for all the asks at once:
--   structure  custom.visible_set's Table-kernel answer per organization (custom.kernel_viewer_sets, the same
--              answer from the same statement memo), the ladder's level per id from the statement memo
--              custom.data_home_changed_by leaves (custom.hub_levels) when it holds every id an ask needs, else
--              custom.levels_of (one call for every such ask; levels_of answers each id on its own); an ask with a
--              row neither answers (the per-row ladder) is asked of custom.hub_changed_by itself, whole;
--   form/portal the organization's Table list (custom.query_visible_ids, one call per organization) when this
--              statement already walked it; an organization it did not walk is asked of custom.hub_changed_by itself.
-- Names: custom.history_people once per organization (its answer about a person never depends on who else is asked).
-- Only while custom.hot_doors_7_on: otherwise (and after a write) every ask goes to custom.hub_changed_by as before.
declare
  v_me     uuid := custom.query_principal();
  v_owner  boolean := custom.query_is_store_owner();
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
  v_ask    jsonb;
  v_org    uuid;
  v_kind   text;
  v_ids    uuid[];
  v_set    boolean := custom.hot_doors_7_on(null)
                      and coalesce(current_setting('mx.data_home_set', true), '') <> 'off';
  v_pre    jsonb;
  v_levels jsonb := '{}'::jsonb;
  v_sets   jsonb := '{}'::jsonb;   -- organization -> its seen Tables, when custom.visible_set did not stop
  v_need   jsonb := '{}'::jsonb;   -- ask number -> ids custom.levels_of would be asked
  v_lv_ids uuid[] := '{}'::uuid[];
  v_n      integer := 0;
  v_alone  integer[] := '{}'::integer[];  -- asks answered by custom.hub_changed_by itself
begin
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    return;
  end if;
  -- THE WALLS, ask by ask, in order, as custom.data_home_changed_by and custom.hub_changed_by ask them
  for v_ask in select e from jsonb_array_elements(p_asks) e loop
    v_n := v_n + 1;
    v_org := (v_ask ->> 'organization_id')::uuid;
    if p_door is not null then
      perform custom.assert_client_may_reach(v_org, p_door);
    end if;
    v_kind := v_ask ->> 'kind';
    v_ids := array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e);
    if not v_set then
      return query select v_org, c.id, c.at, c.who from custom.hub_changed_by(v_org, v_kind, v_ids) c;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.hub_changed_by');
    if v_kind not in ('structure', 'form', 'portal') then
      raise exception 'custom.hub_changed_by does not know the kind %', coalesce(v_kind, '(null)')
        using errcode = '22023',
              hint = 'The kinds are: structure (a Table, dashboard, rule, checklist or work '
                     'template), form (a form, booking page or capture sheet) and portal.';
    end if;
    if array_length(v_ids, 1) > 500 then
      raise exception 'custom.hub_changed_by was asked about % things at once', array_length(v_ids, 1)
        using errcode = '54000',
              hint = 'Ask about at most 500 at a time — that is one page of a hub, and more '
                     'than a person reads.';
    end if;
    -- a form or portal ask about an organization this statement has not walked: custom.hub_changed_by's own arm
    if v_kind is distinct from 'structure' and array_length(v_ids, 1) is not null
       and platform.memo_k_get('custom.tables_seen:' || coalesce(v_me::text, '-') || ':' || v_org::text || ':' || v_snap) is null then
      v_alone := v_alone || v_n;
    end if;
  end loop;
  if not v_set then
    return;
  end if;

  -- custom.visible_set's Table-kernel answer for every organization a structure ask names a live Table of
  -- (custom.hub_changed_by asks it exactly then), one call for all of them
  select coalesce(jsonb_object_agg(k.organization_id::text, to_jsonb(k.carried_visible)) filter (where not k.fallback), '{}'::jsonb)
    into v_sets
    from custom.kernel_viewer_sets(v_me, array(
           select distinct (x.e ->> 'organization_id')::uuid
             from jsonb_array_elements(p_asks) with ordinality x(e, n)
            where x.e ->> 'kind' = 'structure'
              and not (x.n::integer = any (v_alone))
              and exists (select 1 from custom.record t
                           where t.organization_id = (x.e ->> 'organization_id')::uuid
                             and t.id = any (array(select (i #>> '{}')::uuid
                                                     from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i))
                             and t.table_id = v_kernel
                             and t.deleted_at is null))) k;

  -- the ladder's level for every id custom.hub_changed_by would hand to custom.levels_of, per ask: from the statement
  -- memo custom.data_home_changed_by leaves when it holds every id the ask needs, else from custom.levels_of
  if not v_owner then
    v_pre := platform.memo_k_get('custom.hub_levels:' || coalesce(v_me::text, '-') || ':' || v_snap)::jsonb;
    with a as materialized (
      select x.n, (x.e ->> 'organization_id')::uuid as org,
             array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i) as ids
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
       where x.e ->> 'kind' = 'structure'
    ), nd as materialized (
      select a.n, coalesce(array_agg(r.id) filter (where r.id is not null), '{}'::uuid[]) as need
        from a
        left join custom.record r
          on r.organization_id = a.org and r.id = any (a.ids)
         and coalesce(r.data_class, 'record') <> 'record'
         and r.table_id is not null
         and r.table_id is distinct from v_kernel
       group by a.n
    )
    select coalesce(jsonb_object_agg(nd.n::text, jsonb_build_object(
             'covered', v_pre is not null and v_pre ?& nd.need::text[], 'need', to_jsonb(nd.need))), '{}'::jsonb)
      into v_need
      from nd;
    v_lv_ids := array(select distinct x::uuid
                        from jsonb_each(v_need) e, jsonb_array_elements_text(e.value -> 'need') x
                       where not (e.value ->> 'covered')::boolean);
    if cardinality(v_lv_ids) > 0 then
      v_levels := custom.levels_of(v_me, v_lv_ids);
    end if;
  end if;

  -- an ask with a row that neither the Table-kernel answer nor the levels answer: custom.hub_changed_by itself, whole
  if not v_owner then
    v_alone := v_alone || array(
      select distinct x.n::integer
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
        join custom.record r
          on r.organization_id = (x.e ->> 'organization_id')::uuid
         and r.id = any (array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i))
       where x.e ->> 'kind' = 'structure'
         and not (x.n::integer = any (v_alone))
         and coalesce(r.data_class, 'record') <> 'record'
         and not (v_sets ? r.organization_id::text and r.table_id = v_kernel and r.deleted_at is null)
         and not ((v_need -> x.n::text -> 'need') ? r.id::text
                  and (case when (v_need -> x.n::text ->> 'covered')::boolean then v_pre else v_levels end) ? r.id::text));
  end if;

  return query
    with a as materialized (
      select x.n, (x.e ->> 'organization_id')::uuid as org,
             case when x.e ->> 'kind' = 'structure' then 'structure'
                  when x.e ->> 'kind' = 'form' then 'form' else 'portal' end as k,
             array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i) as ids
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
       where not (x.n::integer = any (v_alone))
    ), s as materialized (
      select a.n, a.org, r.id, coalesce(r.updated_at, r.created_at) as at, coalesce(r.updated_by, r.created_by) as by_,
             r.table_id, r.deleted_at, r.data_class
        from a join custom.record r on r.organization_id = a.org and r.id = any (a.ids)
       where a.k = 'structure'
    ), f as materialized (
      select a.n, a.org, fo.id, coalesce(fo.updated_at, fo.created_at) as at, coalesce(fo.updated_by, fo.created_by) as by_,
             fo.table_id
        from a join custom.anon_form fo on fo.organization_id = a.org and fo.id = any (a.ids)
       where a.k = 'form'
    ), p as materialized (
      select a.n, a.org, po.id, po.created_at as at, po.created_by as by_, po.client_table_id
        from a join custom.portal po on po.organization_id = a.org and po.id = any (a.ids)
       where a.k = 'portal'
    ), vis as materialized (
      -- the organization's Table list, one call per organization (custom.hub_changed_by's form and portal arms)
      select o.org, v.v as tid
        from (select distinct f.org from f union select distinct p.org from p where not v_owner) o
        cross join lateral custom.query_visible_ids(o.org, v_kernel) v
    ), people as materialized (
      select q.org, custom.history_people(q.org, array_agg(distinct q.by_)) as m
        from (select s.org, s.by_ from s union all select f.org, f.by_ from f union all select p.org, p.by_ from p) q
       where q.by_ is not null
       group by q.org
    )
    select s.org, s.id, s.at, pe.m #>> array[s.by_::text, 'name']
      from s left join people pe on pe.org = s.org
     where coalesce(s.data_class, 'record') <> 'record'
       and (v_owner
            or case
                 when v_sets ? s.org::text and s.table_id = v_kernel and s.deleted_at is null
                   then (v_sets -> s.org::text) ? s.id::text
                 when (v_need -> s.n::text -> 'need') ? s.id::text
                      and (case when (v_need -> s.n::text ->> 'covered')::boolean then v_pre else v_levels end) ? s.id::text
                   then coalesce(((case when (v_need -> s.n::text ->> 'covered')::boolean then v_pre else v_levels end)
                                  -> s.id::text ->> 's')::boolean, false)
                 else false  -- never reached: such an ask was handed to custom.hub_changed_by above
               end)
    union all
    select f.org, f.id, f.at, pe.m #>> array[f.by_::text, 'name']
      from f left join people pe on pe.org = f.org
     where exists (select 1 from vis where vis.org = f.org and vis.tid = f.table_id)
    union all
    select p.org, p.id, p.at, pe.m #>> array[p.by_::text, 'name']
      from p left join people pe on pe.org = p.org
     where v_owner or exists (select 1 from vis where vis.org = p.org and vis.tid = p.client_table_id);

  -- the asks about an organization this statement has not walked: custom.hub_changed_by itself
  for v_ask in select x.e from jsonb_array_elements(p_asks) with ordinality x(e, n) where x.n::integer = any (v_alone) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(v_org, v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$
;
