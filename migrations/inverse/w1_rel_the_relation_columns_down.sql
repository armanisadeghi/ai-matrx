-- chair-step: the inverse of W1-REL file 1 - it DROPS the five columns that file added to
-- `platform.associations` and `platform.reachability`, and the two indexes over them. A DROP
-- COLUMN on a live 34,216-row table is never an unattended step (rule 9), so this file is
-- header-less on purpose (§4.9): a file naming production in a `-- target:` header PLUS
-- `-- chair-step:` is refused by both runners as `chair-step-names-production`, and these same
-- bytes rehearse on the branch with `--target branch`, which is how rule 27's "the inverse was
-- RUN on the branch" is satisfied.
--
-- THE ORDER IS THE CHECK. The indexes go first because a column cannot be dropped while an
-- index depends on it without CASCADE, and CASCADE is the word that hides a mistake. The
-- columns then go one at a time, so a failure names the column it failed on.
--
-- IT ASSUMES FILES 2, 3 AND 4 ARE ALREADY REVERSED, and says so rather than cascading through
-- them: `relation_field_id` is read by `platform.enforce_relation_edge()` and `version` /
-- `updated_at` by the two version triggers. Running this file while any of those still stand
-- raises a dependency error naming the object, which is the correct outcome.

set lock_timeout = '2s';
set statement_timeout = '300s';

drop index if exists platform.idx_assoc_relation_field_live;
drop index if exists platform.idx_assoc_origin_campaign;

-- 🚨 `platform.associations.relation_field_id` STAYS, AND IS EMPTIED (lane INVERSE-GUARD,
-- 2026-09-21). WRITE-PERF-2 adopted the column: `custom._relation_associations_stmt_insert`
-- and `_stmt_update` (`writeperf2_the_after_triggers_fire_once_per_statement.sql`) NAME
-- `relation_field_id` in their own INSERT, and those two bodies are what the live
-- statement-level triggers `zz_w2a_relation_association_s_i` / `_s_u` run on every write to
-- `custom.record`. Dropping the column would not put W1-REL's defect back, it would make the
-- next insert into the record store raise `column "relation_field_id" does not exist`.
-- So the column stays and is EMPTIED — the same remedy `mergehist_..._down.sql` uses for
-- `history.row_versions.migration_id`. After this, every association is once again an edge
-- that does not know which Field declared it, which IS the defect, and the ground the write
-- path stands on is untouched.
update platform.associations
   set relation_field_id = null
 where relation_field_id is not null;
--   alter table platform.associations drop column if exists relation_field_id;  -- NOT dropped
alter table platform.associations drop column if exists updated_at;
alter table platform.associations drop column if exists version;
alter table platform.associations drop column if exists origin;

alter table platform.reachability drop column if exists origin;
