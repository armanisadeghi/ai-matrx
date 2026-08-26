-- content_ir: rename the resellresearchreport kind family to snake_case slugs
-- (kind slug convention ^[a-z][a-z0-9_]*$). Builder fallout from the 2026-08-26
-- incident; slug hygiene is now enforced in the authoring tool going forward.
--
-- A kind slug is identity, so this MINTS new kind_definition rows
-- (resell_research_report + market_listing / resell_analysis /
-- product_knowledge_item / product_image / follow_up_question), rewriting every
-- nested `__kind` const in the emitted schemas, sample_data, and examples;
-- moves the component rows (incl. the resell_research_report_dashboard db
-- component) and canonical examples to the new identities; re-creates the five
-- kind_edge rows; rebinds agent.definition 108d9b86-e728-44e0-9562-8dc84a8c932f
-- ("Resell Research Agent") output_schema consts; then deactivates (via
-- content_ir.set_kind_activation) and soft-deletes the old family with a
-- metadata note.
--
-- Fingerprints: emitted_fingerprint is schema_fingerprint(wire_schema) — sha256
-- of the sort-keyed compact ASCII dump of the MARKER-FREE schema (matrx_graph
-- .contract_kinds.schema_fingerprint; `__kind` stripped from properties and
-- required, empty required dropped). Verified byte-identical against the old
-- rows' stored values; the shape is unchanged by the rename, so each new kind
-- keeps its predecessor's fingerprint. No collision in
-- guard_kind_shape_uniqueness because the old rows are deactivated and
-- soft-deleted before the new fingerprints land.
--
-- Applied live 2026-08-26 via Supabase MCP as two migrations:
--   content_ir_resell_research_report_slug_rename
--   content_ir_resell_research_report_fingerprints_activation
-- Idempotent: re-running skips minting when the new slugs already exist.

create or replace function pg_temp.rr(t text) returns text language sql immutable as $fn$
  select replace(replace(replace(replace(replace(replace(t,
    '"resellresearchreport"', '"resell_research_report"'),
    '"MarketListing"',        '"market_listing"'),
    '"ResellAnalysis"',       '"resell_analysis"'),
    '"ProductKnowledgeItem"', '"product_knowledge_item"'),
    '"ProductImage"',         '"product_image"'),
    '"FollowUpQuestion"',     '"follow_up_question"')
$fn$;

create or replace function pg_temp.rn(j jsonb) returns jsonb language sql immutable as $fn$
  select case when j is null then null else pg_temp.rr(j::text)::jsonb end
$fn$;

do $$
declare
  v_map jsonb := '{
    "resellresearchreport": {"new": "resell_research_report", "label": "Resell Research Report"},
    "MarketListing":        {"new": "market_listing",         "label": "Market Listing"},
    "ResellAnalysis":       {"new": "resell_analysis",        "label": "Resell Analysis"},
    "ProductKnowledgeItem": {"new": "product_knowledge_item", "label": "Product Knowledge Item"},
    "ProductImage":         {"new": "product_image",          "label": "Product Image"},
    "FollowUpQuestion":     {"new": "follow_up_question",     "label": "Follow-up Question"}
  }'::jsonb;
  v_old record;
  v_new_id uuid;
  v_old_parent uuid;
  v_new_parent uuid;
  v_actor uuid;
  v_note text := 'Renamed 2026-08-26: slug violated the kind slug convention (^[a-z][a-z0-9_]*$); builder fallout from the 2026-08-26 incident. ';
