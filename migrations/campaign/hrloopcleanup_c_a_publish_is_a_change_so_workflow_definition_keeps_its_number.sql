-- additive: yes
--
-- chair-step: it BINDS the existing `platform.no_change_keeps_its_version()` (STORE-VERSION-NOOP
--   file 1; this file refuses to run without it) as the LAST before-row UPDATE trigger on
--   `workflow.definition`, with the arguments 'version' and 'updated_at' and nothing else — the
--   sixth table VERSION-HISTORY-FIX file (a) left off because a publish was a version-only write.
--   🚨 PRECONDITION THE DATABASE CANNOT CHECK: the aidream server that is LIVE must carry
--   matrx-graph `DefinitionStore.publish` from aidream commit c545fd2fe3 (HR-LOOP-CLEANUP, "a
--   workflow publish is a recorded change"). An older server's publish is `set version = version
--   + 1` alone, which this trigger swallows: the publish would then refuse nothing and pin nothing.
--   The chair confirms the live server SHA contains c545fd2fe3 before running this. No data is
--   repaired here (file (a) already repaired workflow.definition); nothing is replaced, dropped,
--   granted or revoked. `create trigger` on a plain table: SHARE ROW EXCLUSIVE to COMMIT (writers
--   of workflow.definition wait, readers and sign-in do not), 0 ACCESS EXCLUSIVE — the up is not
--   window-class; its INVERSE is (drop trigger fires the supautils hook). The inverse is
--   `migrations/inverse/hrloopcleanup_c_a_publish_is_a_change_so_workflow_definition_keeps_its_number_down.sql`.
-- window-class: the up is not (create trigger on a plain table, no hook, 0 ACCESS EXCLUSIVE); its
--   INVERSE is (DROP TRIGGER fires the supautils hook: ACCESS EXCLUSIVE on auth/storage/realtime,
--   sign-in stops). So the pair goes in 01:00–04:00 Pacific.
-- lock: platform
-- lane: HR-LOOP-CLEANUP
--
-- WHY IT CAN GO ON NOW. `workflow.definition.version` doubles as the publish counter: publish bumps
-- it and inserts `workflow.definition_version` under UNIQUE (definition_id, version_number). The
-- publish used to change NOTHING else, so under this trigger a second publish by the same system
-- kept the old number (measured on the clone by VERSION-HISTORY-FIX: "answered 2 again") and its
-- snapshot was silently dropped by ON CONFLICT DO NOTHING. Since c545fd2fe3 the same UPDATE also
-- writes `metadata.published = {version, at, by}` (a real change on every publish, even two in one
-- clock tick, because the stamp names the new version), the version must advance or the publish
-- raises by name, and a snapshot slot already taken is a refusal, not a pass. Census of every
-- other writer: save_draft / archive / unarchive / soft_delete carry a content column with their
-- bump (a save that changed nothing SHOULD keep its number — that is the point); the only other
-- SQL writer, `workflow.wfx_duplicate_version`, INSERTs a new definition. Nothing else relies on
-- a version-only UPDATE. workflow.definition has no stored generated column (checked), so the two
-- keys are the whole binding.
-- Proof: scripts/campaign-tests/hrloopcleanup_green.sql clause 7 (the new publish shape advances
-- 2 -> 3 -> 4 and lands every snapshot with this trigger bound; the old shape is swallowed), and
-- aidream packages/matrx-graph/tests/test_definition_store_publish_is_a_change.py.

set local lock_timeout = '5s';

do $pre$
begin
  if to_regprocedure('platform.no_change_keeps_its_version()') is null then
    raise exception 'HR-LOOP-CLEANUP: platform.no_change_keeps_its_version() does not exist on this database — apply STORE-VERSION-NOOP''s storeversionnoop_a_write_that_changes_nothing_keeps_its_version.sql first';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'workflow.definition'::regclass
                and tgname = 'zzzzz_no_change_keeps_its_version') then
    raise exception 'HR-LOOP-CLEANUP: workflow.definition already carries zzzzz_no_change_keeps_its_version — nothing to do';
  end if;
end
$pre$;

create trigger zzzzz_no_change_keeps_its_version
  before update on workflow.definition
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at');
