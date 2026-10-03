-- window-class: drops the same-org trigger on canvas.canvas_items (supautils set: 23 auth/storage/realtime relations held to COMMIT) — apply 01:00-04:00 Pacific only
-- chair-step: the inverse of migrations/canvas_version_chain_same_owner.sql — drops the
--   same-owner version-chain foreign key, its covering index and its same-org trigger, and restores the two chain readers to the exact bodies
--   that file replaced (they again return every row whose parent is the root, whoever owns it).
--
-- based-on: public.cx_canvas_get_version_history(uuid) 025e273fc57c7082b3e789db84e1b32ee7134210e0cfedabdfd69ff4a72ce5f6
-- based-on: public.cx_canvas_get_conversation_latest(uuid) 6b0c6d31ce41ce64ea82aa0edcd145f6fd4ad7d93aff324f15a3a386a1851883

alter table canvas.canvas_items drop constraint if exists canvas_items_version_chain_same_owner;
drop trigger if exists trg_same_org_canvas_canvas_items_parent_canvas_id on canvas.canvas_items;
drop index if exists canvas.canvas_items_user_id_parent_canvas_id_idx;

CREATE OR REPLACE FUNCTION public.cx_canvas_get_version_history(p_canvas_id uuid)
 RETURNS SETOF canvas.canvas_items
 LANGUAGE sql
 STABLE
AS $function$
  WITH RECURSIVE find_root AS (
    SELECT id, parent_canvas_id
    FROM canvas.canvas_items WHERE id = p_canvas_id
    UNION ALL
    SELECT ci.id, ci.parent_canvas_id
    FROM canvas.canvas_items ci
    JOIN find_root fr ON ci.id = fr.parent_canvas_id
  ),
  root AS (
    SELECT id FROM find_root WHERE parent_canvas_id IS NULL LIMIT 1
  )
  SELECT ci.*
  FROM canvas.canvas_items ci, root r
  WHERE ci.id = r.id OR ci.parent_canvas_id = r.id
  ORDER BY ci.version;
$function$;

CREATE OR REPLACE FUNCTION public.cx_canvas_get_conversation_latest(p_conversation_id uuid)
 RETURNS SETOF canvas.canvas_items
 LANGUAGE sql
 STABLE
AS $function$
  WITH roots AS (
    -- All items that ARE roots (no parent) in this conversation
    SELECT id AS root_id
    FROM canvas.canvas_items
    WHERE conversation_id = p_conversation_id
      AND parent_canvas_id IS NULL
      AND is_archived = false
  ),
  latest AS (
    -- For each root, find the highest-version descendant (or the root itself)
    SELECT DISTINCT ON (r.root_id)
      ci.*
    FROM roots r
    JOIN canvas.canvas_items ci
      ON ci.id = r.root_id OR ci.parent_canvas_id = r.root_id
    WHERE ci.is_archived = false
    ORDER BY r.root_id, ci.version DESC
  )
  SELECT * FROM latest
  ORDER BY created_at;
$function$;
