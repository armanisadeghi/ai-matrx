import SourceDetail from '@/features/research/components/sources/SourceDetail';

export default async function SourceDetailPage({
    params,
}: {
    params: Promise<{ topicId: string; sourceId: string }>;
}) {
    const { topicId, sourceId } = await params;
    return <SourceDetail topicId={topicId} sourceId={sourceId} />;
}
