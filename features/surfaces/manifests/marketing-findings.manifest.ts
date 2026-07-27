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
 * Runtime emitters: `FindingsTable` (list route) and `FindingDetail` (detail
 * route) each mount the nested `SurfaceRuntimeProvider` and spread
 * `useMarketingSiteSurfaceBase()`'s base values into
 * `createMarketingFindingsScope` at trigger time.
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
    key: "finding_identity",
    label: "Finding identity",
    sortOrder: 100,
    description: "Which finding the user has open, when they are on the detail route.",
  },
  {
    key: "open_finding",
    label: "Open finding",
    sortOrder: 200,
    description:
      "Lifecycle state of the open finding plus the catalog item and page it is about.",
  },
  {
    key: "finding_evidence",
    label: "Result evidence",
    sortOrder: 300,
    description:
      "The immutable analysis results behind the open finding — never edited, never invented.",
  },
  {
    key: "register",
    label: "Findings register",
    sortOrder: 400,
    description: "The list view: what matches the current slice of the register.",
  },
  {
    key: "register_view",
    label: "Register view",
    sortOrder: 500,
    description:
      "How the user is slicing the register right now: search, filters, sort, and pagination.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Finding identity ──────────────────────────────────────────────────
  {
    name: "finding_id",
    label: "Open finding ID",
    description:
      "UUID of the `web.finding` the user has open. Populated only on the finding detail route (`/findings/[findingId]`); empty on the register list.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "finding_identity",
  },

  // ── Open finding ──────────────────────────────────────────────────────
  {
    name: "finding_summary",
    label: "Open finding summary",
    description:
      "Compact summary of the OPEN finding: lifecycle status, severity, category/subcategory, item key, subject type/id, affected page URL, suppression state + reason, resolved timestamp, first/last detected timestamps, and the first/last result pointers. Populated only on the detail route once the finding has loaded; empty on the register list and during initial load.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1100,
    sortOrder: 400,
    group: "open_finding",
  },
  {
    name: "finding_item",
    label: "Analysis item",
    description:
      "The catalog `web.analysis_item` this finding instantiates: key, label, description, category/subcategory, and scoring weight — what the check actually measures. Populated on the detail route; empty on the list or when the catalog row is unavailable.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 410,
    group: "open_finding",
  },
  {
    name: "finding_page",
    label: "Affected page",
    description:
      "The canonical page this finding is about: { id, path, url }. Empty on the register list and for site-level findings, which have no page.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 420,
    group: "open_finding",
  },

  // ── Result evidence ───────────────────────────────────────────────────
  {
    name: "latest_result",
    label: "Latest result",
    description:
      "The most recent immutable `web.analysis_result` for this finding: status, severity, score, issue count, confidence (0-1), provider id/version, run id, and computed_at. Empty on the list route or when no result history is visible.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 500,
    group: "finding_evidence",
  },
  {
    name: "first_result",
    label: "First result",
    description:
      "The oldest retained analysis result for this finding, in the same shape as latest_result — what the check reported when the problem first appeared. Empty on the list route or when the history has been pruned.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 510,
    group: "finding_evidence",
  },
  {
    name: "result_history",
    label: "Result history",
    description:
      "The loaded page of immutable result-evidence rows for this finding (computed_at, status, severity, score, issue count, confidence, provider version, run id), respecting the evidence table's search, filters, sort, and pagination. Empty on the list route or while loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1600,
    autoContext: false,
    sortOrder: 520,
    group: "finding_evidence",
  },
  {
    name: "result_total",
    label: "Evidence events",
    description:
      "Total number of result-evidence rows matching the evidence table's filters for this finding. Zero when the referenced history is unavailable; empty on the list route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 530,
    group: "finding_evidence",
  },
  {
    name: "result_view_state",
    label: "Evidence view state",
    description:
      "How the evidence table on the detail route is sliced: { search, any_of, filters, sort, page, page_size }. Empty on the register list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 540,
    group: "finding_evidence",
  },

  // ── Findings register ─────────────────────────────────────────────────
  {
    name: "findings_total",
    label: "Matching findings count",
    description:
      "Total number of findings matching the register's current filters (not just the visible page). Empty during initial load and on the detail route; zero when nothing matches.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "register",
  },
  {
    name: "findings_rows",
    label: "Loaded findings",
    description:
      "The register rows currently on screen: per finding its id, item key, category/subcategory, severity, lifecycle status, subject type, affected page path, suppression flag, and last-detected timestamp. Empty on the detail route or while loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 610,
    group: "register",
  },
  {
    name: "findings_rows_loaded",
    label: "Loaded row count",
    description:
      "How many register rows the current page holds — the size of findings_rows. Empty on the detail route or during initial load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 620,
    group: "register",
  },
  {
    name: "findings_severity_counts",
    label: "Severity breakdown",
    description:
      "Count of loaded register rows per severity — a shape read of the visible page, not of the whole register. Empty when no rows are loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 630,
    group: "register",
  },
  {
    name: "findings_status_counts",
    label: "Lifecycle breakdown",
    description:
      "Count of loaded register rows per lifecycle status (open, resolved, suppressed …) — the visible page only. Empty when no rows are loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 640,
    group: "register",
  },

  // ── Register view ─────────────────────────────────────────────────────
  {
    name: "active_filters",
    label: "Active register filters",
    description:
      "The register's current search/filter state (severity, lifecycle, subject, suppression, free text) as the URL carries it. Empty when the user is on the unfiltered default view or on the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 700,
    group: "register_view",
  },
  {
    name: "findings_sort",
    label: "Active sort",
    description:
      'The column and direction the register is sorted by, as "<column> <asc|desc>" (default "last_detected_at desc"). Empty on the detail route.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    autoContext: false,
    sortOrder: 710,
    group: "register_view",
  },
  {
    name: "findings_pagination",
    label: "Pagination",
    description:
      "Which slice of the register is on screen: { page, page_size }. Empty on the detail route. Everything outside this page is unseen by the user.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    autoContext: false,
    sortOrder: 720,
    group: "register_view",
  },
  {
    name: "findings_view_state",
    label: "Register view state",
    description:
      "Composite of the whole list view: { search, any_of, filters, sort, page, page_size }. Mirrors the individual register-view values as one object (completeness law). Empty on the detail route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    autoContext: false,
    sortOrder: 730,
    group: "register_view",
  },
];

