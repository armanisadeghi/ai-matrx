-- Repoint pdf_link_file_pages_for_new_page off the public.file_pages compat view
-- onto the canonical files.pages base table, so it survives the file_* shim-view drop.
-- The view is security_invoker over files.pages, so behavior is identical today; this only
-- removes the dependency on the about-to-be-dropped view. Idempotent CREATE OR REPLACE.
-- (Sibling trigger pdf_resolve_file_page_link already reads files.files/processed_document_pages,
--  never file_pages, so it needs no change.)

CREATE OR REPLACE FUNCTION public.pdf_link_file_pages_for_new_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update files.pages fp
     set processed_document_page_id = new.id
    from files.files c
   where c.canonical_processed_document_id = new.processed_document_id
     and fp.file_id = c.id
     and fp.source_page_index = new.page_index
     and fp.processed_document_page_id is null;
  return new;
end $function$;
