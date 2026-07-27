import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/matrx-ai/agent-demo", {
  title: "Api Tests Matrx Ai Agent Demo",
  description: "Interactive demo: Api Tests Matrx Ai Agent Demo. AI Matrx demo route.",
});

const AgentDemoClient = lazy(() => import('./AgentDemoClient'));

export default function AgentDemoPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <AgentDemoClient />
      </Suspense>
    </div>
  );
}
