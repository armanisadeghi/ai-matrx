-- THE EARNING-CODE RESOLVER WAS NOT THE ONLY DEAD DOOR — IT WAS JUST THE FIRST ONE REACHED.
--
-- `hr_l1_73` restored `hr._earning_code_id` and the very next `POST /hr/calc/overtime` failed
-- one statement later on `permission denied for function jurisdiction_evaluate`. A live census
-- of every `hr.*` function aidream calls, checked against `has_function_privilege('authenticated',
-- …)`, then found the whole shape: THREE more functions on the time engine's HTTP path are
-- unreachable to `authenticated`, and every one of them is called from inside
-- `acting_as_user(ctx)`.
--
-- | function                          | ACL before             | called from                          |
-- |-----------------------------------|------------------------|--------------------------------------|
-- | `hr.jurisdiction_evaluate(8)`     | `{postgres=X}`         | `time/jurisdiction.py` `evaluate()`  |
-- | `hr.resolve_rules(7)`             | `{postgres=X}`         | `time/jurisdiction.py` `resolve()`   |
-- | `hr.write_calculation_snapshot(19)`| `{postgres=X}`        | `time/jurisdiction.py` `write_snapshot()` |
--
-- The class is NOT "underscore-prefixed helpers": `jurisdiction_evaluate`, `resolve_rules` and
-- `write_calculation_snapshot` carry no underscore and were missed by a name-shaped sweep. The
-- class is **any `hr.*` function aidream calls while the connection role is `authenticated`**,
-- and the only reliable way to enumerate it is the live ACL, not the identifier.
--
-- WHY DOORS RATHER THAN GRANTS ON THE INNER FUNCTIONS: the campaign's rule stands — the `hr`
-- schema is not exposed to PostgREST and its functions are not client doors. A door is a thin
-- `public.hr_<name>` delegate carrying no logic (TD-1 / R-L3 U-03).
--
-- 🚨 WHAT THIS DELIBERATELY DOES **NOT** DECIDE, AND WHO OWNS IT. Two of these three are reads;
-- `hr_write_calculation_snapshot` is a WRITE with no authorization of its own, so granting it to
-- `authenticated` lets any signed-in user post a calculation snapshot through PostgREST. That is
-- not a new posture — `public.hr_recompute_apply` is already an `authenticated` door and writes
-- the paid intervals themselves, which is strictly more powerful — so this migration matches the
-- posture the engine already runs on rather than inventing a different one. But the real question
-- underneath is architectural and belongs to the definer-grant campaign lead, not to a
-- restoration lane: **the time engine's HTTP lane does engine work as `authenticated` AFTER its
-- own `hr.capability()` gate has already passed.** Every other engine in this domain (leave
-- carryover, the exports engine, `hr._record_access_audit`) runs its post-gate work on the
-- PRIVILEGED connection and says so in its docstring. If the time engine did the same, none of
-- these five doors would need to exist and the class could not recur. That change removes RLS
-- from the engine's reads and is a deliberate security decision — filed, not taken here.
--
-- STILL DEAD AFTER THIS MIGRATION, deliberately (E-12 `POST /hr/time/exceptions/scan`, also
-- inside `acting_as_user`): `hr._punch_raise_exception(9)` and `hr.punch_orphan_sweep(2)`, both
-- `{postgres=X}`. `_punch_raise_exception` takes `organization_id` and `employment_id` as plain
-- arguments and checks nothing, so a door on it would let any signed-in user fabricate an
-- attendance exception against any employment in any tenant. It needs either a gated door or the
-- privileged-connection move above — a judgement call, not a restoration. Filed with the census.
--
-- §6d-4: each door is declared in `platform.client_callable_door` BEFORE its grant, or the
-- `ddl_command_end` guard re-revokes the grant inside the GRANT statement and nothing errors.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason)
values
  ('public', 'hr_jurisdiction_evaluate',
   'p_kind text, p_jurisdiction_key text, p_as_of date, p_facts jsonb, p_input jsonb, '
   'p_organization_id uuid, p_subject_type text, p_subject_id uuid',
   'READ. The time engine''s rule answer for a non-consequential projection (E-55) and the '
   'first step of every authoritative calculation. Writes nothing and snapshots nothing; the '
   'engine calls it as `authenticated` after its own hr.capability() gate.'),
  ('public', 'hr_resolve_rules_for_subject',
   'p_subject_type text, p_subject_id uuid, p_as_of date, p_classes text[], p_facts jsonb, '
   'p_organization_id uuid, p_jurisdiction_key text',
   'READ. The §2.6 resolution result including the full trace, for one SUBJECT — distinct from '
   'the existing public.hr_resolve_rules(uuid,text,date,text[]) display door, which delegates to '
   'hr.resolve_rules_display and answers a different question. Writes no snapshot.'),
  ('public', 'hr_write_calculation_snapshot',
   'p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_calculation_kind text, '
   'p_jurisdiction_key text, p_as_of date, p_engine_key text, p_engine_version text, '
   'p_resolution jsonb, p_applicability_facts jsonb, p_inputs jsonb, p_outputs jsonb, '
   'p_actor_type text, p_actor_id uuid, p_employment_id uuid, p_clamps jsonb, '
   'p_prospective boolean, p_supersedes_id uuid, p_recalculation_batch_id uuid',
   'ENGINE WRITE, on the same posture as the already-granted public.hr_recompute_apply: the '
   'time engine freezes the evidence behind a figure from its HTTP lane, which runs as '
   '`authenticated`. It carries no authorization of its own — see the header note; whether this '
   'lane should instead run privileged is the campaign lead''s call, filed not taken.')
