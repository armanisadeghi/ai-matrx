-- dd190_party_carrier_no_person_system — a person's contact carries no system
-- (DD-190, register row "Form-created CRM contacts store the person's UUID in
-- crm.party.created_by_system").
--
-- ═══ WHAT V-51 FOUND ═══════════════════════════════════════════════════
-- V-51 (2026-09-13, between wf_056's apply at 08:02:04Z and the next fix at
-- 08:45:47Z) hand-created a CRM contact through the real `/crm` "New person"
-- form and read back `created_by_system = 87a6e699-…` — the SIGNED-IN USER'S
-- OWN id, in a column whose contract says it names a SYSTEM, not a person.
--
-- ═══ WHERE THE STAMP ACTUALLY COMES FROM ══════════════════════════════
-- `crm.party` carries `platform._stamp_actor_tier` (attached DB-wide, wf_056
-- gave it the four columns to write). That function calls
-- `platform.actor_system()`, which resolves to `platform.declared_actor_system()`
-- alone (matrx-frontend's dd131_actor_system_no_person_header.sql, applied
-- 2026-09-12 20:55 — BEFORE wf_056) and is defined to return NULL, never a
-- person's id, when nothing is declared. Both that function and
-- `platform._stamp_actor_tier` read correctly in the committed source at
-- every point in this timeline; there is no separate stamping path on
-- `crm.party` (censused live: `_stamp_actor` only ever touches
-- `created_by`/`updated_by`, never the `_system` columns).
--
-- Re-run live today, over the real wire, as test@test.com, through
-- PostgREST with no `x-matrx-actor-system` header (the exact shape of a
-- browser write): the result is `created_by_tier = "human"`,
-- `created_by_system = null`. **The class does not reproduce now.** The
-- window V-51 caught was between wf_056 attaching the columns (08:02:04Z)
-- and `platform_touch_row_never_drops_a_new_column_dd184.sql` (08:45:47Z,
-- B-76) replacing `_stamp_actor_tier`'s `jsonb_populate_record` rebuild with
-- direct field assignment; DD-184's own file documents that rebuild dropping
-- values inside a transaction that also alters the table it fires on — the
-- exact shape of wf_056 (which both added the four columns AND, in its own
-- backfill/verification block, wrote to `crm.party`). This migration does
-- not re-open that mechanism; it exists to (a) leave a permanent guard/proof
-- that the class stays closed and (b) backfill any row anywhere that still
-- carries the bug's exact shape, on `crm.party` specifically (the table
-- DD-190 names).
--
-- ═══ WHAT THIS FILE DOES ═══════════════════════════════════════════════
-- 1. Backfill: any `crm.party` row where `created_by_system::text =
--    created_by::text` (a user id sitting in the system column) → NULL.
-- 2. A verification block that fails the migration if any such row remains,
--    so a silent partial backfill can never ship quietly (same pattern as
--    dd131_actor_system_no_person_header.sql).

-- ---------------------------------------------------------------------------
-- (1) Backfill.
-- ---------------------------------------------------------------------------
UPDATE crm.party
   SET created_by_system = NULL
 WHERE created_by_system = created_by::text;

UPDATE crm.party
   SET updated_by_system = NULL
 WHERE updated_by_system = updated_by::text;

-- ---------------------------------------------------------------------------
-- (2) Verification — fail loud if the backfill did not close the class.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_left bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM crm.party WHERE created_by_system = created_by::text)
    + (SELECT count(*) FROM crm.party WHERE updated_by_system = updated_by::text)
  INTO v_left;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd190_party_carrier_no_person_system: % crm.party row(s) still carry created_by_system/updated_by_system = the actor''s own id after backfill', v_left;
  END IF;
END
$$;
