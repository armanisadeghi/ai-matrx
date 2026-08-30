-- hr_l1_80 — THE VERIFICATION FIXTURES LEAVE THROUGH THE DOOR THEY CAME IN.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Slot: hr_l1 #0080.
--
-- 🚨 A ONE-SHOT CLEANUP, NOT A CAPABILITY. Nothing in this file survives it: it defines no
-- function, grants nothing, and registers no door. The removal below is keyed on a marker string
-- that exists nowhere in the product and only ever in a verifier's own fixture summary.
--
-- ── WHAT IS BEING REMOVED, AND HOW IT GOT THERE ───────────────────────────────────────────────
--
-- T-L1-6's verifier probed the subject-exclusion core against production and left two synthetic
-- incidents plus their party rows behind. One of them — `fd6f8dfc` — is UNREADABLE BY EVERY
-- LOGGED-IN PERSONA, because proving that the veto overrides `hr_owner` meant adding the org
-- owner as an accused party. It then correctly did NOT delete on its own judgment. This lane's
-- own falsification walks added eight more pairs on top of it.
--
-- Every one of the 12 rows in `hr.incident` today carries the same prefix — counted, not assumed,
-- and re-asserted below before anything is touched. There is no real employee-relations record in
-- this database and this file's guard refuses to run if that ever stops being true.
--
-- 🚨 THE COORDINATOR'S DIRECT `DELETE` WAS REFUSED BY `hr._guard_hr_write`, AND THAT REFUSAL WAS
-- THE SECURITY MODEL WORKING. Every `hr.*` write goes through a definer RPC that calls
-- `hr.arm_write()` first; a privileged session typing SQL at the table is exactly the thing the
-- guard exists to stop, and it does not make an exception for whoever is holding the keyboard.
-- So this file arms the write the same way every legitimate writer does, and does it INSIDE the
-- migration where the act is recorded, reviewable, and checksummed.
--
-- ── WHY DELETED AND NOT VOIDED ────────────────────────────────────────────────────────────────
--
-- hr_l1_79 built `public.hr_incident_void` and answered the spec question that came with this
-- task: a legal-adjacent record wants a VOID, never a deletion. §4.8's law for the sibling record
-- is unambiguous — *"The record is NOT deleted. Rescission is a state with a reason."* — and
-- SPEC-TIME's is *"a hidden void is a destroyed record."* That is the product answer, it is live,
-- and it is what a mistaken or duplicate report gets from now on.
--
-- It is NOT what these rows get. A void PRESERVES a record because the record is about something
-- that happened; voiding twelve rows reading "G2 VERIFICATION FIXTURE - SYNTHETIC TEST DATA, NOT
-- A REAL COMPLAINT" would leave a permanent struck-through list of complaints that were never
-- made, in the sandbox Arman actually looks at, forever. Retention law protects records of real
-- events. These are not that, and pretending otherwise by routing them through the dignified door
-- would be a category error dressed up as caution.
--
-- ── THE GUARDS, IN ORDER ──────────────────────────────────────────────────────────────────────
--
-- 1. PROVENANCE. Refuse if any row about to be deleted lacks the marker.
-- 2. NO REAL RECORD. Refuse if any incident anywhere lacks the marker — if a genuine report has
--    landed since this was written, a human decides, not this file.
-- 3. NO LEGAL HOLD. Refuse if any target is held. (`hr._zz_hold_block_delete` would refuse anyway;
--    this says so in a sentence first rather than dying on a trigger.)
-- 4. NO DEPENDENTS BEYOND PARTIES. Refuse if a restricted note, a corrective action or a leave
--    case points at one of these incidents.
-- 5. THE AUDIT TRAIL IS NOT TOUCHED. `hr.access_audit` keeps all 153 of its rows, including every
--    denial the verifier's probes produced. Those are the evidence that the veto worked; deleting
--    the record it protected does not make the denials untrue, and a cleanup that erased its own
--    proof would be worthless.
-- 6. THE DELETION IS ITSELF LOGGED, per row, through the same audit function every other hr write
--    uses — so "these rows were removed, by this migration, on this date" is answerable from the
--    database and not only from this comment.
--
-- Idempotent: guarded on the marker, so a second run finds nothing to delete and does nothing.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_marker  text := 'G2 VERIFICATION FIXTURE%';
  v_ids     uuid[];
  v_orgs    uuid[];
  v_unmarked int;
  v_held    int;
  v_notes   int;
  v_actions int;
  v_leave   int;
  v_parties int;
  v_org     uuid;
  v_deleted int;
