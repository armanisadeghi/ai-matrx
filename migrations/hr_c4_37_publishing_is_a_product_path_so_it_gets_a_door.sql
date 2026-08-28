-- HR domain C4 — migration 37 (register item HRB-008; the coordinator's addendum to D283, which
-- asked the intent-owner to decide door-vs-repoint for the last two client-reachable helpers).
--
-- 🚨 TWO GRANTS WERE HELD OPEN BY MY OWN PROOF FILES, NOT BY THE PRODUCT.
--
-- The check-33 campaign's final batch stalled on two `hr.*` functions that only PROOF code called
-- as a client role. Two functions, two different answers — because the question is not "can the
-- proof be repointed" but "is this a thing a PERSON does".
--
-- ===================================================================================
-- DECISION 1 — `hr.wf_publish_definition` IS A PRODUCT PATH, SO IT GETS A DOOR.
--
-- The function itself settles it. It resolves `auth.uid()`, checks a capability, and refuses like
-- this:
--
--     hr._governance_refusal(d.organization_id, 'hr_workflow_definition', 'no_publish_authority',
--       'publishing a routing definition needs HR administration standing', …)
--
-- 🚨 A SENTENCE WRITTEN FOR A HUMAN READER IS THE TELL. Platform machinery does not need to be told
-- it lacks "HR administration standing" — machinery runs as the owner with a null `auth.uid()` and
-- skips that branch entirely. This gate exists because somebody expected a signed-in HR
-- administrator to reach this function and to be refused in words they could act on. That is a
-- product path with no door in front of it, and the proof was reaching the inner directly because
-- the door had never been built — the same "reaching past the door" shape found in `hrb008_proof`
-- (four `hr.pay_period_transition` sites) and in the D283 visibility proof (`hr.wf_instance`).
--
-- Org overrides of routing definitions are named in SPEC-WORKFLOW-ENGINE §9.1, which the very
-- assertion using this function proves ("an org definition setting `allows_self` is refused at
-- publish time"). The door is thin and adds nothing: the gate already lives in the inner, which is
-- where every other workflow gate lives (hr_c4_35 RD 4).
--
-- DECISION 2 — `hr.wf_pending` GETS NO DOOR, AND THE PROOF KEEPS ITS COVERAGE ANYWAY.
--
-- `hr.wf_pending` is the QUEUE OF RECORD that `public.hr_wf_inbox` decorates. `hrb022_proof`'s B5
-- assertion — *"the door's needs_my_decision step ids are EXACTLY hr.wf_pending's; it adds fields,
-- it never adds or drops rows"* — compares the door against that queue FOR THE SAME CALLER, so
-- running it as the owner would have compared two different people and silently stopped proving
-- anything. The SQL lane was right to refuse that trade.
--
-- But the grant was never what the assertion needed. `hr.wf_pending` scopes on `auth.uid()`, which
-- reads `request.jwt.claims` — a GUC, NOT the database role. So the proof now calls it under the
-- owner role with BOB'S CLAIMS still set: identical caller-scoping, identically exercised, no
-- client-role EXECUTE grant. Building a second public surface that returns the same rows
-- undecorated would have been a duplicate product surface invented to satisfy a test.
--
-- 🚨 NOTED, NOT SILENTLY CHANGED: the publish gate checks `hr.capability(v_uid, 'workflow.cancel',
-- …)`, not a publish-shaped capability. That reads like a copy-paste, but which capability governs
-- publishing is a SPEC question, not a migration's to decide, so the door is built over the gate as
-- it stands and the observation is reported rather than "fixed" underneath the spec.
--
-- ===================================================================================
-- WHAT THIS HANDS THE SQL LANE. With this migration and hr_c4_36, all three remaining
-- client-reachable workflow helpers are free to revoke BY NAME:
--     hr.wf_for_target          (freed by hr_c4_36 — its door now gates)
--     hr.wf_publish_definition  (freed here — its door now exists)
--     hr.wf_pending             (freed here — its only client caller was a proof, now impersonating)
-- The revoke stays OUT of this file, for the same reason hr_c4_35 kept it out: if something is
-- still relying on a grant, doing both at once makes the failure impossible to attribute.
--
-- Authority: the coordinator's addendum (2026-08-28); SPEC-WORKFLOW-ENGINE §9.1; SPEC-ACCESS law 2.
-- Applied live as `hr_c4_37_publishing_is_a_product_path_so_it_gets_a_door`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

-- ============================================================ 1. the thin door (DECISION 1)
create or replace function public.hr_wf_publish_definition(p_definition_id uuid)
returns jsonb
language sql
security definer
set search_path to 'hr', 'public'
as $fn$ select hr.wf_publish_definition(p_definition_id) $fn$;

revoke all on function public.hr_wf_publish_definition(uuid) from public;
revoke all on function public.hr_wf_publish_definition(uuid) from anon;
grant execute on function public.hr_wf_publish_definition(uuid) to authenticated;

comment on function public.hr_wf_publish_definition is
  'Publish a draft workflow routing definition. Thin pass-through of hr.wf_publish_definition, which holds the gate (auth.uid() + capability, refusing with "publishing a routing definition needs HR administration standing"). Built by hr_c4_37 because that refusal sentence proves a person was always expected to reach this — the path existed with no door, and proof code was calling the inner directly. SPEC-WORKFLOW-ENGINE §9.1 org overrides.';

-- ============================================================ 2. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_37';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('public', 'hr_wf_publish_definition', 'hr_c4_37',
   array['hr.wf_publish_definition('], '{}', true,
   'hr_c4_37: the door for a product path that had none. It must stay SECURITY DEFINER — as INVOKER it would re-impose an authenticated EXECUTE grant on hr.wf_publish_definition, which is one of the last three helpers of the check-33 campaign — and it must keep delegating, because the gate lives in the inner and a door that stops delegating is a door whose gate has moved somewhere nobody reviewed.'),
  ('hr', 'wf_publish_definition', 'hr_c4_37',
   array['auth.uid()', 'no_publish_authority', 'hr.capability('], '{}', true,
   'hr_c4_37: THE GATE, and the evidence this is a product path rather than machinery. The auth.uid()-derived capability check and its human-readable refusal ("publishing a routing definition needs HR administration standing") are why a door was built instead of repointing the proof to the owner. Deleting the gate leaves public.hr_wf_publish_definition running as the owner with nothing in front of it — every authenticated caller able to publish routing for any organization. NOTE: the capability checked is workflow.cancel, which reads like a copy-paste; that is a SPEC question, reported not silently changed.');
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare v_acl text; v_bad integer; v_res jsonb; v_out jsonb; v_def uuid;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'hr_wf_publish_definition'
                    and p.prosecdef
                    and array_to_string(p.proconfig, ',') like '%search_path%') then
    raise exception 'hr_c4_37: the door is missing, not SECURITY DEFINER, or has no pinned search_path';
  end if;
  select p.proacl::text into v_acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_wf_publish_definition';
  if v_acl is null or v_acl not like '%authenticated=X%' or v_acl like '%anon=X%'
     or v_acl like '%{=X/%' or v_acl like '%,=X/%' then
    raise exception 'hr_c4_37: door ACL is wrong: %', v_acl;
  end if;

  -- 🚨 THE DOOR IS EXECUTED, NOT GREPPED. It must return an ENVELOPE for a definition that does not
  -- exist, never raise — SPEC-ACCESS §4.1. (hr_c4_30's lesson: a post-condition that can only read
  -- itself is not a post-condition.)
  v_out := public.hr_wf_publish_definition('00000000-0000-0000-0000-000000000000'::uuid);
  if coalesce((v_out ->> 'granted')::boolean, true) or v_out ->> 'reason' <> 'not_found' then
    raise exception 'hr_c4_37: the door did not return a not_found envelope: %', v_out;
  end if;

  -- and a real DRAFT is still refused/accepted by the INNER's own gate, not by the door
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_publish_definition') !~ 'no_publish_authority' then
    raise exception 'hr_c4_37: the publish gate is gone from the inner';
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_37: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_37: % function contract(s) broken', v_bad;
  end if;
  raise notice 'hr_c4_37: publishing has a door; wf_for_target, wf_publish_definition and wf_pending are free to revoke';
end $$;
