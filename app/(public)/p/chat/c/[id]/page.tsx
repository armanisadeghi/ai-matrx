import type { Metadata } from 'next';
import { Suspense } from 'react';
import ChatContainer from '@/features/public-chat/components/ChatContainer';
import ChatLoading from '../../loading';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    return {
        title: `Conversation | AI Matrx Chat`,
        robots: { index: false, follow: false },
        alternates: { canonical: `/p/chat/c/${id}` },
    };
}

/**
 * Conversation-Direct Route — /p/chat/c/[id]
 * Loads an existing conversation by ID.
 * Conversation loading is handled by ChatLayoutShell (URL-driven).
 *
 */
export default function ConversationPage() {
    return (
        <div className="h-full w-full bg-textured">
            <Suspense fallback={<ChatLoading />}>
                <ChatContainer className="h-full" />
            </Suspense>
        </div>
    );
}
