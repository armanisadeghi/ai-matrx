-- plan.node derived-cache + guard triggers; plan.entity guard.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: plan_node_triggers).
-- Note: the live migration transiently defined plan._node_shape twice; the
-- self-contained version below is what is deployed.

-- Shared guard: every plan row must point at an existing site that has a brand,
-- and the row's org must match the site's org (filled from the site when absent).
CREATE OR REPLACE FUNCTION plan._require_branded_site()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE v_site record;
BEGIN
  SELECT s.organization_id, s.brand_id, s.deleted_at INTO v_site
  FROM web.site s WHERE s.id = NEW.site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan: site % does not exist', NEW.site_id;
  END IF;
  IF v_site.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'plan: site % is deleted — cannot plan against a deleted site', NEW.site_id;
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'plan: site % has no brand (web.site.brand_id is NULL) — assign a brand before planning content for it', NEW.site_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_site.organization_id;
  ELSIF NEW.organization_id <> v_site.organization_id THEN
    RAISE EXCEPTION 'plan: organization mismatch — row org % vs site org %', NEW.organization_id, v_site.organization_id;
  END IF;
  RETURN NEW;
END $$;

-- plan.node BEFORE: guard + derived cache (depth, route, pillar_label, cluster_label).
-- Named _a_* so it runs before _stamp_* triggers (alphabetical firing order).
CREATE OR REPLACE FUNCTION plan._node_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE v_site record; v_parent record; v_cur uuid; v_hops int := 0;
BEGIN
  -- site + brand + org guard
  SELECT s.organization_id, s.brand_id, s.deleted_at INTO v_site
  FROM web.site s WHERE s.id = NEW.site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan: site % does not exist', NEW.site_id;
  END IF;
  IF v_site.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'plan: site % is deleted — cannot plan against a deleted site', NEW.site_id;
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'plan: site % has no brand (web.site.brand_id is NULL) — assign a brand before planning content for it', NEW.site_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_site.organization_id;
  ELSIF NEW.organization_id <> v_site.organization_id THEN
    RAISE EXCEPTION 'plan: organization mismatch — row org % vs site org %', NEW.organization_id, v_site.organization_id;
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.route := '/' || COALESCE(NEW.slug, '');
    NEW.pillar_label  := CASE WHEN NEW.node_type = 'pillar'  THEN NEW.label END;
    NEW.cluster_label := CASE WHEN NEW.node_type = 'cluster' THEN NEW.label END;
  ELSE
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'plan: node % cannot be its own parent', NEW.id;
    END IF;
    SELECT n.id, n.site_id, n.route, n.depth, n.pillar_label, n.cluster_label, n.deleted_at
      INTO v_parent FROM plan.node n WHERE n.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan: parent node % does not exist', NEW.parent_id;
    END IF;
    IF v_parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'plan: parent node % is deleted', NEW.parent_id;
    END IF;
    IF v_parent.site_id <> NEW.site_id THEN
      RAISE EXCEPTION 'plan: parent node % belongs to site %, not site %', NEW.parent_id, v_parent.site_id, NEW.site_id;
    END IF;
    -- cycle guard: walk up from the parent; finding NEW.id means a loop
    v_cur := NEW.parent_id;
    WHILE v_cur IS NOT NULL LOOP
      v_hops := v_hops + 1;
      IF v_hops > 100 THEN
        RAISE EXCEPTION 'plan: parent chain deeper than 100 for node % — refusing (cycle or runaway tree)', NEW.id;
      END IF;
      SELECT n.parent_id INTO v_cur FROM plan.node n WHERE n.id = v_cur;
      IF v_cur = NEW.id THEN
        RAISE EXCEPTION 'plan: cycle detected — % is an ancestor of itself', NEW.id;
      END IF;
    END LOOP;
    NEW.depth := v_parent.depth + 1;
    NEW.route := rtrim(v_parent.route, '/') || '/' || NEW.slug;
    NEW.pillar_label  := CASE WHEN NEW.node_type = 'pillar'  THEN NEW.label ELSE v_parent.pillar_label  END;
    NEW.cluster_label := CASE WHEN NEW.node_type = 'cluster' THEN NEW.label ELSE v_parent.cluster_label END;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER _a_node_shape BEFORE INSERT OR UPDATE ON plan.node
  FOR EACH ROW EXECUTE FUNCTION plan._node_shape();

-- Cascade: when a node's derived values change, touch its children so their
-- BEFORE trigger recomputes; recursion stops when nothing changes.
CREATE OR REPLACE FUNCTION plan._node_cascade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
BEGIN
  UPDATE plan.node c SET parent_id = c.parent_id
  WHERE c.parent_id = NEW.id AND c.deleted_at IS NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER _z_node_cascade AFTER UPDATE ON plan.node
  FOR EACH ROW
  WHEN (OLD.route IS DISTINCT FROM NEW.route
     OR OLD.pillar_label IS DISTINCT FROM NEW.pillar_label
     OR OLD.cluster_label IS DISTINCT FROM NEW.cluster_label
     OR OLD.depth IS DISTINCT FROM NEW.depth)
  EXECUTE FUNCTION plan._node_cascade();

-- plan.entity gets the same site/brand/org guard
CREATE TRIGGER _a_entity_guard BEFORE INSERT OR UPDATE ON plan.entity
  FOR EACH ROW EXECUTE FUNCTION plan._require_branded_site();
