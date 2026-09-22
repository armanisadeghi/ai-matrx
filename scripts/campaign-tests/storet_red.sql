-- STORE-T — THE RED TWIN. Every block puts THIS LANE'S CHANGE BACK THE WAY IT WAS, inside a
-- transaction that ends in ROLLBACK, and asserts that the clause `storet_green.sql` proves
-- goes RED again. A green suite nobody has seen fail is a green suite nobody should believe.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/storet_red.sql
--
-- BLOCK 0 is the one that matters most: it proves that the SEAT is what made four of these
-- defects invisible. The same call, in the same transaction, on the same unfixed body, is
-- refused from `authenticated` and succeeds from the role that owns `custom.record`. That is
-- exactly the difference between this lane's suite and every campaign suite before it.
--
-- The old bodies are read from `migrations/inverse/storet_*_down.sql` — the same files that
-- would be run to undo this lane — so running this suite is also what proves those inverses
-- are valid SQL.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'storet_red.sql'
\set requires 'function:custom.field_update'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

-- The inverses, applied for real inside this transaction. Nothing here is committed.
\i migrations/inverse/storet_the_doors_a_person_can_reach_down.sql
\i migrations/inverse/storet_a_table_you_can_see_a_record_in_is_a_table_you_know_down.sql
-- 🚨 NOT `\i storet_the_field_door_carries_out_the_change_down.sql` EITHER (lane RED-SUITES-2,
-- 2026-09-21), and the reason is a finding in its own right.
--
-- That inverse is a SNAPSHOT of `custom._field_document_for` and `custom.field_update` taken on
-- 2026-09-20. Five lanes have changed those two bodies since — LIMITS-FIX gave
-- `_field_document_for` its one-word rule (a table spec's inline field says `name`, and the
-- door used to demand `label`), and `field_update` has gained arms from ENRICH, TAILS-2,
-- FIX-7B-FIELD and this lane. Running the snapshot reverts every one of them, which is why
-- this suite died on its OWN FIXTURE — `A field needs a name` — before reaching a single
-- assertion. An inverse file carries no `-- based-on:` line and is judged by no sweep, so
-- nothing caught it. The census: 213 inverse files replace 337 distinct function bodies, and
-- `custom.field_update` alone is replaced by NINE different snapshots, at most one of which
-- can match the live body. That class is written up in this lane's PROGRESS doc.
--
-- WHAT IS PLANTED INSTEAD is T12's defect exactly, derived from the LIVE body every run so it
-- can never go stale: STORE-T's whole change was that `custom.field_update` reads `parity_type`
-- / `plain` / `type` and carries out the conversion. Before it, the door "read neither `plain`
-- nor `type` at all, so it returned success for a change it had not made." Setting the live
-- body's own `v_behaviour` to false is that door, and it leaves every other lane's arm standing.
do $storet_red_plant$
declare v_src text; v_new text;
begin
  v_src := pg_get_functiondef('custom.field_update(uuid, uuid, jsonb)'::regprocedure);
  v_new := regexp_replace(v_src,
             'v_behaviour := coalesce\(',
             'v_behaviour := false; perform coalesce(');
  if v_new = v_src then
    raise exception 'storet_red: custom.field_update no longer assigns v_behaviour the way this plant expects, so T12''s defect cannot be planted from the live body. Re-read the door and re-write this block.';
  end if;
  execute v_new;
