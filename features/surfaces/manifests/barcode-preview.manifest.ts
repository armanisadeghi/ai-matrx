/**
 * Surface manifest for the browser barcode preview at `/print/barcodes`.
 *
 * This is a read-only preview surface: the human controls remain the source
 * of truth, while the canonical context menu can act on the current barcode
 * values and preview state without inventing a printer-specific agent job.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValueGroup } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const BARCODE_PREVIEW_SURFACE_NAME = "matrx-user/barcode-preview" as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "barcode_input",
    label: "Barcode input",
    sortOrder: 100,
    description: "The selected symbology and value currently being previewed.",
  },
  {
    key: "preview_state",
    label: "Preview state",
    sortOrder: 200,
    description: "Validation and rendering state for the current barcode preview.",
  },
];

export const barcodePreviewManifest: SurfaceManifest = {
  surfaceName: BARCODE_PREVIEW_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Runtime wiring and focused source checks are complete, and the live manifest mirror is synchronized; independent browser certification remains outstanding.",
  label: "Barcode Preview",
  urlPattern: "/print/barcodes",
  intro: `<surface_intro>
You are on the Barcode Preview page, where the user selects a barcode symbology and edits the value that will be rendered for printing or scanning. barcode_value is the human-entered input; normalized_value is the validated retail value when check-digit normalization succeeds; preview_svg is the generated browser preview and is provided only for explicit inspection.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    [
      {
        name: "symbology",
        label: "Barcode symbology",
        description: "The selected barcode standard. Always populated because the preview starts with Code 128 selected.",
        valueType: "string",
        alwaysAvailable: true,
        typicalCharCount: 8,
        group: "barcode_input",
        sortOrder: 100,
      },
      {
        name: "barcode_value",
        label: "Barcode value",
        description: "The value currently typed into the barcode field. Always populated; it may be empty while the user edits it.",
        valueType: "string",
        alwaysAvailable: true,
        typicalCharCount: 32,
        group: "barcode_input",
        sortOrder: 110,
      },
      {
        name: "normalized_value",
        label: "Normalized value",
        description: "The validated value sent to the barcode generator. Empty when the current input is invalid.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 32,
        group: "barcode_input",
        sortOrder: 120,
      },
      {
        name: "is_valid",
        label: "Input is valid",
        description: "Whether the current value passed barcode normalization for the selected symbology. Always populated as a boolean.",
        valueType: "boolean",
        alwaysAvailable: true,
        typicalCharCount: 5,
        group: "preview_state",
        sortOrder: 200,
      },
      {
        name: "preview_status",
        label: "Preview status",
        description: "The current preview lifecycle: invalid, rendering, ready, or failed. Always populated.",
        valueType: "string",
        alwaysAvailable: true,
        typicalCharCount: 10,
        group: "preview_state",
        sortOrder: 210,
      },
      {
        name: "render_error",
        label: "Render error",
        description: "The barcode renderer's error message when generation fails. Empty when there is no rendering error.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 120,
        autoContext: false,
        group: "preview_state",
        sortOrder: 220,
      },
      {
        name: "preview_svg",
        label: "Preview SVG",
        description: "The generated inline SVG markup for the current valid barcode. Empty before generation completes or when the value is invalid.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 1800,
        autoContext: false,
        group: "preview_state",
        sortOrder: 230,
      },
    ],
  ),
};

export function createBarcodePreviewScope(values: {
  symbology: string;
  barcode_value: string;
  normalized_value?: string;
  is_valid: boolean;
  preview_status: string;
  render_error?: string;
  preview_svg?: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
