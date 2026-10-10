"use client";

// /hr/performance/reviews/[reviewId] — the role-aware review workspace. The same page is the
// employee's self form, the manager's form, the differences-first comparison once both are in,
// the manager's overall rating and share, the employee's acknowledgment, and reopen / cancel with
// a reason. What each person may do comes from the door (`review.can`), never from this file's
// guess; what each person may read comes from the door too (a hidden half carries no answers).

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HR_ORG_PARAM } from "@/features/hr/constants";
import { hrHref, hrPerformanceHref } from "@/features/hr/routes";
import { Check, CircleDot, RotateCcw, Send, Ban, Users } from "lucide-react";
import { Badge, Button, EmptyState, Select } from "@ai-matrx/design-system/controls";
import { TextInputDialog } from "@ai-matrx/design-system";

import { ProTextarea } from "@/components/official/ProTextarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { toast } from "@/lib/toast";
import { useOpenAccessSetupWindow } from "@/features/overlays/openers/accessSetupWindow";

import { AnswerForm } from "./AnswerForm";
import { AnswerReadout, Comparison } from "./Comparison";
import { ReviewExtras } from "./ReviewExtras";
import { acknowledgeReview, cancelReview, getReview, reopenReview, replaceManager, setOverallRating, shareReview, type StdResult } from "./service";
import { PeersPanel } from "./PeersPanel";
import { peerLabel, submittedPeerResponses } from "./peers";
import { EmploymentPicker } from "@/features/hr/people/relations/components/EmploymentPicker";
import { formatDay, nextStep, periodLabel, ratingLabel, statusLabel, statusTone } from "./status";
import { isPeerOnly, type ResponseView, type ReviewDetail } from "./types";

const NONE = "__none";
type Dialog = "share" | "acknowledge" | "reopen" | "cancel" | "replace" | null;