begin
  for v_old in
    select d.* from content_ir.kind_definition d
    where d.kind in (select jsonb_object_keys(v_map)) and d.deleted_at is null
  loop
    if exists (select 1 from content_ir.kind_definition n
               where n.kind = v_map->v_old.kind->>'new' and n.deleted_at is null) then
      continue; -- idempotent
    end if;
    insert into content_ir.kind_definition
      (kind, label, authoring_owner, data, sample_data,
       emitted_block_schema, emitted_json_schema, emitted_fingerprint,
       is_active, organization_id, created_by, visibility, is_contract_artifact,
       capture_until, capture_target, metadata)
    values
      (v_map->v_old.kind->>'new',
       v_map->v_old.kind->>'label',
       v_old.authoring_owner,
       v_old.data,
       pg_temp.rn(v_old.sample_data),
       pg_temp.rn(v_old.emitted_block_schema),
       pg_temp.rn(v_old.emitted_json_schema),
       null,
       false,
       v_old.organization_id,
       v_old.created_by,
       v_old.visibility,
       v_old.is_contract_artifact,
       v_old.capture_until,
       v_old.capture_target,
       coalesce(v_old.metadata, '{}'::jsonb)
         || jsonb_build_object('renamed_from', v_old.kind,
                               'renamed_from_id', v_old.id,
                               'rename_note', v_note || 'Minted from ' || v_old.kind || '.'))
    returning id into v_new_id;

    update content_ir.kind_component
       set kind_definition_id = v_new_id
     where kind_definition_id = v_old.id and deleted_at is null;

    update content_ir.kind_example
       set kind_definition_id = v_new_id,
           data = pg_temp.rn(data)
     where kind_definition_id = v_old.id and deleted_at is null;
  end loop;

  select id, created_by into v_old_parent, v_actor from content_ir.kind_definition
   where kind = 'resellresearchreport' and deleted_at is null;
  select id into v_new_parent from content_ir.kind_definition
   where kind = 'resell_research_report' and deleted_at is null;

  if v_new_parent is not null and v_old_parent is not null then
    insert into content_ir.kind_edge
      (parent_definition_id, field_name, child_definition_id, pinned_child_version,
       position, organization_id, created_by, metadata)
    select v_new_parent, e.field_name, nc.id, e.pinned_child_version,
           e.position, e.organization_id, e.created_by,
           coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('renamed_from_edge', e.id)
      from content_ir.kind_edge e
      join content_ir.kind_definition oc on oc.id = e.child_definition_id
      join content_ir.kind_definition nc
        on nc.kind = v_map->oc.kind->>'new' and nc.deleted_at is null
     where e.parent_definition_id = v_old_parent and e.deleted_at is null
       and not exists (select 1 from content_ir.kind_edge x
                        where x.parent_definition_id = v_new_parent
                          and x.field_name = e.field_name and x.deleted_at is null);

    update content_ir.kind_edge
       set deleted_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb)
             || jsonb_build_object('rename_note', v_note || 'Superseded by edges on resell_research_report.')
     where parent_definition_id = v_old_parent and deleted_at is null;
  end if;

  -- output_schema is json, not jsonb
  update agent.definition
     set output_schema = pg_temp.rn(output_schema::jsonb)::json
   where id = '108d9b86-e728-44e0-9562-8dc84a8c932f'
     and output_schema::text like '%resellresearchreport%';

  if v_old_parent is not null then
    perform content_ir.set_kind_activation(v_old_parent, false,
      'Deactivated: slug renamed to resell_research_report (slug convention violation, 2026-08-26 builder incident).',
      v_actor);
  end if;

  update content_ir.kind_definition d
     set deleted_at = now(),
         metadata = coalesce(d.metadata, '{}'::jsonb)
           || jsonb_build_object('renamed_to', v_map->d.kind->>'new',
                                 'rename_note', v_note || 'Superseded by ' || (v_map->d.kind->>'new') || '.')
   where d.kind in (select jsonb_object_keys(v_map)) and d.deleted_at is null;
end $$;

-- Part 2: fingerprints + activation (runs after the mint; separate DO block so a
-- partial first run can be resumed).
do $$
declare
  v_parent uuid;
  v_actor uuid;
begin
  update content_ir.kind_definition set emitted_fingerprint = f.fp
  from (values
    ('follow_up_question',     'f8edb19e8fe36f7feedc821a1d93457e521f3752e47c9471eca5668f518997ef'),
    ('market_listing',         'e3f125580161fb79339ad1c77365e27bd9bc9969732ec99a8247ee079899b61d'),
    ('product_image',          '217819b17b5ed4315279d93dc85177e3b18ccf0932e57f71ef82d394677d20db'),
    ('product_knowledge_item', '118b66f22f9a933f4a40056362bb9246d60291fffb3a5d102adb7604642fa082'),
    ('resell_analysis',        '73235e4906853b5837537af696db9b585d2b0a932f42528eb1b0c68193a2d426'),
    ('resell_research_report', '4aac54c38a7051708953ea92d187a8cc2de7b315f1d026a3a0dd3bcff2339637')
  ) as f(kind, fp)
  where content_ir.kind_definition.kind = f.kind
    and content_ir.kind_definition.deleted_at is null
    and content_ir.kind_definition.emitted_fingerprint is distinct from f.fp;

  select id, created_by into v_parent, v_actor
    from content_ir.kind_definition
   where kind = 'resell_research_report' and deleted_at is null;

  if v_parent is not null then
    perform content_ir.set_kind_activation(v_parent, true,
      'Activated after slug rename from resellresearchreport (slug convention, 2026-08-26 builder incident): same schema shape, dashboard component and canonical example moved over.',
      v_actor);
  end if;
end $$;
