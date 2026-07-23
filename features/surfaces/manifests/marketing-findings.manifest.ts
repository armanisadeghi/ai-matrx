/**
 * Surface manifest — Marketing findings register (`matrx-user/marketing-findings`).
 *
 * Drives `/marketing/brands/[brandId]/sites/[siteId]/findings` and its
 * `/findings/[findingId]` detail — the durable finding register of the
 * Marketing system (`FindingsTable` / `FindingDetail`). A finding is current
 * problem lifecycle state (`web.finding`: status, severity, suppression,
 * first/latest result pointers); its evidence is the immutable
 * `web.analysis_result` history. Inherits brand + site context from
 * `matrx-user/marketing-site`.
 *
 * Runtime emitter: features/marketing/lib/scopes/findings-scope.ts (being
 * built in parallel).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Identity (300-349) ────────────────────────────────────────────────
  {
    name: "finding_id",
    label: "Open finding ID",
    description:
      "UUID of the `web.finding` the user has open. Populated only on the finding detail route (`/findings/[findingId]`); empty on the register list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 330,
  },

  // ── Observed evidence (400-499) ───────────────────────────────────────
  {
    name: "finding_summary",
    label: "Open finding summary",
    description:
      "Compact summary of the OPEN finding: lifecycle status, severity, category/subcategory, item key, subject type/id, affected page URL, suppression state, and first/last detected timestamps. Populated only on the detail route once the finding has loaded; empty on the register list and during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 400,
  },

  // ── Workspace signals (600-649) ───────────────────────────────────────
  {
    name: "active_filters",
    label: "Active register filters",
    description:
      "The register's current search/filter/sort state (severity, lifecycle, subject, suppression, free text) as the URL carries it. Empty when the user is on the unfiltered default view or on the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 600,
  },
  {
    name: "findings_total",
    label: "Matching findings count",
    description:
      "Total number of findings matching the register's current filters (not just the visible page). Empty during initial load; zero when nothing matches.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 610,
  },
];

export const marketingFindingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-findings",
  label: "Marketing Findings Register",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/findings",
  inheritsFrom: "matrx-user/marketing-site",
  intro: `<surface_intro>
You are on the findings register of a managed website: the durable record of every problem the analysis pipeline has detected against this site, and — on the detail route — one finding's full lifecycle. The brand_context and site_context values give you the client and website framing; read them first.
A finding is LIFECYCLE STATE (open, resolved, suppressed) derived from immutable analysis results — the evidence itself is never edited, and metrics behind it are deterministic and stored. Never re-derive a metric or invent evidence; reason only from what the register and finding_summary report.
The user triages here: deciding what is real, what to fix first, and what to suppress with a reason. Suppression is a deliberate human judgment — you may recommend suppressing or un-suppressing a finding, but the decision and its reason belong to the user.
When finding_id and finding_summary are empty, the user is on the list view; use active_filters and findings_total to understand what slice of the register they are looking at.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "finding_investigator",
      label: "Finding investigator",
      description:
        "Explains what a finding means, why it fired, and how severe it really is, from its lifecycle state and stored evidence.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "remediation_planner",
      label: "Remediation planner",
      description:
        "Turns open findings into a concrete, prioritized fix plan for this site.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
    {
      name: "suppression_reviewer",
      label: "Suppression reviewer",
      description:
        "Reviews suppressed findings and recommends which suppressions to keep, revisit, or lift — the user makes the final call.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value, INCLUDING the
 * inherited brand_id / site_id from marketing-brand / marketing-site.
 */
export function createMarketingFindingsScope(values: {
  // inherited alwaysAvailable: true → required
  brand_id: string;
  site_id: string;
  // surface-specific optionals
  finding_id?: string;
  finding_summary?: Record<string, unknown>;
  active_filters?: Record<string, unknown>;
  findings_total?: number;
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
