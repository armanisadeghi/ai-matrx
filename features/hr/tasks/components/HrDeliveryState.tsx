"use client";

import { Mail, MessageSquare, Bell, AlertTriangle } from "lucide-react";

import type { HrInboxNotice } from "@/features/hr/tasks/types";

const CHANNEL_ICON: Record<string, typeof Mail> = {
    email: Mail,
    sms: MessageSquare,
    in_app: Bell,
};

/**
 * 🚨 THE CHANNEL IS PART OF THE VISIBLE SENTENCE, AND NO RAW KEY IS EVER SHOWN.
 *
 * These chips used to render the delivery sentence ALONE — `delivered` / `read` / `not sent — no
 * address on file for this channel` — with the channel hidden in a `title` tooltip. A leave
 * request notified on three channels therefore rendered up to three IDENTICAL "no address on file
 * for this channel" chips (measured live on instance 0a8bf31d: five of them), and the only way to
 * learn which channel each one was about was to hover — which a touch device cannot do, a screen
 * reader does not announce, and a screenshot does not carry. "This channel" in a sentence that
 * never names the channel says nothing.
 *
 * And the tooltip itself carried the RAW KEY: `in_app: delivered`, `sms: not sent — …`. The whole
 * point of hr_c4_55 was that our internal spellings stop reaching an HR manager's screen; a
 * snake_case enum value in a tooltip is that same leak by a quieter route.
 *
 * So the channel is named HERE, in human words, in the visible text — and the chip carries NO
 * `title` at all. A tooltip that only repeats what is already visible is dead weight, and an empty
 * tooltip surface is the one that cannot leak.
 *
 * The keys are `communication.notification.channel`. `push` is declared in SPEC-NOTIFICATIONS but
 * not yet built; it is named here so the day it ships it does not arrive as a bare key.
 */
const CHANNEL_LABEL: Record<string, string> = {
    email: "Email",
    sms: "Text message",
    in_app: "In-app",
    push: "Push",
};

/**
 * An unrecognised channel is a defect, not a display case, so it SCREAMS rather than
 * printing the key it does not recognise (the loud-patches rule).
 */
function channelLabel(channel: string): string {
    return CHANNEL_LABEL[channel] ?? "Unrecognised channel";
}

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
    return { label: statusLabel(notice.status), tone: "muted" };
}

/**
 * 🚨 THE LAST PLACE A RAW KEY COULD STILL REACH AN HR MANAGER, AND IT DID.
 *
 * This fallthrough used to be `notice.status || "queued"` — the one line in this file that
 * printed one of our own snake_case enum values verbatim, in the same component whose whole
 * reason for existing is that internal spellings stop at the database. It went unnoticed
 * because the four statuses it could produce ("pending", "in_progress", …) read almost like
 * English. `render_pending` does not, and it is a live status the moment the HR workflow
 * spine writes a notice whose words are still being rendered
 * (aidream/services/notifications/render_pass.py).
 *
 * So the mapping is explicit and the fallthrough is a WORD, not a key. Every one of these
 * says the same true thing to a person waiting on a notice: it is on its way.
 */
const STATUS_LABEL: Record<string, string> = {
    pending: "queued",
    in_progress: "sending…",
    // The notice exists and its words are being written from the event's template. From the
    // reader's side that is indistinguishable from queued, and saying anything more would be
    // describing our pipeline to somebody approving a leave request.
    render_pending: "queued",
    render_in_progress: "queued",
    succeeded: "delivered",
    skipped: "not sent",
};

function statusLabel(status: string | null | undefined): string {
    if (!status) return "queued";
    return STATUS_LABEL[status] ?? "queued";
}

/**
 * 🚨 THE SENTENCE THE PERSON ACTUALLY RECEIVED, SHOWN AS TEXT.
 *
 * The chips say whether a notice landed; they never said WHAT it said. `hr.workflow_notice.body`
 * is the rendered sentence itself — "Leave request for Tomo Iversen-G32 was rejected." — and an
 * approver looking at "Email · delivered" has no way to know which words went out. It is shown
 * here as visible text, never as a `title`: the whole reason this file carries no tooltip is that
 * a hover cannot be touched, announced or screenshotted, and that applies twice over to the one
 * string that IS the message.
 *
 * The email and in_app legs of the same event carry the SAME sentence, so the distinct bodies are
 * shown once each — repeating a sentence per channel would say the same thing three times and
 * read as three different notices.
 *
 * A notice with no body contributes nothing: null is a real state (still being rendered, never
 * sendable, a historical row, or a notice addressed to somebody else that the detail door
 * withholds on purpose), and inventing a placeholder for it would turn silence into noise.
 */
function distinctBodies(notices: HrInboxNotice[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const notice of notices) {
        const body = notice.body?.trim();
        if (!body || seen.has(body)) continue;
        seen.add(body);
        out.push(body);
    }
    return out;
}

/**
 * `showBody` is the space budget, and BOTH call sites set it explicitly.
 *
 * - `HrTaskTable` is one narrow cell in a row per task: the sentence is clamped to a single
 *   truncated line so a long notice cannot grow the row out of the table.
 * - `HrDecisionPanel`'s "What was sent about this" is a full-width card with room to read: the
 *   sentence wraps and is shown whole, because that panel exists to answer exactly this question.
 */
export function HrDeliveryState({
    notices,
    showBody,
}: {
    notices: HrInboxNotice[] | undefined;
    showBody?: boolean;
}) {
    if (!notices?.length) {
        return <span className="text-xs text-muted-foreground">No notice sent</span>;
    }
    const bodies = distinctBodies(notices);
    const chips = (
        <div className="flex flex-wrap items-center gap-2">
            {notices.map((notice, index) => {
                const Icon = CHANNEL_ICON[notice.channel] ?? Bell;
                const state = stateOf(notice);
                const Marker = state.tone === "warn" ? AlertTriangle : Icon;
                return (
                    /* No `title`. The channel and the state are both in the visible text above —
                       see the CHANNEL_LABEL comment for why a tooltip is not allowed back. */
                    <span
                        key={`${notice.channel}-${notice.sent_at ?? index}`}
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
                        <span className="font-medium">{channelLabel(notice.channel)}</span>
                        <span>{state.label}</span>
                    </span>
                );
            })}
        </div>
    );

    // Nothing to say — render EXACTLY what this component rendered before the body existed. No
    // wrapper, no empty paragraph, no "no body" placeholder: an absent sentence is absent.
    if (!bodies.length) return chips;

    return (
        <div className="space-y-1">
            {chips}
            {bodies.map((body) => (
                <p
                    key={body}
                    className={
                        showBody
                            ? "text-xs text-muted-foreground"
                            : // One narrow table cell: clamped to a single line so a long notice
                              // cannot grow the row. `min-w-0` because a flex/grid cell will not
                              // let a child shrink below its content without it.
                              "min-w-0 truncate text-xs text-muted-foreground"
                    }
                >
                    {body}
                </p>
            ))}
        </div>
    );
}
