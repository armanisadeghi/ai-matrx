"use client";

// Real error surface for CX dashboard tabs. Rendered by the tab pages whenever
// a service fetcher returns { ok: false } — the empty state ("No usage data",
// etc.) is reserved for queries that SUCCEEDED with zero rows.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** What failed to load, e.g. "usage analytics". */
  what: string;
  /** The actual error message from the failed query. */
  message: string;
};

export function CxErrorPanel({ what, message }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-4">
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 border border-destructive/30 rounded-md bg-destructive/5 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-destructive">
            Failed to load {what}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl break-words font-mono">
            {message}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`}
          />
          {isPending ? "Retrying" : "Retry"}
        </Button>
      </div>
    </div>
  );
}
