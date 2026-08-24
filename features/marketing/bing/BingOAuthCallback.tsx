"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompleteBingOAuth } from "@/features/marketing/bing/hooks";
import { BING_PROVIDER } from "@/features/marketing/lib/provider-names";

type CallbackStatus = "working" | "success" | "error";

export function BingOAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const complete = useCompleteBingOAuth();
  const started = useRef(false);
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const initialError = providerError
    ? providerError
    : !code || !returnedState
      ? "Bing did not return the information needed to finish connecting."
      : null;
  const [status, setStatus] = useState<CallbackStatus>(() =>
    initialError ? "error" : "working",
  );
  const [message, setMessage] = useState(
    initialError ?? "Finishing your secure Bing Webmaster connection…",
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code || !returnedState || initialError) return;
    void complete
      .mutateAsync({ code, state: returnedState })
      .then(() => {
        setStatus("success");
        setMessage("Bing Webmaster is connected. Loading your verified sites…");
        // OAuth callback: replace so Back never re-enters the consumed
        // callback URL. NEVER convert this to push.
        window.setTimeout(
          () => router.replace("/marketing/connections/bing"),
          700,
        );
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "We could not finish the Bing Webmaster connection.",
        );
      });
  }, [code, complete, initialError, returnedState, router]);

  return (
    <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
      <section className="mx-auto mt-8 max-w-lg rounded-lg border border-border bg-card p-6 text-center">
        {status === "working" ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        ) : status === "success" ? (
          <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
        ) : (
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        )}
        <h1 className="mt-3 text-base font-semibold">
          {status === "error"
            ? "Bing connection needs attention"
            : `Connecting ${BING_PROVIDER.label}`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {status === "error" ? (
          <Button asChild className="mt-4" size="sm">
            <Link href="/marketing/connections/bing">
              Return to Bing connections
            </Link>
          </Button>
        ) : null}
      </section>
    </main>
  );
}
