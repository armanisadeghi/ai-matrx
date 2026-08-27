"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import { HrActionDialog } from "@/features/hr/tasks/components/HrActionDialog";
import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
import { HrFailureResolveDialog } from "@/features/hr/tasks/components/HrFailureResolveDialog";
import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import {
    cancelInstance,
    decideStep,
    escalateStep,
    fetchHrInstance,
    markNoticeRead,
    withdrawInstance,
} from "@/features/hr/tasks/service";
import { relativeDue } from "@/features/hr/tasks/urgency";
import type {
    HrInboxNotice,
    HrInstanceDetail,
    HrRefusal,
} from "@/features/hr/tasks/types";
import { isRefusal } from "@/features/hr/tasks/types";

type Row = Record<string, unknown>;

function str(row: Row | undefined, key: string): string | null {
    const value = row?.[key];
    return typeof value === "string" ? value : null;
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
}: {
    instanceId: string;
    stepId: string | null;
    noticeId: string | null;
    /** From `?failure=` — the inbox's failure rows deep-link straight to their terminal. */
    failureId: string | null;
}) {
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

    async function act(decision: "approve" | "reject" | "return") {
        if (!activeStep) return;
        if (decision !== "approve" && reason.trim().length < 3) {
            toast.error("A rejection or return needs a reason — it is kept in the ledger.");
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
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Button size="sm" variant="ghost" asChild>
                    <Link href="/hr/tasks">
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        All HR tasks
                    </Link>
                </Button>
                {restricted ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <EyeOff className="h-3 w-3" />
                        Restricted — the record itself is the only place its details render
                    </span>
                ) : null}
            </div>

            <div className="flex-1 min-h-0 space-y-6 overflow-y-auto p-4">
                {refusal ? <HrRefusalNotice refusal={refusal} action="Opening this request" /> : null}
                {loading && !detail ? (
                    <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
                ) : null}

                {detail ? (
                    <>
                        <header className="space-y-1">
                            <h1 className="text-lg font-semibold text-foreground">
                                {str(instance, "flow_key")}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {str(instance, "state")}
                                {str(instance, "state_reason")
                                    ? ` — ${str(instance, "state_reason")}`
                                    : ""}
                            </p>
                            {str(instance, "target_token") ? (
                                <p className="text-xs text-muted-foreground">
                                    About {str(instance, "target_token")}{" "}
                                    <span className="font-mono">{str(instance, "target_id")}</span>
                                </p>
                            ) : null}
                        </header>

                        {actionRefusal ? (
                            <HrRefusalNotice refusal={actionRefusal} action="Your decision" />
                        ) : null}

                        {activeStep ? (
                            <section className="space-y-3 rounded-lg border border-border bg-card p-4">
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <h2 className="text-sm font-semibold">
                                        {str(activeStep, "step_key")}
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
                                <Textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Reason — required to reject or return, kept in the decision ledger"
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
                            </section>
                        ) : (
                            <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                                {steps.length === 0
                                    ? "This request has no steps yet."
                                    : "Nothing on this request is waiting on you right now."}
                            </section>
                        )}

                        <section className="space-y-2">
                            <h2 className="text-sm font-semibold">Steps</h2>
                            <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
                                {steps.map((s) => (
                                    <li key={String(s.id)} className="flex items-center gap-3 p-3">
                                        <span className="truncate font-medium">
                                            {str(s, "step_key")}
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
                                <HrDeliveryState
                                    notices={detail.notices}
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
                failureId={failureId}
                failureClass={
                    failureId
                        ? (str(
                              (detail?.failures ?? []).find((f) => f.id === failureId) ?? {},
                              "failure_class",
                          ) ?? null)
                        : null
                }
                open={failureOpen && failureId !== null}
                onOpenChange={setFailureOpen}
                onResolved={load}
            />
        </div>
    );
}
