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
-- nightly dev clone. It is SELECT-only from end to end — no `begin`, no write, no rollback to
-- get wrong — so it is safe on the live instance and needs no maintenance window.
--
--   0  the census function is installed (an absent census is a REFUSAL, never a pass)
--   1  ZERO halves disagree, in EITHER direction. Red names every one.
--   2  the estate is not empty — relation values and relation edges exist in quantity, so
--      clause 1's zero is a measured zero and not an empty table.
--   3  THE OPEN CLASS IS PRINTED, EVERY RUN. A relation field whose declared target is the
--      Person or File kernel holds an auth.users / storage id, and
--      `custom.record_relation_edges` implies a record-to-record edge for it that no door can
--      write — so the FIRST person to fill one of those cells is refused at COMMIT. 29 Person
--      fields and 5 File fields existed when this was written; one record had already hit it
--      (Signal & Scale Podcast's `producer`) and STORE-TXN-4 withdrew that value rather than
--      leave the episode unsavable. This clause does not FAIL on it — the repair is a change to
--      the store's hottest read function and belongs to a named lane — it PRINTS it, so the
--      class cannot be rediscovered by accident a third time.
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
\echo '── 3 · the OPEN class: a relation that points at the Person or File kernel ────────────'
\echo '     (printed, never failed — repairing it is a change to custom.record_relation_edges'
\echo '      and to the halves guard, which belongs to its own lane, not to a census)'

select k.data ->> 'name'                       as points_at_kernel,
       count(*)                                as relation_fields,
       count(distinct f.organization_id)       as organizations
  from custom.record f
  join custom.record k
    on k.id = nullif(f.data ->> 'relation_target', '')::uuid
   and k.data_class = 'kernel'
 where f.table_id = custom.field_kernel_id()
   and f.deleted_at is null
   and f.data ->> 'type' = 'relation'
 group by 1
 order by 2 desc;

\echo ''
\echo 'relhalvescensus_green: all clauses PASS. Nothing was written; this suite never opens a transaction.'
