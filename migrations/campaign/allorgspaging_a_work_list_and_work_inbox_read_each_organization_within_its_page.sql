-- chair-step: this REPLACES the bodies of custom.work_list(uuid, text, boolean, integer, integer) and custom.work_inbox(uuid, integer, integer, boolean, text) — the work lists and the inbox — so no All-organizations page is ever refused: with no organization named, each organization is read through the same door in pages within its own page ceiling (never limit + offset in one ask, which the door refused past 500 / 200 rows with 22023 PAGE-1); an organization that answers a short page is not asked again; the inbox skips organizations custom.inbox_counts (the same predicate, already read for the totals) shows empty in the view. Both doors now page up to the organization's own ceiling (knob custom/page_size_ceiling, 1000 by default; was hardcoded 500 / 200), ties break on the id so pages are stable, and work_list reads a hand-typed name in an Assignee as "not a person" instead of failing the whole list (22P02). Same signatures, same answer shapes, same security and grants. No table, permission or data row is touched; only catalog locks.
-- lane: ALL-ORGS-PAGING
-- based-on: custom.work_list(uuid, text, boolean, integer, integer) bf3b854cb794b7beef1fc68843ba87b3ecfe18e2915da2d0f60de59cdfaf9410
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) 99f59fbc2ae7e1bf882978b4e980da850097ecc2508d655a9732d2291e6799ef
--
-- WHY (clone, 2026-10-01, both seats as role authenticated):
--   test@test.com  work_list(null,'unassigned',true,100,500)  -> 22023 "custom.work_list was asked for 600 rows; this store serves at most 500"
--   test@test.com  work_inbox(null,50,200,true,'inbox')       -> 22023 "custom.work_inbox was asked for 250 rows; this store serves at most 200"
--   admin@admin.com work_list(null,'assigned',true,500,0)     -> 22P02 invalid input syntax for type uuid: "<a person's name>"
-- The first two are the class DATA-HOME-3B2 fixed in custom.archived_tables_everywhere (every
-- organization asked for limit + offset in one page). The third: one record anywhere with a name
-- typed into its Assignee took the whole All-organizations list down; custom._inbox_items already
-- compares it as text for the same reason.
--
-- Guard: matrx-frontend/scripts/campaign-tests/allorgspaging_every_all_organizations_page_answers.sql
-- Source scan: pnpm check:all-orgs-paging (no door may ask an organization for limit + offset again)
-- Inverse: migrations/inverse/allorgspaging_a_work_list_and_work_inbox_read_each_organization_within_its_page_down.sql

