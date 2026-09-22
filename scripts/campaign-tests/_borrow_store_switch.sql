-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- BORROWING ONE ORGANIZATION'S RECORD-STORE SWITCH, INSIDE THE SUITE'S OWN TRANSACTION.
--
--     \set store_org '6069a466-1445-42df-a64e-cf37ecdc1b99'
--     \i scripts/campaign-tests/_borrow_store_switch.sql      -- AFTER `begin;`
--
-- WHY IT EXISTS. `custom.system_enabled` defaults to FALSE and that is the design, not a
-- defect: THE RECORD STORE IS OPT-IN PER ORGANIZATION (STORE-OFF / FIX-11A). A suite that
-- takes a seat in an organization which has not opted in is answered "This organization has
-- not turned the record store on yet, so custom.<door> is not taking writes." — correctly.
-- Measured on the dev clone (production's own data) 2026-09-22, that one sentence was the
-- whole of seven suite failures and two skips. The answer is NEVER to change the knob's
-- default, which would switch the store on for every organization on the platform.
--
-- WHAT IT DOES INSTEAD. It writes the ORGANIZATION-SCOPED override — the same row an owner
-- writes from the UI, at the same rung — for the one organization the suite names, and
-- nothing else. `custom.store_is_open` reads `platform.knob_resolve('custom','system_enabled',
-- org)`, so an organization rung answers for that organization and the platform default is
-- untouched.
--
-- WHY THIS AND NOT scripts/lib/borrow-live-switch.sh. That helper is the right primitive for
-- a SHELL proof, which commits its flip and must therefore read the prior value first, restore
-- in a trap on every exit path, and hold an object-scoped build_lock so two proofs cannot race
-- the same organization. A psql suite cannot source a zsh file — and it does not need to,
-- because it satisfies all three of those rules more strongly by construction:
--   1. READ FIRST / put back what was there — nothing is put back because nothing is changed:
--      this row lives and dies inside the suite's transaction, which ends in ROLLBACK.
--   2. RESTORE ON EVERY EXIT PATH — an aborted transaction, a killed client, a lock timeout
--      and a crash all discard it. There is no exit path that leaks it.
--   3. ONE PROOF PER ORGANIZATION — the row lock Postgres takes on this exact primary key
--      serialises two suites on the same organization for real, at the row, for the duration.
--
-- 🚨 SO THE ONE THING THIS FILE REQUIRES OF ITS CALLER: the suite MUST end in `rollback;`.
-- Include it in a suite that commits and that organization's store is left ON, which is how a
-- crew goes dark. A committing suite declares the dependency to the preamble instead
-- (`row:platform.knob_override:…`) and SKIPs by name.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- psql does not interpolate :variables inside dollar-quoted bodies, so the organization is
-- handed to the DO block below as a session setting. We are inside the suite's transaction,
-- which pins one pooler backend, so the setting survives to the next statement.
select set_config('matrx.store_org', :'store_org', false)
\g (tuples_only=on format=unaligned) /dev/null

insert into platform.knob_override
  (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :'store_org', :'store_org', 'true'::jsonb,
        'borrowed by a campaign suite inside its own transaction — it goes with the ROLLBACK')
on conflict (feature, key, scope_kind, scope_id, organization_id)
do update set value = 'true'::jsonb;

do $matrx_borrow$
begin
  if not custom.store_is_open(current_setting('matrx.store_org')::uuid) then
    raise exception 'the record-store switch could not be borrowed for organization % — the door would refuse this suite and it would be scored for something it never did', current_setting('matrx.store_org');
  end if;
  raise notice 'borrowed the record store for organization % — switched ON inside this transaction only; the ROLLBACK at the end of this suite is what puts it back.', current_setting('matrx.store_org');
end
$matrx_borrow$;
