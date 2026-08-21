-- Keep org-forgetting inserts from failing after rag.library_docs became
-- organization_id NOT NULL. The canonical trigger resolves the explicit
-- creator/session owner and is idempotently replaced here.

BEGIN;

DROP TRIGGER IF EXISTS _stamp_org_default ON rag.library_docs;
CREATE TRIGGER _stamp_org_default
  BEFORE INSERT ON rag.library_docs
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

COMMIT;
