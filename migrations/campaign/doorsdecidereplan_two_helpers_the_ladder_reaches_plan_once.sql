-- additive: yes
-- based-on: iam.statement_memo_epoch() def71d53f69cc5990b8124d32608c5363f3b3c64b02f2d42fac114096f1558e4
-- based-on: iam.entity_read_kernel_members_live() 66462a9c50abf65b49966c31d1b76ae6b7b4361f5783ccd69f4f96efede623aa
--
-- chair-step: it REPLACES the live bodies of two helper functions, moving each from LANGUAGE sql to
--   LANGUAGE plpgsql with the query unchanged. Nothing is created, dropped, granted or revoked and no
--   data is touched. Neither function is a read-kernel member (iam.entity_read_kernel_members()
--   names neither), so the access-kernel fingerprint does not move.
--
-- DOORS-DECIDE-REPLAN — THE TWO HELPERS THE LADDER REACHES PLAN ONCE.
--
-- `pnpm check:store-doors-decide` exits 1 on production and on the clone because censuses 14+15
-- (`custom.ladder_replanners()`, LADDER-PERF) name two functions the one ladder reaches:
--
--     iam.entity_read_kernel_members_live   LANGUAGE sql and not inlinable (SET)
--     iam.statement_memo_epoch              LANGUAGE sql and not inlinable (SET)
--
-- The cause is the class LADDER-PERF closed: a LANGUAGE sql function carrying `SET search_path`
-- can never be inlined, and a non-inlined SQL function's plan lives only for the calling query, so
-- its body is parsed and planned again on EVERY call. Neither body is dynamic SQL, neither reads a
-- plan_cache_mode setting, and neither needs to be — the whole re-plan comes from the language.
-- `iam.statement_memo_epoch` is the hot one: `iam.record_visible_in_org` (the RLS mirror arm) calls
-- it once per row it judges, and `platform.memo_k_stamp` calls it too. plpgsql keeps the plan (for
-- `return <expression>`, the simple-expression fast path) for the life of the session.
--
-- The memo epoch is NOT memoised: it is the memo's own clock (statement_timestamp, backend pid,
-- xid-if-assigned) and must be read fresh every time — a memoised epoch would never expire.
-- `iam.entity_read_kernel_members_live` reads pg_proc's rows at execution time; a kept plan says
-- HOW to read them, never WHAT they hold, so every body change is still seen and its answer is
-- unchanged.

create or replace function iam.statement_memo_epoch()
returns text language plpgsql stable set search_path to ''
as $function$
begin
  -- Three things, and each of them is load-bearing:
  --   statement_timestamp()  a new statement is a new epoch, so the memo is STATEMENT-scoped.
  --   pg_backend_pid()       a GUC is per backend; naming the backend makes that explicit.
  --   xid-if-assigned        'ro' until this transaction writes; the moment it writes, every
  --                          entry taken before the write stops matching and is recomputed.
  -- lane DOORS-DECIDE-REPLAN: plpgsql, not sql, so the expression is planned once per session
  -- (a SET-carrying sql function is never inlined and was re-planned on every call).
  return pg_catalog.statement_timestamp()::text
      || '/' || pg_catalog.pg_backend_pid()::text
      || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro');
end;
$function$;

create or replace function iam.entity_read_kernel_members_live()
returns jsonb language plpgsql stable set search_path to 'public', 'pg_catalog'
as $function$
begin
  -- lane DOORS-DECIDE-REPLAN: the identical query, in plpgsql so its plan is kept for the session.
  return (
  select coalesce(jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                                   md5(p.prosrc)), '{}'::jsonb)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname::text, p.proname::text) in (
    select m.schema_name, m.function_name from iam.entity_read_kernel_members() m
  ));
end;
$function$;
