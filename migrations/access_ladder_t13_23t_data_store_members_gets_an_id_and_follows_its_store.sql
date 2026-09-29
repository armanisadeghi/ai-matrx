-- access_ladder_t13_23t_data_store_members_gets_an_id_and_follows_its_store.sql
-- chair-step: one table. Adds a uuid id (backfilled by its default, unique), regenerates this child from its parent data store and drops its hand-written policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- rag.data_store_members had no id column (primary key data_store_id, source_kind, source_id). Its hand-written
-- FOR ALL policy let any member of the store's organization write it; now the store's viewers read, editors write.

set local lock_timeout = '2s';

alter table rag.data_store_members add column id uuid not null default gen_random_uuid();
alter table rag.data_store_members add constraint data_store_members_id_key unique (id);

select iam.apply_rls('rag', 'data_store_members', 'data_store_members', 'component');

select iam.supersede_bespoke_policies('rag', 'data_store_members', array['data_store_members_grant_reader_select', 'data_store_members_parent_all'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
