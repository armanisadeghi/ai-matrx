-- Policy-overlap campaign — reversibility + equivalence harness.
--
-- WHY THIS EXISTS: Postgres OR's every permissive policy applying to a
-- (role, command) and evaluates ALL of them for every row — no short-circuit.
-- Two policies on one role+command is a permanent per-row tax that nothing
-- reports. The counter is `pnpm check:db-guards` (third detector); the system
-- doc is common-docs/systems/platform/access/POLICY_OVERLAP.md.
--
-- Two objects, both operational bookkeeping (never user data, no RLS surface):
--   _policy_overlap_backup — full definition + restore_sql of every policy
--     dropped, so a rollback is data rather than memory.
--   _policy_overlap_run_probe — impersonates an identity and records what it
--     can SEE per table, so a drop is proven in BOTH directions (a narrowing is
--     as serious a defect as a widening — db-rules §6).
--
-- The probe is SECURITY INVOKER on purpose: Postgres rejects SET ROLE inside a
-- security-definer function (42501), and impersonation is the whole point. It
-- is revoked from anon/authenticated and is only callable by an operator
-- session already running as postgres.

create table if not exists platform._policy_overlap_backup (
  sch            text        not null,
  tbl            text        not null,
  polname        text        not null,
  polcmd         "char"      not null,
  polroles       text[]      not null,
  polpermissive  boolean     not null,
  qual_expr      text,
  check_expr     text,
  dropped_at     timestamptz not null default now(),
  restore_sql    text        not null,
  primary key (sch, tbl, polname, dropped_at)
);
comment on table platform._policy_overlap_backup is
  'Policy-overlap campaign: definitions of policies dropped as provably redundant. restore_sql recreates one verbatim. See common-docs/systems/platform/access/POLICY_OVERLAP.md';
revoke all on table platform._policy_overlap_backup from anon, authenticated;

create table if not exists platform._policy_overlap_probe (
  phase      text        not null,
  identity   text        not null,
  sch        text        not null,
  tbl        text        not null,
  visible    bigint,
  err        text,
  probed_at  timestamptz not null default now(),
  primary key (phase, identity, sch, tbl)
);
revoke all on table platform._policy_overlap_probe from anon, authenticated;

-- Chunked (p_limit/p_offset) with a per-table statement_timeout so one table
-- carrying an expensive access walk cannot stall an entire equivalence run.
create or replace function platform._policy_overlap_run_probe(
  p_phase  text,
  p_user   uuid,
  p_label  text,
  p_limit  int default 100,
  p_offset int default 0
) returns bigint
language plpgsql
set search_path to 'platform','public'
as $fn$
declare
  r record;
  v_n bigint;
  v_count bigint := 0;
begin
  for r in select b.sch, b.tbl from platform._policy_overlap_backup b
           order by 1,2 limit p_limit offset p_offset loop
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      execute 'set local statement_timeout = 3000';
      execute format(
        'select count(*) from (select 1 from %I.%I limit 500) t', r.sch, r.tbl)
        into v_n;
      execute 'set local role none';
      insert into platform._policy_overlap_probe(phase,identity,sch,tbl,visible,err)
      values (p_phase, p_label, r.sch, r.tbl, v_n, null)
      on conflict (phase,identity,sch,tbl)
        do update set visible = excluded.visible, err = null, probed_at = now();
      v_count := v_count + 1;
    exception when others then
      begin execute 'set local role none'; exception when others then null; end;
      insert into platform._policy_overlap_probe(phase,identity,sch,tbl,visible,err)
      values (p_phase, p_label, r.sch, r.tbl, null, sqlstate || ': ' || sqlerrm)
      on conflict (phase,identity,sch,tbl)
        do update set visible = null, err = excluded.err, probed_at = now();
    end;
  end loop;
  execute 'set local statement_timeout = 0';
  return v_count;
end;
$fn$;

revoke all on function platform._policy_overlap_run_probe(text,uuid,text,int,int)
  from public, anon, authenticated;
comment on function platform._policy_overlap_run_probe(text,uuid,text,int,int) is
  'Policy-overlap campaign equivalence harness. See common-docs/systems/platform/access/POLICY_OVERLAP.md';
