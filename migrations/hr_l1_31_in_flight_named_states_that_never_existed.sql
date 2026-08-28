-- hr_l1_31_in_flight_named_states_that_never_existed.sql
--
-- The deepest cause of T-L1-9 clause 2's missing pending state, and the one that made
-- every other explanation look plausible.
--
-- `hr_pending_changes` filtered its `in_flight` list with
--     wi.state in ('draft','submitted','in_review','conflict')
-- and `hr.workflow_instance` has NEVER held any of those four values. Its vocabulary is
-- ('active','closed','failed','cancelled') — verified by counting the live table — and
-- `hr.wf_request` creates every request as 'active'.
--
-- So `in_flight` was ALWAYS `[]`, for every flow and every person, since the door was
-- written. It never errored, never warned, and returned a perfectly well-formed empty
-- array that reads exactly like "nothing is pending". A self-service edit therefore
-- vanished even when everything upstream worked: the request really was opened, the
-- approver really was waiting, and the field fell back to its stored value because the
-- one door that could have said otherwise answered with nothing.
--
-- A closed vocabulary invented rather than read is not a narrower filter, it is an
-- empty one — and an empty list is the most convincing lie a door can tell.
--
-- Proven live after the fix, for a subject with two open requests:
--   in_flight → [{address_change, active, payload.patch:{home_address:{…}}},
--                {profile_edit_request, active, payload.patch:{legal_first_name:"Tomás"}}]
--
-- Applied live 2026-08-27 and ledgered.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_pending_changes(uuid)'::regprocedure);
  if position('THE STATES THIS FILTER NAMED DO NOT EXIST' in v_def) > 0 then
    raise notice 'hr_l1_31: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$       and wi.state in ('draft','submitted','in_review','conflict')$a1$,
$r1$       -- 🚨 THE STATES THIS FILTER NAMED DO NOT EXIST.
       -- It asked for four states that `hr.workflow_instance` has never held; the table's
       -- vocabulary is ('active','closed','failed','cancelled'), and `hr.wf_request`
       -- creates every request as 'active'. So `in_flight` was ALWAYS an empty array, for
       -- every flow and every person, and it looked exactly like "nothing is pending".
       -- That is what made a self-service edit vanish: the request really was opened, the
       -- approver really was waiting, and the field went back to showing its old value
       -- because the one door that could have said otherwise answered with [].
       -- A closed vocabulary invented rather than read is not a narrower filter, it is an
       -- empty one — and an empty list is the most convincing lie a door can tell.
       and wi.state = 'active'$r1$);

  if v_new = v_def then raise exception 'hr_l1_31: state filter anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pending_changes';
  if v_src !~ 'THE STATES THIS FILTER NAMED DO NOT EXIST' then
    raise exception 'hr_l1_31: did not land'; end if;
  if v_src ~ 'wi\.state in \(' then
    raise exception 'hr_l1_31: the phantom state filter survived'; end if;
  if v_src !~ 'wi\.state = ''active''' then
    raise exception 'hr_l1_31: the active filter is missing'; end if;
end $verify$;
