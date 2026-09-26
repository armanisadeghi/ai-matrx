-- chair-step: REVOKEs client EXECUTE on seven per-person functions no client, policy or server-as-person path calls (catalog only, no table lock); patches six function bodies to answer a client only about the signed-in person.
-- based-on: public.dict_assert_access(uuid, text, uuid) 2c69b3ebdd918198e0623ec10816b13fb9a6541b46e9b301a41f48472974d4dc
-- based-on: public.dict_resolve_for(uuid, boolean, boolean, uuid[], uuid[], uuid[]) 2e23e8f49b307aa961ec8d529929fdb914cff999c50ed64a9a724f53501a8fbe
-- based-on: public.dict_list_owners_for(uuid) 4a8c384a043770701d7273a032525bb42e19e9fc2cc232ceff767b12cb6f06d2
-- based-on: billing.resolve_capability(uuid, text, uuid) 19f71008f0b4d95ec9b15ff2e01d9524f8db8b5f43335c0cdf79cf21312cedf5
-- based-on: billing.resolve_tier(uuid) 3daa50bf0105070546548d4ff57b1d385f9c1466e77c1fdc79c8157c699f2735
-- based-on: public.can_curate_library_document(uuid, uuid) c0b3170931ea1a3be88f2622b0cb7b08c95b87eb8daddd7a53932e0745f020c7
--
-- RC-A2 round 4, O1 (register row RC-A2). A PER-PERSON FUNCTION NEVER ANSWERS A CLIENT ABOUT
-- SOMEBODY ELSE.
--
-- The hole: platform.detail_parent_access_for(p_user, type, id, level) — the one rule's per-person
-- form, which the kernel and the comment doors call from SECURITY DEFINER code — was EXECUTE-able
-- by `authenticated`, so any signed-in person could ask "can <another named person> open <record>?"
-- (verifier: test@test.com asking about admin@admin.com's personal note 0436a460… got true).
--
-- Census (every function in a PostgREST-exposed schema that anon/authenticated may execute and that
-- takes a person as an input argument: 152 on 2026-09-26; 86 not statically bound to the caller).
-- Two shapes were oracles:
--   1. per-person forms NOTHING on the client side calls — no client code, no policy, no SECURITY
--      INVOKER client-callable caller, no server path that runs as the person (aidream's
--      acting_as_user runs as `authenticated`): REVOKED from anon/authenticated/authenticator/PUBLIC.
--      Their callers are SECURITY DEFINER (they run as the owner) or the server's own connection.
--        platform.detail_parent_access_for   the one rule, per person (the caller-only form
--                                            platform.detail_parent_access stays callable)
--        public.fn_get_user_usage_snapshot    another person's spend windows
--        public.cx_canvas_list_by_user        another person's canvas list (invoker; dead door)
--        iam.entity_read_equivalence          SETS request.jwt.claims.sub := p_user and evaluates a
--                                             caller-supplied SQL expression over any table — read
--                                             as anybody. A certifier diagnostic, never a door.
--        iam.privacy_wall_read_lane_parity    its batch driver (reads as the first platform admin)
--        iam.access_resolver_disagreements    same shape: stands as probe users, returns their reach
--        iam.component_wider_than_parent      same shape: stands as p_principals, SET role back to
--                                             postgres at the end
--   2. per-person forms the SERVER calls as the person (dictionary injection runs under
--      acting_as_user; the entitlement and library services use the same pool), so a REVOKE would
--      break the server: they now ask iam.asks_about_caller(person, name) first. A client (PostgREST:
--      session_user authenticator, not a service_role JWT — iam.is_trusted_backend()) may ask only
--      about the signed-in person; the server connection and SECURITY DEFINER callers that pass
--      auth.uid() are unchanged.
--        public.dict_assert_access            the gate every dict_*_for asks (it checked p_user's
--                                             admin row, so a client passing an admin's id passed it)
--        public.dict_resolve_for, public.dict_list_owners_for   (they do not ask the gate)
--        billing.resolve_capability(uuid,text,uuid)             (the 2-arg form delegates to it)
--        billing.resolve_tier(uuid)                             (resolve_effective_tier asks it)
--        public.can_curate_library_document                     (answered "is <person> a super
--                                             admin / an industry curator"; a CASE, so the ask runs
--                                             first)
-- Every other unbound person-argument function is classified, with its reason, in the guard test's
-- allowlist; a new one fails the guard until somebody classifies it.
-- Forcing suite: aidream db/tests/test_rca2i_per_person_functions_answer_only_about_the_caller.py.
-- Inverse (rehearsal only): migrations/inverse/rca2i_per_person_functions_answer_only_about_the_caller_down.sql

set local lock_timeout = '2s';

-- ── the primitive ───────────────────────────────────────────────────────────────────────────────
create or replace function iam.asks_about_caller(p_user uuid, p_function text default null)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  -- A client may ask a per-person function only about the signed-in person. The server's own
  -- connection (aidream, acting_as_user included) and a service_role JWT are the trusted backend
  -- and may name anybody. SECURITY INVOKER on purpose: it reads the caller's own session.
  if not iam.is_trusted_backend() and p_user is distinct from (select auth.uid()) then
    raise exception '% answers a client only about the signed-in person', coalesce(p_function, 'this function')
      using errcode = '42501',
            hint = 'Call the caller-only form (the one without a person argument); the AI Matrx server may ask about anybody.';
  end if;
  return true;
end;
$fn$;

comment on function iam.asks_about_caller(uuid, text) is
  'RC-A2i: the guard every per-person function a client can reach asks first. true, or 42501 when a client (not iam.is_trusted_backend()) names somebody other than auth.uid().';

-- authenticated only: a signed-out caller reaches no per-person function, so anon needs no guard.
grant execute on function iam.asks_about_caller(uuid, text) to authenticated;

-- ── 1. per-person forms no client path needs: server-side only ─────────────────────────────────
revoke execute on function platform.detail_parent_access_for(uuid, text, uuid, public.permission_level) from public, anon, authenticated, authenticator;
revoke execute on function public.fn_get_user_usage_snapshot(uuid) from public, anon, authenticated, authenticator;
revoke execute on function public.cx_canvas_list_by_user(uuid, text, boolean, text, integer, integer) from public, anon, authenticated, authenticator;
revoke execute on function iam.entity_read_equivalence(text, text, text, uuid, integer, text) from public, anon, authenticated, authenticator;
revoke execute on function iam.privacy_wall_read_lane_parity(integer) from public, anon, authenticated, authenticator;
revoke execute on function iam.access_resolver_disagreements(integer, text, integer) from public, anon, authenticated, authenticator;
revoke execute on function iam.component_wider_than_parent(uuid[], text) from public, anon, authenticated, authenticator;

-- ── 2. per-person forms the server calls as the person: ask about the caller first ─────────────
do $patch$
declare
  v_def text;
  v_fn text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, 'public.dict_assert_access(uuid,text,uuid)', 1,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
$a$,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_assert_access');
$a$),
      (2, 'public.dict_resolve_for(uuid,boolean,boolean,uuid[],uuid[],uuid[])', 1,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
$a$,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_resolve_for');
$a$),
      (3, 'public.dict_list_owners_for(uuid)', 1,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
$a$,
       $a$RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_list_owners_for');
$a$),
      (4, 'billing.resolve_capability(uuid,text,uuid)', 1,
       E'\nbegin\n',
       E'\nbegin\n  perform iam.asks_about_caller(p_user, ''billing.resolve_capability'');\n'),
      (5, 'billing.resolve_tier(uuid)', 1,
       E'\nbegin\n',
       E'\nbegin\n  perform iam.asks_about_caller(p_user, ''billing.resolve_tier'');\n'),
      (6, 'public.can_curate_library_document(uuid,uuid)', 1,
       E'  select public.is_super_admin_user(p_user)\n      or exists (\n',
       E'  select case when iam.asks_about_caller(p_user, ''public.can_curate_library_document'')\n  then (public.is_super_admin_user(p_user)\n      or exists (\n'),
      (7, 'public.can_curate_library_document(uuid,uuid)', 1,
       E'            and pd.deleted_at is null\n      );\n',
       E'            and pd.deleted_at is null\n      ))\n  end;\n')
    ) as t(ord, fn, expected, anchor, repl)
    order by ord
  loop
    -- one function's anchors are applied together and the function is replaced ONCE, so a body is
    -- never executed half-edited
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2i patch %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
