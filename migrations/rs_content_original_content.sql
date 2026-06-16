-- Back up the original scraped content so user edits in the analyze-curation
-- flow are always recoverable. Captured ONCE, on the first user edit; NULL
-- until then (so existing rows are untouched and the scrape stays recoverable).
ALTER TABLE public.rs_content
  ADD COLUMN IF NOT EXISTS original_content text;

COMMENT ON COLUMN public.rs_content.original_content IS
  'Original scraped content, captured once on the first user edit of rs_content.content. NULL until edited. Lets the user restore the pre-edit scrape from the curation UI.';
