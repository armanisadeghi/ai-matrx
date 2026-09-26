-- based-on: platform.knob_resolve_uncached(text, text, uuid, uuid, jsonb) f73bfd925e951f10a21cb6fe5f76bc4e74b9609269d120d1278a0e7b4f5a8e31
-- based-on: platform.knob_history(text, text, uuid, text, uuid, integer) 766c4984d36220ddad12a8a66d6e093400c679678e9c801a6bacf2d80efbc4a9
--
-- RC-A8 Q1 (register row RC-A8; chair ruling 2026-09-26, access is personal). A PERSON'S PERSONAL
-- SETTINGS RESOLVE ONLY FOR THAT PERSON — and for the server acting as them. Anybody else asking gets
-- the organization and platform layers, never the personal layer.
--
-- The hole: platform.knob_snapshot / platform.knob_resolve, asked by any co-member of an organization
-- to resolve "for" another person, answered with that person's `user` rung — measured on production
-- 2026-09-26 through the REST seat as test@test.com naming admin@admin.com: 3 settings leaked
-- (media.listening.voice, agents.model_prefs.chat_default_model, agent_authoring_default_model).
-- knob_snapshot's guard was iam.may_address_user_in_org, true for anyone sharing an organization;
-- knob_resolve had none. And platform.knob_history let an organization's owner/admin read a member's
-- personal-setting history (its org-admin arm).
--
-- The fix is at the ONE resolver every reader goes through (knob_resolve → knob_resolve_uncached;
-- knob_snapshot calls knob_resolve per key; knob_index already refuses a user rung that is not the
-- caller's outside the platform admin lane):
--   * platform.knob_person_for(p_user) — the user rung this caller may stand on: the named person when
--     it is the caller, or when the trusted backend asks (the server, acting_as_user included); NULL
--     otherwise, so the resolve falls through to the organization/platform layers;
--   * the resolver's `user` rung reads platform.knob_person_for(p_user_id), and a p_scopes entry can
--     never stand in for the `user` rung (the rung has its own parameter);
--   * platform.knob_history: another person's `user` rung (single-rung view and the per-org feed) only
--     for the trusted backend or a platform admin in the admin lane — never an organization's admin.
-- The table door (platform.knob_override / knob_override_audit RLS, which hands a co-member the
-- stored `user` rows themselves) is rca8b — a chair step (policy DDL).
-- Forcing suite: aidream db/tests/test_rca8_personal_settings_are_personal.py (REST seat + SQL seat).
-- Inverse (rehearsal only): migrations/inverse/rca8a_personal_settings_resolve_only_for_their_person_down.sql

set local lock_timeout = '2s';

create or replace function platform.knob_person_for(p_user uuid)
returns uuid
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- RC-A8: the user rung a caller may stand on. SECURITY INVOKER on purpose: it reads the caller's
  -- own session (auth.uid(), iam.is_trusted_backend()), also when called inside a SECURITY DEFINER.
  select case when p_user is not null
               and (iam.is_trusted_backend() or p_user = (select auth.uid()))
              then p_user end;
$fn$;

comment on function platform.knob_person_for(uuid) is
  'RC-A8: the person whose personal (user-rung) settings a caller may resolve: themselves, or anybody for the trusted backend. NULL otherwise, so a resolve answers the organization and platform layers only.';

grant execute on function platform.knob_person_for(uuid) to authenticated;

do $patch$
declare
  v_def text;
  v_n int;
  r record;
  v_fn text := null;
begin
  for r in
    select * from (values
      (1, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 1,
       E'  v_offered numeric;\nbegin\n',
       E'  v_offered numeric;\n  -- RC-A8: the user rung is the caller''s own (or the server''s to name), never a colleague''s.\n  v_person uuid := platform.knob_person_for(p_user_id);\nbegin\n'),
      (2, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 2,
       $a$o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id$a$,
       $a$o.scope_kind = 'user' and v_person is not null and o.scope_id = v_person$a$),
      (3, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 2,
       $a$e ->> 'kind' = o.scope_kind$a$,
       $a$e ->> 'kind' = o.scope_kind and o.scope_kind <> 'user'$a$),
      (4, 'platform.knob_history(text,text,uuid,text,uuid,integer)', 1,
       $a$if v_kind = 'user' and p_scope_id is distinct from v_uid and not v_org_admin then$a$,
       $a$if v_kind = 'user' and p_scope_id is distinct from v_uid and not (v_backend or v_padmin) then  -- RC-A8: never an org admin$a$),
      (5, 'platform.knob_history(text,text,uuid,text,uuid,integer)', 1,
       $a$(a.scope_kind <> 'user' or v_org_admin or a.scope_id = v_uid)$a$,
       $a$(a.scope_kind <> 'user' or v_backend or v_padmin or a.scope_id = v_uid)$a$)
    ) as t(ord, fn, expected, anchor, repl)
    order by ord
  loop
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca8a patch %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
