-- lane KINDS-GLUE wave 1 (2026-10-02) — a kind says what its output is before it can be switched on, and the
-- refusal rows the kind store filed for a kind close themselves the moment that kind declares.
--
-- WHY. The kind store (aidream services/kind_records/store.py) reads content_ir.kind_definition.metadata.disposition
-- on every verified chat emission and REFUSES an undeclared kind: nothing stored, the user's output lost, one
-- ops.system_error row (kind_disposition_undeclared). 1,365 kinds were born undeclared — 538 of them active — because
-- neither the kind SDK, its publisher nor this activation gate ever asked. On 2026-10-01 data_table and timeline lost
-- the Halvorsen and Lindqvist rate cards this way (16 rows); ~30 kinds were fixed by hand, one at a time, after loss.
--
--   1. content_ir.evaluate_kind_activation gains a DISPOSITION leg: no would_activate without a disposition from the
--      closed set (record, envelope, receipt, proposal, prose = matrx_graph.content_ir.sdk.KIND_DISPOSITIONS). It is
--      the one gate, so set_kind_activation (which raises on any reason), the kind SDK publisher (which asks it
--      first) and the shape studio all refuse together, with the same sentence. The verdict also reports
--      disposition_ok / disposition. Nothing else in the body changes.
--   2. content_ir._kinds_glue_close_undeclared_refusals + its trigger: when a kind's row is inserted or its metadata
--      changes so that it now declares a disposition, every OPEN kind_disposition_undeclared row naming that kind is
--      resolved with a sentence saying so — whatever path declared it (publisher, SQL, the MCP, the studio).
--   3. A one-time sweep: open refusal rows for kinds that ALREADY declare (declared by hand after the loss) close now.
--
-- Already-active undeclared kinds are not deactivated by this file (the leg gates activation, it does not sweep);
-- they are declared by kindsglue_b. Locks: pg_proc row locks; CREATE TRIGGER takes SHARE ROW EXCLUSIVE on
-- content_ir.kind_definition for the statement (blocks concurrent writes to that small registry table only, not
-- reads; no DROP TRIGGER, whose ACCESS EXCLUSIVE would block reads); the sweep updates ops.system_error rows of kind 'kinds' only.
-- based-on: content_ir.evaluate_kind_activation(uuid) 8f2f40886b8d7572fd9356e92078fb4a34c64cba367319b16e2a2763e9f73725
-- lane: KINDS-GLUE
-- INVERSE: migrations/inverse/kindsglue_a_no_kind_activates_without_saying_what_it_is_down.sql

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
    -- Added 2026-08-29 — see the migration header.
    v_has_contract boolean;
    v_open_floor_incident boolean;
    v_floor_seen_at timestamptz;
    -- Added 2026-10-02 (lane KINDS-GLUE wave 1) — the disposition leg.
    v_disposition text;
    v_disposition_ok boolean;
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

    -- THE RECOGNITION LEG. Without a schema there is no field model, so
    -- nothing can identify this shape in a stream and its component is
    -- unreachable however well authored it is.
    v_has_contract := d.emitted_json_schema is not null;
    if not v_has_contract then
        reasons := array_append(reasons,
            'recognition: no emitted_json_schema. A kind''s field model is '
            || 'DERIVED from its schema, so without one nothing can identify '
            || 'this shape in a stream, validate a payload against it, or bind '
            || 'it to an agent''s output — and its component can never be '
            || 'reached. Give the kind a schema.');
    end if;

    -- THE DISPOSITION LEG (KINDS-GLUE wave 1, 2026-10-02). What is this kind's output?
    -- The kind store reads metadata.disposition on every verified emission and REFUSES an
    -- undeclared kind — nothing stored, the user's output lost (kind_disposition_undeclared).
    -- An active kind that has not answered is a kind whose first real use loses data, so no
    -- kind activates without one. The closed set is matrx_graph.content_ir.sdk.KIND_DISPOSITIONS.
    v_disposition := d.metadata ->> 'disposition';
    v_disposition_ok := coalesce(v_disposition in ('record', 'envelope', 'receipt', 'proposal', 'prose'), false);
    if not v_disposition_ok then
        reasons := array_append(reasons,
            'disposition: this kind does not say what its output is (metadata.disposition is '
            || coalesce('''' || v_disposition || '''', 'missing')
            || '). Declare one of record, envelope, receipt, proposal, prose — the kind store '
            || 'refuses every emission of an undeclared kind and the user''s output is lost.');
    end if;

    -- THE EVIDENCE LEG. An unresolved generic-floor incident means readers are
    -- getting a key/value dump for this kind right now.
    select true, max(i.updated_at)
      into v_open_floor_incident, v_floor_seen_at
      from content_ir.kind_component_incident i
     where i.kind_definition_id = d.id
       and i.error_type = 'generic_floor_render'
       and not i.resolved
       and i.deleted_at is null
    having count(*) > 0;
    v_open_floor_incident := coalesce(v_open_floor_incident, false);

    if v_open_floor_incident then
        reasons := array_append(reasons,
            'observed: this kind has an UNRESOLVED generic_floor_render '
            || 'incident (last seen ' || coalesce(v_floor_seen_at::text, 'unknown')
            || '). A reader reached the generic key/value viewer for it — that '
            || 'is not a prediction, it is a sighting. Fix the render, then '
            || 'resolve the incident.');
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
        'recognition_ok', v_has_contract,
        'disposition_ok', v_disposition_ok,
        'disposition', v_disposition,
        'observed_generic_floor', v_open_floor_incident,
        'observed_generic_floor_at', v_floor_seen_at,
        'render_generic_only', v_has_generic_only and not v_has_component,
        'unique_ok', v_unique_ok,
        'duplicate_of', v_dup_kind,
        'component_platforms', to_jsonb(v_component_platforms),
        'reasons', to_jsonb(reasons),
        'checked_at', now()
    );
