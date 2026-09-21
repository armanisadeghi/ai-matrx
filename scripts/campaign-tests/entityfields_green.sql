-- ENTITY-FIELDS — THE GREEN SUITE. One walk, from the seat, of the whole clause:
-- "custom fields on every Entity and Detail table".
--
-- RUN IT (main database):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/entityfields_green.sql
--
-- IT IS NOT A MIGRATION: it lives outside migrations/, is swept by nothing, and its single
-- transaction ends in ROLLBACK, so the two disposable rows it creates and the six Field
-- records it declares leave nothing behind (census zero).
--
-- IT TAKES THE SEAT (SEAT-RECIPE.md): every asserted clause runs as `authenticated` with
-- admin@admin.com's claims, through the doors a signed-in person reaches, and PART 0 proves
-- the seat is a client seat before anything else runs. The two fixture statements no client
-- door covers - creating the disposable company and note, and the hard delete in PART 8 -
-- step out and say so, and assert nothing while out.
--
-- WHAT MAKES IT FAIL (each is a real change, named against its part):
--   · custom._entity_custom_fields_guard loses SECURITY DEFINER         → 3
--   · custom.entity_field_declare stops writing `table_token`           → 1, 2
--   · custom.entity_field_declare stops asking iam.has_org_admin        → 7
--   · custom.entity_field_declare stops checking the real columns       → 2b
--   · custom.entity_table stops judging the registry TYPE               → 2c
--   · custom.entity_record_read becomes SECURITY DEFINER                → 8
--   · custom.entity_records_find stops checking the field is declared   → 5c
--   · platform.custom_fields_retrofit never ran on crm.interaction      → 2, 3b
-- Its RED twin is scripts/campaign-tests/entityfields_red.sql.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER, everywhere it could matter: PART 5 asks
-- the same filter for Gold (1 row) and for Bronze (0 rows); PART 3 writes three types and
-- refuses two different bad values with two different sentences; PART 2 refuses three
-- different declarations for three different reasons; PART 7 refuses a member and then shows
-- the SAME member doing what she may. `return expected` survives none of them.

\set ON_ERROR_STOP on
\timing off

begin;

-- THE SEAT WALK — a person adds custom fields to two real standard business tables and uses
-- them. Runs as `authenticated` (admin@admin.com) in "admin's Workspace", whose store is on.
do $w$
declare
  v_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_boss  text := current_user;
  v_party uuid; v_inter uuid;
  f1 uuid; f2 uuid; f3 uuid; g1 uuid; g2 uuid; g3 uuid;
  v jsonb; n int; v_gold uuid; v_bronze uuid; v_pos uuid;
