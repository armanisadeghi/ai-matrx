"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { HrActionDialog } from "@/features/hr/tasks/components/HrActionDialog";
import { HrCorrectiveAckPanel } from "@/features/hr/tasks/components/HrCorrectiveAckPanel";
import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
import { HrFailureResolveDialog } from "@/features/hr/tasks/components/HrFailureResolveDialog";
import {
    HrRefusalNotice,
    HrRefusalReference,
} from "@/features/hr/tasks/components/HrRefusalNotice";
import {
    cancelInstance,
    decideStep,
    escalateStep,
    fetchHrInstance,
    markNoticeRead,
    withdrawInstance,
} from "@/features/hr/tasks/service";
import { HR_NOT_PROVIDED } from "@/features/hr/constants";
import { hrTasksHref } from "@/features/hr/routes";
import { HrAccessDenied } from "@/features/hr/shared/HrAccessDenied";
import { HrEmployerSubstitutionNotice } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { relativeDue } from "@/features/hr/tasks/urgency";
import type {
    HrDecisionIntent,
    HrInboxChange,
    HrInboxNotice,
    HrInstanceDetail,
    HrRefusal,
} from "@/features/hr/tasks/types";
import {
    HR_DECISION_REQUIRES_REASON,
    HR_DECISION_VERB,
    isRefusal,
} from "@/features/hr/tasks/types";
import { ProTextarea } from "@/components/official/ProTextarea";

type Row = Record<string, unknown>;

function str(row: Row | undefined, key: string): string | null {
    const value = row?.[key];
    return typeof value === "string" ? value : null;
}

function bool(row: Row | undefined, key: string): boolean {
    return row?.[key] === true;
}

/**
 * The decision panel — `/hr/tasks/{instance}?step={step}`.
 *
 * AR2's requirement is that the notification and the object are one click apart,
 * so this opens with the approve/reject control FOCUSED (SPEC-WORKFLOW-ENGINE
 * §6.2). A link that lands you on a list containing the item fails it.
 *
 * 🚨 THE SENSITIVITY SPLIT SURVIVES HERE TOO. A restricted-tier instance renders
 * its own contentless summary; the amounts, names and reasons behind it are only
 * ever read through SPEC-ACCESS's audited path, on the record's own surface. The
 * panel shows the DECISION, not the payload.
 */
