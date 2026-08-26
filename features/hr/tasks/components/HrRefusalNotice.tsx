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
                <p className="font-mono text-xs text-muted-foreground">
                    {refusal.reason}
                    {refusal.audit_id ? ` · recorded as ${refusal.audit_id}` : ""}
                </p>
            </div>
        </div>
    );
}
