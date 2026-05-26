import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import TopicList from "@/features/research/components/landing/TopicList";

export default function ResearchTopicsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between w-full">
          <Link
            href="/research"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Research home"
          >
            <ChevronLeft className="h-4 w-4" />
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