export function HrDecisionPanel({
    instanceId,
    stepId,
    noticeId,
    failureId,
    embedded = false,
    onDecided,
}: {
    instanceId: string;
    stepId: string | null;
    noticeId: string | null;
    /** From `?failure=` — the inbox's failure rows deep-link straight to their terminal. */
    failureId: string | null;
    /**
     * 🚨 THE SAME PANEL, HOSTED SOMEWHERE ELSE — NOT A SECOND ONE (hr_c4_55 / D9).
     *
     * `/hr/tasks` has a small window control beside each row, and it opened `DataRowInspector`:
     * a floating window titled "Leave request — Tomo Iversen-G32" whose entire body was
     * `STEP_ID … / INSTANCE_ID … / FLOW_KEY leave_request / STEP_KEY manager_approval / DUE_AT …
     * / AUTONOMY_MODE 4 / RESOLUTION_PATH authority`, with no Approve and no Reject. A raw field
     * dump handed to a manager as the item's detail.
     *
     * The fix is to host THIS component there, because the alternative — rebuilding the summary
     * and the four controls inside the table — forks the reason rules, the refusal rendering, the
     * quorum counter and the never-approve-yourself guard, and this lane has already paid for a
     * forked decision path once. `embedded` only drops the "All HR tasks" back link, which is
     * meaningless in a window opened from that very list.
     */
    embedded?: boolean;
    /** Lets a host list (the task table's window) refresh after a decision is recorded here. */
    onDecided?: () => void;
}) {
    /*
      🚨 THE BACK LINK CARRIES THE EMPLOYER. It used to be `<Link href="/hr/tasks">`, and this
      panel is the body of EVERY task detail page — so the one control most likely to be pressed
      on the whole surface was the one that dropped `?org=`. `routes.ts` made all 49 builders
      require `org` on 2026-08-28, which cannot reach a string literal: `hrTasksHref()` is a
      compile error, `"/hr/tasks"` is a valid string. The tasks lane does not scope its rows by
      employer TODAY, so this dropped the param without yet changing what was listed — a latent
      defect that becomes a live one the day that lane scopes, and a visibly wrong URL either way.
    */
    const { orgRef } = useHrContext();

    const [detail, setDetail] = useState<HrInstanceDetail | null>(null);
    const [refusal, setRefusal] = useState<HrRefusal | null>(null);
    const [actionRefusal, setActionRefusal] = useState<HrRefusal | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const approveRef = useRef<HTMLButtonElement>(null);

    // Every state-changing control owns a locally-mounted dialog. Nothing here goes through the
    // global imperative confirm(), whose dynamic host can swallow the first click after load.
    const [escalateOpen, setEscalateOpen] = useState(false);
    const [escalateReason, setEscalateReason] = useState("");
    const [escalateOutcome, setEscalateOutcome] = useState<string | null>(null);
    const [closeAction, setCloseAction] = useState<"withdraw" | "cancel" | null>(null);
    const [closeReason, setCloseReason] = useState("");
    const [closeOutcome, setCloseOutcome] = useState<string | null>(null);
    const [dialogRefusal, setDialogRefusal] = useState<HrRefusal | null>(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [failureOpen, setFailureOpen] = useState(failureId !== null);
    const [pickedFailure, setPickedFailure] = useState<{ id: string; failureClass: string } | null>(
        null,
    );

    async function load() {
        setLoading(true);
        try {
            const envelope = await fetchHrInstance(instanceId);
            if (isRefusal(envelope)) {
                setRefusal(envelope);
                setDetail(null);
            } else {
                setDetail(envelope.data);
                setRefusal(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "This request could not be loaded");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
        // SPEC-NOTIFICATIONS §5.2 — following the deep link is what stamps the
        // read. Idempotent by the spine's RPC, so a refresh is not a second read.
        if (noticeId) void markNoticeRead(noticeId, "in_app");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId, noticeId]);

    useEffect(() => {
        if (!loading && detail) approveRef.current?.focus();
    }, [loading, detail]);

    const instance: Row = detail?.instance ?? {};
    const steps: Row[] = detail?.steps ?? [];
    const step = stepId ? steps.find((s) => s.id === stepId) : steps.find((s) => s.state === "active");
    const restricted = str(instance, "sensitivity_tier") === "restricted";
    const activeStep = step && step.state === "active" ? step : undefined;
    // 🚨 THE LABEL IS THE DOOR'S ANSWER, NOT A SENTENCE SOMEBODY TYPED.
    // `hr.wf_decide` refuses an empty reason on approval when EITHER the step definition or the
    // flow type asks for one, and `hr._wf_display` now reports that disjunction per step. The
    // field used to read "required to reject or return" on steps that required it to APPROVE, so
    // a verifier's first click was refused beside a label promising it would not be.
    const reasonRequiredToApprove = bool(activeStep, "requires_reason_on_approve");
    /*
      The change the door decorated this step with. Read off the step being decided —
      `hr_wf_instance` merges `hr._wf_display` into every step, which is the one place
      that decides whether this caller may be told. Parsed defensively rather than cast:
      a decision surface must never render a diff it inferred, so an entry missing its
      field name is DROPPED, not guessed at.
    */
    const shownStep = step ?? activeStep;
    const stepChange: HrInboxChange[] = Array.isArray(shownStep?.change)
        ? (shownStep.change as unknown[]).flatMap((raw) => {
              if (!raw || typeof raw !== "object") return [];
              const entry = raw as Record<string, unknown>;
              const field = typeof entry.field === "string" ? entry.field : null;
              if (!field) return [];
              return [
                  {
                      field,
                      label: typeof entry.label === "string" ? entry.label : field,
                      from: typeof entry.from === "string" ? entry.from : null,
                      to: typeof entry.to === "string" ? entry.to : null,
                  },
              ];
          })
        : [];
    const stepDigest = str(shownStep, "digest");

    /*
      🚨 ONE LABEL PATH FOR OPEN AND CLOSED. `flow_label` is decorated onto STEPS,
      and `shownStep` is the ACTIVE one — which a closed instance does not have. So
      the heading fell back to the raw `flow_key` the moment a request finished, and
      the closed record is exactly what somebody reads months later. Any decorated
      step carries the same label, so the label is taken from whichever one has it.
    */
    const flowLabel =
        str(shownStep, "flow_label") ||
        str(steps.find((s) => str(s, "flow_label")), "flow_label") ||
        str(instance, "flow_key");

    /*
      🚨 NEVER-APPROVE-YOURSELF IS THE ONE DECISION THIS RULE EXISTS FOR.
      The door is right — it refuses the subject with WF_NOT_APPROVER and an audit
      id — but four controls whose ONLY possible outcome is that refusal sat on the
      subject's own request. SPEC-UI-IA §4.2: an action the surface's law says can
      NEVER be performed is ABSENT, with its reason worded where it would have been.
      "Never" is exact here: separation of duties does not soften with time, another
      approver, or a different date, so a disabled button would imply a state that
      cannot arrive.
    */
    /*
      🚨 THE DOOR ANSWERS THIS, BECAUSE IT IS AN IDENTITY FACT.
      This used to compare `subject_employment_id` against
      `hr_my_context().active.employment_id` — which resolves through
      hr._l1_self_employment(uid, org, TODAY) and is therefore DATE-SCOPED. For a
      PRE-START hire it is null, so the comparison was false for exactly the
      people whose requests are filed before their start date, and the guard
      silently stopped firing: a subject saw the decider's four controls,
      byte-identical. Whether a request is ABOUT ME does not depend on whether I
      am employed today (hr_c4_39 / hr_l3_88), so `_wf_display` resolves it once
      from the login on the subject's employment.
    */
    const viewerIsSubject = bool(shownStep, "viewer_is_subject");

    /*
      🚨 THE ONE FLOW WHOSE SELF-STEP IS THE POINT. `corrective_action_ack`'s
      `acknowledge` step resolves to the SUBJECT (`resolver_kind: fixed_user`,
      `employment_source: subject`, `allows_self: true`) — so the subject is the
      decider and both of the branches below are wrong for them. Keyed on the flow
      key and the step key, never on "the viewer is the subject", because plenty of
      other flows have a subject looking at their own request who genuinely may not
      decide it. `target_id` IS the corrective action's id: the instance targets the
      record, and the acknowledge door finds the open step from it, so nothing here
      has to teach a person what a workflow instance is.
    */
    const isCorrectiveAck =
        str(instance, "flow_key") === "corrective_action_ack" &&
        str(activeStep, "step_key") === "acknowledge" &&
        viewerIsSubject;
    const correctiveActionId = isCorrectiveAck ? str(instance, "target_id") : null;
    const openFailures = (detail?.failures ?? []).filter(
        (f) => f.state === "open" || f.state === "retrying",
    );

    async function act(intent: HrDecisionIntent) {
        if (!activeStep) return;
        // ONE translation, from the ONE map. Nothing below this line knows the intent word.
        const decision = HR_DECISION_VERB[intent];
        if (HR_DECISION_REQUIRES_REASON.includes(decision) && reason.trim().length < 3) {
            toast.error("A rejection or return needs a reason — it is kept in the ledger.");
            return;
        }
        // The step-level requirement, in the door's own words rather than a paraphrase.
        if (decision === "approved" && reasonRequiredToApprove && reason.trim().length < 3) {
            toast.error("This step requires a reason on approval — it is kept in the ledger.");
            return;
        }
        setBusy(true);
        setActionRefusal(null);
        try {
            const envelope = await decideStep(
                String(activeStep.id),
                decision,
                reason.trim() || null,
            );
            if (isRefusal(envelope)) {
                setActionRefusal(envelope);
                return;
            }
            toast.success(`Recorded: ${decision}`);
            setReason("");
            await load();
            // A decided row must not sit in the queue behind the window that decided it.
            onDecided?.();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "The decision could not be recorded");
        } finally {
            setBusy(false);
        }
    }

    if (error) {
        return (
            <div className="p-6 text-sm">
                <p className="font-medium text-destructive">This request could not be loaded.</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
                    Try again
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/*
              🚨 THE DEEP-LINK LANDING OWES THE DISCLOSURE, AND NOTHING ABOVE IT PROVIDES ONE.
              This is the route every HR notification points at, and it mounts `PageHeader` —
              not `HrShell` — so until 2026-08-29 it was the one surface where HR could open a
              DIFFERENT employer than the link named and say nothing (`useHrContext` law B).
              Proven live: `/hr/tasks/<instance>?org=<unreachable>` rendered another employer's
              pay change in silence while `/hr?org=<same>` stated the swap. Renders null in the
              ordinary case. `embedded` drops it because the host surface already states it.
            */}
            {embedded ? null : (
                <HrEmployerSubstitutionNotice className="mx-4 mt-3 shrink-0" />
            )}
            {/* Embedded, the back link points at the list this window was opened FROM, so it is
                dropped — but the restricted banner is a disclosure fact and is never dropped, so
                the bar survives whenever there is something in it. */}
            {embedded && !restricted ? null : (
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    {embedded ? null : (
                        <Button size="sm" variant="ghost" asChild>
                            <Link href={hrTasksHref(orgRef)}>
                                <ArrowLeft className="mr-1 h-4 w-4" />
                                All HR tasks
                            </Link>
                        </Button>
                    )}
                    {restricted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <EyeOff className="h-3 w-3" />
                            Restricted — the record itself is the only place its details render
                        </span>
                    ) : null}
                </div>
            )}

            <div className="flex-1 min-h-0 space-y-6 overflow-y-auto p-4">
                {/*
                    🚨 A REFUSAL TO OPEN IS A READ GATE, AND READ GATES ARE THE
                    PLATFORM'S SCREEN (owner ruling, 2026-08-30). With no detail
                    beside it, this notice WAS the page — a bespoke HR panel
                    where every other blocked surface in the product shows one
                    canonical refusal. It now renders through that frame, still
                    carrying the engine's own sentence and its Refusal reference.

                    ABSOLUTE, with no request affordance: a workflow instance can
                    be an incident or a corrective action, so "Request access"
                    here would confirm to an accused person that a case about
                    them exists — the §5 subject-exclusion veto. There is no
                    `employerRef`, so `HrAccessDenied` stays absolute by default.

                    A refusal that arrives ALONGSIDE a rendered detail is a
                    partial one (a withheld section, a refused action) — that
                    stays the inline notice, which is the right instrument for a
                    fact inside a page the person can otherwise read.
                */}
                {refusal && !detail ? (
                    <HrAccessDenied
                        sentence={
                            refusal.detail?.trim() ||
                            "This request isn't yours to open here."
                        }
                        fallbackHref={hrTasksHref(orgRef)}
                        fallbackLabel="All HR tasks"
                        footer={<HrRefusalReference refusal={refusal} />}
                    />
                ) : null}
                {refusal && detail ? (
                    <HrRefusalNotice refusal={refusal} action="Opening this request" />
                ) : null}
                {loading && !detail ? (
                    <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
                ) : null}

                {detail ? (
                    <>
                        <header className="space-y-1">
                            <h1 className="text-lg font-semibold text-foreground">
                                {/* 🚨 The person, not just the flow. An approver who cannot see
                                    whose pay change this is is being asked for a signature, not a
                                    decision (T-L10-5). The door decides whether they may be told;
                                    this only renders the answer. */}
                                {/* `flow_label` is the human name of the kind ("Address
                                    change"); `flow_key` is the machine one (`address_change`)
                                    and was being shown as the heading of the whole screen. */}
                                {(() => {
                                    const kind =
                                        flowLabel;
                                    return detail.subject_label
                                        ? `${kind} — ${detail.subject_label}`
                                        : kind;
                                })()}
                            </h1>
                            {detail.subject_withheld ? (
                                <p className="text-xs text-muted-foreground">
                                    The subject is not shown to you — this flow is restricted and
                                    you are not one of its approvers.
                                </p>
                            ) : null}
                            <p className="text-sm text-muted-foreground">
                                {str(instance, "state")}
                                {str(instance, "state_reason")
                                    ? ` — ${str(instance, "state_reason")}`
                                    : ""}
                            </p>
                            {/*
                                🚨 WHAT THIS DECISION ACTUALLY CHANGES.
                                A legal name change was APPROVED here on a screen showing a
                                flow key, a table token and a bare uuid — the name itself
                                appeared nowhere, though the server held it the whole time
                                and returned it in the approve response. Somebody was asked
                                to agree to something nobody had told them, and the surface
                                gave them no way to know that.

                                `hr._wf_display` now answers it, and the door decides who may
                                be told: this renders nothing when the change is withheld,
                                exactly as the subject line does.
                            */}
                            {stepChange.length > 0 ? (
                                <dl className="mt-2 space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2">
                                    {stepChange.map((entry) => (
                                        <div
                                            key={entry.field}
                                            className="flex flex-wrap items-baseline gap-x-2 text-sm"
                                        >
                                            <dt className="text-xs font-medium text-muted-foreground">
                                                {entry.label}
                                            </dt>
                                            <dd className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="text-muted-foreground line-through">
                                                    {entry.from ?? HR_NOT_PROVIDED}
                                                </span>
                                                <span aria-hidden className="text-muted-foreground">
                                                    →
                                                </span>
                                                <span className="font-medium text-foreground">
                                                    {entry.to ?? HR_NOT_PROVIDED}
                                                </span>
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : stepDigest ? (
                                <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                                    {stepDigest}
                                </p>
                            ) : null}
                            {/*
                                The record's address, kept reachable but out of the sentence —
                                a table token and a uuid are for whoever debugs this, not for
                                the person deciding.
                            */}
                            {str(instance, "target_token") ? (
                                <details className="mt-1">
                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                        Record reference
                                    </summary>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {str(instance, "target_token")}{" "}
                                        <span className="font-mono">
                                            {str(instance, "target_id")}
                                        </span>
                                    </p>
                                </details>
                            ) : null}
                        </header>

                        {actionRefusal ? (
                            <HrRefusalNotice refusal={actionRefusal} action="Your decision" />
                        ) : null}

                        {activeStep ? (
                            <section className="space-y-3 rounded-lg border border-border bg-card p-4">
                                <div className="flex flex-wrap items-baseline gap-2">
                                    {/* 🚨 THE STEP IS NAMED, NOT KEYED. This heading — directly
                                        above the Approve / Reject controls, on a page whose every
                                        other line is a sentence — read `manager_approval`.
                                        `hr._wf_display` has returned `step_label` (the step
                                        definition's own label: "Manager approval of the change")
                                        for every decorated step all along, and
                                        `public.hr_wf_instance` decorates EVERY step, so this is
                                        the same label path the flow heading already uses. The key
                                        stays only as the fallback for a step with no definition
                                        behind it. */}
                                    <h2 className="text-sm font-semibold">
                                        {str(activeStep, "step_label") ??
                                            str(activeStep, "step_key")}
                                    </h2>
                                    <span className="text-xs text-muted-foreground">
                                        due {relativeDue(str(activeStep, "due_at"))}
                                    </span>
                                    {typeof activeStep.approvals_needed === "number" ? (
                                        <span className="text-xs text-muted-foreground">
                                            {String(activeStep.approvals_received ?? 0)} of{" "}
                                            {String(activeStep.approvals_needed)} approvals
                                        </span>
                                    ) : null}
                                </div>
                                {/* 🚨 A SELF-STEP IS NOT A SELF-APPROVAL, AND THE TWO MUST NOT
                                    SHARE A BRANCH. `corrective_action_ack`'s `acknowledge` step
                                    is `allows_self` BY DESIGN — the subject is the decider,
                                    because the whole point is that the person being warned reads
                                    it and responds. Falling into `viewerIsSubject` would tell
                                    them "it is not yours to decide" and render NO controls, which
                                    is the acknowledgment being blocked by a sentence about
                                    somebody else's approval. And falling into the generic branch
                                    would offer them Approve / Reject / Return / Escalate on a
                                    warning about themselves — inviting the reading that signing
                                    means agreeing, which §4.8's preserved-disagreement rule
                                    exists to prevent. So this flow gets its own panel, before
                                    both. */}
                                {isCorrectiveAck && correctiveActionId ? (
                                    <HrCorrectiveAckPanel
                                        correctiveActionId={correctiveActionId}
                                        onDone={() => {
                                            void load();
                                            onDecided?.();
                                        }}
                                    />
                                ) : viewerIsSubject ? (
                                    <p className="text-sm text-muted-foreground">
                                        This is your own request, so it is not yours to
                                        decide — somebody else approves it. You can see
                                        where it has got to above.
                                    </p>
                                ) : (
                                  <>
                                <ProTextarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={
                                        reasonRequiredToApprove
                                            ? "Reason — required for EVERY decision on this step, kept in the decision ledger"
                                            : "Reason — required to reject or return, kept in the decision ledger"
                                    }
                                    rows={3}
                                />
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        ref={approveRef}
                                        disabled={busy}
                                        onClick={() => void act("approve")}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => void act("reject")}
                                    >
                                        Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => void act("return")}
                                    >
                                        Return for changes
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => {
                                            setEscalateReason(reason.trim());
                                            setDialogRefusal(null);
                                            setEscalateOutcome(null);
                                            setEscalateOpen(true);
                                        }}
                                    >
                                        Escalate
                                    </Button>
                                </div>
                                  </>
                                )}
                            </section>
                        ) : (
                            <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                                {steps.length === 0
                                    ? "This request has no steps yet."
                                    : openFailures.length > 0
                                      ? "Nothing here is waiting on a decision — this request is held by a failure, below."
                                      : "Nothing on this request is waiting on you right now."}
                            </section>
                        )}

                        {/* 🚨 THE ESCAPE HATCH FOR THE STUCK CLASS.
                            When a step goes `unroutable` — nobody eligible, escalation exhausted —
                            the decision controls correctly disappear, because nobody CAN decide.
                            Without this section the request becomes a dead end: a live instance,
                            visible, with no control on it at all. The failure row is the handle,
                            so it belongs on the request as well as in the inbox. */}
                        {openFailures.length > 0 ? (
                            <section className="space-y-2">
                                <h2 className="text-sm font-semibold">Holding this request</h2>
                                <ul className="divide-y divide-border rounded-lg border border-destructive/40 bg-card text-sm">
                                    {openFailures.map((f) => (
                                        <li key={String(f.id)} className="flex items-center gap-3 p-3">
                                            <span className="truncate font-medium">
                                                {str(f, "failure_class")}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {str(f, "state")}
                                            </span>
                                            {/* 🚨 THE SENTENCE, NOT THE HOOK'S OUTPUT (hr_c4_57).
                                                This read `detail` — `hr.workflow_failure.detail`,
                                                which is a jsonb OBJECT on every live row, so
                                                `str()` returned null and this line has never once
                                                rendered. Had it ever held a JSON string it would
                                                have printed `hr._wf_call_hook`'s own
                                                `{sqlstate, detail: sqlerrm}` text — a Postgres
                                                column name — to an HR manager. The door now ships
                                                `failure_reason`, built from the failure CLASS
                                                alone, exactly as a delivery failure is worded. */}
                                            {str(f, "failure_reason") ? (
                                                <span className="truncate text-muted-foreground">
                                                    {str(f, "failure_reason")}
                                                </span>
                                            ) : null}
                                            <Button
                                                className="ml-auto shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    setPickedFailure({
                                                        id: String(f.id),
                                                        failureClass:
                                                            str(f, "failure_class") ?? "failure",
                                                    })
                                                }
                                            >
                                                Resolve
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Steps</h2>
                            <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
                                {steps.map((s) => (
                                    <li key={String(s.id)} className="flex items-center gap-3 p-3">
                                        {/* The chain read `auto_approve / manager_approval /
                                            hr_review` — three machine keys presented to a manager
                                            as the record of what happened. Same label path as the
                                            active step above. */}
                                        <span className="truncate font-medium">
                                            {str(s, "step_label") ?? str(s, "step_key")}
                                        </span>
                                        <span className="text-muted-foreground">{str(s, "state")}</span>
                                        {str(s, "resolution_path") ? (
                                            <span className="ml-auto text-xs text-muted-foreground">
                                                via {str(s, "resolution_path")}
                                            </span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Decisions</h2>
                            {detail.decisions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing has been decided yet.
                                </p>
                            ) : (
                                <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
                                    {detail.decisions.map((d) => (
                                        <li key={String(d.id)} className="space-y-1 p-3">
                                            <div className="flex gap-2">
                                                <span className="font-medium">{str(d, "decision")}</span>
                                                <span className="text-muted-foreground">
                                                    {str(d, "decided_at")
                                                        ? new Date(
                                                              String(d.decided_at),
                                                          ).toLocaleString()
                                                        : ""}
                                                </span>
                                            </div>
                                            {str(d, "reason") ? (
                                                <p className="text-muted-foreground">
                                                    {str(d, "reason")}
                                                </p>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">What was sent about this</h2>
                            <div className="rounded-lg border border-border bg-card p-3">
                                {/* This section IS the question "what was sent about this", and
                                    it has a full-width card to answer it in — so the rendered
                                    sentence is shown whole rather than truncated. */}
                                <HrDeliveryState
                                    notices={detail.notices}
                                    showBody
                                />
                            </div>
                        </section>

                        {str(instance, "requester_employment_id") ? (
                            <section className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setCloseReason(reason.trim());
                                        setDialogRefusal(null);
                                        setCloseOutcome(null);
                                        setCloseAction("withdraw");
                                    }}
                                >
                                    Withdraw
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setCloseReason(reason.trim());
                                        setDialogRefusal(null);
                                        setCloseOutcome(null);
                                        setCloseAction("cancel");
                                    }}
                                >
                                    Cancel
                                </Button>
                            </section>
                        ) : null}
                    </>
                ) : null}
            </div>

            {/* §1.9 pass 4's escape hatch, with the reason the engine actually stores. */}
            <HrActionDialog
                open={escalateOpen}
                onOpenChange={setEscalateOpen}
                title="Escalate this step?"
                description="The engine re-resolves the approver EXCLUDING whoever holds it now, and tells both parties. If escalation itself reaches nobody, it says so rather than parking the step."
                confirmLabel="Escalate"
                reason={escalateReason}
                onReasonChange={setEscalateReason}
                reasonPlaceholder="Why is this being escalated? Stored on the step and sent to both parties."
                busy={dialogBusy}
                refusal={dialogRefusal}
                outcome={escalateOutcome}
                onConfirm={async () => {
                    if (!activeStep) return;
                    setDialogBusy(true);
                    setDialogRefusal(null);
                    try {
                        const envelope = await escalateStep(
                            String(activeStep.id),
                            escalateReason.trim() || null,
                        );
                        if (isRefusal(envelope)) {
                            setDialogRefusal(envelope);
                            return;
                        }
                        const r = envelope.data;
                        // Name who it reached. "Escalated" with no audience is how an operator
                        // ends up believing a step moved when it did not.
                        setEscalateOutcome(
                            r.state === "skipped"
                                ? `The step was skipped${r.reason ? ` — ${r.reason}` : ""}.`
                                : r.user_ids && r.user_ids.length > 0
                                  ? `Escalated. It now sits with ${r.user_ids.length} approver${
                                        r.user_ids.length === 1 ? "" : "s"
                                    }.`
                                  : "Escalated.",
                        );
                        await load();
                    } catch (e) {
                        setDialogRefusal({
                            granted: false,
                            reason: "transport_failed",
                            detail: e instanceof Error ? e.message : "The escalation could not be sent.",
                            audit_id: null,
                        });
                    } finally {
                        setDialogBusy(false);
                    }
                }}
            />

            <HrActionDialog
                open={closeAction !== null}
                onOpenChange={(open) => !open && setCloseAction(null)}
                title={closeAction === "cancel" ? "Cancel this request?" : "Withdraw this request?"}
                description={
                    closeAction === "cancel"
                        ? "Cancelling closes it for everyone. The history stays — an instance is evidence and is never deleted."
                        : "Withdrawing closes it. The history stays — an instance is evidence and is never deleted."
                }
                confirmLabel={closeAction === "cancel" ? "Cancel request" : "Withdraw"}
                variant="destructive"
                reason={closeReason}
                onReasonChange={setCloseReason}
                reasonMode={closeAction === "cancel" ? "required" : "optional"}
                reasonPlaceholder="Reason — kept with the instance."
                busy={dialogBusy}
                refusal={dialogRefusal}
                outcome={closeOutcome}
                onConfirm={async () => {
                    if (!closeAction) return;
                    setDialogBusy(true);
                    setDialogRefusal(null);
                    try {
                        const envelope =
                            closeAction === "cancel"
                                ? await cancelInstance(instanceId, closeReason.trim() || null)
                                : await withdrawInstance(instanceId, closeReason.trim() || null);
                        if (isRefusal(envelope)) {
                            setDialogRefusal(envelope);
                            return;
                        }
                        setCloseOutcome(
                            closeAction === "cancel"
                                ? "Cancelled. The history stays."
                                : "Withdrawn. The history stays.",
                        );
                        await load();
                    } catch (e) {
                        setDialogRefusal({
                            granted: false,
                            reason: "transport_failed",
                            detail: e instanceof Error ? e.message : "That could not be sent.",
                            audit_id: null,
                        });
                    } finally {
                        setDialogBusy(false);
                    }
                }}
            />

            {/* `?failure=` from the inbox's failure rows lands straight on the terminal. */}
<HrFailureResolveDialog
                failureId={pickedFailure?.id ?? (failureOpen ? failureId : null)}
                failureClass={
                    pickedFailure?.failureClass ??
                    (failureId
                        ? (str(
                              (detail?.failures ?? []).find((f) => f.id === failureId) ?? {},
                              "failure_class",
                          ) ?? null)
                        : null)
                }
                open={pickedFailure !== null || (failureOpen && failureId !== null)}
                onOpenChange={(open) => {
                    if (open) return;
                    setPickedFailure(null);
                    setFailureOpen(false);
                }}
                onResolved={load}
            />
        </div>
    );
}
