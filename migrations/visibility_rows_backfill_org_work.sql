-- visibility_rows_backfill_org_work.sql — applied live 2026-07-22
-- Owner-approved backfill: rows still carrying 'personal' from the bad-defaults
-- era flip to their table's correct tier (the column default set 2026-07-21:
-- org work -> internal, catalogs -> public). Personal-artifact tables (chats,
-- DMs, SMS, per-user progress) keep 'personal' and are untouched.
-- GATED BEHIND THE VIEW LAW ROLLOUT: applied only after every personal-space
-- list surface was mine-scoped and `pnpm check:access-guards` read ZERO —
-- widening ACCESS must never change what a user's own pages show.
-- files.files excludes immutable web-artifact files (snapshot/screenshot bodies,
-- reject_web_artifact_file_mutation guard) — crawl artifacts stay as-is.
-- ~27.9k rows flipped; ~4.7k crawl-artifact files deliberately retained.
DO $$
DECLARE r RECORD; v_n bigint; v_total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.table_schema s, c.table_name t,
           CASE WHEN c.column_default ILIKE '%internal%' THEN 'internal' ELSE 'public' END d
    FROM information_schema.columns c
    JOIN information_schema.tables it ON it.table_schema=c.table_schema AND it.table_name=c.table_name AND it.table_type='BASE TABLE'
    WHERE c.column_name='visibility'
      AND (c.column_default ILIKE '%internal%' OR c.column_default ILIKE '%public%')
      AND c.table_schema NOT IN ('graveyard')
  LOOP
    IF r.s = 'files' AND r.t = 'files' THEN
      UPDATE files.files f SET visibility = r.d::platform.visibility
      WHERE f.visibility = 'personal'
        AND NOT EXISTS (SELECT 1 FROM web.snapshot s WHERE s.body_file_id = f.id OR s.markdown_file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM web.screenshot s WHERE s.file_id = f.id);
    ELSE
      EXECUTE format('UPDATE %I.%I SET visibility = %L::platform.visibility WHERE visibility = ''personal''', r.s, r.t, r.d);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE NOTICE 'backfill: %.% -> % (% rows)', r.s, r.t, r.d, v_n;
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  RAISE NOTICE 'backfill TOTAL: % rows', v_total;
END $$;
