"use client";

// features/education/study/analytics/components/NarrativeCard.tsx
//
// Renders the Study Analytics Narrator output: a headline, grounded insights
// (severity-coded), and prioritized recommendations that deep-link into the
// right study surface. The narration is optional chrome over the real numbers —
// it never blocks the dashboard.
//
// React Compiler is on: no manual memo.

import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  CircleCheck,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { blockHref } from "../../planner/blockLinks";
import type { PlanBlockKind } from "../../planner/types";
import type {
  InsightSeverity,
  NarrativeReport,
} from "../narrative";

const SEV_ICON: Record<InsightSeverity, typeof CircleCheck> = {
  good: CircleCheck,
  watch: Eye,
  urgent: TriangleAlert,
};
const SEV_CLASS: Record<InsightSeverity, string> = {
  good: "text-green-600 dark:text-green-400",
  watch: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

export interface NarrativeCardProps {
  report: NarrativeReport | null;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
}

export function NarrativeCard({
  report,
  loading,
  error,
  onRegenerate,
}: NarrativeCardProps) {
  const router = useRouter();

  return (
    <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            What your data says
          </h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          disabled={loading}
          onClick={onRegenerate}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {loading ? "Analyzing…" : "Refresh"}
        </Button>
      </div>

      {loading && !report ? (
        <p className="py-2 text-sm text-muted-foreground">
          Reading your progress…
        </p>
      ) : error && !report ? (
        <p className="py-2 text-xs text-muted-foreground">
          Couldn&apos;t generate insights right now — your numbers below are
          still live.
        </p>
      ) : report ? (
        <>
          {report.headline && (
            <p className="text-sm font-medium leading-relaxed text-foreground">
              {report.headline}
            </p>
          )}

          {report.insights.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {report.insights.map((ins, i) => {
                const Icon = SEV_ICON[ins.severity];
                return (
                  <li key={i} className="flex gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        SEV_CLASS[ins.severity],
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {ins.title}
                      </p>
                      {ins.detail && (
                        <p className="text-xs text-muted-foreground">
                          {ins.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {report.recommendations.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" />
                Do this next
              </div>
              <ul className="flex flex-col gap-2">
                {report.recommendations.map((rec, i) => {
                  const href = rec.targetKind
                    ? blockHref(rec.targetKind as PlanBlockKind, {
                        topic: rec.topic ?? undefined,
                      })
                    : null;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {rec.action}
                        </p>
                        {rec.why && (
                          <p className="text-xs text-muted-foreground">
                            {rec.why}
                          </p>
                        )}
                      </div>
                      {href && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 gap-1 px-2 text-xs"
                          onClick={() => router.push(href)}
                        >
                          Go
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">
          Study a little and your personalized insights will appear here.
        </p>
      )}
    </section>
  );
}
