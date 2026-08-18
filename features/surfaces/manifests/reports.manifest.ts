/**
 * Surface manifest — Reports (`matrx-user/reports`).
 *
 * `/reports` (the module landing over the report registry) and each report's
 * own route, `/reports/agent-drift` being the first. Reports are read-only
 * analyses over platform data; the registry (`features/reports/registry.ts`) is
 * metadata-only, so adding a report is an entry plus a route.
 *
 * Declared 2026-08-17: the reports module had no surface declaration at all.
 *
 * Curated groups (band 0-899):
 *   report_location  Which report is open
 *   report_scope     What the open report is computed over
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
    key: "report_location",
    label: "Report",
    sortOrder: 100,
    description: "Which report the user has open, if any.",
  },
  {
    key: "report_scope",
    label: "Report scope",
    sortOrder: 200,
    description: "What the open report is computed over.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "report_slug",
    label: "Report slug",
    description:
      'Slug of the open report (e.g. "agent-drift"). Empty on the reports landing, where no single report is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 100,
    group: "report_location",
  },
  {
    name: "report_title",
    label: "Report title",
    description:
      "Display title of the open report. Empty on the landing route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 110,
    group: "report_location",
  },
  {
    name: "available_report_slugs",
    label: "Available reports",
    description:
      "Slugs of every report in the registry that is live for this user, in landing order. Always populated. Lets an agent point at a report that exists rather than inventing one.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 120,
    group: "report_location",
  },
  {
    name: "report_is_admin_scope",
    label: "Platform-wide scope",
    description:
      "True when the open report is showing its platform-wide admin variant rather than the user's own data. Always populated — false on the user-scoped view and on the landing.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 200,
    group: "report_scope",
  },
  {
    name: "report_row_count",
    label: "Report row count",
    description:
      "How many rows the open report currently resolves to. Absent on the landing route or before the report has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "report_scope",
  },
];

export const reportsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/reports",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared 2026-08-17 to close the undeclared /reports module. Per-report data is not declared (only Agent Drift exists today), and no runtime emitter is wired.",
  label: "Reports",
  urlPattern: "/reports",
  intro: `<surface_intro>
You are in Reports: read-only analyses over platform data. The landing lists every report that exists; a report route shows one of them.
report_slug is empty on the landing — use available_report_slugs rather than guessing at a report that may not exist. report_is_admin_scope matters: when it is true the numbers are platform-wide, not the user's own, and must not be described as "your" data.
Reports do not change anything; propose actions elsewhere, not here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createReportsScope(values: {
  available_report_slugs: string[];
  report_is_admin_scope: boolean;
  selection?: string;
  context?: Record<string, unknown>;
  report_slug?: string;
  report_title?: string;
  report_row_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
