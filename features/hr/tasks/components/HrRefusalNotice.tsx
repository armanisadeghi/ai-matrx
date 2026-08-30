"use client";

import { ShieldAlert } from "lucide-react";

import type { HrRefusal } from "@/features/hr/tasks/types";

/**
 * The engine refuses by ENVELOPE, never by raising — so a refusal is a fact the
 * person is entitled to see, in the place they tried to act, with the sentence
 * the database actually wrote. Never a generic "something went wrong", never a
 * silent empty list: an empty list reads as "nothing is waiting on you", which
 * is the one lie an approval inbox must never tell.
 */
export function HrRefusalNotice({
    refusal,
    action,
}: {
    refusal: HrRefusal;
    /** What the person was trying to do, so the sentence has a subject. */
    action?: string;
}) {
    return (
        <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
        >
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground">
                    {action ? `${action} was refused` : "This was refused"}
                </p>
                <p className="text-sm text-muted-foreground">
                    {refusal.detail ?? "The system gave no reason, which is itself a defect."}
                </p>
                {/*
                    🚨 THE MACHINE TOKEN GOES IN THE DISCLOSURE, NOT THE BODY.
                    `WF_TARGET_CHANGED` was printed as visible body text, two inches
                    below a disclosure built for exactly this kind of thing. The
                    sentence above already says what happened in words; the token and
                    the audit id are for whoever has to trace it afterwards, and
                    putting them in the flow of the message makes a refusal look like
                    a crash to the person it is explaining something to.
                */}
                <HrRefusalReference refusal={refusal} />
            </div>
        </div>
    );
}

/**
 * 🚨 "Refusal reference", NOT "Record reference" — the two are inches apart on the
 * decision surface and hold DIFFERENT things. `HrDecisionPanel`'s "Record
 * reference" holds the record's address (`target_token` + `target_id`); this one
 * holds the reason code and the audit id of the refusal itself. Naming both the
 * same would promise a reader the same contents and hand them something else — a
 * false label is worse than the vague one it replaced.
 *
 * Exported because a refusal to OPEN now renders through the platform's canonical
 * access-denied frame (owner ruling, 2026-08-30) and hands this in as its
 * `footer`. The frame knows nothing about reason codes; HR does not lose them by
 * moving in. ONE definition, two hosts — never a second copy.
 */
export function HrRefusalReference({ refusal }: { refusal: HrRefusal }) {
    if (!refusal.reason && !refusal.audit_id) return null;
    return (
        <details className="pt-0.5">
            <summary className="cursor-pointer text-xs text-muted-foreground">
                Refusal reference
            </summary>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                {refusal.reason}
                {refusal.audit_id ? ` · recorded as ${refusal.audit_id}` : ""}
            </p>
        </details>
    );
}
