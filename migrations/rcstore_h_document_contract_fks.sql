-- RC-A1: the foreign keys rcstore_b..f deliberately did not hold during the build, attached in
-- window-class: trigger DDL on the new, empty rich-content tables freezes the 23-relation supautils set (auth/storage/realtime) for this short transaction; applied in the 1-4 AM PT window.
-- ONE SHORT transaction immediately after it, NOT VALID (catalogue-only: the tables are empty
-- and ADD ... NOT VALID never scans). rcstore_i validates them in its own transaction.
--
--   * the base contract of all five tables (organization_id -> iam.organizations,
--     created_by / updated_by -> auth.users) through the platform's own door,
--     platform.provision_attach_base_contract, which refuses if this transaction has been open
--     longer than the provisioning lock budget — so the attaches come FIRST;
--   * the FK register of STORE-DESIGN §3.17 that points into live shared tables:
--       content.document.document_type_id      -> platform.categories
--       content.document.folder_id             -> files.folders        (ON DELETE SET NULL)
--       content.document.last_conversation_id  -> chat.conversation    (ON DELETE SET NULL)
--       content.document_version.actor_id      -> auth.users
--       content.document_version.conversation_id -> chat.conversation  (ON DELETE SET NULL)
--     each with its covering index and, for a nullable FK into a tenant-scoped table, the
--     validation-only platform.assert_same_org trigger (both are shape debts settled at COMMIT).
--
-- SHARE ROW EXCLUSIVE on each referenced table is held only for this transaction's few
-- milliseconds. Apply inside the 1–4 AM PT window, straight after rcstore_g.

set local lock_timeout = '2s';

-- ONE statement, so all five attaches run in the first milliseconds of the transaction.
select r.relation, platform.provision_attach_base_contract(r.relation)
  from unnest(array['content.document', 'content.document_version', 'content.univer_payload',
                    'skill.skill_detail', 'agent.message_template_detail']) with ordinality as r(relation, ord)
 order by r.ord;

alter table content.document
  add constraint document_document_type_id_fkey
  foreign key (document_type_id) references platform.categories (id) not valid;
-- covering index: rcstore_b built (document_type_id).

alter table content.document
  add constraint document_folder_id_fkey
  foreign key (folder_id) references files.folders (id) on delete set null not valid;
-- covering index: rcstore_b built (folder_id, updated_at desc) where deleted_at is null.
create trigger _same_org_folder_id
  before insert or update of folder_id on content.document
  for each row execute function platform.assert_same_org('folder_id', 'files.folders');

alter table content.document
  add constraint document_last_conversation_id_fkey
  foreign key (last_conversation_id) references chat.conversation (id) on delete set null not valid;
create index document_last_conversation_id_idx on content.document (last_conversation_id)
  where last_conversation_id is not null;
create trigger _same_org_last_conversation_id
  before insert or update of last_conversation_id on content.document
  for each row execute function platform.assert_same_org('last_conversation_id', 'chat.conversation');

alter table content.document_version
  add constraint document_version_actor_id_fkey
  foreign key (actor_id) references auth.users (id) not valid;
create index document_version_actor_id_idx on content.document_version (actor_id)
  where actor_id is not null;

alter table content.document_version
  add constraint document_version_conversation_id_fkey
  foreign key (conversation_id) references chat.conversation (id) on delete set null not valid;
create index document_version_conversation_id_idx on content.document_version (conversation_id)
  where conversation_id is not null;
create trigger _same_org_conversation_id
  before insert or update of conversation_id on content.document_version
  for each row execute function platform.assert_same_org('conversation_id', 'chat.conversation');
