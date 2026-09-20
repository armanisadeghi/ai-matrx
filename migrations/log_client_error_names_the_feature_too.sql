-- chair-step: the ONE client error door must name the FEATURE, and one signature
-- has to go for that to be possible. `source_app` / `source_feature` are ONE
-- two-level categorization: the app, then the feature inside it (Arman,
-- 2026-09-18). `ops.system_error` gained `source_feature` on 2026-09-20 and every
-- Python writer now stamps both halves — but `public.log_client_error`, the
-- SECURITY DEFINER door EVERY client app writes its errors through, could only
-- say the app. So every client-side failure on this platform, from all four
-- apps, lost the feature level.
--
-- WHY A DROP, AND WHY THIS IS NOT AN OVERLOAD.
-- Postgres cannot add a parameter in place: `CREATE OR REPLACE FUNCTION` with a
-- twelfth argument creates a SECOND function. With both live, PostgREST sees two
-- candidates for the eleven named arguments every current client sends and
-- refuses the call as ambiguous (PGRST203) — that is not a compatibility lane,
-- it is an outage of the error channel itself. So exactly one function survives:
-- the twelve-argument one, whose `p_source_feature` DEFAULTS to null. A client
-- that has not shipped yet — a Chrome extension or a desktop build a user will
-- not update for weeks — keeps working unchanged, because eleven named arguments
-- still resolve against it. No old function runs beside the new one, and no
-- deployed client is broken mid-flight. That is the whole trade, taken
-- deliberately.
--
-- The pre-DD-115 ten-argument shim (`p_source` first, no app) is deliberately
-- LEFT ALONE. It delegates by NAMED notation, so after this file its inner call
-- resolves to the twelve-argument function with `p_source_feature` defaulted —
-- and the sentinel below makes that row say so out loud.
--
-- NOTHING IS EVER APP-ONLY AGAIN. A null or empty feature is not stored as null:
-- it becomes the registered sentinel `client-unmapped`, which means "a client app
-- recorded this error and could not map the failing surface to a feature". Seeing
-- it in the error dashboard is a defect report about that client's route map, not
-- a shrug. The registry lives in
-- aidream/aidream/services/conversation_context/source_attribution.py; this
-- function validates the SHAPE of a slug (it cannot hold the list), and a
-- malformed one is a loud 22023, never a quietly mislabelled row.
--
-- Everything else this function does is unchanged byte for byte: the closed
-- client-app list, the exact-organization rule (42501 before INSERT), the
-- null-organization compatibility lane, the organization_note, and the
-- raise-on-every-failed-write behaviour.

-- based-on: public.log_client_error(text, text, text, text, text, text, uuid, text, jsonb, jsonb, uuid) a9d264fe33ae60c69dc54e9e09b494e4162b7c27c0c34d75660d5e7d908e2729

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
  p_organization_id uuid  default null,
  p_source_feature  text  default null
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
  -- The client analogue of the server's 'server-door': registered, filterable,
  -- and never silent. It is stamped when a caller names no feature at all.
  c_unmapped_feature constant text := 'client-unmapped';
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_feature text := lower(btrim(coalesce(p_source_feature, '')));
  v_id      uuid;
