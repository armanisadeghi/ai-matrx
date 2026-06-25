-- Wave 3 ADDITIVE base retrofit — canvas_* Base-1 entities.
-- Step 1 only (additive): standard cols + org/actor backfill + _touch_row/_stamp_actor.
-- No RLS flips, no drops, no NOT NULL. Idempotent (retrofit_entity is re-run safe).
--
-- Classification of public.canvas_* base tables:
--   canvas_items         Base-1 entity  -> retrofit (personal, owner=user_id)
--   canvas_comments      Base-1 entity  -> retrofit (personal, owner=user_id)
--   canvas_scores        Base-3 log     -> SKIP (quiz-attempt events, append-only)
--   canvas_views         Base-3 log     -> SKIP (analytics view events, append-only)
--   canvas_likes         Base-2 join    -> SKIP (canvas_id+user_id, no lifecycle)
--   canvas_comment_likes Base-2 join    -> SKIP (comment_id+user_id, no lifecycle)
--   canvas_item_state    Base-2/special -> SKIP (PK canvas_id+user_id, per-user state, no id)
--
-- Neither entity has a created_by column -> no collision, no RENAME needed.

-- canvas_items: legacy BEFORE-UPDATE trigger = canvas_items_updated_at; already has
-- organization_id + version (smallint) — retrofit_entity reuses them. 185 rows, 3 owners
-- (all with personal orgs) -> null_org=0. Business trigger _mirror_proj is preserved.
select platform.retrofit_entity('canvas_items', 'canvas_item', 'personal', 'user_id', null, null, 'canvas_items_updated_at');

-- canvas_comments: legacy BEFORE-UPDATE trigger = set_updated_at; has updated_at,
-- no org col (adds organization_id), no version (adds version). 0 rows -> null_org=0.
-- Business trigger trigger_canvas_comment_count is preserved.
select platform.retrofit_entity('canvas_comments', 'canvas_comment', 'personal', 'user_id', null, null, 'set_updated_at');
