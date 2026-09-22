-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- ONE SWITCH MEANT ONE DOOR, AND EVERY OTHER DOOR WAS STILL OPEN.
--
-- WHAT THE V11-A CENSUS FOUND (2026-09-22, on the main database). Lane NAV-FIX
-- ruled on 2026-09-19 that an organization's record store is ONE switch:
-- `custom/system_enabled` is it, and `custom/code_paths_enabled` — the same
-- answer for the server's own code — "must therefore never be able to say
-- something different". It made `platform.unified_data_store_set` write both
-- rows in one statement and read both back, and wrote in its own header that
-- "after this there is no way to turn the store on for an organization and
-- leave the code half behind."
--
-- That is true of callers of THAT DOOR. It was never true of the table. Three
-- days later **42 organizations hold two halves that disagree**, because a
-- proof, a fixture or a seat suite writes `platform.knob_override` directly —
-- `insert into platform.knob_override … 'system_enabled' … true` is one line,
-- and every one of them wrote it. Greenline Landscaping Crew, the crew
-- VERIFIER-11 did its whole walk in, is `system_enabled true` with no code half
-- at all, so the platform default answers false and the server's own kill
-- switch has been refusing that crew while every screen said it was on.
--
-- A SAFE PATH BESIDE AN UNSAFE ONE IS NOT A FIX. This closes the door: an
-- AFTER-ROW trigger on `platform.knob_override` mirrors either half onto the
-- other, at organization scope, whichever way the write came in. The door keeps
-- its read-back; the table now keeps the invariant even for a caller that never
-- heard of the door.
--
--   * `system_enabled` is the switch and it WINS: a write to it sets the code
--     half to the same value. NAV-FIX ruled which one is the switch; this file
--     does not re-open that.
--   * a write to `code_paths_enabled` alone — which is how three Rincon
--     branches came to be half-on — is mirrored back onto `system_enabled`
--     only when there is no `system_enabled` row to contradict it. With one,
--     the switch wins and the code half is corrected to match it.
--   * recursion is stopped by a transaction-local flag, not by a shape, so a
--     mirror never triggers a mirror.
--
-- The existing rows are repaired separately, through the writer, by
-- scripts/fix11a/mirror_the_code_half_onto_every_organization.sql — the
-- production runner judges a migration by an allow-list of additive DDL, and a
-- DO block that writes rows is not one of them, correctly.
--
-- The guard: `pnpm check:one-switch-two-halves` (+ :self-test).
-- The inverse: migrations/inverse/fix11a_the_two_halves_of_the_one_switch_cannot_drift_down.sql

set lock_timeout = '5s';
set statement_timeout = '600s';

create function platform._store_switch_halves_follow_each_other()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_twin  text;
  v_other jsonb;
begin
  -- Only the one switch, and only at the scope it belongs to.
  if new.feature <> 'custom'
     or new.key not in ('system_enabled', 'code_paths_enabled')
     or new.scope_kind <> 'organization' then
    return null;
  end if;

  -- A mirror never triggers a mirror. Transaction-local, so a failed statement
  -- cannot leave the flag standing for the next one.
  if coalesce(nullif(current_setting('platform.mirroring_store_switch', true), ''), '') = 'yes' then
    return null;
  end if;

  v_twin := case new.key when 'system_enabled' then 'code_paths_enabled' else 'system_enabled' end;

  select value into v_other
    from platform.knob_override
   where feature = 'custom' and key = v_twin
     and scope_kind = 'organization' and scope_id = new.scope_id
     and organization_id = new.organization_id;

  -- THE SWITCH WINS. A write to `code_paths_enabled` is mirrored onto
  -- `system_enabled` only where the switch has said nothing at all; where it
  -- has, the code half is the one that is wrong and it is about to be fixed by
  -- the same statement from the other side.
  if new.key = 'code_paths_enabled' and v_other is not null then
    if v_other is distinct from new.value then
      perform set_config('platform.mirroring_store_switch', 'yes', true);
      update platform.knob_override
         set value = v_other,
             set_note = 'The two halves of the one switch follow each other (V11-A): the switch custom/system_enabled said ' || v_other::text || '.'
       where feature = 'custom' and key = 'code_paths_enabled'
         and scope_kind = 'organization' and scope_id = new.scope_id
         and organization_id = new.organization_id;
      perform set_config('platform.mirroring_store_switch', '', true);
    end if;
    return null;
  end if;

  if v_other is not distinct from new.value then
    return null;
  end if;

  perform set_config('platform.mirroring_store_switch', 'yes', true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', v_twin, 'organization', new.scope_id, new.organization_id, new.value,
          'The two halves of the one switch follow each other (V11-A): custom/' || new.key || ' was set to ' || new.value::text || '.',
          new.updated_by)
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update
     set value = excluded.value,
         set_note = excluded.set_note,
         updated_by = excluded.updated_by;
  perform set_config('platform.mirroring_store_switch', '', true);

  return null;
end;
$fn$;

comment on function platform._store_switch_halves_follow_each_other() is
  'V11-A (2026-09-22): NAV-FIX made platform.unified_data_store_set write both halves of the record-store switch. Forty-two organizations still drifted, because a proof or a fixture writes platform.knob_override directly. This keeps the invariant at the table, for every caller.';

create trigger store_switch_halves_follow_each_other_tg
  after insert or update of value on platform.knob_override
  for each row
  execute function platform._store_switch_halves_follow_each_other();
