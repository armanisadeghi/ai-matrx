/**
 * /rag/search — single-page RAG search.
 * Deep-link params: ?q=<query>&store_id=<uuid>
 */

import { RagSearchPage } from "@/features/rag/components/search/RagSearchPage";

export default function Page() {
  return <RagSearchPage />;
}
