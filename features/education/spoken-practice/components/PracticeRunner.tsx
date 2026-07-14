"use client";

// features/education/spoken-practice/components/PracticeRunner.tsx
//
// The live spoken-practice loop UI (generating → ask → answer → grade → result).
// Presentational only — all state + side effects live in useSpokenPractice.
// Trust is rendered with the shared P0 primitives (ConfidenceBadge +
// SourceCitations); grading feedback is the verdict explanation (grade-on-meaning).

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Languages,
  Loader2,
  Mic,
  Square,
  Volume2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { verdictResult, type GradeResult } from "@/features/education/trust/types";
import type { PronunciationAssessment } from "@/features/flashcards/fast-fire/agents/grading-core";
import { Button } from "@/components/ui/button";
import { MODE_CONFIG } from "../constants";
import type { SpokenPracticeMode } from "../types";
import type { UseSpokenPractice } from "../hooks/useSpokenPractice";

const PRONUNCIATION_DIMS: { key: keyof PronunciationAssessment; label: string }[] =
  [
    { key: "accuracy", label: "Accuracy" },
    { key: "fluency", label: "Fluency" },
    { key: "intelligibility", label: "Clarity" },
    { key: "prosody", label: "Prosody" },
  ];

const RESULT_STYLE: Record<
  GradeResult,
  { label: string; icon: typeof CheckCircle2; text: string; bg: string }
> = {
  correct: {
    label: "Strong",
    icon: CheckCircle2,
    text: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
  },
  partial: {
    label: "Getting there",
    icon: AlertCircle,
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  incorrect: {
    label: "Needs work",
    icon: XCircle,
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
};

export function PracticeRunner({
  mode,
  practice,
}: {
  mode: SpokenPracticeMode;
  practice: UseSpokenPractice;
}) {
  const cfg = MODE_CONFIG[mode];
  const { phase, plan, index, grade, error, micLevel } = practice;
  const current = plan?.prompts[index] ?? null;
  const total = plan?.prompts.length ?? 0;
  const style = grade ? RESULT_STYLE[verdictResult(grade.verdict)] : null;

  if (phase === "generating") {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {cfg.persona} is preparing your session…
        </p>
      </Centered>
    );
  }

  if (phase === "reviewing") {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {cfg.persona} is reviewing your whole session…
        </p>
      </Centered>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {cfg.label} · {index + 1} of {total}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={practice.quit}
        >
          End session
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {(phase === "asking" || phase === "answering") && current && (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                phase === "answering"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-primary/10 text-primary",
              )}
            >
              {phase === "answering" ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {phase === "answering"
                ? `${cfg.answerVerb} out loud…`
                : `${cfg.persona} is speaking…`}
            </span>

            <p className="max-w-xl text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              {current.prompt}
            </p>

            {phase === "answering" && (
              <>
                <MicMeter level={micLevel} />
                <Button className="gap-2" onClick={practice.submitAnswer}>
                  <Square className="h-4 w-4" />
                  Done answering
                </Button>
                <button
                  type="button"
                  onClick={practice.skip}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Skip this one
                </button>
              </>
            )}
          </>
        )}

        {phase === "grading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Grading your answer…
            </p>
          </>
        )}

        {phase === "result" && current && (
          <div className="flex w-full flex-col items-center gap-3">
            {grade && style ? (
              <>
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full",
                    style.bg,
                  )}
                >
                  <style.icon className={cn("h-7 w-7", style.text)} />
                </div>
                <div className={cn("text-lg font-semibold", style.text)}>
                  {style.label}
                </div>
                {grade.verdict.explanation && (
                  <p className="max-w-lg text-sm text-foreground">
                    {grade.verdict.explanation}
                  </p>
                )}
                {grade.verdict.misconception && (
                  <p className="max-w-lg rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                    Watch out: {grade.verdict.misconception}
                  </p>
                )}
                {grade.transcript && (
                  <p className="max-w-lg text-xs italic text-muted-foreground">
                    “{grade.transcript}”
                  </p>
                )}
                {grade.pronunciation && (
                  <PronunciationCard pronunciation={grade.pronunciation} />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {error ?? "Didn't catch that — moving on."}
              </p>
            )}

            <div className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  What a strong answer covers
                </span>
                <ConfidenceBadge confidence={current.confidence} iconOnly />
              </div>
              <div className="text-sm text-foreground">
                {current.referenceAnswer}
              </div>
              <SourceCitations trust={current.trust} className="mt-2" />
            </div>

            <Button className="w-full gap-1.5" onClick={practice.next}>
              {index + 1 >= total ? "Finish & get review" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </div>
  );
}

/**
 * The pronunciation / fluency scorecard shown after a Language & Pronunciation
 * answer. HONEST framing: these are a holistic judgement of the recording, not
 * phoneme-level measurements — the caption says so.
 */
function PronunciationCard({
  pronunciation,
}: {
  pronunciation: PronunciationAssessment;
}) {
  return (
    <div className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Languages className="h-3.5 w-3.5" />
        Pronunciation &amp; fluency
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {PRONUNCIATION_DIMS.map((dim) => {
          const value = pronunciation[dim.key];
          const pct = Math.round((typeof value === "number" ? value : 0) * 100);
          return (
            <div key={dim.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{dim.label}</span>
                <span className="font-medium text-foreground">{pct}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    pct >= 80
                      ? "bg-green-500"
                      : pct >= 50
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {pronunciation.notes && (
        <p className="mt-2.5 text-xs text-foreground">{pronunciation.notes}</p>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        Assessed holistically from your recording — not a phoneme-by-phoneme
        score.
      </p>
    </div>
  );
}

function MicMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 140));
  return (
    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-red-500 transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
