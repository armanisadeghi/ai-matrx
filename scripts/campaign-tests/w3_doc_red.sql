-- W3-DOC — THE RED TWIN of `scripts/campaign-tests/w3_doc_c43.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each refusal `w3_doc_c43.sql` relies on DISAPPEARS — and, where the failure is
-- silent rather than loud, that the wrong thing is actually written.
--
--   RED 1 — REC-68's own refusal. `custom.doc_template_save` is replaced with a body that
--           never calls `custom.doc_unresolved_tokens`, and a template naming a Field that
--           does not exist SAVES anyway — the exact silent merge REC-68 exists to prevent.
--   RED 2 — the Field's format. `custom.doc_format_value` is replaced with one that drops
--           the `currency` arm, and a proposal prints a bare number where the Field carries
--           a unit and a format — the merge lying about what the record holds.
--   RED 3 — the seal's immutability. `custom._doc_signature_immutable` is disabled and a
--           signed seal is UPDATED — the evidence VAL-10 exists to make un-editable.
--   RED 4 — the seal's tamper detection. `custom.doc_signature_intact` is replaced with one
--           that compares `signed_at` instead of the document hash, and a record edited
--           after signing still reads `intact` — the silent wrong answer that lets a changed
--           agreement keep wearing somebody's signature.
--
-- It refuses to run anywhere but the rehearsal branch, by system identifier, and it is not a
-- migration: nothing in `migrations/` and no sweep can see it. Every replaced function is
-- restored to its live, branch-checked body before the transaction rolls back, so nothing here
-- ever needs its own `-- based-on:` line.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_doc_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_job     uuid;
  v_f_name  uuid;
  v_f_amt   uuid;
  v_tpl     uuid;
  v_rec     uuid;
  v_doc     uuid;
  v_sig     uuid;
  v_body    text;
  v_n       integer;
  v_j       jsonb;
  v_save_def   text;
  v_format_def text;
  v_intact_def text;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_doc_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- the fixture, minimal: one Table, two Fields, one template, one record.
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ W3-DOC RED', 'slug', 'zz_w3_doc_red', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'), jsonb_build_object('name','amount')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job))
  returning id into v_f_name;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','amount','label','Amount','type','range','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job,
    'unit','USD','format','currency'))
  returning id into v_f_amt;

  v_tpl := custom.doc_template_save(v_org, v_job, 'ZZ Red', 'Client: {{field:' || v_f_name || '}} Owes: {{field:' || v_f_amt || '}}');
  v_rec := custom.record_write(v_org, v_job, jsonb_build_object('_actor','user','client_name','Acme','amount',500));

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 — REC-68's own refusal, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  select pg_get_functiondef('custom.doc_template_save(uuid,uuid,text,text,uuid)'::regprocedure) into v_save_def;

  create or replace function custom.doc_template_save(
    p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid default null)
  returns uuid language plpgsql security definer set search_path = pg_catalog as $$
  declare v_id uuid;
  begin
    perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id, 'name', btrim(p_name), 'body', coalesce(p_body,''), 'template_version', 1))
    returning id into v_id;
    return v_id;
  end; $$;

  perform custom.doc_template_save(v_org, v_job, 'ZZ Broken Red',
    'Dear {{field:00000000-0000-4000-8000-000000000999}},');
  select count(*) into v_n from custom.record
   where organization_id = v_org and data_class = 'doc_template' and data ->> 'name' = 'ZZ Broken Red';
  if v_n <> 1 then
    raise exception 'RED 1 — with the refusal gone, the broken template still did not save. This red is not exercising what it claims.';
  end if;
  raise notice 'RED 1 — with `custom.doc_unresolved_tokens'' refusal removed from the door, a template naming a Field that does not exist SAVED anyway. The refusal `w3_doc_c43.sql'' part B reads is the check, not a coincidence.';

  execute v_save_def;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 2 — the currency arm of `custom.doc_format_value`, removed.
  -- ══════════════════════════════════════════════════════════════════════════
  select pg_get_functiondef('custom.doc_format_value(jsonb,jsonb)'::regprocedure) into v_format_def;

  create or replace function custom.doc_format_value(p_field_data jsonb, p_value jsonb)
  returns text language sql immutable set search_path = pg_catalog as $$
    select case when p_value is null or jsonb_typeof(p_value) = 'null' then ''
                when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
                else p_value::text end;
  $$;

  v_body := custom.doc_render_body(v_org, v_tpl, v_rec);
  if v_body like '%USD%' then
    raise exception 'RED 2 — the currency arm was removed and the document still says USD. This red is not exercising what it claims.';
  end if;
  if v_body not like '%500%' then
    raise exception 'RED 2 — the amount vanished entirely rather than printing bare, which is a different failure than the one this red demonstrates.';
  end if;
  raise notice 'RED 2 — with `doc_format_value''s currency arm gone, the document prints a bare number (%) where the Field carries unit USD and format currency. That is the merge lying about what the record holds.', v_body;

  execute v_format_def;