export function ReviewWorkspace({ reviewId }: { reviewId: string }) {
  const org = useSearchParams()?.get(HR_ORG_PARAM);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comment, setComment] = useState("");
  const [newManager, setNewManager] = useState<{ employmentId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const openPeopleInvolved = useOpenAccessSetupWindow();

  useEffect(() => {
    let live = true;
    void getReview(reviewId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setDetail(r.data);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [reviewId, tick]);

  const act = async (run: () => Promise<StdResult<unknown>>, done: string) => {
    if (busy) return;
    setBusy(true);
    const r = await run();
    setBusy(false);
    setDialog(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(done);
    reload();
  };

  const review = detail?.review;
  const template = detail?.template;
  const selfR: ResponseView | undefined = detail?.responses.find((r) => r.role === "self");
  const mgrR: ResponseView | undefined = detail?.responses.find((r) => r.role === "manager");
  const isPeer = review ? isPeerOnly(review.seats) : false;
  const myPeer = detail?.responses.find((r) => r.role === "peer" && r.isMine);
  const peers = detail ? submittedPeerResponses(detail.responses).filter((r) => !r.isMine) : [];

  return (
    <>
    <RecordPageHeader
      backHref={hrPerformanceHref(org)}
      parents={[
        { label: "HR", href: hrHref(org) },
        { label: "Performance", href: hrPerformanceHref(org) },
      ]}
      record={{ name: review?.employeeName ?? "Review" }}
      status={review ? { label: statusLabel(review.status), tone: statusTone(review.status) } : undefined}
      actions={
        review
          ? [
              {
                label: "People involved",
                icon: Users,
                onPress: () => openPeopleInvolved({ headType: "hr_review", recordId: reviewId, recordName: review.employeeName }),
              },
            ]
          : undefined
      }
    />
    <HrPageState loading={detail === null && error === null} error={error ? new Error(error) : null} onRetry={reload} operation="This review" variant="panel" requireEmployer={false}>
      {detail && review && template ? (
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <div className="mx-auto max-w-4xl space-y-4 px-3 pt-3">
            <header className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {review.overallRating ? <Badge tone="primary">{ratingLabel(template.ratingPoints, review.overallRating)}</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {review.cycleName} · {periodLabel(review.periodStart, review.periodEnd)} · Manager {review.managerName}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Your next step: </span>
                {nextStep(review)}
              </p>
            </header>

            {isPeer ? (
              myPeer?.status === "submitted" && myPeer.answers ? (
                <AnswerReadout template={template} answers={myPeer.answers} goals={detail.goals} title="Your feedback, sent" />
              ) : (
                <AnswerForm
                  key={`peer-${myPeer?.version ?? 0}`}
                  reviewId={reviewId}
                  role="peer"
                  template={template}
                  goals={detail.goals}
                  initialAnswers={myPeer?.answers ?? null}
                  initialVersion={myPeer?.version ?? null}
                  canSubmit={review.cycleStatus === "open"}
                  subjectName={review.employeeName}
                  onSubmitted={reload}
                  onConflict={reload}
                />
              )
            ) : (
            <>
            <Timeline review={review} />
            <ReviewExtras detail={detail} />

            {review.can.save_self ? (
              <AnswerForm
                key={`self-${selfR?.version ?? 0}`}
                reviewId={reviewId}
                role="self"
                template={template}
                initialAnswers={selfR?.answers ?? null}
                initialVersion={selfR?.version ?? null}
                canSubmit={review.can.submit_self}
                subjectName={review.employeeName}
                goals={detail.goals}
                onSubmitted={reload}
                onConflict={reload}
              />
            ) : null}
            {review.can.save_manager ? (
              <AnswerForm
                key={`manager-${mgrR?.version ?? 0}`}
                reviewId={reviewId}
                role="manager"
                template={template}
                initialAnswers={mgrR?.answers ?? null}
                initialVersion={mgrR?.version ?? null}
                canSubmit={review.can.submit_manager}
                subjectName={review.employeeName}
                goals={detail.goals}
                onSubmitted={reload}
                onConflict={reload}
              />
            ) : null}

            {/* Finished answers this person may read. The door decides: a hidden half has no answers. */}
            {!review.can.save_self && !review.can.save_manager ? (
              selfR?.answers && mgrR?.answers ? (
                <Comparison template={template} self={selfR.answers} manager={mgrR.answers} employeeName={review.employeeName} managerName={review.managerName} goals={detail.goals} />
              ) : selfR?.answers ? (
                <AnswerReadout template={template} answers={selfR.answers} title={selfR.isMine ? "Your self review" : `${review.employeeName}'s self review`} goals={detail.goals} />
              ) : mgrR?.answers ? (
                <AnswerReadout template={template} answers={mgrR.answers} title={`${review.managerName}'s review`} goals={detail.goals} />
              ) : (
                <EmptyState icon={<CircleDot />} title="Nothing to read yet" line="Each side stays private until both are submitted" />
              )
            ) : (
              <>
                {review.can.save_manager && selfR?.answers ? <AnswerReadout template={template} answers={selfR.answers} title={`${review.employeeName}'s self review`} goals={detail.goals} /> : null}
              </>
            )}

            <PeersPanel detail={detail} onChanged={reload} />
            {peers.map((r, i) => (
              <AnswerReadout key={`${r.role}-${i}`} template={template} answers={r.answers!} goals={detail.goals} title={`Peer feedback: ${peerLabel(r, i)}`} />
            ))}

            {review.can.set_overall || review.can.share || review.can.acknowledge || review.can.reopen || review.can.cancel || review.can.replace_manager ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
                {review.can.set_overall ? (
                  <Select
                    aria-label="Overall rating"
                    value={review.overallRating ?? NONE}
                    onValueChange={(key) => key !== NONE && void act(() => setOverallRating(reviewId, key), "Overall rating saved")}
                    options={[{ value: NONE, label: "Overall rating" }, ...template.ratingPoints.map((p) => ({ value: p.key, label: p.label }))]}
                  />
                ) : null}
                {review.can.share ? (
                  <Button icon={<Send />} variant="primary" disabled={busy} onClick={() => setDialog("share")}>
                    Share with {review.employeeName}
                  </Button>
                ) : null}
                {review.can.acknowledge ? (
                  <Button icon={<Check />} variant="primary" disabled={busy} onClick={() => setDialog("acknowledge")}>
                    Acknowledge
                  </Button>
                ) : null}
                {review.can.reopen ? (
                  <Button icon={<RotateCcw />} variant="outline" disabled={busy} onClick={() => setDialog("reopen")}>
                    Reopen
                  </Button>
                ) : null}
                {review.can.replace_manager ? (
                  <Button variant="outline" disabled={busy} onClick={() => setDialog("replace")}>
                    Change manager
                  </Button>
                ) : null}
                {review.can.cancel ? (
                  <Button icon={<Ban />} variant="outline" disabled={busy} onClick={() => setDialog("cancel")}>
                    Cancel review
                  </Button>
                ) : null}
              </div>
            ) : null}
            </>
            )}
          </div>

          <ConfirmDialog
            open={dialog === "replace"}
            onOpenChange={(o) => {
              if (!o) {
                setDialog(null);
                setNewManager(null);
              }
            }}
            title="Change this review's manager"
            description={`The new manager writes the review and shares it. ${review.managerName} loses access to it. This only works before the manager submits.`}
            confirmLabel="Change manager"
            confirmDisabled={newManager === null}
            busy={busy}
            content={<EmploymentPicker value={newManager?.employmentId ?? null} onChange={(id) => id === null && setNewManager(null)} onChosen={setNewManager} placeholder="Search for the new manager" />}
            onConfirm={() => (newManager ? act(() => replaceManager(reviewId, newManager.employmentId), "Manager changed") : undefined)}
          />
          <ConfirmDialog
            open={dialog === "share"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Share with ${review.employeeName}?`}
            description={`${review.employeeName} will be able to read your review and your overall rating. You cannot edit it afterwards unless you reopen it, which asks for a new acknowledgment.`}
            confirmLabel="Share"
            busy={busy}
            onConfirm={() => act(() => shareReview(reviewId), "Review shared")}
          />
          <ConfirmDialog
            open={dialog === "acknowledge"}
            onOpenChange={(o) => !o && setDialog(null)}
            title="Acknowledge this review"
            description="This records that you have read it. It does not mean you agree, and your comment is optional."
            confirmLabel="Acknowledge"
            busy={busy}
            content={
              <ProTextarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (optional)"
                minHeight={88}
                maxHeight={240}
                surfaceName="hr-standard-performance-review"
                getApplicationScope={() => ({ context: { surface: "hr-standard-performance-review", part: "acknowledgment", employee: review.employeeName } })}
                enableTextStats={false}
                className="min-h-[88px] resize-y text-base sm:text-sm"
              />
            }
            onConfirm={() => act(() => acknowledgeReview(reviewId, comment.trim() || null), "Review acknowledged")}
          />
          <TextInputDialog
            open={dialog === "reopen"}
            onOpenChange={(o) => !o && setDialog(null)}
            title="Reopen this review"
            description={`The manager can edit and share again, and ${review.employeeName} must acknowledge again. The reason is kept in the review's history.`}
            placeholder="Overall rating corrected after calibration"
            confirmLabel="Reopen"
            multiline
            busy={busy}
            onConfirm={(reason) => act(() => reopenReview(reviewId, reason.trim()), "Review reopened")}
          />
          <TextInputDialog
            open={dialog === "cancel"}
            onOpenChange={(o) => !o && setDialog(null)}
            title="Cancel this review"
            description="The review stops here and nobody can write on it. The reason is kept."
            placeholder="Employee transferred before the cycle began"
            confirmLabel="Cancel review"
            multiline
            busy={busy}
            onConfirm={(reason) => act(() => cancelReview(reviewId, reason.trim()), "Review cancelled")}
          />
        </div>
      ) : null}
    </HrPageState>
    </>
  );
}

function Timeline({ review }: { review: ReviewDetail["review"] }) {
  const steps = [
    { label: "Self review", at: review.selfSubmittedAt },
    { label: "Manager review", at: review.managerSubmittedAt },
    { label: "Shared", at: review.sharedAt },
    { label: "Acknowledged", at: review.acknowledgedAt },
  ];
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Review progress">
        {steps.map((s) => (
          <li key={s.label} className="rounded-md border border-border bg-card p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="text-sm">{s.at ? formatDay(s.at) : "Waiting"}</p>
          </li>
        ))}
      </ol>
      {review.cancelledAt ? <p className="text-sm text-muted-foreground">Cancelled {formatDay(review.cancelledAt)}</p> : null}
      {review.reopenHistory.length > 0 ? (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {review.reopenHistory.map((h, i) => (
            <li key={i}>
              Reopened {formatDay(h.at)}
              {h.reason ? `: ${h.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {review.acknowledgmentComment ? <p className="text-sm">Employee comment: {review.acknowledgmentComment}</p> : null}
    </div>
  );
}
