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
import { formatDurationSeconds } from "@ai-matrx/kit/format";
import { toast } from "@/lib/toast";
import { Clock, ChevronRight, Flag, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { StudyDeckHeader } from "@/features/flashcards/components/study/StudyDeckHeader";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { cn } from "@/lib/utils";
import { useTakeAssessment, type AnswerRecord, type TakeOptions } from "./useTakeAssessment";
import {
  StudyOrganizationGate,
  useStudyOrganizationReady,
} from "@/features/education/study/components/StudyOrganizationGate";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { QuestionView } from "./QuestionView";
import { kindConfigFor } from "../kindConfig";
import type { GradedAnswer } from "../../data/grading";
import type {
  AssessmentItemRow,
  AssessmentRow,
  AttemptResult,
  QuestionType,
} from "../../data/types";

// Table stakes: a countdown/typed answers never vanish on a reload mid-taking
// (`common-docs/policies/table-stakes-are-never-a-question.md`). One snapshot
// per assessment id in sessionStorage — cleared the moment the taking
// finishes so a later fresh attempt never resumes a stale one.
const SNAPSHOT_PREFIX = "edu-assessment-taking:";

interface StoredRecord {
  itemId: string;
  response: string;
  graded: GradedAnswer;
}

interface TakingSnapshot {
  startedAt: number;
  sessionId: string | null;
  resultId: string | null;
  records: StoredRecord[];
  index: number;
  responses: Record<string, string>;
}

function loadSnapshot(assessmentId: string): TakingSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_PREFIX + assessmentId);
    return raw ? (JSON.parse(raw) as TakingSnapshot) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(assessmentId: string, snapshot: TakingSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SNAPSHOT_PREFIX + assessmentId, JSON.stringify(snapshot));
  } catch {
    // Best-effort — a full/blocked sessionStorage never breaks the taking.
  }
}

function clearSnapshot(assessmentId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SNAPSHOT_PREFIX + assessmentId);
  } catch {
    // no-op
  }
}

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
  // A taking is filed under the QUIZ'S OWN organization when the person
  // belongs to it (their own quiz, or one their organization shares) — the
  // record carries its parent's context, so no organization needs choosing.
  // Only a quiz from an organization they are not in (a public or shared-link
  // one) falls back to their selected organization, and the notice shows in
  // place until one is picked — never the blocking prompt on arrival.
  const selectedOrgReady = useStudyOrganizationReady();
  const { organizations, loading: orgsLoading } = useUserOrganizations();
  const carriedOrgId = organizations.some((o) => o.id === assessment.organization_id)
    ? assessment.organization_id
    : null;
  const orgReady = carriedOrgId !== null || (!orgsLoading && selectedOrgReady);

  // Reload mid-taking resumes from here instead of restarting the clock and
  // dropping already-graded answers (read once, synchronously, on mount).
  const [snapshot] = useState<TakingSnapshot | null>(() => loadSnapshot(assessment.id));
  const restoreRecords: AnswerRecord[] | undefined = snapshot
    ? snapshot.records
        .map((r) => {
          const item = items.find((it) => it.id === r.itemId);
          return item ? { item, response: r.response, graded: r.graded } : null;
        })
        .filter((r): r is AnswerRecord => r !== null)
    : undefined;

  const take = useTakeAssessment(assessment, items, {
    ...options,
    enabled: orgReady,
    orgId: carriedOrgId ?? undefined,
    restore: snapshot
      ? {
          startedAt: snapshot.startedAt,
          sessionId: snapshot.sessionId,
          resultId: snapshot.resultId,
          records: restoreRecords ?? [],
        }
      : null,
  });
  const [index, setIndex] = useState(snapshot?.index ?? 0);
  const [responses, setResponses] = useState<Record<string, string>>(
    snapshot?.responses ?? {},
  );
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [finishing, startFinishing] = useState(false);
  const [, startTransition] = useTransition();

  // Begin on mount — or once an organization is chosen. A restored snapshot
  // already carries a startedAt, so this is a no-op then (see start()'s guard).
  useEffect(() => {
    if (orgReady) void take.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgReady]);

  // Countdown timer (practice tests with a limit). Derived from the wall-clock
  // startedAt rather than decremented locally, so a page reload — which
  // restores startedAt from the snapshot above — recomputes the true
  // remaining time instead of granting a fresh full countdown.
  const limit = assessment.time_limit_seconds ?? 0;
  const timed = config.timed && limit > 0;
  const computeRemaining = (startedAt: number | null): number | null => {
    if (!timed) return null;
    if (startedAt === null) return limit;
    return Math.max(0, limit - Math.floor((Date.now() - startedAt) / 1000));
  };
  const [remaining, setRemaining] = useState<number | null>(() =>
    computeRemaining(take.startedAt),
  );
  useEffect(() => {
    if (remaining === null || !take.started) return;
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(computeRemaining(take.startedAt));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining, take.started, take.startedAt, limit]);

  // Persist progress after every relevant change — the reload safety net.
  useEffect(() => {
    if (!take.started || take.startedAt === null) return;
    saveSnapshot(assessment.id, {
      startedAt: take.startedAt,
      sessionId: take.sessionId,
      resultId: take.resultId,
      records: take.records.map((r) => ({
        itemId: r.item.id,
        response: r.response,
        graded: r.graded,
      })),
      index,
      responses,
    });
  }, [
    take.started,
    take.startedAt,
    take.sessionId,
    take.resultId,
    take.records,
    index,
    responses,
    assessment.id,
  ]);

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
    clearSnapshot(assessment.id);
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
      <StudyOrganizationGate what={`This ${config.noun}`} bypass={carriedOrgId !== null}>
      <div className="h-full overflow-y-auto overscroll-contain bg-background">
        <div className="mx-auto max-w-2xl px-2 pb-safe pt-14 sm:px-6">
          {!orgReady || !take.started ? (
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
                      {formatDurationSeconds(Math.max(0, remaining), { style: "clock" })}
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
      </StudyOrganizationGate>
    </>
  );
}
