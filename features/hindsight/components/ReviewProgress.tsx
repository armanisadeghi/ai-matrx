"use client";

/**
 * ReviewProgress — a review runs the whole reviewer agent inline over every
 * transcript in the window: minutes, not seconds. A bare spinner reads as
 * "hung", so this shows elapsed time and exactly what is happening. Shared by
 * the admin detail panel and the product workspace.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { fmtElapsed } from "./tokens";

export function ReviewProgress({
  startedAt,
  examples,
}: {
  startedAt: number;
  examples: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [startedAt]);

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Reviewing — {fmtElapsed(elapsed)} elapsed
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The reviewer agent is reading{" "}
        {examples > 0 ? `up to ${examples} real transcripts` : "the real transcripts"}{" "}
        end to end and writing findings. This normally takes one to several
        minutes. Leaving this page does not stop it — the review runs on the
        server and the results appear here when it lands.
      </p>
    </div>
  );
}
