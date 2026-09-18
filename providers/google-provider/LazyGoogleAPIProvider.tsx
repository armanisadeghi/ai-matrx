"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useGoogleAPIOptional } from "./GoogleApiProvider";
import { GoogleIdentityUnavailableNotice } from "./GoogleIdentityUnavailableNotice";
import {
  GOOGLE_IDENTITY_READY_TIMEOUT_MS,
  isGoogleIdentityUnavailable,
} from "./googleIdentityReadiness";

if (typeof window !== "undefined") {
  console.log(
    `⚡LazyGoogleAPIProvider module loaded at: ${performance.now().toFixed(2)}ms`,
  );
}

/**
 * 🚨 THE CHUNK WAIT IS BOUNDED TOO (V-24 NEW-4, lane F-111).
 *
 * `next/dynamic`'s `loading` fallback has no end: a chunk that never arrives
 * leaves "Loading Google API…" on the screen for the life of the tab. That is
 * the exact string the hostile verifier was still reading past 120 s. Same
 * class as the provider's readiness poll, same remedy shape — after the bound
 * the screen is honest and offers a way out.
 */
function GoogleApiChunkPending() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () => setTimedOut(true),
      GOOGLE_IDENTITY_READY_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (timedOut) {
    return (
      <GoogleIdentityUnavailableNotice
        variant="block"
        onRetry={() => window.location.reload()}
      />
    );
  }
  return (
    <div className="flex min-h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading Google API…
    </div>
  );
}

const GoogleAPIProvider = dynamic(() => import("./GoogleApiProvider"), {
  ssr: false,
  loading: () => <GoogleApiChunkPending />,
});

/**
 * The failed readiness state, rendered ONCE for every Google surface.
 *
 * Every Google surface in the repo mounts its provider through
 * `LazyGoogleAPIProvider`, so putting the notice here is what makes the
 * sentence and its Retry appear on the connect window, the consent dialog, the
 * Workspace overview, the picker hosts, the marketing integrations workspaces
 * and the CRM connectors without any of them spelling it themselves. It is a
 * banner rather than a replacement because those surfaces keep working without
 * Google Identity Services (the connected-account lists are read from our own
 * server); only the controls that need a Google window stay disabled.
 */
function GoogleIdentityStatus({ children }: { children: React.ReactNode }) {
  const google = useGoogleAPIOptional();
  if (google && isGoogleIdentityUnavailable(google.error)) {
    return (
      <>
        <GoogleIdentityUnavailableNotice
          onRetry={google.retryGoogleIdentityLoad}
        />
        {children}
      </>
    );
  }
  return <>{children}</>;
}

interface LazyGoogleAPIProviderProps {
  children: React.ReactNode;
  scopes?: string[];
}

export function LazyGoogleAPIProvider({
  children,
  scopes,
}: LazyGoogleAPIProviderProps) {
  return (
    <GoogleAPIProvider scopes={scopes}>
      <GoogleIdentityStatus>{children}</GoogleIdentityStatus>
    </GoogleAPIProvider>
  );
}
