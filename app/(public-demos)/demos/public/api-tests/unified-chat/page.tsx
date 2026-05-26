// app/(public)/demos/api-tests/unified-chat/page.tsx
// Server Component shell — renders instantly with empty layout.
// Client test UI lazy-loads after hydration.

import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/unified-chat", {
  title: "Api Tests Unified Chat",
  description: "Interactive demo: Api Tests Unified Chat. AI Matrx demo route.",
});

const ChatTestClient = lazy(() => import('./ChatTestClient'));

export default function UnifiedChatTestPage() {
    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }>
                <ChatTestClient />
            </Suspense>
        </div>
    );
}
