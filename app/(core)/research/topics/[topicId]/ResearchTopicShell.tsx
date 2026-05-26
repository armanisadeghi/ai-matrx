'use client';

import { TopicProvider } from '@/features/research/context/ResearchContext';
import ResearchLayoutShell from '@/features/research/components/shell/ResearchLayoutShell';
import { StreamDebugOverlay } from '@/features/research/components/shared/StreamDebugOverlay';
import type { TopicStoreInitialData } from '@/features/research/state/topicStore';
import type { ReactNode } from 'react';

interface ResearchTopicShellProps {
    topicId: string;
    initialData?: TopicStoreInitialData;
    children: ReactNode;
}

export default function ResearchTopicShell({ topicId, initialData, children }: ResearchTopicShellProps) {
    return (
        <TopicProvider topicId={topicId} initialData={initialData}>
            <ResearchLayoutShell topicId={topicId}>
                {children}
            </ResearchLayoutShell>
            <StreamDebugOverlay />
        </TopicProvider>
    );
}
