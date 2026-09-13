/**
 * Literal projection for the anonymous learn-doc reader.
 *
 * Supabase's query parser needs a literal type to infer the returned row. The
 * forcing test in lib/security/public-exposure.test.ts pins this list to the
 * canonical ANON_COLUMN_SURFACE declaration and forbids a wildcard.
 */
export const LEARN_DOC_PUBLIC_SELECT =
  "id,created_at,updated_at,deleted_at,visibility,slug,title,summary,subject,letter,keywords,sections,related,content_updated_at,published_at" as const;
