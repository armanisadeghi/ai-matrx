"use client";

// features/meet/components/rsvp/RsvpLanding.tsx
//
// THE PAGE AN EMAILED YES / NO / MAYBE LINK OPENS (`/rsvp/<secret>`). Chrome-
// free, no account needed: the secret names exactly one invitation.
//
//   read   `meet_invitation_by_token` — the anonymous database door: the
//          meeting (title, time, zone, repeat, agenda, cancelled/ended) and this
//          person's current answer, or ONE uniform sentence for a link that is
//          unknown, expired, revoked or superseded.
//   answer `POST /api/v1/meet/rsvp` on aidream — the write is still the database
//          door (`meet_respond_by_token`); the server adds telling the HOST.
//
// The clicked answer rides `?answer=accepted|declined|tentative` and is sent
// once the page is on screen (a link scanner fetching the URL runs no script,
// so it never answers for anyone); the person can change it or add a note.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  HelpCircle,
  Loader2,
  Repeat,
  Video,
  X,
} from "lucide-react";
import {
  createMeetRepository,
  projectRsvpInvitation,
  type RsvpAnswer,
  type RsvpInvitation,
} from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { meetBaseUrl } from "@/features/meet/lib/meetBaseUrl";
import { describeRecurrence } from "@/features/meet/lib/recurrence";
import {
  browserTimeZone,
  formatLongDate,
  formatTimeRange,
  zoneLabel,
} from "@/features/meet/lib/zoned-time";

export const RSVP_ROUTE = "/api/v1/meet/rsvp";

const ANSWERS: {
  answer: RsvpAnswer;
  label: string;
  icon: typeof Check;
  said: string;
}[] = [
  { answer: "accepted", label: "Yes", icon: Check, said: "You're going." },
  {
    answer: "tentative",
    label: "Maybe",
    icon: HelpCircle,
    said: "You might go.",
  },
  { answer: "declined", label: "No", icon: X, said: "You're not going." },
];

export function isRsvpAnswer(
  value: string | null | undefined,
): value is RsvpAnswer {
  return value === "accepted" || value === "declined" || value === "tentative";
}

/** Send one answer through aidream. Resolves the door's payload; throws a sentence. */
export async function sendRsvp(
  baseUrl: string,
  secret: string,
  answer: RsvpAnswer,
  note: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<RsvpInvitation & { hostNotified?: boolean }> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${RSVP_ROUTE}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The secret travels in the BODY, never the URL (logs, referrers).
      body: JSON.stringify({ secret, answer, note }),
    });
  } catch {
    throw new Error(
      "Your answer could not be sent — check your connection and try again.",
    );
  }
  if (!response.ok) {
    console.error(`[rsvp] POST ${RSVP_ROUTE} answered ${response.status}`);
    throw new Error(
      response.status === 404
        ? "Answering from this link is not available right now. Try again in a few minutes."
        : "Your answer could not be saved. Try again.",
    );
  }
  const body = (await response.json()) as Record<string, unknown>;
  return {
    ...projectRsvpInvitation(body),
    hostNotified: body.host_notified === true,
  };
}

type Phase =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; invitation: Extract<RsvpInvitation, { ok: true }> };

