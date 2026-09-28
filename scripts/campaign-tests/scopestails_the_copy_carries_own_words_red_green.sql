-- LANE SCOPES-TAILS — THE COPY CARRIES WHAT A SCOPE TYPE AND A CONTEXT FIELD SAY ABOUT THEMSELVES,
-- measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Bayview Family Dental's "Patients" type says "Everyone the practice treats" and sits
-- second in its list; its "Allergies" field is filed under Clinical, tagged medical and front-desk,
-- with the note "confirm at every visit". The scopes screens show every word of it; the copy must too,
-- the scopes switch must say when a copy does not, copying again must bring it, a word cleared on the
-- screens must come off the copy, and switching back must carry the copy's words back without ever
-- erasing one the copy does not have.
--
-- Organizations, types and fields are synthesized and rolled back. Nothing of the owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before scopestails_the_copy_carries_what_a_scope_type_and_a_field_say_about_themselves.sql):
--   B1  a type made through the store's door lands its description and sort order on its Table; a
--       field lands its category, tags and status note on its Field (metadata.moved_from.carried)
--   B2  a word cleared on the screens (the description emptied, the tags removed) comes off the copy
--   B3  a copy made before the words were carried is named by the switch's readiness
--       (own_words_copied, copy_again_clears 2) and copying again (the store half) clears it
--   B4  switching back writes the copy's words back to the current screens, and a type whose copy
--       says nothing keeps its own description

