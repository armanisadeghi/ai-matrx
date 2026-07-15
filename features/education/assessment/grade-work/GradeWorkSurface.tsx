"use client";

// features/education/assessment/grade-work/GradeWorkSurface.tsx
//
// The standalone "Grade my handwritten work" surface: type the problem (+ an
// optional model answer / rubric), photograph your worked solution, and get a
// step-level grade that pinpoints exactly where your reasoning broke. Reuses the
// shared HandwrittenWorkInput + StepBreakdown primitives and the SAME vision
// grading path as the assessment take flow — this surface is just a different
// front door to it. Metered with the canonical entitlement guard/meter
// (education.image_grade), pre-visible before the action (TRUST mandate).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ScanText,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import type { GradeResult } from "@/features/education/trust/types";
import { HandwrittenWorkInput } from "../components/HandwrittenWorkInput";
import { StepBreakdown } from "../components/StepBreakdown";
import { useGradeWork } from "./useGradeWork";

const RESULT_STYLE: Record<
  GradeResult,
  { icon: typeof CheckCircle2; label: string; className: string }
> = {
  correct: {
    icon: CheckCircle2,
    label: "Correct",
    className:
      "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300",
  },
  partial: {
    icon: MinusCircle,
    label: "Partial credit",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  },
  incorrect: {
    icon: XCircle,
    label: "Needs work",
    className:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  },
};

export function GradeWorkSurface() {
  const [problem, setProblem] = useState("");
  const [expected, setExpected] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const grader = useGradeWork();
  const guard = useEntitlementGuard("education.image_grade");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();

  const busy = grader.status === "grading" || guard.isChecking;
  const canGrade = problem.trim().length > 0 && !!photo && !busy;

  const onGrade = async () => {
    if (!photo || !problem.trim()) return;
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
    await guard.guard(async () => {
      const graded = await grader.grade({ problem, expected, photo });
      if (!graded) {
        toast.error(grader.error ?? "Couldn't grade that photo.");
        return;
      }
      // Metered action SUCCEEDED — record real usage so the meter decrements
      // (honest even while enforced:false). A failed grade returns above, so a
      // failed action never burns quota.
      await guard.commit();
    });
  };

  const onReset = () => {
    grader.reset();
    setPhoto(null);
  };

  const graded = grader.result;
  const style = graded ? RESULT_STYLE[graded.result] : null;
  const StyleIcon = style?.icon ?? ScanText;

  return (
    <div className="mx-auto max-w-2xl px-3 pb-16 pt-6 sm:px-6">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/education"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Education
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScanText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight text-foreground">
              Grade My Handwritten Work
            </h1>
            <p className="text-sm text-muted-foreground">
              Snap your worked solution — graded on meaning, step by step.
            </p>
          </div>
        </div>
      </div>

      {!graded ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-start">
            <EntitlementMeter capability="education.image_grade" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              The problem
            </label>
            <Textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Paste or type the exact problem you solved — e.g. 'Solve for x: 3(x + 2) = 15' or an essay prompt."
              className="min-h-[84px] text-base"
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Model answer or rubric{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="Leave blank to have the AI solve it and grade against its own solution — or describe what full credit must show."
              className="min-h-[64px] text-base"
              disabled={busy}
            />
          </div>

          <HandwrittenWorkInput
            photo={photo}
            onPhotoChange={setPhoto}
            disabled={busy}
          />

          <Button
            onClick={() => void onGrade()}
            disabled={!canGrade}
            className="h-11"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {guard.isChecking ? "Checking…" : "Grading your work…"}
              </>
            ) : (
              <>
                <ScanText className="mr-1.5 h-4 w-4" />
                Grade my work
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Verdict */}
          {style && (
            <div
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                style.className,
              )}
            >
              <StyleIcon className="h-3.5 w-3.5" />
              {style.label}
            </div>
          )}

          {graded.misconception && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <span className="font-medium">Watch out:</span>{" "}
              {graded.misconception}
            </p>
          )}

          {graded.explanation && (
            <p className="text-sm text-muted-foreground">
              {graded.explanation}
            </p>
          )}

          {graded.steps && graded.steps.length > 0 && (
            <StepBreakdown steps={graded.steps} />
          )}

          {graded.transcription && (
            <details className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground">
                What we read from your photo
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground">
                {graded.transcription}
              </pre>
            </details>
          )}

          <Button variant="outline" onClick={onReset} className="h-11 w-fit">
            <ScanText className="mr-1.5 h-4 w-4" />
            Grade another
          </Button>
        </div>
      )}

      <guard.Paywall />
      <coppa.Gate />
    </div>
  );
}
