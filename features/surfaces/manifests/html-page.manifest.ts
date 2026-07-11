/**
 * Surface manifest — standalone HTML page editor (`matrx-user/html-page`).
 *
 * Drives `/cms/html-pages` and `/cms/html-pages/[pageId]` — the OTHER CMS
 * content system (`html_pages` table), deliberately separate from
 * `client_sites`/`client_pages`. No draft/publish twins, no site tree, no
 * `agent_write_policy` — a standalone page publishes immediately on save.
 * Framing value is `html_pages_structure` (flat sibling list), NOT
 * `site_structure` — do not conflate the two systems.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "html_pages_structure",
    label: "Standalone pages structure (big picture)",
    description:
      'Compact XML list of every standalone HTML page the user has published (`html_pages` rows): id, title, indexability, and live URL. The page open in the editor is marked `current="true"`. Read this first to see sibling pages before creating a duplicate or asking the user which page they mean.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 200,
  },
  {
    name: "page_id",
    label: "Page ID",
    description:
      "UUID of the html_pages row being edited. Always populated on the editor route.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 250,
  },
  {
    name: "live_url",
    label: "Page live URL",
    description: "Public URL of this page (`/p/{id}`). Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 255,
  },
  {
    name: "meta_title",
    label: "Meta title",
    description:
      "SEO title / HTML `<title>`. Required by the save flow — never actually empty once saved.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 260,
  },
  {
    name: "meta_description",
    label: "Meta description",
    description: "SEO description shown in search results. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 262,
  },
  {
    name: "meta_keywords",
    label: "Meta keywords",
    description: "Comma-separated SEO keywords. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 264,
  },
  {
    name: "og_image",
    label: "Open Graph image URL",
    description: "Social-share preview image URL. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 266,
  },
  {
    name: "canonical_url",
    label: "Canonical URL",
    description:
      "Canonical URL override for duplicate-content SEO. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 268,
  },
  {
    name: "is_indexable",
    label: "Allow search indexing",
    description:
      "True when search engines may index this page. Defaults to false (noindex) on new pages.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 270,
  },
];

export const htmlPageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/html-page",
  label: "HTML Page",
  urlPattern: "/cms/html-pages/[pageId]",
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
      name: "html_page_editor",
      label: "HTML page editor",
      description:
        "Default agent offered for edits to a standalone published HTML page.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export function createHtmlPageScope(values: {
  // alwaysAvailable: true → required
  html_pages_structure: string;
  page_id: string;
  live_url: string;
  meta_title: string;
  is_indexable: boolean;
  // alwaysAvailable: false → optional
  meta_description?: string;
  meta_keywords?: string;
  og_image?: string;
  canonical_url?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
