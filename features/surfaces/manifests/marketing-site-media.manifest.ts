/**
 * Surface manifest — Site media workspace (`matrx-user/marketing-site-media`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/media` —
 * `SiteMediaWorkspace`, THIS WEBSITE's own media: three views on one route
 * (`?view=`): the crawled image inventory (evidence), the crawled video /
 * embed evidence plus owned video assets, and the site's media standards
 * (persisted at `web.site.settings.media_standards`).
 *
 * Library / Research / Sources / Generate left this surface on 2026-08-15 for
 * `matrx-user/marketing-brand-assets` (`/marketing/brands/[brandId]/assets`).
 * All four read brand- or organization-scoped data, so two sites under one
 * brand emitted identical values and an agent writing "this site's library"
 * was writing the brand's. What remains here is genuinely per-site.
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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace_view",
    label: "Workspace view",
    sortOrder: 100,
    description: "Which of the three media views the user is looking at.",
  },
  {
    key: "crawled_inventory",
    label: "Crawled inventory",
    sortOrder: 200,
    description:
      "The observed evidence: every image found across the site's canonical page snapshots.",
  },
  {
    key: "standards",
    label: "Media standards",
    sortOrder: 400,
    description:
      "The site's target image sizes and rules, feeding every generation order.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Workspace view ─────────────────────────────────────────────────────
  {
    name: "media_view",
    label: "Active media view",
    description:
      "Which media view is open, from the URL's `?view=`: crawled | videos | standards. Always present — defaults to crawled when the URL carries no view. The brand's library, research, stock sources and image generation are NOT here — they are the brand asset desk, at /marketing/brands/[brandId]/assets.",
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

];

/**
 * Write targets — both `draft`, both `ask`. An agent may PROPOSE the site's
 * image standards; the USER presses "Save standards".
 *
 * Deliberately NOT writable: crawled alt text is observed EVIDENCE, not
 * editable state — authoring alt text belongs to
 * `matrx-user/marketing-page`'s `page_image_alts` target, not here. The
 * `media_order` target moved with the Generate view to
 * `matrx-user/marketing-brand-assets` on 2026-08-15.
 *
 * Handler: `MediaStandardsView`, which owns the standards draft — so both are
 * offered only while the Standards view is open. Validation core:
 * `features/marketing/lib/site-media-write-targets.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "media_standards_slots",
    label: "Media standard slots",
    description:
      "Propose the site's named image slots. Value: { slots: [{ name: string, width?: number|null, height?: number|null, format?: string|null, max_kb?: number|null, notes?: string }] }. The list REPLACES the full set — include the existing slots from the media_standards read value when you are adding to it, or they are dropped. `name` is required and must be unique (Hero, OG / share card, Blog header…); slot ids are minted for you, never pass one. An empty slots array is refused — clearing every standard is a human decision. Staged into the Standards editor as unsaved changes; the USER presses \"Save standards\". Only available while the Standards view (`?view=standards`) is open.",
    valueType: "object",
    updatesValue: "media_standards",
    mode: "draft",
    applyPolicy: "ask",
    group: "standards",
    sortOrder: 110,
  },
  {
    name: "media_standards_notes",
    label: "Site-wide media rules",
    description:
      'Propose the free-form site-wide media rules — naming conventions, subjects to avoid, compression and tone guidance. Value: { notes: string }, which REPLACES the current notes (pass "" to clear them). These notes ride along with every AI image order, so write them as instructions to an image generator, grounded in brand_context. Staged into the Standards editor as unsaved changes; the USER presses "Save standards". Only available while the Standards view (`?view=standards`) is open.',
    valueType: "object",
    updatesValue: "media_standards",
    mode: "draft",
    applyPolicy: "ask",
    group: "standards",
    sortOrder: 120,
  },
];

export const marketingSiteMediaManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-site-media",
  label: "Site Media Workspace",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/media",
  inheritsFrom: "matrx-user/marketing-site",
  readiness: "partial",
  readinessNote:
    "Manifest, emitter, registry, route mapping, and DB sync are in place; the standards write targets were verified with a live agent run (2026-08-10). Narrowed to the three per-site views on 2026-08-15 when Library / Research / Sources / Generate moved to matrx-user/marketing-brand-assets — the DB sync for that removal and the live non-matching-name binding verification have not been run.",
  intro: `<surface_intro>
Read brand_context and site_context first — they tell you whose site this is and what it sells.
You are on the media desk for ONE managed website: three views on one route. media_view tells you which one is open: crawled (every image observed across the site's canonical page snapshots — evidence, not owned files), videos (crawled video and embed evidence plus the brand's owned video assets), and standards (the site's target image sizes and rules).
Everything the BRAND owns — its asset library, research-captured images, stock sources, and AI image generation — is a level up, on the brand asset desk at /marketing/brands/[brandId]/assets. Say so plainly when the user asks for it here; do not pretend those actions exist on this surface.
media_inventory_summary is stored crawl evidence — trust its counts as given, and read an empty value as "not loaded or not crawled yet", never as "the site has no images". Missing alt text and images far off the site's standards are the highest-value things to point out. media_standards is the contract every generated or replaced image should meet; when it is empty, recommending standards is itself useful work.
You can WRITE here, and only one thing: media_standards_slots / media_standards_notes propose the site's standards as unsaved changes the USER reviews and saves. You never save the standards yourself.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
        "Turns gaps in the crawled inventory into concrete creative briefs — grounded in the brand context and this site's media standards — for ordering on the brand asset desk.",
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
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
