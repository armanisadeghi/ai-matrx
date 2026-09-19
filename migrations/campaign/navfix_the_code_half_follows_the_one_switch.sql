-- NAV-FIX — THE CODE HALF FOLLOWS THE ONE SWITCH, AND CANNOT DISAGREE WITH IT.
--
-- WHAT HAPPENED, EXACTLY (measured on the main database, 19 September ~21:00 UTC).
-- `navfix_one_switch_per_organization.sql` set `custom/code_paths_enabled`'s
-- `overridable_by` to `{}` to take the PERSON rung off the second switch. That
-- was right about the person rung and wrong about everything else:
-- `platform.knob_resolve` will not even look at an override table when
-- `overridable_by = '{}'` (`if p_organization_id is not null and
-- k.overridable_by <> '{}' then …`), so the knob became un-overridable at EVERY
-- scope in one move. The five rows on it were all `scope_kind = 'user'` — three
-- people, hand-written, one seat at a time, which is exactly the second switch
-- the ruling removes — and the deployed server's agent `records` tool read that
-- knob THROUGH those rows. With them invisible it refused everybody: "the
-- unified-data campaign is switched off for this person" (AGENT-UI lane, 20:40
-- UTC).
--
-- THE RULING, APPLIED PROPERLY. One switch, and it belongs to the ORGANIZATION.
-- `custom/system_enabled` is that switch; `custom/code_paths_enabled` means the
-- same thing for the server's own code and must therefore never be able to say
-- something different. So this file does three things and no more:
--
--   1. `code_paths_enabled` becomes `overridable_by {organization}` — the same
--      scope as its twin, and NEVER `{user}` again. The five per-person rows
--      stop resolving, deliberately: that is the second switch going away. They
--      are left in place rather than deleted, because deleting somebody's saved
--      setting is not this lane's to do and, with the person rung closed, they
--      resolve to nothing.
--
--   2. Every organization that has DECIDED `system_enabled` gets the same
--      answer written on `code_paths_enabled`, through the platform's own
--      override writer, so the two agree today for every organization that has
--      an opinion. Nothing is invented for an organization that has none: no
--      row means the platform default, which is false on both, which is the
--      same answer.
--
--   3. `platform.unified_data_store_set` — the ONE door the switch screen uses,
--      and the only way the store switch is ever set — now writes BOTH rows in
--      the same statement, and reads BOTH back before it says it worked. That
--      is what makes this one switch rather than two that drift: after this
--      there is no way to turn the store on for an organization and leave the
--      code half saying no, because the door that does the first does the
--      second or raises.
--
-- WHY `code_paths_enabled` IS NOT DROPPED. `aidream/services/unified_data_campaign/flag.py`
-- still reads its PLATFORM DEFAULT as the server's process-wide kill switch, and
-- `ramp.py` and `package_integration.py` read it through that. Dropping a row a
-- live consumer reads is the one class that stops and escalates. It is now a
-- MIRROR of the one switch, kept for that one reader, and it should be dropped
-- when that reader is retired.
--
-- ADDITIVE: one knob row's scope widened from `{}` to `{organization}`, rows
-- written into our own override table through the platform's own writer, and one
-- CREATE OR REPLACE that adds a write and changes no result shape. Nothing is
-- dropped and nothing is revoked.
--
-- THE INVERSE: migrations/inverse/navfix_the_code_half_follows_the_one_switch_down.sql.

-- based-on: platform.unified_data_store_set(uuid, boolean, uuid, text) 0bb6c8505bd598f70dc2d03ebef03adf17ddc1ff5a5d984a05342b32cf4f4e37

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE SAME SCOPE AS ITS TWIN. An organization's decision, never a person's.
-- ─────────────────────────────────────────────────────────────────────────────
update platform.feature_knob
   set overridable_by = '{organization}'::text[],
       description =
         'The CODE half of the unified data campaign''s switch, read by aidream''s server as '
         'its process-wide kill switch. It is a MIRROR of custom.system_enabled and must never '
         'say anything different: platform.unified_data_store_set writes both rows in the same '
         'statement. An ORGANIZATION''s decision, set once on the unified data ramp screen for '
         'everybody in it - never a person''s. It carried overridable_by {user} until '
         '19 September, which is how an administrator could open the record store for themselves '
         'and for nobody else (lane NAV-FIX). Drop this row when aidream''s flag.py stops '
         'reading it; nothing a person reaches reads it now.',
       basis = 'Unified data campaign, 2026-09-19 (lane NAV-FIX): one switch per organization, mirrored.',
       updated_at = now()
 where feature = 'custom'
   and key = 'code_paths_enabled';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE TWO AGREE FOR EVERY ORGANIZATION THAT HAS DECIDED.
