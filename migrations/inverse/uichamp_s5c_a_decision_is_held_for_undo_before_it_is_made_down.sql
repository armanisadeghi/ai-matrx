-- INVERSE of migrations/campaign/uichamp_s5c_a_decision_is_held_for_undo_before_it_is_made.sql
-- (lane S5-PRIME-2). Puts custom.work_inbox back to its S5b body (no undo_seconds / undo_refusal)
-- and removes the knob custom/decision_undo_seconds. A records-ui that reads undo_seconds then
-- finds none and decides at once, as before.
--
-- chair-step: custom.work_inbox's OUT list loses two columns, so it is dropped and recreated with the same arguments and re-opened.
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) badfe89c332e3267ca2a96b306f13f9ccfc2cedce361584600ee8473157cbf72

set lock_timeout = '2s';
set statement_timeout = '120s';

drop function if exists custom.work_inbox(uuid, integer, integer, boolean, text);
CREATE FUNCTION custom.work_inbox(p_organization_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false, p_view text DEFAULT 'inbox'::text)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text, snoozed_until timestamp with time zone, cleared_at timestamp with time zone, snoozed_count integer, cleared_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid := custom.query_principal();
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
         n.snoozed, n.cleared
    from x cross join n
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
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my approval, and the agent''s proposals. Lane S5-PRIME: never lists a pending decision whose subject is archived; closed rows say who decided and when. Lane S5-PRIME-2: reads custom._inbox_items; p_view inbox (default) hides what I snoozed or cleared, snoozed lists what I put off (soonest first), done lists what I cleared; every row carries snoozed_count and cleared_count.';
delete from platform.feature_knob where feature = 'custom' and key = 'decision_undo_seconds';
select custom.reopen_declared_doors();
