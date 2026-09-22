-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-QUERY, file 4 — DOOR-N-3: EVERY HOT READ PATH ON THE SHARED STORE RUNS AS A PREPARED
--                    STATEMENT.
--
-- Its measurement is the argument: planning time rises from 0.046 ms at 2 indexes to 86 ms
-- COLD at 2,002 indexes, and stays at 0.004 ms with a prepared statement. The record store is
-- a shared table that grows a promoted index per organization per promoted Field (W1-INDEX),
-- so the 2,002-index case is not a thought experiment — it is where the store is going. At
-- that point an unprepared hot read spends 86 ms deciding how to spend 0.2 ms.
--
-- WHAT A "HOT PATH" IS, DECLARED RATHER THAN GUESSED. The four reads a screen issues on every
-- paint: a Table's page, a page across every Home, one record by id, and the coordinate
-- lookup a linked-record cell fires per row. They are declared as ROWS
-- (`custom.query_hot_paths()`), so the list is one object a reviewer reads, a later lane
-- extends, and the green suite asserts against — never a comment.
--
-- WHY A FUNCTION AND NOT A MIGRATION STATEMENT. A prepared statement is SESSION state: it
-- belongs to a connection, not to a database, and a `PREPARE` in a migration would vanish with
-- the migration's own connection. `custom.query_prepare_hot()` is called once per connection
-- by the pool's on-connect hook; it is idempotent (it skips what
-- `pg_prepared_statements` already holds), so calling it twice on one connection is not an
-- error and calling it on every checkout is not a cost.
--
-- THE INVERSE: `migrations/inverse/w4_query_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.query_hot_paths()
returns table(name text, statement text)
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- Every one of these goes through this lane's own functions, so the prepared plan carries
  -- the Visibility join with it. A "fast path" that skipped the helper would be a second read
  -- path, which is the thing DOOR-1 exists to forbid.
  select * from (values
    ('custom_hot_table_page',
     'prepare custom_hot_table_page (uuid, uuid, int, int) as
        select record_id, table_id, data from custom.query_by_coordinates($1, $2, ''[]''::jsonb, $3, $4)'),
    ('custom_hot_homes_page',
     'prepare custom_hot_homes_page (uuid, uuid, int, int) as
        select record_id, home_record_id, data from custom.query_across_homes($1, $2, $3, $4)'),
    ('custom_hot_record_by_id',
     'prepare custom_hot_record_by_id (uuid, uuid) as
        select r.id, r.table_id, r.data
          from custom.query_visible_ids($1, null) v
          join custom.record r on r.organization_id = $1 and r.id = v
         where r.id = $2'),
    ('custom_hot_by_coordinate',
     'prepare custom_hot_by_coordinate (uuid, uuid, jsonb, int) as
        select record_id, data from custom.query_by_coordinates($1, $2, $3, $4, 0)')
  ) as t(name, statement);
$fn$;

comment on function custom.query_hot_paths() is
  'W4-QUERY / DOOR-N-3: the declared hot read paths of the record store, as PREPARE texts. A list a reviewer reads and a suite asserts against, never a comment.';

create or replace function custom.query_prepare_hot()
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_row record;
  v_n integer := 0;
begin
  for v_row in select h.name, h.statement from custom.query_hot_paths() h loop
    -- Idempotent on purpose: the pool calls this on every checkout, and a re-prepare would
    -- raise 42P05 and take the connection down with it.
    if not exists (select 1 from pg_prepared_statements p where p.name = v_row.name) then
      execute v_row.statement;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.query_prepare_hot() is
  'W4-QUERY / DOOR-N-3: prepares every declared hot read path on THIS connection, skipping what is already prepared. Called once per pool checkout; safe to call on every one.';

create or replace function custom.query_hot_paths_prepared()
returns table(name text, prepared boolean, generic_plans bigint)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- `generic_plans` is the proof the plan is being REUSED rather than merely stored: after six
  -- executions PostgreSQL switches a prepared statement to a generic plan and stops planning.
  select h.name, p.name is not null, coalesce(p.generic_plans, 0)
    from custom.query_hot_paths() h
    left join pg_prepared_statements p on p.name = h.name;
$fn$;

comment on function custom.query_hot_paths_prepared() is
  'W4-QUERY / DOOR-N-3: which declared hot paths are prepared on this connection and how many generic (unplanned) executions each has served.';
