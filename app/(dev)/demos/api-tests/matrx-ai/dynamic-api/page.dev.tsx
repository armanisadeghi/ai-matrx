import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/matrx-ai/dynamic-api", {
  title: "Api Tests Matrx Ai Dynamic Api",
  description: "Interactive demo: Api Tests Matrx Ai Dynamic Api. AI Matrx demo route.",
});

const DynamicApiClient = lazy(() => import('./DynamicApiClient'));

export default function DynamicApiPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <DynamicApiClient />
      </Suspense>
    </div>
  );
}
