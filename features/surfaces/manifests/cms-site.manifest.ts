/**
 * Surface manifest — CMS site workspace (`matrx-user/cms-site`).
 *
 * Drives `/cms/[siteId]` (page list, settings, components hub chrome). This
 * is where the shared `site_structure` framing value FIRST becomes
 * available — every surface underneath (page editor, component editor)
 * emits the exact same XML shape so an agent orients itself identically no
 * matter which of the three it's running against. See
 * `features/cms/utils/buildSiteStructureXml.ts` for the shape and the
 * "framing idea" section of the CMS surfaces plan for why this matters.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import type { AgentWritePolicy } from "@/features/cms/types";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "site_structure",
    label: "Site structure (big picture)",
    description:
      "Compact XML snapshot of the whole site: id/slug/name/policy/live+preview URLs, every page's routing + status flags (published/has_draft/home/nav), and every shared component's type/name/has_draft. No HTML/CSS/JS bodies. The single most important context item on any CMS website surface — read this first to orient, then use the CMS agent tools to navigate to a specific page or component.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    sortOrder: 200,
  },
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the site (client_sites.id) this workspace is scoped to. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 205,
  },
  {
    name: "site_slug",
    label: "Site slug",
    description:
      "URL slug of the site, used in live/preview URLs (`/c/{slug}/…`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 206,
  },
  {
    name: "site_name",
    label: "Site name",
    description: "Human display name of the site. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 207,
  },
  {
    name: "agent_write_policy",
    label: "Agent write policy",
    description:
      '"blocked" (agents cannot write at all), "draft_only" (agents may save drafts but never publish — a human must publish), or "full" (agents may publish directly). Always populated. An agent MUST check this before attempting any write and refuse/degrade politely when "blocked".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 208,
  },
  {
    name: "live_url",
    label: "Site live URL",
    description: "Public root URL of the site's home page. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 209,
  },
  {
    name: "preview_url",
    label: "Site preview URL",
    description:
      "Draft-content preview URL of the site's home page (`?preview=true`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 70,
    sortOrder: 210,
  },
  {
    name: "selected_page_id",
    label: "Selected page ID",
    description:
      "UUID of the page row the user last interacted with in the page list. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "pages_count",
    label: "Pages count",
    description: "Total number of pages on this site. Always populated.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 310,
  },
];

export const cmsSiteManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-site",
  readiness: "stub",
  readinessNote: "Declared vocabulary only; never audited against the live page, no runtime emitter",
  label: "CMS Site",
  urlPattern: "/cms/[siteId]",
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

export function createCmsSiteScope(values: {
  // alwaysAvailable: true → required
  site_structure: string;
  site_id: string;
  site_slug: string;
  site_name: string;
  agent_write_policy: AgentWritePolicy;
  live_url: string;
  preview_url: string;
  pages_count: number;
  // alwaysAvailable: false → optional
  selected_page_id?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
