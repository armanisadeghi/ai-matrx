-- Catalog entries: allow underscore in key — natural identifiers from the
-- shipped catalogs (af_heart, hey_jarvis, Qwen35_2B) are code identifiers and
-- keys must match them verbatim. Table was empty at apply time.
ALTER TABLE public.catalog_entries
  DROP CONSTRAINT IF EXISTS catalog_entries_key_check;
ALTER TABLE public.catalog_entries
  ADD CONSTRAINT catalog_entries_key_check
  CHECK (key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/ _-]{0,199}$');
NOTIFY pgrst, 'reload schema';
