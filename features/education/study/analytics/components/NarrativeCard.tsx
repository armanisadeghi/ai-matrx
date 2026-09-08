"use client";

// features/education/study/analytics/components/NarrativeCard.tsx
//
// Renders the Study Analytics Narrator output: a headline, grounded insights
// (severity-coded), and prioritized recommendations that deep-link into the
// right study surface. The narration is optional chrome over the real numbers —
// it never blocks the dashboard.
//
// While the narrator runs, the card streams it (THE FLOATING LAW's inline
// exception): this card IS the run's destination and the run AUTO-STARTS on
// page load, so a floating window would cover the dashboard on every visit.
// The stream is bounded and scrolls, and it occupies the same block the
// finished narrative will.
//
// React Compiler is on: no manual memo.

import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, RefreshCw, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type { StudyAnalyticsNarrative } from "@/features/content-ir/kinds/generated/kinds.generated";
import { blockHref } from "../../planner/blockLinks";
import type { PlanBlockKind } from "../../planner/types";
import type { NarrativeReport } from "../narrative";

const STUDY_ANALYTICS_NARRATIVE_KIND = "study_analytics_narrative" as const;

/** The coerced report, back in the kind's own wire shape (derived, never re-declared). */
function narrativeValue(report: NarrativeReport): StudyAnalyticsNarrative {
  return {
    __kind: STUDY_ANALYTICS_NARRATIVE_KIND,
    headline: report.headline,
    insights: report.insights.map((ins) => ({
      __kind: "analytics_insight",
      title: ins.title,
      detail: ins.detail,
      severity: ins.severity,
    })),
    recommendations: report.recommendations.map((rec) => ({
      action: rec.action,
      why: rec.why,
      topic: rec.topic,
      target_kind: rec.targetKind,
    })),
  };
}

/** Registry floor — never a JSON document in front of a learner. */
function PlainNarrative({ report }: { report: NarrativeReport }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {report.headline && (
        <p className="font-medium leading-relaxed text-foreground">
          {report.headline}
        </p>
      )}
      {report.insights.map((ins, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="font-medium text-foreground">{ins.title}</span>
          {ins.detail ? ` — ${ins.detail}` : ""}
        </p>
      ))}
    </div>
  );
}

/** The dashboard's own doors into the study surface each recommendation names. */
function NarrativeDoors({
  report,
  onGo,
}: {
  report: NarrativeReport;
  onGo: (href: string) => void;
}) {
  const doors = report.recommendations.flatMap((rec) => {
    const href = rec.targetKind
      ? blockHref(rec.targetKind as PlanBlockKind, {
          topic: rec.topic ?? undefined,
        })
      : null;
    return href ? [{ label: rec.action, href }] : [];
  });
  if (doors.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {doors.map((door) => (
        <Button
          key={door.href + door.label}
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => onGo(door.href)}
        >
          {door.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}


export interface NarrativeCardProps {
  report: NarrativeReport | null;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
  /** The narrator's live run — streamed here instead of a waiting line. */
  conversationId?: string | null;
}

export function NarrativeCard({
  report,
  loading,
  error,
  onRegenerate,
  conversationId,
}: NarrativeCardProps) {
  const router = useRouter();

  return (
    <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
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
        <LiveRunDisplay
          conversationId={conversationId}
          label="Reading your progress"
          pending
          bodyClassName="max-h-56 overflow-y-auto px-2.5 py-2 text-sm"
        />
      ) : error && !report ? (
        <p className="py-2 text-xs text-muted-foreground">
          Couldn&apos;t generate insights right now — your numbers below are
          still live.
        </p>
      ) : report ? (
        <>
          {/* The reading is the `study_analytics_narrative` kind, drawn by its
              component. The deep links are this dashboard's own doors. */}
          <KindInstanceRender
            kind={STUDY_ANALYTICS_NARRATIVE_KIND}
            value={narrativeValue(report)}
            variant="bare"
            showRoutingNote={false}
            unroutableFallback={<PlainNarrative report={report} />}
          />
          <NarrativeDoors report={report} onGo={(href) => router.push(href)} />
        </>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">
          Study a little and your personalized insights will appear here.
        </p>
      )}
    </section>
  );
}
