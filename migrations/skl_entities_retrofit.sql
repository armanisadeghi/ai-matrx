-- skl_entities_retrofit.sql
-- Wave 3 ADDITIVE base-retrofit for the skl_* (Agent Skills) Base-1 entity tables.
-- Idempotent: re-runnable. NO RLS flips, NO drops, NO NOT NULL — additive Step-1 only.
--
-- Scope decisions (see docs/db_rebuild/CHANGEOVER_PROGRESS.md):
--   skl_categories          Base-1 personal  (owner user_id; self-FK parent_category_id)
--   skl_render_definitions  Base-1 personal  (owner user_id) -- retrofit BEFORE skl_render_components
--   skl_render_components    Base-1 parent    (org denormalized from skl_render_definitions via render_definition_id)
--   skl_definitions          Base-1 personal  (owner user_id) -- SPECIAL: existing `version` is a VARCHAR semver
--                            string consumed live by features/skills/** AND the aidream Python backend
--                            (SkillRowWire.version: str). It is NOT the standard integer actor-version and
--                            CANNOT be renamed within additive Step-1 (cross-repo consumer repoint). So this
--                            table is retrofitted by hand WITHOUT platform._touch_row (whose `version := OLD.version+1`
--                            would corrupt the varchar). Its existing skl_set_updated_at trigger is preserved for
--                            updated_at; platform._stamp_actor is attached for actor stamping. Integer-`version`
--                            standardization deferred until the semver column is repointed.
--   skl_resources            Base-1 parent    (org denormalized from skl_definitions via skill_id) -- after skl_definitions
--   skl_skill_projects       Base-2 JOIN      -- OUT OF SCOPE for entity retrofit (composite PK, no id, no lifecycle).
--   skl_render_definitions.category_id -> public.shortcut_categories (not an skl_ table) — left as-is.

BEGIN;

-- 1) skl_categories  (personal)
SELECT platform.retrofit_entity('skl_categories', 'skill_category', 'personal', 'user_id', NULL, NULL, 'trg_skl_categories_updated');

-- 2) skl_render_definitions  (personal) — MUST precede skl_render_components
SELECT platform.retrofit_entity('skl_render_definitions', 'render_definition', 'personal', 'user_id', NULL, NULL, 'trg_skl_render_defs_updated');

-- 3) skl_render_components  (parent <- skl_render_definitions)
SELECT platform.retrofit_entity('skl_render_components', 'render_component', 'parent', NULL, 'skl_render_definitions', 'render_definition_id', 'trg_skl_render_comp_updated');

-- 4) skl_definitions  (personal, HAND-ROLLED — varchar `version` collision, no _touch_row)
DO $skl_def$
DECLARE v_null_org int; v_null_cb int;
BEGIN
  -- standard columns (additive). Reuse existing updated_at; DO NOT add an integer `version`
  -- (a varchar `version` already exists and is live-consumed; standardizing it is deferred).
  ALTER TABLE public.skl_definitions ADD COLUMN IF NOT EXISTS organization_id uuid;
  ALTER TABLE public.skl_definitions ADD COLUMN IF NOT EXISTS created_by uuid;
  ALTER TABLE public.skl_definitions ADD COLUMN IF NOT EXISTS updated_by uuid;

  -- preserve the business trigger (skl_set_updated_at maintains updated_at and nothing else);
  -- attach only _stamp_actor. Explicitly DO NOT attach platform._touch_row here.
  DROP TRIGGER IF EXISTS _touch_row ON public.skl_definitions;
  DROP TRIGGER IF EXISTS _stamp_actor ON public.skl_definitions;
  CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON public.skl_definitions
    FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

  -- actor backfill (guarded; system rows with NULL user_id stay NULL = system actor)
  UPDATE public.skl_definitions SET created_by = user_id
    WHERE created_by IS NULL AND user_id IS NOT NULL;

  -- org backfill: personal org of the owner, else canonical system org (decision #9)
  UPDATE public.skl_definitions t SET organization_id = coalesce(
      (SELECT o.id FROM public.organizations o WHERE o.is_personal AND o.created_by = t.user_id ORDER BY o.created_at LIMIT 1),
      (SELECT o.id FROM public.organizations o WHERE o.is_system ORDER BY o.created_at LIMIT 1))
    WHERE t.organization_id IS NULL;

  SELECT count(*) INTO v_null_org FROM public.skl_definitions WHERE organization_id IS NULL;
  IF v_null_org > 0 THEN RAISE EXCEPTION 'skl_definitions: % null-org rows remain', v_null_org; END IF;

  -- creator may legitimately be NULL for system rows; assert trigger presence instead.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='_stamp_actor' AND tgrelid='public.skl_definitions'::regclass) THEN
    RAISE EXCEPTION 'skl_definitions: _stamp_actor not attached';
  END IF;
END $skl_def$;

-- 5) skl_resources  (parent <- skl_definitions) — after skl_definitions so parent org is populated
SELECT platform.retrofit_entity('skl_resources', 'skill_resource', 'parent', NULL, 'skl_definitions', 'skill_id', 'trg_skl_resources_updated');

-- Final self-verify across all five entity tables: 0 null org everywhere.
DO $verify$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT unnest(ARRAY['skl_categories','skl_render_definitions','skl_render_components','skl_definitions','skl_resources']) AS t
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', r.t) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'verify: %.organization_id has % nulls', r.t, n; END IF;
  END LOOP;
END $verify$;

COMMIT;