end
$r$;

do $r$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_job     uuid;
  v_f_name  uuid;
  v_f_sig   uuid;
  v_tpl     uuid;
  v_rec     uuid;
  v_doc     uuid;
  v_sig     uuid;
  v_hash1   text;
  v_msg     text;
  v_j       jsonb;
  v_intact_def text;
begin
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ W3-DOC RED 2', 'slug', 'zz_w3_doc_red_2', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'), jsonb_build_object('name','signature')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','client_name','label','Client name','type','text','sort',10,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job))
  returning id into v_f_name;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key','signature','label','Signature','type','text','sort',20,'required',false,
    'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
    'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
    'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_job,
    'format','signature'))
  returning id into v_f_sig;

  v_tpl := custom.doc_template_save(v_org, v_job, 'ZZ Red 3/4', 'For {{field:' || v_f_name || '}}, signed: {{field:' || v_f_sig || '}}');
  v_rec := custom.record_write(v_org, v_job, jsonb_build_object('_actor','user','client_name','Acme'));
  v_doc := custom.doc_render_document(v_org, v_tpl, v_rec);
  select content_hash into v_hash1 from custom.doc_render where organization_id = v_org and id = v_doc;
  v_sig := custom.doc_sign(v_org, v_doc, 'signature', 'ZZ Red Signer');

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — the seal's immutability trigger, disabled.
  -- ══════════════════════════════════════════════════════════════════════════
  alter table custom.doc_signature disable trigger doc_signature_immutable;
  update custom.doc_signature set signer_name = 'Somebody Else' where organization_id = v_org and id = v_sig;
  if (select signer_name from custom.doc_signature where organization_id = v_org and id = v_sig) <> 'Somebody Else' then
    raise exception 'RED 3 — the trigger was disabled and the update still did not land. This red is not exercising what it claims.';
  end if;
  raise notice 'RED 3 — with `doc_signature_immutable'' disabled, a signed seal''s signer_name was REWRITTEN to ''Somebody Else''. VAL-10''s whole point is that nothing does this.';
  alter table custom.doc_signature enable trigger doc_signature_immutable;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — `custom.doc_signature_intact` compares `signed_at` instead of the hash.
  -- ══════════════════════════════════════════════════════════════════════════
  select pg_get_functiondef('custom.doc_signature_intact(uuid,uuid)'::regprocedure) into v_intact_def;

  create or replace function custom.doc_signature_intact(p_organization_id uuid, p_signature_id uuid)
  returns jsonb language plpgsql stable set search_path = pg_catalog as $$
  declare v_sig record;
  begin
    select signer_name, signed_at into v_sig from custom.doc_signature
     where organization_id = p_organization_id and id = p_signature_id;
    if v_sig.signed_at is not null then
      return jsonb_build_object('intact', true, 'verdict', 'intact (RED: always true once signed_at exists)');
    end if;
    return jsonb_build_object('intact', false, 'verdict', 'broken');
  end; $$;

  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user','client_name','Definitely Not Acme'));
  v_j := custom.doc_signature_intact(v_org, v_sig);
  if not (v_j ->> 'intact')::boolean then
    raise exception 'RED 4 — the broken verdict function still reported broken. This red is not exercising what it claims.';
  end if;
  raise notice 'RED 4 — with `doc_signature_intact'' comparing `signed_at'' instead of the document hash, a record edited AFTER signing still reads `%''. That is the silent wrong answer that lets a changed agreement keep wearing somebody''s signature.', v_j ->> 'verdict';

  execute v_intact_def;

  raise notice '';
  raise notice '=== RED — all four W3-DOC enforcement points shown FAILING. This transaction rolls back: the two replaced functions and the disabled trigger all go back to what they were. ===';
end
$r$;

rollback;
