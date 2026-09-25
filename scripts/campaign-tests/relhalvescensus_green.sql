-- LANE STORE-TXN-4 — THE LIVE CENSUS OF RELATION HALVES THAT DISAGREE. RATCHET: ZERO.
--
-- WHAT THIS IS, AND WHY IT IS NOT relhalves_green.sql. `relhalves_green.sql` (lane
-- OLD-TABLES-1) proves the GUARD is installed and deferred and that an ordinary write still
-- commits. It cannot see the thing that actually hurt somebody: 32 relation halves over 22
-- records that ALREADY disagreed when the guard was installed, so the next person to save one
-- of those records was refused at COMMIT for a defect written before they arrived. A guard over
-- an estate that already violates it is a guard that fires on the innocent.
--
-- So this suite asks the ESTATE, not the catalogue: how many halves disagree on this database,
-- right now, in either direction? The answer must be ZERO, and the ratchet is zero and nothing
-- else — there is no baseline file and no allow-list, because every one of the 32 was repairable
-- through the doors (`custom.relation_halves_repair`) and the two writers that produced them
-- were fixed by STORE-TXN-3 the same day. A number above zero is a NEW defect or an unrepaired
-- record, and both want a person.
--
-- IT SHARES ONE DEFINITION WITH THE REPAIR AND WITH THE REFUSAL.
-- `custom.relation_halves_disagreements()` reads through `custom.record_relation_edges`, the
-- same reader `custom._relation_halves_agree` refuses with, and `custom.relation_halves_repair`
-- repairs exactly what it names. So "the census is green while the guard would refuse" is not a
-- state this database can reach: there is one definition of the word, in one function.
--
-- WHAT IT RUNS ON. Any of the three (the preamble decides): MAIN, the rehearsal branch, or the
-- nightly dev clone. It is SELECT-only from end to end — no write — so it is safe on the live
-- instance and needs no maintenance window. (Under the release gate it runs in one READ ONLY
-- transaction carrying the gate limits; see the block after the preamble.)
--
--   0  the census function is installed (an absent census is a REFUSAL, never a pass)
--   1  ZERO halves disagree, in EITHER direction. Red names every one.
--   2  the estate is not empty — relation values and relation edges exist in quantity, so
--      clause 1's zero is a measured zero and not an empty table.
--   3  A PERSON OR FILE RELATION CANNOT BE REFUSED. STORE-TXN-4 printed this class (29 Person
--      and 5 File fields; Signal & Scale's `producer` had already held an auth.users id and
--      been withdrawn). RELATION-TARGETS closed it: the value is the kernel record's id and the
--      store resolves a member's user id / an uploaded file's id to it at every write door. The
--      clause FAILS on any cell that is not a live kernel record, and on the resolver trigger
--      going missing once it has landed; see the clause for the one printed-only state.
--
-- Its twin is scripts/campaign-tests/relhalvescensus_red.sql, which plants one half of each
-- direction and passes only when this census NAMES it.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/relhalvescensus_green.sql
--          pnpm check:relation-halves-agree   (the release gate, against MAIN, read-only)

\set ON_ERROR_STOP on
\timing off

\set suite 'relhalvescensus_green.sql'
\set requires 'function:custom.relation_halves_disagreements'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- THE GATE DATABASE LIMITS (2026-09-25). When the release gate runs this against MAIN it passes
-- `-v gate_limits=...` (scripts/gate-db-limits.ts, the same text scripts/lib/gate-db.ts puts on every
-- TypeScript gate): the clauses then run in ONE read-only transaction whose first statement sets
-- 60 s statements, 3 s locks and 60 s idle, transaction-local — the only form that holds through
-- Supavisor's transaction pooler, which drops PGOPTIONS. It is opened here, AFTER the preamble,
-- because the preamble opens and commits its own. Without the variable (the nightly clone sweep)
-- nothing changes: each clause runs on its own, as before.
\if :{?gate_limits}
begin read only;
:gate_limits;
\endif

