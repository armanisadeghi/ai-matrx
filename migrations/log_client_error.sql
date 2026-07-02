-- log_client_error — the canonical browser → public.system_error writer.
--
-- The systemwide Error Inspector (a CLIENT global error handler) persists
-- selected captures (red tier, deduped, throttled) into public.system_error so
-- client errors join the SAME queryable sink + admin dashboard as server errors.
--
-- Why an RPC: public.system_error has RLS enabled with NO client policy — direct
-- INSERT from the browser is denied (only service_role writes it). Per CLAUDE.md
-- the canonical browser write path for a privileged sink is an auth-checked
-- SECURITY DEFINER RPC (React → Supabase directly), NOT a Next API route and NOT
-- the Python backend. This supersedes the ad-hoc API-route writers (audio error
-- logger, tool-ui-incident) which can adopt it over time.
--
-- Idempotent (CREATE OR REPLACE). Fail-safe: logging must NEVER raise to the
-- caller, so the whole body is wrapped and returns NULL on any failure.

create or replace function public.log_client_error(
  p_source          text,
  p_message         text,
  p_code            text  default null,
  p_route           text  default null,
  p_request_id      text  default null,
  p_conversation_id uuid  default null,
  p_stack           text  default null,
  p_payload         jsonb default null,
  p_context         jsonb default null,
  p_organization_id uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid := p_organization_id;
  v_id   uuid;
begin
  -- system_error.organization_id is NOT NULL. Resolve an org without ever
  -- raising or creating one: client-supplied → caller's personal org → the
  -- Matrx System org (resolved by slug, never hardcoded) so a guest /
  -- unattributable error is still captured. Only give up if none resolves.
  if v_org is null and v_user is not null then
    select id into v_org
    from iam.organizations
    where created_by = v_user and is_personal = true
    order by created_at
    limit 1;
  end if;

  if v_org is null then
    select s.organization_id into v_org
    from iam.system_orgs s
    join iam.organizations o on o.id = s.organization_id
    where o.slug = 'matrx-system'
    limit 1;
  end if;

  if v_org is null then
    return null;
  end if;

  insert into public.system_error (
    id, kind, source_app, error_type, error_text, route, request_id,
    conversation_id, traceback, payload, context,
    user_id, created_by, organization_id, occurred_at, created_at
  ) values (
    gen_random_uuid(),
    coalesce(nullif(p_source, ''), 'client-error'),
    'matrx-frontend',
    p_code,
    coalesce(nullif(p_message, ''), '(no message)'),
    p_route,
    p_request_id,
    p_conversation_id,
    p_stack,
    p_payload,
    p_context,
    v_user,
    v_user,
    v_org,
    now(),
    now()
  )
  returning id into v_id;

  return v_id;
exception
  when others then
    -- Logging is best-effort — never surface a failure to the caller.
    return null;
end;
$$;

comment on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) is
  'Canonical browser writer for client-origin errors into public.system_error (source_app=matrx-frontend). Auth-checked (attributes to auth.uid()); resolves org (personal → matrx-system) so NOT NULL never blocks capture; fail-safe (returns NULL, never raises). Called by the Error Inspector persistence adapter (lib/diagnostics/persistCapturedErrors.ts).';

revoke all on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) from public;
grant execute on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) to authenticated, anon;
