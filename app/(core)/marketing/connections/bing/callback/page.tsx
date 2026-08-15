import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { BingOAuthCallback } from "@/features/marketing/bing/BingOAuthCallback";

export default function BingOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <BingOAuthCallback />
    </Suspense>
  );
}
