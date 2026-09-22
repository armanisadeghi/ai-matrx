-- additive: yes
--
-- chair-step: it REPLACES `platform.memo_k_stamp`, `platform.memo_k_get` and
--   `platform.memo_k_put` — three functions, one term removed from the stamp. Nothing is dropped,
--   nothing is revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf4_a_fact_about_the_table_is_read_once_down.sql`.
--
-- WRITE-PERF-4 WAVE 1 — THE SEAT IS THE CALLER, NEVER THE DEFINER.
--
-- The stamp's seat was `role | request.jwt.claims | session_user | current_user`. The last term
-- was a reflex — "be stricter than the thing you replace" — and it is WRONG here, for the reason
-- the store's own doors write out in their own comments:
--
--   "custom.assert_store_door ... judges custom.caller_role() — the identity the caller actually
--    held — and not current_user, which a SECURITY DEFINER door has already rewritten to itself."
--
-- `current_user` is precisely the thing this store has decided is NOT an identity. Every door's
-- decision is made from `custom.caller_role()`, `request.jwt.claims` and the organization; none of
-- them reads `current_user`. Keeping it in the stamp did not make anything safer — it made the
-- memo BLIND ACROSS THE DOOR: a slot filled inside `custom.record_write` (current_user = the
-- definer) could not be read by the same transaction outside it (current_user = `authenticated`),
-- so the same question was asked twice and `writeperf3b_guards_still_fire.sql` clause 7 — which
-- asserts that a write really does leave a declared-key memo behind — could not see it at all.
--
-- The seat is now byte-identical to `platform.memo_b_seat()`, which is what the shared blob these
-- keys came out of has always used: `role | request.jwt.claims | session_user`. The other four
-- terms of the stamp (statement, backend, transaction, generation) are untouched, and they are the
-- ones that do the invalidating.
--
-- based-on: platform.memo_k_stamp() dadb9d705a4a7cf4df34f2f0927420752735808cf9311c3b397732b804278343
-- based-on: platform.memo_k_get(text) 25b59190e428c8101680febf05cb9580cc7f774ca4cb04dfd5b019e660a16e12
-- based-on: platform.memo_k_put(text, text) 87975d3fd7ac0f37696ee0b337afc8299d041944d597a651fe4a5d2de1cd2bbb

create or replace function platform.memo_k_stamp()
returns text
language sql
stable
set search_path to ''
as $function$
  -- THE CANONICAL SPELLING. `platform.memo_k_get` and `platform.memo_k_put` write this expression
  -- out inline rather than calling it, because a `SET search_path` function call costs ~45 us on a
  -- path that runs tens of thousands of times in one statement
  -- (`writeperf4_a_memo_slot_costs_what_a_guc_costs.sql`). If you change one, change all three.
  select pg_catalog.md5(
           coalesce(pg_catalog.current_setting('role', true), '') || '|' ||
           coalesce(pg_catalog.current_setting('request.jwt.claims', true), '') || '|' ||
           session_user::text)
      || '/' || iam.statement_memo_epoch()
      || '/' || coalesce(pg_catalog.current_setting('mx_memo.g', true), '0');
$function$;

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
  if v_raw is null then
    return null;
  end if;
  v_stamp := md5(coalesce(current_setting('role', true), '') || '|' ||
                 coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
                 session_user::text)
          || '/' || pg_catalog.statement_timestamp()::text
          || '/' || pg_catalog.pg_backend_pid()::text
          || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro')
          || '/' || coalesce(current_setting('mx_memo.g', true), '0');
  if left(v_raw, length(v_stamp)) is distinct from v_stamp then
    return null;
  end if;
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
    return;
  end if;
  perform set_config('mx_memo.k' || md5(p_key),
           md5(coalesce(current_setting('role', true), '') || '|' ||
               coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
               session_user::text)
        || '/' || pg_catalog.statement_timestamp()::text
        || '/' || pg_catalog.pg_backend_pid()::text
        || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro')
        || '/' || coalesce(current_setting('mx_memo.g', true), '0')
        || chr(1) || p_value,
           true);
end;
$function$;
