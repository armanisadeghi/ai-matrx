-- retire_orphan_updated_at_trigger_helpers.sql
--
-- Retires 19 per-table `updated_at` timestamp trigger functions in `public` that
-- are attached to ZERO tables. Every one has the identical body
--     BEGIN NEW.updated_at = now(); RETURN NEW; END;
-- and every one is superseded by the canonical trigger the platform installs
-- from platform.create_entity_table():
--     _touch_row BEFORE INSERT OR UPDATE ... EXECUTE FUNCTION platform._touch_row()
-- (which also increments `version` on UPDATE — strictly more than these do).
-- SET SCHEMA retirement, not a DROP: the bodies survive in `graveyard` and one
-- ALTER brings any of them back.
--
-- ⚠️ THE NAME PATTERN IS NOT THE EVIDENCE. Each function below was traced to the
-- table it was written for, and that table was then checked LIVE for a working
-- updated_at maintainer. Per-function evidence follows; the migration re-checks
-- the zero-attachment fact itself at run time and refuses to move anything that
-- has since been wired up.
--
-- ── PER-FUNCTION EVIDENCE (live DB txzxabzwovsujtloxrus) ────────────────────
--  1. agenda_task_set_updated_at
--       target public.agenda_task. TABLE GONE — no relation of that name exists
--       in any schema. Ledgered in platform.deprecated_relations as
--       'public.agenda_task → matrx-extend sch_* tables', and declared dead in
--       migrations/public_schema_triage_batch1_dead_tables.sql.
--  2. agent_run_touch_updated_at
--       target public.agent_run (CREATE TRIGGER ... BEFORE UPDATE ON
--       public.agent_run in migration history). Table moved to chat.agent_run
--       (ledgered); chat.agent_run AND chat.agent_run_stage both carry
--       platform._touch_row.
--  3. cld_sync_update_timestamp
--       target the public.cld_* cloud-files family, moved to files.* during the
--       cld_ prefix-drop (ledgered: cld_files→files.files, cld_folders→
--       files.folders, …). files.files carries platform._touch_row; files.folders
--       carries the live de-prefixed successor public.sync_update_timestamp.
--  4. cmp_comparison_sets_touch_updated_at
--       target public.cmp_comparison_sets (CREATE TRIGGER in migration history).
--       Now agent.cmp_comparison_sets (ledgered) with platform._touch_row.
--  5. cmp_response_feedback_touch_updated_at
--       target public.cmp_response_feedback (CREATE TRIGGER in migration
--       history). Now agent.cmp_response_feedback with platform._touch_row.
--  6. sch_set_updated_at
--       target the public.sch_* scheduler family (ledgered → scheduler.*).
--       scheduler.sch_task / sch_run / sch_trigger all carry platform._touch_row.
--       scheduler.sch_agent_task has no updated_at column at all, so nothing to
--       maintain there.
--  7. sms_update_timestamp
--       target the public.sms_* family (CREATE TRIGGER on sms_consent,
--       sms_conversations, sms_messages, sms_notification_preferences,
--       sms_phone_numbers in migration history). All moved to communication.*
--       (ledgered); every one of the 7 that has an updated_at column carries
--       platform._touch_row. communication.sms_rate_limits and sms_webhook_logs
--       have no updated_at column.
--  8. tg_analysis_recipes_touch_updated_at
--       targets public.analysis_recipes and public.user_analysis_preferences
--       (both CREATE TRIGGERs in migration history). analysis_recipes → files.analysis
--       (ledgered), which carries the live renamed successor
--       tg_file_analysis_touch_updated_at; user_analysis_preferences →
--       users.user_analysis_preferences with platform._touch_row.
--  9. update_contact_submission_updated_at
--       target public.contact_submissions — STILL LIVE, in public, carrying
--       platform._touch_row.
-- 10. update_flashcard_set_updated_at
--       target the flashcard-set tables. education.flashcard_sets → education.fc_set
--       (ledgered) with platform._touch_row; users.user_flashcard_sets with
--       platform._touch_row.
-- 11. update_heatmap_saves_updated_at
--       target public.heatmap_saves (CREATE TRIGGER in migration history). Now
--       workbench.heatmap_saves (ledgered) with platform._touch_row.
-- 12. update_invitation_updated_at
--       target the invitation tables. iam.invitations, users.invitation_codes and
--       users.invitation_requests all carry platform._touch_row.
-- 13. update_mcp_registry_updated_at
--       target public.mcp_registry. TABLE REMOVED BY ARMAN — recorded in
--       docs/archive/2026/cx_chat__TOOL_REGISTRY_RENAME_BREAKAGE.md ("the user
--       removed McpRegistry table"). The successor family tool.mcp_config /
--       tool.mcp_server / tool.mcp_user_conn each carry the live, attached
--       public.update_mcp_updated_at.
-- 14. update_prompt_actions_updated_at
--       target public.prompt_actions, since retired to graveyard.prompt_actions —
--       which still carries platform._touch_row, so even the archived table is
--       covered.
-- 15. update_quiz_session_updated_at
--       target the quiz-session table; live as education.quiz_sessions with
--       platform._touch_row.
-- 16. update_rs_config_updated_at
--       target public.rs_config, RENAMED to rs_topic during the research-system
--       build (.arman/pending/research-system/junk/FRONTEND_MIGRATION.md: "rs_config
--       renamed to rs_topic"). Live as research.rs_topic (ledgered) with
--       platform._touch_row.
-- 17. update_user_memory_updated_at
--       target public.user_memory → users.user_memory (ledgered) with
--       platform._touch_row.
-- 18. wbx_highlight_set_updated_at
--       target public.wbx_highlight → extend.wbx_highlight (ledgered) with
--       platform._touch_row.
-- 19. ws_set_updated_at
--       ⚠️ TARGET NOT IDENTIFIED — stated plainly rather than assumed. Exhaustive
--       search found NO ws_* relation in any schema including graveyard, no ws_*
--       row in platform.deprecated_relations or platform.entity_types, no
--       reference in any in-DB function or view body, no hit in either repo's
--       code / docs / migrations, and no hit in git history (git log -S). It is
--       retired on the generic grounds only: a body byte-identical to 18 siblings
--       and weaker than platform._touch_row, attached to nothing, with no
--       surviving subject. Reversible in one ALTER if its table ever resurfaces —
--       at which point the correct wiring is _touch_row, not this.
--
-- ── WHAT SURVIVES AS 'unchecked' ON PURPOSE ────────────────────────────────
-- Two trigger functions stay attached-to-nothing BY DESIGN and are asserted
-- for by name at the bottom of this file: platform.dead_relation_write() (an
-- on-demand tripwire installed by platform.deprecate_relation) and
-- workflow.plan_touch_row() (matrx-graph's standalone-deployment fallback for
-- platform._touch_row). Rationale in the final assertion block.
--
-- ── SEPARATELY REPORTED, NOT FIXED HERE ─────────────────────────────────────
-- None of the 19 targets above has a frozen updated_at. A full live scan did
-- however find 35 OTHER non-graveyard tables that have an updated_at column and
-- NO database-level maintainer at all (billing.*, seo.*, iam.canonical_sweep,
-- research.research_intent, workspace.task_user_state, ui.ui_surface_write_target,
-- users.integration_connections, …). That is a real, separate defect class that
-- needs per-table checking of whether the application stamps updated_at itself —
-- it is filed as follow-up work, not silently folded into this retirement.
--
-- Idempotent. Safe to re-run.

do $retire$
declare
  v_names constant text[] := array[
    'agenda_task_set_updated_at',
    'agent_run_touch_updated_at',
    'cld_sync_update_timestamp',
    'cmp_comparison_sets_touch_updated_at',
    'cmp_response_feedback_touch_updated_at',
    'sch_set_updated_at',
    'sms_update_timestamp',
    'tg_analysis_recipes_touch_updated_at',
    'update_contact_submission_updated_at',
    'update_flashcard_set_updated_at',
    'update_heatmap_saves_updated_at',
    'update_invitation_updated_at',
    'update_mcp_registry_updated_at',
    'update_prompt_actions_updated_at',
    'update_quiz_session_updated_at',
    'update_rs_config_updated_at',
    'update_user_memory_updated_at',
    'wbx_highlight_set_updated_at',
    'ws_set_updated_at'
  ];
  v_name text;
  v_oid oid;
  v_moved text[] := '{}';
begin
  foreach v_name in array v_names loop
    select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name and p.prorettype = 'trigger'::regtype;

    if v_oid is null then
      continue;  -- already retired on a previous run
    end if;

    -- Refuse to retire anything that is actually doing a job.
    if exists (select 1 from pg_trigger t where t.tgfoid = v_oid and not t.tgisinternal) then
      raise exception 'public.%() is ATTACHED to a table — it is live, do not retire it.', v_name;
    end if;

    -- Refuse if some other function names it.
    if exists (
      select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname not in ('pg_catalog','information_schema','graveyard')
        and p2.prokind = 'f' and p2.oid <> v_oid
        and p2.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        and pg_get_functiondef(p2.oid) ~* ('\m' || v_name || '\M')
    ) then
      raise exception 'public.%() now has an in-DB dependent — re-verify before retiring.', v_name;
    end if;

    execute format('alter function public.%I() set schema graveyard', v_name);
    v_moved := v_moved || v_name;
  end loop;

  if array_length(v_moved, 1) is null then
    raise notice 'Nothing to retire — all 19 orphan updated_at helpers already moved.';
  else
    raise notice 'Retired % orphan updated_at helper(s) to graveyard: %',
      array_length(v_moved, 1), array_to_string(v_moved, ', ');
  end if;
end $retire$;

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason) values
 ('public.agenda_task_set_updated_at()','no successor — public.agenda_task is gone (→ matrx-extend sch_*)','graveyard.agenda_task_set_updated_at()','Orphan updated_at helper. Target table no longer exists in any schema; ledgered dead in public_schema_triage_batch1_dead_tables.sql. Zero trigger attachments.'),
 ('public.agent_run_touch_updated_at()','platform._touch_row() on chat.agent_run','graveyard.agent_run_touch_updated_at()','Orphan updated_at helper for public.agent_run. Table moved to chat.agent_run; chat.agent_run and chat.agent_run_stage both carry platform._touch_row. Zero trigger attachments.'),
 ('public.cld_sync_update_timestamp()','platform._touch_row() on files.files; public.sync_update_timestamp() on files.folders','graveyard.cld_sync_update_timestamp()','Orphan updated_at helper for the public.cld_* cloud-files family, moved to files.* in the cld_ prefix-drop. Successors attached and live. Zero trigger attachments.'),
 ('public.cmp_comparison_sets_touch_updated_at()','platform._touch_row() on agent.cmp_comparison_sets','graveyard.cmp_comparison_sets_touch_updated_at()','Orphan updated_at helper. Table moved public.cmp_comparison_sets → agent.cmp_comparison_sets, which carries platform._touch_row. Zero trigger attachments.'),
 ('public.cmp_response_feedback_touch_updated_at()','platform._touch_row() on agent.cmp_response_feedback','graveyard.cmp_response_feedback_touch_updated_at()','Orphan updated_at helper. Table moved public.cmp_response_feedback → agent.cmp_response_feedback, which carries platform._touch_row. Zero trigger attachments.'),
 ('public.sch_set_updated_at()','platform._touch_row() on scheduler.sch_task / sch_run / sch_trigger','graveyard.sch_set_updated_at()','Orphan updated_at helper for the public.sch_* family, moved to scheduler.*. Every scheduler.sch_* table with an updated_at column carries platform._touch_row (sch_agent_task has no such column). Zero trigger attachments.'),
 ('public.sms_update_timestamp()','platform._touch_row() on communication.sms_*','graveyard.sms_update_timestamp()','Orphan updated_at helper for the public.sms_* family, moved to communication.*. All 7 tables with an updated_at column carry platform._touch_row. Zero trigger attachments.'),
 ('public.tg_analysis_recipes_touch_updated_at()','public.tg_file_analysis_touch_updated_at() on files.analysis; platform._touch_row() on users.user_analysis_preferences','graveyard.tg_analysis_recipes_touch_updated_at()','Orphan updated_at helper for public.analysis_recipes + public.user_analysis_preferences. Both successors carry an attached, live updated_at trigger. Zero trigger attachments.'),
 ('public.update_contact_submission_updated_at()','platform._touch_row() on public.contact_submissions','graveyard.update_contact_submission_updated_at()','Orphan updated_at helper. Target table is still live in public and carries platform._touch_row. Zero trigger attachments.'),
 ('public.update_flashcard_set_updated_at()','platform._touch_row() on education.fc_set and users.user_flashcard_sets','graveyard.update_flashcard_set_updated_at()','Orphan updated_at helper. education.flashcard_sets → education.fc_set (ledgered); both live successors carry platform._touch_row. Zero trigger attachments.'),
 ('public.update_heatmap_saves_updated_at()','platform._touch_row() on workbench.heatmap_saves','graveyard.update_heatmap_saves_updated_at()','Orphan updated_at helper. Table moved public.heatmap_saves → workbench.heatmap_saves, which carries platform._touch_row. Zero trigger attachments.'),
 ('public.update_invitation_updated_at()','platform._touch_row() on iam.invitations, users.invitation_codes, users.invitation_requests','graveyard.update_invitation_updated_at()','Orphan updated_at helper. All three live invitation tables carry platform._touch_row. Zero trigger attachments.'),
 ('public.update_mcp_registry_updated_at()','public.update_mcp_updated_at() on tool.mcp_config / mcp_server / mcp_user_conn','graveyard.update_mcp_registry_updated_at()','Orphan updated_at helper for public.mcp_registry, a table Arman removed (docs/archive/2026/cx_chat__TOOL_REGISTRY_RENAME_BREAKAGE.md). The successor tool.mcp_* family carries an attached, live update_mcp_updated_at. Zero trigger attachments.'),
 ('public.update_prompt_actions_updated_at()','platform._touch_row() on graveyard.prompt_actions','graveyard.update_prompt_actions_updated_at()','Orphan updated_at helper. public.prompt_actions was retired to graveyard.prompt_actions, which still carries platform._touch_row. Zero trigger attachments.'),
 ('public.update_quiz_session_updated_at()','platform._touch_row() on education.quiz_sessions','graveyard.update_quiz_session_updated_at()','Orphan updated_at helper. Live successor education.quiz_sessions carries platform._touch_row. Zero trigger attachments.'),
 ('public.update_rs_config_updated_at()','platform._touch_row() on research.rs_topic','graveyard.update_rs_config_updated_at()','Orphan updated_at helper. rs_config was renamed to rs_topic during the research-system build; research.rs_topic carries platform._touch_row. Zero trigger attachments.'),
 ('public.update_user_memory_updated_at()','platform._touch_row() on users.user_memory','graveyard.update_user_memory_updated_at()','Orphan updated_at helper. Table moved public.user_memory → users.user_memory, which carries platform._touch_row. Zero trigger attachments.'),
 ('public.wbx_highlight_set_updated_at()','platform._touch_row() on extend.wbx_highlight','graveyard.wbx_highlight_set_updated_at()','Orphan updated_at helper. Table moved public.wbx_highlight → extend.wbx_highlight, which carries platform._touch_row. Zero trigger attachments.'),
 ('public.ws_set_updated_at()','platform._touch_row() (canonical) — original target NOT identified','graveyard.ws_set_updated_at()','Orphan updated_at helper whose target table could not be identified: no ws_* relation in any schema incl. graveyard, no ws_* row in deprecated_relations or entity_types, no in-DB function/view reference, no hit in either repo or in git history. Retired on generic grounds (body byte-identical to 18 siblings, weaker than platform._touch_row, zero attachments) and reversible in one ALTER.')
on conflict (old_ref) do update
  set new_ref = excluded.new_ref, archived_as = excluded.archived_as, reason = excluded.reason;

-- ── Post-conditions ────────────────────────────────────────────────────────
do $assert$
declare
  v_names constant text[] := array[
    'agenda_task_set_updated_at','agent_run_touch_updated_at','cld_sync_update_timestamp',
    'cmp_comparison_sets_touch_updated_at','cmp_response_feedback_touch_updated_at','sch_set_updated_at',
    'sms_update_timestamp','tg_analysis_recipes_touch_updated_at','update_contact_submission_updated_at',
    'update_flashcard_set_updated_at','update_heatmap_saves_updated_at','update_invitation_updated_at',
    'update_mcp_registry_updated_at','update_prompt_actions_updated_at','update_quiz_session_updated_at',
    'update_rs_config_updated_at','update_user_memory_updated_at','wbx_highlight_set_updated_at','ws_set_updated_at'
  ];
  v_public int; v_grave int; v_ledger int; v_left text;
begin
  select count(*), string_agg(p.proname, ', ') into v_public, v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(v_names);
  if v_public <> 0 then
    raise exception '% helper(s) still live in public (%) — retirement did not take.', v_public, v_left;
  end if;

  select count(*) into v_grave
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'graveyard' and p.proname = any(v_names);
  if v_grave <> 19 then
    raise exception 'Expected 19 retired helpers in graveyard, found % — bodies were lost, not retired.', v_grave;
  end if;

  select count(*) into v_ledger from platform.deprecated_relations
  where old_ref = any(select 'public.'||x||'()' from unnest(v_names) x);
  if v_ledger <> 19 then
    raise exception 'Expected 19 platform.deprecated_relations rows for this retirement, found %.', v_ledger;
  end if;
end $assert$;

-- The successor triggers this retirement leans on must all still be attached.
-- One row per replacement claim made in the header; a false claim RAISEs here.
do $assert$
declare
  v_pairs constant text[][] := array[
    ['chat.agent_run','platform._touch_row()'],
    ['chat.agent_run_stage','platform._touch_row()'],
    ['files.files','platform._touch_row()'],
    ['files.folders','public.sync_update_timestamp()'],
    ['files.analysis','public.tg_file_analysis_touch_updated_at()'],
    ['agent.cmp_comparison_sets','platform._touch_row()'],
    ['agent.cmp_response_feedback','platform._touch_row()'],
    ['scheduler.sch_task','platform._touch_row()'],
    ['scheduler.sch_run','platform._touch_row()'],
    ['scheduler.sch_trigger','platform._touch_row()'],
    ['communication.sms_consent','platform._touch_row()'],
    ['communication.sms_conversations','platform._touch_row()'],
    ['communication.sms_media','platform._touch_row()'],
    ['communication.sms_messages','platform._touch_row()'],
    ['communication.sms_notification_preferences','platform._touch_row()'],
    ['communication.sms_notifications','platform._touch_row()'],
    ['communication.sms_phone_numbers','platform._touch_row()'],
    ['users.user_analysis_preferences','platform._touch_row()'],
    ['public.contact_submissions','platform._touch_row()'],
    ['education.fc_set','platform._touch_row()'],
    ['users.user_flashcard_sets','platform._touch_row()'],
    ['workbench.heatmap_saves','platform._touch_row()'],
    ['iam.invitations','platform._touch_row()'],
    ['users.invitation_codes','platform._touch_row()'],
    ['users.invitation_requests','platform._touch_row()'],
    ['tool.mcp_config','public.update_mcp_updated_at()'],
    ['tool.mcp_server','public.update_mcp_updated_at()'],
    ['tool.mcp_user_conn','public.update_mcp_updated_at()'],
    ['graveyard.prompt_actions','platform._touch_row()'],
    ['education.quiz_sessions','platform._touch_row()'],
    ['research.rs_topic','platform._touch_row()'],
    ['users.user_memory','platform._touch_row()'],
    ['extend.wbx_highlight','platform._touch_row()']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = v_pairs[i][1]::regclass
        and not t.tgisinternal
        and t.tgtype & 2 = 2                     -- BEFORE
        and t.tgfoid = v_pairs[i][2]::regprocedure
    ) then
      raise exception 'Replacement claim FALSE: % has no BEFORE trigger running % — do not retire its old helper.',
        v_pairs[i][1], v_pairs[i][2];
    end if;
  end loop;
end $assert$;

-- Rescore the conformance checker and prove the numbers moved the right way.
select audit.refresh();

do $assert$
declare v_real int; v_adv int; v_unchecked int; v_kept text;
begin
  select count(*) into v_real from audit.broken_functions where severity = 'real';
  if v_real <> 0 then
    raise exception 'Expected 0 real findings, found % — this retirement broke something.', v_real;
  end if;

  select count(*) into v_adv from audit.broken_functions where severity = 'advisory';
  if v_adv <> 0 then
    raise exception 'Expected 0 advisory findings, found %.', v_adv;
  end if;

  select count(distinct signature), string_agg(distinct signature, ', ' order by signature)
    into v_unchecked, v_kept
  from audit.broken_functions where severity = 'unchecked';

  -- TWO deliberate keeps. Both are correct-at-zero-attachments by design:
  --
  --  * platform.dead_relation_write() — an ON-DEMAND tripwire installed by
  --    platform.deprecate_relation() at the moment a table is retired IN PLACE.
  --    Zero attachments is its correct resting state: all 195 ledgered
  --    retirements to date used the louder SET SCHEMA / move path, so no
  --    <name>__deprecated view exists to carry it. Live machinery, not orphan
  --    code. (Its sibling platform.dead_relation_read() is a plain function and
  --    so never appears in a trigger-attachment scan at all.)
  --
  --  * workflow.plan_touch_row() — THE PACKAGE-INDEPENDENCE FALLBACK for
  --    matrx-graph, and removing it would be the exact "simplification" the
  --    package-vs-implementation policy forbids. Its own migration
  --    (aidream/packages/matrx-graph/.../0108_plan_persistence_invariants.sql)
  --    says it outright: hosted Matrx Main has platform._touch_row so the
  --    conditional installs THAT on workflow.plan / plan_sample; a standalone
  --    matrx-graph database has no platform substrate and installs this instead.
  --    Unattached HERE is proof the conditional chose correctly on this database.
  --    matrx-graph's own CI asserts the function exists (bootstrap_test_db.sh).
  if v_unchecked <> 2
     or v_kept is distinct from 'platform.dead_relation_write(), workflow.plan_touch_row()' then
    raise exception 'Expected exactly 2 deliberately-kept unchecked findings (platform.dead_relation_write(), workflow.plan_touch_row()), found %: %',
      v_unchecked, coalesce(v_kept, '<none>');
  end if;
end $assert$;
