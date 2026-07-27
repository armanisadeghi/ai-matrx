/**
 * Surface manifest — CMS site workspace (`matrx-user/cms-site`).
 *
 * Drives `/cms/[siteId]` and every tab under it — Pages, Components,
 * Collections, Settings — all of which render inside `SiteLayoutClient`
 * (`app/(core)/cms/[siteId]/SiteLayoutClient.tsx`). That layout is the
 * surface's guarantee boundary: it will not render children until the site
 * row has loaded, and it caches the page + component lists so every tab
 * rebuilds the same framing from one in-memory source.
 *
 * This is where the shared `site_structure` framing value FIRST becomes
 * available — every surface underneath (page editor, component editor) emits
 * the exact same XML shape so an agent orients itself identically no matter
 * which of the three it's running against. See
 * `features/cms/utils/buildSiteStructureXml.ts`.
 *
 * Inherits `matrx-user/cms`: the layout genuinely loads the user's full site
 * list for the switcher dropdown, so the hub's inventory vocabulary
 * (`owned_sites_count`, `active_sites_count`, `owned_sites_summary`,
 * `selected_site_id`) is true here too — `selected_site_id` resolves to the
 * site currently open.
 *
 * TAB-SCOPED VALUES: the Collections tab and the Settings tab load/hold data
 * the layout does not. Both mount a NESTED `<SurfaceRuntimeProvider>` that
 * re-emits the full site scope plus their own extras, so `collections_*` and
 * `settings_draft` are honestly declared `alwaysAvailable: false`.
 *
 * The site's `data_api_key` VALUE is deliberately never emitted — only
 * `has_data_api_key`. Runtime scope assembly lives in
 * `features/cms/agent-context/buildCmsSiteContextData.ts`.
 *
 * NOTE: this feature talks to a SEPARATE Supabase project
 * (`viyklljfdhtidwecakwx`) through the `/api/cms/*` routes — see
 * `features/cms/FEATURE.md`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { AgentWritePolicy } from "@/features/cms/types";
import type { CmsHubSiteSummaryEntry } from "./cms.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_identity",
    label: "Site identity & URLs",
    sortOrder: 100,
    description:
      "Which website this workspace is scoped to and where it serves publicly.",
  },
  {
    key: "site_content",
    label: "Site content",
    sortOrder: 200,
    description:
      "The framing XML plus the page and shared-component inventories the layout caches for every tab.",
  },
  {
    key: "site_presentation",
    label: "Presentation & defaults",
    sortOrder: 300,
    description:
      "Site-wide look and metadata defaults: global CSS, theme, navigation, footer, contact, social.",
  },
  {
    key: "site_governance",
    label: "Governance",
    sortOrder: 400,
    description:
      "What agents are permitted to do on this site, and the public data-key standing.",
  },
  {
    key: "site_collections",
    label: "Collections",
    sortOrder: 500,
    description:
      "Per-site structured data collections. Loaded only on the Collections tab.",
  },
  {
    key: "workspace_state",
    label: "Workspace state",
    sortOrder: 600,
    description:
      "Where the user is inside the site workspace and what they are pointing at or editing.",
  },
];

/** One entry of the `pages_summary` surface value. */
export interface CmsSitePageEntry {
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
  meta_title: string | null;
  meta_description: string | null;
  last_published_at: string | null;
  updated_at: string;
}

/** One entry of the `components_summary` surface value. */
export interface CmsSiteComponentEntry {
  id: string;
  component_type: string;
  name: string;
  is_active: boolean;
  has_draft: boolean;
  last_published_at: string | null;
  updated_at: string;
}

