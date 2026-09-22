import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
export const ADMIN_LIMITS_SURFACE_NAME = "matrx-admin/limits";
const groups: SurfaceValueGroup[] = [
  { key: "addons", label: "Account add-ons", sortOrder: 100 },
];
const values: SurfaceValue[] = [
  {
    name: "addons_loaded",
    label: "Loaded account add-ons",
    description:
      "Complete decorated account-add-on rows currently loaded, including their resolved plan allowance and raise calculation.",
    valueType: "array",
    alwaysAvailable: true,
    autoContext: false,
    group: "addons",
    sortOrder: 100,
    typicalCharCount: 120,
  },
  {
    name: "processed_addons",
    label: "Filtered account add-ons",
    description: "Decorated rows matching the current canonical table view.",
    valueType: "array",
    alwaysAvailable: true,
    autoContext: false,
    group: "addons",
    sortOrder: 115,
    typicalCharCount: 120,
  },
  {
    name: "processed_addons_count",
    label: "Filtered add-ons",
    description: "Count of decorated rows matching the current canonical table view.",
    valueType: "number",
    alwaysAvailable: true,
    group: "addons",
    sortOrder: 118,
    typicalCharCount: 120,
  },
  {
    name: "addons_loaded_count",
    label: "Loaded add-ons",
    description: "Count of complete loaded add-on rows.",
    valueType: "number",
    alwaysAvailable: true,
    group: "addons",
    sortOrder: 110,
    typicalCharCount: 120,
  },
  {
    name: "addons_table_query",
    label: "Add-ons table query",
    description:
      "Live canonical add-ons table search, column filters, sort, and page.",
    valueType: "object",
    alwaysAvailable: true,
    group: "addons",
    sortOrder: 120,
    typicalCharCount: 120,
  },
];
export const adminLimitsManifest: SurfaceManifest = {
  surfaceName: ADMIN_LIMITS_SURFACE_NAME,
  label: "Limits and Knobs",
  urlPattern: "/administration/users/limits",
  readiness: "partial",
  readinessNote:
    "Runtime scope emits the canonical add-ons table. This tab has no fixed agent role or agent write contract.",
  groups,
  values: mergeBaselineValues(pickBaseline("context"), values),
};
export function createAdminLimitsScope(values: {
  addons_loaded: unknown[];
  addons_loaded_count: number;
  processed_addons: unknown[];
  processed_addons_count: number;
  addons_table_query: object;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
