import { Suspense } from "react";
import { fetchConversations } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { ConversationsContent } from "./conversations-content";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConversationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const result = await fetchConversations(filters);

  return (
    <Suspense fallback={<div className="p-4"><div className="h-96 bg-muted/50 rounded-md animate-pulse" /></div>}>
      <ConversationsContent result={result} />
    </Suspense>
  );
}
