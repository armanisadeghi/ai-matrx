"use client";

// features/meet/components/MeetingsList.tsx
//
// EVERY MEETING, WITH WHAT YOU DO WITH ONE: copy its link, invite people,
// join (or open the record of an ended one).
//
// The package's `<MeetingList>` draws rows with one link and no slot for row
// actions, so this renders the same list from the package's own data hook
// (`useMeetings`) and the package's own classes (`mx-meet-list*`), and adds the
// actions. Same look, same data, same empty/failure sentences.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  meetingLink,
  meetingWhen,
  type MeetingRecord,
  type UseMeetingsResult,
} from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/features/sharing/hooks/useShare";
import {
  MeetingInviteButton,
  meetingOrigin,
} from "@/features/meet/components/invite/MeetingInviteButton";

function CopyLinkButton({ link }: { link: string }) {
  const { copy, fallbackDialog } = useShare();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        aria-label="Copy link"
        onClick={() =>
          void copy(link, { title: "Copy meeting link" }).then((outcome) => {
            if (outcome !== "copied") return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);
          })
        }
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
      </Button>
      {fallbackDialog}
    </>
  );
}

function MeetingRow({ meeting }: { meeting: MeetingRecord }) {
  const ended = meeting.endedAt !== null;
  const link = meetingLink(meetingOrigin(), meeting.slug);
  return (
    <li className="mx-meet-list__row">
      <div className="mx-meet-list__main">
        <span className="mx-meet-list__title">
          {meeting.title}
          {ended ? <span className="mx-meet__badge">Ended</span> : null}
        </span>
        <span className="mx-meet-list__when">{meetingWhen(meeting)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <CopyLinkButton link={link} />
        {ended ? null : <MeetingInviteButton meeting={meeting} signedIn look="row" />}
        <a className="mx-meet-list__action" href={link}>
          {ended ? "Open the record" : "Join"}
        </a>
      </div>
    </li>
  );
}

export function MeetingsList({ list }: { list: UseMeetingsResult }) {
  if (list.failure !== null) {
    return (
      <div className="mx-meet__empty" role="alert">
        <p className="mx-meet__empty-title">Your meetings could not be listed</p>
        <p className="mx-meet__empty-body">{list.failure.message}</p>
        <p className="mx-meet__empty-body">{list.failure.remedy}</p>
      </div>
    );
  }
  if (list.loading && list.meetings.length === 0) {
    return (
      <div className="mx-meet__empty" role="status">
        <p className="mx-meet__empty-title">Loading your meetings…</p>
      </div>
    );
  }
  if (list.meetings.length === 0) {
    return (
      <div className="mx-meet__empty" role="status">
        <p className="mx-meet__empty-title">No meetings yet</p>
        <p className="mx-meet__empty-body">
          Create one above. Its link works before, during and after the meeting. Afterwards it
          opens the record.
        </p>
      </div>
    );
  }
  return (
    <ul className="mx-meet-list">
      {list.meetings.map((meeting) => (
        <MeetingRow key={meeting.id} meeting={meeting} />
      ))}
    </ul>
  );
}
