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
  SurfaceWriteTarget,
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
  /** Trigger-computed full public path (CMS migration 0028) — the page's real URL. */
  route: string;
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
      "Theme tokens for the site as `{ group: { key: value } }` (plus bare top-level scalars), which the my-matrx renderer flattens into CSS custom properties — `colors.primary_teal` becomes `--color-primary-teal`. Always emitted — an empty object when the site has never been themed. Edited row-by-row in Settings → Theme Tokens.",
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
      "The site's business contact details (`{ phone, phone_raw, email, address: { street, city, state, zip } }`) available to rendered pages. Always emitted — an empty object when unset. Edited in Settings → Contact Info.",
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

/**
 * What agents may WRITE into the site workspace — the write half of the 360
 * loop. SIX targets, all `ask`. Five are on the Settings tab and `mode:
 * "draft"` (`site_global_css`, `site_theme_config`, `site_navigation`,
 * `site_footer_config`, `site_name`); one — `add_page` — is on the Pages tab
 * and `mode: "entity"`, the single target here that actually writes.
 *
 * TAB-SCOPED BY CONSTRUCTION. Each tab mounts its own nested provider and
 * registers only the handlers for the state IT owns, and the writeback seam
 * never advertises a target with no live handler (`listAgentWritableTargets`),
 * so the Settings targets are offered only on Settings and `add_page` only on
 * Pages. That is the design, not a gap: a target is offered exactly where a
 * canonical write path for it is mounted.
 *
 * WHY DRAFT IS THE WHOLE STORY HERE. Every target lands in the SAME `useState`
 * the user's own typing drives — `globalCss` on
 * `app/(core)/cms/[siteId]/settings/page.tsx`, and the per-section drafts in
 * `features/cms/components/settings/SiteAdvancedSettings.tsx`. Nothing reaches
 * `client_sites` until the human clicks that section's Save. That distinction
 * is load-bearing for this feature specifically: `agent_write_policy`
 * (`blocked | draft_only | full`, `client_sites.settings`) governs what an
 * agent may SAVE, and staging is not saving — so these targets are honest even
 * on a `blocked` site, exactly as the cms-component targets are. No target
 * here calls `CmsSiteService` itself; the human's Save is the only writer.
 *
 * There is no draft/publish twin at the SITE level (unlike pages and
 * components): `client_sites` columns are live. So the human's Save publishes
 * site-wide immediately — which is why every target is `ask` and none is
 * `auto`.
 *
 * WHY THESE FOUR. Each is authored material an agent plausibly produces, and
 * each has a real editor with a Save affordance to stage into:
 *  - `site_global_css` — a stylesheet. The clearest yes on the surface, and
 *    the editor is a plain `<Textarea>` with no `EditableContextMenu` on it,
 *    so an agent has NO user-driven text-replace seam to fall back on; a
 *    declared target is the only way in (the same gap the html-page manifest
 *    calls out for its Monaco editor).
 *  - `site_theme_config` — a design-token palette. Pairs with the CSS target:
 *    the stylesheet consumes the `--color-*` vars these rows generate, so
 *    "restyle this site" is one coherent ask across two targets.
 *  - `site_navigation` — `[{label, href}]`. The agent already holds
 *    `site_structure`, i.e. every page's route and `show_in_nav` flag, so
 *    "build the menu from my published pages" is a request it can actually
 *    fulfil rather than guess at.
 *  - `site_footer_config` — LAYOUT only (columns, headings, copyright, legal
 *    links). Authored copy assembled from the same page inventory. Declared as
 *    ONE object because the section saves one object; five micro-targets would
 *    make five dialogs for one edit.
 *  - `site_name` — the site's display label, staged into the General card next
 *    to the Save Changes button. Naming is authorship, and it is the one
 *    identity-adjacent field on this row that moves nothing: unlike slug and
 *    domain, renaming a site changes no URL and breaks no link.
 *  - `add_page` (Pages tab, `entity`) — the decomposition action. "Add an
 *    About page" is a request an agent can complete honestly because the page
 *    it creates is an UNPUBLISHED, empty stub: it lands in the Pages list for
 *    the human to open and fill in, changes nothing the live site serves, and
 *    is deleted with the row's own delete control. It runs through the same
 *    `CmsPageService.createPage` the New Page route uses and then
 *    `refreshPages()`, so `pages_summary` / `site_structure` re-read true.
 *    Being a real write, it is the one target `agent_write_policy: "blocked"`
 *    refuses.
 *
 * Deliberately NOT declared:
 *  - `site_meta_defaults` — the honest miss, and the reason is a UI gap, not a
 *    judgment call. It is the best agent-value field on the whole site row
 *    (site-wide title suffix / description / social image that every page
 *    inherits), but WF-6 built editors for theme/navigation/footer/contact/
 *    social and skipped it, so there is no draft state to stage into and no
 *    Save affordance to review under. The only available path would be an
 *    immediate `CmsSiteService.updateSite({ metaDefaults })` — an `entity`
 *    write that both bypasses the human's review and IS a save, which
 *    `agent_write_policy: "blocked" | "draft_only"` forbids. Build the editor
 *    first; then this is a one-line target.
 *  - `site_contact_info` / `site_social_links` — real editors exist, but these
 *    are transcription, not authorship: an agent cannot produce a business's
 *    phone number or Instagram URL, it can only retype what it was handed.
 *  - `site_domain` / `site_slug` — identity. Changing either moves where the
 *    site serves and breaks every inbound link; the domain additionally has a
 *    DB CHECK plus DNS/Vercel attachment a write here cannot complete.
 *  - `site_is_active` and publishing — human gates by design. Flipping active
 *    takes the site off the internet.
 *  - Delete site, Install starter kit — destructive/replacing actions behind
 *    an explicit confirm (starter kit overwrites global CSS wholesale).
 *  - `site_favicon` — a URL to an asset the agent has not uploaded.
 *  - `agent_write_policy` / `policy_overrides` — the gate on agent writes is
 *    not itself agent-writable, for the obvious reason. Super-admin only
 *    (`adminUpdatePolicy`).
 *
 * Read-twin caveat worth stating once: the `site_*` read values are emitted
 * from the SAVED `client_sites` row, and only `settings_draft` carries unsaved
 * edits (and only the General/Global-CSS ones). So immediately after a stage,
 * re-reading `site_theme_config` still shows the old value — the editor is
 * ahead of the read twin until the human saves.
 *
 * ONE-CARD-AT-A-TIME (pre-existing page behaviour, observed in verification).
 * Each section saves independently and then calls `refreshSite()`, and
 * `SiteAdvancedSettings` deliberately remounts its sections on the new
 * `site.updated_at` "so drafts re-seed from truth". The consequence for a
 * multi-target stage is real: staging three targets and then clicking Save on
 * each card in turn persisted only the FIRST — the refresh re-seeded the other
 * cards from the saved row and discarded what was staged there. Each target
 * persists correctly when staged and saved on its own. This is the settings
 * page's existing behaviour (a human editing two cards at once loses the same
 * work), not something the write targets introduced, but write targets make it
 * far easier to hit, so the intro tells agents to warn the user.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "site_global_css",
    label: "Global CSS",
    description:
      "Stage the site-wide stylesheet into the Global CSS editor on the Settings tab. Value: { css: string, mode?: 'replace' | 'append' } — 'replace' (the default) swaps the whole stylesheet, 'append' adds to the end of what is already there ('append' is the safe choice when you are adding rules rather than restyling). Plain CSS rules only, never a <style> tag. This stylesheet loads on EVERY page of the site and sits under each page's and each shared component's own CSS, so read `site_global_css` first when revising, and prefer the `--` custom properties from `site_theme_config` over hard-coded values. Staging only: it sits in the editor until the human clicks Save Changes, and that Save writes the live column — the whole site renders it immediately.",
    valueType: "object",
    updatesValue: "site_global_css",
    mode: "draft",
    applyPolicy: "ask",
    group: "site_presentation",
    sortOrder: 400,
  },
  {
    name: "site_theme_config",
    label: "Theme tokens",
    description:
      "Stage the site's design tokens into the Theme Tokens editor on the Settings tab. Value: the FULL token map as `{ group: { key: value } }` (bare top-level scalars allowed), e.g. `{ colors: { primary: '#0f766e' }, fonts: { body: 'Inter, sans-serif' } }`. Every leaf must be a string or number — nested objects are refused. This REPLACES every row in the editor, so read `site_theme_config` and include the tokens you are keeping. Each row becomes a CSS custom property on the live site (`colors.primary_teal` → `--color-primary-teal`), which is how `site_global_css` and component CSS should reference these values. Values that fail the renderer's safety allowlist are dropped at render time, never served. Staging only: the human clicks Save on the Theme Tokens card.",
    valueType: "object",
    updatesValue: "site_theme_config",
    mode: "draft",
    applyPolicy: "ask",
    group: "site_presentation",
    sortOrder: 410,
  },
  {
    name: "site_navigation",
    label: "Navigation menu",
    description:
      "Stage the site's explicit navigation menu into the Navigation editor on the Settings tab. Value: the FULL menu as an array of `{ label, href }` objects, rendered in the order given — it REPLACES the current list, so include every link you are keeping (read `site_navigation`). Both fields are required and non-empty on every entry; no other keys are stored. Hrefs are used verbatim, so use site-relative paths ('/services') for this site's own pages — `site_structure` and `pages_summary` give you every page's real route, and inventing one produces a dead link. An EMPTY array is meaningful and allowed: it clears the explicit menu and lets the site auto-derive its nav from the pages marked show-in-nav. Staging only: the human clicks Save on the Navigation card.",
    valueType: "array",
    updatesValue: "site_navigation",
    mode: "draft",
    applyPolicy: "ask",
    group: "site_presentation",
    sortOrder: 420,
  },
  {
    name: "site_footer_config",
    label: "Footer layout",
    description:
      "Stage the site's footer LAYOUT into the Footer editor on the Settings tab. Value: an object with any of `columns` (`[{ heading, links: [{label, href}] }]`), `copyright` (string), `legal_links` (`[{label, href}]`), `show_contact` / `show_social` (booleans), `contact_heading` / `social_heading` (strings). Send ONLY the keys you are changing — keys you omit are left exactly as the editor has them, and any other key present on the saved footer_config (such as `order`) is preserved automatically, so do NOT echo back the whole object you read: a key outside the list above is refused rather than silently dropped. `columns` and `legal_links` REPLACE their current lists in full. Layout only — the footer's contact and social CONTENT comes from `site_contact_info` / `site_social_links`, and these flags only toggle whether those blocks appear. Hrefs work like the navigation target: site-relative paths from `site_structure`. Staging only: the human clicks Save on the Footer card.",
    valueType: "object",
    updatesValue: "site_footer_config",
    mode: "draft",
    applyPolicy: "ask",
    group: "site_presentation",
    sortOrder: 430,
  },
  // ── Added 2026-08-12 (second adopter pass) ────────────────────────────
  {
    name: "site_name",
    label: "Site name",
    description:
      "Stage a new display name for this website into the Site Name box on the Settings tab — the name shown across the CMS, in the site switcher, and used as the site's default title. Value is a plain text string, NOT JSON and NOT JSON-encoded: send the name itself (`Northwind Coffee`), never a quoted, braced, or backslash-escaped version of it, and never an object wrapping it. Staging only: it lands in the same General card as the Save Changes button, so the saved `site_name` does not change until the human clicks Save — and that Save writes the live row, since the site has no draft twin. This target shares the General card with the global CSS editor, so those two stage and save together; the theme, navigation, and footer cards each save separately (see the one-card-at-a-time note above).",
    valueType: "string",
    updatesValue: "site_name",
    mode: "draft",
    applyPolicy: "ask",
    group: "site_identity",
    sortOrder: 440,
  },
  {
    name: "add_page",
    label: "Add page",
    description:
      "Create ONE new page on this site, immediately, through the CMS's canonical page-create path — the ONLY target on this surface that writes rather than stages, and the only one offered on the Pages tab instead of Settings. The page is created UNPUBLISHED, out of the nav, and empty of content: a stub the user then opens in the page editor and fills in, so nothing the live site serves changes. Value is an OBJECT (send the object itself, not a JSON string): `{ title: string (required, plain text), slug?: string (lowercase letters, digits and single hyphens only — derived from the title when omitted), meta_description?: string, excerpt?: string }`. One page per call; call it again for a second page, and read `pages_summary` first so you do not duplicate a route that already exists. The new page appears in the Pages list as soon as it lands. REFUSED when the site's `agent_write_policy` is \"blocked\" — unlike the staging targets this one really does write, so the gate applies; read that value before offering to create anything.",
    valueType: "object",
    updatesValue: "pages_summary",
    mode: "entity",
    applyPolicy: "ask",
    group: "site_content",
    sortOrder: 450,
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
You can also WRITE here, through apply_surface_write, and which targets you are offered depends on the tab. On the Settings tab (current_mode "settings") five targets stage the site's global CSS, theme tokens, navigation menu, footer layout, and site name into the editors the user is looking at, and the user is asked before each one lands. Staging is not saving — the human still clicks that section's Save — so that path is available even under a "blocked" or "draft_only" agent_write_policy. On the Pages tab, add_page is the one target that genuinely writes: it creates an unpublished, empty page stub through the CMS's own create path for the user to fill in, and it IS refused under a "blocked" policy — check agent_write_policy before offering it, and read pages_summary first so you do not duplicate an existing route. Read the matching value first: theme tokens, navigation, and footer lists REPLACE what is in the editor, so anything you leave out is gone. The site row has no draft twin, so the human's Save publishes site-wide at once. If you stage more than one target, TELL THE USER to save one card at a time and come back to you: saving any card reloads the site and re-seeds the other cards from the saved row, which discards whatever is still staged there — so offer to re-stage the rest after each save rather than letting their work vanish. The site's domain, slug, active flag, and deletion are never writable — those are identity and human gates.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  // "It just seems like someone forgot that we do AI for a living" — Arman,
  // 2026-08-13. The site workspace's built-in agents. Every role writes only
  // through the staged apply_surface_write targets / guarded CMS tools, so
  // agent_write_policy always holds.
  agentRoles: [
    {
      name: "site_editor",
      label: "Site editor",
      description:
        "Production-grade website editing agent — pages, navigation, footer, contact and social details, shared components. Writes through the guarded CMS tools under the site's agent write policy.",
      kind: "single",
      // Platform agent "Site Editor".
      defaultAgentId: "d188520f-b7ba-421e-bb5f-48a49cd82ce2",
      sortOrder: 100,
    },
    {
      name: "theme_designer",
      label: "Theme designer",
      description:
        "Designs and adjusts the site's theme tokens (colors, fonts, spacing) from brand direction.",
      kind: "single",
      // Platform agent "Color Concepts".
      defaultAgentId: "ab003d53-a6cf-4abc-a12e-22d235d90f65",
      sortOrder: 110,
    },
    {
      name: "content_writer",
      label: "Content writer",
      description:
        "Writes and improves page copy across the site from briefs, keywords, and brand voice.",
      kind: "single",
      // Platform agent "Website Content Writer".
      defaultAgentId: "9061c874-11f0-442b-be82-c5d0250806f1",
      sortOrder: 120,
    },
  ],
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
