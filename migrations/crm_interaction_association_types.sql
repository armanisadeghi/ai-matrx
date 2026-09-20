-- crm_interaction_association_types.sql
--
-- F-20 (VERIFY-B1-B2-R2 A5/D7): the three association pairs a Gmail send writes
-- are not DECLARED, so they convey nothing by ABSENCE rather than by decision.
--
-- `features/crm/gmail/associations.ts` writes, through the registered `assoc_add`
-- path, one edge per target when a message is sent from a record:
--   crm_interaction -> party      (the Person the message went to)
--   crm_interaction -> crm_deal   (the deal it advances, when composed from one)
--   crm_interaction -> project    (the project it belongs to, when composed from one)
--
-- Live today (verified 2026-09-17 by a read through the Supabase MCP):
-- `platform.association_types` holds `crm_deal -> party`, `party -> party` and
-- `party -> project`, and NO row for any of the three above. `assoc_for_entity`
-- does not filter on this table, so the edges read back — but nothing states what
-- they may convey, and the next reader of the register sees a pair nobody decided
-- on rather than a pair decided to convey nothing.
--
-- THE DECISION THIS FILE RECORDS
--
-- * `container_side = 'target'` — the Person (or the deal, or the project) is the
--   container: a sent message has no independent existence, and whoever may see
--   the record may see what was sent from it.
-- * `conveys_max = 'viewer'` — VIEW, never edit. An association to a message must
--   never hand anybody edit rights on the Person, the deal or the project, and
--   `crm_deal -> party` already caps at viewer for the same reason.
-- * `allows_loops` stays false (default): an interaction is never its own target.
--
-- NOT APPLIED BY THIS LANE. The chair applies it (`pnpm db:apply
-- migrations/crm_interaction_association_types.sql`), and the applier — never a
-- file, never an agent — writes the `public._schema_migrations` row.
--
-- JUDGEMENT (migrations/JUDGMENT.md): deliberately HEADER-LESS, so it is judged at
-- `--target production` by the DENY-LIST. `INSERT INTO platform.association_types`
-- is not one of the registry tables the production ALLOW-LIST enumerates, so a
-- header naming production would refuse this file by name. The body carries no
-- DROP, REVOKE, TRUNCATE, DELETE, UPDATE, ALTER or policy — one INSERT with
-- `ON CONFLICT DO NOTHING`, which is why it is re-runnable and why it is additive
-- in the deny-list's own sense. It REPLACES NO FUNCTION BODY, so it carries no
-- `-- based-on:` line (DD-220 requires one only for a `CREATE OR REPLACE` of a
-- live function). The filename holds no numeric slot, so it cannot collide with
-- one (`migrations/migration_slot_guard.sql`).

insert into platform.association_types
  (source_type, target_type, container_side, conveys_max, is_active, notes)
values
  ('crm_interaction', 'party', 'target', 'viewer', true,
   'A message sent from a Person''s record, written by features/crm/gmail/associations.ts with role gmail_send. The Person is the container; the edge conveys VIEW at most and never edit.'),
  ('crm_interaction', 'crm_deal', 'target', 'viewer', true,
   'A message sent while standing on a deal. The deal is the container; the edge conveys VIEW at most.'),
  ('crm_interaction', 'project', 'target', 'viewer', true,
   'A message composed from a project. The project is the container; the edge conveys VIEW at most. A CRM table may not depend on a project FK (db-rules 6d), so this edge IS the link.')
on conflict (source_type, target_type) do nothing;
