/**
 * Surface manifest — CMS page editor (`matrx-user/cms-page`).
 *
 * Drives `/cms/[siteId]/pages/[pageId]` and `/cms/[siteId]/pages/new` — the
 * PRIMARY authoring surface in the CMS (HTML/CSS/JS tabs, SEO, settings,
 * preview, version history). The heaviest manifest of the five: carries the
 * shared `site_structure` framing plus everything specific to one page.
 *
 * `content` (baseline) is overridden to mean "the active editable tab's
 * body" — NOT the concatenation of all three. `html_content` / `css_content`
 * / `js_content` are separate bindable values for agents that need all
 * three regardless of which tab is open (e.g. "add a CSS class and use it in
 * the HTML"). All three are `alwaysAvailable: false` — a page legitimately
 * has empty CSS/JS (the common case) or even empty HTML (brand-new page),
 * so "emitted but empty" must not be a wiring violation.
 *
 * Every editable value is read from the EDITOR BUFFER, not the stored row:
 * what the agent sees is what the user is currently looking at, including
 * unsaved edits. The stored row's standing rides separately in `has_draft` /
 * `is_published` / `page_timestamps`.
 *
 * Deliberately NOT `inheritsFrom: "matrx-user/cms-site"`: the parent declares
 * `live_url` / `preview_url` as the SITE's home page while this surface uses
 * the same names for THIS page's URLs. Re-emitting the framing values keeps
 * one unambiguous meaning per name on each surface.
 *
 * Runtime emitter: `features/cms/agent-context/buildCmsPageContextData.ts`
 * via `features/cms/hooks/useCmsPageSurfaceScope.ts`, mounted (provider +
 * write handlers) and called at right-click time from
 * `features/cms/components/PageEditor.tsx`.
 *
 * Write half: see `writeTargets` below.
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

const groups: SurfaceValueGroup[] = [
  {
    key: "site_framing",
    label: "Site framing",
    sortOrder: 100,
    description:
      "The site this page belongs to — the big-picture orientation shared by every CMS website surface.",
  },
  {
    key: "page_identity",
    label: "Page identity",
    sortOrder: 200,
    description:
      "Which page is being edited, where it lives, and where it is published.",
  },
  {
    key: "publish_state",
    label: "Publish state",
    sortOrder: 300,
    description:
      "Draft-vs-live standing of the page row and the history behind it.",
  },
  {
    key: "editor",
    label: "Editor",
    sortOrder: 400,
    description:
      "The live editor buffers (HTML/CSS/JS) and which tab the user is in.",
  },
  {
    key: "page_seo",
    label: "Page SEO",
    sortOrder: 500,
    description:
      "Metadata the SEO tab edits — what search and social previews show.",
  },
  {
    key: "page_settings",
    label: "Page settings",
    sortOrder: 600,
    description:
      "Routing, listing, and navigation options the Settings tab edits.",
  },
  {
    key: "history",
    label: "Version history",
    sortOrder: 700,
    description:
      "The append-only change log for this page and what can be restored from it.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Site framing ──────────────────────────────────────────────────────
  {
    name: "site_structure",
    label: "Site structure (big picture)",
    description:
      'Compact XML snapshot of the whole site this page belongs to: id/slug/name/policy/live+preview URLs, every page\'s routing + status flags, and every shared component. The current page is marked `current="true"`. Always emitted (size-capped at 12KB). Read this first — it lets you navigate to any sibling page or component via the CMS agent tools without asking the user.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    sortOrder: 100,
    group: "site_framing",
  },
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the parent site (`client_sites.id`). Always populated — the editor cannot render without a loaded site.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 110,
    group: "site_framing",
  },
  {
    name: "site_slug",
    label: "Site slug",
    description:
      "URL slug of the parent site, used in live/preview URLs (`/c/{slug}/…`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 120,
    group: "site_framing",
  },
  {
    name: "site_name",
    label: "Site name",
    description:
      "Human display name of the parent site. Always populated — every site row carries a name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 130,
    group: "site_framing",
  },
  {
    name: "site_domain",
    label: "Site domain",
    description:
      "Custom domain mapped to the site (e.g. example.com). Empty when the site is served only from the platform `/c/{slug}` path.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 140,
    group: "site_framing",
  },
  {
    name: "agent_write_policy",
    label: "Agent write policy",
    description:
      '"blocked" (agents cannot write at all), "draft_only" (agents may save drafts but never publish) or "full" (agents may publish directly), read from `client_sites.settings.agent_write_policy`. Always populated — defaults to "blocked" when the site sets none. Check this before attempting any write and degrade politely when blocked.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 150,
    group: "site_framing",
  },
  {
    name: "site_global_css",
    label: "Site global CSS",
    description:
      "The site-wide stylesheet (`client_sites.global_css`) this page renders under, in addition to its own CSS. Empty when the site defines none. Bindable-only: read it when page styling must match the site, otherwise it is large noise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    sortOrder: 160,
    group: "site_framing",
  },
  {
    name: "site_profile",
    label: "Site profile",
    description:
      "The rest of the loaded site row as one object: theme_config, navigation, footer_config, meta_defaults, contact_info, social_links, favicon, is_active. Always emitted (the site is loaded), with empty members where the site sets nothing. Bindable-only — bind it when page content must match site-wide chrome, defaults, or contact details.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 170,
    group: "site_framing",
  },

  // ── Page identity ─────────────────────────────────────────────────────
  {
    name: "page_id",
    label: "Page ID",
    description:
      "UUID of the page being edited. Empty for a brand-new unsaved page (`/pages/new`) — check this before attempting any write against a page id.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "page_identity",
  },
  {
    name: "is_new_page",
    label: "Is a new unsaved page",
    description:
      "True on `/pages/new`, where no row exists yet and the only possible write is a create. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 205,
    group: "page_identity",
  },
  {
    name: "page_title",
    label: "Page title",
    description:
      "Current (in-editor, possibly unsaved) title of the page. Always emitted; empty string on a brand-new page before the user types one.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 210,
    group: "page_identity",
  },
  {
    name: "page_slug",
    label: "Page slug",
    description:
      "Current (in-editor, possibly unsaved) URL slug of the page — auto-derived from the title while creating a new page. Always emitted; empty on a brand-new page before the user types a title.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 220,
    group: "page_identity",
  },
  {
    name: "page_category",
    label: "Page category",
    description:
      'Free-text routing category (e.g. "general", "services") that becomes a path segment in the live URL. Always populated — defaults to "general".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 230,
    group: "page_identity",
  },
  {
    name: "page_type",
    label: "Page type",
    description:
      '"standard" | "home" | "service" | "blog" | "listing" — the template role of the page. Always populated; defaults to "standard".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 240,
    group: "page_identity",
  },
  {
    name: "is_home_page",
    label: "Is home page",
    description:
      "True when this page is the site's home page (served at the site root). Empty for a brand-new unsaved page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 250,
    group: "page_identity",
  },
  {
    name: "live_url",
    label: "Page live URL",
    description:
      "Public URL of THIS page's published content. Empty for a brand-new unsaved page and for a page that has never been published.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 70,
    sortOrder: 260,
    group: "page_identity",
  },
  {
    name: "preview_url",
    label: "Page preview URL",
    description:
      "Draft-content preview URL of THIS page (`?preview=true`) — how a human checks unpublished work. Empty for a brand-new unsaved page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 270,
    group: "page_identity",
  },
  {
    name: "page_layout",
    label: "Page layout",
    description:
      "How the page composes with shared components, as { layout_type, use_client_header, use_client_footer, parent_id }. Empty for a brand-new unsaved page. Read it before assuming a page renders the site header/footer.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 140,
    autoContext: false,
    sortOrder: 280,
    group: "page_identity",
  },

  // ── Publish state ─────────────────────────────────────────────────────
  {
    name: "has_draft",
    label: "Has unpublished draft",
    description:
      "True when the page has draft content (`*_draft` columns) not yet published — meaning the editor buffers differ from what the live site serves. Empty for a brand-new unsaved page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "publish_state",
  },
  {
    name: "is_published",
    label: "Is published",
    description:
      "True when the page has ever been published (live columns are populated). Empty for a brand-new unsaved page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "publish_state",
  },
  {
    name: "page_timestamps",
    label: "Page timestamps",
    description:
      "Lifecycle dates of the stored row as { created_at, updated_at, publish_date, published_date, last_published_at, author }. Empty for a brand-new unsaved page; individual members are null when never set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    autoContext: false,
    sortOrder: 320,
    group: "publish_state",
  },
  {
    name: "page_provenance",
    label: "Page provenance",
    description:
      "Set only on pages promoted from a standalone `html_pages` quick-publish row: { source_html_page_id, source_artifact_id, source_message_id, source_conv_id }. Members are null on a natively-authored page; empty for a brand-new unsaved page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    autoContext: false,
    sortOrder: 330,
    group: "publish_state",
  },

  // ── Editor / active tab ───────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Active editor tab",
    description:
      '"html" | "css" | "js" | "preview" | "seo" | "settings" | "versions" — which region the user is in. Gates what `content`/`selection` read from. Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 400,
    group: "editor",
  },
  {
    name: "html_content",
    label: "HTML body (draft-or-live)",
    description:
      "Full HTML body of the page, read live from the editor buffer (draft content when a draft exists, else the published content, plus any unsaved edits). This is a body fragment, not a whole document — the site chrome wraps it. Empty for a brand-new unsaved page or a genuinely blank body.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 410,
    group: "editor",
  },
  {
    name: "css_content",
    label: "CSS body (draft-or-live)",
    description:
      "Full page-specific CSS, read live from the editor buffer (draft content when a draft exists, else the published content). Empty when the page has no page-specific CSS (the common case) — the site's `site_global_css` still applies.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 420,
    group: "editor",
  },
  {
    name: "js_content",
    label: "JS body (draft-or-live)",
    description:
      "Full page-specific JavaScript, read live from the editor buffer (draft content when a draft exists, else the published content). Empty when the page has no page-specific JS (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 430,
    group: "editor",
  },
  {
    name: "content",
    label: "Active tab content",
    description:
      "The body of whichever editable tab is currently active: the HTML/CSS/JS buffer on those tabs, the meta description on the SEO tab (the one Pro-wired field there). Empty when a non-editable tab (preview/settings/versions) is active. Prefer `html_content`/`css_content`/`js_content` when you need a specific one regardless of which tab is open.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 440,
    group: "editor",
  },
  {
    name: "editor_error",
    label: "Editor error",
    description:
      "The save/load error message currently shown in the editor, if any. Empty in the normal case — a value here means the user's last action failed and they may be asking you about it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 450,
    group: "editor",
  },

  // ── SEO ───────────────────────────────────────────────────────────────
  {
    name: "meta_title",
    label: "SEO meta title",
    description:
      "Draft-or-live SEO title, read live from the editor buffer. Empty when unset — the rendered page then falls back to `page_title`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 500,
    group: "page_seo",
  },
  {
    name: "meta_description",
    label: "SEO meta description",
    description:
      "Draft-or-live SEO description shown in search results, read live from the editor buffer. This is the field bound to `content`/`selection` while the SEO tab is active. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 510,
    group: "page_seo",
  },
  {
    name: "meta_keywords",
    label: "SEO keywords",
    description:
      "Comma-separated SEO keywords, read live from the editor buffer. Empty when unset (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 520,
    group: "page_seo",
  },
  {
    name: "og_image",
    label: "Open Graph image URL",
    description:
      "Social-share preview image URL for this page, read live from the editor buffer. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 530,
    group: "page_seo",
  },
  {
    name: "canonical_url",
    label: "Canonical URL",
    description:
      "Canonical URL override for duplicate-content SEO, read live from the editor buffer. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 540,
    group: "page_seo",
  },
  {
    name: "page_seo",
    label: "Page SEO",
    description:
      "The composite SEO object: { meta_title, meta_description, meta_keywords, og_image, canonical_url }. Mirrors the individual SEO values as one group value (completeness law), read from the same live buffers. Always emitted; members are empty strings when unset.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 550,
    group: "page_seo",
  },

  // ── Page settings ─────────────────────────────────────────────────────
  {
    name: "excerpt",
    label: "Excerpt",
    description:
      "Short summary used by listing pages, read live from the editor buffer. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 600,
    group: "page_settings",
  },
  {
    name: "tags",
    label: "Tags",
    description:
      "The page's tags as an array of strings, read live from the Settings tab's comma-separated field. Empty array when the page has no tags.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 610,
    group: "page_settings",
  },
  {
    name: "show_in_nav",
    label: "Show in navigation",
    description:
      "True when the page appears in the site's generated navigation. Always populated; false is the default for a new page.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 620,
    group: "page_settings",
  },
  {
    name: "sort_order",
    label: "Sort order",
    description:
      "Numeric ordering of this page within navigation and listings. Always populated; 0 by default.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 630,
    group: "page_settings",
  },
  {
    name: "featured_image",
    label: "Featured image",
    description:
      "URL of the page's featured image as stored on the row (used by listing templates). Empty when unset or on a brand-new unsaved page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    autoContext: false,
    sortOrder: 640,
    group: "page_settings",
  },
  {
    name: "page_settings",
    label: "Page settings",
    description:
      "The composite settings object the Settings tab edits: { slug, category, page_type, excerpt, tags, show_in_nav, sort_order }. Mirrors the individual values as one group value (completeness law), read from the same live buffers. Always emitted.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 350,
    autoContext: false,
    sortOrder: 650,
    group: "page_settings",
  },

  // ── History ───────────────────────────────────────────────────────────
  {
    name: "version_history",
    label: "Version history",
    description:
      "The page's append-only change log as loaded by the History tab, newest first: per entry version_number, operation (INSERT/UPDATE/DELETE), occurred_at, and is_current. Empty array for a brand-new unsaved page or before the history has loaded. Bindable-only — bind it when the user asks what changed or what can be restored.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 700,
    group: "history",
  },
  {
    name: "version_count",
    label: "Version count",
    description:
      "How many recorded versions this page has. Zero for a brand-new unsaved page or before the history has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 710,
    group: "history",
  },
  {
    name: "latest_restorable_version",
    label: "Latest restorable version",
    description:
      "The highest version number that is NOT the page's current content — what the menu's one-click restore targets. Empty when the page has only ever had its current content, or before the history has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 720,
    group: "history",
  },
];

/**
 * What agents may WRITE into the page editor (the write half of the 360 loop).
 *
 * All five are `mode: "draft"` in the strict sense the seam means: the value
 * lands in PageEditor's own editor state — the same `useState` the user's
 * typing drives — and nothing reaches the database until the human clicks a
 * save button. Every one is `ask`: this is a real client website, and an
 * agent proposing copy is welcome where an agent silently rewriting it is not.
 *
 * TWO save paths, and the descriptions say which one carries each target,
 * because the schema is only half draft-twinned:
 *  - `html_content` + the three meta fields have `*_draft` columns, so the
 *    editor's **Save Draft** persists them as draft content and the live site
 *    is untouched until a human publishes.
 *  - `title`, `excerpt` and `tags` have NO draft twin (see the `save-draft`
 *    action in `app/api/cms/pages/route.ts`), so they ride the editor's
 *    **Save & Publish** action instead. Staging them is still reversible —
 *    nothing is written until the human saves — but they do not survive a
 *    Publish-only click on a page that already has a draft. That asymmetry is
 *    the human editor's, not the agent path's: a person typing in the same
 *    fields hits it identically.
 *
 * Deliberately NOT declared: publish / save-draft / discard / rollback, the
 * slug/category/parent routing fields, and `page_type`. Publishing is the
 * human's gate by design (`agent_write_policy` governs the server side of the
 * same rule), and the routing fields MOVE the page's live URL — neither earns
 * an agent write here.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "page_title",
    label: "Page title",
    description:
      "Stage the page's title into the editor header. Value: a non-empty string that REPLACES the current title. On a brand-new unsaved page this also re-derives the URL slug from the title, exactly as typing the title does. Title has no draft twin, so it is written by Create Page (new page) or Save & Publish (existing page) — not by Save Draft.",
    valueType: "string",
    updatesValue: "page_title",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_identity",
    sortOrder: 210,
  },
  {
    name: "page_html_content",
    label: "Page HTML body",
    description:
      "Stage the page's HTML body into the HTML tab. Value: { html: string, mode?: 'replace' | 'append' } — 'replace' (the default) swaps the whole body, 'append' adds to the end of the current buffer. This is a BODY FRAGMENT: the site chrome, shared header/footer and site CSS wrap it, so never emit doctype/html/head tags. Save Draft persists it to the page's draft content; publishing it stays a human click.",
    valueType: "object",
    updatesValue: "html_content",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor",
    sortOrder: 410,
  },
  {
    name: "page_meta_tags",
    label: "Page SEO metadata",
    description:
      "Stage the page's SEO metadata into the SEO tab. Value: { meta_title?: string, meta_description?: string, meta_keywords?: string } — omitted fields keep their current value, and meta_keywords is ONE comma-separated string, not an array. All three have draft twins, so Save Draft persists them as draft content; publishing stays a human click.",
    valueType: "object",
    updatesValue: "page_seo",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_seo",
    sortOrder: 560,
  },
  {
    name: "page_excerpt",
    label: "Page excerpt",
    description:
      "Stage the page's excerpt — the short summary listing pages show — into the Settings tab. Value: a string that REPLACES the current excerpt (empty string clears it). Excerpt has no draft twin, so it is written by Save & Publish, not by Save Draft.",
    valueType: "string",
    updatesValue: "excerpt",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_settings",
    sortOrder: 660,
  },
  {
    name: "page_tags",
    label: "Page tags",
    description:
      "Stage the page's FULL tag set into the Settings tab. Value: an array of non-empty strings; it REPLACES rather than appends, so include the existing tags you want kept from the `tags` value ([] clears them). Tags have no draft twin, so they are written by Save & Publish, not by Save Draft.",
    valueType: "array",
    updatesValue: "tags",
    mode: "draft",
    applyPolicy: "ask",
    group: "page_settings",
    sortOrder: 670,
  },
];

export const cmsPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-page",
  readiness: "verified",
  label: "CMS Page",
  urlPattern: "/cms/[siteId]/pages/[pageId]",
  intro: `<surface_intro>
You are in the CMS page editor — the primary authoring surface for one page of a multi-page client website. Start from site_structure: it is the entire site in compact XML (every page's routing and status, every shared component) with this page marked current="true", so you can orient and navigate without asking the user.
agent_write_policy governs everything you may do: "blocked" means propose only, "draft_only" means you may save a draft but a human must publish, "full" means you may publish directly. Never publish under draft_only.
This system has draft/live twins. The editor buffers you receive (html_content, css_content, js_content, and every SEO/settings value) already resolve to the draft when one exists and include the user's unsaved edits — has_draft and is_published tell you how that relates to what the live site serves, and preview_url is how a human checks unpublished work.
html_content is a BODY FRAGMENT, not a whole document: the site's chrome, shared header/footer (see page_layout) and site_global_css wrap it. Do not emit doctype/head/html tags into it. Page CSS/JS are page-specific additions on top of the site-wide stylesheet.
You can also WRITE here, through apply_surface_write: the targets stage values into the editor the user is looking at (title, HTML body, SEO metadata, excerpt, tags) and the user is asked before each one lands. Staging is not saving and never publishing — the human still clicks Save Draft or Save & Publish, so this path is available even under a "blocked" or "draft_only" agent_write_policy. Read the matching value first when you are replacing a set rather than adding to one.
active_tab says where the user is and therefore what content and selection contain — the matching HTML/CSS/JS buffer on those tabs, the meta description on the SEO tab, nothing on preview/settings/versions. A brand-new page (is_new_page true) has no page_id and no history; the only write available there is a create.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "page_editor",
      label: "Page editor",
      description:
        "Default agent offered for general HTML/CSS/JS edits on a page.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "seo_editor",
      label: "SEO editor",
      description:
        "Default agent offered for meta title/description/keywords work on the SEO tab.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "publish_reviewer",
      label: "Publish reviewer",
      description:
        "Default agent offered to review a draft before a human publishes it.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/** One entry of the `version_history` surface value. */
