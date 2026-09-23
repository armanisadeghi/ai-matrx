-- STORE-ON — THE RECORD STORE IS ON UNLESS AN ORGANIZATION SAID OTHERWISE, AND SAID WHY.
--
-- OWNER RULING, Arman, 2026-09-23: *"the record store switch that defaults an organization to
-- OFF — so an organization has no custom data access until someone turns it on — is wrong. The
-- default is ON."* Every active organization was switched on the same day.
--
-- WHAT THIS ASKS, EVERY NIGHT, AND WHY IT IS THE RIGHT QUESTION. Not "is the knob true" — a
-- knob is a row and a row can be true while the thing it governs is dark. The predicate is:
--
--     no ACTIVE organization reads the record store OFF unless one of its own owners or
--     administrators switched it off through the settings door, and nothing has rewritten
--     the switch since. (Tightened 2026-09-23 after VERIFIER-15: "any written reason" was
--     not a predicate — see clause 2.)
--
-- An organization that turns its own store off is the product working. An organization that is
-- off because NOBODY EVER TURNED IT ON is the defect the ruling closes, and it is invisible
-- from inside that organization: every screen simply has nothing in it.
--
-- IT ASKS BOTH HALVES OF THE ONE SWITCH. `custom/system_enabled` is what every person and every
-- client reads; `custom/code_paths_enabled` is what aidream's server kill switch reads. NAV-FIX
-- ruled they are one switch and FIX-11A gave `platform.knob_override` a trigger that keeps them
-- in step — but that trigger mirrors OVERRIDE ROWS and reconciles nothing at the platform
-- default, so a ruling that moved one and not the other would put every organization with no
-- override of its own into exactly the state FIX-11A found on Greenline Landscaping Crew: every
-- screen saying on while the server refused. This suite would see that.
--
-- AND IT ASKS THE SEAT, not just the catalogue: an organization created in this transaction is
-- open the moment it exists, and `custom.store_is_open` answers true from the `authenticated`
-- role rather than only from `postgres`.
--
-- IT WRITES NOTHING THAT SURVIVES — one transaction, ending in ROLLBACK. Registered in the
-- nightly clone sweep (scripts/night/clone-suite-sweep.sh picks up every
-- scripts/campaign-tests/*.sql) and in the release gates as `pnpm check:store-on-by-default`.
-- Its red twin is scripts/campaign-tests/storeon_red.sql.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storeon_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'storeon_green.sql'
\set requires 'relation:platform.feature_knob|relation:platform.knob_override|relation:iam.organizations|function:platform.knob_resolve|function:custom.store_is_open'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

set local lock_timeout = '2s';
set local statement_timeout = '10min';

do $storeon$
declare
  v_bad        text;
  v_n          int;
  v_active     int;
  v_val        jsonb;
  v_def        jsonb;
  k            record;
  v_org        uuid;
  v_open       boolean;
begin
  -- ── 1. THE PLATFORM DEFAULT IS ON, IN BOTH COLUMNS ────────────────────────────────────
  -- `platform.knob_resolve_uncached` reads `coalesce(value, default_value)` and `value` is NOT
  -- NULL, so `value` IS the default every reader resolves and `default_value` is the factory
  -- reset `platform.feature_knob_set(…, null)` returns it to. A ruling that moved only one of
  -- them would be undone by the next reset, so both are asserted.
  for k in
    select * from (values
      ('custom',               'system_enabled'),
      ('custom',               'code_paths_enabled'),
      ('data_tables.relation', 'relation_columns_enabled')
    ) as t(feature, key)
  loop
    select value, default_value into v_val, v_def
      from platform.feature_knob where feature = k.feature and key = k.key;
    if v_val is null then
      raise exception 'CLAUSE 1 FAILED: the knob %/% is not in the register at all, so nothing resolves it and every reader falls back to whatever its own code says. Seed it.', k.feature, k.key;
    end if;
    if v_val <> 'true'::jsonb then
      raise exception 'CLAUSE 1 FAILED: the platform value of %/% is %, not true. An organization that has never touched this switch reads OFF, which is the state the owner ruled against on 2026-09-23.', k.feature, k.key, v_val;
    end if;
    if v_def <> 'true'::jsonb then
      raise exception 'CLAUSE 1 FAILED: the FACTORY RESET of %/% is %, not true. The live value is on, but platform.feature_knob_set(%L, %L, null) would turn it back off — a ruling recorded halfway.', k.feature, k.key, v_def, k.feature, k.key;
    end if;
  end loop;
  raise notice 'CLAUSE 1 PASSED: all three knobs read true in BOTH value and default_value.';

  -- ── 2. NO ACTIVE ORGANIZATION IS DARK BY OMISSION ─────────────────────────────────────
  -- `iam.organizations` has no `deleted_at`: archiving IS the soft delete here (ORG-ARCHIVE),
  -- so "active" is `archived_at is null`.
  select count(*) into v_active from iam.organizations where archived_at is null;
  if v_active = 0 then
    raise exception 'CLAUSE 2 FAILED: this database holds NO active organization at all, so the census below would pass by asserting nothing.';
  end if;

  -- 🚨 TIGHTENED 2026-09-23 (VERIFIER-15). This clause used to excuse any OFF organization
  -- whose override carried "a written reason" of 20 characters or more. VERIFIER-15 found the
  -- hole on the main database: test@test.com's own workspace, Alex Hart's Workspace, read OFF
  -- carrying THIS LANE'S OWN NOTE — "owner ruling 2026-09-23: on by default" — because a
  -- records-ui demo harness kept rewriting only the row's VALUE to a hardcoded false and left
  -- the note and actor of whoever wrote it last. Any sentence at all passed. The note was
  -- literally saying the opposite of the value, and the guard read it as a reason.
  --
  -- So the ONE way out is now an OWNER OPT-OUT, and every part of it is checked, not read:
  --   (a) the override says false;
  --   (b) it was written through the settings door — `platform.unified_data_store_set`'s own
  --       sentence for a person at the switch screen, "Unified-data switch screen, …";
  --   (c) by a PERSON who is an owner or an administrator of THAT organization, active;
  --   (e) and the LAST audit row on that switch is that same write — false, that person,
  --       that sentence — so a later value-only rewrite that kept somebody else's words
  --       (exactly today's defect) can never borrow their opt-out.
  select count(*), string_agg(format('%s (%s) — %s', name, id, why), E'\n  ' order by name)
    into v_n, v_bad
  from (
    select o.id, o.name,
           case when ov.value is null
                  then 'reads OFF and carries no override of its own: nobody ever turned it on'
                when ov.value <> 'false'::jsonb
                  then 'reads OFF although its own override says ' || ov.value::text
                when coalesce(ov.set_note, '') not ilike 'Unified-data switch screen%'
                  then format('is switched off by a write that did not come through the settings door (note: %L)', left(coalesce(ov.set_note, ''), 80))
                when not owner_ok
                  then format('is switched off in the name of %s, who is not an owner or an administrator of it', coalesce(ov.updated_by::text, 'nobody'))
                else 'is switched off, but the last write on its switch was not that opt-out — somebody rewrote the value after it'
           end as why
      from iam.organizations o
      left join platform.knob_override ov
             on ov.feature = 'custom' and ov.key = 'system_enabled'
            and ov.scope_kind = 'organization' and ov.organization_id = o.id
      cross join lateral (
        select exists (
                 select 1 from iam.memberships m
                  where m.organization_id = o.id and m.container_type = 'organization'
                    and m.user_id = ov.updated_by and m.status = 'active'
                    and m.role in ('owner', 'admin')) as owner_ok,
               (select a.new_value = 'false'::jsonb
                       and a.actor is not distinct from ov.updated_by
                       and a.set_note is not distinct from ov.set_note
                  from platform.knob_override_audit a
                 where a.organization_id = o.id and a.feature = 'custom'
                   and a.key = 'system_enabled' and a.scope_kind = 'organization'
                 order by a.id desc limit 1) as last_write_is_it
      ) chk
     where o.archived_at is null
       and platform.knob_resolve('custom', 'system_enabled', o.id, null, null) is distinct from 'true'::jsonb
       -- THE ONE WAY OUT: an owner opt-out, through the settings door, still standing.
       and not (ov.value = 'false'::jsonb
                and coalesce(ov.set_note, '') ilike 'Unified-data switch screen%'
                and chk.owner_ok
                and coalesce(chk.last_write_is_it, false))
  ) s;

  if v_n > 0 then
    raise exception E'CLAUSE 2 FAILED: % of % active organizations read the record store OFF and none of them is an owner''s own opt-out through the settings door. Each of these has tables, forms and portals that answer nothing, and nobody inside them can tell why:\n  %', v_n, v_active, v_bad;
  end if;
  raise notice 'CLAUSE 2 PASSED: all % active organizations read the record store ON, or were switched off by one of their own owners through the settings door and nothing has rewritten it since.', v_active;

  -- ── 3. THE TWO HALVES OF THE ONE SWITCH AGREE, EVERYWHERE ─────────────────────────────
  select count(*), string_agg(format('%s (%s): system_enabled=%s code_paths_enabled=%s', name, id, a, b), E'\n  ' order by name)
    into v_n, v_bad
  from (
    select o.id, o.name,
           platform.knob_resolve('custom', 'system_enabled',     o.id, null, null)::text as a,
           platform.knob_resolve('custom', 'code_paths_enabled', o.id, null, null)::text as b
      from iam.organizations o
     where o.archived_at is null
  ) s
  where a is distinct from b;

  if v_n > 0 then
    raise exception E'CLAUSE 3 FAILED: % active organizations hold two halves of ONE switch that disagree. The screen and the server are answering different questions about the same store — FIX-11A''s defect, back:\n  %', v_n, v_bad;
  end if;
  raise notice 'CLAUSE 3 PASSED: both halves of the switch agree for every active organization.';

  -- ── 4. AN ORGANIZATION BORN NOW IS OPEN THE MOMENT IT EXISTS ──────────────────────────
  -- Real use case, per the no-fake-test-data law: Harborview Dental Studio, a two-chair general
  -- dentistry practice that signs up to keep its patient recall list and treatment plans in
  -- AI Matrx. Its first act after signing up is to make a table — which is the act LIMITS-FIX
  -- watched real-data crew D be refused. This row lives and dies inside this transaction.
  insert into iam.organizations (name, slug, abbreviation, description)
  values ('Harborview Dental Studio',
          'harborview-dental-studio-storeon-' || replace(gen_random_uuid()::text, '-', ''),
          'HDS',
          'Two-chair general dentistry practice; patient recall and treatment plans. Created inside scripts/campaign-tests/storeon_green.sql and discarded with its ROLLBACK.')
  returning id into v_org;

  if platform.knob_resolve('custom', 'system_enabled', v_org, null, null) is distinct from 'true'::jsonb then
    raise exception 'CLAUSE 4 FAILED: an organization created one statement ago reads the record store OFF. Its owner would make a table, add its fields, and only be refused at the first write.';
  end if;
  if platform.knob_resolve('custom', 'code_paths_enabled', v_org, null, null) is distinct from 'true'::jsonb then
    raise exception 'CLAUSE 4 FAILED: a brand-new organization has the store on for its screens and OFF for the server. Its agents would refuse work its own screens offer.';
  end if;
  if not custom.store_is_open(v_org) then
    raise exception 'CLAUSE 4 FAILED: custom.store_is_open answers false for an organization created one statement ago, so every door in the store would refuse it.';
  end if;
  raise notice 'CLAUSE 4 PASSED: Harborview Dental Studio was open for business the moment it existed (organization %).', v_org;

  perform set_config('matrx.storeon_org', v_org::text, true);

  perform set_config('matrx.storeon_active', v_active::text, true);
end
$storeon$;

-- ── 5. AND IT IS OPEN FROM A SEAT, NOT ONLY FROM postgres ───────────────────────────────
-- `custom.store_is_open` is SECURITY INVOKER and swallows a read it cannot make into `false`
-- (its own §6b.4b arm), so a grant that quietly went missing would look exactly like a
-- switched-off store to every signed-in person while a suite running as the owner saw nothing
-- at all. The seat is what tells them apart. It is taken OUTSIDE the block above because
-- `SET LOCAL ROLE` belongs to the transaction, not to a PL/pgSQL frame.
set local role authenticated;

do $storeon_seat$
begin
  if not custom.store_is_open(current_setting('matrx.storeon_org')::uuid) then
    raise exception 'CLAUSE 5 FAILED: the store reads OPEN as the database owner and CLOSED from the `authenticated` seat every signed-in person actually occupies. That is a missing grant wearing a switched-off store''s face.';
  end if;
  raise notice 'CLAUSE 5 PASSED: the seat reads the same open store the owner does.';
end
$storeon_seat$;

reset role;

do $storeon_done$
begin
  raise notice 'storeon_green.sql: ALL 5 CLAUSES PASSED (% active organizations).', current_setting('matrx.storeon_active');
end
$storeon_done$;

rollback;
