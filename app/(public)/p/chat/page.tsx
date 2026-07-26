import { Suspense } from 'react';
import ChatContainer from '@/features/public-chat/components/ChatContainer';
import ChatLoading from './loading';

export default function PublicChatPage() {
    return (
        <div className="h-full w-full bg-textured">
            <Suspense fallback={<ChatLoading />}>
                <ChatContainer className="h-full" />
            </Suspense>
        </div>
    );
}
