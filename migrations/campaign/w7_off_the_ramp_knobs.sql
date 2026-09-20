-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- W7-OFF — THE RAMP'S KNOBS: one row per consumer, every one of them OFF.
--
-- WHY A KNOB PER CONSUMER AND NOT ONE SWITCH
-- ------------------------------------------
-- CUT-3's law is that existing data moves CONSUMER BY CONSUMER and that Test 1
-- gates each consumer's switch. A single `custom/code_paths_enabled` cannot
-- express that: it is the campaign's kill switch, one answer for the whole
-- platform, and it is the thing that must stay false while any consumer is
-- being ramped. So the ramp is a SECOND rung of rows — one per consumer —
-- resolved through the SAME `platform.feature_knob` / `platform.knob_override`
-- ladder every other knob in the platform uses, with
-- `platform.knob_resolve(feature, key, organization_id, user_id, null)` doing
-- the resolution. There is no new resolver and no new ladder.
--
-- THE SHAPE, AND WHY IT IS THIS SHAPE
-- -----------------------------------
--   · platform value  — `false`, always. There is no `system` rung and the
--     platform value is never what gets flipped: §11.2 says the switch is an
--     override at the `organization` rung through
--     `platform.knob_write_door_for`.
--   · overridable_by  — `{organization, user}`. The organization rung is the
--     unit of the ramp (§11.2); the user rung is the per-user override the
--     person building a consumer needs while everyone else stays off.
--   · override_direction `any` — a ramp has to be able to go back down, and a
--     `raise_only` knob is a switch that cannot be turned off.
--
-- A knob here is NOT an object guard (§6.6's ten). Those hold a production
-- object's changed BEHAVIOUR off. These hold a CONSUMER's read path off, which
-- is a different question with a different answer per organization.
--
-- IDEMPOTENT: `on conflict do nothing`, like the guard register. Applying this
-- file twice changes nothing, and it never overwrites a value a chair has set.
--
-- THE CONSUMER LIST IS NOT HERE. It lives in `campaign_watch.ramp_consumer`
-- (`w7_off_the_switch_machinery.sql`), which is the one place both the screen
-- and the gate read. This file seeds the knob ROW for each consumer id in that
-- table; the two files name the same eight ids and the machinery file's own
-- check asserts every consumer has its knob.

set lock_timeout = '3s';
set statement_timeout = '2min';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'consumer_grid_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: the data grid reads the unified store',
   'CUT-3''s ramp, one consumer. While false the grid reads the old table for this '
   'organization. Flipped at the organization rung through platform.knob_write_door_for, '
   'never as a platform value, and only after this consumer''s Test 1 gate is green for '
   'this organization.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_saved_ai_outputs_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: saved AI outputs read the unified store',
   'CUT-3''s ramp, one consumer. While false saved AI outputs read the old table for this '
   'organization.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_scopes_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: scopes read the unified store',
   'CUT-3''s ramp, one consumer. Ramped in one batch with education and checkout (§11.12), '
   'which is the chair''s proposed order, not a ruling.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_education_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: education reads the unified store',
   'CUT-3''s ramp, one consumer. Ramped in one batch with scopes and checkout (§11.12).',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_checkout_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: checkout reads the unified store',
   'CUT-3''s ramp, one consumer. Ramped in one batch with scopes and education (§11.12).',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_extension_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: the Chrome extension reads the unified store',
   'CUT-3''s ramp, one consumer. The extension talks to the same doors the web client does, '
   'so it carries its own rung rather than riding the grid''s.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_chat_seeding_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: chat seeding reads the unified store',
   'CUT-3''s ramp, one consumer.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'consumer_retirement_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: the old stores are retired',
   'CUT-3''s ramp, LAST and the only step with no rollback (§11.12). The switch screen shows '
   'that sentence beside this row and refuses it like any other red gate; turning it on is '
   'the owner''s call, never an agent''s.',
   'agent', 'Unified data campaign W7-OFF, 2026-09-19: CUT-3, the ramp is the unit.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb)

on conflict (feature, key) do nothing;