begin
  -- fixtures as the connected role: two disposable rows this admin account owns
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin), true);
  insert into crm.party (organization_id, party_kind, display_name, created_by, visibility)
  values (v_org, 'organization', 'Anchor Point Insurance Agency', v_admin, 'internal')
  returning id into v_party;
  insert into crm.interaction (organization_id, party_id, subject, direction, channel_code, status, created_by)
  values (v_org, v_party, 'Anchor Point Insurance Agency renewal call', 'outbound', 'note', 'planned', v_admin)
  returning id into v_inter;

  -- ===================== PART 0 — TAKE THE SEAT AND PROVE IT =====================
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this walk did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0  seat taken: % — a client seat, holding nothing in schema custom', current_user;

  -- 🚨 PART 0b — THE COLD CALL, AND IT IS THE FIRST THING THE SEAT DOES.
  -- PL/pgSQL caches a function's expression plans per SESSION and does not re-check EXECUTE
  -- on a cached plan. So a SECURITY INVOKER door called AFTER a SECURITY DEFINER door has
  -- warmed the same inner expression runs on a privilege the person does not have - and an
  -- earlier version of this very suite passed that way while a real person on a fresh
  -- PostgREST connection got `42501 permission denied for function caller_role`. Every
  -- INVOKER door is therefore exercised HERE, before any definer door in this transaction
  -- has been called at all.
  v := custom.entity_record_read(v_org, 'party', v_party);
  if (v ->> 'title') is null then raise exception '0b: the cold read came back empty'; end if;
  raise notice '0b cold, before any definer door: entity_record_read answers "%"', v ->> 'title';
  begin
    perform custom.entity_records_find(v_org, 'party', 'nothing_is_declared_yet', null);
    raise exception '0c: a filter on an undeclared field returned instead of refusing';
  exception when check_violation then
    raise notice '0c cold: entity_records_find refuses by name - %', sqlerrm;
  end;
  begin
    perform custom.entity_value_write(v_org, 'party', v_party, '{"nothing_is_declared_yet":1}'::jsonb);
    raise notice '0d cold: entity_value_write accepted (no field declared yet, so nothing binds)';
  exception when insufficient_privilege then
    raise exception '0d: entity_value_write died on a privilege the person does not hold - %', sqlerrm;
  end;

  -- ===================== PART 1 — DECLARE THREE TYPES ON AN ENTITY (crm.party) ==========
  f1 := custom.entity_field_declare(v_org, 'party',
          '{"label":"Account tier","type":"list","options":["Gold","Silver","Bronze"]}'::jsonb);
  f2 := custom.entity_field_declare(v_org, 'party',
          '{"label":"Annual spend","type":"currency","unit":"$"}'::jsonb);
  f3 := custom.entity_field_declare(v_org, 'party',
          '{"label":"Renewal date","type":"datetime"}'::jsonb);
  select count(*) into n from custom.entity_fields(v_org, 'party');
  raise notice '1  crm.party (Entity) now has % custom fields: %', n,
    (select string_agg(f.data ->> 'label' || ' (' || coalesce(f.data ->> 'parity_type', f.data ->> 'type') || ')', ', ')
       from custom.entity_fields(v_org, 'party') f);
  if n <> 3 then raise exception '1: expected three fields, got %', n; end if;

  -- ===================== PART 2 — DECLARE THREE TYPES ON A DETAIL (crm.interaction) =====
  g1 := custom.entity_field_declare(v_org, 'crm_interaction', '{"label":"Sentiment","type":"list","options":["Positive","Neutral","Negative"]}'::jsonb);
  g2 := custom.entity_field_declare(v_org, 'crm_interaction', '{"label":"Follow up in days","type":"number"}'::jsonb);
  g3 := custom.entity_field_declare(v_org, 'crm_interaction', '{"label":"Summary","type":"long_text"}'::jsonb);
  select count(*) into n from custom.entity_fields(v_org, 'crm_interaction');
  raise notice '2  crm.interaction (Detail) now has % custom fields', n;
  if n <> 3 then raise exception '2: expected three fields, got %', n; end if;

  -- A SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER: the same key twice is refused, and a
  -- key that is already a real column of the table is refused for a different reason.
  begin
    perform custom.entity_field_declare(v_org, 'party', '{"label":"Account tier","type":"text"}'::jsonb);
    raise exception '2a: a duplicate field was ACCEPTED';
  exception when unique_violation then raise notice '2a duplicate refused: %', sqlerrm;
  end;
  begin
    perform custom.entity_field_declare(v_org, 'party', '{"label":"Display name","type":"text"}'::jsonb);
    raise exception '2b: a field shadowing a real column was ACCEPTED';
  exception when unique_violation then raise notice '2b shadowing a real column refused: %', sqlerrm;
  end;
  begin
    perform custom.entity_field_declare(v_org, 'crm_registry_source', '{"label":"X","type":"text"}'::jsonb);
    raise exception '2c: a Reference table took a custom field';
  exception when check_violation then raise notice '2c a Reference table refused: %', sqlerrm;
  end;

  -- ===================== PART 3 — WRITE VALUES ON REAL ROWS =====================
  -- A CHOICE IS A RECORD (FLD-5/FLD-6), so a list value is the id of the option record, and
  -- the choices come back through the store's own door rather than being guessed.
  select o.id into v_gold   from custom.field_options(v_org, f1) o where o.data ->> 'title' = 'Gold';
  select o.id into v_bronze from custom.field_options(v_org, f1) o where o.data ->> 'title' = 'Bronze';
  select o.id into v_pos    from custom.field_options(v_org, g1) o where o.data ->> 'title' = 'Positive';
  raise notice '3o the three choices came back through custom.field_options; Gold is %', v_gold;
  if v_gold is null then raise exception '3o: the choices did not come back'; end if;

  v := custom.entity_value_write(v_org, 'party', v_party,
         jsonb_build_object('account_tier', v_gold, 'annual_spend', 48000, 'renewal_date', '2027-03-01'));
  raise notice '3  wrote on the company: %', v -> 'custom';
  v := custom.entity_value_write(v_org, 'crm_interaction', v_inter,
         jsonb_build_object('sentiment', v_pos, 'follow_up_in_days', 14, 'summary', 'They asked for pricing.'));
  raise notice '3b wrote on the note: %', v -> 'custom';

  -- the definitions BIND: a value that is not one of the declared choices is refused
  begin
    perform custom.entity_value_write(v_org, 'party', v_party,
      jsonb_build_object('account_tier', gen_random_uuid()));
    raise exception '3c: a value outside the declared choices was ACCEPTED';
  exception when others then raise notice '3c an undeclared choice refused: % / %', sqlstate, sqlerrm;
  end;
  begin
    perform custom.entity_value_write(v_org, 'party', v_party, '{"annual_spend":"quite a lot"}'::jsonb);
    raise exception '3d: a word in a money field was ACCEPTED';
  exception when others then raise notice '3d a word in a money field refused: % / %', sqlstate, sqlerrm;
  end;

  -- ===================== PART 4 — READ IT BACK, COLUMNS AND CUSTOM TOGETHER ============
  v := custom.entity_record_read(v_org, 'party', v_party);
  raise notice '4  read back — title %, % real columns, custom %, live %',
    v ->> 'title', (select count(*) from jsonb_object_keys(v -> 'columns')), v -> 'custom', v -> 'live';
  if (v -> 'custom' ->> 'account_tier')::uuid <> v_gold then raise exception '4: the value did not come back'; end if;
  if (v ->> 'title') is null then raise exception '4: the row''s own columns did not come back'; end if;
  raise notice '4b who wrote it: %', v -> 'custom_written' -> 'annual_spend';

  -- ===================== PART 5 — FILTER BY A CUSTOM VALUE =====================
  v := custom.entity_records_find(v_org, 'party', 'account_tier', to_jsonb(v_gold));
  raise notice '5  filter account tier = Gold → % row(s): %', v -> 'count', v -> 'rows';
  if (v ->> 'count')::int < 1 then raise exception '5: the filter found nothing'; end if;
  v := custom.entity_records_find(v_org, 'party', 'account_tier', to_jsonb(v_bronze));
  if (v ->> 'count')::int <> 0 then raise exception '5b: the filter matched a value it should not'; end if;
  raise notice '5b filter account tier = Bronze → % row(s)', v -> 'count';
  begin
    perform custom.entity_records_find(v_org, 'party', 'nobody_declared_this', null);
    raise exception '5c: a filter on an undeclared field returned instead of refusing';
  exception when check_violation then raise notice '5c filter on an undeclared field refused: %', sqlerrm;
  end;

  -- ===================== PART 6 — HISTORY =====================
  -- The row's history is the row's history: `platform._version_capture` already writes the
  -- WHOLE row, so the custom value is in it with no second history store and no new door.
  select count(*) into n from public.version_list('party', v_party, 50, 0);
  raise notice '6  the company''s history has % versions (public.version_list, as the person)', n;
  if n < 2 then raise exception '6: the write did not make a version'; end if;
  if not exists (select 1 from history.row_versions h
                  where h.entity_type = 'party' and h.row_id = v_party
                    and h.row_data -> 'custom_fields' ? 'account_tier') then
    raise exception '6b: the custom value is not in the row''s history';
  end if;
  raise notice '6b the custom value is in version % of the row, written by %',
    (select max(h.version) from history.row_versions h
      where h.entity_type='party' and h.row_id=v_party and h.row_data -> 'custom_fields' ? 'account_tier'),
    (select h.actor_tier from history.row_versions h
      where h.entity_type='party' and h.row_id=v_party and h.row_data -> 'custom_fields' ? 'account_tier'
      order by h.version desc limit 1);

  -- ===================== PART 7 — A MEMBER WHO WAS SHARED NOTHING =====================
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_dana), true);
  begin
    perform custom.entity_field_declare(v_org, 'party', '{"label":"Dana field","type":"text"}'::jsonb);
    raise exception '7: a plain member changed the shape of a shared table';
  exception when insufficient_privilege then raise notice '7  a member may not add a field: %', sqlerrm;
  end;
  -- ...and the control: she CAN read the fields that exist, because using them is not admin work
  select count(*) into n from custom.entity_fields(v_org, 'party');
  raise notice '7b the same member reads the % fields that are there', n;
  if n <> 3 then raise exception '7b: a member could not see the fields'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin), true);

  -- ===================== PART 8 — DELETE TAKES THE VALUES WITH IT =====================
  perform set_config('role', v_boss, true);   -- a hard delete no client door covers
  delete from crm.interaction where id = v_inter;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.entity_record_read(v_org, 'crm_interaction', v_inter);
    raise exception '8: the row is gone and its custom values were still readable';
  exception when sqlstate '02000' then raise notice '8  the row is gone and so are its custom values: %', sqlerrm;
  end;

  -- ===================== PART 9 — RETIRE A FIELD =====================
  perform custom.entity_field_retire(v_org, f3);
  select count(*) into n from custom.entity_fields(v_org, 'party');
  raise notice '9  a retired field stops being offered: % left', n;
  if n <> 2 then raise exception '9: retiring left % fields', n; end if;

  raise notice 'ENTITY-FIELDS WALK: ALL PARTS PASSED';
end $w$;

rollback;
