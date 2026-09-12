"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { connectGoogle } from "@/features/marketing/google/service";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import {
  consumeGoogleOAuthRedirectPending,
  assertGoogleOAuthRedirectInitiator,
  returnPathWithGoogleOAuthResult,
  type GoogleOAuthRedirectPending,
} from "./oauthRedirect";

interface GoogleOAuthRedirectCallbackProps {
  code: string | null;
  state: string;
  providerError: string | null;
  providerErrorDescription: string | null;
}

function providerMessage(
  error: string | null,
  description: string | null,
): string {
  if (error === "access_denied") return "Google access was not granted.";
  return description || error || "Google authorization did not complete.";
}

export function GoogleOAuthRedirectCallback({
  code,
  state,
  providerError,
  providerErrorDescription,
}: GoogleOAuthRedirectCallbackProps) {
  const [failure, setFailure] = useState<string | null>(null);
  // A missing organization is NOT a Google failure. Kept apart from `failure`
  // so this screen never tells someone their Google connection is broken when
  // the only thing missing is which organization to file the connection under
  // — that lie sends people to re-authorize Google, or to support, chasing a
  // problem that does not exist.
  const [organizationRequired, setOrganizationRequired] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const started = useRef(false);
  // The pending record is CONSUMED from sessionStorage on the first pass, so a
  // retry after the person picks an organization cannot read it again. Hold it
  // here: picking an organization must finish this authorization, never make
  // them restart the Google flow (the `code` is single-use and already spent
  // from Google's side of the handshake).
  const pendingRef = useRef<GoogleOAuthRedirectPending | null>(null);

  const exchange = useCallback(
    async (pending: GoogleOAuthRedirectPending) => {
      if (!code) {
        setFailure("Google authorization did not return an approval code.");
        return;
      }
      try {
        await connectGoogle(code, pending.owner, pending.connectionPurpose, {
          redirectUri: window.location.origin,
          organizationContextId: pending.organizationContextId,
          expectedUserId: pending.initiatingUserId,
        });
        window.location.replace(
          returnPathWithGoogleOAuthResult(
            pending.returnTo,
            window.location.origin,
            "connected",
          ),
        );
      } catch (cause) {
        if (isOrganizationRequiredError(cause)) {
          setOrganizationRequired(true);
          setFailure(null);
          return;
        }
        setFailure(
          cause instanceof Error
            ? cause.message
            : "Google authorization could not be completed.",
        );
      }
    },
    [code],
  );

  const retryAfterOrganizationChosen = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) {
      setOrganizationRequired(false);
      setFailure("This Google authorization request is missing or expired.");
      return;
    }
    setOrganizationRequired(false);
    void exchange(pending);
  }, [exchange]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = async () => {
      const pending = consumeGoogleOAuthRedirectPending(
        window.sessionStorage,
        state,
        window.location.origin,
      );
      if (!pending) {
        setFailure("This Google authorization request is missing or expired.");
        return;
      }
      pendingRef.current = pending;
      setReturnTo(pending.returnTo);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      try {
        assertGoogleOAuthRedirectInitiator(pending, user?.id);
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : "Google authorization could not be completed.");
        return;
      }
      const validation = await fetch("/api/google/oauth/redirect-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!validation.ok) {
        setFailure("Google authorization state could not be verified.");
        return;
      }
      if (providerError || !code) {
        const message = providerMessage(
          providerError,
          providerErrorDescription,
        );
        window.location.replace(
          returnPathWithGoogleOAuthResult(
            pending.returnTo,
            window.location.origin,
            "failed",
            message,
          ),
        );
        return;
      }
      await exchange(pending);
    };
    void finish();
  }, [code, exchange, providerError, providerErrorDescription, state]);

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        {organizationRequired ? (
          <OrganizationRequiredNotice
            title="Choose an organization to finish this connection"
            description="Google approved the access. It just needs to know which organization to save the connection under — pick one and this finishes on its own. Nothing about your Google account needs redoing."
            onRetry={retryAfterOrganizationChosen}
          />
        ) : failure ? (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-3 text-lg font-semibold">
              Google connection needs attention
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{failure}</p>
            <Button
              className="mt-4"
              onClick={() => window.location.replace(returnTo)}
            >
              Return to AI Matrx
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-3 text-lg font-semibold">
              Finishing your Google connection
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Verifying this request and saving the approved access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
