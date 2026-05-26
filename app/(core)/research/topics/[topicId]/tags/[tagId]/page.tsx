import ConsolidationView from '@/features/research/components/consolidation/ConsolidationView';

export default async function TagConsolidationPage({
    params,
}: {
    params: Promise<{ topicId: string; tagId: string }>;
}) {
    const { topicId, tagId } = await params;
    return <ConsolidationView topicId={topicId} tagId={tagId} />;
}
