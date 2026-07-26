import { MessageCircle } from 'lucide-react';

export default function ChatLoading() {
    return (
        <div className="h-full w-full bg-textured flex flex-col items-center justify-center gap-3">
            <MessageCircle className="h-8 w-8 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading chat...</p>
        </div>
    );
}
