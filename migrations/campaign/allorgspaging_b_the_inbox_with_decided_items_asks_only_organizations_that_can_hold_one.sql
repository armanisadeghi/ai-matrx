-- chair-step: this REPLACES the body of custom.work_inbox(uuid, integer, integer, boolean, text) so that, with no organization named and decided items included (the inbox view's "show decided"), only the organizations that can hold any inbox item at all are asked — those with an approval record or a person-record of hers, the two sources custom._inbox_items reads. Every row still comes from the door asked with the organization's name. Same signature, answer shape, security and grants. No table, permission or data row is touched; only catalog locks.
-- lane: ALL-ORGS-PAGING
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) 36cf547c51ccddef5321f2d22f75b723211ede26879c06df312468dc922fa017
--
-- WHY (production, 2026-10-01, role authenticated, statement_timeout 8 s, after file a):
--   work_inbox(null, 1000, 0, true, 'inbox') took 4142-4193 ms (admin, 52 organizations) and
--   3452-4606 ms (member, 17) — over half the 8 s request clock — because every organization was
--   asked even with nothing in it. On the clone 44 of admin's 52 organizations hold neither source.
--
-- Guard: matrx-frontend/scripts/campaign-tests/allorgspaging_every_all_organizations_page_answers.sql (B proves nothing is lost; D the budget)
-- Inverse: migrations/inverse/allorgspaging_b_the_inbox_with_decided_items_asks_only_organizations_that_can_hold_one_down.sql

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
  -- items included it has no count for them, so then only organizations that can hold one are asked.
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
    -- WITH DECIDED ITEMS there is no count to skip by, so ask only the organizations that can hold
    -- any inbox item at all — the two sources custom._inbox_items reads: an approval record, or a
    -- person-record of hers (assignments need one). A superset: it narrows which are asked, never
    -- an answer (lane ALL-ORGS-PAGING b: 8 of admin's 52 organizations on the clone).
    if not v_skip then
      select coalesce(array_agg(o.id), '{}'::uuid[]) into v_has
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
         and (exists (select 1 from custom.record r
                       where r.organization_id = o.id and r.data_class = 'work_approval' and r.deleted_at is null)
              or exists (select 1 from custom.record r
                          where r.organization_id = o.id and r.table_id = custom.person_kernel_id()
                            and r.deleted_at is null and r.data ->> 'user_id' = v_me::text));
      v_skip := true;
    end if;
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