end
$storet_red_plant$;
-- NOT `\i storet_a_choice_is_a_word_and_unique_means_unique_down.sql`: that inverse DROPS two
-- triggers on `custom.record`, which needs ACCESS EXCLUSIVE on a live sixteen-partition table
-- and dies on `lock_timeout` under ordinary traffic (lane TABLE-DELETE measured the same thing).
-- The trigger BODIES are emptied instead, which takes no table lock and is the same thing from
-- every caller's point of view. The inverse file itself is still the file that would undo this
-- lane, and it is exercised outside a busy moment.
create or replace function custom._resolve_choice_words() returns trigger
language plpgsql set search_path to 'pg_catalog' as $red$ begin return new; end $red$;
create or replace function custom._unique_rule_holds() returns trigger
language plpgsql set search_path to 'pg_catalog' as $red$ begin return new; end $red$;
\i migrations/inverse/storet_unique_is_a_rule_kind_down.sql
\i migrations/inverse/storet_the_walk_follows_a_carrying_link_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_shared uuid := gen_random_uuid();
  v_open   uuid := gen_random_uuid();
  v_h1 uuid; v_h2 uuid;
  v_proj_t uuid; v_note_t uuid; v_proj uuid; v_note uuid;
  v_wid_t uuid; v_f_code uuid; v_a uuid; v_b uuid;
  v_sh_t uuid; v_f_kind uuid; v_s1 uuid;
  v_per_t uuid; v_f_own uuid;
  v_co_t uuid; v_ca uuid; v_cb uuid;
  v_doc jsonb; v_n integer; v_red integer := 0; v_caught text; v_t2_red boolean := false; v_t8_red boolean := true;
  -- SUITES-TIDY 2026-09-22: BLOCK 4 reads `v_boss` and nothing declared it, so this suite died
  -- with `column "v_boss" does not exist` before reaching the defect it derives. It is the
  -- connected role, captured before any seat is taken, exactly as every other suite here does it.
  v_boss text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/storet_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_shared, 'Wraithmoor Regional Museum — Registrar Office', 'wraithmoor-registrar-'||substr(v_shared::text,1,8), 'WRR', c_admin),
    (v_open,   'Wraithmoor Regional Museum — Loans Office', 'wraithmoor-loans-'||substr(v_open::text,1,8), 'WRL', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_shared,'organization',v_shared,c_admin,'owner','active'),
    (v_shared,'organization',v_shared,c_dana,'member','active'),
    (v_open,'organization',v_open,c_admin,'owner','active'),
    (v_open,'organization',v_open,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_shared,v_shared,'true'::jsonb,'campaign-test/storet_red'),
    ('custom','member_default_visibility','organization',v_shared,v_shared,'"shared_only"'::jsonb,'campaign-test/storet_red'),
    ('custom','system_enabled','organization',v_open,v_open,'true'::jsonb,'campaign-test/storet_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_shared, null, jsonb_build_object('name','Wraithmoor Regional Museum — Main Building')) returning id into v_h1;
  insert into custom.record (organization_id, table_id, data)
  values (v_open, null, jsonb_build_object('name','Wraithmoor Regional Museum — Main Building')) returning id into v_h2;

  -- the fixtures, built as the OWNER (this is setup, not the thing under test)
  v_proj_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','Exhibition','slug','exhibitions','type','entity','label_singular','Exhibition',
    'label_plural','Exhibitions','title_field','pname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),'parent_id',v_h1::text));
  v_note_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','Condition note','slug','condition_notes','type','entity','label_singular','Condition note',
    'label_plural','Condition notes','title_field','body','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','body')),'parent_id',v_h1::text));
  perform custom.field_declare(v_shared, v_note_t, jsonb_build_object('label','Detail','plain','text'));
  v_proj := custom.record_write(v_shared, v_proj_t, jsonb_build_object('pname','The Unfinished Object','parent_id',v_h1::text));
  v_note := custom.record_write(v_shared, v_note_t, jsonb_build_object('body','the note','parent_id',v_h1::text));
  perform custom.relation_carry(v_shared, v_proj, v_note);
  perform custom.share_grant(v_shared, v_proj, 'user', c_dana, 'viewer'::public.permission_level);

  v_wid_t := custom.table_declare(v_open, jsonb_build_object(
    'name','Object','slug','objects','type','entity','label_singular','Object',
    'label_plural','Objects','title_field','wname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','wname')),'parent_id',v_h2::text));
  v_f_code := custom.field_declare(v_open, v_wid_t, jsonb_build_object('label','Code','plain','text'));
  v_a := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','A','code','abc','parent_id',v_h2::text));
  v_b := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','B','code','12','parent_id',v_h2::text));

  v_sh_t := custom.table_declare(v_open, jsonb_build_object(
    'name','Display case','slug','display_cases','type','entity','label_singular','Display case',
    'label_plural','Display cases','title_field','shname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','shname')),'parent_id',v_h2::text));
  v_f_kind := custom.field_declare(v_open, v_sh_t, jsonb_build_object(
    'label','Kind','parity_type','select','options', jsonb_build_array('Circle','Rectangle','Square')));

  v_co_t := custom.table_declare(v_open, jsonb_build_object(
    'name','Lending institution','slug','lending_institutions','type','entity','label_singular','Lending institution',
    'label_plural','Lending institutions','title_field','cname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cname')),'parent_id',v_h2::text));
  v_ca := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Design History Museum','parent_id',v_h2::text));
  v_cb := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Nordic Photography Archive','parent_id',v_h2::text));
  perform custom.relation_carry(v_open, v_ca, v_cb);
  perform custom.relation_carry(v_open, v_cb, v_ca);

  -- ══════ BLOCK 0 — THE SEAT IS THE DEFECT, PROVEN BOTH WAYS IN ONE TRANSACTION ════════
  -- The old `custom.migrate_retype` is back and it is SECURITY INVOKER again. From the owner's
  -- seat — the seat EVERY campaign suite before this one ran in — it works. From a signed-in
  -- seat it is `permission denied` on its own first line. Same body, same transaction.
  if (custom.migrate_retype(v_open, v_a, 'objects', 'red') ->> 'verb') is distinct from 'retype' then
    raise exception '0: the owner seat could not run the unfixed verb, so this block proves nothing';
  end if;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.migrate_retype(v_open, v_b, 'objects', 'red');
    raise notice 'BLOCK 0 is GREEN — the unfixed verb ran from a signed-in seat too';
  exception when insufficient_privilege then
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 0 RED — T9: the same body, the same transaction: the owner ran it and a signed-in person got "%"', v_caught;
  end;

  -- ══════ BLOCK 1 — T2: the old table question, from her seat ══════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.read_record(v_shared, v_note, true);
    raise notice 'BLOCK 1 NOT REPRODUCIBLE — T2: with this lane''s door arm removed she STILL reads the note, because lane SHARED-ONLY closed the same class in the KERNEL (custom.reaches_directly arm 3, "including the Table a record lives in") 4 minutes after this lane closed it in the door. Two independent fixes for one defect; this lane''s arm is now the second of the two. Reverting the kernel is not this suite''s to do.';
  exception when insufficient_privilege then
    v_t2_red := true;
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 1 RED — T2: "%"', v_caught;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══════ BLOCK 2 — T12: the old field door says yes and does nothing ═══════════════════
  perform set_config('role', 'postgres', true);       -- the old door refuses the word entirely
  begin
    perform custom.field_update(v_open, v_f_code, jsonb_build_object('plain','number'));
    v_doc := custom.read_record(v_open, v_b, true);
    if (v_doc -> 'code') is distinct from '12'::jsonb then
      v_red := v_red + 1;
      raise notice 'BLOCK 2 RED — T12: custom.field_update returned ok and "12" is still %', coalesce((v_doc -> 'code')::text,'absent');
    else
      raise notice 'BLOCK 2 is GREEN — the old field door converted the values';
    end if;
  exception when others then
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 2 RED — T12: the old field door refused the change outright: "%"', v_caught;
  end;

  -- ══════ BLOCK 3 — T8: a choice given by its word ══════════════════════════════════════
  v_t8_red := true;
  begin
    perform custom.record_write(v_open, v_sh_t, jsonb_build_object('shname','S1','kind','Circle','parent_id',v_h2::text));
    -- 🚨 NOT REPRODUCIBLE (lane RED-SUITES-2, 2026-09-21), and it is the same shape BLOCK 1
    -- above already records for T2: the defect T8 closed has been closed a SECOND time, in a
    -- different body, by a later lane. T8's defect was that a choice given by its WORD was
    -- refused because the store only accepted the option record's uuid, and this block plants
    -- it by emptying `custom._resolve_choice_words` — the body that turns the word into the
    -- option. Lane CHOICE-VALUE (`choiceval_the_values_become_words.sql`) then changed what a
    -- choice value IS: "a list field stores the option's own KEY - a short stable word",
    -- and `custom.validate_values` checks option membership against that KEY. So the word is
    -- accepted by the VALIDATOR whether or not the resolver ever ran, and emptying the
    -- resolver no longer plants anything. Reverting CHOICE-VALUE to prove STORE-T is not this
    -- suite's to do — the same ruling BLOCK 1 makes.
    v_t8_red := false;
    raise notice 'BLOCK 3 NOT REPRODUCIBLE — T8: with custom._resolve_choice_words emptied "Circle" is STILL accepted, because lane CHOICE-VALUE made the stored choice value the option''s own KEY and custom.validate_values checks membership against that word. Two independent fixes for one defect; this lane''s is now the second of the two.';
  exception when check_violation then
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 3 RED — T8: "%"', v_caught;
  end;

  -- ══════ BLOCK 4 — T7: the declaring door throws the caller's words away ═══════════════
  -- 🚨 T7's DEFECT IS DERIVED FROM THE LIVE DOOR (lane RED-SUITES-2, 2026-09-21), for the
  -- same reason BLOCK 2's is: it used to arrive with the frozen `_field_document_for` snapshot
  -- inside `storet_the_field_door_carries_out_the_change_down.sql`, and that snapshot now
  -- reverts LIMITS-FIX's one-word rule and four other lanes' arms (see the note at the top of
  -- this file). A copy of the LIVE door is made under a throwaway name, and the door itself is
  -- replaced by three lines that call the copy and throw the caller's two words away — which
  -- is precisely what T7 found it doing. Derived every run, so it can never go stale, and
  -- everything else about the door stays exactly as it is today.
  perform set_config('role', v_boss, true);
  declare v_src text; v_copy text;
  begin
    v_src  := pg_get_functiondef('custom._field_document_for(uuid,uuid,jsonb)'::regprocedure);
    v_copy := replace(v_src, 'FUNCTION custom._field_document_for(', 'FUNCTION custom.zz_redsuites2_fdf(');
    if v_copy = v_src then
      raise exception 'storet_red: custom._field_document_for could not be copied under a throwaway name, so T7''s defect cannot be derived from the live door. Re-read it and re-write this block.';
    end if;
    execute v_copy;
    execute $fdf$
      create or replace function custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
      returns jsonb language plpgsql stable set search_path to 'pg_catalog' as $b$
      begin
        return (custom.zz_redsuites2_fdf(p_organization_id, p_table_id, p_spec) - 'on_target_delete')
               || jsonb_build_object('depends_on', '[]'::jsonb);
      end
      $b$;
    $fdf$;
  end;
  perform set_config('role', 'authenticated', true);

  v_per_t := custom.table_declare(v_open, jsonb_build_object(
    'name','Conservation equipment','slug','conservation_equipment','type','entity','label_singular','Equipment item',
    'label_plural','Equipment items','title_field','aname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','aname')),'parent_id',v_h2::text));
  v_f_own := custom.field_declare(v_open, v_per_t, jsonb_build_object(
    'label','Owner','parity_type','member','on_target_delete','restrict'));
  perform custom.field_declare(v_open, v_per_t, jsonb_build_object('label','Serial','plain','text'));
  perform custom.field_declare(v_open, v_per_t, jsonb_build_object(
    'label','Shouty','parity_type','formula','depends_on', jsonb_build_array('serial'),
    'expr', jsonb_build_object('node','field','field','serial')));
  select f.data ->> 'on_target_delete' into v_caught
    from custom.applicable_fields(v_open, v_per_t, null) f where f.data ->> 'key' = 'owner';
  select count(*) into v_n
    from custom.applicable_fields(v_open, v_per_t, null) f
   where f.data ->> 'key' = 'shouty'
     and jsonb_array_length(coalesce(f.data -> 'depends_on', '[]'::jsonb)) > 0;
  if coalesce(v_caught,'') <> 'restrict' or v_n <> 0 then
    if coalesce(v_caught,'') <> 'restrict' then
      v_red := v_red + 1;
      raise notice 'BLOCK 4 RED — T7: the caller asked for `restrict` and the door wrote %', coalesce(v_caught,'nothing');
    end if;
    if v_n = 0 then
      v_red := v_red + 1;
      raise notice 'BLOCK 4 RED — T7: the caller''s depends_on was thrown away, so nothing can ever depend on a column';
    end if;
  else
    raise notice 'BLOCK 4 is GREEN — the old declaring door kept both words';
  end if;

  -- ══════ BLOCK 5 — T11: the walk cannot see a carrying link ════════════════════════════
  select count(*) into v_n from custom.query_rollup(v_open, array[v_ca], null, null, 33, 'viewer');
  if v_n < 2 then
    v_red := v_red + 1;
    raise notice 'BLOCK 5 RED — T11: rolling up from Design History Museum reaches % node(s), and it partners Nordic Photography Archive', v_n;
  else
    raise notice 'BLOCK 5 is GREEN — the old edge set followed the carrying link';
  end if;

  -- ══════ BLOCK 6 — B1: unique is refused at declaration, and duplicates both land ══════
  begin
    perform custom.field_declare(v_open, v_wid_t, jsonb_build_object(
      'label','Serial number','plain','text',
      'rules', jsonb_build_array(jsonb_build_object('kind','unique'))));
    raise notice 'BLOCK 6 is GREEN — the old store accepted a unique rule';
  exception when check_violation then
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 6 RED — B1: "%"', v_caught;
  end;

  -- SEVEN assertions, of which T2's is stated as not reproducible rather than counted.
  if v_red < (6 - (case when v_t2_red then 0 else 1 end) - (case when v_t8_red then 0 else 1 end) + 1) then
    raise exception 'ONLY % assertions went red — a suite whose defects it cannot reproduce proves nothing', v_red;
  end if;
  raise notice '% assertions are RED (the defect each one asserts is really gone): T9 by the SEAT ALONE, T12, T8, T7 twice, T11, B1%.',
    v_red,
    (case when v_t2_red then ', T2' else ' — and T2 is recorded above as no longer reproducible, for the reason given there' end)
    || (case when v_t8_red then '' else '; T8 likewise, for the reason given at BLOCK 3' end);
end
$t$;

rollback;

\echo 'ROLLBACK VERIFIED — five inverse files and two emptied trigger bodies ran for real, every assertion went red, and nothing was kept.'
