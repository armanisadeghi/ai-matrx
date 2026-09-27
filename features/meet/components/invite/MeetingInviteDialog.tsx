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
//   4. Invite people: the PLATFORM SHARE SYSTEM, composed from its own pieces
//      (`ShareWithUserTab` + `PermissionsList` over `useSharing("meet_meeting")`).
//      An invite IS a share of the meeting record: the invitee gets the share
//      system's notification, and a person holding that grant skips the waiting
//      room. `ShareModal` is not used because its Public tab mints a second
//      `/s/<token>` link, and a meeting's own link already is the public link.
//
// A person who cannot grant (a guest, or a participant who is not the host)
// sees the link, the invitation and the calendar, and a sentence saying who
// can add people — never a control that would refuse.

import { useState } from "react";
import type { MeetingRecord } from "@ai-matrx/meet/react";
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
import { useIsOwner, useSharing } from "@/utils/permissions/hooks";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import {
  downloadIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
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
  const [copiedWhat, setCopiedWhat] = useState<"link" | "invitation" | null>(null);
  const invitation = invitationText(meeting, link);
  const when = invitationWhen(meeting);
  const calendarEvent = meetingCalendarEvent(meeting, link);

  const flashCopied = (what: "link" | "invitation") => {
    setCopiedWhat(what);
    window.setTimeout(() => setCopiedWhat((current) => (current === what ? null : current)), 2_000);
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
      toast.success("Invitation copied. Paste it into an email, a chat or a calendar invite.");
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
      toast.success("This device has no share sheet, so the invitation was copied instead.");
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
              <Button type="button" onClick={() => void copyLink()} className="shrink-0 gap-1.5">
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
              <Button type="button" variant="outline" size="sm" onClick={() => void copyInvitation()} className="gap-1.5">
                {copiedWhat === "invitation" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copiedWhat === "invitation" ? "Copied" : "Copy invitation"}
              </Button>
              <Button type="button" variant="outline" size="sm" asChild className="gap-1.5">
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
                <Button type="button" variant="outline" size="sm" asChild className="gap-1.5">
                  <a href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer">
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Google Calendar
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" asChild className="gap-1.5">
                  <a href={outlookCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer">
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Outlook
                  </a>
                </Button>
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
                The .ics file opens in Apple Calendar, Outlook and most other calendar apps.
              </p>
            </section>
          ) : null}

          {/* 4. INVITE PEOPLE — the share system. */}
          {signedIn ? (
            <InvitePeopleSection meeting={meeting} open={open} />
          ) : (
            <section className="space-y-1" aria-label="Invite people">
              <SectionTitle>Invite people by name</SectionTitle>
              <p className="text-xs text-muted-foreground">
                The host can invite people by name so they skip the waiting room. You can
                still send anyone the link or the invitation above.
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
 * The share system for the meeting record. Mounted only for a signed-in
 * viewer; the grant form only for somebody the share system says may grant.
 */
export function InvitePeopleSection({
  meeting,
  open,
}: {
  meeting: MeetingRecord;
  open: boolean;
}) {
  const { isOwner, loading: ownerLoading, error: ownerError } = useIsOwner(
    "meet_meeting",
    meeting.id,
  );
  const {
    permissions,
    loading,
    error,
    shareWithUser,
    revokeAccess,
    updateLevel,
    refresh,
  } = useSharing("meet_meeting", meeting.id, open, meeting.title, meeting.organizationId);
  const invited = permissions.filter((p) => p.grantedToUserId);

  if (ownerLoading) {
    return (
      <section className="space-y-2" aria-label="Invite people" aria-busy="true">
        <SectionTitle>Invite people by name</SectionTitle>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  if (!isOwner) {
    return (
      <section className="space-y-1" aria-label="Invite people">
        <SectionTitle>Invite people by name</SectionTitle>
        <p className="text-xs text-muted-foreground">
          {ownerError !== null
            ? `Whether you can invite people by name could not be checked: ${ownerError}. You can still send the link or the invitation above.`
            : "Only the host can invite people by name so they skip the waiting room. You can still send anyone the link or the invitation above."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Invite people">
      <div className="space-y-1">
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite people by name
          </span>
        </SectionTitle>
        <p className="text-xs text-muted-foreground">
          People you invite get a notification and skip the waiting room. Somebody without an
          account yet? Use Email invitation above; they join with the link as a guest.
        </p>
      </div>
      <ShareWithUserTab
        onShare={shareWithUser}
        onSuccess={refresh}
        resourceType="meet_meeting"
        resourceId={meeting.id}
        organizationId={meeting.organizationId}
        alreadySharedUserIds={invited
          .map((p) => p.grantedToUserId)
          .filter((id): id is string => !!id)}
      />
      <div>
        <SectionTitle>Invited</SectionTitle>
        <div className="mt-2">
          <PermissionsList
            permissions={invited}
            isOwner={isOwner}
            onUpdateLevel={updateLevel}
            onRevoke={revokeAccess}
            loading={loading}
            listLabel="Invited"
          />
        </div>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
