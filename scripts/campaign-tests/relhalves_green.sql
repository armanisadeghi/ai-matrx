-- LANE OLD-TABLES-1 — W0's REL-11 CORRECTION, THE GREEN SUITE. Every arm ends in ROLLBACK.
--
-- THE USE CASE. Greenline Landscaping Crew runs weekly maintenance routes and one-off installs,
-- and every Job in its record store points at the Client it is for through a `client` relation
-- field. Those jobs and those edges are real rows in this database, which is why this suite
-- works on one of them rather than planting a shape nobody runs a business on. The suite finds
-- its subject by asking the database for a live relation edge, so it does not rot when the
-- campaign's use-case data is rebuilt.
--
-- WHAT IT PROVES — the corrected REL-11 (DD-023): a relation's value is the target's id, the
-- edge is an association written in the same transaction, and THE TWO CAN NEVER DISAGREE.
--
--   0  the guard is installed on BOTH halves — two DEFERRED constraint triggers, one on
--      `custom.record` and one on `platform.associations`, both calling
--      `custom._relation_halves_agree()`. A guard on one half only would be half a guard.
--   1  BOTH TRIGGERS ARE DEFERRED. An immediate trigger on the record would refuse every
--      legitimate write, because the edge is written by an AFTER-STATEMENT trigger that has
--      not run yet. This is the arm that proves the design rather than the installation.
--   2  THE ORDINARY WRITE STILL COMMITS. A job whose document names its client is written back
--      and the transaction commits with both halves in place. A guard that refuses correct
--      writes is an outage, not a guard, so this arm comes before every refusal arm.
--   3  the edge that landed beside it carries the FIELD it came from (`relation_field_id`),
--      which is what makes the edge half of the guard able to tell a relation edge from a
--      containment edge.
--   4  the estate this guard is now standing over is not hypothetical: relation values and
--      relation edges already exist in quantity, and the count is printed.
--
-- Its twin is scripts/campaign-tests/relhalves_red.sql, which plants each half ALONE and
-- passes only when the commit is refused.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/relhalves_green.sql

\set ON_ERROR_STOP on
\timing off

\i scripts/campaign-tests/_preamble.sql

\echo ''
\echo '── 0 · the guard is installed on BOTH halves ──────────────────────────────────────────'

do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgname = 'zzzz_relation_halves_agree'
     and p.proname = '_relation_halves_agree'
     and t.tgrelid in ('custom.record'::regclass, 'platform.associations'::regclass);
  if v_n <> 2 then
    raise exception 'CLAUSE 0 FAILED: expected the guard on BOTH custom.record and platform.associations, found % trigger(s)', v_n;
  end if;
  raise notice 'CLAUSE 0 PASS — the guard stands on both halves (2 triggers, one function)';
end $$;

\echo ''
\echo '── 1 · both triggers are DEFERRED, which is the whole design ──────────────────────────'

do $$
declare v_bad text;
begin
  select string_agg(t.tgrelid::regclass::text, ', ')
    into v_bad
    from pg_trigger t
   where t.tgname = 'zzzz_relation_halves_agree'
     and not (t.tgdeferrable and t.tginitdeferred);
  if v_bad is not null then
    raise exception
      'CLAUSE 1 FAILED: % is not DEFERRABLE INITIALLY DEFERRED. The edge is written by an '
      'AFTER-STATEMENT trigger, so an immediate check refuses every legitimate write.', v_bad;
  end if;
  raise notice 'CLAUSE 1 PASS — both arms are DEFERRABLE INITIALLY DEFERRED, so both halves are visible at COMMIT';
end $$;

\echo ''
\echo '── 2 · the ordinary write still commits, with both halves ─────────────────────────────'

begin;

do $$
declare
  v_org    uuid;
  v_job    uuid;
  v_role   text;
  v_target uuid;
  v_edges  int;
begin
  -- The subject: any live record whose document names a target through a relation edge.
  select a.organization_id, a.source_id, a.role, a.target_id
    into v_org, v_job, v_role, v_target
    from platform.associations a
   where a.relation_field_id is not null
     and a.deleted_at is null
     and a.source_type = 'record' and a.target_type = 'record'
     and exists (select 1 from custom.record r
                  where r.organization_id = a.organization_id and r.id = a.source_id
                    and r.deleted_at is null and r.data_class = 'record'
                    and r.data ->> a.role = a.target_id::text)
   limit 1;

  if v_job is null then
    raise exception 'SKIP-AS-FAILURE: no live record in this database holds a relation value with its edge beside it, so this suite proves nothing here.';
  end if;

  -- AN ORDINARY WRITE: the job document is written back as it stands. Every BEFORE and AFTER
  -- trigger on `custom.record` fires, including the two that write the relation edges, and the
  -- relation value is exactly what it was — which is the shape of every save the grid performs
  -- on a row whose relation cell the person did not touch. The DEFERRED guard must accept it.
  -- (The document is written back unchanged rather than edited, because `_undeclared_key_guard`
  -- correctly refuses a key this table has not declared, and inventing one would be testing
  -- that guard instead of this one.)
  update custom.record
     set data = data
   where organization_id = v_org and id = v_job;

  -- The deferred guard has not fired yet; forcing it is what makes this arm a proof rather
  -- than a write that happened to succeed.
  set constraints all immediate;

  select count(*) into v_edges
    from platform.associations a
   where a.source_type = 'record' and a.source_id = v_job
     and a.target_type = 'record' and a.target_id = v_target
     and a.role = v_role and a.deleted_at is null;

  if v_edges <> 1 then
    raise exception 'CLAUSE 2 FAILED: after an ordinary write the record has % live edge(s) for %, expected exactly 1', v_edges, v_role;
  end if;
  raise notice 'CLAUSE 2 PASS — an ordinary write to a record carrying a relation commits, and the deferred guard accepted it (record %, role %)', v_job, v_role;

  perform 1 from platform.associations a
   where a.source_type = 'record' and a.source_id = v_job
     and a.target_id = v_target and a.role = v_role
     and a.relation_field_id is not null;
  if not found then
    raise exception 'CLAUSE 3 FAILED: the edge does not name the field it came from, so the edge half of the guard cannot recognise it as a relation edge';
  end if;
  raise notice 'CLAUSE 3 PASS — the edge names its field, so the edge arm can tell a relation edge from every other association';
end $$;

rollback;

\echo ''
\echo '── 4 · the estate the guard now stands over ───────────────────────────────────────────'

select count(*) as relation_edges_live
  from platform.associations
 where relation_field_id is not null and deleted_at is null;

\echo ''
\echo 'relhalves_green: all clauses PASS. Nothing was committed.'
