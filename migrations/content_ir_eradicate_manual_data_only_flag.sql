-- Arman's ruling, 2026-08-27 (verbatim intent): the manual `data_only`
-- metadata flag on content_ir.kind_definition is DEAD. "If it's dead
-- completely, let's drop it completely and forget it existed." All rows that
-- carried the key (65 live, 986 soft-deleted) had it strip out; no code path
-- anywhere may read, write, or resurrect it.
--
-- The FAMILY-derived exemption (workflow_io / tool_io / action_io contract
-- families are exempt from component/render monitoring) is a DIFFERENT,
-- RATIFIED mechanism and stays exactly as it was — this migration only
-- removes the per-row flag as an alternate way to reach the same exemption.
--
-- content_ir_kind_activation_rpc.sql (2026-07-22) is the function this
-- replaces; it read `d.metadata ->> 'family'` with a hardcoded family list
-- and never actually had a live per-row flag leg — a later hardening pass
-- (2026-08-26 incident, see features/content-ir/FEATURE.md changelog) added
-- a `metadata -> 'data_only'` read with the family list as its fallback.
-- This migration removes that read entirely: the boolean is family-derived
-- only, full stop. The internal variable is also renamed
-- (`v_data_only` -> `v_generated_contract`) so the function's own source
-- carries zero literal occurrences of the retired key name.
--
-- Idempotent: CREATE OR REPLACE + a metadata strip that is a no-op once run.

