/**
 * Surface manifest — CMS hub (`matrx-user/cms`).
 *
 * Drives the `/cms` landing page: the list of websites the user owns plus
 * the entry point into standalone `html_pages`. This is a LIST surface, not
 * an editor — it has no `site_structure` (that's per-site framing owned by
 * `matrx-user/cms-site` and below) but gives an agent enough to find or
 * create a site by name before drilling in.
 *
 * See `features/cms/FEATURE.md` for the two-content-system split this hub
 * sits above.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "owned_sites_count",
    label: "Owned sites count",
    description:
      "Number of client websites (client_sites rows) the current user owns. Always populated — zero when the user hasn't created a site yet.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 200,
  },
  {
    name: "owned_sites_summary",
    label: "Owned sites summary",
    description:
      "Array of `{ id, slug, name, is_active }` for every site the user owns, in list order. Always populated — empty array when no sites exist. Lets an agent find or reference a site by name/slug without a separate list call.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    sortOrder: 210,
  },
  {
    name: "selected_site_id",
    label: "Selected site ID",
    description:
      "UUID of the site card the user last interacted with (hover/right-click target) on the hub. Empty when no site is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 220,
  },
];

export const cmsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms",
  label: "CMS",
  urlPattern: "/cms",
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

export function createCmsHubScope(values: {
  // alwaysAvailable: true → required
  owned_sites_count: number;
  owned_sites_summary: Array<{
    id: string;
    slug: string;
    name: string;
    is_active: boolean;
  }>;
  // alwaysAvailable: false → optional
  selected_site_id?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