on conflict (schema_name, function_name, identity_args) do nothing;

create or replace function public.hr_jurisdiction_evaluate(
  p_kind text,
  p_jurisdiction_key text,
  p_as_of date,
  p_facts jsonb,
  p_input jsonb,
  p_organization_id uuid,
  p_subject_type text default null,
  p_subject_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select hr.jurisdiction_evaluate(
    p_kind, p_jurisdiction_key, p_as_of, p_facts, p_input,
    p_organization_id, p_subject_type, p_subject_id
  );
$function$;

create or replace function public.hr_resolve_rules_for_subject(
  p_subject_type text,
  p_subject_id uuid,
  p_as_of date,
  p_classes text[],
  p_facts jsonb,
  p_organization_id uuid,
  p_jurisdiction_key text default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select hr.resolve_rules(
    p_subject_type, p_subject_id, p_as_of, p_classes, p_facts,
    p_organization_id, p_jurisdiction_key
  );
$function$;

create or replace function public.hr_write_calculation_snapshot(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_calculation_kind text,
  p_jurisdiction_key text,
  p_as_of date,
  p_engine_key text,
  p_engine_version text,
  p_resolution jsonb,
  p_applicability_facts jsonb,
  p_inputs jsonb,
  p_outputs jsonb,
  p_actor_type text,
  p_actor_id uuid default null,
  p_employment_id uuid default null,
  p_clamps jsonb default null,
  p_prospective boolean default false,
  p_supersedes_id uuid default null,
  p_recalculation_batch_id uuid default null
)
returns uuid
language sql
volatile
security definer
set search_path to 'hr', 'public'
as $function$
  select hr.write_calculation_snapshot(
    p_organization_id, p_subject_type, p_subject_id, p_calculation_kind, p_jurisdiction_key,
    p_as_of, p_engine_key, p_engine_version, p_resolution, p_applicability_facts, p_inputs,
    p_outputs, p_actor_type, p_actor_id, p_employment_id, p_clamps, p_prospective,
    p_supersedes_id, p_recalculation_batch_id
  );
$function$;

comment on function public.hr_jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid) is
  'PostgREST-reachable wrapper for hr.jurisdiction_evaluate. Thin delegate, no logic (TD-1 / '
  'R-L3 U-03). `anon` holds nothing. Declared per db-rules §6d-4.';
comment on function public.hr_resolve_rules_for_subject(text,uuid,date,text[],jsonb,uuid,text) is
  'PostgREST-reachable wrapper for hr.resolve_rules (the per-subject 7-arg form). NOT the same '
  'question as public.hr_resolve_rules(uuid,text,date,text[]), which is the display door over '
  'hr.resolve_rules_display. Thin delegate, no logic. `anon` holds nothing.';
comment on function public.hr_write_calculation_snapshot(uuid,text,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,jsonb,boolean,uuid,uuid) is
  'PostgREST-reachable wrapper for hr.write_calculation_snapshot. Thin delegate, no logic. Same '
  'posture as public.hr_recompute_apply: an engine write reachable from the engine''s HTTP lane, '
  'carrying no authorization of its own. `anon` holds nothing.';

revoke all on function public.hr_jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)
  from public, anon;
revoke all on function public.hr_resolve_rules_for_subject(text,uuid,date,text[],jsonb,uuid,text)
  from public, anon;
revoke all on function public.hr_write_calculation_snapshot(uuid,text,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,jsonb,boolean,uuid,uuid)
  from public, anon;

grant execute on function public.hr_jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)
  to authenticated, service_role;
grant execute on function public.hr_resolve_rules_for_subject(text,uuid,date,text[],jsonb,uuid,text)
  to authenticated, service_role;
grant execute on function public.hr_write_calculation_snapshot(uuid,text,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,jsonb,boolean,uuid,uuid)
  to authenticated, service_role;

-- PROOF (run after applying; the three doors true, the three inner functions still false):
--   select has_function_privilege('authenticated','public.hr_jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)','EXECUTE');
--   select has_function_privilege('authenticated','hr.jurisdiction_evaluate(text,text,date,jsonb,jsonb,uuid,text,uuid)','EXECUTE');
