-- Crawl sessions are the durable, low-frequency heartbeat for crawl activity.
-- The browser catches up from web.crawl_event after every session change, so
-- the large per-page event payloads never need to cross Realtime directly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'web'
      AND tablename = 'crawl_session'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE web.crawl_session;
  END IF;
END
$$;
