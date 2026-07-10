-- cms_surfaces_seed.sql
-- Seeds the five CMS Surface Values rows (ui.ui_surface + ui.ui_surface_value +
-- ui.ui_surface_agent_role) and the `cms-authoring` platform skill
-- (skill.definition).
--
-- This is a faithful hand-mirror of what `applyManifestSync(...,
-- { createMissingSurfaces: true })` (features/surfaces/services/manifest-sync.service.ts)
-- would upsert for the five new manifests registered in
-- features/surfaces/manifests/registry.ts:
--   matrx-user/cms, matrx-user/cms-site, matrx-user/cms-page,
--   matrx-user/cms-component, matrx-user/html-page
-- The `ui_surface_value` rows below were generated verbatim via
-- `npx tsx scripts/emit-surface-sync-sql.ts` (filtered to the 5 CMS
-- surfaces) so they can never drift from the manifests' actual runtime
-- shape. If a manifest changes, re-run that script and re-sync rather than
-- hand-editing rows here.
--
-- Idempotent: ui_surface uses ON CONFLICT DO NOTHING (admin owns edits to
-- description/sort_order after creation); ui_surface_value/ui_surface_agent_role
-- use ON CONFLICT DO UPDATE (code is the source of truth per README.md);
-- skill.definition uses a NOT EXISTS guard (composite key isn't a DB
-- constraint — same pattern as migrations/rb_research_skill.sql).

BEGIN;

-- ============================================================================
-- 1. SURFACES → ui.ui_surface
-- ============================================================================

INSERT INTO ui.ui_surface (
  name, client_name, description, sort_order, is_active,
  url_pattern, execution_mode, executor_name, parent_surface_name
) VALUES
  ('matrx-user/cms', 'matrx-user', 'CMS hub — list of owned websites + entry to standalone published pages', 2120, true, '/cms', 'python-stream', 'matrx-user', 'matrx-default/default'),
  ('matrx-user/cms-site', 'matrx-user', 'CMS site workspace — page list, site settings, components hub', 2121, true, '/cms/[siteId]', 'python-stream', 'matrx-user', 'matrx-default/default'),
  ('matrx-user/cms-page', 'matrx-user', 'CMS page editor — HTML/CSS/JS/SEO/preview/version-history for one page', 2122, true, '/cms/[siteId]/pages/[pageId]', 'python-stream', 'matrx-user', 'matrx-default/default'),
  ('matrx-user/cms-component', 'matrx-user', 'CMS shared component editor — header/footer/sidebar/CTA HTML+CSS', 2123, true, '/cms/[siteId]/components', 'python-stream', 'matrx-user', 'matrx-default/default'),
  ('matrx-user/html-page', 'matrx-user', 'Standalone published HTML page editor (html_pages table, distinct from client sites)', 2124, true, '/cms/html-pages/[pageId]', 'python-stream', 'matrx-user', 'matrx-default/default')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. VALUES → ui.ui_surface_value
--    Generated via `npx tsx scripts/emit-surface-sync-sql.ts` — see header note.
-- ============================================================================

INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order) VALUES
('matrx-user/cms', 'selection', 'Current selection', 'The user''s currently selected text on the surface. Empty string when nothing is selected.', 'string', false, 200, 100),
('matrx-user/cms', 'text_before', 'Text before selection', 'Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.', 'string', false, 500, 110),
('matrx-user/cms', 'text_after', 'Text after selection', 'Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.', 'string', false, 500, 120),
('matrx-user/cms', 'content', 'Primary content', 'The surface''s primary editable content (full document, full note, full file body). Use with care — can be large.', 'string', false, 5000, 200),
('matrx-user/cms', 'owned_sites_count', 'Owned sites count', 'Number of client websites (client_sites rows) the current user owns. Always populated — zero when the user hasn''t created a site yet.', 'number', true, 4, 200),
('matrx-user/cms', 'owned_sites_summary', 'Owned sites summary', 'Array of `{ id, slug, name, is_active }` for every site the user owns, in list order. Always populated — empty array when no sites exist. Lets an agent find or reference a site by name/slug without a separate list call.', 'array', true, 600, 210),
('matrx-user/cms', 'selected_site_id', 'Selected site ID', 'UUID of the site card the user last interacted with (hover/right-click target) on the hub. Empty when no site is focused.', 'string', false, 36, 220),
('matrx-user/cms', 'context', 'Free-form context', 'Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.', 'object', false, 1000, 9999),
('matrx-user/cms-site', 'selection', 'Current selection', 'The user''s currently selected text on the surface. Empty string when nothing is selected.', 'string', false, 200, 100),
('matrx-user/cms-site', 'text_before', 'Text before selection', 'Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.', 'string', false, 500, 110),
('matrx-user/cms-site', 'text_after', 'Text after selection', 'Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.', 'string', false, 500, 120),
('matrx-user/cms-site', 'content', 'Primary content', 'The surface''s primary editable content (full document, full note, full file body). Use with care — can be large.', 'string', false, 5000, 200),
('matrx-user/cms-site', 'site_structure', 'Site structure (big picture)', 'Compact XML snapshot of the whole site: id/slug/name/policy/live+preview URLs, every page''s routing + status flags (published/has_draft/home/nav), and every shared component''s type/name/has_draft. No HTML/CSS/JS bodies. The single most important context item on any CMS website surface — read this first to orient, then use the CMS agent tools to navigate to a specific page or component.', 'string', true, 6000, 200),
('matrx-user/cms-site', 'site_id', 'Site ID', 'UUID of the site (client_sites.id) this workspace is scoped to. Always populated.', 'string', true, 36, 205),
('matrx-user/cms-site', 'site_slug', 'Site slug', 'URL slug of the site, used in live/preview URLs (`/c/{slug}/…`). Always populated.', 'string', true, 24, 206),
('matrx-user/cms-site', 'site_name', 'Site name', 'Human display name of the site. Always populated.', 'string', true, 40, 207),
('matrx-user/cms-site', 'agent_write_policy', 'Agent write policy', '"blocked" (agents cannot write at all), "draft_only" (agents may save drafts but never publish — a human must publish), or "full" (agents may publish directly). Always populated. An agent MUST check this before attempting any write and refuse/degrade politely when "blocked".', 'string', true, 12, 208),
('matrx-user/cms-site', 'live_url', 'Site live URL', 'Public root URL of the site''s home page. Always populated.', 'string', true, 60, 209),
('matrx-user/cms-site', 'preview_url', 'Site preview URL', 'Draft-content preview URL of the site''s home page (`?preview=true`). Always populated.', 'string', true, 70, 210),
('matrx-user/cms-site', 'selected_page_id', 'Selected page ID', 'UUID of the page row the user last interacted with in the page list. Empty when nothing is selected.', 'string', false, 36, 300),
('matrx-user/cms-site', 'pages_count', 'Pages count', 'Total number of pages on this site. Always populated.', 'number', true, 4, 310),
('matrx-user/cms-site', 'context', 'Free-form context', 'Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.', 'object', false, 1000, 9999),
('matrx-user/cms-page', 'selection', 'Current selection', 'The user''s currently selected text on the surface. Empty string when nothing is selected.', 'string', false, 200, 100),
('matrx-user/cms-page', 'text_before', 'Text before selection', 'Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.', 'string', false, 500, 110),
('matrx-user/cms-page', 'text_after', 'Text after selection', 'Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.', 'string', false, 500, 120),
('matrx-user/cms-page', 'site_structure', 'Site structure (big picture)', 'Compact XML snapshot of the whole site this page belongs to: id/slug/name/policy/live+preview URLs, every page''s routing + status flags, and every shared component. The current page is marked `current="true"`. Read this first — it lets you navigate to any sibling page or component via the CMS agent tools without asking the user.', 'string', true, 6000, 200),
('matrx-user/cms-page', 'site_id', 'Site ID', 'UUID of the parent site. Always populated.', 'string', true, 36, 205),
('matrx-user/cms-page', 'site_slug', 'Site slug', 'URL slug of the parent site. Always populated.', 'string', true, 24, 206),
('matrx-user/cms-page', 'agent_write_policy', 'Agent write policy', '"blocked" / "draft_only" / "full" — check before attempting any write. Always populated.', 'string', true, 12, 208),
('matrx-user/cms-page', 'live_url', 'Page live URL', 'Public URL of THIS page''s published content. Empty for a brand-new unsaved page.', 'string', false, 70, 209),
('matrx-user/cms-page', 'preview_url', 'Page preview URL', 'Draft-content preview URL of THIS page (`?preview=true`). Empty for a brand-new unsaved page.', 'string', false, 80, 210),
('matrx-user/cms-page', 'page_id', 'Page ID', 'UUID of the page being edited. Empty for a brand-new unsaved page (see `/pages/new`).', 'string', false, 36, 250),
('matrx-user/cms-page', 'page_title', 'Page title', 'Current (in-editor, possibly unsaved) title of the page.', 'string', true, 60, 252),
('matrx-user/cms-page', 'page_slug', 'Page slug', 'Current (in-editor, possibly unsaved) URL slug of the page.', 'string', true, 40, 254),
('matrx-user/cms-page', 'page_category', 'Page category', 'Free-text routing category (e.g. "general", "services"). Defaults to "general".', 'string', true, 20, 256),
('matrx-user/cms-page', 'page_type', 'Page type', '"standard" | "home" | "service" | "blog" | "listing". Defaults to "standard".', 'string', true, 12, 258),
('matrx-user/cms-page', 'is_home_page', 'Is home page', 'True when this page is the site''s home page.', 'boolean', false, 5, 260),
('matrx-user/cms-page', 'has_draft', 'Has unpublished draft', 'True when the page has draft content (`*_draft` columns) not yet published. False for a brand-new unsaved page.', 'boolean', false, 5, 262),
('matrx-user/cms-page', 'is_published', 'Is published', 'True when the page has ever been published (live columns are populated). False for a brand-new unsaved page.', 'boolean', false, 5, 264),
('matrx-user/cms-page', 'active_tab', 'Active editor tab', '"html" | "css" | "js" | "preview" | "seo" | "settings" | "versions". Always populated.', 'string', true, 10, 400),
('matrx-user/cms-page', 'html_content', 'HTML body (draft-or-live)', 'Full HTML body of the page — draft content if a draft exists, else the published content. Can be large. Empty for a brand-new unsaved page or a genuinely blank body.', 'string', false, 4000, 410),
('matrx-user/cms-page', 'css_content', 'CSS body (draft-or-live)', 'Full page-specific CSS — draft content if a draft exists, else the published content. Empty when the page has no page-specific CSS (the common case).', 'string', false, 1500, 412),
('matrx-user/cms-page', 'js_content', 'JS body (draft-or-live)', 'Full page-specific JavaScript — draft content if a draft exists, else the published content. Empty when the page has no page-specific JS (the common case).', 'string', false, 800, 414),
('matrx-user/cms-page', 'content', 'Active tab content', 'The body of whichever of HTML/CSS/JS tab is currently active (mirrors `active_tab`). Empty when a non-code tab (preview/SEO/settings/versions) is active. Prefer `html_content`/`css_content`/`js_content` when you need a specific one regardless of which tab is open.', 'string', false, 4000, 416),
('matrx-user/cms-page', 'meta_title', 'SEO meta title', 'Draft-or-live SEO title. Falls back to `page_title` when unset.', 'string', false, 60, 450),
('matrx-user/cms-page', 'meta_description', 'SEO meta description', 'Draft-or-live SEO description shown in search results.', 'string', false, 160, 452),
('matrx-user/cms-page', 'context', 'Free-form context', 'Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.', 'object', false, 1000, 9999),
('matrx-user/cms-component', 'selection', 'Current selection', 'The user''s currently selected text on the surface. Empty string when nothing is selected.', 'string', false, 200, 100),
('matrx-user/cms-component', 'text_before', 'Text before selection', 'Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.', 'string', false, 500, 110),
('matrx-user/cms-component', 'text_after', 'Text after selection', 'Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.', 'string', false, 500, 120),
('matrx-user/cms-component', 'content', 'Primary content', 'The surface''s primary editable content (full document, full note, full file body). Use with care — can be large.', 'string', false, 5000, 200),
('matrx-user/cms-component', 'site_structure', 'Site structure (big picture)', 'Compact XML snapshot of the whole site this component belongs to — same shape as on `cms-site`/`cms-page`. The component being edited is marked `current="true"` in the `<components>` block.', 'string', true, 6000, 200),
('matrx-user/cms-component', 'site_id', 'Site ID', 'UUID of the parent site. Always populated.', 'string', true, 36, 205),
('matrx-user/cms-component', 'site_slug', 'Site slug', 'URL slug of the parent site. Always populated.', 'string', true, 24, 206),
('matrx-user/cms-component', 'agent_write_policy', 'Agent write policy', '"blocked" / "draft_only" / "full" — check before attempting any write. Always populated.', 'string', true, 12, 208),
('matrx-user/cms-component', 'component_id', 'Component ID', 'UUID of the component being edited. Empty when none is open (list view / just created dialog).', 'string', false, 36, 300),
('matrx-user/cms-component', 'component_type', 'Component type', '"header" | "footer" | "sidebar" | "cta" | "custom".', 'string', false, 12, 305),
('matrx-user/cms-component', 'component_name', 'Component name', 'Human display name of the component.', 'string', false, 40, 310),
('matrx-user/cms-component', 'has_draft', 'Has unpublished draft', 'True when the component has draft HTML/CSS not yet published.', 'boolean', false, 5, 315),
('matrx-user/cms-component', 'html_content', 'Component HTML (draft-or-live)', 'Full HTML body of the component — draft content if a draft exists, else the published content.', 'string', false, 1500, 400),
('matrx-user/cms-component', 'css_content', 'Component CSS (draft-or-live)', 'Full CSS body of the component — draft content if a draft exists, else the published content.', 'string', false, 800, 405),
('matrx-user/cms-component', 'context', 'Free-form context', 'Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.', 'object', false, 1000, 9999),
('matrx-user/html-page', 'selection', 'Current selection', 'The user''s currently selected text on the surface. Empty string when nothing is selected.', 'string', false, 200, 100),
('matrx-user/html-page', 'text_before', 'Text before selection', 'Text immediately preceding the selection within the same editable region. Empty when there is no selection or no preceding text.', 'string', false, 500, 110),
('matrx-user/html-page', 'text_after', 'Text after selection', 'Text immediately following the selection within the same editable region. Empty when there is no selection or no trailing text.', 'string', false, 500, 120),
('matrx-user/html-page', 'content', 'Primary content', 'The surface''s primary editable content (full document, full note, full file body). Use with care — can be large.', 'string', false, 5000, 200),
('matrx-user/html-page', 'html_pages_structure', 'Standalone pages structure (big picture)', 'Compact XML list of every standalone HTML page the user has published (`html_pages` rows): id, title, indexability, and live URL. The page open in the editor is marked `current="true"`. Read this first to see sibling pages before creating a duplicate or asking the user which page they mean.', 'string', true, 3000, 200),
('matrx-user/html-page', 'page_id', 'Page ID', 'UUID of the html_pages row being edited. Always populated on the editor route.', 'string', true, 36, 250),
('matrx-user/html-page', 'live_url', 'Page live URL', 'Public URL of this page (`/p/{id}`). Always populated.', 'string', true, 60, 255),
('matrx-user/html-page', 'meta_title', 'Meta title', 'SEO title / HTML `<title>`. Required by the save flow — never actually empty once saved.', 'string', true, 60, 260),
('matrx-user/html-page', 'meta_description', 'Meta description', 'SEO description shown in search results. Empty when unset.', 'string', false, 160, 262),
('matrx-user/html-page', 'meta_keywords', 'Meta keywords', 'Comma-separated SEO keywords. Empty when unset.', 'string', false, 60, 264),
('matrx-user/html-page', 'og_image', 'Open Graph image URL', 'Social-share preview image URL. Empty when unset.', 'string', false, 80, 266),
('matrx-user/html-page', 'canonical_url', 'Canonical URL', 'Canonical URL override for duplicate-content SEO. Empty when unset.', 'string', false, 80, 268),
('matrx-user/html-page', 'is_indexable', 'Allow search indexing', 'True when search engines may index this page. Defaults to false (noindex) on new pages.', 'boolean', true, 5, 270),
('matrx-user/html-page', 'context', 'Free-form context', 'Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.', 'object', false, 1000, 9999)
ON CONFLICT (surface_name, name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  always_available = EXCLUDED.always_available,
  typical_char_count = EXCLUDED.typical_char_count,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ============================================================================
-- 3. AGENT ROLES → ui.ui_surface_agent_role
-- ============================================================================

INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES
('matrx-user/cms-page', 'page_editor', 'Page editor', 'Default agent offered for general HTML/CSS/JS edits on a page.', 'single', NULL, 1, true, 'user-choice', 100),
('matrx-user/cms-page', 'seo_editor', 'SEO editor', 'Default agent offered for meta title/description/keywords work on the SEO tab.', 'single', NULL, 1, true, 'user-choice', 110),
('matrx-user/cms-page', 'publish_reviewer', 'Publish reviewer', 'Default agent offered to review a draft before a human publishes it.', 'single', NULL, 1, true, 'user-choice', 120),
('matrx-user/html-page', 'html_page_editor', 'HTML page editor', 'Default agent offered for edits to a standalone published HTML page.', 'single', NULL, 1, true, 'user-choice', 100)
ON CONFLICT (surface_name, name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  max_agents = EXCLUDED.max_agents,
  allow_custom = EXCLUDED.allow_custom,
  auto_run = EXCLUDED.auto_run,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ============================================================================
-- 4. SKILL → skill.definition
--    "cms-authoring" — teaches CMS-bound agents the two-content-system model,
--    the site_structure/html_pages_structure framing XML, draft/publish
--    twins, URL rules, and the aidream CMS tool map. Opt-in via
--    skill_config.included on CMS system agents — never auto-attached.
-- ============================================================================

CREATE TEMP TABLE _cms_authoring_skill ON COMMIT DROP AS
SELECT
  'How to work inside the Matrx CMS: the two distinct content systems (multi-page client websites vs. standalone published HTML pages), how to read the site_structure / html_pages_structure framing XML every website surface emits, the draft/publish twin-column model, public URL rules, the agent_write_policy gate, and the aidream tool map for navigating and editing content.'::text AS description,
  $BODY$# CMS Authoring

The Matrx CMS is TWO separate content systems on a separate Supabase project (`viyklljfdhtidwecakwx`, not Matrx Main). Never conflate them:

1. **Client websites** (`client_sites` → `client_pages` / `client_components`) — a full multi-page site with navigation, categories, and a draft/publish workflow. Surfaces: `matrx-user/cms` (hub), `matrx-user/cms-site` (site workspace), `matrx-user/cms-page` (page editor), `matrx-user/cms-component` (shared header/footer/etc.).
2. **Standalone HTML pages** (`html_pages`) — one-off published documents (from chat, code, presentations) with no site tree, no draft twin, no nav. Publishing IS saving. Surface: `matrx-user/html-page`.

## Read the framing value first

Every website surface (hub excepted) emits `site_structure` — a compact XML snapshot of the whole site: id/slug/name/`agent_write_policy`/live+preview URLs, every page's routing + status flags, and every shared component. The node you're currently on is marked `current="true"`. Standalone pages emit the smaller sibling `html_pages_structure` instead.

**Always read the framing value before acting.** It tells you what else exists on this site/among these pages so you can navigate to a sibling page or component via tools instead of asking the user to re-describe things you could already see.

```xml
<cms_site id="…" slug="acme" name="Acme Co" policy="draft_only" live="https://mymatrx.com/c/acme" preview="…?preview=true">
  <pages count="12">
    <page id="…" slug="about" category="general" title="About" published="true" has_draft="false" home="false" nav="true" current="true"/>
  </pages>
  <components count="2">
    <component id="…" type="header" name="Header" has_draft="false" active="true"/>
  </components>
</cms_site>
```

## Draft/publish twins

Client pages and components carry TWIN columns: `html_content` (live) and `html_content_draft` (unpublished), same for `css_content`/`js_content` and every SEO field (`meta_title`, `meta_description`, `meta_keywords`, `og_image`, `canonical_url`). `has_draft` is true whenever draft columns are populated. Editing always writes the DRAFT twin — publishing copies draft → live and clears the draft columns. Every change (create, edit, draft save, publish, rollback) is captured in `history.row_versions`; rolling back to a version creates a NEW version rather than erasing history.

Standalone `html_pages` have no twin — saving IS publishing immediately.

## The write-policy gate

Every client site has `agent_write_policy` (`client_sites.settings.agent_write_policy`): `blocked` (no agent writes at all), `draft_only` (agents may save drafts, only a human may publish), or `full` (agents may publish directly). **Check `agent_write_policy` from the framing context before attempting ANY write.** When `blocked`, explain you can't modify this site and suggest what a human would need to do. When `draft_only`, save the draft and tell the user it's ready for their review/publish — do not attempt to publish. Standalone HTML pages have no policy column; publishing is inherent to saving one.

## URL rules

- Client page canonical URL: `/c/{siteSlug}/{category+'/' if category else ''}{slug}` — `?preview=true` renders the draft twins (publicly reachable, no auth required).
- Client site root: `/c/{siteSlug}` — resolves server-side to the home page's own URL.
- Standalone HTML page: `/p/{uuid}` — never has a preview mode (no draft twin).

## Prefer patch tools over whole-document replace

When editing HTML/CSS/JS, prefer a scoped patch/edit call over regenerating and replacing the entire body — it preserves everything the user didn't ask you to touch and keeps version history readable. Only replace the whole document when the user explicitly asks for a rewrite or the existing content is empty/scaffold.

## Tool map (aidream CMS authoring tools)

| Need | Tool |
|---|---|
| Read/write a client page (any field) | `cms_page` |
| Read/write client site metadata/settings | `cms_site` |
| Read/write a shared component | `cms_component` |
| Locate a page by slug/title/category across a site | `cms_find_page` |
| Inspect current live/preview render of a page | `cms_inspect` |
| Read/write a standalone `html_pages` row | `html_page` |
| Verify a change rendered correctly post-publish | `cms_verify` |

Use `cms_find_page`/`site_structure` to resolve "the pricing page" or "the about page" style references before guessing an id.
$BODY$::text AS body;

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver,
  is_active, is_system, visibility,
  organization_id, sort_order
)
SELECT
  'cms-authoring',
  'CMS Authoring',
  s.description,
  'reference'::public.skl_skill_type,
  s.body,
  'PanelTop',
  '["web"]'::jsonb,
  '1.0.0',
  true, true, 'internal',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  0
FROM _cms_authoring_skill s
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'cms-authoring' AND created_by IS NULL
);

COMMIT;
