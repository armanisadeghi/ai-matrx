-- log_kind_component_incident — the canonical BROWSER → content_ir.kind_component_incident writer.
--
-- WHY THIS EXISTS. A DB-authored kind component that fails to compile or throws
-- at render already degrades safely (the generic structured viewer) and screams
-- into the client Error Inspector. But the Inspector is an ADMIN surface and its
-- durable sink (ops.system_error) is an undifferentiated firehose: when a random
-- user hits a broken component, nobody who can fix that component ever learns.
-- Meanwhile content_ir.kind_component_incident — the queue the component-authoring
-- agent already reads (kindcomp_get_context) and resolves (kindcomp_resolve_incident)
-- — had exactly ONE producer: the aidream generic-floor alarm. The browser, where
-- every real render happens, could not file at all.
--
-- Why an RPC: the table's std_insert policy requires EDITOR on the kind, so the
-- viewer of a broken component is denied by design (the table holds authored code
-- and is editor-gated for that reason). The canonical browser path for a
-- privileged sink is an auth-checked SECURITY DEFINER RPC (React → Supabase
-- directly), same shape as public.log_client_error.
--
-- PRIVACY. The caller passes a SHAPE snapshot (keys + value types, never values).
-- The incident is visible to whoever can edit the kind — often not the viewer's
-- organization — so a viewer's real content must never travel with it.
--
-- Dedupe mirrors the server alarm (aidream generic_floor_alarm.py): one OPEN row
-- per (kind, error_type, platform, role), occurrences counted in metadata. A
-- newer component version SUPERSEDES an open row (auto-resolved with a note), so
-- an author who ships a fix closes the incident by shipping — and a fix that
-- still fails opens a fresh one against the version that actually failed.
--
-- Idempotent (drop + create; the arg list grew once, on 2026-08-25). Fail-safe:
-- an alarm must never break the thing it watches, so the whole body is wrapped
-- and returns NULL on any failure.

drop function if exists public.log_kind_component_incident(text,text,text,text,text,uuid,text,text,integer,text,jsonb,jsonb,text,text);

