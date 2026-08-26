-- HRB-003 / P3 — THE PRIVACY WALL, part 1 of 2: the declaration column.
--
-- SPEC-ACCESS §3.5 (D14.1, widened by D19): AI Matrx staff get NO read arm on
-- customer HR medical, investigation, secret and PAY data. The mechanism is one
-- boolean on the entity registry that the access generator honours — a FLAG ON
-- AN EXISTING GENERATOR, not a new access primitive (AD-2's ban stands).
--
-- This file adds only the column, defaulted false, so nothing changes for any of
-- the 400+ live tokens. The generator half is
-- `hr_p3_suppress_platform_admin_lane_generator.sql`, which lands only after the
-- head-to-head re-proof required by db-rules §6d (kernel-change discipline).
--
-- Idempotent. Applied live 2026-08-26 as migration
-- `hr_p3_suppress_platform_admin_lane_column`.

alter table platform.entity_types
  add column if not exists suppress_platform_admin_lane boolean not null default false;

comment on column platform.entity_types.suppress_platform_admin_lane is
  'THE PRIVACY WALL (SPEC-ACCESS §3.5, D14.1/D19). When true, iam.apply_rls '
  'generates this token WITHOUT the platform_admin_all policy, without the '
  'is_platform_admin() prefix arm on every policy, and without the '
  'is_super_admin() arms on the restricted lane and the entity system-org INSERT '
  'lane. Reserved for the four promised classes — medical, investigations, '
  'secrets, pay. It is not a general tightening knob: setting it on a table '
  'outside those classes removes a support lane we have promised nothing about, '
  'which is the over-tightening defect db-rules §6 weighs equally with a leak. '
  'Changing it requires re-running iam.apply_rls for the token.';
