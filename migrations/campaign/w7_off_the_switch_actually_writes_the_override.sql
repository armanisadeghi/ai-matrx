-- chair-step: replaces the body of this lane's own switch door, created hours ago and called by nothing outside the campaign. It cannot carry `-- guard: custom/code_paths_enabled` and read it, because the switch must be usable BEFORE the campaign is on — that is what a ramp is.
-- based-on: platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) a98096f156c0468aa298aa26a1a9d6ac4620345892859e629a8bca07ade17e05
--
-- W7-OFF — THE SWITCH ACTUALLY WRITES THE OVERRIDE, AND SAYS SO WHEN IT CANNOT.
--
-- THE DEFECT, CAUGHT ON THE MAIN DATABASE 2026-09-19 by reading the row back
-- instead of believing the call. `platform.unified_data_ramp_set` ran the gate,
-- got GREEN, called `platform.knob_override_set(...)` with `perform`, and
-- returned a green gate row to the screen. NOTHING WAS WRITTEN. That door does
-- not raise — it RETURNS `{"ok": false, "reason": "not_authenticated"}` when
-- `auth.uid()` is null, which it always is on a server lane holding the service
-- key. `perform` threw the answer away, so the screen would have shown a
-- consumer switched on, the knob would have resolved false, and every read path
-- would have gone on using the old table while the operator believed otherwise.
-- A switch that silently does nothing is the worst shape in this whole campaign.
--
-- THE FIX, in two halves:
--
--   1. THE IDENTITY GOES WITH THE CALL. The route has already established, from
--      the caller's OWN session, that they are a platform admin — so it passes
--      that user id in, and the door writes through
--      `platform._knob_override_write`, which is the SAME writer
--      `platform.knob_override_set` delegates to after its own gate. Same row,
--      same audit trigger, same actor stamped; the permission question is asked
--      once, where the identity exists, instead of twice with the second one
--      unanswerable. `platform.knob_write_door_for` is consulted first and its
--      refusal is honoured, so a key that belongs to a different door still
--      cannot be written here.
--   2. NOTHING IS TAKEN ON TRUST. The door re-reads the knob with
--      `platform.knob_resolve` after writing and RAISES if the answer is not
--      the one just asked for, naming what it wanted and what it got. The
--      screen can only show "switched on" when the database agrees.
--
-- p_acting_user_id is a new LAST argument with a default, so the signature is a
-- superset of the old one and nothing that called it before breaks.

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function platform.unified_data_ramp_set(
  p_consumer        text,
  p_organization_id uuid,
  p_on              boolean,
  p_user_id         uuid default null,
  p_note            text  default null,
  p_acting_user_id  uuid default null
)
returns campaign_watch.ramp_gate_run
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_consumer   campaign_watch.ramp_consumer%rowtype;
  v_gate       campaign_watch.ramp_gate_run%rowtype;
  v_actor      uuid := coalesce(p_acting_user_id, auth.uid());
  v_door       jsonb;
  v_written    jsonb;
  v_readback   jsonb;
  v_scope_kind text;
  v_scope_id   uuid;
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated
  -- and the only caller is the admin API route, which verifies the signed-in
  -- person is a platform admin from THEIR OWN session before it uses the
  -- service key — and then passes that person in as p_acting_user_id.
  if v_actor is null then
    raise exception 'platform.unified_data_ramp_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;

  select * into v_consumer from campaign_watch.ramp_consumer where consumer_id = p_consumer;
  if not found then
    raise exception 'platform.unified_data_ramp_set: "%" is not a consumer', p_consumer
      using errcode = 'P0001';
  end if;

  -- TURNING IT OFF IS NEVER GATED. A rollback that needs a green gate is not a
  -- rollback, and the one thing this screen must always be able to do is put a
  -- consumer back on the old store.
  if p_on then
    v_gate := campaign_watch.consumer_gate(p_consumer, p_organization_id, v_actor);
    if v_gate.verdict <> 'green' then
      raise exception 'platform.unified_data_ramp_set: refusing to switch "%" ON for organization % — its Test 1 gate is %. %',
        p_consumer, p_organization_id, v_gate.verdict, v_gate.why
        using errcode = 'P0001',
              hint = 'CUT-3: Test 1 gates each consumer''s switch. Fix what the verdict names and run the gate again; the switch is not a place to overrule it.';
    end if;
  end if;

  v_scope_kind := case when p_user_id is null then 'organization' else 'user' end;
  v_scope_id   := coalesce(p_user_id, p_organization_id);

  -- THE DOOR QUESTION IS STILL ASKED. A key whose namespace names a different
  -- write door is refused here, exactly as platform.knob_override_set refuses it.
  v_door := platform.knob_write_door_for('custom.' || v_consumer.knob_key);
  if (v_door ->> 'ok')::boolean
     and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
    raise exception 'platform.unified_data_ramp_set: custom.% is written through %, not through the ramp. That is where its own permission gate and its own audit trail live.',
      v_consumer.knob_key, v_door ->> 'set_door'
      using errcode = 'P0001';
  end if;

  v_written := platform._knob_override_write(
    'custom', v_consumer.knob_key, v_scope_kind, v_scope_id, p_organization_id,
    to_jsonb(p_on),
    coalesce(p_note, 'Unified-data ramp, switch screen, ' || (case when p_on then 'ON' else 'OFF' end)),
    v_actor);

  if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
    raise exception 'platform.unified_data_ramp_set: the override was NOT written for custom.% — the knob writer answered %. Nothing has changed and no consumer has moved.',
      v_consumer.knob_key, coalesce(v_written::text, 'null')
      using errcode = 'P0001',
            hint = 'This is the failure the switch used to swallow: platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looked exactly like success.';
  end if;

  -- READ IT BACK. The screen may only say "switched on" when the database agrees.
  v_readback := platform.knob_resolve('custom', v_consumer.knob_key, p_organization_id, p_user_id, null);
  if v_readback is distinct from to_jsonb(p_on) then
    raise exception 'platform.unified_data_ramp_set: wrote % for custom.% but platform.knob_resolve still answers % for organization %. The switch did not take.',
      to_jsonb(p_on), v_consumer.knob_key, coalesce(v_readback::text, 'null'), p_organization_id
      using errcode = 'P0001';
  end if;

  if p_on then
    return v_gate;
  end if;
  return campaign_watch.consumer_gate(p_consumer, p_organization_id, v_actor);
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'platform', 'unified_data_ramp_set', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes),
       'THE SWITCH. Turning a consumer on runs its Test 1 gate and refuses on anything but green; turning it off is never gated. p_organization_id names the organization switched, p_user_id an optional per-user rung inside it, p_acting_user_id the platform admin the caller has already verified — it is stamped as the override''s actor and is required, because auth.uid() is null on the only lane that may call this.',
       'W7-OFF', false, false,
       'server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. This is the function that switches a whole organization onto a different data store.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'platform'
 where p.proname = 'unified_data_ramp_set'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'platform' and c.function_name = 'unified_data_ramp_set'
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));
