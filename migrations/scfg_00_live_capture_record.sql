-- scfg_00_live_capture_record.sql
-- ============================================================================
-- SCOPED CONFIGURATION — Phase 0 pre-flight capture (RECORD, NOT A MIGRATION).
-- Do not apply. This file preserves the live state of every function and data
-- surface the scoped-configuration build (scfg_01..scfg_30) replaces, plus the
-- census results that make the cutover provable. Captured 2026-08-29 from the
-- live Matrx Main DB (brsgrqvjdzwihsvnfqkf) via pg_get_functiondef.
--
-- Why: hr's knob reader family exists LIVE-ONLY in part (hr._knob's org-blind
-- variant and helpers were applied across hr_l1/l3 migrations; the live bodies
-- are the ground truth), and the parity checks in scfg_12 diff against the
-- baselines recorded here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CENSUS A — knob keys read by live SQL functions vs seeded register rows
-- ----------------------------------------------------------------------------
-- Method: regex over pg_get_functiondef of every hr.*/public.* function for
-- hr._knob / hr._hr_knob (explicit feature,key) and hr._punch_knob /
-- hr._clock_knob (feature hr.time_and_attendance implied).
--
-- Result: 79 distinct (feature,key) pairs referenced; ALL seeded except THREE
-- (each currently riding hr._hr_knob's rung-4 caller default):
--   hr.time_and_attendance / punch_enabled_worker_classes
--       (legacy composite array key, default '["employee","intern","seasonal"]',
--        read at hr.clock_state and hr.punch_record; the register instead
--        carries the four punch_enabled_worker_class_{employee,intern,seasonal,
--        volunteer} booleans — a recorded duplication to converge later)
--   hr.time_and_attendance / kiosk_pending_recheck_seconds  (default '10')
--   hr.time_and_attendance / web_punch_ip_verification      (default '"off"',
--        a coalesce fallback behind ip_verification_mode)
-- These three get seeded in scfg_10 BEFORE rung 4 is rewritten to RAISE.
--
-- Also noted: the org-blind two-arg hr._knob(feature,key) is used inside ~40
-- functions where an organization id IS in scope (approvals, workflow,
-- employees, relations, access...). Their org rung has never been read — a
-- pre-existing gap (REGISTER.md "org rung unread at 23 call sites"), recorded
-- as the post-cutover per-call-site sweep, NOT changed by scfg_12 (which keeps
-- each helper's resolution semantics identical apart from rung 4).

-- ----------------------------------------------------------------------------
-- CENSUS B — live org / sub-org overrides (the data the move touches)
-- ----------------------------------------------------------------------------
-- iam.organizations.settings->'hr': 8 orgs carry the key.
--   * 7 carry ONLY {"module_enabled": true} — NOT a register knob (it is the
--     module toggle read by hr_l1_01); it MUST survive every blob operation.
--   * EXACTLY ONE real knob override exists platform-wide:
--       org 2643e470-b275-47f3-95f3-ae275ad3ca47 ("Write Target Sandbox")
--       settings->'hr'->'time_and_attendance'->'kiosk_enabled' = true
-- Sub-org rungs: hr.employer_profile / hr.pay_group / hr.location `settings`
--   carry ZERO knob overrides (no non-empty settings at all). The scope-rung
--   write path (hr_knob_set p_scope_kind) has never produced a persisted row.
--
-- PARITY BASELINE (re-checked by scfg_12 after the body rewrite):
--   hr._hr_knob('hr.time_and_attendance','kiosk_enabled', 2643e470-..., null)
--     = true   (org override wins)
--   hr._hr_knob('hr.time_and_attendance','kiosk_enabled', f9cb3e35-..., null)
--     = false  (platform value)
--   platform.feature_knob value for that key = false

-- ----------------------------------------------------------------------------
-- CENSUS C — esign configuration register (folded in by scfg_30)
-- ----------------------------------------------------------------------------
-- esign.config_definition: 52 rows, 0 deleted, ALL owned by the system org
--   39c38960-d30c-4840-b0c1-c9960de95582 (de facto a platform register wearing
--   an org-scoped entity table). esign.config_value: 0 rows — every resolve
--   returns default_value today.
-- Vocabulary counts: 12 locked ('{}' overridable_by), directions lower_only/
--   raise_only in active use, ONE bound_value (token.ttl_days.hr_records_request
--   statutory floor 30), THREE value_type='json' keys (upload.allowed_mime,
--   reminder.cadence_days, reminder.quiet_hours).
-- Key mapping rule (deterministic, used by the scfg_30 wrappers):
--   feature = first two dot-segments, key = remainder.
--   e.g. 'esign.outsider.token.ttl_days.hr_records_request'
--        -> ('esign.outsider', 'token.ttl_days.hr_records_request')

-- ----------------------------------------------------------------------------
-- CONSTRAINTS / RLS FACTS
-- ----------------------------------------------------------------------------
-- platform.feature_knob CHECKs (live names, altered by scfg_01):
--   feature_knob_value_type_check: value_type IN
--     ('number','integer','boolean','string','enum')
--   feature_knob_set_by_check: set_by IN ('agent','human')
-- iam.apply_config_rls (captured below in spirit): its generated cfg_* policies
--   REQUIRE visibility + created_by + organization_id columns. knob_override is
--   a minimal registry table (no visibility/created_by — deliberately, to stay
--   under the ddl_guard sentinel budget and mirror feature_knob's registry
--   posture), so scfg_02 HAND-WRITES its RLS instead:
--     read  = organization_id IN (SELECT iam.my_orgs())  [set-wise, per D146]
--     write = none for clients; platform.knob_override_set is the only door.
--   Recorded as a deliberate deviation from apply_config_rls.
-- iam.my_orgs(): SELECT organization_id FROM iam.organization_member
--   WHERE user_id = (SELECT auth.uid())   [STABLE SECURITY DEFINER]

-- ----------------------------------------------------------------------------
-- LIVE BODIES BEING REPLACED (verbatim captures)
-- ----------------------------------------------------------------------------

-- hr._hr_knob — THE org-rung resolver (rewritten by scfg_12; rung 4 becomes RAISE)
CREATE OR REPLACE FUNCTION hr._hr_knob(p_feature text, p_key text, p_organization_id uuid, p_default jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
  select coalesce(
    -- rung 1: the organization's override, written by public.hr_knob_set
    case when p_organization_id is null then null
         else (select o.settings #> array['hr', split_part(p_feature,'.',2), p_key]
                 from iam.organizations o where o.id = p_organization_id) end,
    -- rung 2/3: the platform register, exactly as hr_knob_index resolves it
    (select coalesce(k.value, k.default_value) from platform.feature_knob k
      where k.feature = p_feature and k.key = p_key),
    -- rung 4: the caller's documented SPEC-TIME §13 default, for keys not yet seeded
    p_default);
$function$;

-- hr._punch_knob / hr._clock_knob — thin aliases over _hr_knob
CREATE OR REPLACE FUNCTION hr._punch_knob(p_key text, p_default jsonb, p_organization_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'hr', 'public'
AS $function$ select hr._hr_knob('hr.time_and_attendance', p_key, p_organization_id, p_default); $function$;

CREATE OR REPLACE FUNCTION hr._clock_knob(p_key text, p_default jsonb DEFAULT 'null'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'hr', 'public'
AS $function$
  -- `hr.clock` has no rows in platform.feature_knob; both availability switches are registered
  -- under `hr.time_and_attendance`, which is also where hr_knob_set writes their org overrides.
  select hr._hr_knob('hr.time_and_attendance', p_key, p_organization_id, p_default);
$function$;

-- hr._knob — the org-BLIND platform-register reader (missing knob RAISES; D13)
CREATE OR REPLACE FUNCTION hr._knob(p_feature text, p_key text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'hr', 'public'
AS $function$
declare v jsonb;
begin
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k where k.feature = p_feature and k.key = p_key;
  if v is null then
    raise exception 'hr._knob: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'D13: a missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;
  return v;
end
$function$;

-- platform.extensibility_knob — org branch (lines with the hardcoded lock list)
-- is rewritten by scfg_20; definition/target column branches stay ("a knob is
-- not a rule"). Full live body as of capture:
--   rung 1: platform.custom_entity_definition columns (p_definition_id)
--   rung 2: platform.custom_field_target columns (p_target_token)
--   rung 3: iam.organizations.settings->'extensibility'->p_key, gated by
--           p_key NOT IN ('custom_fields.promoted_indexes_per_target',
--                         'custom_entities.record_name_backfill_batch',
--                         'tier3.enabled')          <-- the hardcoded lock list
--   rung 4: platform.feature_knob (feature='extensibility'), RAISE P0001 if unseeded
-- (verbatim body preserved in repo at migrations/ext_07_extensibility_knobs.sql)

-- esign.config_resolve / config_set / resolve_config_snapshot: verbatim bodies
-- preserved in repo at migrations/esign_02_config_and_disclosure.sql. Live
-- capture confirms they match, and that config_set's structured refusal
-- envelope + the typed/drawn cross-key predicate + the sensitive-envelope
-- forced email_code factor are the behaviors scfg_30's wrappers must preserve.

-- public.hr_knob_set / hr_knob_index / hr_knob_clear: verbatim bodies preserved
-- in repo at migrations/hr_l1_05_settings_writes.sql and
-- hr_l1_09_settings_door_completeness.sql; live capture confirms current shape,
-- including hr_knob_index's platform_locked: null projection ("the register has
-- no column that can express a locked key" — resolved by scfg_01) and
-- hr_knob_clear's RECORDED DECISION 21 (clearing REMOVES the key, never null).
