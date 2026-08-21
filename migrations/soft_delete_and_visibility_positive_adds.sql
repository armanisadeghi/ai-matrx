-- soft_delete_and_visibility_positive_adds.sql
--
-- ARMAN'S RULE, 2026-08-21: "for anything like that where we can actually add
-- positive things, like offering a soft delete, and we could do that without
-- damaging anything — it's stupid to sit there and have it be noncertified.
-- Let's just get it going. And if there's anything else like that, it's gonna
-- be the same rule that applies."
--
-- Product of the D232 §B triage. 22 registered tables were uncertified with
-- ZERO hard FAILs — held off certification by a single advisory WARN each.
-- This migration closes every one of those that is a genuine ADD (a capability
-- the table gains) and leaves alone the ones that are a REMOVAL (cross-repo
-- column retirements, which are not free and are not this pass).
--
-- WHAT THIS DOES
--   A. `deleted_at timestamptz` on 17 tables + `has_soft_delete=true` on their
--      registry rows. This is a real capability, not a gate-silencer: db-rules
--      §8's generic RPCs `public.entity_soft_delete(token,id)` /
--      `public.entity_undelete(token,id)` are generic over ANY token carrying
--      `deleted_at`, so these tables gain working soft-delete + restore the
--      moment the column exists.
--   B. `visibility platform.visibility NOT NULL` on 2 tables. Same logic: with
--      the column, `iam.apply_rls` emits the `pub_read` anon lane, so the row
--      can actually be made public. Defaults are the CLOSED value, so no row
--      changes visibility and nothing becomes anon-readable here.
--   C. `iam.verify_canonical`: the `visibility` check gains a `ledger` SKIP,
--      mirroring the `component` SKIP one line above it. A ledger's RLS lane
--      (`organization_id in (select iam.my_orgs())`) never reads `visibility`,
--      so WARNing that a ledger lacks one asks for a column nothing would ever
--      read. Adding a dead column to silence a check is the anti-move; the
--      check is what is wrong. Affects exactly 2 active ledger tokens
--      (`judge_verdict`, `activity`).
--   D. `iam.apply_rls` re-run on the 5 tables whose generated policy TEXT
--      actually changes. This is the half that makes the adds real rather than
--      cosmetic — `pub_read` on `platform.outcome_event` / `platform.purpose`
--      currently has NO `deleted_at is null` guard, so without the re-run a
--      soft-deleted public row would stay visible to anon.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - No `is_public` / `is_deleted` / `user_id` column is migrated or dropped.
--     Those are REMOVALS with live cross-repo consumers (D232 §D, and the
--     `legacy_owner_col` WARN on `chat.artifact` / `workflow.plan` /
--     `browser.stream_ticket`). They stay filed.
--   - No row's data changes. Every added column is NULL (A) or its closed
--     default (B) on every existing row.
--
-- SAFETY NOTES
--   - RLS does NOT hide soft-deleted rows from authenticated readers, BY DESIGN
--     (db-rules §8) — that would break direct soft-delete/restore UPDATEs. Only
--     the anon `pub_read` lane filters them. So adding `deleted_at` changes no
--     authenticated read anywhere.
--   - Adding a NOT NULL column WITH a default does not rewrite the table on
--     PG11+; largest table touched is 1,023 rows regardless.
--   - The column-grant rail on `iam.apply_table_grants` was pre-checked against
--     all 5 re-run tables: every one grants all columns, so no rail trip.

BEGIN;

-- ─── A. deleted_at ─────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('browser','action_event',        'browser_action_event'),
      ('browser','control_request',     'browser_control_request'),
      ('browser','handoff',             'browser_handoff'),
      ('browser','login_attempt',       'browser_login_attempt'),
      ('browser','site_observation',    'browser_site_observation'),
      ('browser','stream_ticket',       'browser_stream_ticket'),
      ('interview','document_revision', 'interview_document_revision'),
      ('platform','outcome_event',      'platform_outcome_event'),
      ('platform','purpose',            'purpose'),
      ('seo','backlink_change_event',   'seo_backlink_change_event'),
      ('seo','coverage_mention',        'seo_coverage_mention'),
      ('seo','link_gap_domain',         'seo_link_gap_domain'),
      ('seo','link_gap_match',          'seo_link_gap_match'),
      ('seo','serp_mention',            'seo_serp_mention'),
      ('seo','serp_opportunity',        'seo_serp_opportunity'),
      ('workflow','plan_event',         'workflow_plan_event'),
      ('workflow','plan_sample',        'workflow_plan_sample')
    ) AS v(s,t,tok)
  LOOP
    -- Qualify existence guards by regclass, never by name alone (db-rules §10).
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('%I.%I', r.s, r.t)::regclass
        AND a.attname = 'deleted_at' AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ADD COLUMN deleted_at timestamptz', r.s, r.t);
      EXECUTE format(
        'COMMENT ON COLUMN %I.%I.deleted_at IS %L',
        r.s, r.t,
        'Soft delete: NULL = live (db-rules §8). Authenticated RLS deliberately does NOT filter this; the app filters, and anon pub_read does.');
      n := n + 1;
    END IF;

    UPDATE platform.entity_types SET has_soft_delete = true
     WHERE token = r.tok AND COALESCE(has_soft_delete,false) = false;
  END LOOP;

  RAISE NOTICE 'A: added deleted_at to % table(s)', n;
END $$;

