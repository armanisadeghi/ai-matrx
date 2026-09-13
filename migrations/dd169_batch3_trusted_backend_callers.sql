-- dd169_batch3_trusted_backend_callers.sql
--
-- THE DEFECT (live, 2026-09-13). `migrations/dd169_batch3_signed_in_gates.sql`
-- (commit a3708efd36, 2026-09-13 08:45 UTC) gave six SECURITY DEFINER doors a
-- caller gate. Four of them gate on an ACCESS predicate; two of them gate on the
-- mere presence of a browser session:
--
--   public.lookup_user_by_email(text)  -> `if auth.uid() is null then raise 42501`
--   seo.fn_upsert_keyword(text,text)   -> `if auth.uid() is null then raise 42501`
--
-- `auth.uid() is null` is not "nobody is signed in". It is also EVERY trusted
-- server-side caller we have, because none of them carry an end-user JWT:
--
--   * the service key (`sb_secret_*`) over PostgREST — `auth.uid()` null,
--     `auth.jwt() ->> 'role'` = 'service_role', `session_user` = 'authenticator';
--   * a direct Postgres connection (aidream's matrx-orm, the migration runners,
--     the repo's scripts) — no request context at all, `session_user` is our own
--     login role.
--
-- Measured consequence: from 08:45 UTC every agent feedback submission died with
-- "agent feedback cannot be attributed … the agent service account
-- claude-01@aimatrx.com was not found" — `lib/services/agent-feedback.service.ts`
-- resolves that account through this exact RPC on the admin client, and the 42501
-- came back as "not found". The same class silently closes `seo.fn_upsert_keyword`
-- to aidream's keyword intake (`packages/matrx-seo/matrx_seo/orm_identity.py`,
-- which calls it over a direct connection).
--
-- THE CLASS FIX. The question these gates meant to ask is "is this an
-- unauthenticated WEB caller?", and no gate in this database had one canonical way
-- to answer it — 78 functions hand-roll a service-role test. This file publishes
-- that predicate ONCE as `iam.is_trusted_backend()` and puts it in both gates.
-- Nothing else changes: same signatures, same return shapes, same rows, and an
-- unauthenticated anon/authenticated web caller is refused exactly as before.
--
-- Idempotent: CREATE OR REPLACE + declaration updates only.

-- ── 1. The canonical predicate ──────────────────────────────────────────────
create or replace function iam.is_trusted_backend()
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  -- TRUE for a caller that is the server itself, never for a browser:
  --   a) the PostgREST request carries the service-role claim. `current_user` is
  --      USELESS inside a SECURITY DEFINER body (it is the function owner, D166);
  --      the JWT role claim survives into the definer context.
  --   b) the session is not a PostgREST web session at all. Supabase's PostgREST
  --      always logs in as `authenticator` and then SET ROLEs to anon /
  --      authenticated / service_role, so any other `session_user` is a direct
  --      connection: our own login role, which can already read these tables
  --      without asking any function for permission.
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
      or session_user <> 'authenticator'
$function$;

comment on function iam.is_trusted_backend() is
  'THE canonical "this caller is the server, not a browser" predicate: service-role JWT claim, or a session that is not a PostgREST web session at all. Use it beside auth.uid() in any gate that means "no unauthenticated WEB caller" — a bare `auth.uid() is null` refusal also refuses the service key and every direct connection (DD-169 batch 3 regression, 2026-09-13).';

-- ── 2. public.lookup_user_by_email — the door that broke agent feedback ─────
create or replace function public.lookup_user_by_email(lookup_email text)
 returns table(user_id uuid, user_email text)
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
DECLARE
  normalized_email text;
  found_user_id uuid;
  found_user_email text;
BEGIN
  -- 🚨 THE GATE (DD-169 batch 3, amended 2026-09-13). This function reads
  -- auth.users as the owner. Sharing and inviting by email is the product it
  -- exists for, so it stays available to a signed-in caller — and to the server
  -- itself, which never has an auth.uid(). The leak class closed here is still
  -- the UNAUTHENTICATED WEB one.
  IF auth.uid() IS NULL AND NOT iam.is_trusted_backend() THEN
    RAISE EXCEPTION 'lookup_user_by_email: sign in to look someone up by email'
      USING ERRCODE = '42501';
  END IF;

  normalized_email := lower(trim(lookup_email));

  SELECT au.id, au.email INTO found_user_id, found_user_email
  FROM auth.users au
  WHERE lower(au.email) = normalized_email
  LIMIT 1;

  IF found_user_id IS NOT NULL THEN
    user_id := found_user_id;
    user_email := found_user_email;
    RETURN NEXT;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

