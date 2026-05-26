import ResearchOverview from '@/features/research/components/overview/ResearchOverview';
import { getTopicServer } from '@/features/research/service/server';

async function TopicJsonLd({ topicId }: { topicId: string }) {
    const topic = await getTopicServer(topicId);
    if (!topic) return null;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ResearchProject',
        name: topic.name,
        description: topic.description || `Research topic: ${topic.name}`,
        dateCreated: topic.created_at,
        dateModified: topic.updated_at || topic.created_at,
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}

export default async function TopicOverviewPage({
    params,
}: {
    params: Promise<{ topicId: string }>;
}) {
    const { topicId } = await params;

    return (
        <>
            <TopicJsonLd topicId={topicId} />
            <ResearchOverview />
        </>
    );
}
