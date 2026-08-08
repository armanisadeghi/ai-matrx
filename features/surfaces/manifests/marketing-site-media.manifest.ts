/**
 * Surface manifest — Site media workspace (`matrx-user/marketing-site-media`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/media` —
 * `SiteMediaWorkspace`, the site's media command center: five views on one
 * route (`?view=`): the crawled image inventory (evidence), the brand's owned
 * asset library (`web.brand_asset`), research-captured images (inspiration /
 * reuse), AI image ordering off the preset menu, and the site's media
 * standards (persisted at `web.site.settings.media_standards`).
 *
 * Inherits brand + site context from `matrx-user/marketing-site`. The views
 * load their data lazily (React Query), so beyond `media_view` and
 * `media_standards` the values are emitted opportunistically from the query
 * cache — present whenever the user has visited the view that loads them.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/site-media-scope.ts`
 * (emitter in `SiteMediaWorkspace.tsx`).
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
    key: "workspace_view",
    label: "Workspace view",
    sortOrder: 100,
    description: "Which of the five media views the user is looking at.",
  },
  {
    key: "crawled_inventory",
    label: "Crawled inventory",
    sortOrder: 200,
    description:
      "The observed evidence: every image found across the site's canonical page snapshots.",
  },
  {
    key: "owned_library",
    label: "Owned library",
    sortOrder: 300,
    description:
      "The brand's own assets — uploaded, discovered, promoted, or AI-generated.",
  },
  {
    key: "standards",
    label: "Media standards",
    sortOrder: 400,
    description:
      "The site's target image sizes and rules, feeding every generation order.",
  },
  {
    key: "research_inspiration",
    label: "Research inspiration",
    sortOrder: 500,
    description:
      "Images captured by the research system — reuse candidates and creative references.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Workspace view ─────────────────────────────────────────────────────
  {
    name: "media_view",
    label: "Active media view",
    description:
      "Which media view is open, from the URL's `?view=`: crawled | library | research | generate | standards. Always present — defaults to crawled when the URL carries no view.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    group: "workspace_view",
    sortOrder: 300,
  },

  // ── Crawled inventory ──────────────────────────────────────────────────
  {
    name: "media_inventory_summary",
    label: "Media inventory summary",
    description:
      "Rollup of the crawled image evidence: crawled_pages, pages_with_inventory, unique_assets (deduped by src), assets_missing_alt, counted_images / counted_missing_alt (snapshot counters when per-image inventory wasn't captured), entries_without_src, per-tier buckets { photos, graphics, icons }, and share_images (distinct og:/twitter: image URLs). Empty until the Crawled view's site-media query has loaded at least once this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    group: "crawled_inventory",
    sortOrder: 400,
  },

  // ── Owned library ──────────────────────────────────────────────────────
  {
    name: "brand_library_assets",
    label: "Brand library assets",
    description:
      "Every `web.brand_asset` owned by this brand — id, kind (logo, hero_image, og_image, color…), source (uploaded / discovered / generated / research), title, is_primary, whether a stored file backs it, its external source_url, and created_at. Empty until the Library or Generate view has loaded the assets this session. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "owned_library",
    sortOrder: 500,
  },

  // ── Media standards ────────────────────────────────────────────────────
  {
    name: "media_standards",
    label: "Site media standards",
    description:
      "The site's target image standards from `web.site.settings.media_standards`: named slots (Hero, OG / share card…) with width/height, preferred format, max KB, and per-slot notes, plus free-form site-wide rules. Always emitted — an empty { slots: [], notes: \"\" } means the site has not defined standards yet.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 600,
    group: "standards",
    sortOrder: 600,
  },

  // ── Research inspiration ───────────────────────────────────────────────
  {
    name: "research_images_summary",
    label: "Research images summary",
    description:
      "Rollup of the organization's research-captured images: total (bounded to the newest 600), own_domain vs external counts (own = source or image host matches this site), and per-topic counts for the most common topics. Empty until the Research view's query has loaded this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "research_inspiration",
    sortOrder: 700,
  },
];

export const marketingSiteMediaManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-media",
  label: "Site Media Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/media",
  inheritsFrom: "matrx-user/marketing-site",
  readiness: "partial",
  readinessNote:
    "Manifest, emitter, registry, route mapping, and DB sync are in place. The Generate view's draft order fields (subject/style/dimension overrides) are view-local state not yet lifted into the scope, and the live non-matching-name binding verification has not been run.",
  intro: `<surface_intro>
Read brand_context and site_context first — they tell you whose site this is and what it sells.
You are on the media command center for ONE managed website: five views on one route. media_view tells you which one is open: crawled (every image observed across the site's canonical page snapshots — evidence, not owned files), library (the brand's OWNED assets), research (images the research system captured — reuse and inspiration), generate (order AI images off preset types), and standards (the site's target image sizes and rules).
media_inventory_summary is stored crawl evidence — trust its counts as given, and read an empty value as "not loaded or not crawled yet", never as "the site has no images". Missing alt text and images far off the site's standards are the highest-value things to point out. media_standards is the contract every generated or replaced image should meet; when it is empty, recommending standards is itself useful work.
brand_library_assets are the assets the brand actually owns; crawled images are only observed on the site and may not be in the library. Research images are inspiration — third-party ones must never be copied, only used as creative direction.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "media_auditor",
      label: "Media auditor",
      description:
        "Audits the crawled inventory against the site's standards — missing alt text, oversized or undersized images, format and weight violations — into a prioritized fix list.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "art_director",
      label: "Art director",
      description:
        "Turns gaps in the inventory and research references into concrete creative briefs for the Generate view, grounded in the brand context and media standards.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the inherited
 * `brand_id` + `site_id` from the marketing-brand → marketing-site chain.
 */
export function createMarketingSiteMediaScope(values: {
  // alwaysAvailable: true → required (inherited)
  brand_id: string;
  site_id: string;
  // alwaysAvailable: true → required (own)
  media_view: string;
  media_standards: Record<string, unknown>;
  // Inherited optionals (marketing-brand + marketing-site)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  gsc_synced_at?: string;
  // alwaysAvailable: false → optional
  media_inventory_summary?: Record<string, unknown>;
  brand_library_assets?: Array<Record<string, unknown>>;
  research_images_summary?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
