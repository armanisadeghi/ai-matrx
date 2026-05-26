// Server Component shell — renders instantly.
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const DirectChatClient = lazy(() => import('./DirectChatClient'));

export default function DirectChatTestPage() {
    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }>
                <DirectChatClient />
            </Suspense>
        </div>
    );
}
