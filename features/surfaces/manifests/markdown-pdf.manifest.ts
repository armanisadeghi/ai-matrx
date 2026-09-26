/**
 * Surface manifest for the browser Markdown-to-PDF utility at
 * `/print/documents`.
 *
 * The printer remains a fixed browser utility: this surface exposes the live
 * authored markdown to the canonical agent context menu without inventing an
 * agent role or a persistence/write path.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const MARKDOWN_PDF_SURFACE_NAME = "matrx-user/markdown-pdf" as const;

const groups: SurfaceValueGroup[] = [
  {
    key: "pdf_status",
    label: "PDF status",
    sortOrder: 200,
    description: "Whether the browser is currently generating the PDF.",
  },
];

export const markdownPdfManifest: SurfaceManifest = {
  surfaceName: MARKDOWN_PDF_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "",
  readiness: "partial",
  readinessNote:
    "Runtime wiring and focused source checks are complete; the live manifest mirror is synchronized and browser certification remains outstanding.",
  label: "Markdown to PDF",
  urlPattern: "/print/documents",
  intro: `<surface_intro>
You are on the Markdown to PDF page, where the user edits markdown and downloads a styled PDF generated in the browser. content is the complete live markdown document; pdf_status says whether PDF generation is currently running. The printer is a browser utility and does not persist the document.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "content", "context"), [
    {
      name: "pdf_status",
      label: "PDF status",
      description:
        "Whether PDF generation is idle or running. Always populated; it is `generating` only while the download is being prepared.",
      valueType: "string",
      alwaysAvailable: true,
      typicalCharCount: 10,
      group: "pdf_status",
      sortOrder: 200,
    },
  ]),
};

export function createMarkdownPdfScope(values: {
  content: string;
  pdf_status: "idle" | "generating";
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return {
    ...values,
    context: values.context ?? { pdf_status: values.pdf_status },
  };
}
