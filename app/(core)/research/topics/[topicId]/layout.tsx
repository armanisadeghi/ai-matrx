import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  getTopicServer,
  getTopicOverviewServer,
} from "@/features/research/service/server";
import ResearchTopicShell from "./ResearchTopicShell";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  if (!UUID_RE.test(topicId)) {
    return createDynamicRouteMetadata("/research", {
      title: "Topic Not Found",
      description: "The requested research topic could not be found.",
      letter: "Rs",
    });
  }

  const topic = await getTopicServer(topicId);
  if (!topic) {
    return createDynamicRouteMetadata("/research", {
      title: "Topic Not Found",
      description: "The requested research topic could not be found.",
      letter: "Rs",
    });
  }

  return createDynamicRouteMetadata("/research", {
    title: topic.name,
    description:
      topic.description?.slice(0, 120) || `Research topic: ${topic.name}`,
    letter: "Rs",
  });
}

export default async function ResearchTopicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;

  if (!UUID_RE.test(topicId)) {
    notFound();
  }

  const [topic, overview] = await Promise.all([
    getTopicServer(topicId),
    getTopicOverviewServer(topicId),
  ]);

  if (!topic) {
    notFound();
  }

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 w-full min-w-0">
          <Link
            href="/research/topics"
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium text-foreground truncate min-w-0">
            {topic.name}
          </span>
        </div>
      </PageHeader>
      <div className="flex h-dvh flex-col bg-textured">
        {/* Spacer so the sidebar and content start below the glass header */}
        <div
          className="shrink-0"
          style={{ height: "var(--shell-header-h, 2.75rem)" }}
        />
        <div className="flex-1 min-h-0 w-full">
          <ResearchTopicShell
            topicId={topicId}
            initialData={{ topic, progress: overview }}
          >
            {children}
          </ResearchTopicShell>
        </div>
      </div>
    </>
  );
}