/** One entry of the `collections_summary` surface value. */
export interface CmsSiteCollectionEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  field_keys: string[];
  validation_mode: string;
  public_read: boolean;
  public_write: boolean;
  searchable: boolean;
  status: string;
  item_count: number;
  unread_count: number;
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Site identity & URLs ─────────────────────────────────────────────
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the site (`client_sites.id`) this workspace is scoped to. Always populated — the route carries it and the layout refuses to render children until the row loads.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "site_identity",
  },
  {
    name: "site_slug",
    label: "Site slug",
    description:
      "URL slug of the site, used in live/preview URLs (`/c/{slug}/…`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 305,
    group: "site_identity",
  },
  {
    name: "site_name",
    label: "Site name",
    description: "Human display name of the site. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "site_identity",
  },
  {
    name: "site_domain",
    label: "Site domain",
    description:
      "Canonical serving host for the site (normalized lowercase, e.g. www.example.com). When set, the site serves at this domain with no `/c/` prefix. Empty when the site has no custom domain attached and serves only under `/c/{slug}`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 315,
    group: "site_identity",
  },
  {
    name: "site_is_active",
    label: "Site is active",
    description:
      "True when the site is switched on (the Active badge). An inactive site still exists and is editable but is not meant to serve. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "site_identity",
  },
  {
    name: "live_url",
    label: "Site live URL",
    description:
      "Public root URL of the site's home page (custom domain when set, otherwise `/c/{slug}`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 325,
    group: "site_identity",
  },
  {
    name: "preview_url",
    label: "Site preview URL",
    description:
      "Draft-content preview URL of the site's home page (`?preview=true`) — renders the `*_draft` twins instead of published content. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 70,
    sortOrder: 330,
    group: "site_identity",
  },
  {
    name: "site_created_at",
    label: "Site created at",
    description:
      "ISO timestamp of when the site row was created. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 25,
    sortOrder: 335,
    autoContext: false,
    group: "site_identity",
  },
  {
    name: "site_updated_at",
    label: "Site updated at",
    description:
      "ISO timestamp of the last write to the site row itself (settings/theme/CSS — not its pages). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 25,
    sortOrder: 340,
    autoContext: false,
    group: "site_identity",
  },
  {
    name: "site_owner_user_id",
    label: "Site owner user ID",
    description:
      "UUID of the user who owns this site (`client_sites.owner_user_id`) — the ownership check every `/api/cms/*` route enforces. Empty on the (loudly logged, never auto-claimed) legacy rows that have no owner.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 345,
    group: "site_identity",
  },

  // ── Site content ─────────────────────────────────────────────────────
  {
    name: "site_structure",
    label: "Site structure (big picture)",
    description:
      "Compact XML snapshot of the whole site: id/slug/name/policy/live+preview URLs, every page's routing + status flags (published/has_draft/home/nav), and every shared component's type/name/has_draft. No HTML/CSS/JS bodies; capped at 12KB. Always populated (an empty site yields an empty shell). The single most important context item on any CMS website surface — read this first to orient, then use the CMS agent tools to navigate to a specific page or component.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    sortOrder: 350,
    group: "site_content",
  },
  {
    name: "pages_summary",
    label: "Pages summary",
    description:
      "Structured twin of the page list the workspace renders: per page `{ id, slug, title, category, page_type, is_published, has_draft, is_home_page, show_in_nav, sort_order, meta_title, meta_description, last_published_at, updated_at }`. No HTML/CSS/JS bodies. Always populated — empty array on a site with no pages, or while the layout's page cache is still loading.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 355,
    group: "site_content",
  },
  {
    name: "pages_count",
    label: "Pages count",
    description:
      "Total number of pages on this site. Always populated — zero on an empty site or while the page cache loads.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 360,
    group: "site_content",
  },
  {
    name: "published_pages_count",
    label: "Published pages count",
    description:
      "How many of this site's pages carry `is_published = true`. Always populated — zero when nothing has been published yet.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 365,
    group: "site_content",
  },
  {
    name: "pages_with_draft_count",
    label: "Pages with unpublished drafts",
    description:
      "How many pages carry `has_draft = true` — edited content sitting in the `*_draft` twins that the live site is not serving yet. Always populated; zero when every page is in sync.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 370,
    group: "site_content",
  },
  {
    name: "home_page_id",
    label: "Home page ID",
    description:
      "UUID of the page flagged `is_home_page`. Empty when the site has no page marked as home (a real and common misconfiguration on new sites).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 375,
    group: "site_content",
  },
  {
    name: "components_summary",
    label: "Components summary",
    description:
      "Structured twin of the shared component inventory (headers, footers, sidebars, CTAs): per component `{ id, component_type, name, is_active, has_draft, last_published_at, updated_at }`. No HTML/CSS bodies — those belong to the CMS Component surface. Always populated; empty array when the site has none or the cache is still loading.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 700,
    sortOrder: 380,
    group: "site_content",
  },
  {
    name: "components_count",
    label: "Components count",
    description:
      "Total number of shared components on this site. Always populated — zero when none exist.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 385,
    group: "site_content",
  },

  // ── Presentation & defaults ──────────────────────────────────────────
  {
    name: "site_global_css",
    label: "Global CSS",
    description:
      "Site-wide CSS applied to every page (`client_sites.global_css`), editable on the Settings tab. Empty when the site defines no global styles.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "site_presentation",
  },
  {
    name: "site_favicon",
    label: "Favicon URL",
    description:
      "URL of the site's favicon, editable on the Settings tab. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 405,
    group: "site_presentation",
  },
  {
    name: "site_theme_config",
    label: "Theme config",
    description:
      "Free-form theme configuration JSON for the site (colors, fonts, tokens the my-matrx renderer consumes). Always emitted — an empty object when the site has never been themed. Displayed read-only under Settings → Advanced today.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 410,
    group: "site_presentation",
  },
  {
    name: "site_navigation",
    label: "Navigation config",
    description:
      "The site's navigation structure as stored on the row (`client_sites.navigation`). Always emitted — an empty array when navigation is derived from pages' `show_in_nav` flags instead of being explicitly configured.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 415,
    group: "site_presentation",
  },
  {
    name: "site_footer_config",
    label: "Footer config",
    description:
      "Footer configuration JSON for the site. Always emitted — an empty object when the footer comes entirely from a shared component instead.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 420,
    group: "site_presentation",
  },
  {
    name: "site_meta_defaults",
    label: "Meta defaults",
    description:
      "Site-wide default metadata (title suffix, description, social image) that pages inherit when they set none of their own. Always emitted — an empty object when no defaults are configured.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 425,
    group: "site_presentation",
  },
  {
    name: "site_contact_info",
    label: "Contact info",
    description:
      "The site's business contact details (address, phone, email, hours) available to rendered pages. Always emitted — an empty object when unset. Displayed read-only under Settings → Advanced.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 430,
    group: "site_presentation",
  },
  {
    name: "site_social_links",
    label: "Social links",
    description:
      "The site's social profile URLs available to rendered pages. Always emitted — an empty object when unset.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 250,
    sortOrder: 435,
    group: "site_presentation",
  },
  {
    name: "site_profile",
    label: "Site profile",
    description:
      "The composite site-wide presentation object: `{ theme_config, navigation, footer_config, meta_defaults, contact_info, social_links, favicon }`. Mirrors the individual presentation values as one group value (completeness law) so an agent writing site-wide copy can take the whole picture in one binding. Always emitted; individual keys may be empty.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 440,
    group: "site_presentation",
  },

  // ── Governance ───────────────────────────────────────────────────────
  {
    name: "agent_write_policy",
    label: "Agent write policy",
    description:
      '"blocked" (agents cannot write at all), "draft_only" (agents may save drafts but never publish — a human must publish), or "full" (agents may publish directly). Always populated, defaulting to "blocked" when the site sets none. An agent MUST check this before attempting any write and refuse/degrade politely when "blocked".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 450,
    group: "site_governance",
  },
  {
    name: "policy_overrides",
    label: "Policy overrides",
    description:
      "Per-rule overrides layered on top of `agent_write_policy` (`client_sites.settings.policy_overrides`). Empty when the site uses the blanket policy with no exceptions, which is the normal case.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 455,
    group: "site_governance",
  },
  {
    name: "has_data_api_key",
    label: "Data key minted",
    description:
      "True when the site has a public collections write key (`client_sites.data_api_key`), which is minted on first collection create. Always populated. The key VALUE is never emitted to agents — it is revealed, copied, and rotated deliberately by a human on the Collections tab.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 460,
    group: "site_governance",
  },

  // ── Collections (Collections tab only) ───────────────────────────────
  {
    name: "collections_summary",
    label: "Collections summary",
    description:
      "The site's data collections as listed on the Collections tab: per collection `{ id, slug, name, description, field_keys, validation_mode, public_read, public_write, searchable, status, item_count, unread_count }`. Field schemas are reduced to their key list — the full schema belongs to the collection editor. Empty when the user is not on the Collections tab (no other tab loads collections) or the site has none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 500,
    group: "site_collections",
  },
  {
    name: "collections_count",
    label: "Collections count",
    description:
      "Number of collections listed on the Collections tab. Empty when the user is on any other tab; zero when the tab is open and the site has no collections.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 505,
    group: "site_collections",
  },
  {
    name: "collections_unread_count",
    label: "Unread collection items",
    description:
      "Total unseen items across every collection on the site (the 'new' badges) — the signal that visitor submissions are waiting for triage. Empty when the user is on any other tab; zero when the tab is open and nothing is unread.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 510,
    group: "site_collections",
  },

  // ── Workspace state ──────────────────────────────────────────────────
  {
    name: "current_mode",
    label: "Current mode",
    description:
      'Which tab of the site workspace the user is on: "pages", "components", "collections", "settings", "collection-items", "page-editor", or "new-page". Always populated — derived from the pathname.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 600,
    group: "workspace_state",
  },
  {
    name: "selected_page_id",
    label: "Selected page ID",
    description:
      "UUID of the page row the user last interacted with in the page list. Empty when nothing is selected — including whenever the menu was opened on the list background rather than a row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 605,
    group: "workspace_state",
  },
  {
    name: "settings_draft",
    label: "Settings draft",
    description:
      "Unsaved edits sitting in the Settings tab form: `{ name, slug, domain, favicon, global_css, is_active }` as currently typed, which may differ from the saved site values above. Empty on every other tab. Compare against the saved values to see what the user is about to change.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 610,
    group: "workspace_state",
  },
];

