import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const MARKETING_REPORTS_LABEL = "Marketing Reports";
export const MARKETING_REPORTS_GROUP_LABELS = {
  reportScope: "Report scope",
  reportFindings: "Executive findings",
  reportEvidence: "Report evidence",
};

const groups: SurfaceValueGroup[] = [
  {
    key: "report_scope",
    label: MARKETING_REPORTS_GROUP_LABELS.reportScope,
    sortOrder: 100,
    description: "The sites and 28-day reporting window available on the page.",
  },
  {
    key: "report_findings",
    label: MARKETING_REPORTS_GROUP_LABELS.reportFindings,
    sortOrder: 200,
    description: "Plain-language conclusions drawn from the report evidence.",
  },
  {
    key: "report_evidence",
    label: MARKETING_REPORTS_GROUP_LABELS.reportEvidence,
    sortOrder: 300,
    description:
      "Search performance, traffic classes, queries, and pages supporting the findings.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "report_status",
    label: "Report status",
    description:
      "Whether the report is loading, ready, empty, or unavailable because a read failed.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "report_scope",
    sortOrder: 100,
  },
  {
    name: "available_sites",
    label: "Available sites",
    description:
      "Every site the user can select for this report, including its Search Console binding state.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    autoContext: false,
    group: "report_scope",
    sortOrder: 110,
  },
  {
    name: "selected_site",
    label: "Selected site",
    description:
      "The identity, domain, and brand id of the site whose client report is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "report_scope",
    sortOrder: 120,
  },
  {
    name: "report_period",
    label: "Report period",
    description:
      "The current 28-day window and its immediately preceding comparison window, clamped to fresh GSC data.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "report_scope",
    sortOrder: 130,
  },
  {
    name: "data_freshness",
    label: "Data freshness",
    description:
      "The canonical Search Console freshness rows used to anchor the report window.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    group: "report_scope",
    sortOrder: 140,
  },
  {
    name: "executive_findings",
    label: "Executive findings",
    description:
      "The report's plain-language conclusions, with the supporting number kept beside each finding.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "report_findings",
    sortOrder: 200,
  },
  {
    name: "search_summary",
    label: "Search summary",
    description:
      "Canonical gsc_perf_summary metrics for the report and comparison periods.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    group: "report_evidence",
    sortOrder: 300,
  },
  {
    name: "traffic_class_summary",
    label: "Traffic class summary",
    description:
      "The canonical money, educational, brand, mismatch, and unclassified GSC rollup.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    group: "report_evidence",
    sortOrder: 310,
  },
  {
    name: "top_queries",
    label: "Top queries",
    description:
      "The highest-click search queries, resolved through the canonical keyword class-by-text RPC.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    group: "report_evidence",
    sortOrder: 320,
  },
  {
    name: "keyword_class_resolution",
    label: "Keyword class resolution",
    description:
      "The canonical keyword ids and traffic classes resolved by the class-by-text RPC for the visible search queries.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    group: "report_evidence",
    sortOrder: 325,
  },
  {
    name: "top_pages",
    label: "Top pages",
    description:
      "The highest-click canonical pages in the report window; page class bars use the page-summary RPC.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    group: "report_evidence",
    sortOrder: 330,
  },
  {
    name: "client_report",
    label: "Client report",
    description:
      "The complete printable report composite: scope, findings, summary, traffic classes, queries, and pages.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    group: "report_evidence",
    sortOrder: 340,
  },
  {
    name: "report_load_error",
    label: "Report load error",
    description:
      "The visible read failure when the report could not be assembled. Empty when all required reads succeeded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 240,
    group: "report_evidence",
    sortOrder: 350,
  },
];

export const marketingReportsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/marketing-reports",
  readiness: "partial",
  readinessNote:
    "Manifest, route mapping, canonical GSC emitters, traffic-class evidence, and printable report are wired; live agent binding verification remains.",
  label: MARKETING_REPORTS_LABEL,
  urlPattern: "/marketing/reports*",
  intro: `<surface_intro>You are reading a client-ready Search Console report. Lead with its plain-language findings, then cite the exact report period and evidence. Traffic classes are canonical business-value rulings: never reclassify a keyword from its text, never hide mismatch or unclassified traffic, and never invent conversion or GA4 data this report does not load.</surface_intro>`,
  groups,
  values,
  skipBaselineValues: true,
};

export function createMarketingReportsScope(
  values: SurfaceScopePayload,
): SurfaceScopePayload {
  return values;
}