--    Through the platform's own writer, so the audit row and the write door are
--    exactly what they would be if a person had set it on the screen.
-- ─────────────────────────────────────────────────────────────────────────────
do $mirror$
declare
  decided record;
  written jsonb;
begin
  for decided in
    select o.scope_id as organization_id, o.value, o.updated_by
      from platform.knob_override o
     where o.feature = 'custom' and o.key = 'system_enabled'
       and o.scope_kind = 'organization'
  loop
    written := platform._knob_override_write(
      'custom', 'code_paths_enabled', 'organization',
      decided.organization_id, decided.organization_id,
      decided.value,
      'Mirrored from custom.system_enabled (lane NAV-FIX, 2026-09-19): one switch per organization.',
      decided.updated_by);
    if written is null or not coalesce((written ->> 'ok')::boolean, false) then
      raise exception 'NAV-FIX: could not mirror custom.system_enabled onto custom.code_paths_enabled for organization % — the knob writer answered %. The two switches would disagree, which is the whole defect.',
        decided.organization_id, coalesce(written::text, 'null')
        using errcode = 'P0001';
    end if;
    raise notice 'mirrored % onto code_paths_enabled for organization %', decided.value, decided.organization_id;
  end loop;
end
$mirror$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE ONE DOOR WRITES BOTH, OR RAISES. This is what makes them one switch.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.unified_data_store_set(
  p_organization_id uuid,
  p_on              boolean,
  p_acting_user_id  uuid default null::uuid,
  p_note            text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor    uuid := coalesce(p_acting_user_id, auth.uid());
  v_door     jsonb;
  v_written  jsonb;
  v_readback jsonb;
  v_key      text;
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Turning this organization''s data store on or off');

  if v_actor is null then
    raise exception 'platform.unified_data_store_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;
  if p_organization_id is null or p_on is null then
    raise exception 'platform.unified_data_store_set: name the organization and say on or off. Nothing was changed.'
      using errcode = '22004';
  end if;

  -- BOTH HALVES, IN ONE STATEMENT. `system_enabled` is the switch every person
  -- and every client reads; `code_paths_enabled` is the mirror aidream's server
  -- kill switch reads. Writing one and not the other is how an organization came
  -- to be on the store with its agent tool still refusing (lane NAV-FIX). The
  -- loop makes it impossible to add a third and forget it.
  foreach v_key in array array['system_enabled', 'code_paths_enabled'] loop
    -- THE DOOR QUESTION IS STILL ASKED, exactly as platform.knob_override_set asks it.
    v_door := platform.knob_write_door_for('custom.' || v_key);
    if (v_door ->> 'ok')::boolean
       and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
      raise exception 'platform.unified_data_store_set: custom.% is written through %, not through this screen. That is where its own permission gate and its own audit trail live.',
        v_key, v_door ->> 'set_door'
        using errcode = 'P0001';
    end if;

    v_written := platform._knob_override_write(
      'custom', v_key, 'organization', p_organization_id, p_organization_id,
      to_jsonb(p_on),
      coalesce(p_note, 'Unified-data switch screen, the store itself, ' || (case when p_on then 'ON' else 'OFF' end)),
      v_actor);

    if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
      raise exception 'platform.unified_data_store_set: the override was NOT written for custom.% — the knob writer answered %. Nothing has changed and this organization has not moved.',
        v_key, coalesce(v_written::text, 'null')
        using errcode = 'P0001',
              hint = 'platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looks exactly like success. This is the failure the consumer switch used to swallow.';
    end if;

    -- READ IT BACK. The screen may only say "switched on" when the database agrees.
    v_readback := platform.knob_resolve('custom', v_key, p_organization_id, null, null);
    if v_readback is distinct from to_jsonb(p_on) then
      raise exception 'platform.unified_data_store_set: wrote % for custom.% but platform.knob_resolve still answers % for organization %. The switch did not take.',
        to_jsonb(p_on), v_key, coalesce(v_readback::text, 'null'), p_organization_id
        using errcode = 'P0001';
    end if;
  end loop;

  return platform.unified_data_store_state(p_organization_id);
end;
$function$;
