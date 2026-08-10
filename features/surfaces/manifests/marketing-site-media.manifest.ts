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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { MEDIA_ORDER_PRESET_IDS } from "@/features/marketing/lib/media-order-presets";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace_view",
    label: "Workspace view",
    sortOrder: 100,
    description: "Which of the five media views the user is looking at.",
  },
  {
    key: "generation_order",
    label: "Image order draft",
    sortOrder: 150,
    description:
      "The unsent AI image order on the Generate view — type, brief, style, dimension overrides.",
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

  // ── Image order draft ──────────────────────────────────────────────────
  {
    name: "media_order_draft",
    label: "Image order draft",
    description:
      "The AI image order currently staged on the Generate view, owned by the workspace so it survives view switches: { type (preset id), brief (what the image should show), style (override; empty = the preset's own style), width, height (pixel overrides as strings; empty = inherit from the matching media standard, else the preset default), resolved_width, resolved_height, resolved_from ('standard' | 'preset'), resolved_slot_name }. Always present — an empty brief means nothing has been ordered yet. NOTHING is generated until the user presses “Order this image”.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "generation_order",
    sortOrder: 350,
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

/**
 * Write targets — all `draft`, all `ask`. The judgment line on this surface is
 * ORDER vs FIRE: an agent may author the image order and propose the site's
 * standards, and the USER presses "Order this image" / "Save standards".
 *
 * Deliberately NOT writable: generating an image (it costs money and mints a
 * `web.brand_asset` row), promoting/uploading/deleting library assets, and
 * `is_primary` — ownership, spend, and destruction stay human. Crawled alt
 * text is observed EVIDENCE, not editable state; authoring alt text belongs to
 * `matrx-user/marketing-page`'s `page_image_alts` target, not here.
 *
 * Handlers: `features/marketing/components/media/SiteMediaWriteTargets.tsx`
 * (`media_order`, mounted for the whole workspace) and `MediaStandardsView`
 * (`media_standards_*`, which owns the standards draft — so those two are
 * offered only while the Standards view is open). Validation core:
 * `features/marketing/lib/site-media-write-targets.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "media_order",
    label: "Image order draft",
    description: `Stage the AI image order on the Generate view. Value: a partial object with any of { type?: ${MEDIA_ORDER_PRESET_IDS.join(
      " | ",
    )}, brief?: string, style?: string, width?: number, height?: number }. Omitted keys keep their current value. \`brief\` is the subject — what the image should show, its mood and key elements — and cannot be set to an empty string. \`style\` overrides the preset's own style ("" falls back to it). \`width\`/\`height\` are pixel overrides ("" clears them, and dimensions then come from the site's matching media standard, else the preset default) — omit them unless this order is genuinely special, because media_standards already carries the site's intended sizes. Ground the brief in brand_context and the site's media standards. This ONLY fills the form: nothing is generated and nothing is charged until the user presses "Order this image".`,
    valueType: "object",
    updatesValue: "media_order_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation_order",
    sortOrder: 100,
  },
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
    "Manifest, emitter, registry, route mapping, and DB sync are in place. The Generate view's order fields are now lifted into the workspace and emitted as media_order_draft, and the three write targets were verified with a live agent run (2026-08-10). The live non-matching-name binding verification has not been run.",
  intro: `<surface_intro>
Read brand_context and site_context first — they tell you whose site this is and what it sells.
You are on the media command center for ONE managed website: five views on one route. media_view tells you which one is open: crawled (every image observed across the site's canonical page snapshots — evidence, not owned files), library (the brand's OWNED assets), research (images the research system captured — reuse and inspiration), generate (order AI images off preset types), and standards (the site's target image sizes and rules).
media_inventory_summary is stored crawl evidence — trust its counts as given, and read an empty value as "not loaded or not crawled yet", never as "the site has no images". Missing alt text and images far off the site's standards are the highest-value things to point out. media_standards is the contract every generated or replaced image should meet; when it is empty, recommending standards is itself useful work.
brand_library_assets are the assets the brand actually owns; crawled images are only observed on the site and may not be in the library. Research images are inspiration — third-party ones must never be copied, only used as creative direction.
You can WRITE here, and the line is ORDER vs FIRE: media_order fills in the Generate view's image order (type, brief, style, size overrides) and media_standards_slots / media_standards_notes propose the site's standards — all three stage a draft the USER reviews and commits. You never generate an image, promote or delete an asset, or save the standards yourself. Read media_order_draft before writing it: your value merges over what is already staged.
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
  media_order_draft: Record<string, unknown>;
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
