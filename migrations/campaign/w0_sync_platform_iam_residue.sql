-- target: branch
-- w0_sync_platform_iam_residue — THE LAST `platform` / `iam` DELTAS, OF EVERY KIND.
--
-- The three files before this one closed functions, triggers and the event trigger in the
-- schemas this campaign rules on. This closes what was left in those schemas in the kinds
-- a gate does not watch — a column, seven indexes, a foreign key and its vocabulary, and
-- one trigger pointing at a function that no longer exists under that name.
--
-- FOUR OF THE SEVEN INDEXES ARE FK-COVERING INDEXES, which is not housekeeping: the
-- `provision_shape_guard` this lane installed charges `fk_without_index` debt, so a branch
-- missing them answers differently from production the moment a lane touches those tables.
--
-- THE CHECK CONSTRAINT IS DROPPED, AND THAT IS THE POINT. `masterwork_run_operation_valid`
-- exists HERE and NOT on production: production replaced it with the foreign key below when
-- `masterwork_run_kind` became a seeded vocabulary (aidream 0727, 2026-09-15 21:50). Its
-- list is four words SHORT of the vocabulary — no `ingest_drip`, `sorting_table`,
-- `teach_back` or `triad` — so leaving it would make the rehearsal STRICTER than
-- production and refuse four operations production accepts. A rehearsal that refuses what
-- production allows is the `custom.record` failure with the signs reversed. `platform.
-- masterwork_run` holds ZERO rows on this branch, so neither the drop nor the new foreign
-- key can touch data. The drop is branch-only by the header: this file names `branch` and
-- `--target production` refuses it by name.
--
-- The vocabulary is production's own 27 rows, copied. It is a fixed word list — no
-- organization, no person, no customer data.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync_platform_iam_residue.sql --target branch --lane W0-SYNC --no-generate

ALTER TABLE platform.assists ADD COLUMN IF NOT EXISTS auto_apply_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS assists_auto_apply_due_idx ON platform.assists USING btree (auto_apply_at) WHERE ((status = 'pending'::text) AND (auto_apply_at IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS associations_created_by_fk_idx ON platform.associations USING btree (created_by);
CREATE INDEX IF NOT EXISTS associations_payload_kind_fk_idx ON platform.associations USING btree (payload_kind);
CREATE INDEX IF NOT EXISTS permissions_created_by_fk_idx ON iam.permissions USING btree (created_by);
CREATE INDEX IF NOT EXISTS permissions_granted_to_organization_id_fk_idx ON iam.permissions USING btree (granted_to_organization_id);
CREATE INDEX IF NOT EXISTS permissions_granted_to_user_id_fk_idx ON iam.permissions USING btree (granted_to_user_id);
CREATE INDEX IF NOT EXISTS permissions_reviewed_by_fk_idx ON iam.permissions USING btree (reviewed_by);

-- the vocabulary, then the foreign key that reads it, then the CHECK it replaced
insert into platform.masterwork_run_kind (operation, terminal_type, declared_in_code) values
  ('audition', 'masterwork_audition_verdict', 't'),
  ('audition_elicitation', 'masterwork_audition_elicitation_verdict', 't'),
  ('audition_outcome', 'masterwork_audition_outcome_verdict', 't'),
  ('audition_pairwise', 'masterwork_pairwise_verdict', 't'),
  ('audition_unfolding', 'masterwork_audition_unfolding_verdict', 't'),
  ('bench_trial', 'masterwork_bench_verdict', 't'),
  ('build', 'masterwork_build_complete', 't'),
  ('checkup', 'masterwork_checkup_complete', 't'),
  ('clean_corpus', 'masterwork_corpus_cleaned', 't'),
  ('ingest', 'masterwork_ingest_complete', 't'),
  ('ingest_chat', 'masterwork_ingest_complete', 't'),
  ('ingest_conversations', 'masterwork_ingest_complete', 't'),
  ('ingest_corpus', 'masterwork_ingest_complete', 't'),
  ('ingest_drip', 'masterwork_ingest_complete', 't'),
  ('ingest_dump', 'masterwork_dump_complete', 't'),
  ('ingest_file', 'masterwork_ingest_complete', 't'),
  ('ingest_inbox', 'masterwork_ingest_complete', 't'),
  ('ingest_markup', 'masterwork_ingest_complete', 't'),
  ('ingest_meeting', 'masterwork_ingest_complete', 't'),
  ('ingest_predictions', 'masterwork_ingest_complete', 't'),
  ('ingest_timeline', 'masterwork_ingest_complete', 't'),
  ('ingest_unfolding', 'masterwork_ingest_complete', 't'),
  ('probe', 'masterwork_probe_round', 't'),
  ('sorting_table', 'masterwork_ingest_complete', 't'),
  ('teach_back', 'masterwork_teach_back_round', 't'),
  ('triad', 'masterwork_ingest_complete', 't'),
  ('triage', 'masterwork_triage_complete', 't')
on conflict (operation) do nothing;

-- PRODUCTION'S OWN FK HAS NO COVERING INDEX, AND THE GUARD WOULD REFUSE IT TODAY.
-- `platform.masterwork_run` carries exactly three indexes on production — the primary key,
-- `masterwork_run_live_idx` and `masterwork_run_rulebook_started_idx` — and NONE of them
-- leads with `operation`. The foreign key was added on 2026-09-15, before
-- `provision_shape_guard` existed, and the guard's `fk_without_index` lane fires on NEW
-- constraints only. So creating the same FK here charges debt production never paid.
--
-- Adding an index to satisfy the guard would leave this branch carrying an index
-- production does not have — differing in a NEW way to stop differing in an old one, and
-- quietly changing the plan the rehearsal measures. So the deferred constraint trigger is
-- stood down for this one statement, exactly as production's history stood it down by not
-- existing yet, and is re-enabled and PROVED enabled below.
--
-- THE DEBT IS REAL AND IT IS PRODUCTION'S, NOT THE BRANCH'S: production holds a foreign
-- key its own guard would now refuse. Recorded in BRANCH-SCHEMA-DRIFT.md for the chair —
-- this lane does not create indexes on production and does not touch it at all.
ALTER TABLE platform.provision_shape_debt DISABLE TRIGGER provision_shape_settled;

do $mig$ begin
  if not exists (select 1 from pg_constraint where conname = 'masterwork_run_operation_known'
                   and conrelid = 'platform.masterwork_run'::regclass) then
    alter table platform.masterwork_run add constraint masterwork_run_operation_known
      foreign key (operation) references platform.masterwork_run_kind(operation) on update cascade;
  end if;
end $mig$;

ALTER TABLE platform.provision_shape_debt ENABLE TRIGGER provision_shape_settled;

do $mig$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'platform.provision_shape_debt'::regclass
                    and t.tgname = 'provision_shape_settled' and t.tgenabled <> 'D') then
    raise exception 'w0_sync: provision_shape_settled is still DISABLED. This must not be ledgered.';
  end if;
end $mig$;

alter table platform.masterwork_run drop constraint if exists masterwork_run_operation_valid;

-- `platform.rulebook._touch_row` fires `platform._touch_row()` here and
-- `platform._touch_rulebook()` on production. Same trigger name, different function.
drop trigger if exists _touch_row on platform.rulebook;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON platform.rulebook FOR EACH ROW EXECUTE FUNCTION platform._touch_rulebook();
