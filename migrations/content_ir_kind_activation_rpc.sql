-- content_ir kind activation — THE write path for `kind_definition.is_active`.
--
-- Before this migration nothing in the platform could flip `is_active`:
-- the agent toolset hardcoded false, the studio had no write, and the admin
-- console declares read-only as an invariant in four separate files. Activation
-- was a human hand-writing a migration per kind. Six agent-authored kinds
-- (wine_tasting, employee_card, employee_roster, employee_of_the_week,
-- flashcard_deck, arman_video_prompt) sat dark with a validated canonical
-- example AND a live `source='db'` component — both legs satisfied in
-- substance, no way to record it.
--
-- The two legs reuse verdicts that already exist rather than adding a third
-- validator. They are NOT identical to `kind-dual-gate.ts`: the TS render leg
-- also EXECUTES a compiled kind's bridge and rejects semantically empty output,
-- which SQL cannot do. This function is therefore the FLOOR — sufficient for
-- DB-authored components (which own no bridge), while the TS gate is the
-- ceiling for compiled kinds. Compiled kinds are activated by developers via
-- `scripts/shape/activate-kinds.ts`, which runs the stronger leg.
--
--   structural — a canonical, non-deleted `kind_example` with
--                validation_status='passed'. That verdict is DERIVED by the
--                `kind_example_recompute_validation` trigger via
--                `compute_example_validation` (pg_jsonschema). We read it; we
--                never recompute it, so a fabricated 'passed' is impossible.
--
--   render     — at least one active, non-deleted `role='output'`
--                `kind_component` row. This covers BOTH component sources
--                uniformly: compiled kinds carry `source='bundled'` rows and
--                agent-authored kinds carry `source='db'` rows.
--
-- The `n/a` doctrine (shape-doctor.ts) is honored: data-only contract families
-- are never rendered, so the render leg is structurally inapplicable and is
-- skipped rather than failed. 665 active generated contract kinds legitimately
-- own no component; failing them would be noise, and noise erodes the gate.
--
-- KNOWN GAP (escalated, deliberately not patched here): the family list is a
-- literal, and 81 live-active `web_analysis_item` kinds fall outside it — they
-- are data-only in substance but this function would refuse them. Since
-- deactivation is ungated, each is a one-way door. The predicate should become
-- a property of the kind, not a hardcoded allowlist. Do NOT deactivate a
-- web_analysis_item kind until that is resolved.
--
-- Deactivation is NEVER gated — turning something off must always be possible.
--
-- ENFORCEMENT (added after adversarial review found the gate was advisory):
--   * `p_active` must be an explicit true/false. A null used to fall through
--     `if not p_active` — NULL is not false — into the ACTIVATE branch, so a
--     null meaning "turn this off" turned it ON and reported ok:true.
--   * `authenticated` held a column-level UPDATE grant on `is_active`, and RLS
--     std_update permits owner-or-editor, so one PostgREST call walked around
--     this function entirely — and an `editor` (whom this function refuses)
--     could write the column raw. The grant is revoked and a BEFORE UPDATE
--     trigger rejects any `is_active` change that did not come through here.
--     service_role is exempt: the aidream contract publisher and agent tools
--     write as a privileged role and are not the threat model.

create or replace function content_ir.evaluate_kind_activation(
    p_kind_definition_id uuid
)
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
    reasons text[] := '{}';
begin
    select id, kind, is_active, metadata, deleted_at
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

    -- coalesce is load-bearing: `v_family` is NULL for every display kind (only
    -- generated contracts carry metadata.family), and `null in (...)` yields
    -- NULL, not false. Without this the render-leg IF below evaluates to NULL,
    -- never fires, and a componentless kind activates with an empty `reasons`
    -- array — caught live on `categorization_result`.
    v_family := d.metadata ->> 'family';
    v_data_only := coalesce(
        v_family in ('workflow_io', 'tool_io', 'action_io', 'agent_io'),
        false
    );

    -- Structural leg: read the trigger-derived verdict, never recompute it.
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

    -- Render leg: n/a for data-only contract families.
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

    return jsonb_build_object(
        'would_activate', coalesce(array_length(reasons, 1), 0) = 0,
        'kind_definition_id', d.id,
        'kind', d.kind,
        'currently_active', d.is_active,
        'family', v_family,
        'render_leg_applicable', not v_data_only,
        'structural_ok', v_has_example,
        'render_ok', v_data_only or v_has_component,
        'component_platforms', to_jsonb(v_component_platforms),
        'reasons', to_jsonb(reasons),
        'checked_at', now()
    );
