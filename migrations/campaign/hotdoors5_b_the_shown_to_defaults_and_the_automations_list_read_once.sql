-- lane: HOT-DOORS-5
-- based-on: custom._record_shown_to_ctx(uuid[], uuid) 020e101a4724c5bde13feaf34f3582de84246ba2787f589d8a03d132c849bfa5
-- based-on: custom.data_home_items(uuid) 942a0ab08183b83a0be66491951dafb5a8a28b41209a9406495921238e001eb7
--
-- HOT-DOORS-5 b (2026-10-09).
--   custom._record_shown_to_ctx  hotdoors5_a's one-pass read of each organization's "Shown to" default fell back to
--                            one platform.shown_to_default per organization whenever the feature holds over 200
--                            keys (it holds 627), i.e. always. It now answers the knob's base for every organization
--                            no platform.knob_override row names for this knob, which is what
--                            platform.knob_resolve_uncached answers there too (~100 ms for admin@admin.com).
--   custom.data_home_items   the automations list finds the few Tables with a stage field first and keeps the ones
--                            the walk opened, instead of re-reading every Table of an organization once per Table
--                            she sees (~140 ms, 206,000 buffers for admin@admin.com).
-- Same answers. Both run only while iam.kernel_batch_on (knob access/kernel_batch; never after a write).
-- Revert, one statement: update platform.feature_knob set value = '{"on": false, "off_for": []}' where feature = 'access' and key = 'kernel_batch';
-- Inverse: migrations/inverse/hotdoors5_b_the_shown_to_defaults_and_the_automations_list_read_once_down.sql

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._record_shown_to_ctx(p_organization_ids uuid[], p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE "SHOWN TO" CONTEXT FOR THE RECORDS ONE LIST IS ABOUT TO READ.
--
-- custom.query_visible_ids passes platform.shown_to_context('record') to platform.shown_to_lists
-- for every row it lists. That context names, for EVERY organization the reader belongs to, the
-- organization's default list ('d') and her teammates there ('t'); it is worked out once per
-- transaction, and every PostgREST request is its own transaction, so every door call paid it:
-- ~100 ms for admin@admin.com (47 organizations; iam.teammate_user_ids ~1.3 ms each) and ~30 ms
-- for test@test.com, on every tree, values and items call.
--
-- platform.shown_to_lists reads the context of the ROW'S organization only, and reads the teammates
-- part ('t') only when the row's list resolves to 'my_team' — the row's own shown_to, or, when it has
-- none, the organization's default. So for the organizations this list reads, and this Table when one
-- is named:
--   * when some live row there says 'my_team', or some such organization's default is 'my_team',
--     the answer IS platform.shown_to_context('record'), whole (so the rare case is byte-identical);
--   * otherwise it is that context without the teammates: {org: {"d": <the same default>}} for each
--     of these organizations the reader is a live member of — the only keys any row here can read.
-- It decides nothing: shown_to_lists answers every row exactly as it would with the whole context.
-- The answer waits in the STATEMENT memo (platform.memo_k_*: fenced by the statement, the backend,
-- the transaction's first write and the seat) for the next list of the same statement that reads the
-- same organizations and Table (the scope tree asks once per scope Table).
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_d   platform.shown_to;
  v_key text;
  v_hit text;
  r     record;
  v_found boolean;
  v_seeded boolean;
  v_sys   jsonb;
begin
  if v_uid is null then
    return v_out;
  end if;
  v_key := 'custom.record_shown_to_ctx:' || v_uid::text || ':' || coalesce(p_table_id::text, '-') || ':'
        || md5(array_to_string(array(select distinct x::text from unnest(p_organization_ids) x order by 1), ','));
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  -- HOT-DOORS-3 (2026-10-08): a named Table is read by its index key (organization, table_id) and each organization
  -- by its own partition: `p_table_id is null or` kept the Table out of the index condition, so the generic plan
  -- read every live row of the organization (26,000 rows, 15-30 ms) to find none. Same answer.
  -- mx.read_page_set = off: the one statement as before.
  v_found := case when coalesce(current_setting('mx.read_page_set', true), '') = 'off' then
            exists (select 1 from custom.record x
                     where x.organization_id = any (p_organization_ids)
                       and (p_table_id is null or x.table_id = p_table_id)
                       and x.deleted_at is null
                       and x.shown_to = 'my_team'::platform.shown_to)
          when p_table_id is not null then
            exists (select 1 from unnest(p_organization_ids) o(id)
                     where exists (select 1 from custom.record x
                                    where x.organization_id = o.id
                                      and x.table_id = p_table_id
                                      and x.deleted_at is null
                                      and x.shown_to = 'my_team'::platform.shown_to))
          else
            exists (select 1 from custom.record x
                     where x.organization_id = any (p_organization_ids)
                       and x.deleted_at is null
                       and x.shown_to = 'my_team'::platform.shown_to)
     end;
  if v_found then
    v_out := platform.shown_to_context('record');
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  -- HOT-DOORS-5 (2026-10-09): EVERY ORGANIZATION'S DEFAULT IN ONE PASS. The loop below asked
  -- platform.shown_to_default once per organization (~1.7 ms each: 59 organizations ~100 ms for admin@admin.com).
  -- That function's answer for an organization is: null when the knob is not seeded; else
  -- platform.knob_resolve's, which is (1) its own memo (platform.memo_get) when it holds one, else (2) the knob's
  -- base (value, else default) for an organization no platform.knob_override row names for this knob — the
  -- feature map's fast path and platform.knob_resolve_uncached both answer the base there (the uncached form only
  -- departs from the base through such a row), else (3) its uncached resolution. Here (1) and (2) are read for every
  -- organization at once and (3) is still asked of platform.shown_to_default, one organization at a time. Same
  -- answers, same early return. Only while iam.kernel_batch_on (knob access/kernel_batch; never after a write);
  -- otherwise the loop below, as before.
  if iam.kernel_batch_on(null)
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_seeded := exists (select 1 from platform.feature_knob k
                         where k.feature = 'access.shown_to_default' and k.key = 'record');
    if v_seeded then
      select coalesce(k.value, k.default_value) into v_sys
        from platform.feature_knob k
       where k.feature = 'access.shown_to_default' and k.key = 'record';
    end if;
    with o as materialized (
      select distinct om.organization_id as id
        from iam.organization_member om
        join iam.organizations og on og.id = om.organization_id and og.archived_at is null
       where om.user_id = v_uid
         and om.organization_id = any (p_organization_ids)
    ), m as materialized (
      select o.id, platform.memo_get('knob|access.shown_to_default|record|' || o.id::text || '|' || v_uid::text) as hit
        from o
    ), d as materialized (
      select m.id,
             case
               when not v_seeded then null::platform.shown_to
               when m.hit is not null then (m.hit::jsonb #>> '{}')::platform.shown_to
               when not exists (select 1 from platform.knob_override ko
                                     where ko.feature = 'access.shown_to_default' and ko.key = 'record'
                                       and ko.organization_id = m.id)
                 then (v_sys #>> '{}')::platform.shown_to
               else platform.shown_to_default('record', m.id, v_uid)
             end as d
        from m
    )
    select coalesce(bool_or(d.d = 'my_team'::platform.shown_to), false),
           coalesce(jsonb_object_agg(d.id::text, jsonb_build_object('d', d.d)), '{}'::jsonb)
      into v_found, v_out
      from d;
    if v_found then
      v_out := platform.shown_to_context('record');
    end if;
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  for r in
    select distinct om.organization_id
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = v_uid
       and om.organization_id = any (p_organization_ids)
  loop
    v_d := platform.shown_to_default('record', r.organization_id, v_uid);
    if v_d = 'my_team'::platform.shown_to then
      v_out := platform.shown_to_context('record');
      perform platform.memo_k_put(v_key, v_out::text);
      return v_out;
    end if;
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d));
  end loop;
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
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
$function$;
