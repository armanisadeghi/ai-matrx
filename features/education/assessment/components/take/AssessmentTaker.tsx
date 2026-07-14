"use client";

// features/education/assessment/components/take/AssessmentTaker.tsx
//
// The taking runner — one question at a time, grade-on-submit feedback, spine
// recording (via useTakeAssessment), and (practice tests) a countdown timer
// that auto-submits when it hits zero. On finish it navigates to the scored
// results page. Shared by quizzes AND practice tests (kind drives only the
// timer + copy).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, ChevronRight, Flag, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { StudyDeckHeader } from "@/features/flashcards/components/study/StudyDeckHeader";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import { useTakeAssessment, type TakeOptions } from "./useTakeAssessment";
import { QuestionView } from "./QuestionView";
import { kindConfigFor } from "../kindConfig";
import type {
  AssessmentItemRow,
  AssessmentRow,
  AttemptResult,
  QuestionType,
} from "../../data/types";

function isAnswerable(
  type: QuestionType,
  response: string,
  photo?: File | null,
): boolean {
  if (type === "written_response" || type === "short_answer")
    return response.trim().length > 0 || !!photo; // typed OR photographed
  if (type === "fill_blank") return response.trim().length > 0;
  return response.length > 0; // MC/TF: an option is selected
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AssessmentTaker({
  assessment,
  items,
  options = {},
}: {
  assessment: AssessmentRow;
  items: AssessmentItemRow[];
  options?: TakeOptions;
}) {
  const router = useRouter();
  const config = kindConfigFor(assessment.assessment_kind);
  const base = `/education/${config.base}`;
  const take = useTakeAssessment(assessment, items, options);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [finishing, startFinishing] = useState(false);
  const [, startTransition] = useTransition();

  // Open the session + result on mount.
  useEffect(() => {
    void take.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer (practice tests with a limit).
  const limit = assessment.time_limit_seconds ?? 0;
  const [remaining, setRemaining] = useState<number | null>(
    config.timed && limit > 0 ? limit : null,
  );
  useEffect(() => {
    if (remaining === null || !take.sessionId) return;
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => (r === null ? null : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining, take.sessionId]);

  const current = items[index];
  const record = take.records.find((r) => r.item.id === current?.id) ?? null;
  const response = responses[current?.id ?? ""] ?? "";
  const photo = photos[current?.id ?? ""] ?? null;
  const isLast = index >= items.length - 1;

  const handleFinish = async () => {
    startFinishing(true);
    const id = await take.finish();
    if (!id) {
      startFinishing(false);
      toast.error(take.error ?? "Could not save your results");
      return;
    }
    startTransition(() => router.push(`${base}/${assessment.id}/results?r=${id}`));
  };

  // Auto-submit + finish when the timer runs out.
  useEffect(() => {
    if (remaining !== 0) return;
    void (async () => {
      if (
        current &&
        !record &&
        isAnswerable(current.question_type as QuestionType, response, photo)
      ) {
        await take.submit(current, response, photo);
      }
      toast.info("Time's up — submitting your test.");
      await handleFinish();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const submit = async () => {
    if (!current || record) return;
    await take.submit(current, response, photo);
  };

  const next = () => {
    if (isLast) {
      void handleFinish();
      return;
    }
    setIndex((i) => i + 1);
  };

  const setResponse = (v: string) =>
    setResponses((prev) => ({ ...prev, [current!.id]: v }));

  const setPhoto = (f: File | null) =>
    setPhotos((prev) => ({ ...prev, [current!.id]: f }));

  if (items.length === 0) {
    return (
      <>
        <PageHeader>
          <StudyDeckHeader title={assessment.title} backHref={base} />
        </PageHeader>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              This {config.noun} has no questions.
            </p>
          </div>
        </div>
      </>
    );
  }

  const answered = take.records.length;
  const pct = Math.round((answered / items.length) * 100);

  return (
    <>
      <PageHeader>
        <StudyDeckHeader
          title={assessment.title}
          backHref={`${base}/${assessment.id}`}
        />
      </PageHeader>
      <div className="h-full overflow-y-auto overscroll-contain bg-background">
        <div className="mx-auto max-w-2xl px-2 pb-safe pt-14 sm:px-6">
          {take.starting && !take.sessionId ? (
            <div className="flex h-64 items-center justify-center">
              <MatrxMiniLoader />
            </div>
          ) : (
            <>
              {/* Progress + timer */}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {answered}/{items.length} answered
                  </span>
                  {remaining !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium tabular-nums",
                        remaining <= 30 && "text-red-600 dark:text-red-400",
                      )}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {fmt(Math.max(0, remaining))}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {current && (
                <QuestionView
                  item={current}
                  index={index}
                  total={items.length}
                  response={response}
                  onResponseChange={setResponse}
                  photo={photo}
                  onPhotoChange={setPhoto}
                  graded={record?.graded ?? null}
                  onOverride={(r: AttemptResult) => take.override(current.id, r)}
                />
              )}

              {/* Actions */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {take.grading ? "Grading…" : ""}
                </span>
                <div className="flex items-center gap-2">
                  {!record ? (
                    <Button
                      onClick={() => void submit()}
                      disabled={
                        !current ||
                        take.grading ||
                        !isAnswerable(
                          current.question_type as QuestionType,
                          response,
                          photo,
                        )
                      }
                    >
                      {take.grading ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : null}
                      Check answer
                    </Button>
                  ) : (
                    <Button onClick={next} disabled={finishing}>
                      {isLast ? (
                        <>
                          {finishing ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Flag className="mr-1.5 h-4 w-4" />
                          )}
                          See results
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