end;
$function$;

create or replace function content_ir._kinds_glue_close_undeclared_refusals()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
-- A refusal row says "this kind has not declared what it IS". Once it has, the row is no longer true: close every
-- open one naming the kind, saying which declaration closed it. Rows stay (resolved), never deleted.
declare
    v_disposition text := new.metadata ->> 'disposition';
begin
    -- coalesce: `null not in (...)` is NULL, which an IF treats as false — a row declaring NOTHING
    -- would fall through and close every open refusal for its slug with a NULL note (found by the
    -- wave-1 verifier, 2026-10-02). A soft-deleted row is not the live kind and closes nothing.
    if coalesce(v_disposition, '') not in ('record', 'envelope', 'receipt', 'proposal', 'prose')
       or new.deleted_at is not null then
        return null;
    end if;
    if tg_op = 'UPDATE' and (old.metadata ->> 'disposition') is not distinct from v_disposition then
        return null;
    end if;
    update ops.system_error se
       set resolved_at = now(),
           resolution_note = 'declared: the kind ' || new.kind || ' now declares disposition=' || v_disposition
               || ', so its next verified emission is stored or routed by that declaration'
     where se.kind = 'kinds'
       and se.error_type = 'kind_disposition_undeclared'
       and se.resolved_at is null
       and se.context ->> 'kind' = new.kind;
    return null;
end;
$function$;

revoke all on function content_ir._kinds_glue_close_undeclared_refusals() from public, anon, authenticated;

-- Created only when absent (the inverse leaves it in place, inert), so a re-apply never needs a DROP.
do $trigger$
begin
    if not exists (
        select 1 from pg_trigger
         where tgrelid = 'content_ir.kind_definition'::regclass
           and tgname = '_kinds_glue_close_undeclared_refusals'
    ) then
        create trigger _kinds_glue_close_undeclared_refusals
            after insert or update of metadata on content_ir.kind_definition
            for each row execute function content_ir._kinds_glue_close_undeclared_refusals();
    end if;
end
$trigger$;

-- 3. The sweep: kinds declared by hand after their output was lost still carry open refusal rows.
update ops.system_error se
   set resolved_at = now(),
       resolution_note = 'declared: the kind ' || kd.kind || ' declares disposition=' || (kd.metadata ->> 'disposition')
           || ' (closed by the KINDS-GLUE sweep, 2026-10-02)'
  from content_ir.kind_definition kd
 where se.kind = 'kinds'
   and se.error_type = 'kind_disposition_undeclared'
   and se.resolved_at is null
   and kd.kind = se.context ->> 'kind'
   and kd.deleted_at is null
   and (kd.metadata ->> 'disposition') in ('record', 'envelope', 'receipt', 'proposal', 'prose');
