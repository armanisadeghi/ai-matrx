-- W3-DOC — THE RED TWIN of `scripts/campaign-tests/w3_doc_c43.sql`, ON THE MAIN DATABASE,
-- FROM THE SEAT `authenticated`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_doc_red.sql
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each refusal `w3_doc_c43.sql` relies on DISAPPEARS — and, where the failure is
-- silent rather than loud, that the wrong thing actually reaches A PERSON.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19). It used to run on the rehearsal
-- branch — which grants a client 29 of schema `custom`'s functions against main's 103 — and
-- it read every result as the role that OWNS `custom.record`, straight out of
-- `custom.doc_template`, `custom.doc_render` and `custom.doc_signature`. A red twin read from
-- that seat proves the WRONG thing lands in the store; what matters is that the wrong thing
-- reaches the person's screen. It now runs on the main database, on a disposable organization
-- of its own, and EVERY assertion below is read back through the door a signed-in person
-- reaches — `custom.doc_template_read`, `custom.doc_render_read` and
-- `custom.doc_signature_read`.
--
-- WHAT STEPS OUT OF THE SEAT, AND WHY: the fixtures no client door covers (the organization,
-- the memberships, the store switch, the Home record) and THE GUARD REMOVALS THEMSELVES — no
-- client door replaces a production function or disables a trigger. Each says so where it
-- happens and asserts nothing while out. Nothing here takes ACCESS EXCLUSIVE on a live table:
-- a replaced function body is invisible to every other session until commit, and this
-- transaction never commits, so the immutability trigger is neutered by replacing its
-- FUNCTION rather than by `ALTER TABLE … DISABLE TRIGGER`.
--
--   RED 1 — REC-68's own refusal. `custom.doc_template_save` is replaced with a body that
--           never calls `custom.doc_unresolved_tokens`, and a template naming a Field that
--           does not exist SAVES anyway and READS BACK to a person — the exact silent merge
--           REC-68 exists to prevent.
--   RED 2 — the Field's format. `custom.doc_format_value` is replaced with one that drops
--           the `currency` arm, and the document a person opens prints a bare number where
--           the Field carries a unit and a format — the merge lying about what the record
--           holds.
--   RED 3 — the seal's immutability. `custom._doc_signature_immutable` is replaced with a
--           pass-through and a signed seal is REWRITTEN — and the person reading the seal
--           through `custom.doc_signature_read` is told somebody else signed it.
--   RED 4 — the seal's tamper detection. `custom.doc_signature_intact` is replaced with one
--           that compares `signed_at` instead of the document hash, and a record edited
--           after signing still reads `intact` TO THE PERSON — the silent wrong answer that
--           lets a changed agreement keep wearing somebody's signature.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/` and no sweep can see it. Every
-- replaced function is restored to its live body before the transaction rolls back, so
-- nothing here ever needs its own `-- based-on:` line.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '60s';
set local statement_timeout = '240s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_job     uuid;
  v_f_name  uuid;
  v_f_amt   uuid;
  v_f_sig   uuid;
  v_tpl     uuid;
  v_bad     uuid;
  v_rec     uuid;
  v_doc     uuid;
  v_doc2    uuid;
  v_sig     uuid;
  v_body    text;
  v_j       jsonb;
  v_reds    integer := 0;
  v_save_def   text;
  v_format_def text;
  v_immut_def  text;
  v_intact_def text;
  v_boss    text := current_user;
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w3_doc_red.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- ── THE FIXTURES NO CLIENT DOOR COVERS, as the connected role. Nothing asserted. ──────
  perform set_config('app.actor_system', 'campaign-test/w3_doc_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Auto Body Doc Red', 'meridian-auto-body-doc-red-' || substr(v_org::text, 1, 8), 'MDR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_doc_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════
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
  begin
    perform 1 from custom.doc_signature limit 1;
    raise exception '0: this seat can read custom.doc_signature directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, and custom.record and custom.doc_signature refuse a direct read.';

  -- ── THE FIXTURE, through the doors a person reaches ───────────────────────────────────
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name','Repair Jobs','slug','repair_jobs','type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','client_name',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','amount'),
                                jsonb_build_object('name','signature')),
    'parent_id', v_home::text));

  v_f_name := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  v_f_amt  := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','amount','label','Amount','type','currency','unit','USD','sort',20));
  v_f_sig  := custom.field_declare(v_org, v_job, jsonb_build_object(
    'key','signature','label','Signature','plain','text','format','signature','sort',30));

  v_tpl := custom.doc_template_save(v_org, v_job, 'Repair Order Red',
    'Client: {{field:' || v_f_name || '}} Owes: {{field:' || v_f_amt || '}} Signed: {{field:' || v_f_sig || '}}');
  v_rec := custom.record_write(v_org, v_job, jsonb_build_object(
    '_actor','user','client_name','Ellery Vance','amount',500));

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 — REC-68's own refusal, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  -- OUT OF THE SEAT: no client door replaces a production function. Nothing is asserted here.
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.doc_template_save(uuid,uuid,text,text,uuid)'::regprocedure)
    into v_save_def;
  -- The ONE difference from the live door: `custom.doc_unresolved_tokens` is never consulted.
  -- Every other wall — the reach, the editor question and the store switch — is left standing,
  -- so what this red removes is exactly the token refusal and nothing else.
  create or replace function custom.doc_template_save(
    p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid default null)
  returns uuid language plpgsql security definer set search_path = pg_catalog as $red$
  declare v_id uuid;
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_save');
    perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.doc_template_save',
                                            'editor'::public.permission_level, 'table');
    perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id, 'name', btrim(p_name),
      'body', coalesce(p_body,''), 'template_version', 1))
    returning id into v_id;
    return v_id;
  end; $red$;
  perform set_config('role', 'authenticated', true);

  v_bad := custom.doc_template_save(v_org, v_job, 'Broken Repair Order',
    'Dear {{field:00000000-0000-4000-8000-000000000999}},');
  v_j := custom.doc_template_read(v_org, v_bad);
  if (v_j ->> 'body') not like '%{{field:00000000-0000-4000-8000-000000000999}}%' then
    raise exception 'RED 1 — with the refusal gone, the broken template still did not save. This red is not exercising what it claims.';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 1 IS RED — with `custom.doc_unresolved_tokens'' refusal removed from the door, a template naming a Field that does not exist SAVED and reads back to a person as "%": %',
               v_j ->> 'name', v_j ->> 'body';

  perform set_config('role', v_boss, true);
  execute v_save_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 2 — the currency arm of `custom.doc_format_value`, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.doc_format_value(jsonb,jsonb)'::regprocedure) into v_format_def;
  create or replace function custom.doc_format_value(p_field_data jsonb, p_value jsonb)
  returns text language sql immutable set search_path = pg_catalog as $red$
    select case when p_value is null or jsonb_typeof(p_value) = 'null' then ''
                when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
                else p_value::text end;
  $red$;
  perform set_config('role', 'authenticated', true);

  v_doc  := custom.doc_render_document(v_org, v_tpl, v_rec);
  v_body := custom.doc_render_read(v_org, v_doc) ->> 'body';
  if v_body like '%USD%' then
    raise exception 'RED 2 — the currency arm was removed and the document still says USD. This red is not exercising what it claims.';
  end if;
  if v_body not like '%500%' then
    raise exception 'RED 2 — the amount vanished entirely rather than printing bare, which is a different failure than the one this red demonstrates.';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 2 IS RED — with `doc_format_value''s currency arm gone, the document a person opens reads "%" where the Field carries unit USD and format currency. That is the merge lying about what the record holds.', v_body;

  perform set_config('role', v_boss, true);
  execute v_format_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — the seal's immutability, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  -- The seal is made from the seat, the way a person makes one.
  v_doc2 := custom.doc_render_document(v_org, v_tpl, v_rec);
  v_sig  := custom.doc_sign(v_org, v_doc2, 'signature', 'Marcus Bellweather');
  if (custom.doc_signature_read(v_org, v_sig) ->> 'signer_name') <> 'Marcus Bellweather' then
    raise exception 'RED 3 — the seal did not read back as it was made, so this red has nothing to break.';
  end if;

  -- OUT OF THE SEAT for BOTH halves, and this one is worth saying plainly: `custom.doc_signature`
  -- holds no grant for `authenticated` and no client door edits a seal, so the rewrite can only
  -- be performed by an operator. What this red demonstrates is that with the store's own trigger
  -- gone there is NOTHING else between an operator and somebody's signature — and the wrong name
  -- then reaches the person, which is asserted back in the seat.
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom._doc_signature_immutable()'::regprocedure) into v_immut_def;
  create or replace function custom._doc_signature_immutable() returns trigger
    language plpgsql as $red$ begin return new; end $red$;
  update custom.doc_signature set signer_name = 'Somebody Else'
   where organization_id = v_org and id = v_sig;
  perform set_config('role', 'authenticated', true);

  if (custom.doc_signature_read(v_org, v_sig) ->> 'signer_name') <> 'Somebody Else' then
    raise exception 'RED 3 — the trigger was neutered and the update still did not land. This red is not exercising what it claims.';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 3 IS RED — with `custom._doc_signature_immutable'' replaced by a pass-through, a signed seal''s signer was REWRITTEN and the person reading it through custom.doc_signature_read is now told "%" signed it. VAL-10''s whole point is that nothing does this.',
               custom.doc_signature_read(v_org, v_sig) ->> 'signer_name';

  perform set_config('role', v_boss, true);
  execute v_immut_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — `custom.doc_signature_intact` compares `signed_at` instead of the hash.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.doc_signature_intact(uuid,uuid)'::regprocedure) into v_intact_def;
  create or replace function custom.doc_signature_intact(p_organization_id uuid, p_signature_id uuid)
  returns jsonb language plpgsql stable set search_path = pg_catalog as $red$
  declare v_sig record;
  begin
    select signer_name, signed_at into v_sig from custom.doc_signature
     where organization_id = p_organization_id and id = p_signature_id;
    if v_sig.signed_at is not null then
      return jsonb_build_object('intact', true, 'verdict', 'intact (RED: always true once signed_at exists)');
    end if;
    return jsonb_build_object('intact', false, 'verdict', 'broken');
  end; $red$;
  perform set_config('role', 'authenticated', true);

  -- The edit AFTER signing, through the door a person uses.
  perform custom.record_update(v_org, v_rec,
    jsonb_build_object('_actor','user','client_name','Priya Anand'));
  v_j := custom.doc_signature_read(v_org, v_sig);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'RED 4 — the broken verdict function still reported broken. This red is not exercising what it claims.';
  end if;
  v_reds := v_reds + 1;
  raise notice 'RED 4 IS RED — with `doc_signature_intact'' comparing `signed_at'' instead of the document hash, a record edited AFTER signing still reads "%" to the person. That is the silent wrong answer that lets a changed agreement keep wearing somebody''s signature.',
               v_j ->> 'verdict';

  perform set_config('role', v_boss, true);
  execute v_intact_def;

  if v_reds <> 4 then
    raise exception 'only % of the four W3-DOC enforcement points were shown failing', v_reds;
  end if;
  raise notice '';
  raise notice '=== RED — all four W3-DOC enforcement points shown FAILING, each read back through the door a signed-in person reaches. This transaction rolls back: the three replaced functions and the trigger function all go back to what they were. ===';
end
$r$;

rollback;

-- The main database is left as it was found. Proof, outside the rolled-back transaction:
select custom.doc_format_value('{"format":"currency","unit":"USD"}'::jsonb, '1234.5'::jsonb)
         = 'USD 1,234.50'                                                 as currency_arm_back,
       (select prosrc ~ 'doc_unresolved_tokens' from pg_proc
         where oid = 'custom.doc_template_save(uuid,uuid,text,text,uuid)'::regprocedure)
                                                                          as token_refusal_back,
       (select prosrc ~ 'cannot be changed' from pg_proc
         where oid = 'custom._doc_signature_immutable()'::regprocedure)    as seal_trigger_back,
       (select prosrc ~ 'document_hash_now' from pg_proc
         where oid = 'custom.doc_signature_intact(uuid,uuid)'::regprocedure) as verdict_back;
