-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- THE UNIFIED-DATA CAMPAIGN'S GUARD REGISTER — one platform.feature_knob row per
-- production object the campaign touches, every one of them OFF.
--
-- WHY THIS FILE EXISTS FIRST
-- --------------------------
-- The campaign's promise is that everything it lands on production is additive
-- and reversible, because every shared object it changes is read through a
-- feature knob that is OFF until the switch. That promise had no rows behind it:
-- platform.feature_knob held 728 rows on production and ZERO on the rehearsal
-- branch, no lane owned the register, and platform.knob_resolve ends its lookup
-- with
--
--     if not found then
--       raise exception 'platform.knob_resolve: knob %.% is not seeded'
--         using errcode = 'P0001'
--
-- So on the branch every guarded object raised the moment it was exercised
-- (reproduced live on 2026-09-16), and on production the first guarded object
-- applied ahead of its knob row would have taken a live write path down with
-- P0001. This file is what the runner's `-- guard:` line can point AT.
--
-- THERE IS NO `system` RUNG, AND THERE NEVER WAS
-- ----------------------------------------------
-- platform.knob_scope_kind holds exactly eleven rungs — organization,
-- employer_profile, brand, pay_group, site, location, table, agent, rulebook,
-- device, user — and `system` is not among them. Nothing needs to be added: the
-- PLATFORM VALUE of a knob is its own base, `coalesce(value, default_value)`,
-- which is precisely what `platform.knob_resolve(feature, key, null)` returns
-- when no organization is passed. Every row below is seeded with
-- value = default_value = false, so the platform value is false, so the guard is
-- OFF everywhere until somebody writes an override through the knob door.
--
-- THE KEY IS TWO COLUMNS. platform.feature_knob's primary key is
-- `(feature, key)`. The runner's header line is therefore `-- guard: <feature>/<key>`.
--
-- IDEMPOTENT BY CONSTRUCTION. `on conflict do nothing` — applying this file twice
-- has the same result as applying it once, and it never overwrites a value a
-- human has already set through the knob door. Its inverse is
-- `custom_campaign_knob_register_down.sql`, in this same commit.
--
-- WHAT IS ON THIS LIST, AND WHAT THE BOOK GOT WRONG (measured 2026-09-16)
-- ----------------------------------------------------------------------
-- The build book's §6.6 named seven objects and called them eight in three
-- places. Corrected here against the live catalogue:
--   · platform.custom_field_index_expr is a FUNCTION (text, text, text), not a
--     table.
--   · iam.member_default_level DOES NOT EXIST — no function, no table, in any
--     schema. It gets no knob, because a guard for an object that is not there
--     is exactly the paper this file replaces.
--   · the emergency door is one table, iam.emergency_door_request (0 rows).
--   · the signup-provisioning function is public._provision_new_user_personal_org(),
--     reached by the `on_auth_user_created` trigger on auth.users — it was on no
--     list, and a lane's own exit proof replaces it on production.
--   · history.row_versions.row_data is NOT NULL over 1,275,409 rows — also on no
--     list, and a lane exists to change it.
--   · platform.feature_knob itself is touched by this campaign — by THIS file,
--     rows only, no DDL. It is named in the book rather than guarded: a register
--     cannot be guarded by a row inside itself.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'system_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Unified data system enabled',
   'THE product switch for the unified custom-data system. OFF means schema custom is '
   'unreachable: absent from pgrst.db_schemas, revoked from every role including '
   'service_role, and absent from the ORM''s generate blocks. This knob is a PRODUCT '
   'switch and is never the security boundary — the revokes are.',
   'agent', 'Unified data campaign, 2026-09-16: the switch the whole build hides behind.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'code_paths_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Unified data campaign code paths enabled',
   'The CODE half of the OFF switch, read by matrx-frontend and by aidream. The '
   'campaign''s database changes land behind per-object guards, but its code ships to '
   'production continuously — any other lane''s release commit builds the whole pushed '
   'range, and the aidream train ships main every 20-30 minutes. Every campaign code '
   'path is inert while this is false.',
   'agent', 'Unified data campaign, 2026-09-16: pushed campaign code must be harmless.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'associations_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: platform.associations columns and triggers',
   'Read by the new code inside platform.validate_edge_payload() and '
   'platform.trg_reachability_on_association(), and by any policy over the columns this '
   'campaign adds to platform.associations. OFF means the old body runs unchanged. '
   'platform.associations carries 33,808 rows and thirteen user triggers and is in the '
   'supabase_realtime publication.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'entity_types_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: platform.entity_types attributes',
   'Read by the new code over platform.entity_types'' campaign attributes. OFF means the '
   'registry answers exactly as it did. The seventh table type `detail` is NOT behind '
   'this knob: it is two CHECK constraints (entity_types_rls_variant_valid and '
   'entity_types_rls_variant_check) with three dependent constraints, and a constraint '
   'cannot be hidden by a flag — it is its own migration with its own inverse.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'field_index_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: the custom-field index generator',
   'Read by the generator around platform.custom_field_index_expr(text, text, text) — a '
   'FUNCTION, not a table — and by platform.custom_field_index_ddl / '
   'promote_custom_field_index. The guard is on the GENERATOR, never inside the IMMUTABLE '
   'expression function, which may not read a table at all.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'accessible_entity_ids_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: iam.accessible_entity_ids',
   'Read by both overloads — (text, permission_level, integer) and (text, '
   'permission_level, integer, boolean) — which are STABLE and are called from inside '
   'RLS. OFF means the predicate answers the same set of ids for every principal as it '
   'does today; that answer identity, per principal, is the proof — never a prosrc '
   'comparison, which cannot hold once the body reads a knob.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'emergency_door_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: the emergency door',
   'Read by the new code over iam.emergency_door_request (0 rows on production). OFF '
   'means the door behaves exactly as it does today.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'entity_custom_fields_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: the custom_fields column on a standard Entity table',
   'Read by everything that WRITES or INTERPRETS the campaign''s custom_fields column. '
   'Note what this knob cannot do: a COLUMN cannot be hidden by a flag. 63 tables sit in '
   'the supabase_realtime publication and Realtime ships whole rows, and PostgREST '
   'select(''*'') returns a new column the instant it lands — so the lane that adds it '
   'must NAME the table it is added to and state that the column is visible, and only '
   'its meaning is OFF.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'signup_provisioning_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: the signup-provisioning function',
   'Read by public._provision_new_user_personal_org(), which the on_auth_user_created '
   'trigger on auth.users runs for every new user. OFF means a new signup is provisioned '
   'exactly as it is today. This object was on no guard list until 2026-09-16 while a '
   'lane''s own exit proof replaced it on production.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb),

  ('custom', 'row_versions_guard', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Guard: history.row_versions.row_data',
   'Read by the writer that would store a version without its row_data. OFF means every '
   'version is written exactly as it is today. history.row_versions holds 1,275,409 rows '
   'and row_data is NOT NULL; dropping that NOT NULL is not additive and is not covered '
   'by this knob — the knob covers the WRITER, and the constraint change is its own '
   'migration with its own inverse.',
   'agent', 'Unified data campaign, 2026-09-16.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)

on conflict (feature, key) do nothing;