export interface CmsPageVersionEntry {
  version_number: number;
  operation: string;
  occurred_at: string;
  is_current: boolean;
}

export function createCmsPageScope(values: {
  // alwaysAvailable: true → required
  site_structure: string;
  site_id: string;
  site_slug: string;
  site_name: string;
  agent_write_policy: AgentWritePolicy;
  site_profile: Record<string, unknown>;
  is_new_page: boolean;
  page_title: string;
  page_slug: string;
  page_category: string;
  page_type: string;
  active_tab: string;
  page_seo: Record<string, unknown>;
  page_settings: Record<string, unknown>;
  tags: string[];
  show_in_nav: boolean;
  sort_order: number;
  // alwaysAvailable: false → optional
  site_domain?: string;
  site_global_css?: string;
  html_content?: string;
  css_content?: string;
  js_content?: string;
  live_url?: string;
  preview_url?: string;
  page_id?: string;
  page_layout?: Record<string, unknown>;
  is_home_page?: boolean;
  has_draft?: boolean;
  is_published?: boolean;
  page_timestamps?: Record<string, unknown>;
  page_provenance?: Record<string, unknown>;
  content?: string;
  editor_error?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  og_image?: string;
  canonical_url?: string;
  excerpt?: string;
  featured_image?: string;
  version_history?: CmsPageVersionEntry[];
  version_count?: number;
  latest_restorable_version?: number;
  selection?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
