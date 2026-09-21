-- chair-step: DOORS-ONLY-2 inverse -- re-opens the client write door on platform.edge_payload_kind,
-- which VERIFIER-8 HIGH-3 and the chair's ruling closed. Running this restores a PostgREST
-- write surface on a VOCABULARY-semantics table that no client code writes. Only run it to undo a
-- closure that broke a real path, and say which path.

drop policy if exists "edge_payload_kind_client_insert_refused" on platform.edge_payload_kind;
drop policy if exists "edge_payload_kind_client_update_refused" on platform.edge_payload_kind;
drop policy if exists "edge_payload_kind_client_delete_refused" on platform.edge_payload_kind;
