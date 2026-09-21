-- lane: SECURITY-SWEEP
-- Chair ruling 2. `research.rs_topic.refresh_claim_token` is the research-refresh LEASE: the
-- server writes it to say "this topic's refresh is mine for the next N minutes", and
-- `aidream/aidream/services/research_refresh/service.py` gates its terminal write on
-- `(id, refresh_claim_token)` so a lease that was already reclaimed cannot be stomped. A
-- client that could choose the token could take, hold or release another organization's
-- refresh.
--
-- THE CENSUS. Nothing in ANY client repository names this column — the only references in the
-- whole workspace are in that one Python service. It is written by the server, full stop.
--
-- WHY A TRIGGER AND NOT `client_excluded_columns`: withholding the column also withholds
-- SELECT, and `features/research/service.ts` reads `research.rs_topic` with `select("*")` in
-- five places, each feeding a typed row. Rewriting five read sites to close a column no client
-- writes is a lot of moving parts for no extra safety — and the rule is the same one
-- `scheduler.sch_run.claim_token` needed hours earlier today, so it is stated the same way, in
-- the one place that can state it truthfully.
--
-- SECURITY INVOKER on purpose. Inside a SECURITY DEFINER function `current_user` is the OWNER,
-- so a guard written that way reads `postgres` on every call and never fires — measured on
-- `scheduler.sch_run` this morning, where a browser INSERT carrying a chosen token came back
-- 201 Created. As INVOKER, `current_user` under PostgREST is literally `authenticated` or
-- `anon`, while aidream (`service_role`) and every SECURITY DEFINER door pass straight through.
--
-- A client may CLEAR the token — releasing a lease is never dangerous and the shape stays
-- symmetric with the scheduler's — but may never set one or swap one.
--
-- ADDITIVE.
-- Inverse: migrations/inverse/secsweep_the_research_refresh_lease_is_the_servers.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` reads `pg_trigger` for exactly this shape (a
-- RAISE-ing trigger bespoke to one table), so the three baseline rows leave on the next run.

create or replace function research._refresh_lease_is_the_servers()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.refresh_claim_token is not null then
      raise exception
        'A research refresh lease is taken by the server, never by a client. refresh_claim_token must be null on a client insert.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.refresh_claim_token is not null
     and new.refresh_claim_token is distinct from old.refresh_claim_token then
    raise exception
      'A research refresh lease cannot be set or changed by a client. The server takes it and releases it (aidream services/research_refresh).'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

comment on function research._refresh_lease_is_the_servers() is
  'SECURITY-SWEEP 2026-09-21. research.rs_topic.refresh_claim_token is the refresh lease; aidream gates its terminal write on (id, refresh_claim_token), so a client that chose it could take, hold or release another organization''s refresh. A client may clear it, never set or swap it. SECURITY INVOKER on purpose: under SECURITY DEFINER current_user is the owner and the guard never fires.';

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'research.rs_topic'::regclass
       and tgname = 'rs_topic_refresh_lease_is_the_servers'
       and not tgisinternal
  ) then
    create trigger rs_topic_refresh_lease_is_the_servers
      before insert or update on research.rs_topic
      for each row execute function research._refresh_lease_is_the_servers();
  end if;
end $$;

comment on column research.rs_topic.refresh_claim_token is
  'The research-refresh lease. Taken and released by aidream services/research_refresh, which gates its terminal write on (id, refresh_claim_token). A client may clear it, never set or swap it (trigger rs_topic_refresh_lease_is_the_servers). SECURITY-SWEEP, 2026-09-21.';
