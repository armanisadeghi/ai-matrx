import { KeywordDetailView } from "@/features/research/components/keywords/KeywordDetailView";

export default async function KeywordDetailPage({
  params,
}: {
  params: Promise<{ topicId: string; keywordId: string }>;
}) {
  const { topicId, keywordId } = await params;
  return <KeywordDetailView topicId={topicId} keywordId={keywordId} />;
}
