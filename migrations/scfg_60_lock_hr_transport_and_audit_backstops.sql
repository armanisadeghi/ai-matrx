-- scfg_60_lock_hr_transport_and_audit_backstops.sql
-- ============================================================================
-- Curation fix: hr.contracts (15 keys) and one hr.domain_wide audit floor are
-- PLATFORM BACKSTOPS, not tenant policy. Lock them (overridable_by = '{}').
--
-- WHY THEY WERE WRONG. scfg_10_hr_seed_and_overridability.sql made every HR key
-- org-overridable with a blanket `where feature like 'hr.%'`. That was right for
-- the tenant-policy features (time_and_attendance, leave, employees, workflow…)
-- and wrong for hr.contracts, which hr_c8_02_contracts_knob_register.sql had
-- deliberately created with no overridable_by of its own. Nothing decided that
-- provider timeouts and webhook body limits were tenant-settable; a LIKE pattern
-- decided it.
--
-- WHAT THESE KEYS ACTUALLY ARE. All 15 are transport/infra ceilings: dispatch and
-- sync timeouts, retry attempts/backoff/base, webhook max body bytes and clock
-- skew, recompute and autofill batch maxima, rule-resolution cache TTL,
-- idempotency and snapshot retention, signed-URL TTL, export preview lines, mock
-- mode. They protect the platform from a tenant, cost us money when raised, and
-- are exactly the "blast-radius backstop / worst-case head-room" category the
-- feature-knobs SoR keeps at '{}'. A tenant raising webhook_max_body_bytes or
-- provider_retry_attempts is not configuring their HR policy; it is spending our
-- capacity.
--
-- hr.domain_wide.break_glass_justification_min_chars is the audit floor on
-- hr.reveal_ssn (SPEC-ACCESS §4.5). Locking it is the SAFE direction: an org must
-- never be able to LOWER how much justification a break-glass SSN reveal demands.
-- Raising it is a legitimate future want — the shape for that is
-- override_direction='raise_only' plus threading the organization into
-- aidream/services/hr/employees/ssn_reveal.py::_require_justification, which
-- reads it globally today. Recorded, deliberately not built here: nobody has
-- asked, and a lock is the conservative half of that pair.
--
-- WHY THIS IS A NO-OP FOR EVERY TENANT TODAY. Verified live before applying:
-- platform.knob_override holds ZERO rows for hr.contracts and ZERO for
-- hr.domain_wide, so no organization loses a value it had set. The Python
-- readers for all of these are already GLOBAL (hr/common.py::knob,
-- hr/time/knobs.py::_contracts_knob, ssn_reveal.py), which means the effective
-- value does not change either — this migration makes the register agree with
-- what the code has always done, instead of advertising an override that the
-- engine silently ignored. That advertised-but-ignored state is the split-brain
-- the scoped-configuration cutover exists to end; here it is closed by locking
-- rather than by threading, because these values are genuinely ours.
--
-- The matching guard change lands with this migration in aidream
-- (scripts/check_scoped_knob_readers.py): hr.contracts leaves the
-- org-overridable map entirely, and break_glass_justification_min_chars joins
-- hr.domain_wide's locked set — so the global reads it now reports are correct
-- by design rather than tolerated.
--
-- Idempotent: sets a fixed value, safe to re-run.
-- ============================================================================

update platform.feature_knob
   set overridable_by = '{}'::text[]
 where feature = 'hr.contracts';

update platform.feature_knob
   set overridable_by = '{}'::text[]
 where feature = 'hr.domain_wide'
   and key = 'break_glass_justification_min_chars';

-- ----------------------------------------------------------------------------
-- Verification. Raises (aborting) unless every targeted key is locked, no
-- tenant override was orphaned, and the neighbouring tenant-policy keys in
-- hr.domain_wide are left alone.
-- ----------------------------------------------------------------------------
do $verify$
declare
  n_unlocked   int;
  n_orphaned   int;
  n_neighbours int;
begin
  select count(*) into n_unlocked
    from platform.feature_knob
   where (feature = 'hr.contracts'
          or (feature = 'hr.domain_wide' and key = 'break_glass_justification_min_chars'))
     and overridable_by <> '{}'::text[];
  if n_unlocked > 0 then
    raise exception '% targeted key(s) are still org-overridable', n_unlocked;
  end if;

  -- A locked knob with a standing override would be a value the resolver now
  -- ignores — the exact silent-inertness this migration is closing.
  select count(*) into n_orphaned
    from platform.knob_override o
    join platform.feature_knob k on k.feature = o.feature and k.key = o.key
   where k.overridable_by = '{}'::text[]
     and (o.feature = 'hr.contracts'
          or (o.feature = 'hr.domain_wide' and o.key = 'break_glass_justification_min_chars'));
  if n_orphaned > 0 then
    raise exception
      '% override row(s) were orphaned by this lock — resolve them before locking', n_orphaned;
  end if;

  -- hr.domain_wide is otherwise genuine tenant policy; locking the whole
  -- feature would be a real capability loss, so prove we did not.
  select count(*) into n_neighbours
    from platform.feature_knob
   where feature = 'hr.domain_wide'
     and key <> 'break_glass_justification_min_chars'
     and overridable_by <> '{}'::text[];
  if n_neighbours = 0 then
    raise exception
      'every hr.domain_wide key is now locked — this migration was meant to lock exactly one';
  end if;

  raise notice
    'hr.contracts locked; break_glass floor locked; % hr.domain_wide tenant key(s) untouched',
    n_neighbours;
end;
$verify$;
