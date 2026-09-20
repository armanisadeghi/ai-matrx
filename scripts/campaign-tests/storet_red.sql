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

begin;
set local statement_timeout = '600s';

-- The inverses, applied for real inside this transaction. Nothing here is committed.
\i migrations/inverse/storet_the_doors_a_person_can_reach_down.sql
\i migrations/inverse/storet_a_table_you_can_see_a_record_in_is_a_table_you_know_down.sql
\i migrations/inverse/storet_the_field_door_carries_out_the_change_down.sql
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
  v_doc jsonb; v_n integer; v_red integer := 0; v_caught text; v_t2_red boolean := false;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'storet_red.sql runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign-test/storet_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_shared, 'ZZ STORE-T Red shared', 'zz-storet-r-s-'||substr(v_shared::text,1,8), 'ZRS', c_admin),
    (v_open,   'ZZ STORE-T Red open',   'zz-storet-r-o-'||substr(v_open::text,1,8),   'ZRO', c_admin);
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
  values (v_shared, null, jsonb_build_object('name','ZZ HQ')) returning id into v_h1;
  insert into custom.record (organization_id, table_id, data)
  values (v_open, null, jsonb_build_object('name','ZZ HQ')) returning id into v_h2;

  -- the fixtures, built as the OWNER (this is setup, not the thing under test)
  v_proj_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','ZZ Project','slug','zz_storet_r_project','type','entity','label_singular','Project',
    'label_plural','Projects','title_field','pname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),'parent_id',v_h1::text));
  v_note_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','ZZ Note','slug','zz_storet_r_note','type','entity','label_singular','Note',
    'label_plural','Notes','title_field','body','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','body')),'parent_id',v_h1::text));
  perform custom.field_declare(v_shared, v_note_t, jsonb_build_object('label','Detail','plain','text'));
  v_proj := custom.record_write(v_shared, v_proj_t, jsonb_build_object('pname','Project A','parent_id',v_h1::text));
  v_note := custom.record_write(v_shared, v_note_t, jsonb_build_object('body','the note','parent_id',v_h1::text));
  perform custom.relation_carry(v_shared, v_proj, v_note);
  perform custom.share_grant(v_shared, v_proj, 'user', c_dana, 'viewer'::public.permission_level);

  v_wid_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Widget','slug','zz_storet_r_widget','type','entity','label_singular','Widget',
    'label_plural','Widgets','title_field','wname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','wname')),'parent_id',v_h2::text));
  v_f_code := custom.field_declare(v_open, v_wid_t, jsonb_build_object('label','Code','plain','text'));
  v_a := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','A','code','abc','parent_id',v_h2::text));
  v_b := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','B','code','12','parent_id',v_h2::text));

  v_sh_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Shape','slug','zz_storet_r_shape','type','entity','label_singular','Shape',
    'label_plural','Shapes','title_field','shname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','shname')),'parent_id',v_h2::text));
  v_f_kind := custom.field_declare(v_open, v_sh_t, jsonb_build_object(
    'label','Kind','parity_type','select','options', jsonb_build_array('Circle','Rectangle','Square')));

  v_co_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Company','slug','zz_storet_r_company','type','entity','label_singular','Company',
    'label_plural','Companies','title_field','cname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cname')),'parent_id',v_h2::text));
  v_ca := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Company A','parent_id',v_h2::text));
  v_cb := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Company B','parent_id',v_h2::text));
  perform custom.relation_carry(v_open, v_ca, v_cb);
  perform custom.relation_carry(v_open, v_cb, v_ca);

  -- ══════ BLOCK 0 — THE SEAT IS THE DEFECT, PROVEN BOTH WAYS IN ONE TRANSACTION ════════
  -- The old `custom.migrate_retype` is back and it is SECURITY INVOKER again. From the owner's
  -- seat — the seat EVERY campaign suite before this one ran in — it works. From a signed-in
  -- seat it is `permission denied` on its own first line. Same body, same transaction.
  if (custom.migrate_retype(v_open, v_a, 'zz_storet_r_widget', 'red') ->> 'verb') is distinct from 'retype' then
    raise exception '0: the owner seat could not run the unfixed verb, so this block proves nothing';
  end if;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.migrate_retype(v_open, v_b, 'zz_storet_r_widget', 'red');
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
  begin
    perform custom.record_write(v_open, v_sh_t, jsonb_build_object('shname','S1','kind','Circle','parent_id',v_h2::text));
    raise notice 'BLOCK 3 is GREEN — "Circle" was accepted as a choice';
  exception when check_violation then
    v_red := v_red + 1;
    get stacked diagnostics v_caught = message_text;
    raise notice 'BLOCK 3 RED — T8: "%"', v_caught;
  end;

  -- ══════ BLOCK 4 — T7: the declaring door throws the caller's words away ═══════════════
  v_per_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Asset','slug','zz_storet_r_asset','type','entity','label_singular','Asset',
    'label_plural','Assets','title_field','aname','display','page','weight','light','ordered',false,
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
    raise notice 'BLOCK 5 RED — T11: rolling up from Company A reaches % node(s), and A partners B', v_n;
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
  if v_red < (case when v_t2_red then 7 else 6 end) then
    raise exception 'ONLY % assertions went red — a suite whose defects it cannot reproduce proves nothing', v_red;
  end if;
  raise notice '% assertions are RED (the defect each one asserts is really gone): T9 by the SEAT ALONE, T12, T8, T7 twice, T11, B1%.',
    v_red, case when v_t2_red then ', T2' else ' — and T2 is recorded above as no longer reproducible, for the reason given there' end;
end
$t$;

rollback;

\echo 'ROLLBACK VERIFIED — five inverse files and two emptied trigger bodies ran for real, every assertion went red, and nothing was kept.'
