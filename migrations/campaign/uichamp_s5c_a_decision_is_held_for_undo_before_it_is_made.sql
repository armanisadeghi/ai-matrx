-- LANE S5-PRIME-2, VERIFIER-20 — A DECISION IS HELD FOR UNDO BEFORE IT IS MADE.
--
-- THE GAP: snooze and done offered Undo; a keyboard approve/decline was instant and final.
-- Superhuman's and Gmail's "undo send" is the bar: the decision is HELD for a short window with
-- Undo visible, then made. The hold lives in the person's own screen (records-ui ActionInbox) —
-- nothing is written during it, so an undone decision leaves no trace in the approval's history
-- at all — and this file hands every row the window it gets:
--   * knob `custom/decision_undo_seconds` (default 5, 0..30, organization-overridable);
--   * `custom.work_inbox` (drop, create, same arguments, same door row, re-opened) appends
--     `undo_seconds` (the knob for a pending approval or proposal; null for work and closed rows)
--     and `undo_refusal` — a decision something is already waiting on (the approval names the run
--     that resumes from it in `resumes_run_id`) gets 0 and the sentence saying it is made at once.
--
-- INVERSE: migrations/inverse/uichamp_s5c_a_decision_is_held_for_undo_before_it_is_made_down.sql
--
-- chair-step: custom.work_inbox's OUT list gains two columns, so it is dropped and recreated in this transaction with the same arguments; its platform.client_callable_door row is unchanged and custom.reopen_declared_doors() issues EXECUTE back to authenticated.
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) ce03303d26a363130d40553ed92023a2f76c31ea04a58e570db11486223b51f7
-- lane: S5-PRIME-2

set lock_timeout = '30s';
set statement_timeout = '120s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'decision_undo_seconds', '5'::jsonb, '5'::jsonb, 'integer', 'seconds', 0, 30,
   'Seconds an inbox decision waits with Undo before it is made',
   'When somebody approves or declines from their inbox, the decision is held this long with an Undo button showing, then made. Undo in that time puts the item back exactly as it was and leaves nothing in its history. 0 makes every decision at once. A decision something else is already waiting on is always made at once.',
   'agent', 'Lane S5-PRIME-2 2026-09-24 (VERIFIER-20): the chair names 5 seconds; Gmail''s undo send defaults to 5 and Superhuman''s is a few seconds.',
   date '2026-12-24', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

drop function if exists custom.work_inbox(uuid, integer, integer, boolean, text);
CREATE FUNCTION custom.work_inbox(p_organization_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false, p_view text DEFAULT 'inbox'::text)
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
begin
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
            x.actionable desc, x.state nulls last, x.sort_at desc
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, 200)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;

comment on function custom.work_inbox(uuid, integer, integer, boolean, text) is
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my approval, and the agent''s proposals. Lane S5-PRIME: never lists a pending decision whose subject is archived; closed rows say who decided and when. Lane S5-PRIME-2: reads custom._inbox_items; p_view inbox (default) hides what I snoozed or cleared, snoozed lists what I put off (soonest first), done lists what I cleared; every row carries snoozed_count and cleared_count; a pending approval carries undo_seconds (custom/decision_undo_seconds, 0 when something already waits on it, with undo_refusal saying so).';
select custom.reopen_declared_doors();
