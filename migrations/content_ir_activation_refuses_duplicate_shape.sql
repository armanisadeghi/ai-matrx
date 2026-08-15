-- D164 — a kind may not go LIVE with a shape another LIVE kind already owns.
--
-- `keyword_set` and `keyword_variant_set` were minted 32ms apart, byte-identical,
-- and nothing objected; the duplication was found three weeks later by an unrelated
-- re-emit tool. The mint-time guard in `kind_create` / `kind_update_schema`
-- (matrx-ai `kind_authoring.py`) would NOT have caught it: both were created
-- INACTIVE, so at mint time no live kind held the fingerprint. The collision only
-- became real when both were ACTIVATED. Activation is therefore where the
-- invariant belongs, and `evaluate_kind_activation` is the single authority every
-- surface calls (browser studio, the kind_activate tool, activate-kinds.ts), so a
-- third leg here reaches all of them at once.
--
-- WHY THIS MATTERS: the frontend's fingerprint index (`buildKindFingerprintIndex`)
-- is first-writer-wins, so the loser of a collision silently DISPLAYS as the
-- winner, and nothing tells the agent, the tool, or the human.
--
-- SCOPE — DO NOT WIDEN. Fingerprint collisions are endemic and LEGITIMATE among
-- machine-minted contract snapshots (`action_io_*` / `tool_io_*` / `agent_io_*` /
-- `workflow_io_*`): every tool sharing an input shape with another collides by
-- construction, and refusing those would break the aidream contract publisher.
-- The leg applies ONLY to hand-authored display kinds, and excludes the data-only
-- families by NAME as well as by `is_contract_artifact`, because the flag alone is
-- not load-bearing enough to protect the publisher.
--
-- Measured live before applying: 0 collisions among active hand-authored kinds,
-- so this refuses nothing that exists today.
--
-- Deactivation is NEVER gated (a kind whose component is failing must always be
-- switchable off) — this only adds a REASON, and `set_kind_activation` consults
-- the verdict only when activating.

create or replace function content_ir.evaluate_kind_activation(p_kind_definition_id uuid)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
    d record;
    v_family text;
    v_data_only boolean;
    v_has_example boolean;
    v_has_component boolean;
    v_component_platforms text[];
    v_dup_kind text;
    v_dup_id uuid;
    v_unique_ok boolean := true;
    reasons text[] := '{}';
begin
    select id, kind, is_active, metadata, deleted_at,
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

    -- coalesce is load-bearing: v_family is NULL for every display kind (only
    -- generated contracts carry metadata.family), and `null in (...)` yields
    -- NULL, not false. Without it the render-leg IF evaluates to NULL, never
    -- fires, and a componentless kind activates with an empty reasons array.
    v_family := d.metadata ->> 'family';
    v_data_only := coalesce(
        v_family in ('workflow_io', 'tool_io', 'action_io', 'agent_io'),
        false
    );

    select exists (
        select 1
          from content_ir.kind_example e
         where e.kind_definition_id = d.id
           and e.is_canonical
           and e.validation_status = 'passed'
           and e.deleted_at is null
    ) into v_has_example;

    if not v_has_example then
        reasons := array_append(reasons,
            'structural: no canonical kind_example with validation_status=''passed'' '
            || '(add one, or fix the sample until the validation trigger passes it)');
    end if;

    select exists (
        select 1
          from content_ir.kind_component c
         where c.kind_definition_id = d.id
           and c.role = 'output'
           and c.is_active
           and c.deleted_at is null
    ) into v_has_component;

    select coalesce(array_agg(distinct c.platform order by c.platform), '{}')
      into v_component_platforms
      from content_ir.kind_component c
     where c.kind_definition_id = d.id
       and c.role = 'output'
       and c.is_active
       and c.deleted_at is null;

    if not v_data_only and not v_has_component then
        reasons := array_append(reasons,
            'render: no active role=''output'' kind_component row '
            || '(author a source=''db'' component, or register a compiled one)');
    end if;

    -- uniqueness leg (D164). Only for hand-authored display kinds.
    if not v_data_only
       and not coalesce(d.is_contract_artifact, false)
       and d.emitted_fingerprint is not null
    then
        select o.kind, o.id
          into v_dup_kind, v_dup_id
          from content_ir.kind_definition o
         where o.emitted_fingerprint = d.emitted_fingerprint
           and o.id <> d.id
           and o.is_active
           and o.deleted_at is null
           and not coalesce(o.is_contract_artifact, false)
           and coalesce(
                 (o.metadata ->> 'family')
                   in ('workflow_io', 'tool_io', 'action_io', 'agent_io'),
                 false
               ) is false
         order by o.created_at
         limit 1;

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
        'currently_active', d.is_active,
        'family', v_family,
        'render_leg_applicable', not v_data_only,
        'structural_ok', v_has_example,
        'render_ok', v_data_only or v_has_component,
        'unique_ok', v_unique_ok,
        'duplicate_of', v_dup_kind,
        'component_platforms', to_jsonb(v_component_platforms),
        'reasons', to_jsonb(reasons),
        'checked_at', now()
    );
end;
$function$;
