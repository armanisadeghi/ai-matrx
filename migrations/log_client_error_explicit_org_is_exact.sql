-- based-on: public.log_client_error(text, text, text, text, text, text, uuid, text, jsonb, jsonb, uuid) a9d264fe33ae60c69dc54e9e09b494e4162b7c27c0c34d75660d5e7d908e2729

-- `p_organization_id` is an integrity assertion, never a hint. Before this
-- repair, a signed-out caller or a user whose membership changed between
-- capture and flush could supply a non-null organization, fail admission, and
-- still receive a success id for a row silently redirected to a personal or
-- system organization. That made a client acknowledge the wrong durable fact.
--
-- Preserve the existing null-organization compatibility lane for callers that
-- have not yet been migrated. A non-null organization is now exact: service
-- work carries it deliberately; every other caller must be authenticated and
-- admitted to it, or the function refuses before INSERT with 42501.

create or replace function public.log_client_error(
  p_source_app      text,
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
  c_source_apps constant text[] := array[
    'matrx-frontend',
    'matrx-extend',
    'matrx-local',
    'matrx-mobile'
  ];
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_id      uuid;
begin
  if p_source_app is null or not (p_source_app = any (c_source_apps)) then
    raise exception
      'log_client_error was called with source app %, which is not one of the client apps this platform knows about (%). The error was NOT recorded. Pass the name of the app that produced the error, exactly as written in that list; if this really is a new client app, add it to the closed list in a migration first.',
      coalesce(quote_literal(p_source_app), 'nothing at all'),
      array_to_string(c_source_apps, ', ')
      using errcode = '22023';
  end if;

  if p_organization_id is not null then
    if auth.role() = 'service_role' then
      v_org := p_organization_id;
    elsif v_user is null
       or not coalesce(iam.has_org_access(p_organization_id), false) then
      raise exception
        'log_client_error refused the explicit organization. The current identity is not admitted to that organization, so the error was NOT recorded. Refresh organization context and retry with an organization the current identity may access.'
        using errcode = '42501';
    else
      v_org := p_organization_id;
    end if;
  else
    -- Compatibility only: callers that omit organization still use the
    -- pre-existing personal/system capture lane until their own migration.
    if v_user is not null then
      select o.id into v_org
      from iam.organizations o
      where o.created_by = v_user and o.is_personal = true
      order by o.created_at limit 1;
    end if;
    if v_org is null then
      select s.organization_id into v_org
      from iam.system_orgs s
      join iam.organizations o on o.id = s.organization_id
      where o.slug = 'matrx-system'
      limit 1;
    end if;
  end if;

  if v_org is null then
    v_context := v_context || jsonb_build_object(
      'organization_note',
      'No organization was supplied for this client error, the signed-in user has no personal organization, and the matrx-system organization did not resolve. The error was recorded anyway rather than discarded; whatever organization this row carries was attributed by the database capture stamp (ops._stamp_capture_org), not by the client.'
    );
  end if;

  insert into ops.system_error (
    id, kind, source_app, error_type, error_text, route, request_id,
    conversation_id, traceback, payload, context,
    user_id, created_by, organization_id, occurred_at, created_at
  ) values (
    gen_random_uuid(),
    coalesce(nullif(p_source, ''), 'client-error'),
    p_source_app,
    p_code,
    coalesce(nullif(p_message, ''), '(no message)'),
    p_route,
    p_request_id,
    p_conversation_id,
    p_stack,
    p_payload,
    v_context,
    v_user,
    v_user,
    v_org,
    now(),
    now()
  ) returning id into v_id;

  return v_id;
end;
$$;

comment on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) is
  'Canonical browser writer for client-origin errors into ops.system_error. The caller names its app in p_source_app, validated against the closed client list. A non-null p_organization_id is exact: service_role uses it deliberately; other callers must be authenticated and admitted to it or receive 42501 before INSERT. Null organization retains the legacy personal/system capture lane pending caller migration. Attributes to auth.uid() and raises on every failed write; nothing is swallowed. Callers: matrx-frontend, matrx-extend, matrx-local, matrx-mobile.';
