-- Site containment edges for plan rows + GC triggers for new association targets.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migrations:
-- plan_mirror_triggers_and_scoped_gc + plan_site_edges_canonical_no_mirror).
-- This file reflects the FINAL deployed state: plan-owned _site_edge triggers
-- writing canonical platform.associations edges. platform._mirror_fk_to_assoc is
-- FORBIDDEN (aidream CLAUDE.md) and is NOT used; an interim version of this
-- migration that used it was replaced same-session.
--
-- FK stays the source of truth; reachability comes along free via the edge.
-- parent_id deliberately gets NO edge (one containment edge per row).

CREATE OR REPLACE FUNCTION plan._site_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
DECLARE v_token text := TG_ARGV[0];
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.site_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.site_id IS DISTINCT FROM NEW.site_id) THEN
    DELETE FROM platform.associations
     WHERE source_type = v_token AND source_id = OLD.id
       AND target_type = 'web_site' AND target_id = OLD.site_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.site_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.site_id IS DISTINCT FROM NEW.site_id) THEN
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'plan._site_edge: % row % has no organization_id — association rows must carry an org (associations RLS depends on it)', v_token, NEW.id;
    END IF;
    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id)
    VALUES (v_token, NEW.id, 'web_site', NEW.site_id, NEW.organization_id)
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO NOTHING;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER _site_edge AFTER INSERT OR DELETE OR UPDATE ON plan.node
  FOR EACH ROW EXECUTE FUNCTION plan._site_edge('plan_node');
CREATE TRIGGER _site_edge AFTER INSERT OR DELETE OR UPDATE ON plan.entity
  FOR EACH ROW EXECUTE FUNCTION plan._site_edge('plan_entity');

-- GC triggers for the association targets this rollout introduces.
-- (A global sync_association_gc_triggers() sweep fails on a pre-existing defect:
-- entity_types row agent_card points at agent.card which is a VIEW.)
SELECT platform.sync_association_gc_triggers('web_site');
SELECT platform.sync_association_gc_triggers('seo_topic');
SELECT platform.sync_association_gc_triggers('seo_keyword');