create or replace function public.log_kind_component_incident(
  p_kind              text,
  p_error_type        text,
  p_error_message     text,
  p_platform          text  default 'web',
  p_role              text  default 'output',
  p_component_id      uuid  default null,
  p_component_key     text  default null,
  p_component_semver  text  default null,
  p_component_version integer default null,
  p_error_stack       text  default null,
  p_data_shape        jsonb default null,
  p_browser_info      jsonb default null,
  p_session_id        text  default null,
  p_route             text  default null,
  p_component_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user     uuid := auth.uid();
  v_kind     content_ir.kind_definition%rowtype;
  v_existing content_ir.kind_component_incident%rowtype;
  v_platform text := coalesce(nullif(p_platform, ''), 'web');
  v_role     text := coalesce(nullif(p_role, ''), 'output');
  v_type     text := coalesce(nullif(p_error_type, ''), 'render_failure');
  v_meta     jsonb;
  v_routes   jsonb;
  v_now      text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_seen_at  timestamptz;
  v_id       uuid;
begin
  if coalesce(nullif(trim(p_kind), ''), '') = '' then
    return null;
  end if;

  -- An unregistered slug is not this alarm's business (same ruling as the
  -- server alarm): pass-through payloads carry arbitrary user-authored
  -- `__kind` strings and filing one row each would fill the table with other
  -- people's JSON.
  select * into v_kind
  from content_ir.kind_definition
  where kind = trim(p_kind) and deleted_at is null
  order by created_at
  limit 1;
  if not found then
    return null;
  end if;

  select * into v_existing
  from content_ir.kind_component_incident
  where kind_definition_id = v_kind.id
    and error_type = v_type
    and coalesce(platform, '') = v_platform
    and coalesce(role, '') = v_role
    and resolved = false
    and deleted_at is null
  order by created_at
  limit 1;

  if found then
    -- A newer component version supersedes the open row: the author shipped a
    -- change, so the old incident is answered whether or not this one repeats.
    -- The browser resolver knows a component by its `updated_at`, not by a row
    -- version, so supersession accepts EITHER signal: a higher version, or a
    -- newer component timestamp than the one the open row recorded.
    v_seen_at := nullif(v_existing.metadata ->> 'component_updated_at', '')::timestamptz;
    if (p_component_version is not null
        and v_existing.component_version is not null
        and p_component_version > v_existing.component_version)
       or (p_component_updated_at is not null
           and v_seen_at is not null
           and p_component_updated_at > v_seen_at) then
      update content_ir.kind_component_incident
      set resolved = true,
          resolved_at = now(),
          resolution_notes = format(
            'Superseded: a newer component version arrived (version %s / updated %s) after this one failed.',
            coalesce(p_component_version::text, 'n/a'),
            coalesce(p_component_updated_at::text, 'n/a'))
      where id = v_existing.id;
    else
      v_meta := coalesce(v_existing.metadata, '{}'::jsonb);
      v_routes := coalesce(v_meta -> 'routes', '[]'::jsonb);
      if p_route is not null and not (v_routes @> to_jsonb(array[p_route]))
         and jsonb_array_length(v_routes) < 12 then
        v_routes := v_routes || to_jsonb(array[p_route]);
      end if;
      update content_ir.kind_component_incident
      set metadata = v_meta
        || jsonb_build_object(
             'occurrences', coalesce((v_meta ->> 'occurrences')::int, 1) + 1,
             'last_seen_at', v_now,
             'routes', v_routes)
      where id = v_existing.id;
      return v_existing.id;
    end if;
  end if;

  insert into content_ir.kind_component_incident (
    id, kind_definition_id, kind, component_id, component_key, platform, role,
    error_type, error_message, error_stack, data_snapshot,
    component_semver, component_version, browser_info, session_id,
    resolved, organization_id, created_by, updated_by
  ) values (
    gen_random_uuid(), v_kind.id, v_kind.kind, p_component_id, p_component_key,
    v_platform, v_role, v_type,
    coalesce(nullif(p_error_message, ''), '(no message)'),
    p_error_stack,
    -- Shape only. See the PRIVACY note above.
    p_data_shape,
    p_component_semver, p_component_version, p_browser_info, p_session_id,
    false, v_kind.organization_id, v_user, v_user
  )
  returning id into v_id;

  update content_ir.kind_component_incident
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'occurrences', 1,
        'first_seen_at', v_now,
        'last_seen_at', v_now,
        'routes', case when p_route is null then '[]'::jsonb else to_jsonb(array[p_route]) end,
        'signal', 'browser_render_alarm',
        'component_updated_at', p_component_updated_at,
        'observer_authenticated', v_user is not null)
  where id = v_id;

  return v_id;
exception
  when others then
    return null;
end;
$$;

comment on function public.log_kind_component_incident(text,text,text,text,text,uuid,text,text,integer,text,jsonb,jsonb,text,text,timestamptz) is
  'Canonical browser writer for kind-component render failures into content_ir.kind_component_incident (the queue the component-authoring agent reads via kindcomp_get_context). Auth-checked, dedupes to one open row per (kind,error_type,platform,role), auto-resolves a row superseded by a newer component version, and is fail-safe (returns NULL, never raises). data_shape carries KEYS AND TYPES ONLY — never a viewer''s values. Called by features/content-ir/react/db-component/kindComponentIncident.ts.';

revoke all on function public.log_kind_component_incident(text,text,text,text,text,uuid,text,text,integer,text,jsonb,jsonb,text,text,timestamptz) from public;
grant execute on function public.log_kind_component_incident(text,text,text,text,text,uuid,text,text,integer,text,jsonb,jsonb,text,text,timestamptz) to authenticated, anon;