end;
$function$;

create or replace function content_ir.set_kind_activation(
    p_kind_definition_id uuid,
    p_active boolean,
    p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
    d record;
    v_uid uuid := auth.uid();
    v_verdict jsonb;
begin
    if v_uid is null then
        raise exception 'set_kind_activation: no authenticated user';
    end if;
    if p_active is null then
        raise exception
            'set_kind_activation: p_active must be true or false, not null';
    end if;

    select id, kind, created_by, is_active
      into d
      from content_ir.kind_definition
     where id = p_kind_definition_id;

    if d.id is null then
        raise exception 'set_kind_activation: kind definition % does not exist',
            p_kind_definition_id;
    end if;

    -- Ownership of the DEFINITION governs. Super admins may act on any kind so
    -- platform display Shapes (owned by the system org) stay administrable.
    if d.created_by is distinct from v_uid and not public.is_super_admin() then
        raise exception
            'set_kind_activation: not authorized for kind "%" — you must own the definition or be a super admin',
            d.kind;
    end if;

    -- Deactivation is never gated: turning a kind off must always be possible,
    -- including (especially) when its component has started failing.
    if p_active is not true then
        perform set_config('content_ir.activation_ok', '1', true);
        update content_ir.kind_definition
           set is_active = false,
               updated_by = v_uid,
               metadata = case
                   when p_note is null then metadata
                   else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
               end
         where id = d.id;

        return jsonb_build_object(
            'ok', true,
            'kind', d.kind,
            'kind_definition_id', d.id,
            'is_active', false,
            'was_active', d.is_active,
            'gated', false
        );
    end if;

    v_verdict := content_ir.evaluate_kind_activation(d.id);

    if not (v_verdict ->> 'would_activate')::boolean then
        raise exception
            'set_kind_activation: kind "%" failed the dual gate — %',
            d.kind,
            array_to_string(
                array(select jsonb_array_elements_text(v_verdict -> 'reasons')),
                ' | '
            );
    end if;

    perform set_config('content_ir.activation_ok', '1', true);
    update content_ir.kind_definition
       set is_active = true,
           updated_by = v_uid,
           metadata = case
               when p_note is null then metadata
               else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
           end
     where id = d.id;

    return jsonb_build_object(
        'ok', true,
        'kind', d.kind,
        'kind_definition_id', d.id,
        'is_active', true,
        'was_active', d.is_active,
        'gated', true,
        'verdict', v_verdict
    );
end;
$function$;

revoke update (is_active) on content_ir.kind_definition from authenticated;

create or replace function content_ir.guard_kind_is_active_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if new.is_active is distinct from old.is_active
       and coalesce(current_setting('content_ir.activation_ok', true), '') <> '1'
       and current_user <> 'service_role'
    then
        raise exception
            'content_ir.kind_definition.is_active is gated — write it through content_ir.set_kind_activation (kind "%")',
            old.kind;
    end if;
    return new;
end;
$function$;

drop trigger if exists kind_definition_guard_is_active on content_ir.kind_definition;
create trigger kind_definition_guard_is_active
    before update on content_ir.kind_definition
    for each row execute function content_ir.guard_kind_is_active_write();

grant execute on function content_ir.evaluate_kind_activation(uuid) to authenticated, service_role;
grant execute on function content_ir.set_kind_activation(uuid, boolean, text) to authenticated, service_role;

comment on function content_ir.evaluate_kind_activation(uuid) is
    'Read-only dual-gate verdict for a kind (structural + render legs, n/a-aware for data-only families). Answers "why will this not activate?".';
comment on function content_ir.set_kind_activation(uuid, boolean, text) is
    'THE write path for kind_definition.is_active. Activation runs the dual gate and raises with specific reasons on failure; deactivation is never gated. Owner-or-super-admin.';
