-- chair-step: RC-A1 inverse of rcstore_e — removes the EMPTY skill.skill_detail Detail and its registry rows (token skill_detail). Refuses if it holds a row or if rcstore_g's behaviour is still attached.
-- ground-standing-ok: a — every trigger that runs a content.* body on this store's tables is detached
-- by rcstore_g_document_behavior_down.sql, which must run first (this file refuses while it has not:
-- it checks for content._capture_version / the table's emptiness before dropping anything).
-- platform.provision_spec rows stay (append-only history; provision rebuilds a gone relation).

do $$
begin
  if exists (select 1 from skill.skill_detail) then
    raise exception 'skill.skill_detail holds rows; this inverse only removes an EMPTY table';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'content' and p.proname = '_capture_version') then
    raise exception 'rcstore_g behaviour is still attached; run rcstore_g_document_behavior_down.sql first';
  end if;
end $$;

drop table skill.skill_detail;
delete from platform.provision_base_contract_pending where relation = 'skill.skill_detail';
delete from platform.entity_relationships where child_type = 'skill_detail';
delete from platform.entity_types where token = 'skill_detail';
