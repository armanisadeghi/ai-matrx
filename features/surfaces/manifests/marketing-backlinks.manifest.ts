/**
 * Surface manifest — Marketing backlinks workspace (`matrx-user/marketing-backlinks`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/backlinks` — the
 * persisted DataForSEO backlink intelligence workspace
 * (`BacklinksWorkspace`): current summary KPIs (total backlinks, referring
 * domains, dofollow/nofollow, rank), referring-domain / anchor / target-page
 * / competitor rollups, and a controlled latest-backlink table. Data is
 * server-owned history in the RLS-protected `seo` schema; the client reads
 * it directly and only triggers refresh via the canonical SEO-server
 * command. Inherits brand + site context from `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/backlinks-scope.ts (being
 * built in parallel).
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
    name: "backlink_summary",
    label: "Backlink summary KPIs",
    description:
      "The latest stored summary snapshot for this site: total backlinks, referring domains, dofollow/nofollow counts, rank score, and when it was collected. Populated once the workspace has loaded; empty when no backlink snapshot has ever been collected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
  },
  {
    name: "top_referring_domains",
    label: "Top referring domains",
    description:
      "The top stored referring domains pointing at this site, each with its backlink/referring-domain counts. Populated once the workspace has loaded; empty when no dimension snapshot has been collected yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 410,
  },
  {
    name: "top_anchors",
    label: "Top anchor texts",
    description:
      "The top stored anchor texts used in links to this site, each with its backlink count. Populated once the workspace has loaded; empty when no dimension snapshot has been collected yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    autoContext: false,
    sortOrder: 420,
  },
];

export const marketingBacklinksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-backlinks",
  readiness: "partial",
  readinessNote: "Values emitted; no groups",
  label: "Marketing Backlinks",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/backlinks",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the backlink intelligence workspace of a managed website: third-party evidence (DataForSEO) of who links to this site, stored as server-owned history — summary KPIs, referring-domain and anchor rollups, and individual backlink rows. The brand_context and site_context values give you the client and website framing; read them first.
Backlink data is COLLECTED EVIDENCE from an external provider: it reflects the provider's last collection run (backlink_summary carries the timestamp), it can be stale or empty when collection has never run, and it is read-only here — refreshes happen through the canonical server command, never by fabricating numbers.
The user works here on off-site authority: understanding the link profile, spotting lost or toxic links, and planning outreach for new ones. Reason from the stored rollups; never invent a referring domain, anchor, or metric the data does not contain.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "backlink_analyst",
      label: "Backlink analyst",
      description:
        "Interprets the stored backlink profile: authority distribution, dofollow share, anchor patterns, and gains/losses over snapshots.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "outreach_strategist",
      label: "Outreach strategist",
      description:
        "Plans link-building outreach from the referring-domain and competitor rollups: targets, angles, and anchor strategy.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited brand_id / site_id from marketing-brand / marketing-site.
 */
export function createMarketingBacklinksScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // surface-specific optionals
  backlink_summary?: Record<string, unknown>;
  top_referring_domains?: Array<Record<string, unknown>>;
  top_anchors?: Array<Record<string, unknown>>;
  // inherited optionals
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
  // baseline optionals
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
