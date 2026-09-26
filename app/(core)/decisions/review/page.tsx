import PageHeader from "@/features/shell/components/header/PageHeader";
import { ReviewQueue } from "@/features/agents/decision-review/components/ReviewQueue";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/decisions/review", {
  title: "Review answers",
  description:
    "Give the true answer to every decision your agents, workflow steps and API model calls made, lowest confidence first.",
  letter: "Rv",
});

/**
 * The combined decision review queue: every decision item in the person's
 * organizations — agent answers, workflow Decide steps and `/ai/decisions`
 * calls — through THE queue (`ReviewQueue` without an agent). `?source=workflow`
 * (Workflow Studio's decision output links here) opens it filtered.
 */
const SOURCES = ["agent", "workflow", "model"] as const;

export default async function DecisionsReviewRoute({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  const initialSource = SOURCES.find((s) => s === source) ?? null;
  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium text-foreground">Review answers</span>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <ReviewQueue initialSource={initialSource} />
      </div>
    </>
  );
}
