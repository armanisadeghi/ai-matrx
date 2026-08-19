// app/(core)/knowledge/admin/page.tsx
//
// Per-feature admin map for the Knowledge ecosystem. Renders via the platform
// primitive `<FeatureAdminPage>` (admin gated, utilitarian). Single source
// of truth for every Knowledge-owned resource: the /knowledge route family, the Shared
// Knowledge admin console, hooks/RPC surfaces, aidream endpoints, and demos.
// When you add a rag route / panel / hook / RPC, update this file — the
// drift warnings on the rendered page surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const RAG_ADMIN_MAP: FeatureAdminMap = {
  name: "Knowledge",
  slug: "rag",
  description:
    "Retrieval-augmented generation: data stores (collections of files/notes/transcripts), the Matrx Library (processed documents, pages, chunks), semantic search, ingest pipelines, and the Shared Knowledge Resources issuance system (library grants to industries / organizations / everyone). Reads are direct-to-Supabase via rag.fn_* RPCs; ingest/search compute rides aidream.",
  docs: [
    { label: "Knowledge FEATURE.md", href: "/features/rag/FEATURE.md" },
    {
      label: "Industries FEATURE.md",
      href: "/features/industries/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/knowledge",

  routes: [
    {
      url: "/knowledge",
      label: "Knowledge home",
      description:
        "Landing page surfacing live state across data stores, library, and search.",
      filePath: "app/(core)/knowledge/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/data-stores",
      label: "Data stores",
      description:
        "Create/manage rag.data_stores collections, members, bindings; super-admins publish library stores from here.",
      filePath: "app/(core)/knowledge/data-stores/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/library",
      label: "Library",
      description:
        "Processed documents: 'where did my content go' list with per-document detail ([id]).",
      filePath: "app/(core)/knowledge/library/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/search",
      label: "Search",
      description:
        "Semantic/Knowledge search over entitled stores (requires aidream — secrets + rag internals).",
      filePath: "app/(core)/knowledge/search/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/repositories",
      label: "Repositories",
      description: "Code repository ingestion surfaces.",
      filePath: "app/(core)/knowledge/repositories/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/flow",
      label: "Flow",
      description: "Pipeline/flow visualization for ingest processing.",
      filePath: "app/(core)/knowledge/flow/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/viewer",
      label: "Viewer",
      description:
        "Single-document viewer (pages, chunks, extractions) — lives at /knowledge/viewer/[id].",
      filePath: "app/(core)/knowledge/viewer/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/visualization",
      label: "Visualization",
      description: "Embedding/chunk visualization.",
      filePath: "app/(core)/knowledge/visualization/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/library-catalog",
      label: "Library catalog",
      description:
        "Tenant-facing Shared Knowledge catalog: discoverable library stores with per-caller entitlement/provenance chips and org opt-in (P3).",
      filePath: "app/(core)/knowledge/library-catalog/page.tsx",
      status: "Live",
    },
    {
      url: "/knowledge/admin",
      label: "Admin map (this page)",
      description: "The FeatureAdminMap for the Knowledge ecosystem.",
      filePath: "app/(core)/knowledge/admin/page.tsx",
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
      description: "Copy-for-AI window over Knowledge search/document results.",
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
        "Tenant-facing catalog of discoverable library stores (subscribe/unsubscribe). P3 grows this into /knowledge/library-catalog.",
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
        "Tenant self-serve 'process this file for Knowledge' (aidream /knowledge/ingest, streaming).",
    },
    {
      name: "useRagSearch",
      filePath: "features/rag/hooks/useRagSearch.ts",
      description: "Knowledge search calls (aidream /knowledge/search).",
    },
    {
      name: "library-ingest API client",
      filePath: "features/rag/api/library-ingest.ts",
      description:
        "Curation ingest client for POST /knowledge/library/stores/{id}/ingest (P1 contract; 501-aware).",
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
      url: "{aidream}/knowledge/ingest — also /knowledge/ingest/stream",
      method: "POST",
      description:
        "Tenant ingest for a source (cld_file / note / transcript / …); streaming variant emits per-stage progress.",
    },
    {
      url: "{aidream}/knowledge/library/stores/{store_id}/ingest",
      method: "POST",
      description:
        "P1 curation ingest (super-admin): system-owned library ingest. Published as a 501 stub until P1-full lands.",
    },
    {
      url: "{aidream}/knowledge/search",
      method: "POST",
      description:
        "Semantic search (needs Python: provider secrets + unexposed rag internals).",
    },
    {
      url: "{aidream}/knowledge/data-stores/* + /knowledge/library-catalog + /knowledge/library/*",
      method: "Multiple",
      description:
        "HTTP mirrors of the rag.fn_* RPC surface for non-Supabase clients (extension/external) — the FE uses the direct RPCs, never these.",
    },
  ],

  demoRoutes: [
    {
      url: "/demos/tool-viz/knowledge-tools",
      label: "Knowledge tool-viz demo",
      description: "Tool-call visualization demo for Knowledge tools.",
      filePath: "app/(dev)/demos/tool-viz/knowledge-tools",
      status: "Demo only",
    },
    {
      url: "/demos/knowledge-hit-card",
      label: "RagHitCard fixtures",
      description:
        "The canonical hit card (expanded + compact) rendered from fixtures — no indexed content or retrieval backend needed. Use it for card layout work, especially at 375px.",
      filePath: "app/(dev)/demos/knowledge-hit-card",
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
