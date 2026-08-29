-- scfg_01_register_overridability.sql
-- ============================================================================
-- SCOPED CONFIGURATION Phase 1a — the register learns who may override it.
--
-- platform.feature_knob stays THE single registry (no second registry, ever).
-- This migration gives it the three columns whose absence blocked a spec
-- requirement three recorded times (hr-domain AMENDMENT-QUEUE L316-330,
-- "to be designed with Wave B, not patched per-lane" — this is Wave B):
--
--   overridable_by     text[]  which scope kinds (platform.knob_scope_kind)
--                              may override this knob. '{}' = platform-locked.
--                              This replaces esign's identical column, HR's
--                              metadata->>'platform_locked' (a key on a column
--                              that never existed), and extensibility_knob's
--                              hardcoded NOT IN list — three encodings of the
--                              same idea, now one column.
--   override_direction 'any' | 'lower_only' | 'raise_only' — enforced by
--                              platform.knob_override_set for numeric types,
--                              compared against the LIVE platform rung
--                              (coalesce(value, default_value)). Enum-ordering
--                              directions (e.g. esign's "may not lower a
--                              verification factor to none") stay in the
--                              owning feature's wrapper: a generic register
--                              cannot know an enum's ordering.
--   bound_value        jsonb   a statutory floor distinct from the default
--                              (e.g. esign records-request TTL floor 30).
--
-- value_type additionally admits 'json' (arrays/objects) — clearing the
-- third-lane CSV debt (SPEC-TIME §13, SPEC-ACCESS §10, SPEC-LEAVE §15 all
-- shipped array knobs as CSV strings because the CHECK refused them). A 'json'
-- knob carries no min/max/allowed_values.
--
-- CURATION RULE (recorded here, binding on every future seed): re-runnable
-- knob seed migrations NEVER touch overridable_by / override_direction /
-- bound_value on conflict — overridability is curated in dedicated migrations,
-- protected exactly like a human-set value.
--
-- Backfill: every existing row defaults to '{}' (platform-locked). SAFE ONLY
-- because nothing resolves overrides through the register yet; scfg_10/20/30
-- declare each feature's overridable keys BEFORE its resolver is rewritten.
-- ============================================================================

alter table platform.feature_knob
  add column if not exists overridable_by text[] not null default '{}',
  add column if not exists override_direction text not null default 'any',
  add column if not exists bound_value jsonb;

alter table platform.feature_knob
  drop constraint if exists feature_knob_value_type_check;
alter table platform.feature_knob
  add constraint feature_knob_value_type_check
  check (value_type in ('number','integer','boolean','string','enum','json'));

alter table platform.feature_knob
  drop constraint if exists feature_knob_override_direction_check;
alter table platform.feature_knob
  add constraint feature_knob_override_direction_check
  check (override_direction in ('any','lower_only','raise_only'));

alter table platform.feature_knob
  drop constraint if exists feature_knob_json_no_range_check;
alter table platform.feature_knob
  add constraint feature_knob_json_no_range_check
  check (value_type <> 'json'
         or (min_value is null and max_value is null and allowed_values is null));
