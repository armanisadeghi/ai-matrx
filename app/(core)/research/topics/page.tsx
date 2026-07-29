import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import TopicList from "@/features/research/components/landing/TopicList";

export default async function ResearchTopicsPage() {
  // Guests bounce to the public `/research` marketing landing — the topics
  // list is a signed-in workspace (an empty shell with a New button that can
  // only fail is worse than the landing).
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/research");
  }

  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between w-full min-w-0">
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Back to research"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="font-medium">Research</span>
          </Link>
          <Link
            href="/research/topics/new"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="New research topic"
          >
            <Plus className="h-4 w-4" />
          </Link>
        </div>
      </PageHeader>
      <TopicList />
    </>
  );
}