begin
  if p_source_app is null or not (p_source_app = any (c_source_apps)) then
    raise exception
      'log_client_error was called with source app %, which is not one of the client apps this platform knows about (%). The error was NOT recorded. Pass the name of the app that produced the error, exactly as written in that list; if this really is a new client app, add it to the closed list in a migration first.',
      coalesce(quote_literal(p_source_app), 'nothing at all'),
      array_to_string(c_source_apps, ', ')
      using errcode = '22023';
  end if;

  if v_feature = '' then
    v_feature := c_unmapped_feature;
    v_context := v_context || jsonb_build_object(
      'source_feature_note',
      'This client named its app but no feature, so the row carries the '
      || 'client-unmapped sentinel. Either the calling build predates '
      || 'p_source_feature, or that client could not map the failing surface to '
      || 'a registered feature. Add the surface to that client''s map.'
    );
  elsif v_feature !~ '^[a-z0-9][a-z0-9_:./-]{0,190}$' then
    raise exception
      'log_client_error was called with source feature %, which is not the shape of a feature slug (lowercase letters, digits, and _ : . / - , starting with a letter or digit, at most 191 characters). The error was NOT recorded. Pass a feature registered in source_attribution.SOURCE_FEATURES, or pass nothing and the row will be marked %.',
      quote_literal(p_source_feature), quote_literal(c_unmapped_feature)
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
    id, kind, source_app, source_feature, error_type, error_text, route, request_id,
    conversation_id, traceback, payload, context,
    user_id, created_by, organization_id, occurred_at, created_at
  ) values (
    gen_random_uuid(),
    coalesce(nullif(p_source, ''), 'client-error'),
    p_source_app,
    v_feature,
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


-- THE DOOR IS DECLARED BEFORE THE GRANT, and that order is not cosmetic:
-- `platform._ddl_guard` REVOKES client EXECUTE from any SECURITY DEFINER
-- function that is not declared in `platform.client_callable_door`, so a grant
-- issued first does not stick (measured: this file failed that way on its first
-- apply, 2026-09-20).
--
-- The door registry travels with the signature. `platform.client_callable_door`
-- is keyed by identity arguments (DD-223 joins on `identity_argtypes`), so the
-- eleven-argument row would go inert the moment the function above is dropped and
-- the surviving twelve-argument door would read as UNDECLARED. This is the same
-- row, re-pointed at the signature that now exists, with the new argument named
-- the way 0851_every_door_names_every_argument.sql requires.
update platform.client_callable_door d
   set identity_args = 'p_source_app text, p_source text, p_message text, p_code text, p_route text, p_request_id text, p_conversation_id uuid, p_stack text, p_payload jsonb, p_context jsonb, p_organization_id uuid, p_source_feature text',
       identity_argtypes = array[25,25,25,25,25,25,2950,25,3802,3802,2950,25]::oid[],
       argument_rules = jsonb_set(
         d.argument_rules,
         '{arguments,p_source_feature}',
         jsonb_build_object(
           'type', 'text',
           'foreign', jsonb_build_object('not_an_id', true),
           'optional', true,
           'position', 12,
           'null_rule', jsonb_build_object(
             'note', 'Null or empty becomes the registered client-unmapped sentinel plus a context note; it is never stored as null.'),
           'sql_default', 'NULL::text',
           'verified', 'log_client_error_names_the_feature_too.sql'
         )
       )
 where d.schema_name = 'public'
   and d.function_name = 'log_client_error'
   and d.identity_argtypes = array[25,25,25,25,25,25,2950,25,3802,3802,2950]::oid[];

grant execute on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid,text)
  to anon, authenticated, service_role;

comment on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid,text) is
  'Canonical browser writer for client-origin errors into ops.system_error. The caller names its app in p_source_app, validated against the closed client list, AND the feature inside that app in p_source_feature — source_app/source_feature are ONE two-level categorization. A caller that names no feature gets the registered client-unmapped sentinel plus a context note, never a null: no error row is app-only. A non-null p_organization_id is exact: service_role uses it deliberately; other callers must be authenticated and admitted to it or receive 42501 before INSERT. Null organization retains the legacy personal/system capture lane pending caller migration. Attributes to auth.uid() and raises on every failed write; nothing is swallowed. Callers: matrx-frontend, matrx-extend, matrx-local, matrx-mobile.';

-- The eleven-argument signature goes NOW, in this same transaction, so the two
-- never coexist for a single request. Its definition stays in migration history.
drop function if exists public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid);

do $$
declare
  v_sigs text;
  v_missing text;
begin
  select string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by p.pronargs)
    into v_sigs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'log_client_error';

  -- Exactly two survive: the twelve-argument door and the pre-DD-115 ten-argument
  -- shim, whose argument NAMES are disjoint from it, so PostgREST can always
  -- choose. A third would be the ambiguity this file exists to avoid.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'log_client_error') <> 2 then
    raise exception
      'log_client_error must end this migration with exactly two overloads (the 12-arg door and the 10-arg shim); found: %', v_sigs;
  end if;

  if to_regprocedure('public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid,text)') is null then
    raise exception 'the twelve-argument log_client_error is not present; found: %', v_sigs;
  end if;
  if to_regprocedure('public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid)') is not null then
    raise exception 'the eleven-argument log_client_error survived the drop; PostgREST would refuse every client call as ambiguous';
  end if;

  -- The door is useless to a signed-out browser without these three.
  select string_agg(r, ', ') into v_missing from unnest(array['anon','authenticated','service_role']) r
   where not has_function_privilege(r, 'public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid,text)', 'execute');
  if v_missing is not null then
    raise exception 'log_client_error is not executable by: %', v_missing;
  end if;
end $$;


do $$
begin
  if not exists (
    select 1 from platform.client_callable_door d
     join pg_proc p on p.proname = d.function_name
     join pg_namespace n on n.oid = p.pronamespace and n.nspname = d.schema_name
     where d.schema_name = 'public' and d.function_name = 'log_client_error'
       and pg_get_function_identity_arguments(p.oid) = d.identity_args
       and d.argument_rules -> 'arguments' ? 'p_source_feature'
  ) then
    raise exception
      'the client_callable_door row for log_client_error does not match the live twelve-argument signature; the door would read as undeclared';
  end if;
end $$;

notify pgrst, 'reload schema';
