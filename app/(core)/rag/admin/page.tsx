// app/(core)/rag/admin/page.tsx
//
// Per-feature admin map for the RAG ecosystem. Renders via the platform
// primitive `<FeatureAdminPage>` (admin gated, utilitarian). Single source
// of truth for every RAG-owned resource: the /rag route family, the Shared
// Knowledge admin console, hooks/RPC surfaces, aidream endpoints, and demos.
// When you add a rag route / panel / hook / RPC, update this file — the
// drift warnings on the rendered page surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const RAG_ADMIN_MAP: FeatureAdminMap = {
  name: "RAG",
  slug: "rag",
  description:
    "Retrieval-augmented generation: data stores (collections of files/notes/transcripts), the Matrx Library (processed documents, pages, chunks), semantic search, ingest pipelines, and the Shared Knowledge Resources issuance system (library grants to industries / organizations / everyone). Reads are direct-to-Supabase via rag.fn_* RPCs; ingest/search compute rides aidream.",
  docs: [
    { label: "RAG FEATURE.md", href: "/features/rag/FEATURE.md" },
    {
      label: "Industries FEATURE.md",
      href: "/features/industries/FEATURE.md",
    },
    {
      label: "Shared Knowledge handoff",
      href: "/docs/handoffs/shared-knowledge-access.md",
    },
    {
      label: "Shared Knowledge master plan (P1-P4)",
      href: "/docs/proposals/shared-knowledge-projects/README.md",
    },
  ],
  routeScanPath: "app/(core)/rag",

  routes: [
    {
      url: "/rag",
      label: "Knowledge home",
      description:
        "Landing page surfacing live state across data stores, library, and search.",
      filePath: "app/(core)/rag/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/data-stores",
      label: "Data stores",
      description:
        "Create/manage rag.data_stores collections, members, bindings; super-admins publish library stores from here.",
      filePath: "app/(core)/rag/data-stores/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/library",
      label: "Library",
      description:
        "Processed documents: 'where did my content go' list with per-document detail ([id]).",
      filePath: "app/(core)/rag/library/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/search",
      label: "Search",
      description:
        "Semantic/RAG search over entitled stores (requires aidream — secrets + rag internals).",
      filePath: "app/(core)/rag/search/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/repositories",
      label: "Repositories",
      description: "Code repository ingestion surfaces.",
      filePath: "app/(core)/rag/repositories/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/flow",
      label: "Flow",
      description: "Pipeline/flow visualization for ingest processing.",
      filePath: "app/(core)/rag/flow/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/viewer",
      label: "Viewer",
      description:
        "Single-document viewer (pages, chunks, extractions) — lives at /rag/viewer/[id].",
      filePath: "app/(core)/rag/viewer/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/visualization",
      label: "Visualization",
      description: "Embedding/chunk visualization.",
      filePath: "app/(core)/rag/visualization/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/library-catalog",
      label: "Library catalog",
      description:
        "Tenant-facing Shared Knowledge catalog: discoverable library stores with per-caller entitlement/provenance chips and org opt-in (P3).",
      filePath: "app/(core)/rag/library-catalog/page.tsx",
      status: "Live",
    },
    {
      url: "/rag/admin",
      label: "Admin map (this page)",
      description: "The FeatureAdminMap for the RAG ecosystem.",
      filePath: "app/(core)/rag/admin/page.tsx",
      status: "Live",
    },
    {
      url: "/administration/shared-knowledge",
      label: "Shared Knowledge console",
      description:
        "Super-admin issuance cockpit: industry taxonomy CRUD, library grants (all three audiences), curation ingest, access explorer.",
      filePath: "app/(admin)/administration/shared-knowledge/page.tsx",
      status: "Live",
      notes: [
        "Mutations via industry_* + rag.library_grant_* RPC families only",
        "Directory reads server-loaded behind the (admin) super-admin gate",
      ],
    },
  ],

  windowPanels: [
    {
      overlayId: "ragAiCopyWindow",
      description: "Copy-for-AI window over RAG search/document results.",
    },
  ],

  components: [
    {
      name: "RagHomePage",
      filePath: "features/rag/components/RagHomePage.tsx",
      description: "Knowledge home dashboard.",
    },
    {
      name: "DataStoresPage",
      filePath: "features/rag/components/data-stores/DataStoresPage.tsx",
      description: "Data-store management workspace.",
    },
    {
      name: "DataStorePublishPanel",
      filePath:
        "features/rag/components/data-stores/DataStorePublishPanel.tsx",
      description:
        "Publish a library store to an audience — industry / organization / everyone (Shared Knowledge grants).",
      notes: ["Super-admin only; the ONE grant-mutation UI"],
    },
    {
      name: "DataStoreBindPanel",
      filePath: "features/rag/components/data-stores/DataStoreBindPanel.tsx",
      description: "Bind members (files/notes/transcripts) into a store.",
    },
    {
      name: "LibraryCatalogPane",
      filePath: "features/rag/components/data-stores/LibraryCatalogPane.tsx",
      description:
        "Tenant-facing catalog of discoverable library stores (subscribe/unsubscribe). P3 grows this into /rag/library-catalog.",
    },
    {
      name: "SharedKnowledgeAdminClient",
      filePath:
        "features/admin/shared-knowledge/components/SharedKnowledgeAdminClient.tsx",
      description:
        "Client shell of the Shared Knowledge console (industries / stores & grants / ingest / access explorer tabs).",
    },
    {
      name: "useDataStoreGrants",
      filePath: "features/rag/hooks/useDataStoreGrants.ts",
      description:
        "Grants list + publish/revoke via rag.fn_list_data_store_grants / rag.library_grant_publish / _revoke (gate: super-admin OR store owner). Also exports fetchDataStoreGrants for batch consumers.",
    },
    {
      name: "useDataStores",
      filePath: "features/rag/hooks/useDataStores.ts",
      description:
        "Caller-visible stores via rag.fn_list_user_data_stores / fn_get_user_data_store; writes RLS-gated.",
    },
    {
      name: "useLibraryCatalog",
      filePath: "features/rag/hooks/useLibraryCatalog.ts",
      description:
        "Discoverable library catalog via rag.fn_list_library_catalog (+ per-caller entitlement chips) and library_subscribe / _unsubscribe.",
    },
    {
      name: "useLibrary",
      filePath: "features/rag/hooks/useLibrary.ts",
      description:
        "Library documents list/detail/pages/chunks + delete family via rag.fn_* RPCs.",
    },
    {
      name: "useFileIngest",
      filePath: "features/rag/hooks/useFileIngest.ts",
      description:
        "Tenant self-serve 'process this file for RAG' (aidream /rag/ingest, streaming).",
    },
    {
      name: "useRagSearch",
      filePath: "features/rag/hooks/useRagSearch.ts",
      description: "RAG search calls (aidream /rag/search).",
    },
    {
      name: "library-ingest API client",
      filePath: "features/rag/api/library-ingest.ts",
      description:
        "Curation ingest client for POST /rag/library/stores/{id}/ingest (P1 contract; 501-aware).",
    },
    {
      name: "Industries service + hooks",
      filePath: "features/industries/service.ts",
      description:
        "Taxonomy reads (iam.industries / org_industries) + writes via industry_upsert / industry_assign_org / industry_unassign_org RPCs.",
    },
  ],

  apiRoutes: [
    {
      url: "{aidream}/rag/ingest — also /rag/ingest/stream",
      method: "POST",
      description:
        "Tenant ingest for a source (cld_file / note / transcript / …); streaming variant emits per-stage progress.",
    },
    {
      url: "{aidream}/rag/library/stores/{store_id}/ingest",
      method: "POST",
      description:
        "P1 curation ingest (super-admin): system-owned library ingest. Published as a 501 stub until P1-full lands.",
    },
    {
      url: "{aidream}/rag/search",
      method: "POST",
      description:
        "Semantic search (needs Python: provider secrets + unexposed rag internals).",
    },
    {
      url: "{aidream}/rag/data-stores/* + /rag/library-catalog + /rag/library/*",
      method: "Multiple",
      description:
        "HTTP mirrors of the rag.fn_* RPC surface for non-Supabase clients (extension/external) — the FE uses the direct RPCs, never these.",
    },
  ],

  demoRoutes: [
    {
      url: "/demos/tool-viz/rag-tools",
      label: "RAG tool-viz demo",
      description: "Tool-call visualization demo for RAG tools.",
      filePath: "app/(dev)/demos/tool-viz/rag-tools",
      status: "Demo only",
    },
    {
      url: "/demos/rag-hit-card",
      label: "RagHitCard fixtures",
      description:
        "The canonical hit card (expanded + compact) rendered from fixtures — no indexed content or retrieval backend needed. Use it for card layout work, especially at 375px.",
      filePath: "app/(dev)/demos/rag-hit-card",
      status: "Demo only",
    },
  ],

  relatedFeatures: [
    {
      name: "Files",
      description:
        "Every library source is a cloud file; ingest picks/uploads through the canonical fileHandler.",
    },
    {
      name: "Sharing & Access",
      description:
        "Library grants ride the platform spine (platform.associations → reachability → iam.has_access_for); grants issue viewer only.",
    },
    {
      name: "Organizations",
      description:
        "Industry membership (iam.org_industries) is what routes industry-audience grants to orgs; org-admin self-serve join lives in org settings.",
    },
  ],
};

export default function RagAdminPage() {
  return <FeatureAdminPage map={RAG_ADMIN_MAP} />;
}
