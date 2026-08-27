"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { HrActionDialog } from "@/features/hr/tasks/components/HrActionDialog";
import { resolveFailure } from "@/features/hr/tasks/service";
import type { HrFailureAction, HrRefusal } from "@/features/hr/tasks/types";
import { isRefusal } from "@/features/hr/tasks/types";

/**
 * The four actions the door accepts. Anything else comes back `unknown_action`, so the picker is
 * the closed set rather than a free-text field — and each carries the sentence that tells an
 * operator which one they actually want, because "retry" and "resolve" are not obviously different
 * to someone looking at a stuck request for the first time.
 */
const ACTIONS: { key: HrFailureAction; label: string; blurb: string; destructive?: boolean }[] = [
    {
        key: "retry",
        label: "Retry",
        blurb: "Run it again. The retry reclaims the binding the failure released, and says plainly if a newer request has taken the slot.",
    },
    {
        key: "resolve",
        label: "Mark resolved",
        blurb: "The thing that failed was handled outside the system. The note is the record of what was done.",
    },
    {
        key: "reassign",
        label: "Reassign",
        blurb: "Hand the failure to someone else to deal with. It stays open until they close it.",
    },
    {
        key: "abandon",
        label: "Abandon",
        blurb: "Give up on the request. This CANCELS the whole instance — the history stays, the work does not continue.",
        destructive: true,
    },
];

/**
 * The failure-resolution terminal for the stuck-failure class.
 *
 * A `hr.workflow_failure` row is what an approval turns into when the engine cannot finish it —
 * an unroutable step, an ineligible approver, an apply hook that failed, a result nobody
 * confirmed. Before this dialog the inbox LISTED those rows and offered nothing to do about them,
 * which is the worst shape a queue can take: a permanent reminder of something you cannot act on.
 *
 * Every path here renders the door's own answer. A note is mandatory because the door requires
 * one, and the resolved failure leaves both lists because the caller reloads on success.
 */
export function HrFailureResolveDialog({
    failureId,
    failureClass,
    open,
    onOpenChange,
    onResolved,
}: {
    failureId: string | null;
    failureClass: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a successful resolution so the caller can refetch and drop the row. */
    onResolved: () => void | Promise<void>;
}) {
    const [action, setAction] = useState<HrFailureAction>("retry");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<HrRefusal | null>(null);
    const [outcome, setOutcome] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setAction("retry");
        setNote("");
        setRefusal(null);
        setOutcome(null);
    }, [open, failureId]);

    const chosen = ACTIONS.find((a) => a.key === action) ?? ACTIONS[0];

    async function run() {
        if (!failureId) return;
        setBusy(true);
        setRefusal(null);
        try {
            const envelope = await resolveFailure(failureId, action, note.trim());
            if (isRefusal(envelope)) {
                setRefusal(envelope);
                return;
            }
            const result = envelope.data;
            // Say what actually happened, including the retry's OWN answer — a retry that was
            // itself refused is not a resolved failure, and reporting it as one is the lie this
            // whole surface exists to avoid.
            const parts: string[] = [];
            parts.push(`Recorded as ${result.action ?? action}.`);
            if (result.state) parts.push(`The failure is now ${result.state}.`);
            if (result.outcome) parts.push(`Outcome: ${result.outcome}.`);
            if (result.retry_granted === false) {
                parts.push(
                    `The retry itself did not go through${
                        result.retry_reason ? ` — ${result.retry_reason}` : ""
                    }, so this failure is still live.`,
                );
            } else if (result.retry_granted === true) {
                parts.push("The retry ran.");
            }
            setOutcome(parts.join(" "));
            await onResolved();
        } catch (e) {
            setRefusal({
                granted: false,
                reason: "transport_failed",
                detail: e instanceof Error ? e.message : "The resolution could not be sent.",
                audit_id: null,
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <HrActionDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Resolve this failure"
            description={
                failureClass
                    ? `A ${failureClass} failure is holding this request. Say what should happen to it.`
                    : "Say what should happen to this failure."
            }
            confirmLabel={chosen.label}
            variant={chosen.destructive ? "destructive" : "default"}
            reason={note}
            onReasonChange={setNote}
            reasonMode="required"
            reasonPlaceholder="What was done about it? Required — it is the record for whoever reads this next."
            busy={busy}
            refusal={refusal}
            outcome={outcome}
            extra={
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                        {ACTIONS.map((option) => (
                            <Button
                                key={option.key}
                                size="sm"
                                variant={option.key === action ? "default" : "outline"}
                                disabled={busy}
                                onClick={() => setAction(option.key)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{chosen.blurb}</p>
                </div>
            }
            onConfirm={run}
        />
    );
}
