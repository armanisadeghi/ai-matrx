/**
 * Surface manifest — Marketing discovery inbox
 * (`matrx-user/marketing-discovery`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/discovery` — the
 * review inbox of the Marketing system (`features/marketing`,
 * `DiscoveryInbox`): machine-discovered candidates (`web.discovered_item` —
 * media, identity copy, social profiles, business facts, notable links)
 * grouped by category with pending/confirmed/dismissed tabs, where a human
 * promotes candidates to confirmed brand truth or dismisses them. Inherits
 * the shared brand + site context blocks from `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/discovery-scope.ts
 * (being built in parallel).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "pending_items",
    label: "Pending discovery items",
    description:
      "The machine-discovered candidates currently awaiting review: guessed_kind, url, and label per pending item, grouped as loaded in the inbox. Empty during initial load or when nothing is pending. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "pending_count",
    label: "Pending count",
    description:
      "Number of discovered items awaiting human review for this brand. Zero when the inbox is clear; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
  },
];

export const marketingDiscoveryManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-discovery",
  readiness: "partial",
  readinessNote: "Values emitted; no groups",
  label: "Marketing Discovery Inbox",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/discovery",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the Marketing discovery inbox: the review queue where machine-discovered candidates about this brand (logos and imagery, identity copy, social profiles, phone/fax/address facts, notable links) wait for a human decision. Each pending item carries the machine's guess (guessed_kind), its source URL, and a label; the user confirms it into brand truth, dismisses it, or deletes it.
The one invariant that governs this surface: the machine writes ONLY discovered_item candidates — promotion to confirmed truth (properties, brand assets, business facts) is a human, explicit act. You recommend confirm or dismiss with reasoning grounded in the item's evidence and the brand context; you never write confirmed rows, never treat a pending guess as established fact, and never invent candidates that are not in the inbox.
Use the inherited brand_context and site_context to judge whether a candidate fits the client (right company, right domain, plausible fact) before recommending confirmation. pending_items and pending_count populate after the inbox loads — empty means not-yet-loaded or genuinely clear, and pending_count zero is the only proof the inbox is clear.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "discovery_reviewer",
      label: "Discovery reviewer",
      description:
        "Reviews pending discovered items and recommends confirm/dismiss decisions with evidence-grounded reasoning; never writes confirmed truth.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "fact_researcher",
      label: "Fact researcher",
      description:
        "Cross-checks pending candidates against the live site and brand context, and researches missing facts worth proposing for review.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING those
 * inherited from `matrx-user/marketing-site` (site block) and its parent
 * `matrx-user/marketing-brand` (brand block): `brand_id` + `site_id`.
 */
export function createMarketingDiscoveryScope(values: {
  // Inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // Inherited alwaysAvailable: false → optional
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // Own alwaysAvailable: false → optional
  pending_items?: ReadonlyArray<Record<string, unknown>>;
  pending_count?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
