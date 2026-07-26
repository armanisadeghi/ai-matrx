"use client";

/**
 * Keyword Intelligence — Research tab.
 *
 * Runs the full canonical keyword-research pipeline for the panel's phrase
 * (LSI agent → relationship ingestion → provider volume → classification) by
 * REUSING `useKeywordResearch` and `LiveResearchFeed` from the
 * keyword-research feature — the same durable-run, auto-rejoin, live
 * kind-component streaming the workbench uses. No forked stream consumer.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { seoKeywordKeys } from "./hooks";
import { useKeywordResearch } from "@/features/marketing/seo/keyword-research/useKeywordResearch";
import LiveResearchFeed from "@/features/marketing/seo/keyword-research/components/LiveResearchFeed";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export function KeywordResearchTab({ phrase }: { phrase: string }) {
  const research = useKeywordResearch();
  const { run } = research;
  const running = run.status === "running";
  const queryClient = useQueryClient();

  // A finished run wrote keyword/market/edge/classification rows — make every
  // keyword-primitive consumer (chips, Overview, Relationships) see them.
  useEffect(() => {
    if (run.status === "done") {
      void queryClient.invalidateQueries({ queryKey: seoKeywordKeys.all });
    }
  }, [run.status, queryClient]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              Full keyword research
            </p>
            <p className="text-[11px] text-muted-foreground">
              Discovers related keywords and relationships, fetches provider
              volume, and classifies intent — persisted to the keyword library.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 shrink-0"
          disabled={running || !phrase.trim()}
          onClick={() => void research.runResearch(phrase)}
        >
          {running ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          {running ? "Running" : "Run research"}
        </Button>
      </div>

      {run.status !== "idle" ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] text-muted-foreground">
            {run.status === "error" ? (
              <span className="text-destructive">{run.error}</span>
            ) : (
              (run.stage ?? "Working…")
            )}
          </p>
        </div>
      ) : null}

      {run.streamKey ? (
        <LiveResearchFeed
          streamKey={run.streamKey}
          researchText={run.researchOutput ?? ""}
          researchDone={run.researchDone ?? false}
          classificationText={run.classificationOutput ?? ""}
          classificationDone={run.classificationDone ?? false}
        />
      ) : null}

      {run.status === "done" ? (
        <p className="text-[11px] text-muted-foreground">
          Research persisted to the keyword library. Explore the full cluster in
          the{" "}
          <a
            href={marketingRoutes.keywordResearch()}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Keyword Research workbench
          </a>
          , or revisit the Overview and Relationships tabs — they now reflect
          the new data.
        </p>
      ) : null}
    </div>
  );
}