export const marketingFindingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-findings",
  readiness: "verified",
  label: "Marketing Findings Register",
  urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/findings",
  inheritsFrom: "matrx-user/marketing-site",
  groups,
  intro: `<surface_intro>
You are on the findings register of a managed website: the durable record of every problem the analysis pipeline has detected against this site, and — on the detail route — one finding's full lifecycle. The brand_context and site_context values give you the client and website framing; read them first.
A finding is LIFECYCLE STATE (open, resolved, suppressed) derived from immutable analysis results — the evidence itself is never edited, and metrics behind it are deterministic and stored. Never re-derive a metric or invent evidence; reason only from what the register and finding_summary report.
The user triages here: deciding what is real, what to fix first, and what to suppress with a reason. Suppression is a deliberate human judgment — you may recommend suppressing or un-suppressing a finding, but the decision and its reason belong to the user.
When finding_id and finding_summary are empty, the user is on the list view; use findings_view_state, findings_total, and the loaded findings_rows to understand what slice of the register they are looking at. On the detail route, finding_item tells you what the check measures, finding_page what it is about, and latest_result / first_result / result_history are the immutable evidence trail.
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
  finding_item?: Record<string, unknown>;
  finding_page?: Record<string, unknown>;
  latest_result?: Record<string, unknown>;
  first_result?: Record<string, unknown>;
  result_history?: Array<Record<string, unknown>>;
  result_total?: number;
  result_view_state?: Record<string, unknown>;
  findings_total?: number;
  findings_rows?: Array<Record<string, unknown>>;
  findings_rows_loaded?: number;
  findings_severity_counts?: Record<string, number>;
  findings_status_counts?: Record<string, number>;
  active_filters?: Record<string, unknown>;
  findings_sort?: string;
  findings_pagination?: Record<string, unknown>;
  findings_view_state?: Record<string, unknown>;
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
