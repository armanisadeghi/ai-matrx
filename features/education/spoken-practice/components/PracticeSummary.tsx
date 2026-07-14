"use client";

// features/education/spoken-practice/components/PracticeSummary.tsx
//
// End-of-session scorecard + the examiner's batch review (reused professor
// grader → study_session.session_review). Outcome-first: strengths/weaknesses
// over vanity metrics.

import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Languages,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODE_CONFIG } from "../constants";
import type { SpokenPracticeMode } from "../types";
import type { UseSpokenPractice } from "../hooks/useSpokenPractice";

const PRONUNCIATION_ROLLUP: { key: "accuracy" | "fluency" | "intelligibility" | "prosody"; label: string }[] =
  [
    { key: "accuracy", label: "Accuracy" },
    { key: "fluency", label: "Fluency" },
    { key: "intelligibility", label: "Clarity" },
    { key: "prosody", label: "Prosody" },
  ];

export function PracticeSummary({
  mode,
  practice,
}: {
  mode: SpokenPracticeMode;
  practice: UseSpokenPractice;
}) {
  const router = useRouter();
  const cfg = MODE_CONFIG[mode];
  const { results, review, reset } = practice;

  const graded = results.filter((r) => r.result !== "skipped");
  const strong = results.filter((r) => r.result === "correct").length;
  const avg =
    graded.length > 0
      ? Math.round(
          (graded.reduce((s, r) => s + r.score, 0) / graded.length) * 100,
        )
      : null;

  // Pronunciation rollup — average each dimension across answers the language
  // coach scored (present only in the Language & Pronunciation mode).
  const scored = results.filter((r) => r.grade?.pronunciation != null);
  const pronunciationRollup =
    scored.length > 0
      ? PRONUNCIATION_ROLLUP.map((dim) => ({
          label: dim.label,
          pct: Math.round(
            (scored.reduce(
              (s, r) => s + (r.grade!.pronunciation![dim.key] ?? 0),
              0,
            ) /
              scored.length) *
              100,
          ),
        }))
      : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-4 sm:p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {cfg.label} complete
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {strong} of {results.length} strong
            {avg != null ? ` · ${avg}% average` : ""}
          </p>
        </div>
      </div>

      {pronunciationRollup && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Languages className="h-4 w-4 text-primary" />
            Pronunciation &amp; fluency
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {pronunciationRollup.map((dim) => (
              <div key={dim.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{dim.label}</span>
                  <span className="font-medium text-foreground">{dim.pct}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${dim.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[10px] leading-snug text-muted-foreground">
            Averaged across your answers — a holistic read of your speech, not a
            phoneme-by-phoneme score.
          </p>
        </section>
      )}

      {review?.summary && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {cfg.persona}&apos;s review
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {review.summary}
          </p>

          {review.strengths.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                <TrendingUp className="h-3.5 w-3.5" />
                Strengths
              </div>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-foreground">
                {review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {review.weaknesses.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                Work on
              </div>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-foreground">
                {review.weaknesses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={reset}>
          Practice again
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/education/flashcards/sessions")}
        >
          Session history
        </Button>
      </div>
    </div>
  );
}
