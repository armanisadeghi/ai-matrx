-- DD-115 — `public.log_client_error` told the truth about nothing.
--
-- THREE DEFECTS, ALL MEASURED LIVE ON db.matrxserver.com (brsgrqvjdzwihsvnfqkf)
-- ON 2026-09-11, BEFORE THIS FILE (each probe ran inside a rolled-back
-- transaction; the exact SQL and output are in the DD-115 report):
--
--  1. EVERY CLIENT WAS LABELLED AS THE FRONTEND. The body inserted the string
--     literal 'matrx-frontend' into `ops.system_error.source_app`, whoever
--     called it. Probe: calling it the way matrx-extend's error seam calls it
--     (`p_source='chrome-extension'`) wrote
--       kind='chrome-extension', source_app='matrx-frontend'
--     so anybody triaging `ops.system_error` by `source_app` attributes every
--     Chrome-extension (and every desktop) failure to the web app.
--
--  2. AN INSERT FAILURE WAS SWALLOWED INTO A NULL RETURN. The body ended with
--     `exception when others then return null`, so a failed write looked
--     exactly like a successful one from the caller's side. Probe: with a
--     BEFORE INSERT trigger that raises, the function returned NULL — the
--     platform's own error door failing silently, which is precisely the class
--     it exists to end.
--
--  3. WITH NO ORGANIZATION IT WROTE NOTHING AND SAID NOTHING. `if v_org is null
--     then return null; end if;` — the error was discarded, not deferred, not
--     reported. Probe: with the `matrx-system` organization renamed inside the
--     transaction, the call returned NULL and wrote zero rows.
--
-- WHAT THIS MIGRATION DOES
--
--  A. A NEW 11-ARGUMENT IMPLEMENTATION takes `p_source_app`, validated against a
--     CLOSED list of client apps. An unknown value is REFUSED with a sentence a
--     person can act on — never coerced, never defaulted, never guessed.
--
--  B. THE OLD 10-ARGUMENT SIGNATURE STAYS, as a thin overload that delegates
--     with 'matrx-frontend'. Every existing caller keeps working unchanged.
--
--     WHY `p_source_app` IS THE FIRST PARAMETER AND HAS NO DEFAULT. Two
--     overloads of one name have to stay distinguishable to PostgREST, which
--     picks the function whose parameter names cover the JSON body's keys and
--     whose required parameters are all present. If `p_source_app` had a
--     default, a 10-key body would match BOTH functions and every existing call
--     would start failing with PGRST203 ("could not choose the best candidate
--     function"). Required it is — and Postgres requires that parameters
--     without defaults come first, hence the position. A body without
--     `p_source_app` can then only be the old overload; a body with it can only
--     be the new one. (Residue, loud not silent: a hand-written POSITIONAL call
--     with 3-10 arguments now matches both and Postgres answers "function ... is
--     not unique". No such caller exists in any repo; named arguments — what
--     both clients send — are unaffected.)
--
--  C. THE ROW IS WRITTEN EVEN WHEN NO ORGANIZATION RESOLVES, carrying a note in
--     `context.organization_note` that names why. NOTE THE DEVIATION FROM THE
--     BRIEF, DELIBERATE AND DOCUMENTED: the brief asked for `organization_id`
--     NULL on that row. That is not writable and must not be —
--     `ops.system_error.organization_id` is NOT NULL, and db-rules §0.9 ("NO
--     NULL ORG, NO ASSIGNED ORG", Arman 2026-08-21/23) forbids NULL as a scope.
--     The row therefore reaches the table with `organization_id` NULL in the
--     RPC's own INSERT and is stamped by the table's existing BEFORE INSERT
--     trigger `ops._stamp_capture_org` (DB-05 in the NO DB-assigned-org plan,
--     which owns its removal). The note is what stops that from being silent: it
--     states, in the row itself, that nobody supplied an organization and the
--     database attributed it. If and when DB-05 is detached, this INSERT will
--     fail loudly with 23502 instead — which is the correct end state, and is
--     exactly why (D) matters.
--
--  D. NOTHING IS SWALLOWED. The `exception when others then return null` handler
--     is GONE from both signatures. A refused or failed insert now reaches the
--     caller as a real Postgres error, and the caller decides how to degrade —
--     matrx-extend's seam already reports a failed error-report loudly
--     (`src/lib/supabase/db-failure.ts`), and matrx-frontend's Error Inspector
--     already ignores its own RPC failure by relation name so it cannot loop
--     (`lib/diagnostics/persistCapturedErrors.ts`).
--
-- §6d-4: the 11-arg function is genuinely NEW, so it declares itself in
-- `platform.client_callable_door` BEFORE its GRANT, or the DB-wide definer guard
-- takes the client EXECUTE straight back. The 10-arg signature is grandfathered
-- and keeps its ACL across CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- A. The implementation.
-- ---------------------------------------------------------------------------
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
  -- The closed list of client applications that may label a client error.
  -- Fixed, code-level vocabulary (db-rules §0.4 permits this shape; it is not a
  -- growing user vocabulary). Adding a client app is a migration, on purpose:
  -- the whole point of this list is that nobody can invent an app name from the
  -- browser and quietly split the error queue.
  c_source_apps constant text[] := array[
    'matrx-frontend',   -- the Next.js web app (Error Inspector)
    'matrx-extend',     -- the Chrome extension
    'matrx-local',      -- the desktop app
    'matrx-mobile'      -- the mobile client
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

  -- Organization resolution is UNCHANGED by this migration (DD-045 §2a and the
  -- NO DB-assigned-org plan own its detachment; re-pointing it here would
  -- launder the defect into a blessed one): caller-supplied if the caller may
  -- actually reach it, else the caller's personal organization, else the
  -- matrx-system organization.
  if auth.role() = 'service_role'
     or (v_user is not null and coalesce(iam.has_org_access(p_organization_id), false)) then
    v_org := p_organization_id;
  end if;
  if v_org is null and v_user is not null then
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

  -- Defect 3: the row is written either way, and says so. Never a discarded
  -- error, never an unexplained organization.
  if v_org is null then
    v_context := v_context || jsonb_build_object(
      'organization_note',
      'No organization could be resolved for this client error: the caller supplied none (or none it is allowed to reach), the signed-in user has no personal organization, and the matrx-system organization did not resolve. The error was recorded anyway rather than discarded; whatever organization this row carries was attributed by the database capture stamp (ops._stamp_capture_org), not by the client.'
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

  -- Defect 2: no `exception when others then return null`. If the write fails,
  -- the caller hears about it and decides what to do; a client-error door that
  -- loses client errors in silence is the defect this function exists to end.
  return v_id;
end;
$$;

comment on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) is
  'Canonical browser writer for client-origin errors into ops.system_error. The caller names its own app in p_source_app, validated against a closed list (matrx-frontend, matrx-extend, matrx-local, matrx-mobile) — an unknown app is refused with a human sentence. Auth-checked (attributes to auth.uid()). Resolves an organization (caller-supplied if reachable → personal → matrx-system) and, when none resolves, still writes the row with context.organization_note naming why. Raises on failure: nothing is swallowed. Callers: matrx-frontend lib/diagnostics/persistCapturedErrors.ts, matrx-extend src/lib/supabase/db-failure.ts. DD-115.';

-- ---------------------------------------------------------------------------
-- B. The old signature, preserved as a delegating overload.
-- ---------------------------------------------------------------------------
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
begin
  -- Compatibility shim: a caller that does not name its app is the web app,
  -- because that is the only caller this signature ever had. It does not
  -- swallow anything either — the implementation's error is the caller's error.
  -- Named notation: the two overloads are only distinguishable by name, so a
  -- positional call here would be exactly the ambiguity the header warns about.
  return public.log_client_error(
    p_source_app      => 'matrx-frontend',
    p_source          => p_source,
    p_message         => p_message,
    p_code            => p_code,
    p_route           => p_route,
    p_request_id      => p_request_id,
    p_conversation_id => p_conversation_id,
    p_stack           => p_stack,
    p_payload         => p_payload,
    p_context         => p_context,
    p_organization_id => p_organization_id
  );
end;
$$;

comment on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) is
  'Compatibility overload of public.log_client_error: delegates to the 11-argument implementation with p_source_app = matrx-frontend. Kept so pre-DD-115 callers keep working; new callers name their own app. Note that p_source_app has NO default on the implementation, which is what keeps overload resolution unambiguous for PostgREST.';

-- ---------------------------------------------------------------------------
-- §6d-4 — declare the new door BEFORE granting it, then grant.
-- ---------------------------------------------------------------------------
-- `identity_args` must match `pg_get_function_identity_arguments()` BYTE FOR
-- BYTE — the guard compares that text, not the argument types (read its body).
-- So it is read from the catalog here rather than typed out and hoped for.
insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
select 'public', 'log_client_error', pg_get_function_identity_arguments(p.oid),
       'Every browser client (web, extension, desktop, mobile) records its own errors through this one door; ops.system_error has no client write policy, so a SECURITY DEFINER RPC is the only path. It attributes to auth.uid(), refuses an unknown source app, and cannot choose an organization the caller may not reach.'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'log_client_error'
  and p.pronargs = 11
  and not exists (
    select 1 from platform.client_callable_door c
    where c.schema_name = 'public' and c.function_name = 'log_client_error'
      and c.identity_args = pg_get_function_identity_arguments(p.oid)
  );

revoke all on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) from public;
grant execute on function public.log_client_error(text,text,text,text,text,text,uuid,text,jsonb,jsonb,uuid)
  to anon, authenticated, service_role;

-- The 10-arg signature keeps the grants it has always had (guest diagnostics
-- stay anon-callable; an anonymous caller still cannot choose the tenant).
revoke all on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid) from public;
grant execute on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid)
  to anon, authenticated, service_role;
