-- ============================================================================
-- Track 2A — any-surface artifact materialization identity.
--
-- Artifacts were chat-only: canvas_items keyed on (source_message_id,
-- artifact_index), cx_canvas_upsert REQUIRED p_message_id, and chat.artifact
-- (the /artifacts discovery index) had NOT NULL message_id/conversation_id.
-- This migration generalizes identity to (source_system, source_id) so any
-- surface (notes, transcripts, tasks, …) can materialize render blocks, while
-- chat rows keep BOTH keys (old + new) through the transition.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks throughout.
--
-- Contents:
--   1. canvas.canvas_items: source_system/source_id columns + backfill +
--      partial unique uq_canvas_items_source_artifact + mirror-sync trigger
--      (any write path that sets one identity gets the other stamped — the
--      half-stamped-row failure class is structurally impossible).
--   2. cx_canvas_upsert_source (any-surface upsert RPC, same semantics as
--      cx_canvas_upsert incl. inline sha-256 content_hash + conversation
--      resolution for cx_message sources); cx_canvas_upsert delegates to it
--      (signature and SECURITY INVOKER behavior unchanged).
--   3. chat.artifact: message_id/conversation_id DROP NOT NULL (message_id's
--      FK is ON DELETE SET NULL — previously guaranteed to violate NOT NULL,
--      so this also fixes a latent message-deletion blocker), source columns +
--      backfill + sync trigger, CHECK (message_id OR source_id present)
--      NOT VALID → VALIDATE, and the natural-key unique swapped from
--      (user_id, message_id, artifact_type, external_system) to
--      (user_id, source_system, source_id, artifact_type, external_system) —
--      with NULLS NOT DISTINCT the old key would have collapsed ALL non-chat
--      rows of one type per user into a single slot.
--      app/api/artifacts/route.ts onConflict updated in the same commit.
--   4. iam.apply_rls: the component variant gains an owner-fallback for
--      composition parents whose fk column is NULLABLE ("a component row
--      without a parent belongs to its creator"). For NOT NULL parents the
--      new branch is unreachable, so regenerating any other component is
--      byte-identical. Re-applied to chat.artifact so NULL-conversation
--      discovery rows are insertable/readable by their creator (the old
--      policies called iam.has_access('conversation', NULL) → always false).
-- ============================================================================

-- ── 1. canvas.canvas_items: source identity ────────────────────────────────

ALTER TABLE canvas.canvas_items ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE canvas.canvas_items ADD COLUMN IF NOT EXISTS source_id uuid;

COMMENT ON COLUMN canvas.canvas_items.source_system IS
  'Origin surface of a materialized artifact (cx_message | note | transcript | ctx_task | …). Mirrors source_message_id for chat rows via _sync_source_identity.';
COMMENT ON COLUMN canvas.canvas_items.source_id IS
  'Id of the originating record in source_system. With artifact_index this is the any-surface natural key (uq_canvas_items_source_artifact).';

UPDATE canvas.canvas_items
SET source_system = 'cx_message', source_id = source_message_id
WHERE source_message_id IS NOT NULL AND source_system IS NULL;

-- New any-surface natural key. The old chat-only unique
-- uq_canvas_items_message_artifact(source_message_id, artifact_index) is KEPT —
-- chat rows satisfy both through the transition.
CREATE UNIQUE INDEX IF NOT EXISTS uq_canvas_items_source_artifact
  ON canvas.canvas_items (source_system, source_id, artifact_index)
  WHERE source_id IS NOT NULL AND artifact_index IS NOT NULL;

-- Mirror-sync: no write path can produce a half-stamped row (e.g.
-- cx_canvas_update_version inserts only source_message_id; legacy tooling may
-- insert only the new pair). BEFORE trigger keeps both identities in lockstep.
CREATE OR REPLACE FUNCTION canvas._canvas_items_sync_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_message_id IS NOT NULL AND NEW.source_id IS NULL THEN
    NEW.source_system := 'cx_message';
    NEW.source_id := NEW.source_message_id;
  ELSIF NEW.source_system = 'cx_message' AND NEW.source_id IS NOT NULL
        AND NEW.source_message_id IS NULL THEN
    NEW.source_message_id := NEW.source_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS _sync_source_identity ON canvas.canvas_items;
CREATE TRIGGER _sync_source_identity
  BEFORE INSERT OR UPDATE ON canvas.canvas_items
  FOR EACH ROW EXECUTE FUNCTION canvas._canvas_items_sync_source();

-- ── 2. Any-surface upsert RPC + chat delegation ─────────────────────────────

-- Same semantics as the historical cx_canvas_upsert (SECURITY INVOKER, inline
-- sha-256 content_hash, conversation resolution from chat.message for
-- cx_message sources, version 1 on insert, content/title refresh on conflict)
-- keyed on the NEW (source_system, source_id, artifact_index) natural key.
-- The _sync_source_identity trigger mirrors source_message_id for chat rows,
-- so the old unique stays satisfied too.
CREATE OR REPLACE FUNCTION public.cx_canvas_upsert_source(
  p_user_id uuid,
  p_source_system text,
  p_source_id uuid,
  p_artifact_index smallint,
  p_type text,
  p_title text,
  p_content jsonb,
  p_conversation_id uuid DEFAULT NULL::uuid,
  p_source_type text DEFAULT 'model_direct'::text
)
RETURNS canvas.canvas_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash text;
  v_row canvas.canvas_items;
  v_conv_id uuid;
  v_message_id uuid;
BEGIN
  -- Generate content hash (same recipe as the historical cx_canvas_upsert).
  v_hash := encode(digest(p_content::text, 'sha256'), 'hex');

  IF p_source_system = 'cx_message' THEN
    v_message_id := p_source_id;
    -- Resolve conversation_id from the message if not provided.
    IF p_conversation_id IS NULL AND p_source_id IS NOT NULL THEN
      SELECT conversation_id INTO v_conv_id
      FROM chat.message
      WHERE id = p_source_id;
    ELSE
      v_conv_id := p_conversation_id;
    END IF;
  ELSE
    v_message_id := NULL;
    v_conv_id := p_conversation_id;
  END IF;

  INSERT INTO canvas.canvas_items (
    user_id, source_system, source_id, source_message_id, artifact_index,
    type, title, content, content_hash, conversation_id, source_type, version
  )
  VALUES (
    p_user_id, p_source_system, p_source_id, v_message_id, p_artifact_index,
    p_type, p_title, p_content, v_hash, v_conv_id, p_source_type, 1
  )
  ON CONFLICT (source_system, source_id, artifact_index)
    WHERE source_id IS NOT NULL AND artifact_index IS NOT NULL
  DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    content_hash = EXCLUDED.content_hash,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cx_canvas_upsert_source(uuid, text, uuid, smallint, text, text, jsonb, uuid, text)
  TO authenticated, service_role;

-- cx_canvas_upsert keeps its exact signature and delegates. Chat callers are
-- untouched; both natural keys are written (mirror + explicit).
CREATE OR REPLACE FUNCTION public.cx_canvas_upsert(
  p_user_id uuid,
  p_message_id uuid,
  p_artifact_index smallint,
  p_type text,
  p_title text,
  p_content jsonb,
  p_conversation_id uuid DEFAULT NULL::uuid,
  p_source_type text DEFAULT 'model_direct'::text
)
RETURNS canvas.canvas_items
LANGUAGE sql
AS $$
  SELECT public.cx_canvas_upsert_source(
    p_user_id, 'cx_message', p_message_id, p_artifact_index,
    p_type, p_title, p_content, p_conversation_id, p_source_type
  );
$$;

-- ── 3. chat.artifact (the /artifacts discovery index) ───────────────────────

ALTER TABLE chat.artifact ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE chat.artifact ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE chat.artifact ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE chat.artifact ADD COLUMN IF NOT EXISTS source_id uuid;

COMMENT ON COLUMN chat.artifact.source_system IS
  'Origin surface of the indexed artifact (cx_message | note | transcript | …). Mirrors message_id for chat rows via _sync_source_identity.';
COMMENT ON COLUMN chat.artifact.source_id IS
  'Id of the originating record in source_system. Part of the natural key uq_cx_artifact_source_natural_key.';

UPDATE chat.artifact
SET source_system = 'cx_message', source_id = message_id
WHERE message_id IS NOT NULL AND source_system IS NULL;

CREATE OR REPLACE FUNCTION chat._artifact_sync_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_id IS NOT NULL AND NEW.source_id IS NULL THEN
    NEW.source_system := 'cx_message';
    NEW.source_id := NEW.message_id;
  ELSIF NEW.source_system = 'cx_message' AND NEW.source_id IS NOT NULL
        AND NEW.message_id IS NULL THEN
    NEW.message_id := NEW.source_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS _sync_source_identity ON chat.artifact;
CREATE TRIGGER _sync_source_identity
  BEFORE INSERT OR UPDATE ON chat.artifact
  FOR EACH ROW EXECUTE FUNCTION chat._artifact_sync_source();

-- Every row must be anchored to SOME source. NOT VALID first (cheap, no
-- table scan under lock), then VALIDATE (idempotent when already valid).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_artifact_has_source'
      AND conrelid = 'chat.artifact'::regclass
  ) THEN
    ALTER TABLE chat.artifact
      ADD CONSTRAINT chk_artifact_has_source
      CHECK (message_id IS NOT NULL OR source_id IS NOT NULL) NOT VALID;
  END IF;
