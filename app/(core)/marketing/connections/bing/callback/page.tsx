// THIS ROUTE DELIBERATELY DID NOT MOVE with the rest of `/marketing/connections`
// (now `/marketing/operations/connections`) in the 2026-08-28 agency
// restructure.
//
// `/marketing/connections/bing/callback` is the EXACT redirect URI registered
// with Bing Webmaster and held server-side by aidream as
// `BING_WEBMASTER_OAUTH_REDIRECT_URI`
// (aidream/startup/env_validation.py → https://www.aimatrx.com/marketing/connections/bing/callback).
// Bing rejects an authorization request whose redirect_uri does not match the
// registration byte for byte, so shimming this address would break the OAuth
// return, not merely add a hop. It moves only when the Bing app registration
// and that environment value move with it.
//
// Contract: features/marketing/bing/FEATURE.md.

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
