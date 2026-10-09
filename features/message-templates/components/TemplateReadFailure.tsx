"use client";

// The server read of one template failed (timeout, network) — not a missing
// template. Say so and offer the retry: a server-rendered page cannot hand the
// shared ReadFailure a retry function, so this client edge supplies it
// (router.refresh re-runs the server read).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReadFailure } from "@ai-matrx/design-system";

export function TemplateReadFailure({ error }: { error: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ReadFailure
      error={error}
      what="this message template"
      size="default"
      onRetry={() => startTransition(() => router.refresh())}
    />
  );
}
