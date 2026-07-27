/**
 * Surface manifest — CMS shared component editor (`matrx-user/cms-component`).
 *
 * Drives `/cms/[siteId]/components` — the header/footer/sidebar/CTA editor.
 * Shares the same `site_structure` framing as `cms-site`/`cms-page` (this
 * component's row is marked `current="true"` in the `<components>` block)
 * plus identity + HTML/CSS bodies for the component being edited.
 *
 * The route is a LIST + inline editor on one screen: the components table is
 * always present, and at most one row is expanded into HTML/CSS textareas.
 * Everything scoped to "the component being edited" is therefore
 * `alwaysAvailable: false` — the user is legitimately on the list with nothing
 * open. Everything scoped to the SITE is guaranteed (the route cannot render
 * without a loaded site).
 *
 * Deliberately NOT `inheritsFrom: "matrx-user/cms-site"`: that parent's
 * `live_url` / `preview_url` mean the SITE's home page, and the CMS website
 * surfaces re-emit the framing values directly rather than inheriting a
 * vocabulary whose URL semantics differ per surface.
 *
 * Runtime emitter: `features/cms/agent-context/buildCmsComponentContextData.ts`
 * via `features/cms/hooks/useCmsComponentSurfaceScope.ts`, called at
 * right-click time from `app/(core)/cms/[siteId]/components/page.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { AgentWritePolicy } from "@/features/cms/types";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_framing",
    label: "Site framing",
    sortOrder: 100,
    description:
      "The site this component belongs to — the big-picture orientation shared by every CMS website surface.",
  },
  {
    key: "component_identity",
    label: "Component identity",
    sortOrder: 200,
    description:
      "Which shared component is open in the inline editor, and its lifecycle standing.",
  },
  {
    key: "component_content",
    label: "Component content",
    sortOrder: 300,
    description:
      "The HTML and CSS bodies of the component being edited (draft-or-live).",
  },
  {
    key: "workspace",
    label: "Workspace state",
    sortOrder: 400,
    description:
      "The components list itself and the transient state of the create dialog.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Site framing ──────────────────────────────────────────────────────
  {
    name: "site_structure",
    label: "Site structure (big picture)",
    description:
      'Compact XML snapshot of the whole site this component belongs to — same shape as on `cms-site`/`cms-page`: site identity/policy/URLs, every page\'s routing + status flags, and every shared component. The component being edited is marked `current="true"` in the `<components>` block; nothing is marked current while the list is idle. Always emitted (size-capped at 12KB).',
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
      "UUID of the parent site (`client_sites.id`). Always populated — the route cannot render without a loaded site.",
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
      "The site-wide stylesheet (`client_sites.global_css`) every page and component renders under. Empty when the site defines none. Bindable-only: read it when a component's styling must match the site, otherwise it is large noise.",
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
      "The rest of the loaded site row as one object: theme_config, navigation, footer_config, meta_defaults, contact_info, social_links, favicon, is_active. Always emitted on this route (the site is loaded), with empty members where the site sets nothing. Bindable-only — bind it when a component must match site-wide chrome or contact details.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 170,
    group: "site_framing",
  },

  // ── Component identity ────────────────────────────────────────────────
  {
    name: "component_id",
    label: "Component ID",
    description:
      "UUID of the component open in the inline editor. Empty when the user is on the components list with nothing expanded for edit.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "component_identity",
  },
  {
    name: "component_type",
    label: "Component type",
    description:
      '"header" | "footer" | "sidebar" | "cta" | "custom" — the slot this component fills on rendered pages. Empty when nothing is open for edit.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 210,
    group: "component_identity",
  },
  {
    name: "component_name",
    label: "Component name",
    description:
      "Human display name of the component being edited (e.g. \"Main Header\"). Empty when nothing is open for edit.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 220,
    group: "component_identity",
  },
  {
    name: "has_draft",
    label: "Has unpublished draft",
    description:
      "True when the component being edited has draft HTML/CSS (`*_draft` columns) not yet published. Empty when nothing is open for edit.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 230,
    group: "component_identity",
  },
  {
    name: "is_active",
    label: "Is active",
    description:
      "True when the component being edited is enabled for rendering on the site. Empty when nothing is open for edit.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 240,
    group: "component_identity",
  },
  {
    name: "component_record",
    label: "Component record",
    description:
      "The loaded row for the component being edited as one object: id, component_type, name, is_active, has_draft, last_published_at, created_at, updated_at. Mirrors the individual identity values as one composite. Empty when nothing is open for edit.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 320,
    autoContext: false,
    sortOrder: 250,
    group: "component_identity",
  },

  // ── Component content ─────────────────────────────────────────────────
  {
    name: "html_content",
    label: "Component HTML (draft-or-live)",
    description:
      "Full HTML body of the component being edited, read live from the editor buffer (draft content when a draft exists, else the published content). Empty when nothing is open for edit, or when the body is genuinely blank (a just-created component).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 300,
    group: "component_content",
  },
  {
    name: "css_content",
    label: "Component CSS (draft-or-live)",
    description:
      "Full CSS body of the component being edited, read live from the editor buffer (draft content when a draft exists, else the published content). Empty when nothing is open for edit, or when the component carries no CSS of its own (the common case).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 310,
    group: "component_content",
  },

  // ── Workspace ─────────────────────────────────────────────────────────
  {
    name: "components_list",
    label: "Components list",
    description:
      "Every shared component on this site as loaded by the route: per entry id, component_type, name, is_active, and has_draft (no bodies). Always emitted; an empty array when the site has no components yet.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    sortOrder: 400,
    group: "workspace",
  },
  {
    name: "components_count",
    label: "Components count",
    description:
      "Number of shared components on this site. Always populated; zero when the site has none.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "workspace",
  },
  {
    name: "is_editing",
    label: "Is editing a component",
    description:
      "True when a component row is expanded into the HTML/CSS editors, false when the user is on the plain list. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "workspace",
  },
  {
    name: "pending_component",
    label: "New-component draft",
    description:
      "The unsaved values typed into the \"New Component\" dialog as { name, component_type }. Empty when the dialog is closed — which is the normal state.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    autoContext: false,
    sortOrder: 430,
    group: "workspace",
  },
];

export const cmsComponentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-component",
  readiness: "verified",
  label: "CMS Component",
  urlPattern: "/cms/[siteId]/components",
  intro: `<surface_intro>
You are on the CMS shared-component editor for one client website. Shared components are the reusable chrome — header, footer, sidebar, CTA — that every page of the site renders around its own body. Editing one changes every page at once, so treat these edits as site-wide.
Read site_structure first: it is the whole site in compact XML (pages, routing, every component), with the component currently open marked current="true". agent_write_policy governs what you may do — "blocked" means propose only, "draft_only" means you may save a draft but a human must publish, "full" means you may publish.
The route is a list plus an inline editor: when nothing is expanded for edit, component_id / component_name / html_content / css_content are all empty and only the site framing and components_list are meaningful. Draft-vs-live is a twin-column model: html_content and css_content already resolve to the draft when one exists, and has_draft tells you whether unpublished work is pending.
Component CSS is scoped to the component, but the page renders it under site_global_css — bind that value when styling must match the rest of the site.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "component_editor",
      label: "Component editor",
      description:
        "Default agent offered for HTML/CSS edits to a shared header/footer/sidebar/CTA component.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

/** One entry of the `components_list` surface value. */
export interface CmsComponentListEntry {
  id: string;
  component_type: string;
  name: string;
  is_active: boolean;
  has_draft: boolean;
}

export function createCmsComponentScope(values: {
  // alwaysAvailable: true → required
  site_structure: string;
  site_id: string;
  site_slug: string;
  site_name: string;
  agent_write_policy: AgentWritePolicy;
  site_profile: Record<string, unknown>;
  components_list: CmsComponentListEntry[];
  components_count: number;
  is_editing: boolean;
  // alwaysAvailable: false → optional
  site_domain?: string;
  site_global_css?: string;
  component_id?: string;
  component_type?: string;
  component_name?: string;
  has_draft?: boolean;
  is_active?: boolean;
  component_record?: Record<string, unknown>;
  html_content?: string;
  css_content?: string;
  pending_component?: Record<string, unknown>;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