CREATE OR REPLACE FUNCTION content_ir.evaluate_kind_activation(p_kind_definition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
    d record;
    v_schema_md5 text;
    v_family text;
    v_generated_contract boolean;
    v_has_example boolean;
    v_example_recorded_stale boolean;
    v_example_fails boolean;
    v_has_component boolean;
    v_has_generic_only boolean;
    v_component_platforms text[];
    v_dup_kind text;
    v_dup_id uuid;
    v_unique_ok boolean := true;
    reasons text[] := '{}';
begin
    select id, kind, is_active, metadata, deleted_at, version, emitted_json_schema,
           emitted_fingerprint, is_contract_artifact
      into d
      from content_ir.kind_definition
     where id = p_kind_definition_id;

    if d.id is null then
        return jsonb_build_object(
            'would_activate', false,
            'kind_definition_id', p_kind_definition_id,
            'reasons', to_jsonb(array['kind definition does not exist']),
            'checked_at', now()
        );
    end if;

    if d.deleted_at is not null then
        reasons := array_append(reasons, 'kind definition is soft-deleted');
    end if;

    v_schema_md5 := case
        when d.emitted_json_schema is null then null
        else md5(d.emitted_json_schema::text)
    end;

    v_family := d.metadata ->> 'family';
    -- FAMILY-DERIVED, ONLY (Arman's 2026-08-27 ruling). The generated-contract
    -- families are the ONE ratified exemption from the render leg below; no
    -- per-row metadata flag is read here or anywhere else in this function.
    v_generated_contract := v_family in ('workflow_io', 'tool_io', 'action_io');

    -- THE STRUCTURAL LEG — computed, not remembered. Does a canonical example
    -- match the schema this kind carries RIGHT NOW?
    select exists (
        select 1
          from content_ir.kind_example e
         where e.kind_definition_id = d.id
           and e.is_canonical
           and e.deleted_at is null
           and content_ir.compute_example_validation(e.data, d.emitted_json_schema) = 'passed'
    ) into v_has_example;

    -- A canonical example that genuinely does NOT match. Named separately
    -- because it is a different repair from having no example at all: the
    -- kind and its own exemplar disagree, and any agent asked to build
    -- against it is being asked to guess.
    select exists (
        select 1
          from content_ir.kind_example e
         where e.kind_definition_id = d.id
           and e.is_canonical
           and e.deleted_at is null
           and content_ir.compute_example_validation(e.data, d.emitted_json_schema) = 'failed'
    ) into v_example_fails;

    -- Reported for visibility, never for the verdict: the stored record is
    -- behind the live answer, so the row is worth re-saving even though the
    -- gate no longer cares.
    select exists (
        select 1
          from content_ir.kind_example e
         where e.kind_definition_id = d.id
           and e.is_canonical
           and e.deleted_at is null
           and (e.metadata ->> 'validated_schema_md5') is distinct from v_schema_md5
    ) into v_example_recorded_stale;

    if not v_has_example then
        if v_example_fails then
            reasons := array_append(reasons,
                'structural: the canonical example does NOT match this kind''s own '
                || 'schema (kind is at v' || d.version::text || '). The kind and its '
                || 'exemplar disagree — anything asked to build against this is '
                || 'guessing. Fix the example, or fix the schema.');
        else
            reasons := array_append(reasons,
                'structural: no canonical kind_example that matches the current '
                || 'schema (add one, or fix the sample until it validates)');
        end if;
    end if;

    select exists (
        select 1 from content_ir.kind_component c
         where c.kind_definition_id = d.id and c.role = 'output'
           and c.is_active and c.deleted_at is null
           and c.component_key <> 'generic_structured'
    ) into v_has_component;

    select exists (
        select 1 from content_ir.kind_component c
         where c.kind_definition_id = d.id and c.role = 'output'
           and c.is_active and c.deleted_at is null
           and c.component_key = 'generic_structured'
    ) into v_has_generic_only;

    select coalesce(array_agg(distinct c.platform order by c.platform), '{}')
      into v_component_platforms
      from content_ir.kind_component c
     where c.kind_definition_id = d.id and c.role = 'output'
       and c.is_active and c.deleted_at is null
       and c.component_key <> 'generic_structured';

    if not v_generated_contract and not v_has_component then
        if v_has_generic_only then
            reasons := array_append(reasons,
                'render: the only active role=''output'' component is '
                || '''generic_structured'' — that IS the generic viewer, i.e. no '
                || 'component. A reader would get a key/value dump. Author a real '
                || 'source=''db'' component (or register a compiled one), then retire '
                || 'the generic row.');
        else
            reasons := array_append(reasons,
                'render: no active role=''output'' kind_component row '
                || '(author a source=''db'' component, or register a compiled one)');
        end if;
    end if;

    if not v_generated_contract
       and not coalesce(d.is_contract_artifact, false)
       and d.emitted_fingerprint is not null
    then
        select o.kind, o.id into v_dup_kind, v_dup_id
          from content_ir.kind_definition o
         where o.emitted_fingerprint = d.emitted_fingerprint
           and o.id <> d.id and o.is_active and o.deleted_at is null
           and not coalesce(o.is_contract_artifact, false)
           -- The SAME family-derived test as above, applied to the other row:
           -- a generated contract is not a competing display name for this shape.
           and (o.metadata ->> 'family') not in ('workflow_io','tool_io','action_io')
         order by o.created_at limit 1;

        if v_dup_kind is not null then
            v_unique_ok := false;
            reasons := array_append(reasons,
                'uniqueness: this schema is byte-identical to the ACTIVE kind "'
                || v_dup_kind || '" (id ' || v_dup_id::text || '). Two names for one '
                || 'shape is banned — the render registry is first-writer-wins, so one '
                || 'would silently display as the other. Bind to that kind instead, or '
                || 'give this one a genuinely different schema (a distinct shape needs '
                || 'distinct fields, not just a distinct name).');
        end if;
    end if;

    return jsonb_build_object(
        'would_activate', coalesce(array_length(reasons, 1), 0) = 0,
        'kind_definition_id', d.id,
        'kind', d.kind,
        'kind_version', d.version,
        'schema_md5', v_schema_md5,
        'currently_active', d.is_active,
        'family', v_family,
        'render_leg_applicable', not v_generated_contract,
        'structural_ok', v_has_example,
        'structural_example_fails', v_example_fails,
        'structural_record_is_stale', v_example_recorded_stale,
        'render_ok', v_generated_contract or v_has_component,
        'render_generic_only', v_has_generic_only and not v_has_component,
        'unique_ok', v_unique_ok,
        'duplicate_of', v_dup_kind,
        'component_platforms', to_jsonb(v_component_platforms),
        'reasons', to_jsonb(reasons),
        'checked_at', now()
    );
end;
$function$;

comment on function content_ir.evaluate_kind_activation(uuid) is
    'Read-only dual-gate verdict for a kind (structural + render legs, family-derived n/a exemption for generated-contract families). Answers "why will this not activate?". The manual per-row data-only flag was eradicated 2026-08-27 (Arman''s ruling) — never read here.';

-- Strip the dead key from EVERY row that still carries it, deleted or not —
-- "if it's dead completely, let's drop it completely and forget it existed."
UPDATE content_ir.kind_definition
   SET metadata = metadata - 'data_only'
 WHERE metadata ? 'data_only';
