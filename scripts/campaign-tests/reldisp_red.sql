-- LANE RELATION-DISPLAY — THE RED TWIN.
--
-- It runs the REAL BYTES of `migrations/inverse/reldisp_a_relation_says_which_words_it_shows_down.sql`
-- — the verbatim `pg_get_functiondef` of the four bodies this lane replaced, taken from the
-- live catalogue immediately before the apply — inside ONE transaction, proves the capability
-- is GONE on those bytes, and rolls back. Then, outside the transaction, it proves the new
-- bytes are back. A guard nobody has watched fail is not a guard.
--
-- ON THE OLD BYTES, EVERY ONE OF THESE MUST BE TRUE:
--   R1  `custom.relation_words` does not exist at all — there is no per-field display door
--   R2  `custom.relation_words_many` does not exist — no batch door, which is exactly what
--       TAILS-2 wrote down ("there is still no batch door on the store")
--   R3  RETIRED 2026-09-22 — the inverse deliberately does not drop `custom._words_for`
--       (later migrations adopted it), so this clause could never go red. See the block.
--   R4  `custom.field_update` ACCEPTS a display spec, reports success, and changes NOTHING.
--       This is the defect in its purest form: a door that quietly ignores what it was told.
--   R5  `custom._field_document_for` drops a display spec on the floor when a column is
--       declared — no refusal, no warning, no key
--   R6  the customer chip can only ever read ONE column: the Customers table's title field
--
-- RUN IT:  psql <main database> -f scripts/campaign-tests/reldisp_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'reldisp_red.sql'
\set requires 'grant:authenticated:custom.field_update'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- SUITES-TIDY 2026-09-22: THE OWNER'S OWN DISPLAY SPEC, READ BEFORE ANYTHING IS TOUCHED.
-- The teardown at the foot of this file asserts that jobs.customer is exactly as the owner
-- left it. It used to assert "holds NO display spec", which was true when this suite was
-- written and is not now: measured on the clone (production's own data) he has since set one
-- through the product. The teardown compares against THIS value instead, so it stays a real
-- check of "nothing left behind" whatever he has set.
select coalesce((select (f.data -> 'display')::text
                   from custom.record f
                  where f.organization_id = '6069a466-1445-42df-a64e-cf37ecdc1b99'
                    and f.id = '19afd7c8-5b3d-45f0-b4a9-238ec3248493'), '') as reldisp_owner_display
\gset

begin;

-- ── THE RECORD-STORE SWITCH, BORROWED (SUITES-TIDY 2026-09-22) ──────────────────────────────
-- `custom.system_enabled` defaults to FALSE and that is the DESIGN: the record store is opt-in
-- per organization (STORE-OFF / FIX-11A). This suite takes a seat in an organization that has
-- not opted in, so every write below was answered "This organization has not turned the record
-- store on yet, so custom.<door> is not taking writes." — correctly. The knob's DEFAULT is not
-- touched; the organization-scoped override is written inside THIS transaction and goes with
-- the ROLLBACK at the end of the file. See _borrow_store_switch.sql for why that is a stronger
-- borrow than scripts/lib/borrow-live-switch.sh, which a psql suite cannot source.
-- Rincon Plumbing Co
\set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
\i scripts/campaign-tests/_borrow_store_switch.sql


-- ══ PUT THE OLD BYTES BACK, FOR REAL ═══════════════════════════════════════════════════
\i migrations/inverse/reldisp_a_relation_says_which_words_it_shows_down.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';  -- Rincon Plumbing Co
  v_f_cust  constant uuid := '19afd7c8-5b3d-45f0-b4a9-238ec3248493';  -- jobs.customer -> Customers
  v_jobs    constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';
  v_cust    uuid;
  v_doc     jsonb;
  v_doc_before jsonb;
  v_red     integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/reldisp_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT ════════════════════════════════════════════════════════════
  -- The DDL above had to run as the owner; everything ASSERTED below is asserted from the
  -- seat a person actually sits in, because a suite running as the role that owns
  -- custom.record walks through the organization wall on its first line and proves nothing.
  -- R5 and R6 step to the store's own lane DELIBERATELY and say so, because the two things
  -- they measure are a non-door helper and a server_only function that no seat may call —
  -- which is itself half of what R6 proves.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  raise notice '0 — the seat is authenticated; every clause below is judged from it.';

  -- ══ R1 / R2 / R3 — the three functions are simply not there ═══════════════════════════
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname = 'relation_words') then
    raise exception 'R1 is not red: custom.relation_words still exists on the old bytes';
  end if;
  v_red := v_red + 1;
  raise notice 'R1 RED — custom.relation_words does not exist: no per-field display door at all.';

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname = 'relation_words_many') then
    raise exception 'R2 is not red: custom.relation_words_many still exists on the old bytes';
  end if;
  v_red := v_red + 1;
  raise notice 'R2 RED — custom.relation_words_many does not exist: no batch door, exactly as TAILS-2 recorded.';

  -- R3 RETIRED — SUITES-TIDY 2026-09-22. It asserted that `custom._words_for` is absent once
  -- the old bytes are back. It cannot: the inverse this file runs
  -- (migrations/inverse/reldisp_a_relation_says_which_words_it_shows_down.sql) says so in its
  -- own words at its foot — "`custom._words_for`, `custom._display_spec_for` and
  -- `custom._with_display` are deliberately NOT dropped here … later migrations adopted all
  -- three". A red clause whose inverse no longer removes the thing has no job, and a clause
  -- that can never go red is not a guard. R1 and R2 above still carry the class: the two
  -- PUBLIC doors of this lane do go away with the old bytes, and R4/R5/R6 below prove the
  -- behaviour, which is what the clause was ultimately about.

  -- ══ R4 — THE DOOR REPORTS SUCCESS AND CHANGES NOTHING ═════════════════════════════════
  -- SUITES-TIDY 2026-09-22: this clause used to assert "no display key at all" after the call.
  -- That held when the column carried none; measured on the clone (production's own data) the
  -- owner has since set one through the product ({"columns":["customer_name","city"],
  -- "separator":", "}), so "is not null" read HIS spec as the old door's doing. The claim is
  -- and always was that the old door CHANGES NOTHING, so the clause now takes the before
  -- value and asserts the after value is identical to it — which is a stronger statement and
  -- does not depend on what the column happens to hold.
  select f.document -> 'display' into v_doc_before
    from custom.read_records(v_org, custom.field_kernel_id(), false, 500, 0) f
   where f.id = v_f_cust;

  perform custom.field_update(v_org, v_f_cust,
            jsonb_build_object('display',
              jsonb_build_object('columns', jsonb_build_array('customer_name', 'city'),
                                 'separator', ' — ')));
  -- read back through the door a screen reads through, not out of the table
  select f.document -> 'display' into v_doc
    from custom.read_records(v_org, custom.field_kernel_id(), false, 500, 0) f
   where f.id = v_f_cust;
  if v_doc is distinct from v_doc_before then
    raise exception 'R4 is not red: the old field_update MOVED the display spec, from % to %',
      coalesce(v_doc_before::text, '(nothing)'), coalesce(v_doc::text, '(nothing)');
  end if;
  if coalesce(v_doc ->> 'separator', '') = ' — ' then
    raise exception 'R4 is not red: the separator this clause asked for is the one that came back';
  end if;
  v_red := v_red + 1;
  raise notice 'R4 RED — custom.field_update took the display spec, returned the field id, said nothing, and the column still reads back exactly what it did before the call (%).', coalesce(v_doc::text, '(nothing)');

  -- ══ R6 — FROM THE SEAT THERE IS NO DOOR THAT RETURNS A RELATION'S WORDS AT ALL ════════
  -- This is the sharpest statement of the defect: on the old bytes a screen could not ask
  -- the store what a relation cell says. `relation_words` does not exist (R1) and
  -- `record_words` is server_only, so the browser had to resolve labels itself — which is
  -- exactly why three separate copies of that resolution grew in records-ui, and why none
  -- of them could ever have shown two columns joined.
  begin
    perform custom.record_words(v_org, '00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'R6 is not red: the seat could call custom.record_words';
  exception
    when insufficient_privilege then null;
    when undefined_function then null;
  end;
  v_red := v_red + 1;
  raise notice 'R6 RED — from the seat there is NO door that returns a relation''s words: relation_words does not exist and record_words refuses.';

  -- ══ R5 — THE CREATE DOOR DROPS IT ON THE FLOOR TOO ════════════════════════════════════
  -- Stepping to the store's own lane on purpose: `custom._field_document_for` is the shape
  -- builder behind `field_declare`, not a door any seat may call.
  perform set_config('role', 'postgres', true);
  v_doc := custom._field_document_for(v_org, v_jobs,
             jsonb_build_object('type', 'relation', 'name', 'Customer on this job',
                                'relation_target', 'efb51c4f-ad00-41d0-9651-a5af7cbf89da',
                                'display', jsonb_build_array('customer_name', 'city')));
  if v_doc ? 'display' then
    raise exception 'R5 is not red: the old _field_document_for carried the display key';
  end if;
  if (v_doc ->> 'type') <> 'relation' then
    raise exception 'R5 could not build a relation at all on the old bytes: %', v_doc::text;
  end if;
  v_red := v_red + 1;
  raise notice 'R5 RED — the create door built the relation and silently dropped the display spec: %', v_doc::text;

  -- ══ R6b — AND WHAT THE STORE ITSELF COULD ONLY EVER ANSWER: ONE COLUMN ════════════════
  -- Still on the store's lane. `custom.record_words` on the old bytes takes a record id, a
  -- noun, and nothing else: there is no argument, no key and no door that could make it
  -- read the town as well as the name.
  select nullif(x.data ->> 'customer', '')::uuid into v_cust
    from custom.record x
   where x.organization_id = v_org and x.table_id = v_jobs and x.deleted_at is null
     and nullif(x.data ->> 'customer', '') is not null
   limit 1;
  if position(' — ' in custom.record_words(v_org, v_cust)) > 0 then
    raise exception 'R6b is not red: the old resolver joined two columns';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'custom' and p.proname = 'record_words'
         and pg_get_function_identity_arguments(p.oid) like '%jsonb%') > 0 then
    raise exception 'R6b is not red: the old record_words takes a spec argument';
  end if;
  v_red := v_red + 1;
  raise notice 'R6b RED — the chip reads "%" and record_words has no argument that could make it read the town as well.',
    custom.record_words(v_org, v_cust);
  perform set_config('role', 'authenticated', true);

  raise notice '';
  raise notice '% of 6 BLOCKS ARE RED on the real inverse bytes', v_red;
  if v_red <> 6 then
    raise exception 'the red twin did not go red in every block';
  end if;
end
$t$;

rollback;

-- ══ AND THE NEW BYTES ARE BACK, OUTSIDE THE TRANSACTION ══════════════════════════════════
select set_config('matrx.reldisp_owner_display', :'reldisp_owner_display', false)
\g (tuples_only=on format=unaligned) /dev/null

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';
  v_f_cust  constant uuid := '19afd7c8-5b3d-45f0-b4a9-238ec3248493';
  v_jobs    constant uuid := 'af3bfff6-a255-41e5-9ac2-879d53816163';
  v_cust    uuid;
  v_doc     jsonb;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'custom' and p.proname in ('relation_words', 'relation_words_many', '_words_for')
                 having count(*) = 3) then
    raise exception 'ROLLBACK DID NOT RESTORE: the three functions are not all back';
  end if;
  -- the create door carries the spec again, and the owner's column is still exactly as he left it
  v_doc := custom._field_document_for(v_org, v_jobs,
             jsonb_build_object('type', 'relation', 'name', 'Customer on this job',
                                'relation_target', 'efb51c4f-ad00-41d0-9651-a5af7cbf89da',
                                'display', jsonb_build_array('customer_name', 'city')));
  if not (v_doc ? 'display') then
    raise exception 'ROLLBACK DID NOT RESTORE: the create door dropped the display spec again';
  end if;
  select nullif(x.data ->> 'customer', '')::uuid into v_cust
    from custom.record x
   where x.organization_id = v_org and x.table_id = v_jobs and x.deleted_at is null
     and nullif(x.data ->> 'customer', '') is not null
   limit 1;
  select f.data -> 'display' into v_doc from custom.record f
   where f.organization_id = v_org and f.id = v_f_cust;
  if coalesce(v_doc::text, '') is distinct from coalesce(current_setting('matrx.reldisp_owner_display', true), '') then
    raise exception 'THE OWNER''S COLUMN WAS CHANGED: jobs.customer read "%" before this suite ran and reads "%" now',
      coalesce(nullif(current_setting('matrx.reldisp_owner_display', true), ''), '(nothing)'),
      coalesce(v_doc::text, '(nothing)');
  end if;
  raise notice 'ROLLBACK VERIFIED — the three doors are back, the create door carries the spec again, and jobs.customer reads exactly what it read before this suite started (%): the owner''s column is exactly as he left it.',
    coalesce(nullif(current_setting('matrx.reldisp_owner_display', true), ''), '(no display spec)');
end
$t$;
