/**
 * Surface manifest — CMS hub (`matrx-user/cms`).
 *
 * Drives the `/cms` landing page (`app/(core)/cms/page.tsx`): the list of
 * websites the user owns plus the entry card into standalone `html_pages`.
 * This is a LIST surface, not an editor — it has no `site_structure` (that's
 * per-site framing owned by `matrx-user/cms-site` and below) but gives an
 * agent enough to find, compare, or create a site by name before drilling in.
 *
 * The hub loads FULL `client_sites` rows (`CmsSiteService.listSites()`), so
 * the summary carries more than id/name: domain, active flag, agent write
 * policy, and whether the site has minted its public data key. The site's
 * `data_api_key` VALUE is deliberately never emitted — `has_data_api_key`
 * carries the only fact an agent needs, and the key itself belongs in the
 * Collections tab UI where it can be revealed/rotated deliberately.
 *
 * Runtime scope assembly lives in
 * `features/cms/agent-context/buildCmsHubContextData.ts`; the emitter is the
 * `<SurfaceRuntimeProvider>` + v3 context menus mounted in
 * `app/(core)/cms/page.tsx`.
 *
 * NOTE: this whole feature talks to a SEPARATE Supabase project
 * (`viyklljfdhtidwecakwx`) through the `/api/cms/*` routes — see
 * `features/cms/FEATURE.md`. There is no browser Supabase client for it.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_inventory",
    label: "Site inventory",
    sortOrder: 100,
    description:
      "Every website the current user owns, as listed on the hub, plus its headline counts.",
  },
  {
    key: "hub_focus",
    label: "Hub focus",
    sortOrder: 200,
    description:
      "Which site card the user is currently pointing at on the hub grid.",
  },
  {
    key: "hub_authoring",
    label: "Hub authoring",
    sortOrder: 300,
    description:
      "In-progress state of the Create New Site dialog and any load failure the hub is showing.",
  },
];

/** One row of the `owned_sites_summary` surface value. */
export interface CmsHubSiteSummaryEntry {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  agent_write_policy: string;
  has_data_api_key: boolean;
  created_at: string;
  updated_at: string;
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Site inventory ───────────────────────────────────────────────────
  {
    name: "owned_sites_count",
    label: "Owned sites count",
    description:
      "Number of client websites (`client_sites` rows) the current user owns. Always populated — zero when the user hasn't created a site yet, which is the empty state the hub renders.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 300,
    group: "site_inventory",
  },
  {
    name: "active_sites_count",
    label: "Active sites count",
    description:
      "How many of the owned sites carry `is_active = true` (the Active badge on the hub card). Always populated — zero when every site is inactive or none exist.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 310,
    group: "site_inventory",
  },
  {
    name: "owned_sites_summary",
    label: "Owned sites summary",
    description:
      "Every site the user owns, in hub list order: `{ id, slug, name, domain, is_active, agent_write_policy, has_data_api_key, created_at, updated_at }`. Always populated — empty array when no sites exist. Lets an agent find or reference a site by name/slug/domain without a separate list call. The site's data key VALUE is never included, only whether one has been minted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    sortOrder: 320,
    group: "site_inventory",
  },

  // ── Hub focus ────────────────────────────────────────────────────────
  {
    name: "selected_site_id",
    label: "Selected site ID",
    description:
      "UUID of the site card the user last pointed at on the hub (hover, or the card the right-click menu opened from). Empty when no card is focused — e.g. when the menu was opened on the page background.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "hub_focus",
  },
  {
    name: "selected_site",
    label: "Selected site",
    description:
      "The full `owned_sites_summary` entry for `selected_site_id` as one composite object (completeness law — saves the agent an index lookup). Empty when no card is focused.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    sortOrder: 410,
    group: "hub_focus",
  },

  // ── Hub authoring ────────────────────────────────────────────────────
  {
    name: "new_site_draft",
    label: "New site draft",
    description:
      "What the user has typed into the Create New Site dialog so far: `{ name, slug, domain }` (slug is auto-derived from the name until edited). Empty when the dialog has never been opened or every field is blank. Bindable only — an agent helping name a site asks for this deliberately.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 500,
    group: "hub_authoring",
  },
  {
    name: "sites_load_error",
    label: "Sites load error",
    description:
      "The error message the hub is currently displaying from a failed list/create call against `/api/cms/sites`. Empty when the hub loaded cleanly — which is the normal case.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 510,
    group: "hub_authoring",
  },
];

export const cmsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/cms",
  readiness: "verified",
  label: "CMS",
  urlPattern: "/cms",
  intro: `<surface_intro>
You are on the CMS hub — the entry point to the AI Matrx website platform, listing every client website the user owns plus a card into their standalone quick-publish HTML pages.
This is a LIST surface: you can see and compare sites, but you cannot see any page's HTML from here. There is deliberately no site_structure value — that framing appears once the user opens a site (the CMS Site surface) and everything below it.
owned_sites_summary is the working set: match the user's words ("the dentist site", "example.com") against name, slug, or domain to identify which site they mean, then drill in. selected_site / selected_site_id tell you which card they were pointing at when they invoked you — prefer it over guessing.
agent_write_policy rides on every summary entry: "blocked" means agents may not write to that site at all, "draft_only" means you may save drafts but a human must publish, "full" means you may publish directly. Check it before promising any change.
has_data_api_key only says whether the site has minted its public collections write key; the key value itself is never handed to you.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createCmsHubScope(values: {
  // alwaysAvailable: true → required
  owned_sites_count: number;
  active_sites_count: number;
  owned_sites_summary: CmsHubSiteSummaryEntry[];
  // alwaysAvailable: false → optional
  selected_site_id?: string;
  selected_site?: CmsHubSiteSummaryEntry;
  new_site_draft?: Record<string, unknown>;
  sites_load_error?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
