-- REACH — `iam.content_lane` IS REGISTERED, AND IT IS MACHINERY.
--
-- `iam.content_lane` is the table behind the four visibility lanes (mine ·
-- organization · world) — one row per resource saying which lane it is in, whether
-- it is discoverable, whether link sharing is on, and who put it into the world.
-- It has existed on this database with RLS enabled, no policies, no table grants to
-- any client role, and NO ROW IN `platform.entity_types`, which means the platform's
-- own registry does not know it exists. An unregistered table is invisible to every
-- census, every RLS regeneration and every audit that works off the registry — it is
-- not "safe by omission", it is unmeasured.
--
-- WHAT IT IS CLASSIFIED AS, AND WHY EACH WORD:
--
--   audit_class = 'machinery'. It is not somebody's content; it is the switchboard
--   the access system reads. `iam.memberships`, `iam.permissions` and
--   `iam.invitations` carry the same word for the same reason: rows here CREATE
--   reach rather than being reached.
--
--   type = 'system', which is what the registry DERIVES from audit_class =
--   'machinery' — so it carries no `type_reason`, because there is nothing to
--   explain that the derivation does not already say.
--
--   rls_variant = 'restricted' — the tightest lane there is. Today no client role
--   holds any privilege on this table and its RLS has no policies, so nothing in
--   this row changes who can reach it; what the word does is make sure that if RLS
--   is ever regenerated from the registry, it is regenerated CLOSED rather than as a
--   generic entity table with member-visible rows.
--
--   is_versioned = false, has_soft_delete = false. Measured, not assumed: the table
--   has no `id`, no `deleted_at` and no version column — its key is
--   (resource_type, resource_id) and a lane change overwrites in place.
--
--   default_list_scope is NULL because the `ledger`/`restricted` check constraint
--   and the table's own shape agree: nothing lists these rows as content.
--
-- ADDITIVE: one row in our own registry. It grants nothing, revokes nothing, creates
-- no policy and does not touch the table.
--
-- THE INVERSE: migrations/inverse/reach_the_content_lane_is_machinery_down.sql.

set lock_timeout = '5s';
set statement_timeout = '600s';

insert into platform.entity_types
  (token, schema_name, table_name, label, base_tier,
   is_versioned, has_soft_delete, is_active,
   rls_variant, audit_class, audit_class_reason, type,
   data_class, data_class_reason, origin, table_ref, notes)
values (
  'content_lane', 'iam', 'content_lane', 'Content Lane', 1,
  false, false, true,
  'restricted', 'machinery',
  'MACHINERY: the visibility-lane switchboard. One row per resource says which of the four lanes (mine / organization / world) it is in, whether it is discoverable, whether link sharing is on, and who entered it into the world - so a row here CREATES reach for a resource rather than being a resource anybody reaches. iam.has_access and the world-publish admission read it; no client role holds any privilege on it and its RLS carries no policies.',
  'system',
  'private',
  'Access machinery, not content: it is read by the resolver and written by the publish path, never listed or opened by a person.',
  'standard', 'iam.content_lane',
  'Registered 2026-09-19 by lane REACH. Keyed (resource_type, resource_id) - no id, no deleted_at, no version column, so is_versioned and has_soft_delete are false as measured rather than as defaulted.')
on conflict (token) do nothing;
