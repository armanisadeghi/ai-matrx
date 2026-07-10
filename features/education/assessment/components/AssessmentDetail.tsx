"use client";

// features/education/assessment/components/AssessmentDetail.tsx
//
// The assessment detail surface: overview + "Take" launcher + results history +
// the learning-gain (baseline→post) launcher. Gated by the P7 useAccess
// primitive — a view-only sharee can open + take + duplicate-to-edit, but only
// an editor sees Edit. When `start` is set (?start=1) it renders the taker
// directly (the shareable take URL). Shared by quizzes AND practice tests.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Pencil,
  Trash2,
  Clock,
  TrendingUp,
  Copy,
  AlertCircle,
  ArrowLeft,
  History,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAccess } from "@/utils/permissions/access";
import { cn } from "@/lib/utils";
import { ConvertContentDialog } from "@/features/education/convert/ConvertContentDialog";
import { GeneratedFromChips } from "@/features/education/convert/GeneratedFromChips";
import type { TargetKind } from "@/features/education/convert/types";
import { assessmentService } from "../data/assessmentService";
import { serializeAssessment } from "../data/serializeAssessment";
import { newGainGroupId } from "../data/learningGain";
import { kindConfigFor } from "./kindConfig";
import { AssessmentTaker } from "./take/AssessmentTaker";
import type {
  AssessmentItemRow,
  AssessmentResultRow,
  AssessmentRow,
  ResultPhase,
} from "../data/types";

export function AssessmentDetail({
  assessmentId,
  start = false,
  phase = "standalone",
  gainGroupId = null,
}: {
  assessmentId: string;
  start?: boolean;
  phase?: ResultPhase;
  gainGroupId?: string | null;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [items, setItems] = useState<AssessmentItemRow[]>([]);
  const [results, setResults] = useState<AssessmentResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [lineageKey, setLineageKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const access = useAccess("assessment", assessmentId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await assessmentService.getAssessmentWithItems(assessmentId);
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
      } else if (!res.data) {
        setError("This assessment could not be found or you don't have access.");
      } else {
        setAssessment(res.data.assessment);
        setItems(res.data.items);
        const r = await assessmentService.listResults(assessmentId);
        if (!cancelled) setResults(r.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  if (loading) {
    return (
      <div className="min-h-full w-full bg-textured">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Skeleton className="h-8 w-2/3 rounded" />
          <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-full w-full bg-textured">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {error ?? "Not found"}
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  const config = kindConfigFor(assessment.assessment_kind);
  const base = `/education/${config.base}`;
  const Icon = config.icon;

  // The shareable take URL renders the runner directly.
  if (start) {
    return (
      <AssessmentTaker
        assessment={assessment}
        items={items}
        options={{ phase, gainGroupId }}
      />
    );
  }

  const startTake = (p: ResultPhase, gid: string | null) => {
    const params = new URLSearchParams({ start: "1" });
    if (p !== "standalone") params.set("phase", p);
    if (gid) params.set("gain", gid);
    startTransition(() => router.push(`${base}/${assessmentId}?${params}`));
  };

  const startLearningGain = () => startTake("baseline", newGainGroupId());

  const handleDuplicate = async () => {
    setDuplicating(true);
    const res = await assessmentService.duplicate(assessmentId);
    setDuplicating(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not duplicate");
      return;
    }
    toast.success("Copied — you can now edit your copy");
    startTransition(() => router.push(`${base}/${res.data!.id}`));
  };

  const handleDelete = async () => {
    const res = await assessmentService.deleteAssessment(assessmentId);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${config.label} deleted`);
    startTransition(() => router.push(base));
  };

  const canEdit = access.level === "edit" || access.level === "admin" || access.isOwner;
  const timeLabel =
    assessment.time_limit_seconds && assessment.time_limit_seconds > 0
      ? `${Math.round(assessment.time_limit_seconds / 60)} min`
      : null;
  const bestResult = results
    .filter((r) => r.status === "completed" && r.score_value != null)
    .reduce<AssessmentResultRow | null>(
      (best, r) =>
        !best || Number(r.score_value) > Number(best.score_value) ? r : best,
      null,
    );

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {assessment.title}
            </h1>
            {assessment.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {assessment.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{items.length} questions</span>
              {assessment.depth && (
                <span className="capitalize">· {assessment.depth} depth</span>
              )}
              {assessment.exam_type && <span>· {assessment.exam_type}</span>}
              {timeLabel && (
                <span className="inline-flex items-center gap-1">
                  · <Clock className="h-3 w-3" /> {timeLabel}
                </span>
              )}
              {!access.isOwner && access.level === "view" && (
                <span className="rounded-full border border-border bg-muted px-1.5 py-0 uppercase tracking-wider">
                  View only
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          <Button
            size="lg"
            onClick={() => startTake("standalone", null)}
            disabled={isPending || items.length === 0}
          >
            <Play className="mr-1.5 h-4 w-4" />
            {config.timed ? "Start test" : `Take ${config.noun}`}
          </Button>
          <Button
            variant="outline"
            onClick={startLearningGain}
            disabled={isPending || items.length === 0}
          >
            <TrendingUp className="mr-1.5 h-4 w-4" />
            Measure my learning gain (baseline → post)
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Learning gain takes this as a baseline now; after you study, take it
            again as the post-test to see your measured improvement.
          </p>
        </div>

        {/* Owner / editor actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startTransition(() =>
                    router.push(`${base}/${assessmentId}/edit`),
                  )
                }
              >
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDuplicate()}
              disabled={duplicating}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Make a copy to edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConvertOpen(true)}
            disabled={items.length === 0}
          >
            <Boxes className="mr-1.5 h-4 w-4" />
            Convert
          </Button>
        </div>

        {/* Reverse lineage — study artifacts made from this assessment. */}
        <div className="mt-3">
          <GeneratedFromChips
            entityType="assessment"
            entityId={assessmentId}
            refreshKey={lineageKey}
          />
        </div>

        {/* Results history */}
        {results.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <History className="h-4 w-4 text-muted-foreground" />
              Your attempts
              {bestResult && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  Best: {Math.round(Number(bestResult.score_value) * 100)}%
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      router.push(`${base}/${assessmentId}/results?r=${r.id}`),
                    )
                  }
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40",
                    r.status !== "completed" && "opacity-70",
                  )}
                >
                  <span className="font-medium tabular-nums text-foreground">
                    {r.score_value != null
                      ? `${Math.round(Number(r.score_value) * 100)}%`
                      : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.correct_count}/{r.total_count} correct
                  </span>
                  {r.phase !== "standalone" && (
                    <span className="rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.phase}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete this ${config.noun}?`}
        description="This can't be undone. Your past attempts are kept."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* Convert this assessment into other study artifacts (shared primitive). */}
      <ConvertContentDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        origin={{
          kind: "assessment",
          entityType: "assessment",
          entityId: assessmentId,
          title: assessment.title,
        }}
        text={serializeAssessment(assessment, items).markdown}
        orgId={assessment.organization_id ?? undefined}
        excludeKinds={[assessment.assessment_kind as TargetKind]}
        onConverted={() => setLineageKey((k) => k + 1)}
      />
    </div>
  );
}
