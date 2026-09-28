-- LANE SCOPES-STORE-HOMES — EVERY COLUMN AN OLD SCOPE READER USES HAS A HOME IN THE RECORD STORE,
-- measured RED then GREEN on the dev clone. Successor of scopestails_the_copy_carries_own_words_red_green.sql
-- (its claims B1–B4 are H1, H3, H4 and H5 here, at the words' new homes).
--
-- THE USE CASE. Castellano & Reyes' "Matters" type says "Every open engagement, newest first", sits
-- second in the firm's list, allows one matter per client and suggests the variables client_name and
-- matter_number; its "Opposing counsel" field is still being gathered, described in a sentence, may
-- hold two contacts and is tagged litigation and intake; each matter has the slug the firm's links use
-- and a place in the list the paralegals chose. The old scope screens read every one of those words.
-- The store must hold each one where a reader finds it (the Table's, the Field's and the Record's own
-- document), keep the slug unique among a type's live scopes as the old unique index does, take a word
-- off when the screens clear it (a list compared exactly), say in the switch's readiness which copies
-- do not yet agree, and carry every word back on Switch back — naming, never half-writing, a word the
-- old table would refuse.
--
-- Organizations, types, fields and scopes are synthesized and rolled back. Nothing of the owner's is
-- read or written.
--
-- WHAT MAKES IT FAIL (RED before scopeshomes_every_column_a_scope_reader_uses_has_a_home_in_the_store.sql):
--   H1  a type made through the store's door holds description, sort order, max assignments and
--       default variable keys in its Table's document, lists its scopes by sort order then name, and
--       declares the Slug and Sort order Fields; an item holds description, status, max_items, tags,
--       allowed_reference_types in its Field's document; nothing of it is carried beside the pointer
--   H2  a scope made through the door holds its slug (made from its name as ensure_slug makes it) and
--       its sort order; the store half refuses a second live scope of the type with the same slug
--   H3  a word cleared on the screens comes off the copy, and one tag removed of two reaches it
--   H4  own_words_copied names a scope whose copy's slug or order disagrees (and a type and a field),
--       and the store half (copying again) clears it
--   H5  Switch back carries the copy's words back, erases nothing the copy does not say, and names
--       (never writes) a status the old table would refuse
--   H6  the Slug Field carries the store's unique rule, so a writer that is not the scope door — the
--       generic record_write, as a signed-in person, once the copy fence is open — is refused a second
--       live Matter with the same slug in a plain sentence (lane SCOPES-STORE-HOMES, third file)

\set ON_ERROR_STOP on
\timing off
\set suite 'scopeshomes_every_column_has_a_home_red_green.sql'
\set requires 'relation:custom.io_outbox|function:custom.context_type_write|function:platform._cutover_seam_readiness|function:custom._ctx_own_words'
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
  v_type uuid; v_item uuid; v_other uuid; v_scope uuid; v_scope2 uuid;
  v_d jsonb; v_c jsonb; v_chk jsonb; v_out jsonb;
  v_refused text;
begin
  perform set_config('app.actor_system', 'campaign-test/scopeshomes', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Castellano & Reyes ' || substr(v_org::text, 1, 6), 'castellano-reyes-' || substr(v_org::text, 1, 8), 'CR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  if custom.context_writer(v_org) <> 'store' then
    raise exception 'FIXTURE: Castellano writes its scopes in %, not the store', custom.context_writer(v_org);
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated', 'session_id', 'scopeshomes')::text, true);
  perform set_config('role', 'authenticated', true);
  v_type := (custom.context_type_write(v_org, null,
    '{"label_singular": "Matter", "label_plural": "Matters", "description": "Every open engagement, newest first",
      "sort_order": 2, "max_assignments": 1, "default_variable_keys": ["client_name", "matter_number"]}'::jsonb) -> 'row' ->> 'id')::uuid;
  v_other := (custom.context_type_write(v_org, null,
    '{"label_singular": "Court", "label_plural": "Courts", "description": "Where the firm files"}'::jsonb) -> 'row' ->> 'id')::uuid;
  v_item := (custom.context_item_write(null, v_type,
    '{"key": "opposing_counsel", "display_name": "Opposing counsel", "value_type": "string",
      "description": "Who the other side has hired, and how to reach them", "max_items": 2,
      "allowed_reference_types": ["scope", "file"], "tags": ["litigation", "intake"]}'::jsonb) -> 'row' ->> 'id')::uuid;
  perform custom.context_item_write(v_item, null, '{"status": "gathering"}'::jsonb);
  v_scope := (custom.context_scope_write(v_org, null, v_type,
    '{"name": "Ortega v. Pacific Freight", "sort_order": 3}'::jsonb) -> 'row' ->> 'id')::uuid;
  perform set_config('role', 'none', true);

  -- ══ H1 ══
  select r.data, r.metadata -> 'moved_from' -> 'carried' into v_d, v_c from custom.record r where r.organization_id = v_org and r.id = v_type;
  if v_d ->> 'description' is distinct from 'Every open engagement, newest first' or (v_d ->> 'sort_order')::int is distinct from 2
     or (v_d ->> 'max_assignments_per_entity')::int is distinct from 1
     or v_d -> 'default_variable_keys' is distinct from '["client_name", "matter_number"]'::jsonb then
    raise exception 'H1 RED: the Matters Table''s own document does not say what the type says: %',
      jsonb_build_object('description', v_d -> 'description', 'sort_order', v_d -> 'sort_order',
                         'max_assignments_per_entity', v_d -> 'max_assignments_per_entity', 'default_variable_keys', v_d -> 'default_variable_keys', 'carried', v_c);
  end if;
  if v_c is not null and v_c ?| array['description', 'sort_order', 'max_assignments_per_entity', 'default_variable_keys'] then
    raise exception 'H1: the type''s words live in two homes (still carried beside the pointer): %', v_c;
  end if;
  if v_d -> 'default_sort' is distinct from '[{"field": "sort_order", "direction": "asc"}, {"field": "name", "direction": "asc"}]'::jsonb then
    raise exception 'H1 RED: the Matters Table does not list its scopes as the old screens do (sort order, then name): %', v_d -> 'default_sort';
  end if;
  if (select count(*) from custom.record f where f.organization_id = v_org and f.deleted_at is null
        and f.id in (custom._ctx_id('scope-column-field', v_type::text, 'slug'), custom._ctx_id('scope-column-field', v_type::text, 'sort_order'))
        and f.data ->> 'context_policy' = 'exclude') <> 2
     or not (v_d -> 'fields' @> '[{"name": "slug"}, {"name": "sort_order"}]'::jsonb) then
    raise exception 'H1 RED: the Matters Table does not declare its Slug and Sort order Fields (never handed to an agent)';
  end if;
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_item;
  if v_d ->> 'description' is distinct from 'Who the other side has hired, and how to reach them'
     or v_d ->> 'status' is distinct from 'gathering' or (v_d ->> 'max_items')::int is distinct from 2
     or v_d -> 'tags' is distinct from '["litigation", "intake"]'::jsonb
     or v_d -> 'allowed_reference_types' is distinct from '["scope", "file"]'::jsonb then
    raise exception 'H1 RED: the Opposing counsel Field''s own document does not say what the item says: %',
      jsonb_build_object('description', v_d -> 'description', 'status', v_d -> 'status', 'max_items', v_d -> 'max_items',
                         'tags', v_d -> 'tags', 'allowed_reference_types', v_d -> 'allowed_reference_types');
  end if;

  -- ══ H2 ══
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_scope;
  if v_d ->> 'slug' is distinct from 'ortega-v-pacific-freight' or (v_d ->> 'sort_order')::int is distinct from 3 then
    raise exception 'H2 RED: the Ortega matter''s Record does not hold its slug and sort order: slug %, sort_order %', v_d -> 'slug', v_d -> 'sort_order';
  end if;
  v_scope2 := gen_random_uuid();
  begin
    perform custom._ctx_store_scope(v_org, v_type, v_scope2,
      jsonb_build_object('id', v_scope2, 'name', 'Ortega v. Pacific Freight (appeal)', 'slug', 'ortega-v-pacific-freight', 'sort_order', 4));
    v_refused := null;
  exception when unique_violation then
    v_refused := sqlerrm;
  end;
  if v_refused is null then
    raise exception 'H2 RED: the store took a second live Matter with the slug ortega-v-pacific-freight';
  end if;

  -- ══ H3: cleared on the screens, cleared on the copy; one of two tags removed reaches it ══
  perform set_config('role', 'authenticated', true);
  perform custom.context_type_write(v_org, v_type, '{"description": ""}'::jsonb);
  perform custom.context_item_write(v_item, null, '{"tags": ["litigation"]}'::jsonb);
  perform set_config('role', 'none', true);
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_type;
  if v_d ? 'description' or (v_d ->> 'sort_order')::int is distinct from 2 then
    raise exception 'H3: the emptied description is still on the Table (or the order went with it): %', v_d -> 'description';
  end if;
  select r.data into v_d from custom.record r where r.organization_id = v_org and r.id = v_item;
  if v_d -> 'tags' is distinct from '["litigation"]'::jsonb or v_d ->> 'status' is distinct from 'gathering' then
    raise exception 'H3 RED: one tag removed of two did not reach the Field (containment): tags %', v_d -> 'tags';
  end if;

  -- ══ H4: a copy that disagrees is named; copying again clears it ══
  update custom.record set data = data || '{"slug": "ortega-freight-old", "sort_order": 9}'::jsonb
   where organization_id = v_org and id = v_scope;
  update custom.record set data = data - 'max_assignments_per_entity' where organization_id = v_org and id = v_type;
  update custom.record set data = data - 'status' where organization_id = v_org and id = v_item;
  v_out := platform.cutover_scope_own_words(v_org);
  if coalesce((v_out -> 'by_kind' ->> 'scopes')::int, 0) <> 1 or (v_out ->> 'count')::int <> 3 then
    raise exception 'H4 RED: own_words_copied should name 1 type, 1 field and 1 scope whose copy disagrees: %', v_out;
  end if;
  select c into v_chk from jsonb_array_elements(platform._cutover_seam_readiness('scopes_screens', v_org) -> 'checks') c
   where c ->> 'key' = 'own_words_copied';
  if (v_chk ->> 'met')::boolean or (v_chk ->> 'copy_again_clears')::int <> 3 then
    raise exception 'H4: the switch''s readiness does not say what copying again clears: %', v_chk;
  end if;
  perform custom._ctx_store_type(v_org, t.id, to_jsonb(t)) from context.scope_types t where t.id = v_type;
  perform custom._ctx_store_item(v_org, i.scope_type_id, i.id, to_jsonb(i)) from context.context_items i where i.id = v_item;
  perform custom._ctx_store_scope(v_org, s.scope_type_id, s.id, to_jsonb(s)) from context.scopes s where s.id = v_scope;
  v_out := platform.cutover_scope_own_words(v_org);
  if (v_out ->> 'count')::int <> 0 then
    raise exception 'H4: copying again did not clear what the switch named: %', v_out;
  end if;

  -- ══ H5: switching back carries the copy's words back, erases nothing, names what it cannot write ══
  update custom.record set data = data || '{"description": "Every matter the firm carries, newest first"}'::jsonb
   where organization_id = v_org and id = v_type;
  update custom.record set data = data || '{"sort_order": 7}'::jsonb where organization_id = v_org and id = v_scope;
  update custom.record set data = data - 'description' where organization_id = v_org and id = v_other;
  update custom.record set data = data || '{"status": "in_review_by_partner"}'::jsonb where organization_id = v_org and id = v_item;
  v_out := platform._cutover_seam_apply('scopes_screens', v_org, 'old', c_admin, gen_random_uuid());
  if custom.context_writer(v_org) <> 'old' then
    raise exception 'H5: switching back left the writer %', custom.context_writer(v_org);
  end if;
  if (select description from context.scope_types where id = v_type) <> 'Every matter the firm carries, newest first'
     or (select sort_order from context.scopes where id = v_scope) <> 7 then
    raise exception 'H5 RED: switching back did not carry the copy''s words back: % / % (answer %)',
      (select description from context.scope_types where id = v_type), (select sort_order from context.scopes where id = v_scope), v_out;
  end if;
  if (select description from context.scope_types where id = v_other) <> 'Where the firm files' then
    raise exception 'H5: switching back erased Courts'' description, which its copy did not have';
  end if;
  if (select status::text from context.context_items where id = v_item) <> 'gathering'
     or not (v_out -> 'own_words_carried_back' -> 'not_carried')::text like '%' || v_item::text || ': status%' then
    raise exception 'H5 RED: a status the old table refuses was not named (or was written): status %, answer %',
      (select status from context.context_items where id = v_item), v_out;
  end if;

  -- ══ H6: the store's own unique rule, for a writer that is not the scope door ══
  if not exists (select 1 from custom.record f where f.organization_id = v_org
                  and f.id = custom._ctx_id('scope-column-field', v_type::text, 'slug')
                  and f.data -> 'rules' @> '[{"kind": "unique"}]'::jsonb) then
    raise exception 'H6 RED: the Matters Table''s Slug Field carries no unique rule';
  end if;
  -- The copy fence open for this organization (the old side writes, the copy no longer follows), so the
  -- generic door reaches the store's rules as it will once the fence lifts.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'context_copy_following', 'organization', v_org, v_org, 'false'::jsonb, 'scopeshomes H6: fence open');
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.record_write(v_org, v_type, '{"name": "Ortega v. Pacific Freight (second filing)", "slug": "ortega-v-pacific-freight"}'::jsonb);
    v_refused := null;
  exception when unique_violation then
    v_refused := sqlerrm;
  end;
  perform set_config('role', 'none', true);
  if v_refused is null then
    raise exception 'H6 RED: record_write took a second live Matter with the slug ortega-v-pacific-freight';
  end if;
  if v_refused not like 'Another record here already has Slug "ortega-v-pacific-freight"%' then
    raise exception 'H6: the refusal is not the plain sentence: %', v_refused;
  end if;

  raise notice 'GREEN H6: record_write is refused a duplicate slug: %', v_refused;
  raise notice 'GREEN H1–H5: a scope type''s, a context field''s and a scope''s own words live in the Table''s, the Field''s and the Record''s own documents, the slug stays unique among a type''s live scopes, a cleared word and a shortened list reach the copy, the switch names a copy that disagrees and copying again clears it, and switching back carries every word back, erasing nothing and naming what the old table would refuse.';
end
$t$;

rollback;
