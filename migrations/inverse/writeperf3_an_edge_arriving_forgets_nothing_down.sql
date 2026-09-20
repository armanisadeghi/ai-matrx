-- additive: yes
--
-- chair-step: THE INVERSE of writeperf3_an_edge_arriving_forgets_nothing.sql. It puts the blunt
--   memo-clearing triggers back on `platform.associations` — every edge arriving empties the
--   whole memo again, which is the 18% regression on the row-at-a-time door this lane measured
--   and closed — and returns the entry ceiling to 8 and the census to its exemption-free form.
--   Run for real by scripts/campaign-tests/writeperf3_red.sql inside a rolled-back transaction.

drop trigger if exists zz_memo_clear_u on platform.associations;
create trigger zz_memo_clear_i after insert on platform.associations
  for each statement execute function platform.memo_clear_stmt();
create trigger zz_memo_clear_u after update on platform.associations
  for each statement execute function platform.memo_clear_stmt();

CREATE OR REPLACE FUNCTION platform.memo_b_ceiling() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 8; $function$;

CREATE OR REPLACE FUNCTION platform.memo_reach_unguarded()
 RETURNS TABLE(relation text, what_is_missing text)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return query
  with declared as (select unnest(platform.memo_reach_tables()) as rel),
  events as (
    select d.rel, e.ev,
           exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                    where t.tgrelid = d.rel::regclass
                      and not t.tgisinternal
                      and t.tgtype & 1 = 0
                      and p.proname in ('memo_clear_stmt', 'memo_clear_on_structure')
                      and ((e.ev = 'insert' and t.tgtype & 4 = 4)
                        or (e.ev = 'delete' and t.tgtype & 8 = 8)
                        or (e.ev = 'update' and t.tgtype & 16 = 16))) as covered
      from declared d cross join (values ('insert'), ('update'), ('delete')) e(ev))
  select ev.rel, 'no statement trigger empties the memo on ' || ev.ev
    from events ev where not ev.covered
   order by 1, 2;
end;
$function$;

drop function if exists platform.memo_clear_on_reach_loss();
drop function if exists platform.memo_reach_exempt();
