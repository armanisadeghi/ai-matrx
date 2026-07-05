-- canvas_items_materialized_null_content_hash.sql
--
-- Fix: materializing a second artifact with content byte-identical to an
-- existing one 23505'd on `canvas_items_user_content_full_unique (user_id,
-- content_hash)` — e.g. "artifact #2 (flashcards) failed to persist" when a
-- message carried two identical flashcard sets, or a re-generated turn produced
-- the same content under a new source id.
--
-- Root cause: content_hash is the dedup key for MANUAL user saves ONLY
-- (canvasItemsService.save → `.upsert({ onConflict: "user_id,content_hash" })`,
-- which requires the FULL — not partial — unique index as its arbiter). But the
-- same full index also covered MATERIALIZED artifacts, whose real identity is
-- (source_system, source_id, artifact_index). Two distinct artifacts may
-- legitimately carry identical content, so subjecting them to content-hash
-- uniqueness is wrong.
--
-- Decision (per content-ir UNIFICATION_STATUS "Known risks"): scope the
-- hash-unique to user saves. We do this WITHOUT making the index partial (that
-- would break the supabase-js arbiter — see
-- canvas_items_content_hash_full_unique.sql): every RPC-materialized / model
-- path now writes content_hash = NULL. NULLs are distinct in a unique index, so
-- unlimited materialized rows coexist, while manual saves keep deduping.
--
-- Idempotent: CREATE OR REPLACE + a re-runnable backfill.

-- 1. Materialized/any-surface upsert — insert NULL hash; null it on re-materialize too.
CREATE OR REPLACE FUNCTION public.cx_canvas_upsert_source(
  p_user_id uuid, p_source_system text, p_source_id uuid, p_artifact_index smallint,
  p_type text, p_title text, p_content jsonb,
  p_conversation_id uuid DEFAULT NULL::uuid, p_source_type text DEFAULT 'model_direct'::text)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row canvas.canvas_items;
  v_conv_id uuid;
  v_message_id uuid;
BEGIN
  -- content_hash stays NULL: materialized artifacts are identified by
  -- (source_system, source_id, artifact_index), NOT by content. A hash here
  -- would collide (23505) against another artifact's identical content on the
  -- (user_id, content_hash) unique, which is reserved for manual user saves.
  IF p_source_system = 'cx_message' THEN
    v_message_id := p_source_id;
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
    p_type, p_title, p_content, NULL, v_conv_id, p_source_type, 1
  )
  ON CONFLICT (source_system, source_id, artifact_index)
    WHERE source_id IS NOT NULL AND artifact_index IS NOT NULL
  DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    content_hash = NULL,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 2. Programmatic manual create — also NULL (no ON CONFLICT arbiter here, so a
--    real hash would 23505 on identical content). The user content-dedup
--    surface is canvasItemsService.save, not this path.
CREATE OR REPLACE FUNCTION public.cx_canvas_create_manual(
  p_user_id uuid, p_type text, p_title text, p_content jsonb,
  p_source_type text DEFAULT 'model_converted'::text,
  p_conversation_id uuid DEFAULT NULL::uuid, p_source_message_id uuid DEFAULT NULL::uuid)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row canvas.canvas_items;
BEGIN
  INSERT INTO canvas.canvas_items (
    user_id, type, title, content, content_hash,
    conversation_id, source_message_id, source_type,
    artifact_index, version
  )
  VALUES (
    p_user_id, p_type, p_title, p_content, NULL,
    p_conversation_id, p_source_message_id, p_source_type,
    NULL, 1
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 3. Backfill: clear the hash on existing materialized rows so a NEW manual
--    save (or another materialized artifact) can never collide with them.
--    source_id IS NOT NULL ⟺ written by cx_canvas_upsert_source (materialized);
--    manual saves (canvasItemsService.save) never set source_id, so they keep
--    their hash and their dedup.
UPDATE canvas.canvas_items
SET content_hash = NULL
WHERE source_id IS NOT NULL
  AND content_hash IS NOT NULL;