\echo ''
\echo '── 0 · the census function is installed ───────────────────────────────────────────────'

do $$
begin
  if to_regprocedure('custom.relation_halves_disagreements(uuid, uuid)') is null then
    raise exception
      'CLAUSE 0 FAILED: custom.relation_halves_disagreements(uuid, uuid) is not on this database, '
      'so NOTHING was measured. An unmeasured ratchet is not a green one. Apply '
      'migrations/campaign/storetxn4_the_halves_that_already_disagree_are_repaired.sql.';
  end if;
  raise notice 'CLAUSE 0 PASS — the census function is here, so this run measures something';
end $$;

\echo ''
\echo '── 1 · ZERO relation halves disagree, in either direction ─────────────────────────────'

do $$
declare
  v_n    int;
  v_list text;
begin
  select count(*),
         string_agg(format('%s · record %s · %L → %s · %s',
                           d.organization_id, d.record_id, d.field_key, d.target_id, d.direction),
                    E'\n    ' order by d.organization_id, d.record_id, d.field_key)
    into v_n, v_list
    from custom.relation_halves_disagreements() d;

  if v_n <> 0 then
    raise exception '%',
      format('CLAUSE 1 FAILED: %s relation half(s) disagree on this database. The deferred guard '
             'custom._relation_halves_agree will refuse the NEXT write to each of these records, '
             'in a sentence about a relation whoever is saving it never touched.'
             || chr(10) || '    %s' || chr(10)
             || '  Repair each record through the door: '
             || 'select custom.relation_halves_repair(<org>, <record>);' || chr(10)
             || '  It reconciles through platform.relation_set / relation_unset, never a raw '
             || 'write, and leaves one history.migration_log line per record with a real inverse.',
             v_n, v_list);
  end if;
  raise notice 'CLAUSE 1 PASS — 0 relation halves disagree, in either direction. The ratchet is zero.';
end $$;

\echo ''
\echo '── 2 · the zero is a MEASURED zero, not an empty table ────────────────────────────────'

do $$
declare v_edges int; v_values int;
begin
  select count(*) into v_edges
    from platform.associations
   where relation_field_id is not null and deleted_at is null;

  select count(*) into v_values
    from custom.record r
   where r.data_class = 'record' and r.deleted_at is null
     and exists (select 1 from custom.record_relation_edges(r.organization_id, r.id, r.table_id,
                                                            r.data_class, r.data, r.deleted_at));

  if v_edges = 0 and v_values = 0 then
    raise exception
      'CLAUSE 2 FAILED: this database holds no relation edges and no relation values at all, so '
      'clause 1 counted an empty set and proved nothing. A ratchet over nothing is not a ratchet.';
  end if;
  raise notice 'CLAUSE 2 PASS — % live relation edge(s) and % record(s) holding a relation value stand behind clause 1''s zero',
               v_edges, v_values;
end $$;

\echo ''
\echo '── 3 · a relation that points at the Person or File kernel cannot be refused ─────────'

