"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import type { HrRefusal } from "@/features/hr/tasks/types";

/**
 * The HR inbox's action dialog — one confirm-plus-reason surface for every control that changes
 * something.
 *
 * 🚨 WHY THIS EXISTS INSTEAD OF THE GLOBAL `confirm()`.
 *
 * Escalate used the imperative global `confirm()`, whose host is mounted through
 * `next/dynamic({ ssr: false })`. A click that lands before that chunk hydrates goes into the
 * opener's queue, and — observed live on `/hr/tasks/{instance}` — can sit there: **no dialog, no
 * change, no refusal, no console error.** On the escape hatch for a stuck approval that failure
 * mode is the worst possible one, because the operator's reasonable conclusion is "the button is
 * dead" and the request stays stuck.
 *
 * This dialog is a plain component mounted with the panel. There is no registry, no queue and no
 * dynamic import between the click and the dialog, so the first click after load behaves exactly
 * like the fiftieth.
 *
 * It also does two things `confirm()` structurally cannot:
 *
 * - **Carries the reason.** `hr.wf_escalate` writes `p_reason` into `state_reason` and into the
 *   `hr.workflow.step_escalated` notice both parties receive; `hr.wf_resolve_failure` REFUSES
 *   without a note (`WF_REASON_REQUIRED`). A yes/no dialog cannot collect either, so the reason
 *   was being sent as whatever happened to be in the page's textarea, or as null.
 * - **Renders the answer where the action was taken.** Refusals and outcomes appear INSIDE the
 *   dialog, so the operator sees what the database said without hunting the page for a banner.
 */
export function HrActionDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    variant = "default",
    reason,
    onReasonChange,
    reasonMode = "optional",
    reasonPlaceholder = "Reason — recorded in the ledger",
    busy,
    refusal,
    outcome,
    extra,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    variant?: "default" | "destructive";
    reason: string;
    onReasonChange: (value: string) => void;
    /** `required` blocks the confirm button until a real reason is typed. */
    reasonMode?: "required" | "optional" | "none";
    reasonPlaceholder?: string;
    busy: boolean;
    /** The engine's refusal, rendered in place — never a toast, never swallowed. */
    refusal: HrRefusal | null;
    /** What actually happened, rendered in place, so the dialog is not a black box. */
    outcome: string | null;
    /** Extra controls (an action picker, for instance) above the reason field. */
    extra?: React.ReactNode;
    onConfirm: () => void | Promise<void>;
}) {
    const [touched, setTouched] = useState(false);
    useEffect(() => {
        if (!open) setTouched(false);
    }, [open]);

    const reasonMissing = reasonMode === "required" && reason.trim().length < 3;
    // Once the door has answered, the dialog stays open showing the answer and the button becomes
    // "Done" — closing on success would hide the outcome the operator needs to read.
    const answered = outcome !== null;

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                {refusal ? <HrRefusalNotice refusal={refusal} action={confirmLabel} /> : null}

                {answered ? (
                    <p className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
                        {outcome}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {extra}
                        {reasonMode === "none" ? null : (
                            <div className="space-y-1">
                                <Textarea
                                    value={reason}
                                    onChange={(e) => onReasonChange(e.target.value)}
                                    onBlur={() => setTouched(true)}
                                    placeholder={reasonPlaceholder}
                                    rows={3}
                                    disabled={busy}
                                />
                                {reasonMode === "required" && touched && reasonMissing ? (
                                    <p className="text-xs text-destructive">
                                        The database refuses this without a reason — it records what
                                        was done about the failure, for whoever reads it next.
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {answered ? (
                        <Button onClick={() => onOpenChange(false)}>Done</Button>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant={variant === "destructive" ? "destructive" : "default"}
                                disabled={busy || reasonMissing}
                                onClick={() => void onConfirm()}
                            >
                                {busy ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {confirmLabel}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
