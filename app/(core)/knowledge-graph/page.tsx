import { KnowledgeGraphClient } from "./KnowledgeGraphClient";

export const metadata = {
  title: "Knowledge graph",
  description:
    "Explore the entities and relationships extracted across your organization's content — spot clusters, gaps, and weaknesses in your data.",
};

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <h1 className="text-lg font-semibold text-foreground">
          Knowledge graph
        </h1>
        <p className="text-xs text-muted-foreground">
          Entities and relationships across your organization&apos;s content.
          Click a node to inspect its source mentions.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <KnowledgeGraphClient orgParam={org ?? null} />
      </div>
    </div>
  );
}
