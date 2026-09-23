-- LANE FIX-7B-FIELD — THE RED TWIN of `scripts/campaign-tests/fix7b_field_green.sql`.
--
-- IT PUTS THE DEFECT BACK, WITH THE REAL BYTES. The first thing it does inside its
-- transaction is `\ir` the lane's own inverse migration —
-- `migrations/inverse/fix7b_field_multi_arm_down.sql`, the `custom.field_update` body that
-- stood on the main database before this lane, hash
-- 6830cdc5970e16dff7631d9b49b7d1f574a0bdf7ad7cd7bc704040f1d709237e — and then asks the door
-- the green suite's PART 2a asks. Nothing is copied or paraphrased here: if the inverse ever
-- stops restoring the defect, this file stops being red and says so.
--
-- IT ENDS IN ROLLBACK, so the pre-fix body never outlives the transaction. `CREATE OR REPLACE
-- FUNCTION` is transactional in Postgres; the rollback puts the live body back untouched, and
-- the last clause below proves the door is honest again after the rollback boundary is the
-- only thing left standing between them.
--
-- EXPECTED: RED. Every `raise exception` below fires only if the DEFECT IS GONE while the
-- pre-fix body is installed — which would mean the green suite is measuring something other
-- than this lane's change.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/fix7b_field_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'fix7b_field_red.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- THE REAL BYTES OF THE INVERSE. Not a copy.
\ir ../../migrations/inverse/fix7b_field_multi_arm_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_cust    uuid;
  v_job     uuid;
  v_f_link  uuid;
  v_doc     jsonb;
  v_caught  text;
begin
  perform set_config('app.actor_system', 'campaign-test/fix7b_field_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Timberline Roofing RED',
          'timberline-roofing-red-' || substr(v_org::text, 1, 8), 'TLD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'fix7b_field_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- PART 0 — THE SEAT, verbatim. A defect measured as the superuser is not a defect a person has.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Customer','slug','customer_fix7b_red_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Customer','label_plural','Customers','title_field','cname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cname')), 'parent_id', v_home::text));
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name','Job','slug','job_fix7b_red_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','jname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','jname')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','cname','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_job,  jsonb_build_object('key','jname','label','Name','plain','text','sort',10));

  v_f_link := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Customer', 'type','relation', 'relation_target', v_cust::text,
    'on_target_delete','set_null', 'multi', false, 'sort', 20));
  v_doc := custom.read_record(v_org, v_f_link, true);
  raise notice 'RED, before the patch: multi=%  relation_max=%', v_doc ->> 'multi', v_doc ->> 'relation_max';

  -- ── THE DEFECT, ASKED OF THE PRE-FIX DOOR. ──────────────────────────────────
  -- It answers with the field id, so nothing throws and a client is told "saved".
  perform custom.field_update(v_org, v_f_link, jsonb_build_object('multi', true));
  v_doc := custom.read_record(v_org, v_f_link, true);
  raise notice 'RED, after {"multi": true} ALONE: multi=%  relation_max=%', v_doc ->> 'multi', v_doc ->> 'relation_max';

  if coalesce((v_doc ->> 'multi')::boolean, false) then
    raise exception 'RED FAILED: the PRE-FIX custom.field_update honoured {"multi": true} — the green suite is not measuring this lane''s change';
  end if;
  if coalesce((v_doc ->> 'relation_max')::integer, 0) <> 1 then
    raise exception 'RED FAILED: the PRE-FIX door moved relation_max to %', v_doc ->> 'relation_max';
  end if;

  -- AND THE SECOND HALF OF THE SAME SILENCE: the column still refuses two links, which is
  -- what makes "the store answered saved" a lie rather than a cosmetic gap.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_job, jsonb_build_object(
      'jname','Two customers',
      'customer', jsonb_build_array(
        custom.record_write(v_org, v_cust, jsonb_build_object('cname','Meridian Property Group'))::text,
        custom.record_write(v_org, v_cust, jsonb_build_object('cname','Fairview Estates'))::text)));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'RED FAILED: the column was still single-valued and the store took two links';
  end if;

  -- 2e's refusal does not exist in the pre-fix door either: it simply ignores `multi`.
  raise notice 'RED CONFIRMED: the pre-fix custom.field_update returned the field id for {"multi": true}, the column reads back multi=% relation_max=%, and the second link is still refused: %',
    v_doc ->> 'multi', v_doc ->> 'relation_max', left(v_caught, 80);
end $t$;

rollback;

-- AND THE LIVE DOOR IS ITSELF AGAIN. Outside the rolled-back transaction, the same patch.
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_ok boolean;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  select pg_get_functiondef(p.oid) like '%FIX-7B-FIELD%' into v_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'field_update';
  if not coalesce(v_ok, false) then
    raise exception 'the rollback did not put the fixed custom.field_update back — the live door is the PRE-FIX one';
  end if;
  raise notice 'the live custom.field_update is the FIXED body again; the pre-fix bytes did not outlive the transaction.';
end $t$;
