// Server Component shell — renders instantly.
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/health", {
  title: "Api Tests Health",
  description: "Interactive demo: Api Tests Health. AI Matrx demo route.",
});

const HealthTestClient = lazy(() => import('./HealthTestClient'));

export default function HealthTestPage() {
    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            }>
                <HealthTestClient />
            </Suspense>
        </div>
    );
}
