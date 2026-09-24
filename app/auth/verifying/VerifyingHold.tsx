"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { safeRelativePath } from "@/utils/auth/safe-redirect";

/** How long to wait before the one automatic retry. */
const RETRY_AFTER_MS = 1500;
/** A second arrival within this window means the retry failed too. */
const SAME_ATTEMPT_WINDOW_MS = 20_000;

function attemptKey(next: string): string {
  return `matrx:verifying:${next}`;
}

function readAttempt(next: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(attemptKey(next));
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeAttempt(next: string, value: number | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(attemptKey(next));
    else window.sessionStorage.setItem(attemptKey(next), String(value));
  } catch {
    // Storage blocked: the retry still happens; the sentence may just come a
    // retry later. Nothing here decides access.
  }
}

export function VerifyingHold({ next }: { next?: string }) {
  const target = safeRelativePath(next ?? "", "/");
  const [phase, setPhase] = useState<"waiting" | "still-failing">("waiting");

  useEffect(() => {
    const previous = readAttempt(target);
    if (previous !== null && Date.now() - previous < SAME_ATTEMPT_WINDOW_MS) {
      // We already retried once and the page sent us back: say so, plainly.
      setPhase("still-failing");
      return;
    }
    writeAttempt(target, Date.now());
    const timer = window.setTimeout(() => window.location.replace(target), RETRY_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [target]);

  const tryAgain = () => {
    writeAttempt(target, null);
    window.location.replace(target);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md text-center" data-testid="verifying-hold" data-phase={phase}>
        {phase === "waiting" ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Checking who you are…
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              We could not confirm who you are right now. You have not been signed
              out — this usually clears in a few seconds.
            </p>
            <Button className="mt-4" size="sm" onClick={tryAgain}>
              <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
              Try again
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
