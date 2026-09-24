-- chair-step: RC-A1 inverse of rcstore_c — removes the EMPTY content.document_version Detail and its registry rows (token document_version). Refuses if it holds a row or if rcstore_g's behaviour is still attached.
-- ground-standing-ok: a — every trigger that runs a content.* body on this store's tables is detached
-- by rcstore_g_document_behavior_down.sql, which must run first (this file refuses while it has not:
-- it checks for content._capture_version / the table's emptiness before dropping anything).
-- platform.provision_spec rows stay (append-only history; provision rebuilds a gone relation).

do $$
begin
  if exists (select 1 from content.document_version) then
    raise exception 'content.document_version holds rows; this inverse only removes an EMPTY table';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'content' and p.proname = '_capture_version') then
    raise exception 'rcstore_g behaviour is still attached; run rcstore_g_document_behavior_down.sql first';
  end if;
end $$;

drop table content.document_version;
delete from platform.provision_base_contract_pending where relation = 'content.document_version';
delete from platform.entity_relationships where child_type = 'document_version';
delete from platform.entity_types where token = 'document_version';
