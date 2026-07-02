import type { Metadata } from 'next';
import { Suspense } from 'react';
import ChatContainer from '@/features/public-chat/components/ChatContainer';
import ChatLoading from '../../loading';
import { BACKEND_URLS } from '@/lib/api/endpoints';
import { warmConversation } from '@/lib/api/warm-helpers';

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
 * Server-side: fires a warm call to Python so the conversation is cached
 * before the client even loads.
 */
export default async function ConversationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    // Fire-and-forget: warm the conversation on the Python backend.
    warmConversation(id, { baseUrl: BACKEND_URLS.production });
    console.log('[ConversationPage] warmed conversation:', id);

    return (
        <div className="h-full w-full bg-textured">
            <Suspense fallback={<ChatLoading />}>
                <ChatContainer className="h-full" />
            </Suspense>
        </div>
    );
}