END
$$;
ALTER TABLE chat.artifact VALIDATE CONSTRAINT chk_artifact_has_source;

-- Natural-key swap. The old FULL NULLS NOT DISTINCT unique on
-- (user_id, message_id, artifact_type, external_system) would treat every
-- NULL message_id as EQUAL — all non-chat rows of one type/system per user
-- would collide into a single slot. The source-based key is 1:1 with the old
-- one for chat rows (backfill above), so no data change is needed.
-- Create-new-then-drop-old so the table is never unguarded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cx_artifact_source_natural_key
  ON chat.artifact (user_id, source_system, source_id, artifact_type, external_system)
  NULLS NOT DISTINCT;
DROP INDEX IF EXISTS chat.uq_cx_artifact_natural_key;

-- ── 4. iam.apply_rls: owner-fallback for nullable composition parents ──────
-- Body is the LIVE production definition (incl. the super-admin system-insert
-- bypass) plus ONE addition in the component branch: when the composition fk
-- column is NULLABLE and the table has created_by, parentless rows belong to
-- their creator. For NOT NULL parents the branch is unreachable — regenerating
-- any existing component produces byte-identical policies.
CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tbl             text := format('%I.%I', p_schema, p_table);
  v_is_component    boolean;
  v_has_created     boolean;
  v_has_org         boolean;
  v_has_del         boolean;
  v_has_vis         boolean;
  v_delpfx          text := '';
  v_parent_type     text;
  v_parent_col      text;
  v_parent_optional boolean := false;
  pol               record;
