/**
 * Surface manifest — Marketing brand cockpit (`matrx-user/marketing-brand`).
 *
 * Drives `/marketing/brands/[brandId]` — the brand cockpit of the Marketing
 * system (`features/marketing`, `BrandWorkspace`): one client company's
 * identity, its managed websites (with connection chips), social properties,
 * confirmed business facts, brand asset library, and the pending
 * discovery-review count. This surface is the CONTEXT ROOT of the marketing
 * tree: it declares the shared brand context block (`brand_id`,
 * `brand_name`, `brand_context`, `brand_profile`) that every descendant
 * surface (sites and their verticals) inherits.
 *
 * Runtime emitter: features/marketing/lib/scopes/brand-scope.ts
 * (being built in parallel).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Shared brand context (200-299) ────────────────────────────────────
  {
    name: "brand_context",
    label: "Brand context (XML)",
    description:
      "Compact XML snapshot of the brand this work belongs to: identity (name, industry, description, website), the editorial brand profile (audience, voice, positioning, offerings, competitors, content guidelines — when the user has authored one), confirmed business facts, brand assets, social properties, and every managed site. Built by buildBrandContextXml (features/marketing/lib/surface-context.ts). Read this FIRST — it is the ground truth about the client. Empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    sortOrder: 200,
  },
  {
    name: "brand_profile",
    label: "Brand profile (raw)",
    description:
      "The raw BrandProfile object for agents that want structured access to the editorial profile (audience, voice, positioning, offerings, competitors, content guidelines); the brand_context XML already embeds it. Empty when the user has not authored a profile or during initial load. Bindable only — not auto-shipped.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 210,
  },

  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "brand_id",
    label: "Brand ID",
    description:
      "UUID of the `web.brand` row (the anchor entity for this client/company). Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "brand_name",
    label: "Brand name",
    description:
      "Display name of the brand. Populated once the workspace has loaded; empty during initial load.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 302,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "pending_review_count",
    label: "Pending review count",
    description:
      "Number of machine-discovered items awaiting human review in this brand's discovery inbox. Zero when nothing is pending; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
  },
  {
    name: "sites_summary",
    label: "Sites summary",
    description:
      "One row per managed website of this brand: id, name, root_url, and status. Populated once the cockpit's site list has loaded; empty during initial load or for a brand with no sites yet. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 610,
  },
  {
    name: "properties_summary",
    label: "Properties summary",
    description:
      "One row per non-website brand property (Instagram, Facebook, X, TikTok, YouTube, LinkedIn, Pinterest, Google Business Profile): kind, URL/handle, and status. Empty during initial load or when the brand has no social properties. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 620,
  },
];

export const marketingBrandManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-brand",
  label: "Marketing Brand Cockpit",
  urlPattern: "/marketing/brands/[brandId]",
  intro: `<surface_intro>
You are on the Marketing brand cockpit: one client company (the brand) with its managed websites, social properties, confirmed business facts, and brand asset library — the ground-truth dossier every downstream marketing surface builds on. Read brand_context first: it is the compact XML snapshot of everything confirmed about this client.
The load-bearing rule here is ownership of truth: confirmed facts, assets, and properties are HUMAN-owned. Machine discovery only writes candidates to the review inbox (pending_review_count); a human promotes them to confirmed rows. You PROPOSE — draft profile text, recommend confirmations, flag gaps — you never fabricate a fact, invent an asset, or treat an unconfirmed guess as truth.
The editorial brand profile (embedded in brand_context, raw in brand_profile) is the voice-of-the-client document that downstream content and SEO agents rely on; when drafting or refining it, ground every claim in confirmed facts and crawl evidence, and clearly separate inference from evidence.
All values except brand_id populate only after the workspace loads — treat empty values as not-yet-loaded, never as "this brand has nothing".
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "brand_strategist",
      label: "Brand strategist",
      description:
        "Advises on the brand's overall marketing posture across its sites and properties, grounded in confirmed facts and the editorial profile.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "profile_author",
      label: "Profile author",
      description:
        "Drafts and refines the editorial brand profile (audience, voice, positioning, offerings, competitors, content guidelines) from confirmed facts and crawl evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "discovery_reviewer",
      label: "Discovery reviewer",
      description:
        "Recommends confirm/dismiss decisions for machine-discovered candidates awaiting review; never writes confirmed truth directly.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
    {
      name: "fact_researcher",
      label: "Fact researcher",
      description:
        "Researches and proposes candidate business facts (contact details, addresses, identity copy) for human confirmation.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 130,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createMarketingBrandScope(values: {
  // alwaysAvailable: true → required
  brand_id: string;
  // alwaysAvailable: false → optional
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  pending_review_count?: number;
  sites_summary?: ReadonlyArray<Record<string, unknown>>;
  properties_summary?: ReadonlyArray<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