-- SUPERSEDED 2026-09-28 by scopeshomes_every_column_has_a_home_red_green.sql (lane SCOPES-STORE-HOMES):
-- the words this suite looks for in metadata.moved_from.carried now live in the Table's and the Field's
-- own documents, and that suite proves B1–B4 there (H1, H3, H4, H5). Run it instead; this one stops.
\echo 'SUPERSEDED: run scripts/campaign-tests/scopeshomes_every_column_has_a_home_red_green.sql'
\quit
\set ON_ERROR_STOP on
\timing off
\set suite 'scopestails_the_copy_carries_own_words_red_green.sql'
\set requires 'relation:custom.io_outbox|function:custom.context_type_write|function:platform._cutover_seam_readiness'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '240s';

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org uuid := gen_random_uuid();
  v_type uuid; v_item uuid; v_other uuid;
  v_c jsonb; v_r jsonb; v_chk jsonb; v_out jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/scopestails', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Bayview Family Dental ' || substr(v_org::text, 1, 6), 'bayview-family-dental-' || substr(v_org::text, 1, 8), 'BFD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  if custom.context_writer(v_org) <> 'store' then
    raise exception 'FIXTURE: Bayview writes its scopes in %, not the store', custom.context_writer(v_org);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopestails')::text, true);
  perform set_config('role', 'authenticated', true);
  v_type := (custom.context_type_write(v_org, null, '{"label_singular": "Patient", "label_plural": "Patients", "description": "Everyone the practice treats", "sort_order": 2}'::jsonb) -> 'row' ->> 'id')::uuid;
  v_other := (custom.context_type_write(v_org, null, '{"label_singular": "Supplier", "label_plural": "Suppliers", "description": "Who sends the practice its materials"}'::jsonb) -> 'row' ->> 'id')::uuid;
  v_item := (custom.context_item_write(null, v_type, '{"key": "allergies", "display_name": "Allergies", "value_type": "string", "category": "Clinical", "tags": ["medical", "front-desk"]}'::jsonb) -> 'row' ->> 'id')::uuid;
  perform custom.context_item_write(v_item, null, '{"status_note": "confirm at every visit"}'::jsonb);
  perform set_config('role', 'none', true);

  -- ══ B1 ══
  select r.metadata -> 'moved_from' -> 'carried' into v_c from custom.record r where r.organization_id = v_org and r.id = v_type;
  if v_c is null or v_c ->> 'description' is distinct from 'Everyone the practice treats' or (v_c ->> 'sort_order')::int is distinct from 2 then
    raise exception 'B1 RED: the Patients Table does not say its description and order: carried %', v_c;
  end if;
  select r.metadata -> 'moved_from' -> 'carried' into v_c from custom.record r where r.organization_id = v_org and r.id = v_item;
  if v_c is null or v_c ->> 'category' is distinct from 'Clinical' or v_c -> 'tags' is distinct from '["medical", "front-desk"]'::jsonb
     or v_c ->> 'status_note' is distinct from 'confirm at every visit' then
    raise exception 'B1 RED: the Allergies Field does not say its category, tags and note: carried %', v_c;
  end if;

  -- ══ B2: cleared on the screens, cleared on the copy ══
  perform set_config('role', 'authenticated', true);
  perform custom.context_type_write(v_org, v_type, '{"description": ""}'::jsonb);
  perform custom.context_item_write(v_item, null, '{"tags": []}'::jsonb);
  perform set_config('role', 'none', true);
  select r.metadata -> 'moved_from' -> 'carried' into v_c from custom.record r where r.organization_id = v_org and r.id = v_type;
  if v_c ? 'description' or (v_c ->> 'sort_order')::int is distinct from 2 then
    raise exception 'B2: the emptied description is still on the copy (or the order went with it): carried %', v_c;
  end if;
  select r.metadata -> 'moved_from' -> 'carried' into v_c from custom.record r where r.organization_id = v_org and r.id = v_item;
  if v_c ? 'tags' or v_c ->> 'category' is distinct from 'Clinical' then
    raise exception 'B2: the removed tags are still on the copy (or the category went with them): carried %', v_c;
  end if;

  -- ══ B3: a copy made before the words were carried ══
  update context.scope_types set description = 'Everyone the practice treats' where id = v_type;  -- through the bridge
  update custom.record set metadata = metadata || jsonb_build_object('moved_from', (metadata -> 'moved_from') - 'carried')
   where organization_id = v_org and id in (v_type, v_item);
  select c into v_chk from jsonb_array_elements(platform._cutover_seam_readiness('scopes_screens', v_org) -> 'checks') c
   where c ->> 'key' = 'own_words_copied';
  if v_chk is null then
    raise exception 'B3 RED: the scopes switch does not look at the copies'' own words';
  end if;
  if (v_chk ->> 'met')::boolean or (v_chk ->> 'copy_again_clears')::int <> 2 or v_chk ->> 'detail' not like '%Patients%' then
    raise exception 'B3: the switch should name 2 copies (Patients, Patients · Allergies) that copying again clears: %', v_chk;
  end if;
  perform custom._ctx_store_type(v_org, t.id, to_jsonb(t)) from context.scope_types t where t.id = v_type;
  perform custom._ctx_store_item(v_org, i.scope_type_id, i.id, to_jsonb(i)) from context.context_items i where i.id = v_item;
  select c into v_chk from jsonb_array_elements(platform._cutover_seam_readiness('scopes_screens', v_org) -> 'checks') c
   where c ->> 'key' = 'own_words_copied';
  if not (v_chk ->> 'met')::boolean then
    raise exception 'B3: copying again did not clear what the switch named: %', v_chk;
  end if;

  -- ══ B4: switching back carries the copy's words back, and erases nothing ══
  update custom.record set metadata = jsonb_set(metadata, '{moved_from,carried,description}', '"Every patient of the practice, newest first"')
   where organization_id = v_org and id = v_type;
  update custom.record set metadata = jsonb_set(metadata, '{moved_from,carried,status_note}', '"confirm at every visit and every refill"')
   where organization_id = v_org and id = v_item;
  update custom.record set metadata = metadata || jsonb_build_object('moved_from', (metadata -> 'moved_from') - 'carried')
   where organization_id = v_org and id = v_other;
  v_out := platform._cutover_seam_apply('scopes_screens', v_org, 'old', c_admin, gen_random_uuid());
  if custom.context_writer(v_org) <> 'old' then
    raise exception 'B4: switching back left the writer %', custom.context_writer(v_org);
  end if;
  if (select description from context.scope_types where id = v_type) <> 'Every patient of the practice, newest first'
     or (select status_note from context.context_items where id = v_item) is distinct from 'confirm at every visit and every refill' then
    raise exception 'B4 RED: switching back did not carry the copy''s words back: % / % (answer %)',
      (select description from context.scope_types where id = v_type), (select status_note from context.context_items where id = v_item), v_out;
  end if;
  if (select description from context.scope_types where id = v_other) <> 'Who sends the practice its materials' then
    raise exception 'B4: switching back erased Suppliers'' description, which its copy did not have';
  end if;

  raise notice 'GREEN B1–B4: a scope type''s description and order and a field''s category, tags and note are on their copies, a cleared word comes off, the switch names a copy that lacks them and copying again clears it, and switching back carries the copy''s words back without erasing any.';
end
$t$;

rollback;
