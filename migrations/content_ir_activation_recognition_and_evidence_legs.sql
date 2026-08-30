-- content_ir.evaluate_kind_activation — the two legs it never had.
--
-- 🚨 WHY (Arman, 2026-08-29). This function decides whether a kind is "ready",
-- and it reported `would_activate = true, passes_every_check` for six kinds
-- that could not render in chat at all. It checked that a canonical example
-- matches the schema, and that a real (non-generic) component row exists —
-- both true — and never asked the two questions that decide whether a reader
-- actually sees the component:
--
--   1. RECOGNITION. Can this shape be identified from a stream at all? A
--      kind's field model is DERIVED from `emitted_json_schema`; without one
--      it has no contract, cannot be validated, cannot be bound to an agent's
--      output, and cannot be recognized mid-stream. A component behind an
--      unrecognizable shape is unreachable, however well authored it is.
--
--   2. EVIDENCE. Are readers getting the generic key/value dump RIGHT NOW?
--      The browser already files `generic_floor_render` incidents when a kind
--      reaches the generic viewer. An OPEN one is not a prediction — it is an
--      observation that this kind is failing in front of people. A "ready"
--      verdict that ignores its own incident table is a green light wired to
--      nothing, which is exactly how ~221 kinds spent 2026-08-29 certified
--      healthy while rendering as JSON dumps.
--
-- Applied by string surgery on the LIVE definition rather than a retyped body,
-- so every existing byte survives untouched; each anchor is asserted unique
-- before substitution, and a re-run over an already-migrated body is a no-op.
do $migration$
declare
  src text;
  out_src text;
  new_vars constant text :=
$decl$    v_unique_ok boolean := true;
    -- Added 2026-08-29 — see the migration header.
    v_has_contract boolean;
    v_open_floor_incident boolean;
    v_floor_seen_at timestamptz;$decl$;
  new_legs constant text :=
$legs$    -- THE RECOGNITION LEG. Without a schema there is no field model, so
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

$legs$;
  new_out constant text :=
$out$'render_ok', v_generated_contract or v_has_component,
        'recognition_ok', v_has_contract,
        'observed_generic_floor', v_open_floor_incident,
        'observed_generic_floor_at', v_floor_seen_at,$out$;
  anchor_vars constant text := '    v_unique_ok boolean := true;';
  anchor_out constant text := '''render_ok'', v_generated_contract or v_has_component,';
  uniq_leg_start int;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'content_ir' and p.proname = 'evaluate_kind_activation';

  if src is null then
    raise exception 'content_ir.evaluate_kind_activation not found';
  end if;

  if position('THE RECOGNITION LEG' in src) > 0 then
    raise notice 'evaluate_kind_activation already carries the recognition + evidence legs';
    return;
  end if;

  if (select count(*) from regexp_matches(src, anchor_vars, 'g')) <> 1 then
    raise exception 'declaration anchor is not unique — refusing to patch';
  end if;
  if (select count(*) from regexp_matches(src, anchor_out, 'g')) <> 1 then
    raise exception 'output anchor is not unique — refusing to patch';
  end if;

  uniq_leg_start := position(
    E'    if not v_generated_contract\n       and not coalesce(d.is_contract_artifact, false)' in src
  );
  if uniq_leg_start = 0 then
    raise exception 'uniqueness-leg anchor not found — refusing to patch';
  end if;

  out_src := replace(src, anchor_vars, new_vars);
  out_src := replace(out_src, anchor_out, new_out);
  -- Insert the new legs immediately BEFORE the uniqueness leg, so they run
  -- after the structural and render legs and before the verdict is built.
  uniq_leg_start := position(
    E'    if not v_generated_contract\n       and not coalesce(d.is_contract_artifact, false)' in out_src
  );
  out_src :=
      substr(out_src, 1, uniq_leg_start - 1)
   || new_legs
   || substr(out_src, uniq_leg_start);

  execute out_src;
  raise notice 'evaluate_kind_activation: recognition + evidence legs added';
end;
$migration$;
