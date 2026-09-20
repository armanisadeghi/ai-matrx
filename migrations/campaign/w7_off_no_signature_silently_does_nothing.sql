-- chair-step: closes the door rather than leaving a safe path beside an unsafe one. Adding p_acting_user_id to platform.unified_data_ramp_set created a SECOND overload and left the old five-argument one — the silent no-op this lane just fixed — alive beside it, matched exactly by any five-argument call. A DROP of a function is off every allow-list, so the overload is instead REPLACED with a body that delegates to the six-argument one and therefore raises the same clear refusal. There is now no arity that can switch a consumer and write nothing.
-- based-on: platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) a98096f156c0468aa298aa26a1a9d6ac4620345892859e629a8bca07ade17e05

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function platform.unified_data_ramp_set(
  p_consumer        text,
  p_organization_id uuid,
  p_on              boolean,
  p_user_id         uuid default null,
  p_note            text  default null
)
returns campaign_watch.ramp_gate_run
language sql
volatile
security definer
set search_path to ''
as $fn$
  -- One line, and it is a delegation, not a copy. auth.uid() is null on the
  -- server lane that is the only lawful caller, so this arity now raises
  -- "no acting user" instead of running the gate and discarding the write.
  select platform.unified_data_ramp_set(p_consumer, p_organization_id, p_on, p_user_id, p_note, auth.uid());
$fn$;
