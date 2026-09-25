-- chair-step: deleting a platform.entity_types row and a provision_spec_grandfather row is never additive — one un-registers an entity token, the other removes a guard exemption — so it is never unattended
--
-- THE INVERSE of `migrations/campaign/w1_store_branch_registration.sql`, which shipped
-- without one. Rule 27 makes the down-migration an exit clause of every builder lane, and
-- that file is BRANCH-ONLY (production's registry gains no `custom:` token before the
-- switch checklist), so this inverse is branch-only too — the assertion below says so.
--
-- WHY `W1-PROV` NEEDS IT. That row was the route through `provision_shape_guard` for a
-- HAND-BUILT `custom.record`: the guard exempts a relation `platform.entity_types` already
-- names. The store is now created by `platform.provision`, which writes that row ITSELF,
-- so the fixture has to go first or `provision_validate` refuses the spec by name
-- (`identity.token.taken`) — correctly.
--
-- AND THE GRANDFATHER ROW GOES WITH IT. `platform.provision_spec_grandfather` is seeded by
-- introspection, one row per undeclared relation on first sight, and the branch's seed
-- (758 rows, `W0-SYNC`) picked up the hand-made `custom.record` because at that moment it
-- WAS undeclared. A provisioner-built table needs no exemption and must not carry one: the
-- census would read it as grandfathered rather than declared, and the guard would hold a
-- standing hole for a relation name that no longer needs it. §3.5's ratchet is shrink-only,
-- and this is the shrink.

set lock_timeout = '2s';
set statement_timeout = '120s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). The row this undoes was never '
      'written here — `w1_store_branch_registration.sql` is headed `-- target: branch` and '
      'production''s registry gains no custom token before the switch checklist.',
      (pg_control_system()).system_identifier;
  end if;
  if to_regclass('custom.record') is not null then
    raise exception
      'REFUSING: custom.record still exists. Un-registering a live relation would leave an '
      'entity-shaped table with no registry row, which is the exact shape provision_shape_guard '
      'exists to refuse. Run migrations/inverse/w1_store_custom_record_store_down.sql first.';
  end if;
end
$$;

delete from platform.entity_types where token = 'record' and schema_name = 'custom';
delete from platform.provision_spec_grandfather
 where lane = 'unprovisioned_relation' and object_ref = 'custom.record';
