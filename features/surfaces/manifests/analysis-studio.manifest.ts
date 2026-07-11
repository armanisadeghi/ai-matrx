/**
 * Surface manifest — PDF Analysis Studio (`matrx-user/analysis-studio`).
 *
 * Route: `/files/f/[id]/studio`. Pages, detectors, annotations, redaction.
 * Agents bound here act on the open file / current page — not the extractor's
 * scope picker. Parent: `matrx-user/pdf-extractor` (same document family).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "file_id",
    label: "File ID",
    description:
      "UUID of the `cld_files` row open in Analysis Studio. Empty when opened without a cloud file.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the `processed_documents` row linked to this file. Empty when no derivative exists yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
  },
  {
    name: "filename",
    label: "Document filename",
    description:
      "Display name of the open PDF. Empty when no document is loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 320,
  },
  {
    name: "current_page",
    label: "Current page number",
    description:
      "1-indexed page the user is viewing in the studio. Zero when unknown.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 400,
  },
  {
    name: "total_pages",
    label: "Total pages",
    description:
      "Total page count of the open PDF. Zero when unknown or unloaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
  },
  {
    name: "current_page_text",
    label: "Current page text",
    description:
      "Extracted text of the page currently in view. Empty when text is unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 420,
  },
  {
    name: "full_document_text",
    label: "Full document text",
    description:
      "Joined extracted text for the whole document when available. Can be large.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 430,
  },
];

export const analysisStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/analysis-studio",
  label: "Analysis Studio",
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
    [
      ...surfaceSpecific,
      {
        name: "selection",
        label: "Current selection",
        description:
          "Text the user has highlighted in the studio. Empty when nothing is selected.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 200,
        sortOrder: 100,
      },
      {
        name: "content",
        label: "Full document (alias)",
        description:
          "Alias of `full_document_text` for generic agents. Prefer `full_document_text`.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 12000,
        sortOrder: 9110,
      },
    ],
  ),
};

export function createAnalysisStudioScope(values: {
  file_id?: string;
  processed_document_id?: string;
  filename?: string;
  current_page?: number;
  total_pages?: number;
  current_page_text?: string;
  full_document_text?: string;
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