CREATE OR REPLACE FUNCTION custom.work_list(p_organization_id uuid DEFAULT NULL::uuid, p_flavour text DEFAULT 'mine'::text, p_include_finished boolean DEFAULT false, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(record_id uuid, table_id uuid, table_name text, title text, assignee_id uuid, assignee_name text, assignee_user_id uuid, due_on timestamp with time zone, due_state text, status text, terminal boolean, assigned_by uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid;
  v_person uuid;
  v_flav   text := lower(coalesce(nullif(btrim(p_flavour), ''), 'mine'));
  v_cap    integer;
  v_off    integer;
  v_need   integer;
  v_org    uuid;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
  v_all    jsonb := '[]'::jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep,
  -- 2026-09-29; access-belongs-to-the-person): the work waiting on the caller in EVERY organization
  -- she belongs to. Each organization is asked through this same door with its name, so it meets its
  -- own wall and its own ladder below; this only adds the answers together. An organization whose
  -- wall refuses (42501) contributes nothing. No permission is changed by this branch.
  --
  -- PAGING ACROSS ORGANIZATIONS (lane ALL-ORGS-PAGING, 2026-10-01; the class DATA-HOME-3B2 found in
  -- custom.archived_tables_everywhere). The page after v_off can only come from each organization's
  -- own first v_cap + v_off rows, so that is all each one is asked for — in pages of at most its own
  -- ceiling (custom.page_ceiling), never in one ask past it: the old body asked every organization
  -- for v_cap + v_off rows at once, so any page past the ceiling was refused (22023 PAGE-1). An
  -- organization that answers a short page has nothing more and is not asked again.
  if p_organization_id is null then
    v_me  := custom.query_principal();
    v_cap := least(greatest(coalesce(p_limit, 100), 1), 1000);
    v_off := greatest(0, coalesce(p_offset, 0));
    v_need := v_cap + v_off;
    if v_me is null then
      return;
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 500), 1);
        v_at := 0;
        loop
          v_chunk := least(v_need - v_at, v_ceil);
          exit when v_chunk < 1;
          select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb), count(*)
            into v_page, v_got
            from custom.work_list(v_org, p_flavour, p_include_finished, v_chunk, v_at) x;
          v_all := v_all || v_page;
          v_at := v_at + v_got;
          exit when v_got < v_chunk;
        end loop;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return query
      select w.record_id, w.table_id, w.table_name, w.title, w.assignee_id, w.assignee_name, w.assignee_user_id,
             w.due_on, w.due_state, w.status, w.terminal, w.assigned_by, w.updated_at
        from jsonb_to_recordset(v_all) as w(record_id uuid, table_id uuid, table_name text, title text, assignee_id uuid,
               assignee_name text, assignee_user_id uuid, due_on timestamptz, due_state text, status text,
               terminal boolean, assigned_by uuid, updated_at timestamptz)
       order by case when w.terminal then 2 when w.due_on is null then 1 else 0 end,
                w.due_on nulls last, w.updated_at desc, w.record_id
       limit v_cap offset v_off;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_list');
  if v_flav not in ('mine', 'assigned', 'unassigned') then
    raise exception 'There are three work lists: mine, assigned and unassigned, and "%" is none of them.', p_flavour
      using errcode = '22023',
            hint = '`mine` is what is waiting on you, `assigned` is what you gave to other people, `unassigned` is what is waiting on somebody being chosen.';
  end if;
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;
  v_person := custom.work_person(p_organization_id, v_me, false);
  if v_flav = 'mine' and v_person is null then
    return;
  end if;

  return query
    select r.id,
           r.table_id,
           t.data ->> 'name',
           custom._card_words(r.organization_id, r.data ->> coalesce(t.data ->> 'title_field', 'name'),
                              lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record'))),
           p.id,
           p.data ->> 'name',
           nullif(p.data ->> 'user_id', '')::uuid,
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           s.data ->> 'name',
           coalesce((s.data ->> 'terminal')::boolean, false),
           r.updated_by,
           r.updated_at
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id
       and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
      left join custom.record p
        on p.organization_id = r.organization_id
       -- a hand-typed name in somebody's Assignee must not take the list down (ALL-ORGS-PAGING:
       -- 22P02 "invalid input syntax for type uuid" refused the whole All-organizations list)
       and p.id = case when r.data ->> 'assignee' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.data ->> 'assignee')::uuid end
       and p.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and r.data_class = 'record'
       and (coalesce(p_include_finished, false)
            or not coalesce((s.data ->> 'terminal')::boolean, false))
       and case v_flav
             when 'mine'       then case when r.data ->> 'assignee' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.data ->> 'assignee')::uuid end = v_person
             when 'unassigned' then nullif(r.data ->> 'assignee', '') is null
                                and r.data ? 'status'
             else                   nullif(r.data ->> 'assignee', '') is not null
                                and case when r.data ->> 'assignee' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.data ->> 'assignee')::uuid end is distinct from v_person
                                and r.updated_by = v_me
           end
       -- THE ONE LADDER, row by row. The candidate set is already narrow (one person's work
       -- inside one organization), so the per-row question is the honest one to ask here.
       and (custom.query_is_store_owner()
            or custom.has_visibility(v_me, 'record', r.id, 'viewer'::public.permission_level))
     order by case when coalesce((s.data ->> 'terminal')::boolean, false) then 2
                   when nullif(r.data ->> 'due_date', '') is null then 1 else 0 end,
              nullif(r.data ->> 'due_date', '')::timestamptz nulls last,
              r.updated_at desc, r.id
     -- the organization's own page ceiling (knob custom/page_size_ceiling), as custom.page_contract() says
     limit custom.page_size(p_organization_id, 'custom.work_list', p_limit, 100, null)
    offset greatest(0, coalesce(p_offset, 0));
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_inbox(p_organization_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false, p_view text DEFAULT 'inbox'::text)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text, snoozed_until timestamp with time zone, cleared_at timestamp with time zone, snoozed_count integer, cleared_count integer, undo_seconds integer, undo_refusal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid := custom.query_principal();
  -- LANE S5-PRIME-2 (UNDO): how long a decision is held with Undo before it is made — the
  -- organization's knob, read once per call.
  v_hold integer := greatest(0, least(30, coalesce(
             (platform.knob_resolve('custom', 'decision_undo_seconds', p_organization_id) #>> '{}')::integer, 5)));
  v_view text := lower(coalesce(nullif(btrim(p_view), ''), 'inbox'));
  v_cap  integer;
  v_off  integer;
  v_need integer;
  v_org  uuid;
  v_ceil integer;
  v_chunk integer;
  v_at   integer;
  v_got  integer;
  v_page jsonb;
  v_has  uuid[];
  v_skip boolean;
  v_all  jsonb := '[]'::jsonb;
  v_sn   integer;
  v_cl   integer;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- what waits on a person is the person's, not the selected organization's): every organization
  -- the caller belongs to, each asked through this same door with its name, so each meets its own
  -- wall; this only adds the answers together. An organization whose wall refuses (42501)
  -- contributes nothing. snoozed_count/cleared_count become totals across those organizations.
  -- No permission is changed by this branch.
  --
  -- PAGING ACROSS ORGANIZATIONS (lane ALL-ORGS-PAGING, 2026-10-01; the class DATA-HOME-3B2 found in
  -- custom.archived_tables_everywhere). Each organization is asked only for its own first
  -- v_cap + v_off items, in pages of at most its own ceiling (custom.page_ceiling) — the old body
  -- asked every organization for v_cap + v_off at once, so any page past the 200-row ceiling was
  -- refused (22023 PAGE-1). custom.inbox_counts (the same predicate, already read for the totals)
  -- names the organizations holding anything in this view; the others are not asked. With decided
  -- items included it has no count for them, so then every organization is asked.
  if p_organization_id is null then
    if v_view not in ('inbox', 'snoozed', 'done') then
      raise exception 'The inbox has three views: inbox, snoozed and done, and "%" is none of them.', p_view
        using errcode = '22023';
    end if;
    if v_me is null then
      return;
    end if;
    v_cap := least(greatest(coalesce(p_limit, 50), 1), 1000);
    v_off := greatest(0, coalesce(p_offset, 0));
    v_need := v_cap + v_off;
    select coalesce(sum(c.snoozed), 0)::integer, coalesce(sum(c.cleared), 0)::integer,
           coalesce(array_agg(c.organization_id) filter (where case v_view
                                                                 when 'inbox'   then c.waiting > 0
                                                                 when 'snoozed' then c.snoozed > 0
                                                                 else                c.cleared > 0 end), '{}'::uuid[])
      into v_sn, v_cl, v_has from custom.inbox_counts(null) c;
    v_skip := not (v_view = 'inbox' and coalesce(p_include_decided, false));
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      continue when v_skip and not (v_org = any(v_has));
      begin
        v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
        v_at := 0;
        loop
          v_chunk := least(v_need - v_at, v_ceil);
          exit when v_chunk < 1;
          select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb), count(*)
            into v_page, v_got
            from custom.work_inbox(v_org, v_chunk, v_at, p_include_decided, p_view) x;
          v_all := v_all || v_page;
          v_at := v_at + v_got;
          exit when v_got < v_chunk;
        end loop;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return query
      select w.item_id, w.kind, w.origin, w.title, w.subject_id, w.subject_kind, w.summary, w.state, w.due_on,
             w.due_state, w.actionable, w.requested_by, w.requested_by_name, w."at", w.table_id, w.table_name,
             w.decided_by, w.decided_by_name, w.decided_at, w.outcome, w.snoozed_until, w.cleared_at,
             v_sn, v_cl, w.undo_seconds, w.undo_refusal
        from jsonb_to_recordset(v_all) as w(item_id uuid, kind text, origin text, title text, subject_id uuid,
               subject_kind text, summary text, state text, due_on timestamptz, due_state text, actionable boolean,
               requested_by uuid, requested_by_name text, "at" timestamptz, table_id uuid, table_name text,
               decided_by uuid, decided_by_name text, decided_at timestamptz, outcome text,
               snoozed_until timestamptz, cleared_at timestamptz, snoozed_count integer, cleared_count integer,
               undo_seconds integer, undo_refusal text)
       order by case when v_view = 'snoozed' then w.snoozed_until end asc nulls last,
                case when v_view = 'done' then w.cleared_at end desc nulls last,
                w.actionable desc, w.state nulls last, w."at" desc, w.item_id
       limit v_cap offset v_off;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_view not in ('inbox', 'snoozed', 'done') then
    raise exception 'The inbox has three views: inbox, snoozed and done, and "%" is none of them.', p_view
      using errcode = '22023',
            hint = '`inbox` is what is waiting on you now, `snoozed` is what you put off until a time, `done` is what you cleared.';
  end if;
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with x as (
    select * from custom._inbox_items(p_organization_id, v_me, coalesce(p_include_decided, false))
  ),
  n as (
    select (count(*) filter (where x.inbox_state = 'snoozed'))::integer as snoozed,
           (count(*) filter (where x.inbox_state = 'cleared'))::integer as cleared
      from x
  )
  select x.item_id, x.kind, x.origin, x.title, x.subject_id, x.subject_kind, x.summary, x.state,
         x.due_on, x.due_state, x.actionable, x.requested_by, x.requested_by_name, x.at,
         x.table_id, x.table_name, x.decided_by, x.decided_by_name, x.decided_at, x.outcome,
         case when x.inbox_state = 'snoozed' then x.snoozed_until end,
         case when x.inbox_state = 'cleared' then x.cleared_at end,
         n.snoozed, n.cleared,
         -- A DECISION SOMETHING ELSE IS WAITING ON IS MADE AT ONCE: whoever files an approval that
         -- a run resumes from names that run in `resumes_run_id`, and holding it would stall the run.
         case when x.kind = 'assignment' or x.state <> 'pending' then null
              when w.resumes is not null then 0
              else v_hold end,
         case when x.kind <> 'assignment' and x.state = 'pending' and w.resumes is not null
              then 'Something is already waiting on this decision, so it is made the moment you decide and cannot be undone.' end
    from x cross join n
    left join lateral (select nullif(r.data ->> 'resumes_run_id', '') as resumes
                         from custom.record r
                        where r.organization_id = p_organization_id and r.id = x.item_id
                          and x.kind <> 'assignment') w on true
   where case v_view
           when 'inbox'   then x.inbox_state = 'waiting'
                               or (coalesce(p_include_decided, false) and x.inbox_state = 'closed')
           when 'snoozed' then x.inbox_state = 'snoozed'
           else                x.inbox_state = 'cleared'
         end
   order by case when v_view = 'snoozed' then x.snoozed_until end asc nulls last,
            case when v_view = 'done' then x.cleared_at end desc nulls last,
            x.actionable desc, x.state nulls last, x.sort_at desc, x.item_id
   -- the organization's own page ceiling (knob custom/page_size_ceiling), as custom.page_contract() says
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, null)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;
