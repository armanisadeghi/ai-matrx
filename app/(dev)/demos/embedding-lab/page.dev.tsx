// app/(dev)/demos/embedding-lab/page.dev.tsx
//
// DEV-ONLY. The Google embedding lab picks a raw embedding model client-side
// (gemini-embedding-2 / -001) and POSTs it to /google/embeddings — a model
// choice outside the mandate system. Ruled 2026-09-25 (BYPASS-CENSUS
// frontend-features): it is an internal diagnostic for inspecting vectors, not
// a product job, so it lives only on the dev demos surface and is excluded from
// the product (it was /knowledge/embeddings and /rag/embeddings, linked from
// the RAG hub). Product retrieval embeds through the server's own pipeline.
// Guarded by scripts/check-hardcoded-agents.ts (dev-only lab rule).
import { GoogleEmbeddingLab } from "@/features/rag/components/GoogleEmbeddingLab";

export default function EmbeddingLabDevPage() {
  return <GoogleEmbeddingLab />;
}