export function RsvpLanding({
  secret,
  initialAnswer,
}: {
  secret: string;
  initialAnswer: string | null;
}) {
  const store = useAppStore();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [sending, setSending] = useState<RsvpAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RsvpAnswer | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [zone] = useState(browserTimeZone);
  const autoSent = useRef(false);

  const answer = async (choice: RsvpAnswer, withNote: string | null = null) => {
    setSending(choice);
    setError(null);
    try {
      const result = await sendRsvp(
        meetBaseUrl(store.getState()),
        secret,
        choice,
        withNote,
      );
      if (!result.ok) {
        setPhase({ kind: "invalid", message: result.message });
        return;
      }
      // Keep the meeting as first read; the answer only moves the invitee.
      setPhase((prev) =>
        prev.kind === "ready"
          ? {
              kind: "ready",
              invitation: { ...prev.invitation, invitee: result.invitee },
            }
          : { kind: "ready", invitation: result },
      );
      setSaved(choice);
    } catch (thrown) {
      setError((thrown as Error).message);
    } finally {
      setSending(null);
    }
  };

  // The automatic answer reads the latest `answer` without re-running the read.
  const answerFromLink = useEffectEvent((choice: RsvpAnswer) => {
    void answer(choice);
  });

  useEffect(() => {
    let live = true;
    createMeetRepository({ client: supabase })
      .invitationByToken(secret)
      .then((invitation) => {
        if (!live) return;
        if (!invitation.ok) {
          setPhase({ kind: "invalid", message: invitation.message });
          return;
        }
        setPhase({ kind: "ready", invitation });
        const open =
          !invitation.meeting.cancelledAt && !invitation.meeting.endedAt;
        if (open && isRsvpAnswer(initialAnswer) && !autoSent.current) {
          autoSent.current = true;
          if (invitation.invitee.rsvpState === initialAnswer)
            setSaved(initialAnswer);
          else answerFromLink(initialAnswer);
        }
      })
      .catch(() => {
        if (live) {
          setPhase({
            kind: "invalid",
            message:
              "This invitation could not be opened right now. Reload the page to try again.",
          });
        }
      });
    return () => {
      live = false;
    };
  }, [secret, initialAnswer]);

  if (phase.kind === "loading") {
    return (
      <Shell>
        <div
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
          aria-busy="true"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{" "}
          Opening your invitation
        </div>
      </Shell>
    );
  }
  if (phase.kind === "invalid") {
    return (
      <Shell>
        <p className="py-12 text-center text-base">{phase.message}</p>
      </Shell>
    );
  }

  const { meeting, invitee } = phase.invitation;
  const current =
    saved ?? (invitee.rsvpState === "needs_action" ? null : invitee.rsvpState);
  const mzone = meeting.timeZone || "UTC";
  const closed = meeting.cancelledAt !== null || meeting.endedAt !== null;
  const joinHref = `/meet/${meeting.slug}`;

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {invitee.displayName
              ? `Invitation for ${invitee.displayName}`
              : "You're invited"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">
            {meeting.title}
          </h1>
        </div>

        {meeting.cancelledAt ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            This meeting was cancelled
            {meeting.cancellationReason
              ? `: “${meeting.cancellationReason}”`
              : "."}
            <ErrorAlchemyMenu size="xs" />
          </div>
        ) : null}

        {meeting.scheduledFor ? (
          <div className="flex gap-3 text-sm">
            <CalendarDays
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <div>{formatLongDate(meeting.scheduledFor, mzone)}</div>
              <div className="text-muted-foreground">
                {formatTimeRange(
                  meeting.scheduledFor,
                  meeting.durationMinutes,
                  mzone,
                )}{" "}
                · {zoneLabel(mzone, meeting.scheduledFor)}
              </div>
              {zone !== mzone ? (
                <div className="text-xs text-muted-foreground">
                  Your time: {formatLongDate(meeting.scheduledFor, zone)},{" "}
                  {formatTimeRange(
                    meeting.scheduledFor,
                    meeting.durationMinutes,
                    zone,
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {meeting.recurrenceRule ? (
          <div className="flex gap-3 text-sm">
            <Repeat
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>{describeRecurrence(meeting.recurrenceRule)}</div>
          </div>
        ) : null}
        {meeting.agenda ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agenda
            </div>
            <p className="mt-1 whitespace-pre-wrap">{meeting.agenda}</p>
          </div>
        ) : null}

        {closed ? null : (
          <div className="space-y-3 border-t border-border pt-5">
            <div className="text-sm font-medium">Going?</div>
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label="Your answer"
            >
              {ANSWERS.map(({ answer: choice, label, icon: Icon }) => {
                const active = current === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={active}
                    disabled={sending !== null}
                    onClick={() =>
                      void answer(
                        choice,
                        noteOpen && note.trim() ? note.trim() : null,
                      )
                    }
                    className={cn(
                      "flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background hover:bg-accent",
                    )}
                  >
                    {sending === choice ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
            <div aria-live="polite" className="min-h-5 text-sm">
              {error ? (
                <span className="text-destructive">
                  {error}
                  <ErrorAlchemyMenu error={error} size="xs" />
                </span>
              ) : saved ? (
                <span className="text-muted-foreground">
                  {ANSWERS.find((a) => a.answer === saved)?.said} The host has
                  been told.
                </span>
              ) : current ? (
                <span className="text-muted-foreground">
                  You answered{" "}
                  {ANSWERS.find((a) => a.answer === current)?.label}. Change it
                  any time.
                </span>
              ) : null}
            </div>
            {noteOpen ? (
              <div className="space-y-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for the host"
                  rows={2}
                  aria-label="Note for the host"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending !== null || !current || note.trim() === ""}
                  onClick={() => current && void answer(current, note.trim())}
                >
                  Send note
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setNoteOpen(true)}
              >
                Add a note for the host
              </button>
            )}
          </div>
        )}

        {meeting.cancelledAt ? null : (
          <Button
            asChild
            variant={closed ? "default" : "outline"}
            className="w-full gap-1.5"
          >
            <a href={joinHref}>
              <Video className="h-4 w-4" aria-hidden="true" />
              {meeting.endedAt ? "Open the meeting record" : "Join the meeting"}
            </a>
          </Button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-safe pt-8 matrx-touch-targets">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {children}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        AI Matrx Meetings
      </p>
    </main>
  );
}
