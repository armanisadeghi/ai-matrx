-- chair-step: drops public.list_entities_by_scopes(uuid[], text, boolean). It matched only `scope` edges (tags are `tag` edges since FTS-4), was revoked from every client role in D31 (service_role only), has zero callers in matrx-frontend, aidream, matrx-extend, matrx-local, matrx-sandbox and matrx-ship, and no other function body names it. No legacy twin.

DROP FUNCTION IF EXISTS public.list_entities_by_scopes(uuid[], text, boolean);
