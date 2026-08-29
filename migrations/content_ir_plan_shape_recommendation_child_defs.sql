-- content_ir_plan_shape_recommendation_child_defs.sql
-- ============================================================================
-- plan_shape_recommendation: its two child kinds become REFERENCED $defs
-- instead of anonymous inline objects.
--
-- THE DEFECT. `content_ir.kind_edge` correctly declares both composition
-- edges (family_counts -> plan_family_count, concept_names -> plan_concept_name,
-- created 2026-08-23 alongside the kinds), and each child row carries its own
-- complete schema with a `__kind` const. But the PARENT's stored schema
-- inlined the item objects anonymously, with `__kind` reduced to a bare
-- `{"type":"string"}` — the const, and with it the child's identity, dropped.
--
-- The type generator (matrx-frontend scripts/shape/generate-kind-types.ts,
-- buildNaming) only ever promotes a `$defs` ENTRY to a named interface. Both
-- of its nested-kind signals — the def's own `__kind` const, and kind_edge —
-- are keyed on a `$defs` entry existing (`defs[target] !== undefined`), and
-- both additionally require the child to be an ACTIVE kind. These children are
-- deliberately inactive, exactly like `timeline_event` / `task_item`: under the
-- 2026-08-23 registry policy, row/child kinds are inactive and only root kinds
-- stay active. So NEITHER signal could fire, the children generated as
-- anonymous inline objects, and `PlanFamilyCount` / `PlanConceptName` never
-- appeared in kinds.generated.ts — which is why `pnpm check:kind-type-twins`
-- reports both kinds as named-by-code-but-untyped.
--
-- THE FIX, and why it is the exemplar's shape. `timeline` — active root,
-- inactive children — is the proven-correct precedent: it carries
-- `$defs.timeline_period` / `$defs.timeline_event` and `$ref`s them from its
-- array properties, which is why `TimelineEvent` and `TimelinePeriod` DO exist
-- as generated interfaces (emitted by the generator's shared-local-defs pass,
-- which names a def without requiring the child to be active). This migration
-- gives plan_shape_recommendation that same shape. No kind is activated, no
-- guard is touched, and no allowlist entry is added.
--
-- The `$defs` bodies are the CHILD ROWS' OWN schemas, verbatim — one shape,
-- one definition. The verification block below re-asserts that identity against
-- the live child rows, so a transcription slip cannot land.
--
-- Note this also repairs marker stamping: `content_ir.stamp_markers_from_schema`
-- reads the schema to stamp `__kind` into nested values, and could not stamp a
-- child whose declared marker had no const.
--
-- `emitted_fingerprint` is recomputed with the registry's own algorithm
-- (matrx_graph.contract_kinds.schema_fingerprint = sha256 of
-- json.dumps(schema, sort_keys=True, separators=(",",":"), ensure_ascii=True)),
-- so the stored fingerprint keeps describing the stored shape.
--
-- Idempotent: sets fixed values. Blast radius verified before applying —
-- 2 examples (both `passed`, both carrying `__kind` on every child row) and
-- ZERO kind_instance rows.
--
-- 🚨 AFTER APPLYING, the generated artifact is stale until someone with
-- registry egress runs, in matrx-frontend:  pnpm shape:types
-- and commits features/content-ir/kinds/generated/kinds.generated.ts.
-- ============================================================================

update content_ir.kind_definition
   set emitted_json_schema = $schema${
  "$defs": {
    "plan_concept_name": {
      "additionalProperties": false,
      "properties": {
        "__kind": {
          "const": "plan_concept_name",
          "description": "The registered kind this payload is an instance of.",
          "type": "string"
        },
        "concept_key": {
          "type": "string"
        },
        "name": {
          "type": "string"
        }
      },
      "required": [
        "__kind"
      ],
      "type": "object"
    },
    "plan_family_count": {
      "additionalProperties": false,
      "properties": {
        "__kind": {
          "const": "plan_family_count",
          "description": "The registered kind this payload is an instance of.",
          "type": "string"
        },
        "count": {
          "type": "integer"
        },
        "family_key": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "__kind"
      ],
      "type": "object"
    }
  },
  "additionalProperties": false,
  "properties": {
    "__kind": {
      "const": "plan_shape_recommendation",
      "description": "The registered kind this payload is an instance of.",
      "type": "string"
    },
    "archetype_key": {
      "type": "string"
    },
    "concept_names": {
      "items": {
        "$ref": "#/$defs/plan_concept_name"
      },
      "type": "array"
    },
    "family_counts": {
      "items": {
        "$ref": "#/$defs/plan_family_count"
      },
      "type": "array"
    },
    "rationale": {
      "type": "string"
    }
  },
  "required": [
    "__kind",
    "archetype_key",
    "family_counts",
    "rationale"
  ],
  "type": "object"
}$schema$::jsonb,
       emitted_fingerprint = 'fbae059069128aeb03b87be9d482b19e178a1ff7f8a28e6b9eaa1d05ba3e6142'
 where kind = 'plan_shape_recommendation';

-- ----------------------------------------------------------------------------
-- Verification: the $defs must BE the child kinds' own schemas, the arrays must
-- reference them, and the examples must still validate. Raises on any mismatch.
-- ----------------------------------------------------------------------------
do $verify$
declare
  v_schema   jsonb;
  v_child    jsonb;
  n_bad      int;
begin
  select emitted_json_schema into v_schema
    from content_ir.kind_definition where kind = 'plan_shape_recommendation';
  if v_schema is null then
    raise exception 'plan_shape_recommendation is missing';
  end if;

  -- 1. Each $def is byte-identical to that child kind's own stored schema.
  for v_child in select jsonb_build_array(kind, emitted_json_schema)
                   from content_ir.kind_definition
                  where kind in ('plan_family_count','plan_concept_name')
  loop
    if v_schema #> array['$defs', (v_child ->> 0)] is distinct from (v_child -> 1) then
      raise exception 'the $defs entry for % does not match that child kind''s own schema',
        v_child ->> 0;
    end if;
  end loop;

  -- 2. Both arrays reference their child def (no inline duplication left).
  if v_schema #>> '{properties,family_counts,items,$ref}' is distinct from '#/$defs/plan_family_count'
     or v_schema #>> '{properties,concept_names,items,$ref}' is distinct from '#/$defs/plan_concept_name' then
    raise exception 'the array properties do not $ref their child defs';
  end if;

  -- 3. Every child def declares its own identity as a const.
  if v_schema #>> '{$defs,plan_family_count,properties,__kind,const}' is distinct from 'plan_family_count'
     or v_schema #>> '{$defs,plan_concept_name,properties,__kind,const}' is distinct from 'plan_concept_name' then
    raise exception 'a child def is missing its __kind const';
  end if;

  -- 4. The revalidation trigger has re-checked the examples: none may regress.
  select count(*) into n_bad
    from content_ir.kind_example e
    join content_ir.kind_definition d on d.id = e.kind_definition_id
   where d.kind = 'plan_shape_recommendation'
     and coalesce(e.validation_status, '') <> 'passed';
  if n_bad > 0 then
    raise exception '% example(s) no longer validate against the corrected schema', n_bad;
  end if;

  raise notice 'plan_shape_recommendation: child defs referenced, examples still passing';
end;
$verify$;
