/**
 * Surface manifest — CMS shared component editor (`matrx-user/cms-component`).
 *
 * Drives `/cms/[siteId]/components` — the header/footer/sidebar/CTA editor.
 * Shares the same `site_structure` framing as `cms-site`/`cms-page` (this
 * component's row is marked `current="true"` in the `<components>` block)
 * plus identity + HTML/CSS bodies for the component being edited.
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
      'Compact XML snapshot of the whole site this component belongs to — same shape as on `cms-site`/`cms-page`. The component being edited is marked `current="true"` in the `<components>` block.',
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
    name: "component_id",
    label: "Component ID",
    description:
      "UUID of the component being edited. Empty when none is open (list view / just created dialog).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "component_type",
    label: "Component type",
    description: '"header" | "footer" | "sidebar" | "cta" | "custom".',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 305,
  },
  {
    name: "component_name",
    label: "Component name",
    description: "Human display name of the component.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
  },
  {
    name: "has_draft",
    label: "Has unpublished draft",
    description:
      "True when the component has draft HTML/CSS not yet published.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 315,
  },
  {
    name: "html_content",
    label: "Component HTML (draft-or-live)",
    description:
      "Full HTML body of the component — draft content if a draft exists, else the published content.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 400,
  },
  {
    name: "css_content",
    label: "Component CSS (draft-or-live)",
    description:
      "Full CSS body of the component — draft content if a draft exists, else the published content.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 405,
  },
];

export const cmsComponentManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms-component",
  label: "CMS Component",
  urlPattern: "/cms/[siteId]/components",
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
};

export function createCmsComponentScope(values: {
  // alwaysAvailable: true → required
  site_structure: string;
  site_id: string;
  site_slug: string;
  agent_write_policy: AgentWritePolicy;
  // alwaysAvailable: false → optional
  component_id?: string;
  component_type?: string;
  component_name?: string;
  has_draft?: boolean;
  html_content?: string;
  css_content?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
