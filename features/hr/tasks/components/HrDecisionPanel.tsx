"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
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
}: {
    instanceId: string;
    stepId: string | null;
    noticeId: string | null;
}) {
    const [detail, setDetail] = useState<HrInstanceDetail | null>(null);
    const [refusal, setRefusal] = useState<HrRefusal | null>(null);
    const [actionRefusal, setActionRefusal] = useState<HrRefusal | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const approveRef = useRef<HTMLButtonElement>(null);

    async function load() {
        setLoading(true);
        try {
            const envelope = await fetchHrInstance(instanceId);
            if (isRefusal(envelope)) {
                setRefusal(envelope);
                setDetail(null);
            } else {
                setDetail(envelope);
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

    const instance = (detail?.instance ?? {}) as Row;
    const steps = (detail?.steps ?? []) as Row[];
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
                                        onClick={async () => {
                                            const ok = await confirm({
                                                title: "Escalate this step?",
                                                description:
                                                    "The engine resolves the next approver up the chain and tells both of you. Your own ability to decide it does not go away.",
                                                confirmLabel: "Escalate",
                                            });
                                            if (!ok) return;
                                            const envelope = await escalateStep(
                                                String(activeStep.id),
                                                reason.trim() || null,
                                            );
                                            if (isRefusal(envelope)) setActionRefusal(envelope);
                                            else await load();
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
                                    {(detail.decisions as Row[]).map((d) => (
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
                                    notices={(detail.notices as unknown as HrInboxNotice[]) ?? []}
                                />
                            </div>
                        </section>

                        {str(instance, "requester_employment_id") ? (
                            <section className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: "Withdraw this request?",
                                            description:
                                                "Withdrawing closes it. The history stays — an instance is evidence and is never deleted.",
                                            variant: "destructive",
                                            confirmLabel: "Withdraw",
                                        });
                                        if (!ok) return;
                                        const envelope = await withdrawInstance(
                                            instanceId,
                                            reason.trim() || null,
                                        );
                                        if (isRefusal(envelope)) setActionRefusal(envelope);
                                        else await load();
                                    }}
                                >
                                    Withdraw
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: "Cancel this request?",
                                            description:
                                                "Cancelling closes it for everyone. The history stays.",
                                            variant: "destructive",
                                            confirmLabel: "Cancel request",
                                        });
                                        if (!ok) return;
                                        const envelope = await cancelInstance(
                                            instanceId,
                                            reason.trim() || null,
                                        );
                                        if (isRefusal(envelope)) setActionRefusal(envelope);
                                        else await load();
                                    }}
                                >
                                    Cancel
                                </Button>
                            </section>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}
