-- content_ir: open-empty-object class fix (A2, 2026-07-15)
--
-- An "extras bucket" stored as an EMPTY CLOSED inline_object
-- ({type:"inline_object", fields:[]} with emitted additionalProperties:false)
-- rejects every real payload — the schema_proposal defect class
-- (SHAPE_SYSTEM.md 2026-07-08 "known-failing"). The KindSchema vocabulary now
-- carries `open` on inline_object (kind-schema.types.ts / kind-storage-transform.ts),
-- and these fields were always MEANT to be open (additionalDetails buckets +
-- schema_proposal.schema, which holds an arbitrary JSON Schema object).
--
-- This migration, idempotently:
--   1. stamps `"open": true` on every kind_definition data[] element of type
--      inline_object with EMPTY fields (top level; nested empties do not occur
--      in live data — verified 2026-07-15),
--   2. flips the matching emitted_json_schema property subobject to
--      additionalProperties:true.
-- The UPDATE bumps the row version via platform._touch_row; the definition-side
-- derived-validation trigger (wf_017/wf_020 era) revalidates examples.
-- Affected live kinds (2026-07-15): comparison_set, cooking_recipe,
-- decision_tree, diagram_spec, item_presentation, math_problem,
-- presentation_deck, research_report, schema_proposal (schema +
-- additionalDetails), transcript.

do $$
declare
  r record;
  el jsonb;
  new_data jsonb;
  new_emitted jsonb;
  fname text;
  touched integer := 0;
begin
  for r in
    select id, kind, data, emitted_json_schema
    from content_ir.kind_definition
    where deleted_at is null
      and jsonb_typeof(data) = 'array'
      and exists (
        select 1 from jsonb_array_elements(data) e
        where e->>'type' = 'inline_object'
          and (e->'fields' = '[]'::jsonb or e->'fields' = '{}'::jsonb)
          and coalesce(e->'open', 'false'::jsonb) <> 'true'::jsonb
      )
  loop
    new_data := '[]'::jsonb;
    new_emitted := r.emitted_json_schema;

    for el in select e from jsonb_array_elements(r.data) e
    loop
      if el->>'type' = 'inline_object'
         and (el->'fields' = '[]'::jsonb or el->'fields' = '{}'::jsonb)
         and coalesce(el->'open', 'false'::jsonb) <> 'true'::jsonb then
        el := el || '{"open": true}'::jsonb;
        fname := el->>'name';
        if new_emitted #> array['properties', fname] is not null
           and jsonb_typeof(new_emitted #> array['properties', fname]) = 'object' then
          new_emitted := jsonb_set(
            new_emitted,
            array['properties', fname, 'additionalProperties'],
            'true'::jsonb,
            true
          );
        end if;
      end if;
      new_data := new_data || jsonb_build_array(el);
    end loop;

    update content_ir.kind_definition
    set data = new_data, emitted_json_schema = new_emitted
    where id = r.id;
    touched := touched + 1;
    raise notice 'content_ir_open_empty_inline_objects: opened empty inline_object(s) on kind %', r.kind;
  end loop;

  raise notice 'content_ir_open_empty_inline_objects: % kind_definition row(s) updated', touched;
end $$;
