// Server Component shell — renders instantly.
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/agent", {
  title: "Api Tests Agent",
  description: "Interactive demo: Api Tests Agent. AI Matrx demo route.",
});

const AgentTestClient = lazy(() => import('./AgentTestClient'));

export default function AgentTestPage() {
    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }>
                <AgentTestClient />
            </Suspense>
        </div>
    );
}
