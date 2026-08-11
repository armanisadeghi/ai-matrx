import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  getTopicServer,
  getTopicOverviewServer,
  getResearchIntentsServer,
} from "@/features/research/service/server";
import { IntentBadge } from "@/features/research/components/shared/IntentBadge";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
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
      title: "Research topic",
      description: "Research topics in AI Matrx.",
      letter: "Rs",
    });
  }

  const topic = await getTopicServer(topicId);
  // An empty read does not tell us the topic is gone — the tab title must not
  // say so. The page body resolves the real reason via <AccessGate>.
  if (!topic) {
    return createDynamicRouteMetadata("/research", {
      title: "Research topic",
      description: "Research topics in AI Matrx.",
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

  const [topic, overview, intents] = await Promise.all([
    getTopicServer(topicId),
    getTopicOverviewServer(topicId),
    getResearchIntentsServer(),
  ]);

  // Was `notFound()`. A server read returning nothing means denied, deleted,
  // never-existed, or an expired session — four different answers that a 404
  // flattened into one wrong one. The gate asks the platform which it is and
  // offers a request when the topic is real and someone else's.
  if (!topic) {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <AccessGate
          token="research_topic"
          id={topicId}
          fallbackHref="/research/topics"
          fallbackLabel="All topics"
        />
      </div>
    );
  }

  const intentLabel = topic.intent_key
    ? (intents.find((i) => i.key === topic.intent_key)?.label ?? null)
    : null;

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
          <IntentBadge label={intentLabel} className="shrink-0" />
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
