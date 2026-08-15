/**
 * Surface manifest — Brand asset desk (`matrx-user/marketing-brand-assets`).
 *
 * Drives `/marketing/brands/[brandId]/assets` — `BrandAssetsWorkspace`, four
 * views on one route (`?view=`): the brand's OWNED asset library
 * (`web.brand_asset`), research-captured images (inspiration / reuse), free
 * stock sources + the brand's portal links, and AI image ordering off the
 * preset menu.
 *
 * These four views lived inside the WEBSITE's media workspace until
 * 2026-08-15. All four read brand- or organization-scoped data, so two sites
 * under one brand rendered identical rows and someone editing "this site's
 * library" was editing everything under the brand. Arman split the levels: the
 * website keeps Crawled / Videos / Standards
 * (`matrx-user/marketing-site-media`), the brand owns everything ownable.
 *
 * Inherits brand context from `matrx-user/marketing-brand`. The views load
 * their data lazily (React Query), so beyond `assets_view` and
 * `media_order_draft` the values are emitted opportunistically from the query
 * cache — present whenever the user has visited the view that loads them.
 *
 * Runtime scope assembly: `features/marketing/lib/scopes/brand-assets-scope.ts`
 * (emitter in `BrandAssetsWorkspace.tsx`).
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
    description: "Which of the four asset views the user is looking at.",
  },
  {
    key: "generation_order",
    label: "Image order draft",
    sortOrder: 150,
    description:
      "The unsent AI image order on the Generate view — type, brief, style, dimension overrides.",
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
      "The image standards the brand's websites declare, merged into one reference for ordering and editing.",
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
    name: "assets_view",
    label: "Active asset view",
    description:
      "Which asset view is open, from the URL's `?view=`: library | research | sources | generate. Always present — defaults to library when the URL carries no view.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
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
    name: "brand_media_standards",
    label: "Brand media standards",
    description:
      "The image standards declared by the brand's websites (`web.site.settings.media_standards`), merged into one reference: named slots (Hero, OG / share card…) with width/height, preferred format, max KB and notes, plus the sites' free-form rules and `sites` (which websites contributed). Standards themselves are edited per WEBSITE, in that site's Media → Standards view — this is the read-only union the asset desk orders and edits against. Always emitted; empty slots mean no site has declared standards yet.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 700,
    group: "standards",
    sortOrder: 600,
  },

  // ── Research inspiration ───────────────────────────────────────────────
  {
    name: "research_images_summary",
    label: "Research images summary",
    description:
      "Rollup of the organization's research-captured images: total (bounded to the newest 600), own_domain vs external counts (own = source or image host matches one of the brand's websites), and per-topic counts for the most common topics. Empty until the Research view's query has loaded this session.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "research_inspiration",
    sortOrder: 700,
  },
];

/**
 * Write targets — `draft`, `ask`. The judgment line is ORDER vs FIRE: an agent
 * may author the image order and the USER presses "Order this image".
 *
 * Deliberately NOT writable: generating an image (it costs money and mints a
 * `web.brand_asset` row), promoting/uploading/deleting library assets, and
 * `is_primary` — ownership, spend, and destruction stay human. The media
 * STANDARDS write targets did not come with these views: standards belong to a
 * website and stay on `matrx-user/marketing-site-media`.
 *
 * Handler: `features/marketing/components/brands/BrandAssetsWriteTargets.tsx`
 * (mounted for the whole workspace). Validation core:
 * `features/marketing/lib/site-media-write-targets.ts`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "media_order",
    label: "Image order draft",
    description: `Stage the AI image order on the Generate view. Value: a partial object with any of { type?: ${MEDIA_ORDER_PRESET_IDS.join(
      " | ",
    )}, brief?: string, style?: string, width?: number, height?: number }. Omitted keys keep their current value. \`brief\` is the subject — what the image should show, its mood and key elements — and cannot be set to an empty string. \`style\` overrides the preset's own style ("" falls back to it). \`width\`/\`height\` are pixel overrides ("" clears them, and dimensions then come from the brand's matching media standard, else the preset default) — omit them unless this order is genuinely special, because brand_media_standards already carries the intended sizes. Ground the brief in brand_context. This ONLY fills the form: nothing is generated and nothing is charged until the user presses "Order this image".`,
    valueType: "object",
    updatesValue: "media_order_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation_order",
    sortOrder: 100,
  },
];

export const marketingBrandAssetsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-brand-assets",
  label: "Brand Asset Desk",
  urlPattern: "/marketing/brands/[brandId]/assets",
  inheritsFrom: "matrx-user/marketing-brand",
  readiness: "partial",
  readinessNote:
    "Split out of matrx-user/marketing-site-media on 2026-08-15 when the Media section was divided by level. Manifest, emitter, registry, route mapping, and the media_order write target carry over from the verified site-media implementation; the DB sync and a live agent run against this surface name have not been re-verified.",
  intro: `<surface_intro>
Read brand_context first — it tells you whose brand this is and what it sells.
You are on the asset desk for ONE BRAND: everything the brand OWNS or could own, four views on one route. assets_view tells you which one is open: library (the brand's owned assets — uploads, promoted crawl finds, generated images), research (images the research system captured, for reuse and creative reference), sources (free stock search and the brand's own stock-portal links), and generate (order AI images off preset types).
This is the BRAND level on purpose. These assets belong to the brand and are used by every website under it — the per-website media evidence (what images a site actually serves) and that site's image STANDARDS live one level down, in that website's Media section. brand_media_standards is the read-only union of those sites' standards; when it is empty, saying which standards the sites should declare is useful work, but you cannot set them here.
brand_library_assets are the assets the brand actually owns. Research images are inspiration — third-party ones must never be copied, only used as creative direction.
You can WRITE here, and the line is ORDER vs FIRE: media_order fills in the Generate view's image order (type, brief, style, size overrides), staging a draft the USER reviews and commits. You never generate an image, promote an asset, or delete anything yourself. Read media_order_draft before writing it: your value merges over what is already staged.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "art_director",
      label: "Art director",
      description:
        "Turns gaps in the brand's library and research references into concrete creative briefs for the Generate view, grounded in the brand context and the sites' media standards.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "library_curator",
      label: "Library curator",
      description:
        "Reviews the owned library for missing kinds, duplicates, and untitled assets, and recommends what to promote, retitle, or replace.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the inherited
 * `brand_id` from `matrx-user/marketing-brand`.
 */
export function createMarketingBrandAssetsScope(values: {
  // Inherited alwaysAvailable: true → required
  brand_id: string;
  // alwaysAvailable: true → required (own)
  assets_view: string;
  media_order_draft: Record<string, unknown>;
  brand_media_standards: Record<string, unknown>;
  // Inherited optionals (marketing-brand)
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  pending_review_count?: number;
  // alwaysAvailable: false → optional
  brand_library_assets?: Array<Record<string, unknown>>;
  research_images_summary?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
