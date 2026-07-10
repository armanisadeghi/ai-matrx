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
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { AgentWritePolicy } from "@/features/cms/types";

const surfaceSpecific: SurfaceValue[] = [
  // ── Shared site framing (mirrors cms-site) ────────────────────────────
  {
    name: "site_structure",
    label: "Site structure (big picture)",
    description:
      'Compact XML snapshot of the whole site this page belongs to: id/slug/name/policy/live+preview URLs, every page\'s routing + status flags, and every shared component. The current page is marked `current="true"`. Read this first — it lets you navigate to any sibling page or component via the CMS agent tools without asking the user.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    sortOrder: 200,
  },
  {
    name: "site_id",
    label: "Site ID",
    description: "UUID of the parent site. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 205,
  },
  {
    name: "site_slug",
    label: "Site slug",
    description: "URL slug of the parent site. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 206,
  },
  {
    name: "agent_write_policy",
    label: "Agent write policy",
    description:
      '"blocked" / "draft_only" / "full" — check before attempting any write. Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 208,
  },
  {
    name: "live_url",
    label: "Page live URL",
    description:
      "Public URL of THIS page's published content. Empty for a brand-new unsaved page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 70,
    sortOrder: 209,
  },
  {
    name: "preview_url",
    label: "Page preview URL",
    description:
      "Draft-content preview URL of THIS page (`?preview=true`). Empty for a brand-new unsaved page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 210,
  },

  // ── Page identity & status (250-299) ──────────────────────────────────
  {
    name: "page_id",
    label: "Page ID",
    description:
      "UUID of the page being edited. Empty for a brand-new unsaved page (see `/pages/new`).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 250,
  },
  {
    name: "page_title",
    label: "Page title",
    description: "Current (in-editor, possibly unsaved) title of the page.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 252,
  },
  {
    name: "page_slug",
    label: "Page slug",
    description: "Current (in-editor, possibly unsaved) URL slug of the page.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 254,
  },
  {
    name: "page_category",
    label: "Page category",
    description:
      'Free-text routing category (e.g. "general", "services"). Defaults to "general".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 256,
  },
  {
    name: "page_type",
    label: "Page type",
    description:
      '"standard" | "home" | "service" | "blog" | "listing". Defaults to "standard".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 258,
  },
  {
    name: "is_home_page",
    label: "Is home page",
    description: "True when this page is the site's home page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 260,
  },
  {
    name: "has_draft",
    label: "Has unpublished draft",
    description:
      "True when the page has draft content (`*_draft` columns) not yet published. False for a brand-new unsaved page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 262,
  },
  {
    name: "is_published",
    label: "Is published",
    description:
      "True when the page has ever been published (live columns are populated). False for a brand-new unsaved page.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 264,
  },

  // ── Editor / active tab (400-449) ─────────────────────────────────────
  {
    name: "active_tab",
    label: "Active editor tab",
    description:
      '"html" | "css" | "js" | "preview" | "seo" | "settings" | "versions". Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 400,
  },
  {
    name: "html_content",
    label: "HTML body (draft-or-live)",
    description:
      "Full HTML body of the page — draft content if a draft exists, else the published content. Can be large. Empty for a brand-new unsaved page or a genuinely blank body.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 410,
  },
  {
    name: "css_content",
    label: "CSS body (draft-or-live)",
    description:
      "Full page-specific CSS — draft content if a draft exists, else the published content. Empty when the page has no page-specific CSS (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 412,
  },
  {
    name: "js_content",
    label: "JS body (draft-or-live)",
    description:
      "Full page-specific JavaScript — draft content if a draft exists, else the published content. Empty when the page has no page-specific JS (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 414,
  },
  {
    name: "content",
    label: "Active tab content",
    description:
      "The body of whichever of HTML/CSS/JS tab is currently active (mirrors `active_tab`). Empty when a non-code tab (preview/SEO/settings/versions) is active. Prefer `html_content`/`css_content`/`js_content` when you need a specific one regardless of which tab is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 416,
  },

  // ── SEO (450-479) ──────────────────────────────────────────────────────
  {
    name: "meta_title",
    label: "SEO meta title",
    description:
      "Draft-or-live SEO title. Falls back to `page_title` when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 450,
  },
  {
    name: "meta_description",
    label: "SEO meta description",
    description: "Draft-or-live SEO description shown in search results.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 452,
  },
];

export const cmsPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-page",
  urlPattern: "/cms/[siteId]/pages/[pageId]",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "context"),
    surfaceSpecific,
  ),
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

export function createCmsPageScope(values: {
  // alwaysAvailable: true → required
  site_structure: string;
  site_id: string;
  site_slug: string;
  agent_write_policy: AgentWritePolicy;
  page_title: string;
  page_slug: string;
  page_category: string;
  page_type: string;
  active_tab: string;
  // alwaysAvailable: false → optional
  html_content?: string;
  css_content?: string;
  js_content?: string;
  live_url?: string;
  preview_url?: string;
  page_id?: string;
  is_home_page?: boolean;
  has_draft?: boolean;
  is_published?: boolean;
  content?: string;
  meta_title?: string;
  meta_description?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