-- Proof: all 17 tokens carry the column AND declare it.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM platform.entity_types et
  WHERE et.token IN ('browser_action_event','browser_control_request','browser_handoff',
        'browser_login_attempt','browser_site_observation','browser_stream_ticket',
        'interview_document_revision','platform_outcome_event','purpose',
        'seo_backlink_change_event','seo_coverage_mention','seo_link_gap_domain',
        'seo_link_gap_match','seo_serp_mention','seo_serp_opportunity',
        'workflow_plan_event','workflow_plan_sample')
    AND et.has_soft_delete
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema=et.schema_name AND c.table_name=et.table_name
                  AND c.column_name='deleted_at');
  IF n <> 17 THEN
    RAISE EXCEPTION 'A: expected 17 soft-delete-capable tokens, found %', n;
  END IF;
END $$;

-- ─── B. visibility ─────────────────────────────────────────────────────────
-- Defaults are the CLOSED value for each table's existing access shape:
--   chat.coding_session is `restricted` (owner-only) -> 'personal'
--   platform.comments lives inside an org             -> 'internal'
-- Neither default is 'public', so the new pub_read lane below matches ZERO rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='chat.coding_session'::regclass
                   AND attname='visibility' AND attnum>0 AND NOT attisdropped) THEN
    -- personal-justified: coding sessions are owner-only private chats, not organization work.
    ALTER TABLE chat.coding_session
      ADD COLUMN visibility platform.visibility NOT NULL DEFAULT 'personal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='platform.comments'::regclass
                   AND attname='visibility' AND attnum>0 AND NOT attisdropped) THEN
    ALTER TABLE platform.comments
      ADD COLUMN visibility platform.visibility NOT NULL DEFAULT 'internal';
  END IF;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE (table_schema,table_name) IN (('chat','coding_session'),('platform','comments'))
     AND column_name='visibility' AND udt_schema='platform' AND udt_name='visibility'
     AND is_nullable='NO';
  IF n <> 2 THEN RAISE EXCEPTION 'B: expected 2 visibility columns, found %', n; END IF;

  SELECT count(*) INTO n FROM chat.coding_session WHERE visibility='public';
  IF n <> 0 THEN RAISE EXCEPTION 'B: % coding_session row(s) became public', n; END IF;
  SELECT count(*) INTO n FROM platform.comments WHERE visibility='public';
  IF n <> 0 THEN RAISE EXCEPTION 'B: % comment row(s) became public', n; END IF;
END $$;

-- ─── C. the ledger visibility SKIP in iam.verify_canonical ─────────────────
-- Patched in place rather than re-stated: this repo is a shared checkout and
-- the gate function is under active edit by other sessions, so re-pasting a
-- 9KB body would silently revert whatever landed since. Instead the DO block
-- reads the LIVE definition, asserts the exact anchor line appears exactly
-- once, inserts the new branch, and re-executes. Idempotent: if the ledger
-- branch is already present it does nothing.
DO $$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
    '  ELSIF v_variant=''component'' THEN status:=''SKIP''; detail:=''component inherits parent access'';';
  v_new CONSTANT text :=
    '  ELSIF v_variant=''ledger'' THEN status:=''SKIP''; detail:=''ledger access is org-scoped; the ledger RLS lane never reads visibility'';';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='iam' AND p.proname='verify_canonical';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'C: iam.verify_canonical not found';
  END IF;

  IF position(v_new IN v_def) > 0 THEN
    RAISE NOTICE 'C: ledger visibility SKIP already present — nothing to do';
    RETURN;
  END IF;

  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'C: expected exactly one component-SKIP anchor in iam.verify_canonical; refusing to patch';
  END IF;

  EXECUTE replace(v_def, v_anchor, v_anchor || E'\n' || v_new);
END $$;

DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status
    FROM iam.verify_canonical('platform','judge_verdict','judge_verdict','ledger')
   WHERE check_name='visibility';
  IF v_status <> 'SKIP' THEN
    RAISE EXCEPTION 'C: ledger visibility check returned %, expected SKIP', v_status;
  END IF;
END $$;

-- ─── D. regenerate policies where the generated TEXT changes ───────────────
-- Only these 5. The 13 component tables in group A gain no policy change at
-- all (the component lane emits no deleted_at prefix and no anon lane), so
-- re-running apply_rls on them would be churn with a drop-and-recreate window
-- for zero benefit.
SELECT iam.apply_rls('platform','outcome_event','platform_outcome_event','entity');
SELECT iam.apply_rls('platform','purpose','purpose','entity');
SELECT iam.apply_rls('browser','stream_ticket','browser_stream_ticket','restricted');
SELECT iam.apply_rls('chat','coding_session','coding_session','restricted');
SELECT iam.apply_rls('platform','comments','comment','entity');

-- Proof: every anon lane on a soft-deletable table now filters deleted rows,
-- and the two new visibility columns actually produced their pub_read lane.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE policyname='pub_read'
     AND (schemaname,tablename) IN (('platform','outcome_event'),('platform','purpose'))
     AND qual LIKE '%deleted_at IS NULL%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'D: expected 2 deleted_at-guarded pub_read policies, found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE policyname='pub_read'
     AND (schemaname,tablename) IN (('chat','coding_session'),('platform','comments'));
  IF n <> 2 THEN
    RAISE EXCEPTION 'D: expected 2 new pub_read lanes, found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE (schemaname,tablename) IN (('platform','outcome_event'),('platform','purpose'),
         ('browser','stream_ticket'),('chat','coding_session'),('platform','comments'))
     AND policyname='svc_all';
  IF n <> 5 THEN
    RAISE EXCEPTION 'D: expected 5 svc_all policies after regeneration, found %', n;
  END IF;
END $$;

COMMIT;
