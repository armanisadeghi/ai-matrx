-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): extend.wbx_guidance gets its base links (organization, created_by, updated_by
-- foreign keys, added NOT VALID and validated right after in their own transaction) through
-- platform.retrofit_entity. The table holds 0 rows. Its organization is the row's own (strategy keep).
set local lock_timeout = '3s';
set local statement_timeout = '120s';
select platform.retrofit_entity('extend', 'wbx_guidance', 'wbx_guidance', 'keep');
create index if not exists wbx_guidance_organization_id_idx on extend.wbx_guidance (organization_id);
create index if not exists wbx_guidance_created_by_idx on extend.wbx_guidance (created_by);
