// features/cms/types.ts
// Types matching the client_* tables in the My Matrx Supabase project

// ─── Agent access policy (F4) ────────────────────────────────────────────
// Lives in `client_sites.settings.agent_write_policy` — no dedicated column.
// blocked: agents cannot write at all. draft_only: agents may save drafts but
// never publish (publish requires a human). full: agents may publish directly.
// Default is `blocked` for existing sites, `full` for `dev-website` (F4).
export type AgentWritePolicy = 'blocked' | 'draft_only' | 'full';

export interface ClientSiteSettings {
  agent_write_policy?: AgentWritePolicy;
  policy_overrides?: Record<string, unknown>;
  [key: string]: unknown;
}

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
  settings: ClientSiteSettings;
  is_active: boolean;
  owner_user_id: string | null;
  global_css: string | null;
  favicon: string | null;
  /**
   * W2-C per-site data key (CMS migration 0015). Required on public collection
   * writes (`X-Matrx-Site-Key`). Ships inside rendered page HTML — NOT a secret;
   * its value is revocation + attribution. Generated on first collection create,
   * rotatable from the Collections tab (`rotate_key`).
   */
  data_api_key: string | null;
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
  /**
   * W2-A promote provenance (CMS migration 0008) — set only on pages promoted
   * from an `html_pages` quick-publish row. No FK: survives source deletion.
   * Reverse direction lives in `html_pages.context_metadata.promotions[]`.
   */
  source_html_page_id: string | null;
  source_artifact_id: string | null;
  source_message_id: string | null;
  source_conv_id: string | null;
}

