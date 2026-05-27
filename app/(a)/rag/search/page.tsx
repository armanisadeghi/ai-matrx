/**
 * /rag/search — multi-tab RAG Search Lab.
 *
 * Tabs:
 *   ?tab=search        (default) clean user search
 *   ?tab=agent-sim     full pipeline trace / score breakdown / prompt preview
 *   ?tab=agent-chat    Claude agent with rag_search as a tool, fully transparent
 *   ?tab=diagnostics   per-user content inventory & ACL routes
 *
 * Deep-link params:
 *   ?q=<query>&store_id=<uuid>&tab=<tab>
 */

import { RagSearchExperience } from "@/features/rag/components/search/RagSearchExperience";

export default function Page() {
  return <RagSearchExperience />;
}
