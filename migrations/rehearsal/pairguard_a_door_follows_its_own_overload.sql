-- target: branch
--
-- A DOOR FOLLOWS ITS OWN OVERLOAD, NOT ITS NAMESAKE.
--
-- lane PAIR-GUARD, 2026-09-20, immediately after
-- `pairguard_level_the_branch_kernel_to_main.sql`. That file moved each door row onto
-- the rendering the shape guard actually produces (`search_path=pg_catalog`, so
-- `permission_level` renders `public.permission_level`). It picked the row to move by
-- (schema, function) and `declared_at`, and `iam.accessible_entity_ids` has TWO live
-- overloads with two door rows declared in the same second — so it moved the THREE-argument
-- row onto the FOUR-argument rendering. The guard went green because a matching row existed;
-- the three-argument overload was left declaring a signature that is not its own.
--
-- A name is not an identity. This file re-derives every `iam.accessible_entity_ids` door
-- row's `identity_args` from the ONE live function whose argument TYPES are exactly that
-- row's `identity_argtypes` — the column DD-223 already makes authoritative — and refuses
-- 🚨 compared as TEXT: `proargtypes` is an oidvector, whose array form starts at index 0,
-- so `p.proargtypes::oid[] = c.identity_argtypes` is FALSE for identical types.
-- (rather than guessing) if that match is not unique. Nothing else on this branch changes.
--
-- Branch-only by location and by header. Main is untouched: it has one door row per
-- overload already and this file is not applied there.

DO $fix$
DECLARE r record; v_render text; v_n integer;
BEGIN
  FOR r IN
    SELECT c.id, c.identity_args, c.identity_argtypes
      FROM platform.client_callable_door c
     WHERE c.schema_name = 'iam' AND c.function_name = 'accessible_entity_ids'
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'iam' AND p.proname = 'accessible_entity_ids'
       AND array_to_string(p.proargtypes::oid[], ',') = array_to_string(r.identity_argtypes, ',');
    IF v_n <> 1 THEN
      RAISE EXCEPTION
        'door row % declares argument types % which match % live iam.accessible_entity_ids overloads, not exactly one — refusing to guess which signature it belongs to',
        r.id, r.identity_argtypes, v_n;
    END IF;

    -- The guard's own rendering: it runs with search_path=pg_catalog, so every
    -- non-pg_catalog type comes out schema-qualified. Set the same search_path here
    -- rather than reproducing the qualification by hand.
    PERFORM set_config('search_path', 'pg_catalog', true);
    SELECT pg_catalog.pg_get_function_identity_arguments(p.oid) INTO v_render
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'iam' AND p.proname = 'accessible_entity_ids'
       AND array_to_string(p.proargtypes::oid[], ',') = array_to_string(r.identity_argtypes, ',');
    PERFORM set_config('search_path', 'public, extensions', true);

    IF v_render IS DISTINCT FROM r.identity_args THEN
      UPDATE platform.client_callable_door SET identity_args = v_render WHERE id = r.id;
      RAISE NOTICE 'door % now declares its own overload: % -> %', r.id, r.identity_args, v_render;
    END IF;
  END LOOP;
END
$fix$;

DO $settled$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(c.id::text || ' ' || c.identity_args, '; ') INTO v_bad
    FROM platform.client_callable_door c
   WHERE c.schema_name = 'iam' AND c.function_name = 'accessible_entity_ids'
     AND NOT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'iam' AND p.proname = 'accessible_entity_ids'
              AND array_to_string(p.proargtypes::oid[], ',') = array_to_string(c.identity_argtypes, ','));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'a iam.accessible_entity_ids door row names no live overload: %', v_bad;
  END IF;
  RAISE NOTICE 'every iam.accessible_entity_ids door row declares the overload its argument types name';
END
$settled$;
