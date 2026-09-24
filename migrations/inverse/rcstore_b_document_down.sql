-- chair-step: RC-A1 inverse of rcstore_b — removes the EMPTY content.document, its registry and sharing rows and the content.document knobs (rcstore_a's inverse removes the categories and helpers). Refuses if the table holds a row or any Detail still hangs off the token.
-- ground-standing-ok: a — every trigger that runs a content.* body on this store's tables is detached
-- by rcstore_g_document_behavior_down.sql, which must run first (this file refuses while it has not:
-- it checks for content._capture_version / the table's emptiness before dropping anything).
-- platform.provision_spec rows stay: the applied declaration is append-only history, and
-- platform.provision rebuilds a token whose relation is gone.

do $$
begin
  if exists (select 1 from content.document) then
    raise exception 'content.document holds rows; this inverse only removes an EMPTY store';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'content' and p.proname = '_capture_version') then
    raise exception 'rcstore_g behaviour is still attached; run rcstore_g_document_behavior_down.sql first';
  end if;
  if exists (select 1 from platform.entity_relationships where parent_type = 'document') then
    raise exception 'a Detail still hangs off token document; run the rcstore_c..f inverses first';
  end if;
end $$;

drop table content.document;

delete from platform.provision_base_contract_pending where relation = 'content.document';
delete from platform.shareable_resource_registry where resource_type = 'document';
delete from platform.entity_types where token = 'document';
delete from platform.feature_knob where feature = 'content.document';
