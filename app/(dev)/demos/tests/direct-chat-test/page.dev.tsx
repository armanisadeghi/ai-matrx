// Server Component shell — renders instantly.
import { Suspense, lazy } from 'react';
import dynamic from "next/dynamic";
import { Loader2 } from 'lucide-react';

const DirectChatClient = dynamic(() => import('./DirectChatClient'), { ssr: false, loading: () => null });

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
