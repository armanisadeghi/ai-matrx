/**
 * Surface manifest — Document Scanner (`matrx-user/scanner`).
 *
 * Route: `/tools/scanner`. Capture or import pages → assemble a PDF → hand
 * off to the extractor pipeline. Agents bound here act on the in-progress
 * scan (page count, title) or the saved file after processing.
 * Parent: `matrx-user/pdf-extractor`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "scan_title",
    label: "Scan title",
    description:
      "User-editable title of the scan session. Empty before the user names it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
  },
  {
    name: "scan_page_count",
    label: "Scan page count",
    description:
      "Number of pages currently in the scan review list. Zero when empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 310,
  },
  {
    name: "file_id",
    label: "Saved file ID",
    description:
      "UUID of the cloud file created after save. Empty until the scan is saved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the processed-document derivative after pipeline handoff. Empty until processing completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 330,
  },
  {
    name: "filename",
    label: "Output filename",
    description:
      "Filename of the saved PDF (often derived from scan_title). Empty before save.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 340,
  },
];

export const scannerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scanner",
  readiness: "partial",
  readinessNote: "No groups; completeness not audited",
  inheritsFrom: "matrx-user/pdf-extractor",
  label: "Scanner",
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
    surfaceSpecific,
  ),
};

export function createScannerScope(values: {
  scan_page_count: number;
  scan_title?: string;
  file_id?: string;
  processed_document_id?: string;
  filename?: string;
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
