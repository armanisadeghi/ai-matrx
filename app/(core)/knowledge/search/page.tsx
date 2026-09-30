import { Suspense } from "react";
import { RagSearchExperience } from "@/features/rag/components/search/RagSearchExperience";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

/**
 * `/knowledge/search` (and `/rag/search`, via the `/rag/:path*` config redirect) —
 * the Search Lab, live for every signed-in user. A kept user page by Arman's
 * ruling (2026-09-29): "the single most useful user UI for testing RAG so they
 * can understand how our RAG system works and know how to use RAG effectively".
 * Search, Agent Simulation, Agent Chat and Diagnostics all run on the USER lane
 * (RLS sees only the caller's own stores); the admin lab
 * (`/administration/knowledge/search-lab`) is the same component on the admin
 * lane, where the ACL bypass and the super-admin inventory twins appear.
 * Deep links: `?q=`, `?store_id=`, `?tab=`.
 */
export const metadata = {
  title: "Search Lab · Knowledge",
  description: "Test retrieval against your knowledge: see how it is found, ranked and explained.",
};

export default async function SearchLabPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
      <RagSearchExperience />
    </Suspense>
  );
}
