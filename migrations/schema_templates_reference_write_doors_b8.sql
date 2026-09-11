-- schema_templates_reference_write_doors_b8.sql
-- ---------------------------------------------------------------------------
-- B-8 / DD-033 — `workbench.schema_templates` is REFERENCE data. Clients read
-- it; only a platform administrator (or the server) writes it.
--
-- WHAT WAS OPEN (reproduced live on brsgrqvjdzwihsvnfqkf, 2026-09-11, in a
-- rolled-back transaction, as `authenticated` with the real jwt `sub` of
-- test@test.com — a non-admin who belongs to 2 organizations, neither of which
-- has anything to do with these rows):
--
--   RED-1 UPDATE ... where template_name='Flashcards'   -> SUCCEEDED, rows=1
--   RED-2 DELETE ... where template_name='CategoryDetails' -> SUCCEEDED, rows=1
--   RED-3 INSERT ('__b8_probe', ...)                    -> SUCCEEDED
--
-- B-6 closed the `anon` half of this (the published anon key could do the same
-- thing with no account at all) and deliberately left the `authenticated` half
-- open, recording it on the table comment as an owner decision. This migration
-- closes it.
--
-- WHY "REFERENCE" AND NOT AN ENTITY RETROFIT — the two options B-8 weighed:
--
--   (a) Org-owned Entity. The canonical path (base contract + entity_types +
--       iam.apply_rls) needs `organization_id NOT NULL` on all five existing
--       rows, and db-rules §0.9 (Arman, 2026-08-21 / 2026-08-23) is absolute:
--       the database never chooses, creates, copies, inherits or defaults an
--       organization. These rows carry NO organization, NO creator and no other
--       attribution column at all (`id, template_name, description, fields,
--       version, created_at`), and they predate organizations — all five were
--       created 2025-05-15/16. There is therefore no fact in the database from
--       which their owner could be derived; only Arman can say. That is a
--       different move from `workbench_udt_canonical_step1_base_retrofit.sql`,
--       which succeeded precisely because those four tables ALREADY carried
--       `organization_id` and `created_by`.
--
--   (b) Reference data — TAKEN. What the rows actually are: five field-shape
--       definitions (`Flashcards`, `CategoryDetails`, `DataSet`,
--       `Fake People Template`, `My new template`), carrying schema shapes and
--       no user content (discovery D13 §3: 5/5 `fields` values are arrays, 0
--       object keys, "Template field arrays"). Nobody's private work is in
--       them, they are shared by every reader, and both D2 and D13 rule the
--       table "retire, or fold into `custom.template`" — so building full
--       entity ownership onto it would create a sixth custom-data
--       implementation that the Doctrine then has to migrate away again.
--
--   They are NOT platform-shipped starter templates either: no migration in
--   this repo or in aidream inserts them, so a fresh install ships ZERO rows.
--   They are dev-era artifacts of one person's testing through the demo UI
--   ("My new template" is a field-for-field copy of "Flashcards"). Reference is
--   the honest type for them TODAY; retire-or-fold stays the destination, and
--   stays DD-033.
--
-- WHAT "REFERENCE" MEANS HERE, exactly:
--   * `anon`          — nothing (already true, B-6; guarded by check:impl-doors D3).
--   * `authenticated` — SELECT only. The live read path
--                       (`utils/user-table-utls/template-utils.ts`
--                       getSchemaTemplates / getSchemaTemplateById) keeps working
--                       unchanged as the signed-in user.
--   * writes          — `service_role` (unchanged, the server's bypass lane) and
--                       platform admins through the three SECURITY DEFINER doors
--                       below, each gated on `public.is_admin()` (→ `admin.admins`).
--
-- RLS stays OFF and that is not an oversight: with SELECT-only for clients and
-- no write grant, the table GRANT *is* the whole access decision, and db-rules
-- §0.5 / §6d forbid hand-writing a per-table policy while §6d-2's safety rail
-- refuses `iam.apply_table_grants` on a table with RLS off and zero policies.
-- `iam.apply_rls` is unreachable anyway: the table has no `platform.entity_types`
-- row, so there is no token to key on, and no owner column for a policy to use.
--
-- THE DOORS (db-rules §6d-4): each is declared in `platform.client_callable_door`
-- BEFORE its GRANT, or the DB-wide event trigger takes the client EXECUTE back
-- inside the GRANT statement and the door 403s silently.
--
--   public.admin_create_schema_template(text, text, jsonb, integer) -> uuid
--   public.admin_update_schema_template(uuid, text, text, jsonb, integer) -> void
--   public.admin_delete_schema_template(uuid) -> void
--
-- NOTHING FAILS SILENTLY: a non-admin caller gets a real 42501 carrying a human
-- sentence that says who may do this and what to do instead — never a 0-row
-- no-op that a UI can report as success.
--
-- Idempotent (REVOKE/GRANT/CREATE OR REPLACE/ON CONFLICT are all re-runnable).
-- Reversible: `grant insert, update, delete on table workbench.schema_templates
-- to authenticated;` restores the previous (open) state.
-- Ledger: public._schema_migrations (source 'matrx-frontend').
-- ---------------------------------------------------------------------------

-- ── A. The refusal sentence, in ONE place so the three doors cannot drift ────

CREATE OR REPLACE FUNCTION public._schema_template_write_denied_message()
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO ''
AS $fn$
  SELECT 'Schema templates are shared platform reference data, not your own '
      || 'content: all five are read by everyone and belong to no organization, '
      || 'so only a platform administrator can create, change or delete one. '
      || 'Ask an administrator if a template needs to change. To build a shape '
      || 'of your own, create your own table or dataset instead.'
$fn$;

-- ── B. Declare the three doors BEFORE granting EXECUTE (db-rules §6d-4) ──────

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
VALUES
  ('public', 'admin_create_schema_template',
   'p_template_name text, p_description text, p_fields jsonb, p_version integer',
   'B-8 (DD-033)',
   'The only client write path to workbench.schema_templates (REFERENCE data). '
   'Refuses every caller that is not in admin.admins, with a human sentence.'),
  ('public', 'admin_update_schema_template',
   'p_id uuid, p_template_name text, p_description text, p_fields jsonb, p_version integer',
   'B-8 (DD-033)',
   'Admin-only edit door for workbench.schema_templates (REFERENCE data). '
   'Refuses every caller that is not in admin.admins, with a human sentence.'),
  ('public', 'admin_delete_schema_template',
   'p_id uuid',
   'B-8 (DD-033)',
   'Admin-only delete door for workbench.schema_templates (REFERENCE data). '
   'Refuses every caller that is not in admin.admins, with a human sentence.')
ON CONFLICT (schema_name, function_name, identity_args) DO NOTHING;

-- ── C. The doors ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_schema_template(
  p_template_name text,
  p_description   text DEFAULT '',
  p_fields        jsonb DEFAULT NULL,
  p_version       integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '%', public._schema_template_write_denied_message()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template_name IS NULL OR btrim(p_template_name) = '' THEN
    RAISE EXCEPTION 'A schema template needs a name.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_fields IS NULL
     OR jsonb_typeof(p_fields) <> 'array'
     OR jsonb_array_length(p_fields) = 0 THEN
    RAISE EXCEPTION 'A schema template needs at least one field, as a JSON array.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO workbench.schema_templates (template_name, description, fields, version)
  VALUES (btrim(p_template_name), coalesce(p_description, ''), p_fields,
          coalesce(p_version, 1))
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_schema_template(
  p_id            uuid,
  p_template_name text DEFAULT NULL,
  p_description   text DEFAULT NULL,
  p_fields        jsonb DEFAULT NULL,
  p_version       integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_found integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '%', public._schema_template_write_denied_message()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template_name IS NULL AND p_description IS NULL
     AND p_fields IS NULL AND p_version IS NULL THEN
    RAISE EXCEPTION 'Nothing to update — send at least one of name, description, fields or version.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_template_name IS NOT NULL AND btrim(p_template_name) = '' THEN
    RAISE EXCEPTION 'A schema template needs a name.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_fields IS NOT NULL
     AND (jsonb_typeof(p_fields) <> 'array' OR jsonb_array_length(p_fields) = 0) THEN
    RAISE EXCEPTION 'A schema template needs at least one field, as a JSON array.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Fields changed and no explicit version supplied -> bump. Same rule the
  -- frontend used to apply with a separate read + write; it belongs here, where
  -- it cannot race.
  UPDATE workbench.schema_templates t
     SET template_name = coalesce(btrim(p_template_name), t.template_name),
         description   = coalesce(p_description, t.description),
         fields        = coalesce(p_fields, t.fields),
         version       = coalesce(
                           p_version,
                           CASE WHEN p_fields IS NOT NULL
                                THEN coalesce(t.version, 0) + 1
                                ELSE t.version END)
   WHERE t.id = p_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN
    RAISE EXCEPTION 'No schema template with id %.', p_id
      USING ERRCODE = 'no_data_found';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_delete_schema_template(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_found integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '%', public._schema_template_write_denied_message()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM workbench.schema_templates WHERE id = p_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN
    RAISE EXCEPTION 'No schema template with id %.', p_id
      USING ERRCODE = 'no_data_found';
  END IF;
END
$fn$;

-- ── D. Grants: clients READ the table and CALL the doors; nothing else ───────

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
  ON TABLE workbench.schema_templates FROM authenticated;
GRANT SELECT ON TABLE workbench.schema_templates TO authenticated;
-- `anon` stays at zero (B-6). `service_role` keeps ALL — the server's bypass lane.

REVOKE ALL ON FUNCTION
  public.admin_create_schema_template(text, text, jsonb, integer),
  public.admin_update_schema_template(uuid, text, text, jsonb, integer),
  public.admin_delete_schema_template(uuid),
  public._schema_template_write_denied_message()
  FROM public, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_create_schema_template(text, text, jsonb, integer),
  public.admin_update_schema_template(uuid, text, text, jsonb, integer),
  public.admin_delete_schema_template(uuid)
  TO authenticated;

-- ── E. Say on the table what it now is ──────────────────────────────────────

COMMENT ON TABLE workbench.schema_templates IS
  'REFERENCE data (typed B-8, 2026-09-11): a shared catalog of user-generated-table '
  'field templates — 5 rows, created 2025-05-15/16, carrying field shapes and no user '
  'content, belonging to no organization and no creator. Clients READ it; every write '
  'goes through public.admin_{create,update,delete}_schema_template (gated on '
  'admin.admins) or service_role. anon holds nothing (B-6). RLS is OFF by design here: '
  'the table is not in platform.entity_types so iam.apply_rls has no token, it has no '
  'owner column for a policy to key on, and no per-table policy may be hand-written '
  '(db-rules §0.5, §6d) — with SELECT-only for clients the GRANT is the whole access '
  'decision. Held by pnpm check:impl-doors D3 (anon has nothing) and D4 (no client '
  'write grant). DESTINATION, unchanged: retire, or fold into custom.template '
  '(discovery D2/D13) — an owner decision, tracked as DD-033. Registering it as an '
  'org-owned entity would need an organization for these 5 rows, and the database may '
  'never choose one (db-rules §0.9).';