-- RELATION-TARGETS (2026-09-23) closed the class STORE-TXN-4 printed here: a Person or File
-- relation is a relation (member / attachment ARE relations to the kernel Person / File Tables,
-- custom.parity_field_types), its value is the kernel RECORD's id, and the BEFORE-ROW trigger
-- `_w_relation_kernel_targets` turns the id a writer actually holds — a member's user id, an
-- uploaded file's id — into that record through `custom.relation_kernel_record` at every write
-- door. So "refusable" now means one of two things, and this clause counts both:
--   a · the resolver is not on this database (every such field is refusable), or
--   b · a cell already holds a value that is not a live kernel record of its organization (the
--       record's next save is refused, whatever the resolver does).
-- (b) FAILS here, always. (a) FAILS once the resolver function exists — so a trigger dropped or
-- disabled after the fact is caught — and before RELATION-TARGETS is applied it PRINTS the count
-- with the file that closes it, rather than turn a release gate red ahead of the chair's window.
do $$
declare
  v_person   int;
  v_file     int;
  v_fn       boolean := to_regprocedure('custom.relation_kernel_record(uuid, uuid, uuid)') is not null;
  v_trigger  boolean;
  v_bad      int;
  v_list     text;
begin
  select count(*) filter (where f.data ->> 'relation_target' = custom.person_kernel_id()::text),
         count(*) filter (where f.data ->> 'relation_target' = custom.file_kernel_id()::text)
    into v_person, v_file
    from custom.record f
   where f.table_id = custom.field_kernel_id() and f.data_class <> 'kernel'
     and f.deleted_at is null and f.data ->> 'type' = 'relation';

  select exists (select 1 from pg_trigger t
                  where t.tgrelid = 'custom.record'::regclass
                    and t.tgname = '_w_relation_kernel_targets'
                    and t.tgenabled <> 'D')
    into v_trigger;

  with f as (
    select f.organization_id, coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as k,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as tbl,
           (f.data ->> 'relation_target')::uuid as tgt
      from custom.record f
     where f.table_id = custom.field_kernel_id() and f.data_class <> 'kernel'
       and f.deleted_at is null and f.data ->> 'type' = 'relation'
       and f.data ->> 'relation_target' in (custom.person_kernel_id()::text, custom.file_kernel_id()::text)
  ), cells as (
    select f.organization_id, r.id as record_id, f.k, f.tgt, x.val #>> '{}' as v
      from f
      join custom.record r
        on r.organization_id = f.organization_id and r.table_id = f.tbl
       and r.data_class = 'record' and r.deleted_at is null
     cross join lateral jsonb_array_elements(
             case jsonb_typeof(r.data -> f.k) when 'array' then r.data -> f.k
                                               when 'string' then jsonb_build_array(r.data -> f.k)
                                               else '[]'::jsonb end) x(val)
  )
  select count(*), string_agg(format('%s · record %s · %L = %s', c.organization_id, c.record_id, c.k, c.v),
                              E'\n    ' order by c.organization_id, c.record_id)
    into v_bad, v_list
    from cells c
   where not exists (select 1 from custom.record t
                      where t.organization_id = c.organization_id and t.id::text = c.v
                        and t.table_id = c.tgt and t.deleted_at is null);

  if v_bad <> 0 then
    raise exception '%', format(
      'CLAUSE 3 FAILED: %s Person/File relation cell(s) hold a value that is not a live kernel '
      'record of their organization, so the next save of each record is refused:' || chr(10)
      || '    %s' || chr(10)
      || '  Resolve each through custom.relation_kernel_record (a member''s user id or an uploaded '
      || 'file''s id), one history.migration_log line per record.', v_bad, v_list);
  end if;

  if not v_trigger then
    if v_fn then
      raise exception 'CLAUSE 3 FAILED: custom.relation_kernel_record is on this database but the trigger '
        '_w_relation_kernel_targets is missing or disabled on custom.record, so all % Person and % File '
        'relation field(s) are refusable again. Re-apply '
        'migrations/campaign/reltargets_a_person_or_a_file_field_takes_the_id_you_hold.sql.', v_person, v_file;
    end if;
    raise notice 'CLAUSE 3 OPEN — refusable Person/File relation fields: % (% Person, % File); 0 bad cells. '
      'Closed by migrations/campaign/reltargets_a_person_or_a_file_field_takes_the_id_you_hold.sql '
      '(RELATION-TARGETS), not yet applied here.', v_person + v_file, v_person, v_file;
    return;
  end if;
  raise notice 'CLAUSE 3 PASS — refusable Person/File relation fields: 0 (of % Person, % File); 0 bad cells; the resolver trigger is installed and enabled.',
               v_person, v_file;
end $$;

\if :{?gate_limits}
rollback;
\endif
\echo ''
\echo 'relhalvescensus_green: all clauses PASS. Nothing was written (under the release gate, the clauses shared one read-only transaction, rolled back).'
