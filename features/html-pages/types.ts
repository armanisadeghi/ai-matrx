/**
 * Types for standalone `html_pages` rows (HTML CMS project).
 * Distinct from CMS `client_pages` — user-scoped full-document publishes.
 */

/** Summary row from the list API (no html_content blob). */
export interface HtmlPageSummary {
  id: string;
  meta_title: string;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
  is_indexable: boolean;
  created_at: string;
  updated_at: string;
  artifact_id: string | null;
  source_message_id: string | null;
  source_conv_id: string | null;
  url: string;
}

/** Full row from the get API. */
export interface HtmlPageRecord extends HtmlPageSummary {
  user_id: string;
  html_content: string;
  context_metadata: Record<string, unknown> | null;
}

export interface HtmlPageMetaFields {
  metaKeywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
  isIndexable?: boolean;
}
