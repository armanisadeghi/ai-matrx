"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { connectGoogle } from "@/features/marketing/google/service";
import { Button } from "@/components/ui/button";
import {
  consumeGoogleOAuthRedirectPending,
  returnPathWithGoogleOAuthResult,
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
  const [returnTo, setReturnTo] = useState("/");
  const started = useRef(false);

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
      setReturnTo(pending.returnTo);
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
      try {
        await connectGoogle(code, pending.owner, pending.connectionPurpose, {
          redirectUri: window.location.origin,
          organizationContextId: pending.organizationContextId,
        });
        window.location.replace(
          returnPathWithGoogleOAuthResult(
            pending.returnTo,
            window.location.origin,
            "connected",
          ),
        );
      } catch (cause) {
        setFailure(
          cause instanceof Error
            ? cause.message
            : "Google authorization could not be completed.",
        );
      }
    };
    void finish();
  }, [code, providerError, providerErrorDescription, state]);

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        {failure ? (
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
