import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { TopicsListPage } from "@/features/research/browse/TopicsListPage";

export default async function ResearchTopicsPage() {
  // Guests bounce to the public `/research` marketing landing — the topics
  // list is a signed-in workspace (an empty shell with a New button that can
  // only fail is worse than the landing).
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect("/research");
  }

  return <TopicsListPage />;
}
