-- migrate: canvas_save_user_version_preserve_links
-- Preserve domain links + org/metadata/source identity when saving a new
-- user/agent version of a canvas artifact. Without this, restoring or
-- agent-editing a converted artifact (UDT / code_files / flashcards) silently
-- dropped external_system/external_id on the new version row.

CREATE OR REPLACE FUNCTION public.cx_canvas_save_user_version(
  p_user_id uuid,
  p_canvas_id uuid,
  p_title text,
  p_content jsonb
)
RETURNS canvas.canvas_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orig canvas.canvas_items;
  v_new canvas.canvas_items;
  v_root uuid;
  v_next integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR p_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'access denied: caller is not the target user' USING errcode = '42501';
  END IF;

  SELECT * INTO v_orig
  FROM canvas.canvas_items
  WHERE id = p_canvas_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canvas item % not found or not owned by user', p_canvas_id;
  END IF;

  v_root := COALESCE(v_orig.parent_canvas_id, v_orig.id);

  -- Serialize concurrent version bumps on the same chain.
  PERFORM 1 FROM canvas.canvas_items WHERE id = v_root FOR UPDATE;

  SELECT COALESCE(MAX(version), v_orig.version) + 1 INTO v_next
  FROM canvas.canvas_items
  WHERE id = v_root OR parent_canvas_id = v_root;

  INSERT INTO canvas.canvas_items
    (user_id, type, title, content, conversation_id,
     source_message_id, artifact_index, version, parent_canvas_id, source_type,
     external_system, external_id, organization_id, metadata,
     source_system, source_id)
  VALUES
    (p_user_id, v_orig.type, COALESCE(NULLIF(p_title, ''), v_orig.title), p_content,
     v_orig.conversation_id, NULL, NULL, v_next, v_root, 'user_created',
     v_orig.external_system, v_orig.external_id, v_orig.organization_id, v_orig.metadata,
     v_orig.source_system, v_orig.source_id)
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;
