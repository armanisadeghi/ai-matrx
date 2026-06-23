/**
 * Surface manifest — RAG Search Lab (`matrx-user/rag-search`).
 *
 * The retrieval workspace at `/rag/search`. The user searches their indexed
 * content (PDFs, notes, code) with a configurable hybrid-retrieval pipeline,
 * and the "Agent Chat" tab embeds a managed agent that calls the RAG tool
 * family (`rag_search`, `rag_search_data_store`, …) against the same scope.
 *
 * The values below describe the user's current retrieval scope so an agent
 * bound here can constrain its searches (e.g. bind `rag_search.data_store_id`
 * to the surface's `data_store_id`) and explain what it is searching over.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "query",
    label: "Search query",
    description:
      "The user's current query in the RAG search box. Empty when the box has not been used yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 300,
  },
  {
    name: "data_store_id",
    label: "Data store ID",
    description:
      "UUID of the data store the user scoped retrieval to. Empty when the user is searching all accessible content (the default 'All accessible content' selection).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
  },
  {
    name: "data_store_name",
    label: "Data store name",
    description:
      "Human-readable name of the scoped data store. Empty when no specific store is selected (searching everything).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
  },
  {
    name: "source_kinds",
    label: "Source-kind filter",
    description:
      "Array of source kinds the user limited results to, e.g. ['cld_file'], ['note'], or ['code_file']. Empty/absent when 'All' is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 330,
  },
  {
    name: "admin_bypass_acl",
    label: "Admin ACL bypass",
    description:
      "True when an admin toggled 'bypass ACL' to search across all indexed content regardless of permissions. False for normal users and normal admin sessions.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
  },
  {
    name: "rerank",
    label: "Rerank enabled",
    description:
      "Whether Cohere reranking is enabled on the retrieval pipeline. Defaults to true.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
  },
  {
    name: "multi_query",
    label: "Multi-query count",
    description:
      "Number of query variants the pipeline expands the search into (1-5). 1 means no expansion.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 360,
  },
  {
    name: "use_hyde",
    label: "HyDE expansion",
    description:
      "Whether HyDE (hypothetical-document) query expansion is enabled on the retrieval pipeline. Defaults to false.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 370,
  },
];

export const ragSearchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/rag-search",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper for the RAG Search surface. None of the values are
 * `alwaysAvailable` — the page can be in any state (no store selected, default
 * pipeline settings), so every key is optional.
 */
export function createRagSearchScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  query?: string;
  data_store_id?: string;
  data_store_name?: string;
  source_kinds?: string[];
  admin_bypass_acl?: boolean;
  rerank?: boolean;
  multi_query?: number;
  use_hyde?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
