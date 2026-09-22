-- additive: yes — ONE insert into `platform.feature_knob`, the platform's own register of
--   behavioural settings. No DDL, no DROP, no REVOKE, no grant, no function body replaced, and
--   no row of anybody's data touched. The knob's default is FALSE, so this file changes nothing
--   anybody sees until an organization decides otherwise through its own door.
-- lock: platform
-- lane: OLD-TABLES-2
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- OLD-TABLES-CUTOVER rev 2, W6 (this lane's W4) — THE ROLLOUT IS AN ORGANIZATION'S DECISION.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- W1 gave the older estate a `relation` field type, W2 gave it a words door and W3 taught the
-- readers. Whether a given organization's people can CREATE one is not an engineering question
-- and it is certainly not an agent's: it is a behavioural choice, so it is a knob with a
-- sensible default, and organizations decide.
--
-- WHAT THIS ROW IS, AND WHAT IT IS NOT. `platform.feature_knob` holds the PLATFORM DEFAULT.
-- It is not any organization's to change, and nothing in this campaign writes to it again: a
-- per-organization value is a row in `platform.knob_override`, written through
-- `platform.knob_override_set(feature, key, scope_kind, scope_id, organization_id, value, note)`
-- — which checks that the caller is an owner or admin of THAT organization and files the audit.
-- (The attacker's H6/M5, sustained: rev 1 of the plan proposed flipping the `feature_knob` row
-- per organization, which would have made one organization's choice everybody's.)
--
-- THE DEFAULT IS FALSE, DELIBERATELY. 155 live tables carry 938 columns and not one of them is
-- a relation today. A column type that appears in every organization's picker the moment it
-- lands is a change nobody asked for; a column type an organization turns on is a decision
-- somebody made. `admin's Workspace` goes first (it already holds the Rincon dispatch board
-- this campaign was built against), then `Matrx System`, then by ascending row count.
--
-- WHY THE KEY IS `relation_columns_enabled` AND NOT `enabled`. `platform.feature_knob` carries
-- a delete guard, `knob_delete_refuses_a_live_reader`, that refuses to remove a row whose
-- QUOTED KEY appears in any function body in the database — because `knob_resolve` raises on a
-- missing key, so deleting a row a function still reads takes that function down (it was written
-- after a convergence migration deleted the punch gate's own key with a LIKE pattern). The word
-- `'enabled'` appears inside EIGHTEEN unrelated function bodies, so a key called `enabled` can
-- never be removed: this file's own inverse failed on the clone with all eighteen named. The key
-- is therefore specific enough to be unique in the database — measured: 0 occurrences — which is
-- what makes the inverse runnable at all.
--
-- THE KNOB GATES CREATION, NEVER READING. A column already created keeps working if the
-- override is removed: it is DATA, and a knob that could blank a column somebody filled in
-- would be a knob that deletes work. The inverse below removes only the register row.
-- ══════════════════════════════════════════════════════════════════════════════════════════

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('data_tables.relation', 'relation_columns_enabled',
   'false'::jsonb, 'false'::jsonb, 'boolean',
   'Columns that point at another table',
   'Lets people add a column to a data table whose value is a RECORD of another table — a '
   || 'service call naming its customer, an invoice naming its job. The cell stores the '
   || 'record''s identifier and the screen shows that record''s name, so renaming the customer '
   || 'renames it everywhere at once and nothing has to be typed twice. Off by default because '
   || 'no table in the estate has one yet and a new column type appearing unannounced in '
   || 'everybody''s picker is a change nobody asked for. Turning it off again never affects a '
   || 'column that already exists — those keep working, because they are data.',
   'agent',
   'OLD-TABLES-CUTOVER rev 2 (2026-09-22), W6: the rollout is per organization, default off, '
   || '`admin''s Workspace` first, then `Matrx System`, then by ascending row count. Read by '
   || 'matrx-frontend features/data-tables/relation-knob.ts, which gates the `relation` entry '
   || 'in the field-format picker. This row is the platform default; a per-organization value '
   || 'is a platform.knob_override row written through platform.knob_override_set.',
   (current_date + 30),
   array['organization']::text[],
   'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
