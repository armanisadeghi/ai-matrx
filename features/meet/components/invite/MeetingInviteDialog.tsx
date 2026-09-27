"use client";

// features/meet/components/invite/MeetingInviteDialog.tsx
//
// INVITE PEOPLE TO A MEETING — the one panel, opened from the room header, the
// pre-join screen and every row of /meetings.
//
//   1. The link: copy it, or hand it to the device's share sheet.
//   2. The invitation: ready-to-paste text (title, when, link, how to join),
//      copied or opened in the mail app.
//   3. Add to calendar, for a meeting with a time.
//   4. Guests: the meeting's INVITATION LIST (`MeetingGuests`) — add by name or
//      email, answers shown, co-host, remove. The invitees door also gives an
//      account its share grant (so an invited person skips the waiting room),
//      and the invitation email with a calendar file and Yes / No / Maybe links
//      goes out through `announce`. Never a raw share grant with a permission
//      picker: a guest is a viewer; co-host is the only role a meeting has.
//
// A person who is not the host or a co-host sees the link, the invitation, the
// calendar and the guest list, and a sentence saying who can add people —
// never a control that would refuse.

import { useEffect, useState } from "react";
import {
  useMeetHost,
  type MeetingInvitee,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  Mail,
  Share2,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { useShare } from "@/features/sharing/hooks/useShare";
import { MeetingGuests } from "@/features/meet/components/manage/MeetingGuests";
import {
  downloadIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
  outlookWebSupports,
} from "@/lib/calendar/eventLinks";
import {
  invitationMailto,
  invitationText,
  invitationWhen,
  meetingCalendarEvent,
} from "@/features/meet/lib/invitation";

export interface MeetingInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingRecord;
  /** The meeting's durable link (`meetingLink(origin, slug)`). */
  link: string;
  /**
   * Whether the viewer is signed in. A guest has no account to grant from, so
   * the people section is not mounted at all (its hooks would read as nobody).
   */
  signedIn: boolean;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
}

