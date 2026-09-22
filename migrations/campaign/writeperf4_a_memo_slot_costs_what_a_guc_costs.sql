-- additive: yes
--
-- chair-step: it REPLACES the four `platform.memo_k_*` primitives
--   `writeperf4_a_fact_about_the_table_is_read_once.sql` created minutes ago, with the same
--   semantics and none of the nested function calls. Nothing is dropped, nothing is revoked, no
--   row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf4_a_memo_slot_costs_what_a_guc_costs_down.sql`.
--
-- WRITE-PERF-4 WAVE 1 — A MEMO SLOT COSTS WHAT A GUC COSTS, NOT WHAT THREE FUNCTION CALLS COST.
--
-- MEASURED, AND IT IS THE WHOLE REASON THIS FILE EXISTS. The first cut of `platform.memo_k_get`
-- spelled its stamp as `platform.memo_k_stamp()`, which called `iam.statement_memo_epoch()`. Both
-- carry a `SET search_path` clause, which makes a `LANGUAGE sql` function NON-INLINABLE and puts a
-- GUC save/restore around every call. On the main database, 20,000 calls with the argument varying:
--
--   platform.memo_k_get   — stamp via two nested SET-clause functions ....... 53.0 us a call
--   platform.memo_get     — the shared blob it was meant to beat ............  7.7 us a call
--   iam.statement_memo_epoch() as a CALL ....................................  6.1 us a call
--   the same three expressions written INLINE ...............................  0.7 us
--   md5(role | claims | session_user | current_user) INLINE ..................  2.2 us
--
-- So the stamp's ARITHMETIC is ~3 us and its CALL GRAPH was ~50. The 250-row A/B said so in the
-- only way that counts: wave 1's first bytes were 3,458 ms against 3,063 ms for the bodies they
-- replaced — 395 ms SLOWER. The memo layer had been made more expensive than the blob it removed.
--
-- THE FIX IS THE DULLEST ONE: the stamp is written out INLINE inside `memo_k_get` and
-- `memo_k_put`, with no nested call at all. `platform.memo_k_stamp()` stays, unchanged in meaning,
-- as the one canonical spelling for anything that needs the stamp as a value — it is simply not on
-- the hot path any more. Every term of the stamp is identical, so nothing about invalidation moves:
-- seat (role | request.jwt.claims | session_user | current_user), statement (statement_timestamp),
-- backend (pg_backend_pid), transaction (pg_current_xact_id_if_assigned) and generation
-- (`mx_memo.g`, bumped by `platform.memo_clear()`).
--
-- THE LESSON, FOR THE NEXT LANE: on a path that runs tens of thousands of times in one statement,
-- a `SET search_path` clause is not free bookkeeping — it is the cost. Write the expression out.
--
-- based-on: platform.memo_k_get(text) 8a6fe0866c2f1384a063b26afbdc3c2830c4c8695c6640af23455055782523e8
-- based-on: platform.memo_k_put(text, text) 0b24a0e0c68cdf1842c03f21e85c22a82d9cb935977121d6a3ff48d24ef6ceec
-- based-on: platform.memo_k_drop(text) 79076ecd49fea0e0dc899038fcbbb90bc27839390446283a24c8d9e0b5331d40
-- based-on: platform.memo_col_flags(oid, text[]) 1e3dc3c8db8fdb2cc69d3bd69ee084bb2b053b7e81ee03ad16b649edccbfd218

create or replace function platform.memo_k_get(p_key text)
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_raw   text := nullif(current_setting('mx_memo.k' || md5(p_key), true), '');
  v_stamp text;
begin
  -- A MISS IS NEVER AN ERROR. `missing_ok => true` on a GUC nothing has set answers null.
  if v_raw is null then
    return null;
  end if;
  -- `platform.memo_k_stamp()`'s body, written out. See the header: as a CALL it cost 45 us.
  v_stamp := md5(coalesce(current_setting('role', true), '') || '|' ||
                 coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
                 session_user::text || '|' || current_user::text)
          || '/' || pg_catalog.statement_timestamp()::text
          || '/' || pg_catalog.pg_backend_pid()::text
          || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro')
          || '/' || coalesce(current_setting('mx_memo.g', true), '0');
  if left(v_raw, length(v_stamp)) is distinct from v_stamp then
    return null;                      -- a slot from another seat, statement or generation
  end if;
  -- `\x01` separates the stamp from the answer: it cannot occur in an md5, a timestamp or a
  -- pid, and jsonb text never contains a raw control character.
  return substr(v_raw, length(v_stamp) + 2);
end;
$function$;

create or replace function platform.memo_k_put(p_key text, p_value text)
returns void
language plpgsql
set search_path to ''
as $function$
begin
  if p_value is null then
    return;                            -- a null answer is not memoised, exactly as the blob does
  end if;
  perform set_config('mx_memo.k' || md5(p_key),
           md5(coalesce(current_setting('role', true), '') || '|' ||
               coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
               session_user::text || '|' || current_user::text)
        || '/' || pg_catalog.statement_timestamp()::text
        || '/' || pg_catalog.pg_backend_pid()::text
        || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro')
        || '/' || coalesce(current_setting('mx_memo.g', true), '0')
        || chr(1) || p_value,
           true);
end;
$function$;

create or replace function platform.memo_k_drop(p_key text)
returns void
language plpgsql
set search_path to ''
as $function$
begin
  perform set_config('mx_memo.k' || md5(p_key), '', true);
end;
$function$;

create or replace function platform.memo_col_flags(p_relid oid, p_names text[])
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_key text := 'cols:' || p_relid::text || ':' || md5(array_to_string(p_names, ','));
  v_out text := platform.memo_k_get(v_key);
begin
  -- WHICH OF THESE COLUMNS DOES THIS RELATION CARRY — one 't'/'f' per name, in order. The
  -- catalogue is asked once per (relation, question) per statement instead of once per ROW,
  -- and `platform.memo_ddl_forgets_the_shape` empties every slot the moment any DDL runs, so a
  -- column added mid-transaction is still seen. Without that event trigger this helper would be
  -- a cache pretending to be the catalogue, and it would not ship.
  if v_out is not null then
    return v_out;
  end if;
  select string_agg(
           case when exists (select 1 from pg_catalog.pg_attribute a
                              where a.attrelid = p_relid
                                and a.attname = n.nm
                                and a.attnum > 0
                                and not a.attisdropped)
                then 't' else 'f' end, '' order by n.ord)
    into v_out
    from unnest(p_names) with ordinality as n(nm, ord);
  perform platform.memo_k_put(v_key, v_out);
  return v_out;
end;
$function$;