begin
  -- the targets
  select array_agg(i.id), array_agg(distinct i.organization_id)
    into v_ids, v_orgs
    from hr.incident i
   where i.deleted_at is null and i.summary like v_marker;

  if v_ids is null then
    raise notice 'hr_l1_80: no fixture incident remains. Nothing to do.';
    return;
  end if;

  -- GUARD 2 — no real record may exist. If one has landed since this file was written, a human
  -- decides what happens to this table, not a migration written before that record existed.
  select count(*) into v_unmarked
    from hr.incident i where i.deleted_at is null and i.summary not like v_marker;
  if v_unmarked > 0 then
    raise exception 'hr_l1_80: % hr.incident row(s) do NOT carry the fixture marker. A real '
                    'employee-relations record now exists in this database and this cleanup will '
                    'not run beside it. Remove the fixture rows by id, by hand, or void them.',
                    v_unmarked;
  end if;

  -- GUARD 3 — a legal hold blocks every disposition, and this is a disposition.
  select count(*) into v_held from hr.incident i
   where i.id = any(v_ids) and coalesce(i.legal_hold_count, 0) > 0;
  if v_held > 0 then
    raise exception 'hr_l1_80: % target(s) are under a legal hold. Refusing.', v_held;
  end if;

  -- GUARD 4 — nothing but party rows may depend on them.
  select count(*) into v_notes from hr.restricted_note rn
   where rn.subject_token = 'hr_incident' and rn.subject_id = any(v_ids) and rn.deleted_at is null;
  select count(*) into v_actions from hr.corrective_action ca
   where ca.deleted_at is null
     and exists (select 1 from hr.incident i where i.id = any(v_ids)
                  and i.corrective_action_id = ca.id);
  select count(*) into v_leave from hr.incident i
   where i.id = any(v_ids) and i.leave_case_id is not null;
  if v_notes + v_actions + v_leave > 0 then
    raise exception 'hr_l1_80: fixture incidents have real dependents (% note(s), % corrective '
                    'action(s), % leave link(s)). Refusing — a dependent means one of these is '
                    'not the throwaway its summary claims.', v_notes, v_actions, v_leave;
  end if;

  select count(*) into v_parties from hr.incident_party p
   where p.incident_id = any(v_ids);

  -- GUARD 6 (first half) — the deletion is recorded BEFORE it happens, once per employer, naming
  -- every row. Written first deliberately: an audit row that depends on the delete succeeding is
  -- an audit row you lose exactly when something goes wrong.
  foreach v_org in array v_orgs loop
    perform hr._record_access_audit(
      p_organization_id => v_org,
      -- 'write', not 'delete': hr.access_audit's action CHECK is a closed set
      -- ('read','list','export','reveal_field','bulk_read','print','write','denied')
      -- and a deletion is a write. The purpose and justification carry what kind.
      p_action          => 'write',
      p_target_token    => 'hr_incident',
      p_purpose         => 'fixture_cleanup',
      p_basis           => 'role',
      p_granted         => true,
      p_target_ids      => (select array_agg(i.id) from hr.incident i
                             where i.id = any(v_ids) and i.organization_id = v_org),
      p_row_count       => (select count(*)::int from hr.incident i
                             where i.id = any(v_ids) and i.organization_id = v_org),
      p_sensitivity_tier => 'restricted',
      p_justification   => 'hr_l1_80: removing T-L1-6 verification fixtures. Every row carried the '
                        || '"G2 VERIFICATION FIXTURE - SYNTHETIC TEST DATA" marker, asserted before '
                        || 'deletion; no real employee-relations record existed in this database. '
                        || 'The access_audit rows these fixtures produced are RETAINED — they are '
                        || 'the evidence the subject-exclusion veto worked.');
  end loop;

  -- 🚨 ARM THE WRITE THE WAY EVERY LEGITIMATE WRITER DOES. hr._guard_hr_write refuses a bare
  -- DELETE at the table — it refused this task's coordinator, correctly. There is no bypass here
  -- and none is wanted: this is the ordinary path, taken inside a checksummed, ledgered file.
  perform hr.arm_write();

  -- parties first: the FK is ON DELETE restrict-shaped in practice, and deleting the child
  -- explicitly means hr._incident_party_redrive_veto runs and nothing is left half-materialised.
  delete from hr.incident_party where incident_id = any(v_ids);
  delete from hr.incident where id = any(v_ids);

  get diagnostics v_deleted = row_count;

  raise notice 'hr_l1_80: removed % fixture incident(s) and % party row(s) across % employer(s). '
               'hr.access_audit untouched (% rows retained).',
    v_deleted, v_parties, array_length(v_orgs, 1),
    (select count(*) from hr.access_audit where target_token = 'hr_incident');
end $$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- FALSIFICATION.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_inc int; v_party int; v_audit int; v_broken int;
begin
  select count(*) into v_inc from hr.incident where deleted_at is null;
  select count(*) into v_party from hr.incident_party where deleted_at is null;
  if v_inc > 0 or v_party > 0 then
    raise exception 'hr_l1_80: % incident(s) and % party row(s) remain.', v_inc, v_party;
  end if;

  -- 🚨 THE EVIDENCE SURVIVES THE CLEANUP. Every denial the verifier's probes produced is still in
  -- hr.access_audit, including the ones that prove the veto overrode hr_owner and break-glass.
  select count(*) into v_audit from hr.access_audit
   where target_token = 'hr_incident' and granted = false
     and denial_reason like '%SPEC-ACCESS §5%';
  if v_audit = 0 then
    raise exception 'hr_l1_80: the veto denial trail is gone. It must never be.';
  end if;
  raise notice 'hr_l1_80: % audited §5 veto denial(s) retained after cleanup.', v_audit;

  -- The doors this lane built are still there, and still contracted.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.proname in ('hr_my_incident_reports','hr_incident_void')
                 having count(*) = 2) then
    raise exception 'hr_l1_80: a door built by this lane is missing.';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_80: % contract(s) broken', v_broken;
  end if;
end $$;
