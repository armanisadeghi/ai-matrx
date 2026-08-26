"use client";

import { Mail, MessageSquare, Bell, AlertTriangle } from "lucide-react";

import type { HrInboxNotice } from "@/features/hr/tasks/types";

const CHANNEL_ICON: Record<string, typeof Mail> = {
    email: Mail,
    sms: MessageSquare,
    in_app: Bell,
};

/**
 * SPEC-UI-IA §5.9 — "each row shows delivery and read state where a notification
 * was sent; the notification's outcome lives with the task, not in a separate
 * log". These rows come from `hr.workflow_notice`, the VIEW over
 * `communication.notification` (SPEC-NOTIFICATIONS §5.3). Nothing is copied.
 *
 * 🚨 SMS RENDERS "delivered" AND NEVER A FAKE READ. A carrier tells us a message
 * arrived; it cannot tell us a person read it. An empty cell would read as a
 * failure and a read tick would be a lie, so the state is named for what we
 * actually know (§5.2).
 */
function stateOf(notice: HrInboxNotice): { label: string; tone: "ok" | "warn" | "muted" } {
    if (notice.failure_reason || notice.status === "dead_letter") {
        return { label: notice.failure_reason ?? "undeliverable", tone: "warn" };
    }
    if (notice.read_at) return { label: "read", tone: "ok" };
    if (notice.delivered_at) return { label: "delivered", tone: "ok" };
    if (notice.sent_at) return { label: "sent", tone: "muted" };
    if (notice.status === "deferred") return { label: "deferred — quiet hours", tone: "muted" };
    return { label: notice.status || "queued", tone: "muted" };
}

export function HrDeliveryState({ notices }: { notices: HrInboxNotice[] | undefined }) {
    if (!notices?.length) {
        return <span className="text-xs text-muted-foreground">No notice sent</span>;
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            {notices.map((notice, index) => {
                const Icon = CHANNEL_ICON[notice.channel] ?? Bell;
                const state = stateOf(notice);
                const Marker = state.tone === "warn" ? AlertTriangle : Icon;
                return (
                    <span
                        key={`${notice.channel}-${notice.sent_at ?? index}`}
                        title={`${notice.channel}: ${state.label}`}
                        className={
                            "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs " +
                            (state.tone === "warn"
                                ? "text-destructive"
                                : state.tone === "ok"
                                  ? "text-foreground"
                                  : "text-muted-foreground")
                        }
                    >
                        <Marker className="h-3 w-3" />
                        {state.label}
                    </span>
                );
            })}
        </div>
    );
}
