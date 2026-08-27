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
/**
 * 🚨 A DELIVERY-LANE FACT IS NOT AN ERROR ON THIS PAGE.
 *
 * Every one of these rows used to render destructive-red with a warning triangle the moment
 * `failure_reason` was set — so `/hr/tasks` showed "No channel adapter registered for 'in_app'"
 * and "Notification row has no to_address" as if the REQUEST were broken. It is not: the approval
 * is fine, the notice row is the evidence, and what those sentences describe is the state of a
 * delivery lane. Painting them as page errors trains an operator to distrust a working queue —
 * and to stop reading the one panel that would tell them about a genuine dead-letter.
 *
 * So the tone is keyed on WHAT KIND of fact it is, and the loud one is reserved for the case that
 * has actually earned it: a notice that tried and permanently failed.
 */
const LANE_FACTS: Record<string, string> = {
    // Ours, and now fixed — the in-app adapter was never registered, so the dispatcher
    // dead-lettered the one channel almost every event defaults ON. The notice row itself was
    // always readable; only its stamp said otherwise.
    unknown_channel: "no adapter for this channel — the notice itself is readable here",
    // A real lane gap, honestly reported: nothing to send to, so nothing was sent.
    missing_recipient_address: "no address on file for this channel",
    no_in_app_inbox: "this recipient has no in-app inbox",
    // The SMS gate (§3.5) — waiting, not lost.
    a2p_unverified: "waiting on A2P coverage",
    notification_delivery_disabled: "delivery is switched off platform-wide",
};

function stateOf(notice: HrInboxNotice): { label: string; tone: "ok" | "warn" | "muted" } {
    // Dead-letter is the one that has earned the loud styling: it tried, and it is over.
    if (notice.status === "dead_letter") {
        return { label: notice.failure_reason ?? "undeliverable", tone: "warn" };
    }
    if (notice.read_at) return { label: "read", tone: "ok" };
    if (notice.delivered_at) return { label: "delivered", tone: "ok" };
    if (notice.status === "deferred") return { label: "deferred — quiet hours", tone: "muted" };

    const reason = notice.failure_reason ?? "";
    // Match the known lane facts on the message the dispatcher actually wrote. An unrecognised
    // reason still renders MUTED with its own sentence — an unknown lane fact is still a lane
    // fact, and guessing that it is an emergency is the mistake this whole block undoes.
    for (const [code, sentence] of Object.entries(LANE_FACTS)) {
        if (reason.toLowerCase().includes(code.replace(/_/g, " ")) || reason.includes(code)) {
            return { label: `not sent — ${sentence}`, tone: "muted" };
        }
    }
    if (reason.includes("adapter")) {
        return { label: `not sent — ${LANE_FACTS.unknown_channel}`, tone: "muted" };
    }
    if (reason.toLowerCase().includes("to_address") || reason.toLowerCase().includes("address")) {
        return { label: `not sent — ${LANE_FACTS.missing_recipient_address}`, tone: "muted" };
    }
    if (reason) return { label: `not sent — ${reason}`, tone: "muted" };
    if (notice.sent_at) return { label: "sent", tone: "muted" };
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
