// app/(core)/knowledge/extractions/admin/page.tsx
//
// Per-feature admin map for the Page Extraction feature, rendered via the
// platform primitive <FeatureAdminPage> (admin-gated, utilitarian). Single
// source of truth for every resource the extraction system owns across both
// surfaces: the PDF Studio inline panes (/tools/pdf-extractor) and the new
// dedicated Extraction Data workspace (/knowledge/extractions). When you add a
// route / component / slice / export target, append it here — the drift
// warnings on the rendered page surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const PAGE_EXTRACTION_ADMIN_MAP: FeatureAdminMap = {
  name: "Page Extraction",
  slug: "page-extraction",
  description:
    "Run an AI integration page-by-page (or in chunks) across a document and persist each structured response anchored to its source page(s). Two surfaces share one data model and one parsing rule set: the PDF Studio inline Extractions/Chunked-Runs panes (/tools/pdf-extractor) for setup + live runs, and the dedicated Extraction Data workspace (/knowledge/extractions) for full management, review, export, context tagging, and pushing to workbooks / data tables.",
  docs: [
    {
      label: "Page Extraction FEATURE.md",
      href: "/features/page-extraction/FEATURE.md",
    },
    {
      label: "Scopes (context) FEATURE.md",
      href: "/features/scopes/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/knowledge/extractions",

  routes: [
    {
      url: "/knowledge/extractions",
      label: "Extraction catalog (list)",
      description:
        "Global catalog of every extraction dataset across all sources. Search, sort, context-filter; per-row context status + 'Open' into the dataset grid. The savior list entry — replaces being trapped in the PDF Studio tab.",
      filePath: "app/(core)/knowledge/extractions/page.tsx",
      status: "Live",
      notes: [
        "Client: features/page-extraction/data-review/ExtractionCatalogClient.tsx",
        "Context filter via ContextAssignmentField (filter mode)",
      ],
    },
    {
      url: "/knowledge/extractions/<id>",
      label: "Extraction dataset (grid)",
      description:
        "Full data grid for one dataset: search, sort, column visibility, pagination, merge duplicates, inline-edit manual columns, per-row + bulk delete, run history/retry/cancel, context tagging, export, push to workbook / data table, jump to source PDF.",
      filePath: "app/(core)/knowledge/extractions/[id]/page.tsx",
      status: "Live",
      notes: [
        "Client: features/page-extraction/data-review/ExtractionDatasetClient.tsx",
      ],
    },
    {
      url: "/knowledge/extractions/admin",
      label: "Admin map (this page)",
      description:
        "The page you're reading — admin index of every page-extraction resource.",
      filePath: "app/(core)/knowledge/extractions/admin/page.tsx",
      status: "Live",
    },
    {
      url: "/tools/pdf-extractor/<id>",
      label: "PDF Studio (primary setup surface)",
      description:
        "The document workspace where extractions are configured + run: Widgets tab (one-shot agent), Chunked Runs tab (job over the whole doc), and the inline Extractions data pane. Declares the surface variable mapping.",
      filePath: "app/(core)/tools/pdf-extractor/[id]/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "ExtractionCatalogClient",
      filePath:
        "features/page-extraction/data-review/ExtractionCatalogClient.tsx",
      description:
        "Searchable / sortable / context-filterable catalog of all datasets.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ExtractionDatasetClient",
      filePath:
        "features/page-extraction/data-review/ExtractionDatasetClient.tsx",
      description:
        "The full single-dataset management grid (the centerpiece of the workspace).",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ExportMenu",
      filePath: "features/page-extraction/data-review/ExportMenu.tsx",
      description:
        "Download (CSV / XLSX / JSON) + copy (table / AI-friendly Markdown).",
      tier: "internal",
      status: "Live",
    },
    {
      name: "SendToMenu",
      filePath: "features/page-extraction/data-review/SendToMenu.tsx",
      description:
        "Discoverable header button: push the dataset to a new Workbook or Data table, then raise the open-chooser.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "OpenDestinationDialog",
      filePath:
        "features/page-extraction/data-review/OpenDestinationDialog.tsx",
      description:
        "Reusable post-create chooser — Open here / Open in new tab / Open as window (window only for window-panel-capable targets). Responsive (Drawer/Dialog).",
      tier: "internal",
      status: "Live",
    },
    {
      name: "RunsPopover",
      filePath: "features/page-extraction/data-review/RunsPopover.tsx",
      description:
        "Run history for a job — status per run, cancel in-flight, retry failed page runs.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ExtractionsPane",
      filePath: "features/page-extraction/components/ExtractionsPane.tsx",
      description:
        "Inline PDF-Studio data pane. Hosts the JobPicker + ResultsTable and the 'Full view' link out to the workspace.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ResultsTable",
      filePath: "features/page-extraction/components/ResultsTable.tsx",
      description:
        "Dynamic results table. Uses the canonical normalizeResultRows / inferColumnsFromRows; shows a recovery banner when client-side normalization fires.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "JobPicker",
      filePath: "features/page-extraction/components/JobPicker.tsx",
      description: "Template/job selector for the inline Extractions pane.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "ChunksTab",
      filePath: "features/page-extraction/components/ChunksTab.tsx",
      description:
        "Chunked Runs UI — configure + launch a job over the whole document.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "SchemaEditor",
      filePath: "features/page-extraction/components/SchemaEditor.tsx",
      description: "Edit the JSON output schema that results conform to.",
      tier: "internal",
      status: "Live",
    },
    {
      name: "SavedJobsList",
      filePath: "features/page-extraction/components/SavedJobsList.tsx",
      description: "Saved extraction templates list.",
      tier: "internal",
      status: "Live",
    },
  ],

  apiRoutes: [
    {
      url: "POST /page-extraction/runs/stream (aidream)",
      method: "POST",
      description:
        "NDJSON SSE fan-out across pages/chunks. Python backend, not a Next route.",
      filePath: "features/page-extraction/api/stream.ts (client)",
    },
    {
      url: "POST /page-extraction/page-runs/{id}/retry (aidream)",
      method: "POST",
      description: "Retry a single failed chunk. Python backend.",
      filePath: "features/page-extraction/api/runs.ts (client)",
    },
    {
      url: "POST /page-extraction/runs/{id}/cancel (aidream)",
      method: "POST",
      description: "Cancel an in-flight run. Python backend.",
      filePath: "features/page-extraction/api/runs.ts (client)",
    },
  ],

  reduxSlices: [
    {
      name: "pageExtractionSlice",
      filePath: "features/page-extraction/redux/pageExtractionSlice.ts",
      description:
        "Jobs cache, active run + per-page-run statuses, live results buffer.",
    },
  ],

  relatedFeatures: [
    {
      name: "Scopes (Context)",
      description:
        "Datasets are taggable entities (entity_type 'page_extraction_job') via ctx_scope_assignments. The catalog filters by context and shows per-row status.",
    },
    {
      name: "Files / PDF",
      description:
        "Extractions are anchored to a source document (file_id, source_pages). The grid links back to the PDF Studio for the source.",
    },
    {
      name: "Workbooks & Data Tables (udt_)",
      description:
        "Export targets. ExportMenu pushes a dataset to a new udt_workbook (Univer snapshot) or a typed udt_dataset.",
    },
  ],
};

export default function PageExtractionAdminPage() {
  return <FeatureAdminPage map={PAGE_EXTRACTION_ADMIN_MAP} />;
}
