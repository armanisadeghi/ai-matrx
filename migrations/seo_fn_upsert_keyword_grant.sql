-- Let signed-in users ensure a keyword-library row exists (the page keyword
-- board attaches library keywords to pages; a phrase not yet in the library
-- needs its row first). seo.fn_upsert_keyword is the ONE canonical idempotent
-- upsert (SECURITY DEFINER, dedupes by normalized phrase + language) already
-- used by the server ingest writers — reuse it, never a second insert path.
grant execute on function seo.fn_upsert_keyword(text, text) to authenticated;
