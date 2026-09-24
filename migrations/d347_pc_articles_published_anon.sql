-- D347: only published articles reach anonymous readers, including direct REST reads.
-- Depends on d347_anonymous_publication_contract.sql.
-- Declare the exact row before any policy DDL; declaration and emit are atomic.
-- Put no slow work after the final emit.
-- The clone already carries this unrecorded prototype; production does not.
-- Supersede only that exact name through the canonical, reason-recording door.
SET LOCAL lock_timeout = '2s';
DO $declare$
DECLARE matched integer;
BEGIN
  UPDATE platform.entity_types SET anonymous_read_status='published'
   WHERE token='pc_article' AND schema_name='podcast' AND table_name='pc_articles' AND is_active;
  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> 1 THEN
    RAISE EXCEPTION 'D347: expected exactly one active podcast.pc_articles registration; found %', matched;
  END IF;
END
$declare$;
SELECT iam.supersede_bespoke_policies(
 'podcast','pc_articles',ARRAY['pc_articles_anon_published_only'],
 'D347: replace the unrecorded anonymous-only publication prototype with the generated anon_status_gate declared by platform.entity_types.anonymous_read_status, so regeneration and canonical verification enforce the same published-only contract.')
 WHERE EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='podcast.pc_articles'::regclass AND polname='pc_articles_anon_published_only');
SELECT iam.apply_rls('podcast','pc_articles','pc_article','entity');
