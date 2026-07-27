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
 * Runtime emitter: `DiscoveryInbox` mounts a nested SurfaceRuntimeProvider and
 * spreads `useMarketingSiteSurfaceBase().getBaseValues()` (the inherited
 * brand/site block) into `createMarketingDiscoveryScope`.
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
    key: "inbox_state",
    label: "Inbox state",
    sortOrder: 100,
    description:
      "Which review queue the user is looking at and how much is in it.",
  },
  {
    key: "candidates",
    label: "Discovered candidates",
    sortOrder: 200,
    description:
      "The machine-discovered rows themselves — unreviewed guesses, never confirmed brand truth.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Inbox state ───────────────────────────────────────────────────────
  {
    name: "active_status",
    label: "Active review tab",
    description:
      "Which review queue is on screen: pending, confirmed, or dismissed. Always present — the inbox always has exactly one tab selected, defaulting to pending.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    sortOrder: 300,
    group: "inbox_state",
  },
  {
    name: "pending_count",
    label: "Pending count",
    description:
      "Number of discovered items awaiting human review for this brand, from the dedicated brand-scoped count query (never the loaded row count, which caps at the list limit). Zero is the only proof the inbox is clear; empty during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "inbox_state",
  },
  {
    name: "loaded_count",
    label: "Loaded item count",
    description:
      "How many rows the active tab currently has loaded. Always present once the inbox renders (zero when the tab is empty). Distinct from pending_count, which is brand-wide and tab-independent.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "inbox_state",
  },
  {
    name: "category_counts",
    label: "Counts by category",
    description:
      "Row counts per discovery category for the active tab (media, identity, social, fact, link, other) — the section grouping the inbox renders. Empty array when the tab has no rows.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 330,
    group: "inbox_state",
  },

  // ── Discovered candidates ─────────────────────────────────────────────
  {
    name: "pending_items",
    label: "Pending discovery items",
    description:
      "The machine-discovered candidates currently awaiting review: category, guessed_kind, confidence, url, and label per pending item (capped at 30). Empty when the Pending tab is not the active tab, during initial load, or when nothing is pending — an empty value is never proof the inbox is clear (use pending_count). Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2200,
    autoContext: false,
    sortOrder: 400,
    group: "candidates",
  },
  {
    name: "discovered_items",
    label: "Loaded discovery items",
    description:
      "The rows loaded for whichever tab is active (capped at 30): id, category, guessed_kind, confidence, url, label, context snippet, and status. On the Pending tab this is the same set as pending_items with more fields; on the Confirmed/Dismissed tabs it is the only view of those rows. Empty during initial load or when the tab has no rows. Bindable only — not auto-shipped.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 410,
    group: "candidates",
  },
];

export const marketingDiscoveryManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-discovery",
  readiness: "verified",
  label: "Marketing Discovery Inbox",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/discovery",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the Marketing discovery inbox: the review queue where machine-discovered candidates about this brand (logos and imagery, identity copy, social profiles, phone/fax/address facts, notable links) wait for a human decision. Each pending item carries the machine's guess (guessed_kind), its source URL, and a label; the user confirms it into brand truth, dismisses it, or deletes it.
The one invariant that governs this surface: the machine writes ONLY discovered_item candidates — promotion to confirmed truth (properties, brand assets, business facts) is a human, explicit act. You recommend confirm or dismiss with reasoning grounded in the item's evidence and the brand context; you never write confirmed rows, never treat a pending guess as established fact, and never invent candidates that are not in the inbox.
Use the inherited brand_context and site_context to judge whether a candidate fits the client (right company, right domain, plausible fact) before recommending confirmation.
Read active_status FIRST: the inbox shows one queue at a time, and discovered_items holds only that tab's rows. pending_items is populated only while the Pending tab is active. An empty item list means not-yet-loaded or that tab is empty — pending_count (brand-wide, tab-independent) at zero is the only proof the inbox is clear.
</surface_intro>`,
  groups,
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
  gsc_synced_at?: string;
  // Own alwaysAvailable: true → required
  active_status: string;
  loaded_count: number;
  category_counts: ReadonlyArray<{ category: string; count: number }>;
  // Own alwaysAvailable: false → optional
  pending_items?: ReadonlyArray<Record<string, unknown>>;
  discovered_items?: ReadonlyArray<Record<string, unknown>>;
  pending_count?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