BEGIN
  SELECT COALESCE(is_component, false) INTO v_is_component
  FROM platform.entity_types WHERE token = p_token;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='created_by')      INTO v_has_created;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='organization_id') INTO v_has_org;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='deleted_at')       INTO v_has_del;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema=p_schema AND table_name=p_table AND column_name='visibility')       INTO v_has_vis;
  v_delpfx := CASE WHEN v_has_del THEN 'deleted_at IS NULL AND ' ELSE '' END;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_tbl);

  FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = v_tbl::regclass LOOP
    EXECUTE format('DROP POLICY %I ON %s', pol.polname, v_tbl);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY svc_all ON %s FOR ALL TO service_role USING (true) WITH CHECK (true)', v_tbl);

  IF p_variant = 'ledger' THEN
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s iam.has_org_access(organization_id))',
      v_tbl, v_delpfx);
    RETURN;
  END IF;

  IF v_is_component OR p_variant = 'component' THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships
    WHERE child_type = p_token AND kind = 'composition' LIMIT 1;
    IF v_parent_type IS NULL THEN
      RAISE EXCEPTION 'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    END IF;

    -- Orphan-capable component (2026-07-03): nullable composition fk +
    -- created_by => a row without a parent belongs to its creator.
    SELECT (c.is_nullable = 'YES') INTO v_parent_optional
    FROM information_schema.columns c
    WHERE c.table_schema=p_schema AND c.table_name=p_table AND c.column_name=v_parent_col;
    v_parent_optional := COALESCE(v_parent_optional, false) AND v_has_created;

    IF v_parent_optional THEN
      EXECUTE format(
        'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s ((%I IS NOT NULL AND iam.has_access(%L, %I, ''viewer'')) OR (%I IS NULL AND created_by = (select auth.uid()))))',
        v_tbl, v_delpfx, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid()))) WITH CHECK ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col,
        v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      EXECUTE format(
        'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING ((%I IS NOT NULL AND iam.has_access(%L, %I, ''editor'')) OR (%I IS NULL AND created_by = (select auth.uid())))',
        v_tbl, v_parent_col, v_parent_type, v_parent_col, v_parent_col);
      RETURN;
    END IF;

    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s iam.has_access(%L, %I, ''viewer''))',
      v_tbl, v_delpfx, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (iam.has_access(%L, %I, ''editor'')) WITH CHECK (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col, v_parent_type, v_parent_col);
    EXECUTE format(
      'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (iam.has_access(%L, %I, ''editor''))',
      v_tbl, v_parent_type, v_parent_col);
    RETURN;
  END IF;

  IF NOT v_has_created THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;
  IF NOT v_has_org THEN
    RAISE EXCEPTION 'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS', p_schema, p_table;
  END IF;

  IF p_variant = 'system' THEN
    IF NOT v_has_vis THEN
      RAISE EXCEPTION 'apply_rls: system variant on %.% requires a visibility column (public rows are the whole point)', p_schema, p_table;
    END IF;
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (visibility = ''public'' OR created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, v_delpfx, p_token);
  ELSE
    EXECUTE format(
      'CREATE POLICY std_select ON %s FOR SELECT TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''viewer'')))',
      v_tbl, v_delpfx, p_token);
  END IF;

  IF v_has_vis THEN
    EXECUTE format(
      'CREATE POLICY pub_read ON %s FOR SELECT TO anon USING (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  END IF;

  EXECUTE format(
    'CREATE POLICY std_insert ON %s FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND (organization_id IS NULL OR iam.has_org_access(organization_id) OR (organization_id IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable) AND public.is_super_admin())))',
    v_tbl);

  EXECUTE format(
    'CREATE POLICY std_update ON %s FOR UPDATE TO authenticated USING (%s (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))) WITH CHECK (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''editor''))',
    v_tbl, v_delpfx, p_token, p_token);

  EXECUTE format(
    'CREATE POLICY std_delete ON %s FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);
END
$function$;

-- Regenerate chat.artifact's policies with the owner-fallback (conversation_id
-- is now nullable, so the component branch emits the NULL-tolerant form).
SELECT iam.apply_rls('chat', 'artifact', 'artifact');
