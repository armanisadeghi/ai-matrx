import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { BingOAuthCallback } from "@/features/marketing/bing/BingOAuthCallback";

export default function BingOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <SuspenseLoader centered={false} message="Loading Bing connection…" />
        </div>
      }
    >
      <BingOAuthCallback />
    </Suspense>
  );
}