-- ── 3. seo.fn_upsert_keyword — the same gate, the same blind spot ───────────
create or replace function seo.fn_upsert_keyword(p_phrase text, p_language text default 'en'::text, out o_id uuid, out o_created boolean)
 returns record
 language plpgsql
 security definer
 set search_path to 'seo', 'public'
as $function$
declare
  v_norm text := seo.fn_normalize_phrase(p_phrase);
begin
  -- 🚨 THE GATE (DD-169 batch 3, amended 2026-09-13). This writes the shared
  -- keyword vocabulary every site reads. It is signed-in work — or the server's
  -- own work: aidream's keyword intake calls it over a direct connection with no
  -- auth.uid() at all.
  if auth.uid() is null and not iam.is_trusted_backend() then
    raise exception 'seo_keyword_no_caller: sign in to add a keyword'
      using errcode = '42501';
  end if;

  o_created := false;

  -- Exact identity first.
  select id into o_id from seo.keyword
  where normalized_phrase = v_norm and language = p_language and deleted_at is null;
  if o_id is not null then
    return;
  end if;

  if p_language = 'und' then
    select id into o_id from seo.keyword
    where normalized_phrase = v_norm and deleted_at is null
    order by (language = 'und'), created_at
    limit 1;
    if o_id is not null then
      return;
    end if;
  else
    begin
      update seo.keyword
      set language = p_language, updated_at = now()
      where normalized_phrase = v_norm and language = 'und' and deleted_at is null
      returning id into o_id;
    exception when unique_violation then
      o_id := null;
    end;
    if o_id is not null then
      return;
    end if;
  end if;

  insert into seo.keyword (phrase, normalized_phrase, language)
  values (btrim(p_phrase), v_norm, p_language)
  on conflict (normalized_phrase, language) do nothing
  returning id into o_id;
  o_created := o_id is not null;
  if o_id is null then
    select id into o_id from seo.keyword
    where normalized_phrase = v_norm and language = p_language;
  end if;
end;
$function$;

-- ── 4. The two doors re-declare the gate they now carry ─────────────────────
update platform.client_callable_door
   set gate_predicate = 'auth.uid() IS NULL AND NOT iam.is_trusted_backend()',
       reason = 'Signed-in door (DD-169 batch 3, amended 2026-09-13). Resolves an email to a user id so a person can be invited or shared with by email. Gated: refuses an unauthenticated WEB caller itself (42501); the server itself (service-role JWT or a direct connection) is admitted through iam.is_trusted_backend(), because the agent-feedback service account is resolved here with no end-user session.'
 where schema_name = 'public'
   and function_name = 'lookup_user_by_email'
   and identity_args = 'lookup_email text';

update platform.client_callable_door
   set gate_predicate = 'seo_keyword_no_caller',
       reason = 'Signed-in door (DD-169 batch 3, amended 2026-09-13). Mints or adopts a row in the shared keyword vocabulary. Gated: refuses an unauthenticated WEB caller (42501); aidream''s keyword intake reaches it over a direct connection and is admitted through iam.is_trusted_backend().'
 where schema_name = 'seo'
   and function_name = 'fn_upsert_keyword'
   and identity_args = 'p_phrase text, p_language text, OUT o_id uuid, OUT o_created boolean';

-- ── 5. Proofs, in the same transaction as the change ────────────────────────
do $$
declare
  v_src text;
  v_doors int;
begin
  -- a) The helper exists and answers TRUE on this connection (the migration
  --    runner IS a direct connection — exactly the caller class that was refused).
  if not iam.is_trusted_backend() then
    raise exception 'dd169 backend callers: iam.is_trusted_backend() is false on a direct migration connection — the predicate does not recognise the server';
  end if;

  -- b) Both gates now carry the exemption.
  for v_src in
    select p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (('public','lookup_user_by_email'), ('seo','fn_upsert_keyword'))
  loop
    if position('is_trusted_backend' in v_src) = 0 then
      raise exception 'dd169 backend callers: a gated body is missing the trusted-backend exemption';
    end if;
    if position('auth.uid()' in v_src) = 0 then
      raise exception 'dd169 backend callers: a gated body lost its signed-in gate entirely';
    end if;
  end loop;

  -- c) The declarations still match their bodies (what D6 asserts).
  select count(*) into v_doors
    from platform.client_callable_door d
    join pg_proc p on p.proname = d.function_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = d.schema_name
   where (d.schema_name, d.function_name) in (('public','lookup_user_by_email'), ('seo','fn_upsert_keyword'))
     and pg_get_function_identity_arguments(p.oid) = d.identity_args
     and d.gate_predicate is not null
     and strpos(lower(pg_get_functiondef(p.oid)), lower(d.gate_predicate)) > 0;
  if v_doors <> 2 then
    raise exception 'dd169 backend callers: expected 2 doors whose declared gate_predicate is present in the live body, found %', v_doors;
  end if;
end $$;