/** Result of the `promote` action on /api/cms/pages (html_page → draft page). */
export interface PromoteFromHtmlPageResult {
  success: boolean;
  /** True when this html_page was already promoted onto the site — `page` is the existing row. */
  reused: boolean;
  page: ClientPage;
  conversionWarnings: string[];
  /** Null when `reused` (no conversion ran). */
  wasFullDocument: boolean | null;
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

// ─── Entity Version ────────────────────────────────────────────────────
// The canonical append-only history (`history.row_versions` on the CMS project).
// EVERY change to a versioned row — create, edit, draft save, publish, rollback —
// is one entry. SIX entities are versioned (CMS migrations 0005 + 0015), not just pages;
// the `entity_type` token says which. Shapes mirror aidream's `VersionSummary` /
// `VersionRead` (`services/cms/dtos.py`) 1:1 so both surfaces agree.

export type VersionOperation = "INSERT" | "UPDATE" | "DELETE";

/** `platform.entity_types` tokens for the versioned CMS entities. */
export type CmsEntityType =
  | "client_site"
  | "client_page"
  | "client_component"
  | "client_asset"
  | "html_page"
  | "site_collection";

export interface ClientEntityVersion {
  /** `history.row_versions.id` — a bigint, carried as a string. */
  id: string;
  entity_type: CmsEntityType;
  /** The versioned row's id (a page id, a site id, …). */
  row_id: string;
  /** The row's `version` at the time of the change. Rollback targets this. */
  version_number: number;
  operation: VersionOperation;
  /**
   * Who made the change. NULL whenever the writer set neither `app.user_id` nor
   * a JWT — aidream connects as `postgres` and the `/api/cms/*` routes use the
   * secret key, so this is usually NULL. Authoritative attribution for those
   * writes lives in `client_activity_log`.
   */
  actor_id: string | null;
  occurred_at: string;
  /** True when this version is the row's live content right now. */
  is_current: boolean;
}

/**
 * A version plus the raw row snapshot it captured. `data` is NOT flattened into
 * typed fields — the columns differ per entity, and a page-shaped version DTO is
 * exactly what made the old system a lie. Callers read the fields their entity has;
 * `pageVersionContent()` below is the typed reader for `client_page`.
 */
export interface ClientEntityVersionDetail extends ClientEntityVersion {
  data: Record<string, unknown>;
}

/** The content fields a `client_page` snapshot carries, read out of `data`. */
export interface PageVersionContent {
  title: string | null;
  slug: string | null;
  is_published: boolean | null;
  html_content: string | null;
  css_content: string | null;
  js_content: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image: string | null;
  canonical_url: string | null;
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

// ─── Validation exceptions (F3 escape hatch — C3, owned by P3/P1) ────────
// Mirrors `matrx_content_guard.models.Violation` + `ContentException`
// (aidream `packages/matrx-content-guard`). The store (`client_content_exceptions`)
// had not been created by P1 as of 2026-07-09 — `/api/cms/approvals` degrades
// gracefully (returns `available: false`) until it exists.
export type ContentExceptionStatus = 'pending' | 'approved' | 'rejected';

export interface ContentException {
  id: string;
  rule_id: string;
  scope_site_id: string | null;
  scope_page_id: string | null;
  match_node_path_prefix: string | null;
  match_excerpt_contains: string | null;
  status: ContentExceptionStatus;
  note: string | null;
  // Review context — the Violation that triggered this request, if carried.
  node_path?: string | null;
  excerpt?: string | null;
  fix_hint?: string | null;
  severity?: 'warning' | 'block' | null;
  created_by?: string | null;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

// ─── Asset ─────────────────────────────────────────────────────────────
export interface ClientAsset {
  id: string;
  client_id: string;
  /**
   * Main-project cld_files id minted by the canonical assets pipeline
   * (CMS migration 0013). Cross-DB linkage — resolvable via InlineMediaRef.
   * `file_path` carries the durable public CDN URL page HTML references.
   */
  file_id: string | null;
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

/** One page referencing an asset's URL (live usage scan). */
export interface AssetPageUsage {
  page_id: string;
  slug: string;
  title: string | null;
  fields: string[];
}

export interface AssetComponentUsage {
  component_id: string;
  component_type: string;
  name: string | null;
  fields: string[];
}

/** "What breaks if I delete this" — the live scan result from /api/cms/assets `usage`. */
export interface AssetUsage {
  asset_id: string;
  url: string;
  used_in_pages: AssetPageUsage[];
  used_in_components: AssetComponentUsage[];
  in_use: boolean;
}

// ─── Activity (C6 — master plan §5) ─────────────────────────────────────
// `changes` always carries `actor` (set by the writer: P1's aidream services
// write "agent"/"system", the matrx-frontend `/api/cms/*` routes write
// "human") plus an optional `metadata` bag — e.g. P4 writes
// `metadata.capture_media_refs[]` for verification screenshots.
export interface ClientActivityChanges {
  actor: 'agent' | 'human' | 'system';
  metadata?: {
    capture_media_refs?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ─── Collections (W2-C — CMS migration 0015) ────────────────────────────
// Per-site named data collections: the definition (`site_collections`, a
// versioned content entity, token `site_collection`) and its rows
// (`site_collection_items`, append-heavy, NOT versioned). Field schemas are
// validator DATA, never DDL. Hand-maintained like every other type in this
// file (the CMS project has no generated types).

export type CollectionFieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'email'
  | 'url'
  | 'datetime'
  | 'select'
  | 'json';

/** One entry of `site_collections.field_schema` (array of these). */
export interface CollectionFieldDef {
  key: string;
  label: string;
  type: CollectionFieldType;
  required?: boolean;
  /** text-ish types only */
  max_length?: number;
  /** number only */
  min?: number;
  /** number only */
  max?: number;
  /** select only */
  options?: string[];
}

/** Per-collection overrides of the platform caps — all optional. */
export interface SiteCollectionSettings {
  rate_limit_per_ip_per_hour?: number;
  rate_limit_per_site_per_hour?: number;
  max_item_bytes?: number;
  max_items?: number;
  honeypot_field?: string;
  retention_days?: number;
  [key: string]: unknown;
}

export type CollectionValidationMode = 'advisory' | 'strict';
export type CollectionStatus = 'active' | 'archived';

export interface SiteCollection {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  description: string | null;
  field_schema: CollectionFieldDef[];
  validation_mode: CollectionValidationMode;
  public_write: boolean;
  public_read: boolean;
  /** Double opt-in for reads: public_read AND the field named here. */
  public_read_fields: string[];
  allow_upsert: boolean;
  searchable: boolean;
  settings: SiteCollectionSettings;
  status: CollectionStatus;
  deleted_at: string | null;
  created_by: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/** `list` adds live counts (cheap via the 0015 partial indexes). */
export interface SiteCollectionSummary extends SiteCollection {
  item_count: number;
  unread_count: number;
}

export interface SiteCollectionItem {
  id: string;
  collection_id: string;
  client_id: string;
  data: Record<string, unknown>;
  idempotency_key: string | null;
  submitted_by: string | null;
  source_url: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_spam: boolean;
  seen_at: string | null;
  status: CollectionStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Items-viewer filter vocabulary (maps to is_spam / seen_at / status). */
export type CollectionItemFilter = 'all' | 'unread' | 'spam' | 'archived';

export interface ClientActivityLog {
  id: string;
  client_id: string | null;
  activity_type: string;
  entity_type: string | null;
  entity_id: string | null;
  changes: ClientActivityChanges | null;
  description: string | null;
  user_id: string | null;
  user_email: string | null;
  ip_address: string | null;
  created_at: string;
}
