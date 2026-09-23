-- LANE FIX-10B-F6 — THE RED TWIN of `scripts/campaign-tests/fix10b_f6_green.sql`.
--
-- IT PUTS THE DEFECT BACK, WITH THE REAL BYTES. The first thing it does inside its
-- transaction is `\ir` the lane's own inverse migration —
-- `migrations/inverse/fix10b_f6_the_store_names_every_kind_a_column_can_be_down.sql`, the
-- `custom._field_document_for` body that stood on the main database before this lane, hash
-- f85e468fe4e0ffeb56a9ef44394c9054a417572bf06d5021ed246e45f196c5d0, plus the drops of the
-- registry and its sentence — and then asks the door exactly what the green suite's PART 2a
-- asks. Nothing is copied or paraphrased here: if the inverse ever stops restoring the
-- defect, this file stops being red and says so.
--
-- IT ENDS IN ROLLBACK, so the pre-fix body never outlives the transaction. `CREATE OR REPLACE
-- FUNCTION` and `DROP FUNCTION` are both transactional in Postgres; the rollback puts the live
-- definitions back untouched, and the last clause below proves the door is honest again.
--
-- EXPECTED: RED. Every `raise exception` below fires only if the DEFECT IS GONE while the
-- pre-fix bodies are installed — which would mean the green suite is measuring something
-- other than this lane's change.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/fix10b_f6_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'fix10b_f6_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- THE REAL BYTES OF THE INVERSE. Not a copy.
\ir ../../migrations/inverse/fix10b_f6_the_store_names_every_kind_a_column_can_be_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_crews   uuid;
  v_caught  text;
begin
  perform set_config('app.actor_system', 'campaign-test/fix10b_f6_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co',
          'rincon-plumbing-f6r-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'fix10b_f6_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name','Crews','slug','crews_f6r_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Crew','label_plural','Crews','title_field','truck',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','truck')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_crews, jsonb_build_object('key','truck','label','Truck','plain','text','sort',10));

  -- RED 1 — THE REGISTRY IS GONE, so nothing a screen can read names the signature kind.
  --          This is the whole reason the Add-field panel had no signature choice.
  if to_regprocedure('custom.field_kinds()') is not null then
    raise exception 'RED 1 FAILED: custom.field_kinds() still exists with the inverse applied — the inverse is not restoring the state this lane changed';
  end if;

  -- RED 2 — AND THE DOOR DOES NOT ANSWER TO THE WORD. This is the declaration the fixed
  --         panel sends; before the fix it is refused outright, so there is no way for a
  --         person to make the one field `custom.doc_sign` accepts.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_crews, jsonb_build_object(
      'label','Lead technician sign-off', 'type','signature', 'sort', 40));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'RED 2 FAILED: the pre-fix door accepted `type: signature`, so the green suite is not measuring this lane''s change';
  end if;
  raise notice 'RED 2 CONFIRMED — the pre-fix door refuses the panel''s declaration: %', left(v_caught, 120);

  raise notice 'FIX-10B-F6 RED — the defect is reproduced with the inverse''s real bytes. Rolling back.';
end $t$;

rollback;

-- AFTER THE ROLLBACK BOUNDARY: the live door is itself again, and the registry is back.
do $t$
begin
  if to_regprocedure('custom.field_kinds()') is null then
    raise exception 'the rollback did not restore custom.field_kinds() — the live database is now missing the registry';
  end if;
  if not exists (select 1 from custom.field_kinds() k where k.kind = 'signature') then
    raise exception 'the rollback restored a registry that does not publish signature';
  end if;
  raise notice 'AFTER ROLLBACK — custom.field_kinds() is live again and publishes signature.';
end $t$;
