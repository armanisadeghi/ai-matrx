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
/**
 * 🚨 THE WORDS COME FROM THE SPINE. THIS FILE NO LONGER WRITES THEM (hr_c4_55 / D2).
 *
 * There used to be a map from error-code names to sentences RIGHT HERE, matched by substring
 * against the message the dispatcher wrote, with a final `not sent — ${reason}` fallthrough that
 * printed whatever it had not recognised. On production, as an ordinary HR manager, that
 * fallthrough rendered:
 *
 *     not sent — RESEND_API_KEY / EMAIL_FROM are not set on this server.
 *     not sent — Missing `html` or `text` field.
 *
 * — our server's environment variables and our mail vendor's API validation string, on the screen
 * of somebody approving a leave request. And the one sentence that DID read properly was an
 * accident: `no_contact_point`'s operator message happens to contain the word "address", so a
 * substring test caught it. A rule that works by coincidence is not a rule.
 *
 * `communication.delivery_failure_sentence(error_code, channel)` is now the ONE place a delivery
 * failure becomes words, keyed on the STABLE code and never on the operator message, and
 * `hr.workflow_notice.failure_reason` is what it returns. An unrecognised code resolves there to
 * "not sent — we could not send this email; nobody was notified" — built from the channel alone,
 * so it is structurally incapable of carrying a provider string, a config key or a SQLSTATE. The
 * operator pair (`error_code` / `error_message`) no longer leaves the database on this path at
 * all: `hr.wf_instance` ships the six named delivery fields instead of the whole notice row.
 *
 * So this component chooses TONE and nothing else. Adding a sentence here again — even a nice
 * one — re-forks the vocabulary this migration merged.
 */
function stateOf(notice: HrInboxNotice): { label: string; tone: "ok" | "warn" | "muted" } {
    const sentence = notice.failure_reason?.trim() || null;

    // Dead-letter is the one that has earned the loud styling: it tried, and it is over.
    if (notice.status === "dead_letter") {
        return {
            label: sentence ?? "not sent — nobody was notified",
            tone: "warn",
        };
    }
    if (notice.read_at) return { label: "read", tone: "ok" };
    if (notice.delivered_at) return { label: "delivered", tone: "ok" };
    // A lane fact — including the "waiting, not lost" ones (quiet hours, volume caps, the SMS
    // coverage gate), which the spine words as "waiting — …" rather than "not sent — …".
    if (sentence) return { label: sentence, tone: "muted" };
    if (notice.status === "deferred") return { label: "deferred — quiet hours", tone: "muted" };
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
