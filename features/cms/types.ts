// features/cms/types.ts
// Types matching the client_* tables in the My Matrx Supabase project

// ─── Site ──────────────────────────────────────────────────────────────
export interface ClientSite {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  theme_config: Record<string, unknown>;
  navigation: unknown[];
  footer_config: Record<string, unknown>;
  meta_defaults: Record<string, unknown>;
  contact_info: Record<string, unknown>;
  social_links: Record<string, unknown>;
  settings: Record<string, unknown>;
  is_active: boolean;
  owner_user_id: string | null;
  global_css: string | null;
  favicon: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Page ──────────────────────────────────────────────────────────────
export interface ClientPage {
  id: string;
  client_id: string;
  slug: string;
  title: string;
  html_content: string | null;
  html_content_draft: string | null;
  css_content: string | null;
  css_content_draft: string | null;
  js_content: string | null;
  js_content_draft: string | null;
  layout_type: string | null;
  use_client_header: boolean;
  use_client_footer: boolean;
  meta_title: string | null;
  meta_title_draft: string | null;
  meta_description: string | null;
  meta_description_draft: string | null;
  meta_keywords: string | null;
  meta_keywords_draft: string | null;
  og_image: string | null;
  og_image_draft: string | null;
  canonical_url: string | null;
  canonical_url_draft: string | null;
  is_published: boolean;
  has_draft: boolean;
  publish_date: string | null;
  last_published_at: string | null;
  last_published_by: string | null;
  is_home_page: boolean;
  sort_order: number;
  show_in_nav: boolean;
  category: string | null;
  parent_id: string | null;
  page_type: string | null;
  excerpt: string | null;
  featured_image: string | null;
  published_date: string | null;
  author: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

/** Compact listing used in the dashboard table */
export interface ClientPageSummary {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  page_type: string | null;
  is_published: boolean;
  has_draft: boolean;
  is_home_page: boolean;
  show_in_nav: boolean;
  sort_order: number;
  excerpt: string | null;
  featured_image: string | null;
  author: string | null;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  publish_date: string | null;
  last_published_at: string | null;
  updated_at: string;
  created_at: string;
}

// ─── Page Version ──────────────────────────────────────────────────────
export interface ClientPageVersion {
  id: string;
  page_id: string;
  version_number: number;
  version_label: string | null;
  html_content: string;
  css_content: string | null;
  js_content: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
  published_by: string | null;
  published_at: string;
  change_summary: string | null;
  created_at: string;
}

// ─── Component ─────────────────────────────────────────────────────────
export interface ClientComponent {
  id: string;
  client_id: string;
  component_type: string;
  name: string;
  html_content: string;
  html_content_draft: string | null;
  css_content: string | null;
  css_content_draft: string | null;
  is_active: boolean;
  has_draft: boolean;
  last_published_at: string | null;
  last_published_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Asset ─────────────────────────────────────────────────────────────
export interface ClientAsset {
  id: string;
  client_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  folder: string;
  tags: string[] | null;
  used_in_pages: string[] | null;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Activity ──────────────────────────────────────────────────────────
export interface ClientActivityLog {
  id: string;
  client_id: string | null;
  activity_type: string;
  entity_type: string | null;
  entity_id: string | null;
  changes: Record<string, unknown> | null;
  description: string | null;
  user_id: string | null;
  user_email: string | null;
  ip_address: string | null;
  created_at: string;
}