export function MeetingInviteDialog({
  open,
  onOpenChange,
  meeting,
  link,
  signedIn,
}: MeetingInviteDialogProps) {
  const { share, copy, fallbackDialog } = useShare();
  const [copiedWhat, setCopiedWhat] = useState<"link" | "invitation" | null>(
    null,
  );
  const invitation = invitationText(meeting, link);
  const when = invitationWhen(meeting);
  const calendarEvent = meetingCalendarEvent(meeting, link);

  const flashCopied = (what: "link" | "invitation") => {
    setCopiedWhat(what);
    window.setTimeout(
      () => setCopiedWhat((current) => (current === what ? null : current)),
      2_000,
    );
  };

  const copyLink = async () => {
    const outcome = await copy(link, { title: "Copy meeting link" });
    if (outcome === "copied") flashCopied("link");
  };

  const copyInvitation = async () => {
    const outcome = await copy(invitation, {
      title: "Copy invitation",
      description: "Select the text and press Cmd/Ctrl+C.",
    });
    if (outcome === "copied") {
      flashCopied("invitation");
      toast.success(
        "Invitation copied. Paste it into an email, a chat or a calendar invite.",
      );
    }
  };

  const shareLink = async () => {
    const outcome = await share({
      title: meeting.title,
      text: invitation,
      url: null,
      copyText: invitation,
      fallbackTitle: "Copy invitation",
    });
    if (outcome === "copied") {
      flashCopied("invitation");
      toast.success(
        "This device has no share sheet, so the invitation was copied instead.",
      );
    }
  };

  const ended = meeting.endedAt !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            {meeting.title}
            {when !== null ? ` · ${when}` : ""}
            {meeting.kind === "recurring" ? " · Recurring" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          {/* 1. THE LINK */}
          <section className="space-y-2" aria-label="Meeting link">
            <SectionTitle>Meeting link</SectionTitle>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Input
                readOnly
                value={link}
                aria-label="Meeting link"
                className="min-w-0 flex-1 basis-full font-mono text-sm sm:basis-0"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                onClick={() => void copyLink()}
                className="shrink-0 gap-1.5"
              >
                {copiedWhat === "link" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copiedWhat === "link" ? "Copied" : "Copy link"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void shareLink()}
                className="shrink-0 gap-1.5"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share…
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {ended
                ? "This meeting has ended. The link opens its record: the summary, decisions and transcript."
                : meeting.lobbyEnabled
                  ? "Anyone with the link can ask to join. The host admits them from the waiting room."
                  : "Anyone with the link can join."}
            </p>
          </section>

          {/* 2. THE INVITATION */}
          <section className="space-y-2" aria-label="Invitation">
            <SectionTitle>Invitation</SectionTitle>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground font-sans">
              {invitation}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyInvitation()}
                className="gap-1.5"
              >
                {copiedWhat === "invitation" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copiedWhat === "invitation" ? "Copied" : "Copy invitation"}
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={invitationMailto(meeting, link)}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Email invitation
                </a>
              </Button>
            </div>
          </section>

          {/* 3. ADD TO CALENDAR — only when there is a time to put on one. */}
          {calendarEvent !== null ? (
            <section className="space-y-2" aria-label="Add to calendar">
              <SectionTitle>Add to calendar</SectionTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <a
                    href={googleCalendarUrl(calendarEvent)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Google Calendar
                  </a>
                </Button>
                {outlookWebSupports(calendarEvent) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-1.5"
                  >
                    <a
                      href={outlookCalendarUrl(calendarEvent)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                      Outlook
                    </a>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadIcs(calendarEvent)}
                  className="gap-1.5"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download .ics
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {outlookWebSupports(calendarEvent)
                  ? "The .ics file opens in Apple Calendar, Outlook and most other calendar apps."
                  : "Every occurrence is included. For Outlook, open the .ics file: Outlook on the web cannot take a repeating event from a link."}
              </p>
            </section>
          ) : null}

          {/* 4. GUESTS — the meeting's invitation list. */}
          {signedIn ? (
            <InvitePeopleSection meeting={meeting} open={open} />
          ) : (
            <section className="space-y-1" aria-label="Guests">
              <SectionTitle>Guests</SectionTitle>
              <p className="text-xs text-muted-foreground">
                The host can add guests, who come straight in without waiting.
                You can still send anyone the link or the invitation above.
              </p>
            </section>
          )}
        </div>
        {fallbackDialog}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ADD GUESTS — Google Meet's "Add guests", on the meeting's invitation list
 * (`meet_invitees`), never a raw share grant: the invitees door gives an
 * account its viewer grant (a co-host gets admin, set with "Make co-host"), and
 * the invitation email with its calendar file goes out through `announce`.
 * Mounted only for a signed-in viewer; the controls only for the host or a
 * co-host — anyone else sees the list and a sentence, never a dead control.
 */
export function InvitePeopleSection({
  meeting,
  open,
}: {
  meeting: MeetingRecord;
  open: boolean;
}) {
  const host = useMeetHost();
  const repository = host?.repository ?? null;
  const userId = host?.identity.userId ?? null;
  const [invitees, setInvitees] = useState<readonly MeetingInvitee[] | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open || repository === null) return undefined;
    let live = true;
    repository
      .invitees(meeting.id)
      .then((rows) => {
        if (live) {
          setInvitees(rows);
          setFailure(null);
        }
      })
      .catch((thrown: unknown) => {
        if (live)
          setFailure(
            (thrown as Error)?.message ?? "The guest list could not be read.",
          );
      });
    return () => {
      live = false;
    };
  }, [open, repository, meeting.id, nonce]);

  const mine = invitees?.find((i) => i.userId === userId) ?? null;
  const canManage = meeting.hostUserId === userId || mine?.role === "cohost";

  return (
    <section className="space-y-2" aria-label="Guests">
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Guests
        </span>
      </SectionTitle>
      {failure !== null ? (
        <p className="text-xs text-destructive">
          The guest list could not be read: {failure}
        </p>
      ) : invitees === null ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <MeetingGuests
          meeting={meeting}
          invitees={invitees}
          canManage={canManage}
          onChanged={() => setNonce((n) => n + 1)}
          compact
        />
      )}
    </section>
  );
}
