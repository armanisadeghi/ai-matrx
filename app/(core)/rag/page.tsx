/**
 * /knowledge — Knowledge home.
 *
 * Landing page that surfaces live state across data stores, library,
 * and search. The previous /knowledge had no index page so the route would
 * 404; this is the canonical entry point.
 */

import { RagHomePage } from "@/features/rag/components/RagHomePage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function Page() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <RagHomePage />;
}
