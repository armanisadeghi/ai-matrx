import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

export default function ConversationNotFound() {
    return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-4">
            <MessageCircle className="h-10 w-10 text-muted-foreground" />
            <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Conversation not found</h2>
                <p className="text-sm text-muted-foreground">
                    This conversation may have been deleted or the link is invalid.
                </p>
            </div>
            <Link
                href="/p/chat"
                className="text-sm text-primary hover:underline"
            >
                Start a new chat
            </Link>
        </div>
    );
}
