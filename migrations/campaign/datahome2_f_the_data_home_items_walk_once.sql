-- chair-step: this REPLACES the body of custom.data_home_items(uuid) — read by nothing but the data home — with a set-based one: the same organizations, the same rows (suite F proves equality with the store's own eight list doors per organization), but the Table-visibility walk (custom.query_visible_ids) runs ONCE per organization for all eight kinds instead of once per kind per organization, and each kind is one pass across the organizations. Signature, columns, grant and door row are unchanged; no data row is touched. The row a kind carries (item_row) keeps every column the data home reads; a digest's next and last send times, which the home does not show, are no longer computed here.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_items(uuid) 35a2b8756fe21a59ab75135085015b682db3f1b15ef291156d7ecb1b4f865dbe
--
-- WHY (chair, 2026-09-28): the per-organization loop over eight doors cost 2.8 s for admin@admin.com
-- (33 organizations) and 4.4 s for test@test.com on the clone — every door re-walked the Table
-- visibility of every organization. Each wall below is the door's own, word for word:
--   forms, dashboards, digests, shares — the Table is in custom.query_visible_ids(org, Table kernel);
--   bookings — custom.my_level(org, table, 'table') is not null (custom.assert_may_know_table(org,
--     null) returns at once, as in the door);
--   portals (and what each shows) — custom.has_visibility(me, 'record', client table, viewer);
--   digests also — recipient is me or custom.has_visibility(me, 'record', table, admin);
--   checklists — store owner or custom.has_visibility(me, 'record', template, viewer), capped per
--     organization at custom.page_size(org, 'custom.checklist_templates', 100, 100, 200);
--   automations — the stage tables in query_visible_ids, custom.pipeline_read per table, a table
--     that cannot be read listed with its error, exactly as custom.pipelines does.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql (F, G, I)
-- Inverse: migrations/inverse/datahome2_f_the_data_home_items_walk_once_down.sql

create or replace function custom.data_home_items(p_organization_id uuid default null)
returns table(
  kind              text,
  organization_id   uuid,
  organization_name text,
  item_id           uuid,
  table_id          uuid,
  table_name        text,
  item_row          jsonb
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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
     where custom.has_visibility(v_me, 'record', p.client_table_id, 'viewer'::public.permission_level);

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
         where v_owner or custom.has_visibility(v_me, 'record', c.id, 'viewer'::public.permission_level)
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