export const cmsSiteManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-site",
  readiness: "verified",
  label: "CMS Site",
  urlPattern: "/cms/[siteId]",
  inheritsFrom: "matrx-user/cms",
  intro: `<surface_intro>
You are inside ONE client website of the AI Matrx CMS — the site workspace that hosts four tabs: Pages, Components, Collections, and Settings. current_mode tells you which one the user is on.
Read site_structure FIRST. It is the compact XML map of the whole site (every page's routing and publish flags, every shared component) and is the same framing the page editor and component editor emit, so your orientation never changes as the user drills in. pages_summary / components_summary are its structured twins when you need to filter or count precisely. Neither carries HTML, CSS, or JS bodies — to read or write a page's actual markup, open that page and use the CMS agent tools.
The CMS is draft/publish twinned: every content column has a *_draft partner. pages_with_draft_count is how much edited content the live site is NOT yet serving, and preview_url renders those drafts. Never describe a draft as live.
agent_write_policy is binding and you must check it before promising any change: "blocked" means no writes at all, "draft_only" means you may save drafts but a human must publish, "full" means you may publish directly.
Collections values are present only while the user is on the Collections tab; settings_draft only on Settings. Their absence means "not loaded here", not "none exist".
The inherited owned_sites_summary is the user's other websites — useful for cross-site comparison, but every write you make belongs to site_id unless the user says otherwise.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above, INCLUDING the
 * inherited always-available values from `matrx-user/cms` (the site layout
 * genuinely loads the user's full site list for the switcher).
 */
export function createCmsSiteScope(values: {
  // alwaysAvailable: true (inherited from matrx-user/cms) → required
  owned_sites_count: number;
  active_sites_count: number;
  owned_sites_summary: CmsHubSiteSummaryEntry[];
  // alwaysAvailable: true (own) → required
  site_id: string;
  site_slug: string;
  site_name: string;
  site_is_active: boolean;
  live_url: string;
  preview_url: string;
  site_created_at: string;
  site_updated_at: string;
  site_structure: string;
  pages_summary: CmsSitePageEntry[];
  pages_count: number;
  published_pages_count: number;
  pages_with_draft_count: number;
  components_summary: CmsSiteComponentEntry[];
  components_count: number;
  site_theme_config: Record<string, unknown>;
  site_navigation: unknown[];
  site_footer_config: Record<string, unknown>;
  site_meta_defaults: Record<string, unknown>;
  site_contact_info: Record<string, unknown>;
  site_social_links: Record<string, unknown>;
  site_profile: Record<string, unknown>;
  agent_write_policy: AgentWritePolicy;
  has_data_api_key: boolean;
  current_mode: string;
  // alwaysAvailable: false → optional
  selected_site_id?: string;
  selected_site?: CmsHubSiteSummaryEntry;
  site_domain?: string;
  site_owner_user_id?: string;
  home_page_id?: string;
  site_global_css?: string;
  site_favicon?: string;
  policy_overrides?: Record<string, unknown>;
  collections_summary?: CmsSiteCollectionEntry[];
  collections_count?: number;
  collections_unread_count?: number;
  selected_page_id?: string;
  settings_draft?: Record<string, unknown>;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
