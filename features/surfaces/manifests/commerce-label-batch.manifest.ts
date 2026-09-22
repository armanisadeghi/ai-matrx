import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const COMMERCE_LABEL_BATCH_SURFACE_NAME =
  "matrx-user/commerce-label-batch";
const groups: SurfaceValueGroup[] = [
  { key: "batch", label: "Label batch", sortOrder: 100 },
  { key: "codes", label: "Codes table", sortOrder: 200 },
];
const values: SurfaceValue[] = [
  {
    name: "batch_id",
    label: "Batch ID",
    description: "Current label batch identity.",
    valueType: "string",
    alwaysAvailable: true,
    group: "batch",
    sortOrder: 100,
    typicalCharCount: 120,
  },
  {
    name: "label_batch",
    label: "Label batch",
    description: "Loaded print batch metadata.",
    valueType: "object",
    alwaysAvailable: false,
    autoContext: false,
    group: "batch",
    sortOrder: 110,
    typicalCharCount: 120,
  },
  {
    name: "label_codes",
    label: "Label codes",
    description: "Complete code list for the loaded batch, in mint order.",
    valueType: "array",
    alwaysAvailable: false,
    autoContext: false,
    group: "codes",
    sortOrder: 200,
    typicalCharCount: 120,
  },
  {
    name: "codes_table_query",
    label: "Codes table query",
    description: "Live canonical table search, column filters, sort, and page.",
    valueType: "object",
    alwaysAvailable: true,
    group: "codes",
    sortOrder: 210,
    typicalCharCount: 120,
  },
  {
    name: "codes_loaded_count",
    label: "Loaded codes",
    description: "Complete code count loaded for this batch.",
    valueType: "number",
    alwaysAvailable: true,
    group: "codes",
    sortOrder: 220,
    typicalCharCount: 120,
  },
];
export const commerceLabelBatchManifest: SurfaceManifest = {
  surfaceName: COMMERCE_LABEL_BATCH_SURFACE_NAME,
  label: "Label batch",
  urlPattern: "/commerce/labels/:batchId",
  readiness: "partial",
  readinessNote:
    "Runtime scope emits the live batch and canonical codes table. This page has no fixed agent role or agent write contract.",
  groups,
  values: mergeBaselineValues(pickBaseline("context"), values),
};
export function createCommerceLabelBatchScope(values: {
  batch_id: string;
  codes_table_query: object;
  codes_loaded_count: number;
  label_batch?: object;
  label_codes?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
