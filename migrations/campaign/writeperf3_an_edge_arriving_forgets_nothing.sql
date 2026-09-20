-- additive: yes
--
-- chair-step: it REPLACES `platform.memo_b_ceiling` and `platform.memo_reach_unguarded`, CREATES
--   `platform.memo_clear_on_reach_loss` and `platform.memo_reach_exempt`, and REPLACES the two
--   memo-clearing triggers on `platform.associations` that
--   writeperf3_the_write_path_asks_the_ladder_once.sql installed an hour earlier — both of them
--   this lane's own objects. Nothing else is dropped, nothing is revoked, no row of anybody's
--   data is touched. The inverse is
--   `migrations/inverse/writeperf3_an_edge_arriving_forgets_nothing_down.sql`.
--
-- based-on: platform.memo_b_ceiling() 3d04604b24072a4b35de4fe5b3f30e569f7c503f5197a41cb12884d914408bc0
-- based-on: platform.memo_reach_unguarded() 312fbabb337d8a35ac2870d6756437d30af21daaf1466d00a0158f391a52f204
--
-- WRITE-PERF-3 — A DEFECT OF MINE, MEASURED AND CLOSED IN THE SAME SESSION.
--
-- The first two files of this lane made the batched door 32% faster and the ROW-AT-A-TIME door
-- 18% SLOWER — 23.245 → 15.795 ms/row batched, 29.058 → 34.393 ms/row solo, both halves
-- measured inside ONE transaction minutes apart by `scripts/campaign-tests/writeperf3_parity.sql`.
-- Slower is not an acceptable price for faster, and the row-at-a-time door is the one
-- `custom.io_import_rows` uses for every bulk import in the platform.
--
-- WHY. Every record with a relation writes `platform.associations`, and
-- writeperf3_the_write_path_asks_the_ladder_once.sql put a blunt "empty the memo" statement
-- trigger on that table. In a 500-row batch that fires once, AFTER the 500 rows have already
-- been served from the memo. One row at a time it fires on EVERY row — so each write paid for
-- the memo and was handed an empty one, and the knob memo WRITE-PERF built went with it. Proved
-- rather than reasoned: `mx_memo.b` read back 0 keys after each of six single-row writes.
--
-- THE FIX IS PRECISION, NOT REMOVAL. An edge ARRIVING can only ever make more things reachable,
-- and this campaign never remembers a NO — `custom.assert_may_know_table`,
-- `custom.assert_client_may_reach` and `custom.assert_store_door` write a memo entry only on the
-- line that returns, never on the line that raises. Nothing else in the memo reads
-- `platform.associations` at all: a Table's columns, its type field, its choices, its Rules and
-- a Field's relation declaration are facts about the Table. So:
--
--   * INSERT on `platform.associations` empties nothing.
--   * UPDATE empties the memo only when a row became LESS reachable — `deleted_at` went from
--     null to something, or the edge's role, its two ends or its organization moved. The
--     relation trigger's own two writes do the opposite (`deleted_at = null`), so they cost
--     nothing.
--   * DELETE empties it unconditionally, as before.
--
-- AND `INSERT … ON CONFLICT DO UPDATE` IS NOT A HOLE, which is the one thing that would have
-- made this wrong. Measured on this database rather than assumed: a statement with an ON
-- CONFLICT DO UPDATE clause fires the statement-level UPDATE trigger as well as the INSERT one,
-- with `old_rows` and `new_rows` holding exactly the conflicting row. So a conflicting write
-- that DID take an edge away still reaches the precise trigger above and still empties the memo.
--
-- THE CENSUS STAYS A GUARD. `platform.memo_reach_unguarded()` still names any of the fourteen
-- tables with an uncovered event, and the two exemptions are now DECLARED ROWS in
-- `platform.memo_reach_exempt()` carrying the reason, rather than a hole in the census. Adding a
-- fifteenth table, or quietly dropping a trigger, is still named.
--
-- THE SECOND MEMO'S ENTRY CEILING GOES FROM 8 TO 32. With the clears gone the write path keeps
-- around a dozen live entries — the Deals Table's columns, its type field, its choice map, its
-- four Rule answers, the Fields kernel's columns and the relation declaration — and 8 made it
-- empty itself mid-statement. The real fence is the byte cap, `platform.memo_b_bytes()` (65536),
-- which is unchanged: a memo that stops being cheap to read stops being a memo.

CREATE OR REPLACE FUNCTION platform.memo_b_ceiling() RETURNS integer
 LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$ select 32; $function$;

CREATE OR REPLACE FUNCTION platform.memo_clear_on_reach_loss()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lost boolean;
begin
  select exists (
    select 1 from old_rows o join new_rows n on n.id = o.id
     where (o.deleted_at is null and n.deleted_at is not null)
        or n.role            is distinct from o.role
        or n.source_type     is distinct from o.source_type
        or n.source_id       is distinct from o.source_id
        or n.target_type     is distinct from o.target_type
        or n.target_id       is distinct from o.target_id
        or n.organization_id is distinct from o.organization_id)
    into v_lost;
  if v_lost then
    perform platform.memo_clear();
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_reach_exempt()
 RETURNS TABLE(relation text, event text, why text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select * from (values
    ('custom.record', 'insert',
     'an insert answers to platform.memo_clear_on_structure instead: a new record grants nobody anything, and the only insert that changes a remembered answer is a Table, a Field or a Rule arriving'),
    ('platform.associations', 'insert',
     'an edge arriving only ever makes more things reachable, and no NO is ever remembered; the ON CONFLICT DO UPDATE path fires the statement-level UPDATE trigger, which is the precise one')
  ) t(relation, event, why);
$function$;

CREATE OR REPLACE FUNCTION platform.memo_reach_unguarded()
 RETURNS TABLE(relation text, what_is_missing text)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- THE CENSUS. Every table `platform.memo_reach_tables()` declares must carry a statement-level
  -- trigger that empties the memo on each of insert, update and delete — unless
  -- `platform.memo_reach_exempt()` declares that event, with its reason, in the catalogue.
  return query
  with declared as (select unnest(platform.memo_reach_tables()) as rel),
  events as (
    select d.rel, e.ev,
           exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                    where t.tgrelid = d.rel::regclass
                      and not t.tgisinternal
                      and t.tgtype & 1 = 0                       -- statement level
                      and p.proname in ('memo_clear_stmt', 'memo_clear_on_structure',
                                        'memo_clear_on_reach_loss')
                      and ((e.ev = 'insert' and t.tgtype & 4 = 4)
                        or (e.ev = 'delete' and t.tgtype & 8 = 8)
                        or (e.ev = 'update' and t.tgtype & 16 = 16))) as covered,
           exists (select 1 from platform.memo_reach_exempt() x
                    where x.relation = d.rel and x.event = e.ev) as exempt
      from declared d cross join (values ('insert'), ('update'), ('delete')) e(ev))
  select ev.rel, 'no statement trigger empties the memo on ' || ev.ev
    from events ev where not ev.covered and not ev.exempt
   order by 1, 2;
end;
$function$;

drop trigger if exists zz_memo_clear_i on platform.associations;
drop trigger if exists zz_memo_clear_u on platform.associations;
create trigger zz_memo_clear_u after update on platform.associations
  referencing old table as old_rows new table as new_rows
  for each statement execute function platform.memo_clear_on_reach_loss();
