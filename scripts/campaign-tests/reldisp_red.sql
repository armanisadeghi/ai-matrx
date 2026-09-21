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
--   R3  `custom._words_for` does not exist — the one resolver is not there
--   R4  `custom.field_update` ACCEPTS a display spec, reports success, and changes NOTHING.
--       This is the defect in its purest form: a door that quietly ignores what it was told.
--   R5  `custom._field_document_for` drops a display spec on the floor when a column is
--       declared — no refusal, no warning, no key
--   R6  the customer chip can only ever read ONE column: the Customers table's title field
--
-- RUN IT:  psql <main database> -f scripts/campaign-tests/reldisp_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

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
  v_red     integer := 0;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
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

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname = '_words_for') then
    raise exception 'R3 is not red: custom._words_for still exists on the old bytes';
  end if;
  v_red := v_red + 1;
  raise notice 'R3 RED — custom._words_for does not exist: there is no one resolver to carry a spec.';

  -- ══ R4 — THE DOOR REPORTS SUCCESS AND CHANGES NOTHING ═════════════════════════════════
  perform custom.field_update(v_org, v_f_cust,
            jsonb_build_object('display',
              jsonb_build_object('columns', jsonb_build_array('customer_name', 'city'),
                                 'separator', ' — ')));
  -- read back through the door a screen reads through, not out of the table
  select f.document -> 'display' into v_doc
    from custom.read_records(v_org, custom.field_kernel_id(), false, 500, 0) f
   where f.id = v_f_cust;
  if v_doc is not null then
    raise exception 'R4 is not red: the old field_update stored a display spec (%)', v_doc::text;
  end if;
  v_red := v_red + 1;
  raise notice 'R4 RED — custom.field_update took the display spec, returned the field id, said nothing, and the column holds no display key at all.';

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
  raise notice '% of 7 BLOCKS ARE RED on the real inverse bytes', v_red;
  if v_red <> 7 then
    raise exception 'the red twin did not go red in every block';
  end if;
end
$t$;

rollback;

-- ══ AND THE NEW BYTES ARE BACK, OUTSIDE THE TRANSACTION ══════════════════════════════════
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
  if v_doc is not null then
    raise exception 'THE OWNER''S COLUMN WAS CHANGED: jobs.customer holds a display spec this lane left behind (%)', v_doc::text;
  end if;
  raise notice 'ROLLBACK VERIFIED — the three doors are back, the create door carries the spec again, and jobs.customer holds NO display spec: the owner''s column is exactly as he left it.';
end
$t$;
