-- target: branch
--
-- LEVEL THE REHEARSAL BRANCH WITH THE TWO `records/store.*` KNOB ROWS MAIN HAS CARRIED
-- SINCE 2026-09-22 10:32 UTC.
--
-- WHY THIS FILE EXISTS, AND WHY IT IS NOT A TEST FIXTURE
-- -----------------------------------------------------
-- `matrx_records/knobs.py` reads `records/store.read_default_limit` and
-- `records/store.read_max_limit` through `platform.knob_resolve` before the principal's RLS
-- session opens, and `platform.knob_resolve` RAISES for an unknown key rather than inventing a
-- permissive default (that is the point of 1030 — the constants are GONE from the code). So on a
-- database that lacks these two rows, EVERY store verb that calls `ensure_home()` dies in the
-- reader with `RecordsKnobUnreadable` before it touches a door. Measured by lane RECORDS-SUITE-2
-- on 2026-09-22: 51 failed / 24 errors out of 201 in `packages/matrx-records/tests`, and this one
-- absent pair is the first line of the traceback in the large majority of them.
--
-- The rows are on MAIN (`aidream/db/migrations/1030_fifteen_server_opinions_become_knobs.sql`,
-- applied 2026-09-22 10:32:15Z). They are NOT on the rehearsal branch, and the reason is
-- structural, not accidental: BRANCH-REFRESH round 2 seeds `platform.feature_knob` verbatim from
-- the NIGHTLY CLONE, and the clone's high-water mark on 2026-09-22 was 07:38 UTC — three hours
-- before 1030 landed. Any knob the campaign seeds onto main between the clone's snapshot and the
-- refresh is missing from the branch by construction, and will be again tomorrow. **The class fix
-- is BRANCH-REFRESH's**: either the knob seed is read from main (a SELECT, inside the window, like
-- the schema list already is) or the refresh declares the lag and the suites skip by name. This
-- file is the instance fix so the store's suite can be classified today.
--
-- 1030 itself cannot be applied here: it carries no `-- target:` header, so the runner judges it
-- production-only, and adding a header to a file already in main's ledger would change its
-- checksum. Hence a rehearsal file carrying the same two rows, byte-compared against main's.
--
-- ADDITIVE: two INSERTs into an existing registry, `on conflict (feature, key) do nothing`, so a
-- branch that has caught up is untouched and a re-run changes nothing. No DDL, no DROP, no REVOKE.
-- Every value below is copied from main's live row, including `taxonomy_node_id`
-- c5d29fbf-fd62-40dd-afd0-9cd96d4cca93 ("Custom Data"), which already exists on the branch.
--
-- lane: RECORDS-SUITE-2

insert into platform.feature_knob
    (feature, key, value, default_value, value_type, unit, min_value, max_value,
     label, description, set_by, basis, review_due, overridable_by, override_direction,
     ui, propagation, public_read, delegable, taxonomy_node_id)
values
    ('records', 'store.read_default_limit', '50'::jsonb, '50'::jsonb, 'integer', 'records', 1, 1000,
     'Records returned when no number is asked for',
     'How many records a read of the data store hands back when the caller named no limit — a table listing, a workflow''s read step, an agent''s query.',
     'agent',
     'Replaces DEFAULT_READ_LIMIT = 50 in packages/matrx-records/matrx_records/store/client.py; read live through platform.knob_resolve by matrx_records/knobs.read_limits(), resolved before the principal''s RLS session opens. Fifty rows is one screen and a few hundred tokens of an agent''s context. The trade: raise it and every unbounded read costs more; lower it and callers page more often.',
     '2026-10-22'::date, '{organization}', 'any', '{}'::jsonb, 'next_load', false, true,
     'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93'::uuid),
    ('records', 'store.read_max_limit', '500'::jsonb, '500'::jsonb, 'integer', 'records', 1, 5000,
     'Most records one read may return',
     'The ceiling on any single read of the data store. A caller asking for more than this gets this many — a verb that can return a million rows into a model''s context is a verb that will, once.',
     'agent',
     'Replaces MAX_READ_LIMIT = 500 in packages/matrx-records/matrx_records/store/client.py; read live through platform.knob_resolve by matrx_records/knobs.read_limits(). Ten times the default, so a deliberate full read of a working table succeeds while one call still cannot page a whole organization''s data into a context window. The trade: raising it is the fastest way to make an agent turn expensive.',
     '2026-10-22'::date, '{organization}', 'any', '{}'::jsonb, 'next_load', false, true,
     'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93'::uuid)
on conflict (feature, key) do nothing;

do $$
declare n int;
begin
    select count(*) into n from platform.feature_knob
     where feature = 'records' and key in ('store.read_default_limit', 'store.read_max_limit');
    if n <> 2 then
        raise exception 'the branch still carries % of the 2 records/store.* knob rows; matrx_records/knobs.py cannot resolve its limits', n;
    end if;
end $$;
